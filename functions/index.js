const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const {
  buildPayoutPlan,
  calculateTransactionAmounts,
  resolveCheckoutPrice,
  resolveListingFeeAttribution
} = require('./feeAccounting');

admin.initializeApp();

let db = null;

function getDb() {
  if (!db) {
    db = admin.firestore();
  }

  return db;
}

function getAuth() {
  return admin.auth();
}

const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const shippoApiKey = defineSecret('SHIPPO_API_KEY');
const shippingWebhookSecret = defineSecret('SHIPPING_WEBHOOK_SECRET');
let stripeClient = null;

const ORDERS_COLLECTION = 'orders';
const PURCHASE_INTENTS_COLLECTION = 'purchaseIntents';
const USERS_COLLECTION = 'users';
const WEBHOOK_EVENTS_COLLECTION = 'webhookEvents';
const DEFAULT_CURRENCY = 'usd';
const PLATFORM_FEE_RATE = 0.03;
const MAX_COMMUNITY_FEE_RATE = 0.07;
const MAX_TOTAL_RAKE_RATE = 0.10;
const STANDARD_SHIPPING_FEE_CENTS = 599;
const INSURED_SHIPPING_FEE_CENTS = 1299;
const INSURED_SHIPPING_THRESHOLD_CENTS = 25000;
const DISPUTE_WINDOW_MS = 72 * 60 * 60 * 1000;
const TOS_VERSION = 'v1.1';
const DEFAULT_ADMIN_EMAIL = 'nathanjohns309@gmail.com';

function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, stripe-signature');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  return res.status(statusCode).json(payload);
}

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY secret.');
  }

  if (!stripeClient) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    stripeClient = stripe;
  }

  return stripeClient;
}

function assertMethod(req, methods) {
  if (req.method === 'OPTIONS') {
    return 'options';
  }

  if (!methods.includes(req.method)) {
    throw new Error('Method not allowed.');
  }

  return null;
}

async function markWebhookEventProcessed(eventId, eventType, payload = {}) {
  if (!eventId) {
    return false;
  }

  const eventRef = getDb().collection(WEBHOOK_EVENTS_COLLECTION).doc(eventId);
  let shouldProcess = false;

  await getDb().runTransaction(async (transaction) => {
    const snap = await transaction.get(eventRef);
    if (snap.exists) {
      shouldProcess = false;
      return;
    }

    shouldProcess = true;
    transaction.set(eventRef, {
      eventId,
      eventType,
      processedAt: serverTimestamp(),
      payloadSummary: {
        type: payload?.type || eventType || null,
        object: payload?.data?.object?.id || payload?.id || null,
        status: payload?.data?.object?.status || null
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  return shouldProcess;
}

function toCents(value, fieldName = 'amount') {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  return Math.round(numericValue * 100);
}

function normalizeCurrency(value) {
  const currency = String(value || DEFAULT_CURRENCY).trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error('currency must be a valid 3-letter ISO code.');
  }

  return currency;
}

function buildOrderId(value) {
  const cleaned = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (cleaned) {
    return cleaned;
  }

  return `ORDER_ID_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function buildTransferGroup(orderId) {
  return orderId.startsWith('ORDER_ID_') ? orderId : `ORDER_ID_${orderId}`;
}

function clampRate(value, maximum = 1) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(maximum, rate));
}

function resolveCommunityFeePolicy(club = {}, agentUid = '') {
  const communityFeeRate = clampRate(club.communityFeeRate ?? club.transactionFeeRate ?? 0, MAX_COMMUNITY_FEE_RATE);
  const split = agentUid ? (club.agentFeeSplits?.[agentUid] || club.defaultAgentFeeSplit || {}) : {};
  const agentShareRate = agentUid ? clampRate(split.agentShareRate ?? 0.5) : 0;
  const clubShareRate = Number((1 - agentShareRate).toFixed(6));
  return {
    communityFeeRate,
    agentShareRate,
    clubShareRate,
    totalRakeRate: PLATFORM_FEE_RATE + communityFeeRate
  };
}

async function getClubFeePolicy(clubId, sellerUid) {
  if (!clubId) return { clubId: null, clubOwnerUid: null, agentUid: null, ...resolveCommunityFeePolicy({}, '') };
  const clubRef = getDb().collection('clubs').doc(clubId);
  const [clubSnapshot, sellerMemberSnapshot] = await Promise.all([
    clubRef.get(),
    clubRef.collection('members').doc(sellerUid).get()
  ]);
  if (!clubSnapshot.exists || !sellerMemberSnapshot.exists) throw new Error('Listing club or seller membership was not found.');
  const club = clubSnapshot.data();
  const clubOwnerUid = club.ownerUid || club.ownerId || null;
  if (!clubOwnerUid) throw new Error('Club owner is not configured for fee payouts.');
  const sellerMembership = sellerMemberSnapshot.data();
  const sellerIsAgent = String(sellerMembership.role || '').toLowerCase() === 'agent';
  const candidateAgentUid = sellerIsAgent ? sellerUid : String(sellerMembership.agentUid || '').trim();
  const agentMemberSnapshot = sellerIsAgent
    ? sellerMemberSnapshot
    : candidateAgentUid
    ? await clubRef.collection('members').doc(candidateAgentUid).get()
    : null;
  const attribution = resolveListingFeeAttribution({
    cardOwnerUid: sellerUid,
    sellerUid,
    cardClubId: clubId,
    sellerMembership,
    agentMembership: agentMemberSnapshot?.exists ? agentMemberSnapshot.data() : null
  });
  return {
    clubId,
    clubOwnerUid,
    agentUid: attribution.agentUid,
    ...resolveCommunityFeePolicy(club, attribution.agentUid || '')
  };
}

async function getActiveTransferAccount(stripe, userId, recipientType) {
  const profile = await getUserProfile(userId);
  const accountId = String(profile?.stripeConnectedAccountId || profile?.connectedAccountId || '').trim();
  if (!accountId.startsWith('acct_')) {
    throw new Error(`${recipientType} must connect a Stripe payout account before this transaction can be charged.`);
  }
  const account = await stripe.accounts.retrieve(accountId);
  if (account.capabilities?.transfers !== 'active') {
    throw new Error(`${recipientType}'s Stripe account is not enabled to receive payouts.`);
  }
  return accountId;
}

async function resolveCommunityPayoutAccounts(stripe, feePolicy, agentUid) {
  const [clubAccountId, agentAccountId] = await Promise.all([
    feePolicy.communityFeeRate > 0 && feePolicy.clubShareRate > 0
      ? getActiveTransferAccount(stripe, feePolicy.clubOwnerUid, 'Club owner')
      : Promise.resolve(''),
    feePolicy.communityFeeRate > 0 && feePolicy.agentShareRate > 0 && agentUid
      ? getActiveTransferAccount(stripe, agentUid, 'Agent')
      : Promise.resolve('')
  ]);
  return { clubAccountId, agentAccountId };
}

function transferIdempotencyKey(orderId, payoutType) {
  const orderHash = crypto.createHash('sha256').update(String(orderId)).digest('hex');
  return `cs-${orderHash}-${payoutType}`;
}

function nowTimestamp() {
  return admin.firestore.Timestamp.now();
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function addMilliseconds(timestamp, milliseconds) {
  const date = timestamp?.toDate?.() || timestamp;
  return admin.firestore.Timestamp.fromMillis(new Date(date).getTime() + milliseconds);
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return authorization.slice(7).trim();
}

async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing bearer token.');
  }

  return getAuth().verifyIdToken(token);
}

function getAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasAdminRole(decodedToken) {
  return decodedToken?.admin === true;
}

async function requireAdmin(req) {
  const decodedToken = await requireAuth(req);
  if (hasAdminRole(decodedToken)) return decodedToken;

  const profile = await getUserProfile(decodedToken.uid);
  if (profile?.isAdmin === true) return decodedToken;

  throw new Error('Admin access required.');
}

async function writeAdminLog(adminUid, actionType, targetId, reason = '') {
  await getDb().collection('adminLogs').add({
    adminUid,
    actionType,
    targetId,
    reason: String(reason || '').trim(),
    timestamp: serverTimestamp()
  });
}

async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await getDb().collection(USERS_COLLECTION).doc(userId).get();
  return snap.exists ? snap.data() : null;
}

function ensureTosAccepted(profile) {
  if (!profile?.tos_accepted) {
    throw new Error('User must accept the Terms of Service before placing escrow orders.');
  }
}

function isVerifiedProfile(profile) {
  return String(profile?.isVerified || profile?.is_verified || profile?.verificationStatus || '').toLowerCase() === 'verified';
}

async function validateCardCertification(order) {
  const certificationNumber = String(order.certification_number || order.card_certification_number || '').trim();
  if (!certificationNumber) return { status: 'not_provided', provider: 'fallback' };

  const provider = String(process.env.CARD_CERT_PROVIDER || '').toLowerCase();
  const apiKey = process.env.CARD_CERT_API_KEY || '';
  if (!provider || !apiKey) {
    return { status: 'manual_review_required', provider: 'fallback', reason: 'External certification credentials are not configured.' };
  }

  try {
    const endpoint = provider === 'psa' ? process.env.PSA_CERT_ENDPOINT : provider === 'bgs' ? process.env.BGS_CERT_ENDPOINT : process.env.CGC_CERT_ENDPOINT;
    if (!endpoint) return { status: 'manual_review_required', provider: 'fallback', reason: 'Certification endpoint is not configured.' };
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(certificationNumber)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return { status: 'manual_review_required', provider, reason: `Certification provider returned ${response.status}.` };
    const result = await response.json();
    return { status: result.valid === false ? 'not_validated' : 'validated', provider, certification: result };
  } catch (error) {
    return { status: 'manual_review_required', provider: 'fallback', reason: error.message || 'Certification provider unavailable.' };
  }
}

function mapOrderToLegacyPurchaseIntent(order) {
  return {
    buyerUid: order.buyer_id,
    buyerName: order.buyer_name || 'Buyer',
    sellerUid: order.seller_user_id || null,
    sellerName: order.seller_name || 'Seller',
    sellerConnectedAccountId: order.seller_id || null,
    cardId: order.card_id || null,
    cardTitle: order.card_title || 'Escrow Order',
    cardBrand: order.card_brand || '',
    cardImageFrontUrl: order.card_image_front_url || null,
    cardImageBackUrl: order.card_image_back_url || null,
    listingPrice: Number((order.amount_base || 0) / 100),
    chargedTotalAmount: Number((order.amount_charged || 0) / 100),
    marketplaceFeeRate: PLATFORM_FEE_RATE,
    marketplaceFeeAmount: Number((order.service_fee || (order.amount_charged || 0) - (order.amount_base || 0)) / 100),
    sellerPayoutAmount: Number((order.amount_base || 0) / 100),
    subtotal: Number((order.subtotal || order.amount_base || 0) / 100),
    shippingFee: Number((order.shipping_fee || 0) / 100),
    serviceFee: Number((order.service_fee || 0) / 100),
    tax: Number((order.tax || 0) / 100),
    totalPaid: Number((order.total_paid || order.amount_charged || 0) / 100),
    sellerNetPayout: Number((order.seller_net_payout || order.amount_base || 0) / 100),
    escrowAmount: Number((order.amount_base || 0) / 100),
    paymentIntentId: order.stripe_payment_intent_id || null,
    transferGroup: order.transfer_group,
    status: order.status,
    escrowStatus: order.status,
    paymentProvider: 'stripe',
    saleMode: 'instant_purchase',
    trackingNumber: order.tracking_number || null,
    shippingCarrier: order.carrier || null,
    trackingUrl: order.tracking_url || null,
    shippingApiTrackerId: order.shipping_api_tracker_id || null,
    disputeReason: order.dispute_reason || null,
    disputeTimerExpiresAt: order.dispute_timer_expires_at || null,
    tosAccepted: Boolean(order.tos_accepted),
    tosAcceptedAt: order.tos_accepted_at || null,
    tosVersionAccepted: order.tos_version_accepted || null,
    createdAt: order.created_at || serverTimestamp(),
    updatedAt: order.updated_at || serverTimestamp()
  };
}

async function syncPurchaseIntentMirror(orderId, orderData) {
  await db.collection(PURCHASE_INTENTS_COLLECTION).doc(orderId).set(mapOrderToLegacyPurchaseIntent(orderData), { merge: true });
}

async function notifyUser(userId, type, message, data = {}) {
  if (!userId) return;
  await getDb().collection('notifications').add({
    userId,
    type,
    message,
    read: false,
    ...data,
    createdAt: serverTimestamp()
  });
}

async function getOrderOrThrow(orderId) {
  const orderRef = getDb().collection(ORDERS_COLLECTION).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('Order not found.');
  }

  return { orderRef, order: orderSnap.data() };
}

async function createShippoTracker(carrier, trackingNumber) {
  const apiKey = shippoApiKey.value() || process.env.SHIPPO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing SHIPPO_API_KEY secret.');
  }

  const response = await fetch('https://api.goshippo.com/tracks/', {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      carrier,
      tracking_number: trackingNumber
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.error || 'Shipping API rejected the tracking details.');
  }

  return payload;
}

function extractShippoDestinationZip(shippoTracker) {
  return String(
    shippoTracker?.address_to?.zip ||
      shippoTracker?.address_to?.postal_code ||
      shippoTracker?.destination_zip ||
      ''
  )
    .trim()
    .toUpperCase();
}

function normalizePostalCode(value) {
  return String(value || '').trim().toUpperCase();
}

async function validateTrackingAgainstOrder(order, carrier, trackingNumber, destinationZipHint) {
  const tracker = await createShippoTracker(carrier, trackingNumber);
  const orderZip = normalizePostalCode(order.buyer_shipping_address?.postal_code || order.buyer_shipping_zip || '');
  const trackerZip = extractShippoDestinationZip(tracker);
  const destinationZip = normalizePostalCode(destinationZipHint || trackerZip);

  if (orderZip && destinationZip && orderZip !== destinationZip) {
    throw new Error('Tracking destination zip does not match the buyer shipping address on file.');
  }

  return {
    trackerId: tracker.object_id || tracker.id || null,
    trackingUrl: tracker.tracking_url_provider || null,
    carrier: String(tracker.carrier || carrier || '').trim(),
    trackingNumber: String(tracker.tracking_number || trackingNumber || '').trim(),
    deliveryStatus: String(tracker.tracking_status?.status || tracker.status || '').trim().toLowerCase(),
    destinationZip: destinationZip || orderZip || ''
  };
}

async function releaseFundsForOrder(orderId, connectedAccountIdOverride, metadata = {}) {
  const { orderRef, order } = await getOrderOrThrow(orderId);

  if (String(order.status || '').toLowerCase() === 'disputed' && !metadata.allowDisputedRelease) {
    throw new Error('Escrow is frozen while this order has an active dispute.');
  }

  if (String(order.status || '').toLowerCase() === 'completed' && String(order.stripe_transfer_id || '').trim()) {
    return {
      order,
      transferId: order.stripe_transfer_id,
      status: 'funds_already_released'
    };
  }

  const baseAmountCents = Number(order.amount_base || 0);
  if (!baseAmountCents || baseAmountCents <= 0) {
    throw new Error('Stored base amount is missing or invalid for this order.');
  }

  const connectedAccountId = String(connectedAccountIdOverride || order.seller_id || '').trim();
  if (!connectedAccountId.startsWith('acct_')) {
    throw new Error('Seller connected account is missing for this order.');
  }

  const stripe = getStripeClient();
  if (order.stripe_payment_intent_id) {
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`PaymentIntent must be succeeded before funds can be released. Current status: ${paymentIntent.status}.`);
    }
  }

  const payouts = buildPayoutPlan({
    sellerAmountCents: Number(order.seller_net_payout || baseAmountCents),
    sellerAccountId: connectedAccountId,
    clubAmountCents: Number(order.club_fee_share || 0),
    clubAccountId: order.club_payout_account_id || '',
    agentAmountCents: Number(order.agent_fee_share || 0),
    agentAccountId: order.agent_payout_account_id || ''
  });
  const transfers = {};
  for (const payout of payouts) {
    const priorTransferId = payout.type === 'seller'
      ? order.stripe_transfer_id
      : order[`stripe_${payout.type}_transfer_id`];
    if (priorTransferId) {
      transfers[payout.type] = { id: priorTransferId };
      continue;
    }
    transfers[payout.type] = await stripe.transfers.create({
      amount: payout.amountCents,
      currency: order.currency || DEFAULT_CURRENCY,
      destination: payout.accountId,
      transfer_group: order.transfer_group,
      metadata: {
        orderId,
        payoutType: payout.type,
        resolution: metadata.resolution || 'standard_release',
        actor: metadata.actor || 'system'
      }
    }, { idempotencyKey: transferIdempotencyKey(orderId, payout.type) });
  }

  const nextOrderState = {
    seller_id: connectedAccountId,
    stripe_transfer_id: transfers.seller.id,
    ...(transfers.club ? { stripe_club_transfer_id: transfers.club.id } : {}),
    ...(transfers.agent ? { stripe_agent_transfer_id: transfers.agent.id } : {}),
    status: 'completed',
    funds_released_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  await orderRef.set(nextOrderState, { merge: true });
  await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });

  return {
    transferId: transfers.seller.id,
    clubTransferId: transfers.club?.id || null,
    agentTransferId: transfers.agent?.id || null,
    status: 'completed',
    connectedAccountId
  };
}

async function refundBuyerForOrder(orderId, metadata = {}) {
  const { orderRef, order } = await getOrderOrThrow(orderId);
  if (String(order.status || '').toLowerCase() === 'refunded' || order.stripe_refund_id) {
    return { id: order.stripe_refund_id || null, status: 'already_refunded' };
  }
  if (!order.stripe_payment_intent_id) {
    throw new Error('Order is missing a Stripe PaymentIntent id.');
  }

  const stripe = getStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: order.stripe_payment_intent_id,
    metadata: {
      orderId,
      resolution: metadata.resolution || 'admin_refund',
      actor: metadata.actor || 'admin'
    }
  });

  const nextOrderState = {
    status: 'refunded',
    stripe_refund_id: refund.id,
    refunded_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    dispute_resolution: metadata.resolution || 'refund_buyer'
  };

  await orderRef.set(nextOrderState, { merge: true });
  await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });

  return refund;
}

function buildOrderRecord({
  orderId,
  buyerProfile,
  buyerId,
  buyerEmail,
  buyerName,
  sellerConnectedAccountId,
  sellerUserId,
  sellerName,
  cardId,
  cardTitle,
  cardBrand,
  cardImageFrontUrl,
  cardImageBackUrl,
  baseAmountCents,
  totalAmountCents,
  currency,
  paymentIntent,
  transferGroup,
  shippingAddress,
  subtotalCents,
  shippingFeeCents,
  serviceFeeCents,
  taxCents,
  totalPaidCents,
  sellerNetPayoutCents
}) {
  return {
    order_id: orderId,
    seller_id: String(sellerConnectedAccountId || '').trim() || null,
    seller_user_id: sellerUserId || null,
    seller_name: sellerName || 'Seller',
    buyer_id: buyerId,
    buyer_email: buyerEmail || '',
    buyer_name: buyerName || 'Buyer',
    amount_base: baseAmountCents,
    amount_charged: totalAmountCents,
    subtotal: subtotalCents,
    shipping_fee: shippingFeeCents,
    service_fee: serviceFeeCents,
    tax: taxCents,
    total_paid: totalPaidCents,
    seller_net_payout: sellerNetPayoutCents,
    shipping_allowance: shippingFeeCents,
    currency,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_transfer_id: null,
    transfer_group: transferGroup,
    status: 'pending_payment',
    tracking_number: null,
    carrier: null,
    tracking_url: null,
    shipping_api_tracker_id: null,
    dispute_reason: null,
    dispute_timer_expires_at: null,
    buyer_shipping_address: shippingAddress || null,
    buyer_shipping_zip: shippingAddress?.postal_code || shippingAddress?.zip || buyerProfile?.shippingZip || buyerProfile?.postalCode || null,
    card_id: cardId || null,
    card_title: cardTitle || 'Escrow Order',
    card_brand: cardBrand || '',
    card_image_front_url: cardImageFrontUrl || null,
    card_image_back_url: cardImageBackUrl || null,
    tos_accepted: Boolean(buyerProfile?.tos_accepted),
    tos_accepted_at: buyerProfile?.tos_accepted_at || serverTimestamp(),
    tos_version_accepted: buyerProfile?.tos_version_accepted || TOS_VERSION,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
}

exports.createOrderPaymentIntent = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAuth(req);
    const {
      currency,
      orderId: requestedOrderId,
      buyerId,
      sellerConnectedAccountId,
      sellerUserId,
      sellerName,
      cardId: rawCardId,
      offerId: rawOfferId,
      feeOnly,
      buyerShippingAddress
    } = req.body || {};

    if (buyerId && buyerId !== decodedToken.uid) {
      return sendJson(res, 403, { error: 'buyerId must match the authenticated user.' });
    }

    const cardId = String(rawCardId || '').trim();
    const offerId = String(rawOfferId || '').trim();
    const normalizedSellerUid = String(sellerUserId || '').trim();
    if (!cardId || !normalizedSellerUid) throw new Error('cardId and sellerUserId are required.');
    if (feeOnly) throw new Error('Trade-only protection checkout is not yet supported by the escrow payment flow.');
    const cardSnapshot = await getDb().collection('cards').doc(cardId).get();
    if (!cardSnapshot.exists || cardSnapshot.data().ownerUid !== normalizedSellerUid) {
      throw new Error('The selected card does not belong to this seller.');
    }
    const cardData = cardSnapshot.data();
    const offerSnapshot = offerId ? await getDb().collection('offers').doc(offerId).get() : null;
    if (offerId && !offerSnapshot?.exists) throw new Error('Accepted offer was not found.');
    const checkoutPrice = resolveCheckoutPrice({
      card: { id: cardSnapshot.id, ...cardData },
      buyerUid: decodedToken.uid,
      sellerUid: normalizedSellerUid,
      offer: offerSnapshot?.data() || null,
      feeOnly: Boolean(feeOnly)
    });
    const baseAmountCents = checkoutPrice.baseAmountCents;
    const shippingFeeCents = baseAmountCents > INSURED_SHIPPING_THRESHOLD_CENTS
      ? INSURED_SHIPPING_FEE_CENTS
      : STANDARD_SHIPPING_FEE_CENTS;
    const feePolicy = await getClubFeePolicy(cardData.clubId || '', normalizedSellerUid);
    if (feePolicy.totalRakeRate > MAX_TOTAL_RAKE_RATE) {
      throw new Error('Configured club and agent fees exceed the 10% total rake cap.');
    }
    const amounts = calculateTransactionAmounts({
      baseAmountCents,
      shippingFeeCents,
      communityFeeRate: feePolicy.communityFeeRate,
      clubShareRate: feePolicy.clubShareRate
    });
    const {
      platformFeeCents,
      communityFeeCents,
      serviceFeeCents,
      clubShareCents,
      agentShareCents,
      totalAmountCents,
      sellerNetPayoutCents
    } = amounts;
    const taxCents = 0;
    const normalizedCurrency = normalizeCurrency(currency);
    const orderId = offerId ? buildOrderId(`OFFER_${offerId}`) : buildOrderId(requestedOrderId);
    const transferGroup = buildTransferGroup(orderId);
    const buyerProfile = await getUserProfile(decodedToken.uid);
    const sellerProfile = await getUserProfile(normalizedSellerUid);
    ensureTosAccepted(buyerProfile);
    if (baseAmountCents > 50000 && (!isVerifiedProfile(buyerProfile) || !isVerifiedProfile(sellerProfile))) {
      throw new Error('Buyer and seller verification are required for transactions above $500.');
    }
    const stripe = getStripeClient();
    const sellerAccountId = await getActiveTransferAccount(stripe, normalizedSellerUid, 'Seller');
    const requestedSellerAccountId = String(sellerConnectedAccountId || '').trim();
    if (requestedSellerAccountId && requestedSellerAccountId !== sellerAccountId) {
      throw new Error('Seller payout account does not match the verified seller profile.');
    }
    const communityPayoutAccounts = await resolveCommunityPayoutAccounts(stripe, feePolicy, feePolicy.agentUid || '');

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: normalizedCurrency,
      automatic_payment_methods: { enabled: true },
      transfer_group: transferGroup,
      metadata: {
        orderId,
        buyerId: decodedToken.uid,
        sellerUserId: normalizedSellerUid,
        offerId,
        sellerConnectedAccountId: sellerAccountId,
        baseAmountCents: String(baseAmountCents),
        totalAmountCents: String(totalAmountCents),
        shippingFeeCents: String(shippingFeeCents),
        serviceFeeCents: String(serviceFeeCents),
        platformFeeCents: String(platformFeeCents),
        communityFeeCents: String(communityFeeCents),
        clubShareCents: String(clubShareCents),
        agentShareCents: String(agentShareCents),
        platformFeeRate: String(PLATFORM_FEE_RATE),
        communityFeeRate: String(feePolicy.communityFeeRate),
        offerId,
        taxCents: String(taxCents),
        pricingModel: 'separate_charges_and_transfers'
      }
    }, offerId ? { idempotencyKey: `offer-${crypto.createHash('sha256').update(offerId).digest('hex')}` } : undefined);

    const orderRecord = buildOrderRecord({
      orderId,
      buyerProfile,
      buyerId: decodedToken.uid,
      buyerEmail: decodedToken.email || buyerProfile?.email || '',
      buyerName: decodedToken.name || buyerProfile?.displayName || 'Buyer',
      sellerConnectedAccountId: sellerAccountId,
      sellerUserId,
      sellerName: sellerProfile?.displayName || sellerProfile?.username || sellerName || 'Seller',
      cardId,
      cardTitle: cardData.name || cardData.title || 'Card',
      cardBrand: cardData.brand || cardData.category || '',
      cardImageFrontUrl: cardData.imageFrontUrl || cardData.imageUrl || null,
      cardImageBackUrl: cardData.imageBackUrl || null,
      baseAmountCents,
      totalAmountCents,
      currency: normalizedCurrency,
      paymentIntent,
      transferGroup,
      shippingAddress: buyerShippingAddress || null,
      subtotalCents: baseAmountCents,
      shippingFeeCents,
      serviceFeeCents,
      taxCents,
      totalPaidCents: totalAmountCents,
      sellerNetPayoutCents
    });

    orderRecord.platform_fee_rate = PLATFORM_FEE_RATE;
    orderRecord.platform_fee = platformFeeCents;
    orderRecord.community_fee_rate = feePolicy.communityFeeRate;
    orderRecord.community_fee = communityFeeCents;
    orderRecord.club_fee_share = clubShareCents;
    orderRecord.agent_fee_share = agentShareCents;
    orderRecord.agent_uid = feePolicy.agentUid || null;
    orderRecord.club_id = feePolicy.clubId;
    orderRecord.club_owner_uid = feePolicy.communityFeeRate > 0 ? feePolicy.clubOwnerUid : null;
    orderRecord.club_payout_account_id = communityPayoutAccounts.clubAccountId || null;
    orderRecord.agent_payout_account_id = communityPayoutAccounts.agentAccountId || null;
    orderRecord.total_rake_rate = feePolicy.totalRakeRate;

    await getDb().collection(ORDERS_COLLECTION).doc(orderId).set(orderRecord, { merge: true });
    await syncPurchaseIntentMirror(orderId, orderRecord);

    return sendJson(res, 200, {
      orderId,
      transferGroup,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amountBase: baseAmountCents,
      amountCharged: totalAmountCents,
      subtotal: (baseAmountCents / 100).toFixed(2),
      shippingFee: (shippingFeeCents / 100).toFixed(2),
      serviceFee: (serviceFeeCents / 100).toFixed(2),
      tax: (taxCents / 100).toFixed(2),
      totalPaid: (totalAmountCents / 100).toFixed(2),
      sellerNetPayout: (sellerNetPayoutCents / 100).toFixed(2),
      baseItemPrice: (baseAmountCents / 100).toFixed(2),
      totalCharge: (totalAmountCents / 100).toFixed(2),
      platformFee: (platformFeeCents / 100).toFixed(2),
      communityFee: (communityFeeCents / 100).toFixed(2),
      clubFeeShare: (clubShareCents / 100).toFixed(2),
      agentFeeShare: (agentShareCents / 100).toFixed(2),
      platformFeeRate: PLATFORM_FEE_RATE,
      communityFeeRate: feePolicy.communityFeeRate,
      totalRakeRate: feePolicy.totalRakeRate,
      currency: normalizedCurrency,
      status: 'pending_payment'
    });
  } catch (error) {
    console.error('createOrderPaymentIntent failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to create payment intent.' });
  }
});

exports.tradeOfferAction = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const action = String(req.body?.action || '').trim().toLowerCase();
    const db = getDb();

    if (action === 'create') {
      const matchId = String(req.body?.matchId || '').trim();
      const cardId = String(req.body?.cardId || '').trim();
      const dealType = String(req.body?.dealType || '').trim().toLowerCase();
      const cashAmount = Number(req.body?.cashAmount || 0);
      const cardIds = Array.isArray(req.body?.cardIds)
        ? Array.from(new Set(req.body.cardIds.map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 20)
        : [];
      if (!matchId || !cardId || !['pure_trade', 'hybrid_trade', 'cash_sale'].includes(dealType)) {
        throw new Error('matchId, cardId, and a valid deal type are required.');
      }
      if (!Number.isFinite(cashAmount) || cashAmount < 0 || (dealType !== 'pure_trade' && cashAmount <= 0) || (dealType === 'pure_trade' && cashAmount !== 0)) {
        throw new Error('Cash amount does not match the selected deal type.');
      }

      const matchRef = db.collection('matches').doc(matchId);
      const offerRef = db.collection('offers').doc();
      const result = await db.runTransaction(async (transaction) => {
        const matchSnapshot = await transaction.get(matchRef);
        if (!matchSnapshot.exists) throw new Error('Match was not found.');
        const match = matchSnapshot.data();
        const participants = Array.isArray(match.participants) ? match.participants : [];
        if (!participants.includes(user.uid) || String(match.status || '').toLowerCase() !== 'active') {
          throw new Error('An active match membership is required to make an offer.');
        }

        const cardRef = db.collection('cards').doc(cardId);
        const cardSnapshot = await transaction.get(cardRef);
        if (!cardSnapshot.exists || cardSnapshot.data().ownerUid !== match.ownerUserId || match.cardId !== cardId) {
          throw new Error('Offer card does not match the card attached to this match.');
        }
        const offeredCardRefs = cardIds.map((id) => db.collection('cards').doc(id));
        const offeredCardSnapshots = offeredCardRefs.length ? await transaction.getAll(...offeredCardRefs) : [];
        if (offeredCardSnapshots.some((snapshot) => !snapshot.exists || snapshot.data().ownerUid !== user.uid)) {
          throw new Error('Every offered card must belong to the authenticated user.');
        }
        const otherUid = participants.find((uid) => uid !== user.uid);
        if (!otherUid) throw new Error('Match counterparty was not found.');
        const buyerUid = match.requesterUserId;
        const sellerUid = match.ownerUserId;
        if (![buyerUid, sellerUid].includes(user.uid)) throw new Error('Match buyer or seller is invalid.');

        transaction.create(offerRef, {
          matchId,
          cardId,
          cardTitle: cardSnapshot.data().name || cardSnapshot.data().title || 'Card',
          cardIds,
          cards: offeredCardSnapshots.map((snapshot) => ({
            id: snapshot.id,
            title: snapshot.data().name || snapshot.data().title || 'Trading card',
            brand: snapshot.data().brand || '',
            imageUrl: snapshot.data().imageFrontUrl || snapshot.data().imageUrl || ''
          })),
          buyerUid,
          sellerUid,
          fromUserId: user.uid,
          fromUserName: user.name || user.email || 'Collector',
          toUserId: otherUid,
          amount: cashAmount,
          cashAmount,
          dealType,
          currency: 'USD',
          status: 'pending',
          paymentStatus: 'not_started',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { offerId: offerRef.id, matchId, toUserId: otherUid, cashAmount, dealType };
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    const offerId = String(req.body?.offerId || '').trim();
    if (!offerId) throw new Error('offerId is required.');
    const offerRef = db.collection('offers').doc(offerId);

    if (action === 'payment_status') {
      const paymentStatus = String(req.body?.paymentStatus || '').trim();
      if (!['checkout_open', 'payment_configuration_pending', 'payment_pending'].includes(paymentStatus)) {
        throw new Error('Unsupported client payment status.');
      }
      await db.runTransaction(async (transaction) => {
        const offerSnapshot = await transaction.get(offerRef);
        if (!offerSnapshot.exists) throw new Error('Offer was not found.');
        const offer = offerSnapshot.data();
        if (offer.buyerUid !== user.uid || offer.status !== 'accepted') throw new Error('Only the accepted offer buyer can start checkout.');
        transaction.update(offerRef, { paymentStatus, updatedAt: serverTimestamp() });
      });
      return sendJson(res, 200, { ok: true, offerId, paymentStatus });
    }

    if (!['accept', 'reject', 'counter'].includes(action)) throw new Error('Unsupported offer action.');
    const result = await db.runTransaction(async (transaction) => {
      const offerSnapshot = await transaction.get(offerRef);
      if (!offerSnapshot.exists) throw new Error('Offer was not found.');
      const offer = offerSnapshot.data();
      if (offer.toUserId !== user.uid || offer.status !== 'pending') throw new Error('Only the recipient can decide a pending offer.');
      const matchRef = db.collection('matches').doc(offer.matchId);
      const matchSnapshot = await transaction.get(matchRef);
      if (!matchSnapshot.exists || !(matchSnapshot.data().participants || []).includes(user.uid)) {
        throw new Error('Offer match is no longer active.');
      }

      if (action === 'reject') {
        transaction.update(offerRef, { status: 'rejected', decidedBy: user.uid, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return { status: 'rejected', matchId: offer.matchId, otherUid: offer.fromUserId };
      }
      if (action === 'accept') {
        transaction.update(offerRef, { status: 'accepted', decidedBy: user.uid, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return { status: 'accepted', matchId: offer.matchId, otherUid: offer.fromUserId };
      }

      const counterAmount = Number(req.body?.cashAmount);
      if (!Number.isFinite(counterAmount) || counterAmount <= 0) throw new Error('Counter amount must be greater than zero.');
      const counterRef = db.collection('offers').doc();
      transaction.update(offerRef, { status: 'countered', decidedBy: user.uid, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.create(counterRef, {
        matchId: offer.matchId,
        cardId: offer.cardId,
        cardTitle: offer.cardTitle || 'Card',
        cardIds: [],
        cards: [],
        buyerUid: offer.buyerUid,
        sellerUid: offer.sellerUid,
        fromUserId: user.uid,
        fromUserName: user.name || user.email || 'Collector',
        toUserId: offer.fromUserId,
        amount: counterAmount,
        cashAmount: offer.dealType === 'pure_trade' ? 0 : counterAmount,
        dealType: offer.dealType || 'hybrid_trade',
        currency: offer.currency || 'USD',
        parentOfferId: offerId,
        status: 'pending',
        paymentStatus: 'not_started',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { status: 'countered', matchId: offer.matchId, otherUid: offer.fromUserId, counterOfferId: counterRef.id };
    });
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('tradeOfferAction failed:', error);
    return sendJson(res, 400, { error: error.message || 'Offer action failed.' });
  }
});

exports.updateClubFeePolicy = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const decodedToken = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    const communityFeeRate = Number(req.body?.communityFeeRate);
    const agentUid = String(req.body?.agentUid || '').trim();
    const agentShareRate = Number(req.body?.agentShareRate);
    if (!clubId || !Number.isFinite(communityFeeRate) || communityFeeRate < 0 || communityFeeRate > MAX_COMMUNITY_FEE_RATE) {
      throw new Error('communityFeeRate must be between 0% and 7%.');
    }
    if (agentUid && (!Number.isFinite(agentShareRate) || agentShareRate < 0 || agentShareRate > 1)) {
      throw new Error('agentShareRate must be between 0 and 1.');
    }

    const clubRef = getDb().collection('clubs').doc(clubId);
    const memberRef = clubRef.collection('members').doc(decodedToken.uid);
    const [clubSnapshot, memberSnapshot] = await Promise.all([clubRef.get(), memberRef.get()]);
    if (!clubSnapshot.exists || !memberSnapshot.exists) throw new Error('Club or membership was not found.');
    if (String(memberSnapshot.data().role || '').toLowerCase() !== 'owner') {
      throw new Error('Only the club owner can update the fee policy.');
    }

    const club = clubSnapshot.data();
    const agentFeeSplits = { ...(club.agentFeeSplits || {}) };
    if (agentUid) agentFeeSplits[agentUid] = { agentShareRate, clubShareRate: Number((1 - agentShareRate).toFixed(6)) };
    await clubRef.set({
      communityFeeRate,
      transactionFeeRate: communityFeeRate,
      agentFeeSplits,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return sendJson(res, 200, {
      ok: true,
      clubId,
      ...resolveCommunityFeePolicy({ ...club, communityFeeRate, agentFeeSplits }, agentUid)
    });
  } catch (error) {
    console.error('updateClubFeePolicy failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to update club fee policy.' });
  }
});

exports.createSellerPayoutAccount = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const decodedToken = await requireAuth(req);
    const stripe = getStripeClient();
    const profile = await getUserProfile(decodedToken.uid);
    let accountId = profile?.stripeConnectedAccountId || profile?.connectedAccountId || '';
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'custom',
        country: String(req.body?.country || 'US').toUpperCase(),
        email: decodedToken.email || profile?.email || undefined,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual'
      });
      accountId = account.id;
      await db.collection(USERS_COLLECTION).doc(decodedToken.uid).set({
        stripeConnectedAccountId: accountId,
        connectedAccountId: accountId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    const origin = String(req.headers.origin || process.env.APP_ORIGIN || 'https://cardswipers.com').replace(/\/$/, '');
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/wallet`,
      return_url: `${origin}/wallet`,
      type: 'account_onboarding'
    });
    return sendJson(res, 200, { accountId, onboardingUrl: accountLink.url });
  } catch (error) {
    console.error('createSellerPayoutAccount failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to start seller payout setup.' });
  }
});

exports.createVerificationSession = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAuth(req);
    const stripe = getStripeClient();
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        userId: decodedToken.uid,
        email: decodedToken.email || ''
      }
    });

    return sendJson(res, 200, {
      verificationSessionId: session.id,
      url: session.url || null,
      clientSecret: session.client_secret || null,
      status: session.status
    });
  } catch (error) {
    console.error('createVerificationSession failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to start identity verification.' });
  }
});

exports.submitTracking = onRequest({ secrets: [shippoApiKey] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAuth(req);
    const { orderId: rawOrderId, trackingNumber, carrier, destinationZip } = req.body || {};
    const orderId = buildOrderId(rawOrderId);
    const { orderRef, order } = await getOrderOrThrow(orderId);

    if (order.seller_user_id && order.seller_user_id !== decodedToken.uid) {
      return sendJson(res, 403, { error: 'Only the seller can submit tracking for this order.' });
    }
    if (!String(carrier || '').trim() || !String(trackingNumber || '').trim()) {
      return sendJson(res, 400, { error: 'Carrier and tracking number are required before shipping.' });
    }
    if (!['USPS', 'UPS', 'FEDEX'].includes(String(carrier).trim().toUpperCase())) {
      return sendJson(res, 400, { error: 'Carrier must be USPS, UPS, or FedEx.' });
    }

    const trackingDetails = await validateTrackingAgainstOrder(order, carrier, trackingNumber, destinationZip);
    const nextOrderState = {
      tracking_number: trackingDetails.trackingNumber,
      carrier: trackingDetails.carrier,
      tracking_url: trackingDetails.trackingUrl,
      shipping_api_tracker_id: trackingDetails.trackerId,
      status: 'shipped',
      shipped_at: serverTimestamp(),
      tracking_status: trackingDetails.deliveryStatus || 'pre_transit',
      tracking_destination_zip: trackingDetails.destinationZip || null,
      tracking_submitted_at: serverTimestamp(),
      auto_release_at: addMilliseconds(nowTimestamp(), 7 * 24 * 60 * 60 * 1000),
      updated_at: serverTimestamp()
    };

    await orderRef.set(nextOrderState, { merge: true });
    await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });
    await Promise.all([
      notifyUser(order.buyer_id, 'tracking_added', `Tracking was added for ${order.card_title || 'your order'}.`, { orderId, trackingNumber: trackingDetails.trackingNumber }),
      notifyUser(order.seller_user_id, 'tracking_added', `Tracking was added for ${order.card_title || 'your sale'}.`, { orderId, trackingNumber: trackingDetails.trackingNumber })
    ]);

    return sendJson(res, 200, {
      orderId,
      carrier: trackingDetails.carrier,
      trackingNumber: trackingDetails.trackingNumber,
      shippingApiTrackerId: trackingDetails.trackerId,
      trackingUrl: trackingDetails.trackingUrl,
      status: 'shipped'
    });
  } catch (error) {
    console.error('submitTracking failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to submit tracking details.' });
  }
});

exports.acceptDelivery = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAuth(req);
    const orderId = buildOrderId(req.body?.orderId);
    const { order } = await getOrderOrThrow(orderId);

    if (order.buyer_id !== decodedToken.uid) {
      return sendJson(res, 403, { error: 'Only the buyer can accept delivery for this order.' });
    }

    const result = await releaseFundsForOrder(orderId, order.seller_id, {
      actor: decodedToken.uid,
      resolution: 'buyer_accept_delivery'
    });

    return sendJson(res, 200, {
      orderId,
      transferId: result.transferId,
      status: 'completed'
    });
  } catch (error) {
    console.error('acceptDelivery failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to release seller funds.' });
  }
});

exports.openDispute = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAuth(req);
    const orderId = buildOrderId(req.body?.orderId);
    const disputeReason = String(req.body?.disputeReason || '').trim();
    const disputeCategory = String(req.body?.disputeCategory || 'Item Not Received').trim();
    const evidence = Array.isArray(req.body?.evidence) ? req.body.evidence.slice(0, 5) : [];
    if (!disputeReason) {
      return sendJson(res, 400, { error: 'disputeReason is required.' });
    }

    const { orderRef, order } = await getOrderOrThrow(orderId);
    if (order.buyer_id !== decodedToken.uid) {
      return sendJson(res, 403, { error: 'Only the buyer can dispute this order.' });
    }

    const nextOrderState = {
      status: 'disputed',
      dispute_reason: disputeReason,
      dispute_category: disputeCategory,
      dispute_evidence: evidence,
      payout_frozen: true,
      disputed_at: serverTimestamp(),
      dispute_timer_expires_at: null,
      updated_at: serverTimestamp()
    };

    await orderRef.set(nextOrderState, { merge: true });
    await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });

    return sendJson(res, 200, {
      orderId,
      status: 'disputed'
    });
  } catch (error) {
    console.error('openDispute failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to open dispute.' });
  }
});

exports.submitReturnTracking = onRequest({ secrets: [shippoApiKey] }, async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const decodedToken = await requireAuth(req);
    const orderId = buildOrderId(req.body?.orderId);
    const carrier = String(req.body?.carrier || '').trim();
    const trackingNumber = String(req.body?.trackingNumber || '').trim();
    if (!carrier || !trackingNumber) throw new Error('Return carrier and tracking number are required.');
    const { orderRef, order } = await getOrderOrThrow(orderId);
    if (order.buyer_id !== decodedToken.uid || String(order.status || '').toLowerCase() !== 'disputed') throw new Error('Only the buyer can submit return tracking for an active dispute.');
    const tracker = await createShippoTracker(carrier, trackingNumber);
    const nextOrderState = {
      return_carrier: carrier,
      return_tracking_number: trackingNumber,
      return_shipping_api_tracker_id: tracker.object_id || tracker.id || null,
      return_tracking_status: String(tracker.tracking_status?.status || tracker.status || 'pre_transit').toLowerCase(),
      return_tracking_submitted_at: serverTimestamp(),
      return_refund_status: 'awaiting_delivery',
      updated_at: serverTimestamp()
    };
    await orderRef.set(nextOrderState, { merge: true });
    await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });
    return sendJson(res, 200, { orderId, status: nextOrderState.return_tracking_status });
  } catch (error) {
    console.error('submitReturnTracking failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to submit return tracking.' });
  }
});

exports.shippingWebhook = onRequest({ secrets: [shippingWebhookSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const expectedSecret = shippingWebhookSecret.value() || process.env.SHIPPING_WEBHOOK_SECRET;
    const providedSecret = String(req.headers['x-webhook-secret'] || req.query.secret || '');
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return sendJson(res, 401, { error: 'Invalid shipping webhook secret.' });
    }

    const trackerId = String(req.body?.data?.object_id || req.body?.object_id || req.body?.tracking?.id || '').trim();
    const trackingNumber = String(req.body?.data?.tracking_number || req.body?.tracking_number || '').trim();
    const carrier = String(req.body?.data?.carrier || req.body?.carrier || '').trim();
    const rawStatus = String(req.body?.data?.tracking_status?.status || req.body?.tracking_status?.status || req.body?.status || '').trim().toLowerCase();
    if (!trackerId && !trackingNumber) {
      return sendJson(res, 400, { error: 'Missing tracker identifier.' });
    }

    let orderQuery = null;
    if (trackerId) {
      orderQuery = await db.collection(ORDERS_COLLECTION).where('shipping_api_tracker_id', '==', trackerId).limit(1).get();
    }
    if ((!orderQuery || orderQuery.empty) && trackingNumber) {
      orderQuery = await db.collection(ORDERS_COLLECTION).where('tracking_number', '==', trackingNumber).limit(1).get();
    }
    let isReturnShipment = false;
    if (!orderQuery || orderQuery.empty) {
      if (trackerId) {
        orderQuery = await db.collection(ORDERS_COLLECTION).where('return_shipping_api_tracker_id', '==', trackerId).limit(1).get();
      }
      if ((!orderQuery || orderQuery.empty) && trackingNumber) {
        orderQuery = await db.collection(ORDERS_COLLECTION).where('return_tracking_number', '==', trackingNumber).limit(1).get();
      }
      isReturnShipment = Boolean(orderQuery && !orderQuery.empty);
    }
    if (!orderQuery || orderQuery.empty) {
      return sendJson(res, 404, { error: 'Matching order not found for shipping webhook.' });
    }

    const orderDoc = orderQuery.docs[0];
    const order = orderDoc.data();
    if (order.return_tracking_number === trackingNumber || order.return_shipping_api_tracker_id === trackerId) {
      isReturnShipment = true;
    }
    if (isReturnShipment) {
      const returnState = {
        return_tracking_status: rawStatus || order.return_tracking_status || 'unknown',
        return_delivered_at: rawStatus === 'delivered' ? serverTimestamp() : order.return_delivered_at || null,
        return_refund_status: rawStatus === 'delivered' ? 'refund_pending' : order.return_refund_status || 'awaiting_delivery',
        updated_at: serverTimestamp()
      };
      await orderDoc.ref.set(returnState, { merge: true });
      await syncPurchaseIntentMirror(order.order_id || orderDoc.id, { ...order, ...returnState });
      if (rawStatus === 'delivered') {
        const refund = await refundBuyerForOrder(order.order_id || orderDoc.id, { actor: 'system', resolution: 'return_delivered_dispute_refund' });
        await orderDoc.ref.set({ return_refund_status: 'refunded', return_refund_id: refund.id || null, updated_at: serverTimestamp() }, { merge: true });
        await Promise.all([
          notifyUser(order.buyer_id, 'dispute_refunded', 'Your returned item was delivered and the dispute refund was issued.', { orderId: order.order_id || orderDoc.id }),
          notifyUser(order.seller_user_id, 'dispute_refunded', 'The buyer return was delivered and the dispute refund was issued.', { orderId: order.order_id || orderDoc.id })
        ]);
      }
      return sendJson(res, 200, { ok: true, orderId: order.order_id || orderDoc.id, status: returnState.return_refund_status });
    }
    const nextOrderState = {
      tracking_number: trackingNumber || order.tracking_number || null,
      carrier: carrier || order.carrier || null,
      tracking_status: rawStatus || order.tracking_status || 'unknown',
      tracking_destination_zip: String(req.body?.data?.tracking_status?.location?.zip || req.body?.tracking_status?.location?.zip || order.tracking_destination_zip || '').trim(),
      updated_at: serverTimestamp()
    };

    if (rawStatus === 'delivered') {
      nextOrderState.status = 'delivered';
      nextOrderState.delivered_at = serverTimestamp();
      nextOrderState.dispute_timer_expires_at = addMilliseconds(nowTimestamp(), DISPUTE_WINDOW_MS);
      nextOrderState.delivery_release_at = addMilliseconds(nowTimestamp(), DISPUTE_WINDOW_MS);
      nextOrderState.auto_release_at = nextOrderState.delivery_release_at;
    }

    await orderDoc.ref.set(nextOrderState, { merge: true });
    await syncPurchaseIntentMirror(order.order_id || orderDoc.id, { ...order, ...nextOrderState });
    if (rawStatus === 'delivered') {
      await Promise.all([
        notifyUser(order.buyer_id, 'delivery_confirmed', `Carrier delivery was confirmed for ${order.card_title || 'your order'}.`, { orderId: order.order_id || orderDoc.id }),
        notifyUser(order.seller_user_id, 'delivery_confirmed', `Carrier delivery was confirmed for ${order.card_title || 'your sale'}.`, { orderId: order.order_id || orderDoc.id })
      ]);
    }

    return sendJson(res, 200, {
      ok: true,
      orderId: order.order_id || orderDoc.id,
      status: nextOrderState.status || order.status
    });
  } catch (error) {
    console.error('shippingWebhook failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to process shipping webhook.' });
  }
});

exports.stripeEscrowWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret], rawBody: true }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const secret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return sendJson(res, 500, { error: 'Missing STRIPE_WEBHOOK_SECRET secret.' });
    }

    const stripe = getStripeClient();
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return sendJson(res, 400, { error: 'Missing Stripe signature header.' });
    }

    const rawBody = req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    const shouldProcess = await markWebhookEventProcessed(event.id, event.type, event);
    if (!shouldProcess) {
      return res.status(200).json({ ok: true, duplicate: true, eventId: event.id, type: event.type });
    }

    if (event.type === 'identity.verification_session.verified') {
      const verificationSession = event.data.object;
      const userId = String(verificationSession.metadata?.userId || '').trim();
      if (userId) {
        await getDb().collection(USERS_COLLECTION).doc(userId).set({
          isVerified: true,
          is_verified: true,
          verificationStatus: 'verified',
          verificationVerifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      return res.status(200).send('ok');
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const orderId = buildOrderId(paymentIntent.metadata?.orderId || '');
      const { orderRef, order } = await getOrderOrThrow(orderId);
      const nextOrderState = {
        status: 'payment_held',
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: serverTimestamp()
      };
      await orderRef.set(nextOrderState, { merge: true });
      await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });
      const offerId = String(paymentIntent.metadata?.offerId || '').trim();
      if (offerId) {
        const offerRef = getDb().collection('offers').doc(offerId);
        await getDb().runTransaction(async (transaction) => {
          const offerSnapshot = await transaction.get(offerRef);
          if (!offerSnapshot.exists || offerSnapshot.data().status !== 'accepted' || offerSnapshot.data().buyerUid !== order.buyer_id) {
            throw new Error('Payment offer is no longer accepted by this buyer.');
          }
          transaction.update(offerRef, {
            paymentStatus: 'payment_held',
            paymentIntentId: paymentIntent.id,
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
      }
      await Promise.all([
        notifyUser(order.buyer_id, 'payout_released', `Funds were released for ${order.card_title || 'your order'}.`, { orderId }),
        notifyUser(order.seller_user_id, 'payout_released', `Your payout was released for ${order.card_title || 'your sale'}.`, { orderId, transferId: order.stripe_transfer_id || null })
      ]);
    }

    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      const paymentIntent = event.data.object;
      const orderId = buildOrderId(paymentIntent.metadata?.orderId || '');
      const { orderRef, order } = await getOrderOrThrow(orderId);
      const nextOrderState = {
        status: 'pending_payment',
        updated_at: serverTimestamp(),
        payment_error: paymentIntent.last_payment_error?.message || event.type
      };
      await orderRef.set(nextOrderState, { merge: true });
      await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });
      const offerId = String(paymentIntent.metadata?.offerId || '').trim();
      if (offerId) {
        const offerRef = getDb().collection('offers').doc(offerId);
        await offerRef.set({ paymentStatus: 'payment_pending', updatedAt: serverTimestamp() }, { merge: true });
      }
    }

    return res.status(200).json({ ok: true, eventId: event.id, type: event.type });
  } catch (error) {
    console.error('stripeEscrowWebhook failed:', error);
    return res.status(500).json({ error: `Webhook Error: ${error.message}` });
  }
});

exports.getAdminDisputes = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['GET']) === 'options') {
    return res.status(204).send('');
  }

  try {
    await requireAdmin(req);
    const snapshot = await db.collection(ORDERS_COLLECTION).where('status', '==', 'disputed').limit(200).get();
    const disputes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return sendJson(res, 200, { disputes });
  } catch (error) {
    console.error('getAdminDisputes failed:', error);
    return sendJson(res, 403, { error: error.message || 'Unable to load disputes.' });
  }
});

exports.resolveAdminDispute = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertMethod(req, ['POST']) === 'options') {
    return res.status(204).send('');
  }

  try {
    const decodedToken = await requireAdmin(req);
    const orderId = buildOrderId(req.body?.orderId);
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (action !== 'refund_buyer' && action !== 'release_to_seller') {
      return sendJson(res, 400, { error: 'action must be refund_buyer or release_to_seller.' });
    }

    if (action === 'refund_buyer') {
      await refundBuyerForOrder(orderId, { actor: decodedToken.uid, resolution: 'refund_buyer' });
      return sendJson(res, 200, { orderId, status: 'refunded' });
    }

    const { order } = await getOrderOrThrow(orderId);
    const result = await releaseFundsForOrder(orderId, order.seller_id, {
      actor: decodedToken.uid,
      resolution: 'release_to_seller'
    });
    return sendJson(res, 200, { orderId, status: 'completed', transferId: result.transferId });
  } catch (error) {
    console.error('resolveAdminDispute failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to resolve dispute.' });
  }
});

exports.adminBlockUser = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const admin = await requireAdmin(req);
    const userId = String(req.body?.userId || '').trim();
    const status = String(req.body?.status || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    if (!userId || !['active', 'deactivated'].includes(status)) {
      return sendJson(res, 400, { error: 'userId and a valid status are required.' });
    }
    if (userId === admin.uid) return sendJson(res, 400, { error: 'Administrators cannot change their own status.' });

    await getDb().collection(USERS_COLLECTION).doc(userId).set({
      status,
      blockedAt: status === 'deactivated' ? serverTimestamp() : null,
      blockedBy: status === 'deactivated' ? admin.uid : null,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await writeAdminLog(admin.uid, 'admin_block_user', userId, reason || `${status} account`);
    return sendJson(res, 200, { ok: true, userId, status });
  } catch (error) {
    console.error('adminBlockUser failed:', error);
    return sendJson(res, 403, { error: error.message || 'Unable to update account status.' });
  }
});

exports.adminApproveSeller = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const admin = await requireAdmin(req);
    const verificationId = String(req.body?.verificationId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    if (!verificationId || !['verified', 'rejected'].includes(decision)) {
      return sendJson(res, 400, { error: 'verificationId and a valid decision are required.' });
    }

    const verificationRef = getDb().collection('sellerVerifications').doc(verificationId);
    const verificationSnapshot = await verificationRef.get();
    if (!verificationSnapshot.exists) return sendJson(res, 404, { error: 'Verification request not found.' });
    const verification = verificationSnapshot.data();
    const userId = String(verification.userId || '').trim();
    if (!userId) return sendJson(res, 400, { error: 'Verification request has no user ID.' });
    const requestedTypes = Array.isArray(verification.verificationTypes) ? verification.verificationTypes : [];
    const sellerStatus = requestedTypes.includes('seller') ? decision : (verification.sellerStatus || 'not_requested');
    const overallStatus = sellerStatus === 'verified' ? 'verified' : decision;

    await getDb().runTransaction(async (transaction) => {
      transaction.update(verificationRef, {
        status: decision,
        buyerStatus: 'not_requested',
        sellerStatus,
        reviewedBy: admin.uid,
        reviewerEmail: admin.email || '',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      transaction.set(getDb().collection(USERS_COLLECTION).doc(userId), {
        verificationStatus: overallStatus,
        sellerVerificationStatus: sellerStatus,
        verificationReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await writeAdminLog(admin.uid, 'admin_approve_seller', verificationId, reason || decision);
    return sendJson(res, 200, { ok: true, verificationId, userId, decision });
  } catch (error) {
    console.error('adminApproveSeller failed:', error);
    return sendJson(res, 403, { error: error.message || 'Unable to review seller verification.' });
  }
});

exports.adminDeleteCard = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const admin = await requireAdmin(req);
    const cardId = String(req.body?.cardId || '').trim();
    const flagId = String(req.body?.flagId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!cardId) return sendJson(res, 400, { error: 'cardId is required.' });

    const cardRef = getDb().collection('cards').doc(cardId);
    const flagRef = flagId ? getDb().collection('flaggedCards').doc(flagId) : null;
    await getDb().runTransaction(async (transaction) => {
      transaction.delete(cardRef);
      if (flagRef) transaction.delete(flagRef);
    });
    await writeAdminLog(admin.uid, 'admin_delete_card', cardId, reason || (flagId ? `Deleted from flag ${flagId}` : 'Admin moderation'));
    return sendJson(res, 200, { ok: true, cardId, flagId: flagId || null });
  } catch (error) {
    console.error('adminDeleteCard failed:', error);
    return sendJson(res, 403, { error: error.message || 'Unable to delete card.' });
  }
});

exports.deleteUserAccount = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (assertMethod(req, ['POST']) === 'options') return res.status(204).send('');

  try {
    const user = await requireAuth(req);
    const uid = user.uid;
    const firestoreDb = getDb();

    const activeOrdersSnap = await firestoreDb.collection(ORDERS_COLLECTION)
      .where('status', 'in', ['payment_held', 'shipped', 'disputed'])
      .get();

    const userHasActiveEscrow = activeOrdersSnap.docs.some((docSnap) => {
      const data = docSnap.data() || {};
      return data.buyer_id === uid || data.seller_user_id === uid || data.sellerUid === uid;
    });

    if (userHasActiveEscrow) {
      return sendJson(res, 400, {
        error: 'Cannot delete account while you have active escrow orders in progress. Please complete or resolve active transactions first.'
      });
    }

    const userCardsSnap = await firestoreDb.collection('cards').where('ownerUid', '==', uid).get();
    const batchPromises = [];
    userCardsSnap.docs.forEach((cardDoc) => {
      batchPromises.push(cardDoc.ref.delete());
    });

    const draftsSnap = await firestoreDb.collection('drafts').where('userId', '==', uid).get();
    draftsSnap.docs.forEach((draftDoc) => {
      batchPromises.push(draftDoc.ref.delete());
    });

    const notifsSnap = await firestoreDb.collection('notifications').where('userId', '==', uid).get();
    notifsSnap.docs.forEach((notifDoc) => {
      batchPromises.push(notifDoc.ref.delete());
    });

    const verifSnap = await firestoreDb.collection('sellerVerifications').where('userId', '==', uid).get();
    verifSnap.docs.forEach((vDoc) => {
      batchPromises.push(vDoc.ref.delete());
    });

    const clubMembersSnap = await firestoreDb.collectionGroup('members').where('uid', '==', uid).get();
    clubMembersSnap.docs.forEach((memberDoc) => {
      batchPromises.push(memberDoc.ref.delete());
    });

    batchPromises.push(firestoreDb.collection(USERS_COLLECTION).doc(uid).delete());

    await Promise.all(batchPromises);

    await getAuth().deleteUser(uid);
    await writeAdminLog(uid, 'user_account_self_deleted', uid, 'User requested complete account deletion under App Store Guideline 5.1.1(v)');

    return sendJson(res, 200, { ok: true, message: 'Account and associated data deleted successfully.' });
  } catch (error) {
    console.error('deleteUserAccount failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to delete account.' });
  }
});

exports.allocateClubCredits = onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    const memberId = String(req.body?.memberId || '').trim();
    const credits = Math.floor(Number(req.body?.credits));
    if (!clubId || !memberId || !Number.isFinite(credits) || credits <= 0) {
      throw new Error('clubId, memberId, and a positive credit amount are required.');
    }

    const result = await db.runTransaction(async (transaction) => {
      const clubRef = db.collection('clubs').doc(clubId);
      const actorRef = clubRef.collection('members').doc(user.uid);
      const memberRef = clubRef.collection('members').doc(memberId);
      const [clubSnap, actorSnap, memberSnap] = await Promise.all([
        transaction.get(clubRef),
        transaction.get(actorRef),
        transaction.get(memberRef)
      ]);
      if (!clubSnap.exists || !actorSnap.exists || !memberSnap.exists) {
        throw new Error('Club or member record was not found.');
      }

      const actor = actorSnap.data();
      const member = memberSnap.data();
      const actorRole = String(actor.role || '').toLowerCase();
      const memberRole = String(member.role || '').toLowerCase();
      if (!['owner', 'agent'].includes(actorRole)) {
        throw new Error('Only club owners and agents can distribute credits.');
      }
      if (actorRole === 'agent' && memberRole !== 'member') {
        throw new Error('Agents can distribute credits only to members.');
      }
      if (memberRole === 'owner') {
        throw new Error('Credits cannot be allocated to the owner account.');
      }

      const actorBalance = actor.credits === 'infinite' ? Infinity : Number(actor.credits || 0);
      if (actorBalance < credits) {
        throw new Error('Insufficient available credits.');
      }

      const memberCredits = Number(member.credits || 0) + credits;
      const actorUpdate = actorBalance === Infinity ? {} : { credits: actorBalance - credits, updatedAt: serverTimestamp() };
      const club = clubSnap.data();
      const ledger = club.creditLedger || {};
      const memberBalances = { ...(ledger.memberBalances || {}) };
      if (actorBalance !== Infinity) {
        memberBalances[user.uid] = { ...(memberBalances[user.uid] || {}), role: actorRole, credits: actorBalance - credits };
      }
      memberBalances[memberId] = { ...(memberBalances[memberId] || {}), role: memberRole, credits: memberCredits };

      if (Object.keys(actorUpdate).length) transaction.update(actorRef, actorUpdate);
      transaction.update(memberRef, { credits: memberCredits, updatedAt: serverTimestamp() });
      transaction.update(clubRef, {
        creditLedger: { ...ledger, memberBalances },
        updatedAt: serverTimestamp()
      });
      return { recipientCredits: memberCredits };
    });

    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('allocateClubCredits failed:', error);
    return sendJson(res, 400, { error: error.message || 'Could not allocate club credits.' });
  }
});

exports.registerTradeNight = onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    const eventId = String(req.body?.eventId || '').trim();
    if (!clubId || !eventId) throw new Error('clubId and eventId are required.');
    const binderCardIds = sanitizeCardIds(req.body?.binderCardIds);

    const result = await getDb().runTransaction(async (transaction) => {
      const clubRef = getDb().collection('clubs').doc(clubId);
      const memberRef = clubRef.collection('members').doc(user.uid);
      const eventRef = clubRef.collection('events').doc(eventId);
      const registrationRef = eventRef.collection('registrations').doc(user.uid);
      const [clubSnap, memberSnap, eventSnap, registrationSnap] = await Promise.all([
        transaction.get(clubRef),
        transaction.get(memberRef),
        transaction.get(eventRef),
        transaction.get(registrationRef)
      ]);
      if (!clubSnap.exists || !memberSnap.exists || !eventSnap.exists) throw new Error('Club, membership, or event was not found.');
      const event = eventSnap.data();
      if ((event.bootedUids || []).includes(user.uid) || registrationSnap.data()?.status === 'booted') {
        throw new Error('You were removed from this trade night by a table vote and cannot re-enter.');
      }
      if (registrationSnap.exists) throw new Error('You are already registered for this trade night.');

      const member = memberSnap.data();
      if (member.status && member.status !== 'active') throw new Error('Your club membership is not active.');
      if (String(event.status || '').toLowerCase() !== 'registration') throw new Error('Registration is closed for this trade night.');

      const cardSnaps = binderCardIds.length
        ? await transaction.getAll(...binderCardIds.map((cardId) => getDb().collection('cards').doc(cardId)))
        : [];
      const binderCards = cardSnaps
        .filter((snap) => snap.exists && snap.data().ownerUid === user.uid)
        .map((snap) => toBinderCardSnapshot(snap.id, snap.data()));
      const binderCheck = evaluateBinderCriteria(binderCards, getEntryCriteria(event));
      if (!binderCheck.ok) {
        throw new Error(`Entry binder does not meet requirements: ${binderCheck.missing.join(' ')}`);
      }
      const buyInCredits = Math.max(1, Math.floor(Number(event.buyInCredits || 0)));
      const currentRegistrations = Number(event.currentRegistrations || 0);
      const capLimit = Number(event.capLimit || 0);
      if (capLimit > 0 && currentRegistrations >= capLimit) throw new Error('This trade night is full.');

      const currentCredits = member.credits === 'infinite' ? Infinity : Number(member.credits || 0);
      if (currentCredits < buyInCredits) throw new Error(`You need ${buyInCredits} available credits to register.`);
      const remainingCredits = currentCredits === Infinity ? 'infinite' : currentCredits - buyInCredits;
      const heldEscrow = Number(member.escrowHeld || 0) + buyInCredits;
      const club = clubSnap.data();
      const ledger = club.creditLedger || {};
      const memberBalances = { ...(ledger.memberBalances || {}) };
      memberBalances[user.uid] = {
        ...(memberBalances[user.uid] || {}),
        role: member.role || 'member',
        credits: remainingCredits,
        escrowHeld: heldEscrow,
        status: 'active'
      };

      transaction.update(memberRef, { credits: remainingCredits, escrowHeld: heldEscrow, updatedAt: serverTimestamp() });
      transaction.update(eventRef, {
        currentRegistrations: currentRegistrations + 1,
        escrowTotal: Number(event.escrowTotal || 0) + buyInCredits,
        updatedAt: serverTimestamp()
      });
      transaction.set(registrationRef, {
        userId: user.uid,
        displayName: member.displayName || user.name || user.email || 'Collector',
        username: member.username || '',
        profileImageUrl: member.profileImageUrl || '',
        status: 'registered',
        buyInCredits,
        escrowStatus: 'held',
        binderCardIds: binderCards.map((card) => card.id),
        binderCards,
        binderValue: binderCheck.totalValue,
        binderCardCount: binderCheck.cardCount,
        registeredAt: serverTimestamp()
      });
      transaction.update(clubRef, {
        totalEscrow: Number(club.totalEscrow || 0) + buyInCredits,
        creditLedger: { ...ledger, memberBalances, escrowVault: Number(ledger.escrowVault || 0) + buyInCredits },
        updatedAt: serverTimestamp()
      });
      return { buyInCredits, remainingCredits };
    });

    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('registerTradeNight failed:', error);
    return sendJson(res, 400, { error: error.message || 'Could not register for trade night.' });
  }
});

const TRADE_NIGHT_DEFAULT_MIN_BINDER_VALUE = 500;
const TRADE_NIGHT_DEFAULT_MIN_CARD_COUNT = 6;
const TRADE_NIGHT_VENDOR_TURN_MS = 30 * 1000;
const TRADE_NIGHT_OFFER_MS = 45 * 1000;
const TRADE_NIGHT_MAX_BINDER_CARDS = 100;
const TRADE_NIGHT_BOOT_REASON_MAX = 280;

function sanitizeCardIds(value, max = TRADE_NIGHT_MAX_BINDER_CARDS) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((id) => String(id || '').trim()).filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id)))).slice(0, max);
}

function parseDollarValue(value) {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBinderCardSnapshot(id, data = {}) {
  return {
    id,
    name: String(data.name || data.title || 'Card').slice(0, 120),
    imageUrl: data.imageFrontUrl || data.imageUrl || '',
    value: parseDollarValue(data.tradeValue || data.value || data.avgMarketValue)
  };
}

function getEntryCriteria(event = {}) {
  const criteria = event.entryCriteria || {};
  return {
    minBinderValue: Math.max(0, Number(criteria.minBinderValue ?? TRADE_NIGHT_DEFAULT_MIN_BINDER_VALUE)),
    minCardCount: Math.max(0, Math.floor(Number(criteria.minCardCount ?? TRADE_NIGHT_DEFAULT_MIN_CARD_COUNT)))
  };
}

function evaluateBinderCriteria(cards, criteria) {
  const totalValue = Number(cards.reduce((sum, card) => sum + Number(card.value || 0), 0).toFixed(2));
  const cardCount = cards.length;
  const missing = [];
  if (cardCount < criteria.minCardCount) missing.push(`Needs ${criteria.minCardCount - cardCount} more card(s) (minimum ${criteria.minCardCount}).`);
  if (totalValue < criteria.minBinderValue) missing.push(`Needs $${(criteria.minBinderValue - totalValue).toFixed(2)} more binder value (minimum $${criteria.minBinderValue}).`);
  return { ok: missing.length === 0, missing, totalValue, cardCount };
}

function getTableTurn(table = {}) {
  const seats = table.seats || [];
  if (seats.length < 2) return { vendorUid: seats[0] || null, recipientUid: null };
  const dealerSeat = ((table.dealerSeat || 0) % seats.length + seats.length) % seats.length;
  const offset = Math.min(Math.max(1, table.targetOffset || 1), seats.length - 1);
  return { vendorUid: seats[dealerSeat], recipientUid: seats[(dealerSeat + offset) % seats.length] };
}

// Moves to the next recipient; once the vendor has dealt to every seat, the button passes to the next seat.
function advanceTable(table, nowMs) {
  const seats = table.seats || [];
  let dealerSeat = table.dealerSeat || 0;
  let targetOffset = (table.targetOffset || 1) + 1;
  let round = table.round || 1;
  let orbit = table.orbit || 1;
  if (targetOffset >= seats.length) {
    dealerSeat = seats.length ? (dealerSeat + 1) % seats.length : 0;
    targetOffset = 1;
    round += 1;
    if (dealerSeat === 0) orbit += 1;
  }
  return {
    ...table,
    dealerSeat,
    targetOffset,
    round,
    orbit,
    activeDealId: null,
    turnStartedAt: admin.firestore.Timestamp.fromMillis(nowMs),
    turnExpiresAt: admin.firestore.Timestamp.fromMillis(nowMs + TRADE_NIGHT_VENDOR_TURN_MS)
  };
}

function removeSeatFromTable(table, uid, nowMs) {
  const seats = table.seats || [];
  const removedIndex = seats.indexOf(uid);
  if (removedIndex < 0) return { table, affectedTurn: false };
  const { vendorUid, recipientUid } = getTableTurn(table);
  const nextSeats = seats.filter((seatUid) => seatUid !== uid);
  const next = { ...table, seats: nextSeats };
  const resetTurn = {
    activeDealId: null,
    turnStartedAt: admin.firestore.Timestamp.fromMillis(nowMs),
    turnExpiresAt: admin.firestore.Timestamp.fromMillis(nowMs + TRADE_NIGHT_VENDOR_TURN_MS)
  };
  if (!nextSeats.length) return { table: { ...next, dealerSeat: 0, targetOffset: 1, ...resetTurn }, affectedTurn: true };

  if (uid === vendorUid) {
    return { table: { ...next, dealerSeat: removedIndex % nextSeats.length, targetOffset: 1, ...resetTurn }, affectedTurn: true };
  }
  const dealerSeat = nextSeats.indexOf(vendorUid);
  if (uid === recipientUid) {
    const targetOffset = table.targetOffset || 1;
    if (targetOffset >= nextSeats.length) return { table: advanceTable({ ...next, dealerSeat, targetOffset: nextSeats.length }, nowMs), affectedTurn: true };
    return { table: { ...next, dealerSeat, targetOffset, ...resetTurn }, affectedTurn: true };
  }
  const recipientIndex = nextSeats.indexOf(recipientUid);
  const targetOffset = ((recipientIndex - dealerSeat) % nextSeats.length + nextSeats.length) % nextSeats.length || 1;
  return { table: { ...next, dealerSeat, targetOffset }, affectedTurn: false };
}

async function loadTradeNightContext(transaction, clubId, eventId, uid) {
  const clubRef = getDb().collection('clubs').doc(clubId);
  const eventRef = clubRef.collection('events').doc(eventId);
  const [clubSnap, eventSnap, memberSnap] = await Promise.all([
    transaction.get(clubRef),
    transaction.get(eventRef),
    transaction.get(clubRef.collection('members').doc(uid))
  ]);
  if (!clubSnap.exists || !eventSnap.exists) throw new Error('Trade night was not found.');
  if (!memberSnap.exists || (memberSnap.data().status && memberSnap.data().status !== 'active')) {
    throw new Error('An active club membership is required.');
  }
  return { clubRef, eventRef, club: clubSnap.data(), event: eventSnap.data(), member: memberSnap.data() };
}

exports.tradeNightTableAction = onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    const eventId = String(req.body?.eventId || '').trim();
    const action = String(req.body?.action || '').trim();
    if (!clubId || !eventId) throw new Error('clubId and eventId are required.');
    if (!['start', 'propose', 'decline', 'accept', 'expire'].includes(action)) throw new Error('Unsupported table action.');

    const result = await getDb().runTransaction(async (transaction) => {
      const { eventRef, event, member } = await loadTradeNightContext(transaction, clubId, eventId, user.uid);
      const nowMs = Date.now();
      const dealsRef = eventRef.collection('deals');

      if (action === 'start') {
        if (!['owner', 'agent'].includes(String(member.role || '').toLowerCase())) throw new Error('Only club owners and agents can start the table.');
        if (String(event.status || '').toLowerCase() !== 'registration') throw new Error('This trade night has already started or closed.');
        const registrationsSnap = await transaction.get(eventRef.collection('registrations').orderBy('registeredAt', 'asc'));
        const booted = new Set(event.bootedUids || []);
        const seats = registrationsSnap.docs
          .filter((snap) => snap.data().status !== 'booted' && !booted.has(snap.id))
          .map((snap) => snap.id);
        if (seats.length < 2) throw new Error('At least two seated traders are required to start the table.');
        transaction.update(eventRef, {
          status: 'live',
          table: {
            seats,
            dealerSeat: 0,
            targetOffset: 1,
            round: 1,
            orbit: 1,
            activeDealId: null,
            turnStartedAt: admin.firestore.Timestamp.fromMillis(nowMs),
            turnExpiresAt: admin.firestore.Timestamp.fromMillis(nowMs + TRADE_NIGHT_VENDOR_TURN_MS)
          },
          updatedAt: serverTimestamp()
        });
        return { status: 'live' };
      }

      if (String(event.status || '').toLowerCase() !== 'live' || !event.table) throw new Error('The table is not live.');
      const table = event.table;
      const seats = table.seats || [];
      if (!seats.includes(user.uid)) throw new Error('You are not seated at this table.');
      const { vendorUid, recipientUid } = getTableTurn(table);
      const dealRef = table.activeDealId ? dealsRef.doc(table.activeDealId) : null;
      const dealSnap = dealRef ? await transaction.get(dealRef) : null;
      const deal = dealSnap?.exists ? dealSnap.data() : null;

      if (action === 'expire') {
        if (deal && deal.status === 'pending') {
          if (deal.expiresAt.toMillis() > nowMs) throw new Error('Offer has not expired yet.');
          transaction.update(dealRef, { status: 'expired', resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } else if (table.turnExpiresAt && table.turnExpiresAt.toMillis() > nowMs) {
          throw new Error('Vendor turn has not expired yet.');
        }
        transaction.update(eventRef, { table: advanceTable(table, nowMs), updatedAt: serverTimestamp() });
        return { status: 'advanced' };
      }

      if (action === 'decline') {
        if (deal && deal.status === 'pending') {
          if (![deal.vendorUid, deal.recipientUid].includes(user.uid)) throw new Error('Only deal participants can decline.');
          transaction.update(dealRef, { status: 'declined', declinedByUid: user.uid, resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } else if (user.uid !== vendorUid) {
          throw new Error('There is no active deal to decline.');
        }
        transaction.update(eventRef, { table: advanceTable(table, nowMs), updatedAt: serverTimestamp() });
        return { status: 'declined' };
      }

      if (action === 'accept') {
        if (!deal || deal.status !== 'pending') throw new Error('There is no active deal to accept.');
        if (deal.awaitingUid !== user.uid) throw new Error('It is not your turn to respond.');
        if (deal.expiresAt.toMillis() <= nowMs) throw new Error('This offer has expired.');
        transaction.update(dealRef, { status: 'accepted', acceptedByUid: user.uid, resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        transaction.update(eventRef, { table: advanceTable(table, nowMs), updatedAt: serverTimestamp() });
        return { status: 'accepted' };
      }

      // propose: vendor opens a deal on their turn, or the awaiting party counters.
      const note = String(req.body?.note || '').trim().slice(0, 200);
      const vendorCardIds = sanitizeCardIds(req.body?.vendorCardIds, 20);
      const recipientCardIds = sanitizeCardIds(req.body?.recipientCardIds, 20);
      if (!vendorCardIds.length && !recipientCardIds.length) throw new Error('Select at least one card for the deal.');
      const participantUids = deal && deal.status === 'pending' ? [deal.vendorUid, deal.recipientUid] : [vendorUid, recipientUid];
      if (!participantUids[1]) throw new Error('No trader is available to receive a deal.');
      const [vendorRegSnap, recipientRegSnap] = await Promise.all(participantUids.map((uid) => transaction.get(eventRef.collection('registrations').doc(uid))));
      const pickCards = (regSnap, ids) => {
        const byId = new Map((regSnap.data()?.binderCards || []).map((card) => [card.id, card]));
        if (ids.some((id) => !byId.has(id))) throw new Error('Deals can only include cards from entry binders.');
        return ids.map((id) => byId.get(id));
      };
      const terms = {
        vendorCardIds,
        vendorCards: pickCards(vendorRegSnap, vendorCardIds),
        recipientCardIds,
        recipientCards: pickCards(recipientRegSnap, recipientCardIds),
        note,
        proposedByUid: user.uid,
        proposedAt: admin.firestore.Timestamp.fromMillis(nowMs)
      };
      const expiresAt = admin.firestore.Timestamp.fromMillis(nowMs + TRADE_NIGHT_OFFER_MS);

      if (deal && deal.status === 'pending') {
        if (deal.awaitingUid !== user.uid) throw new Error('It is not your turn to respond.');
        if (deal.expiresAt.toMillis() <= nowMs) throw new Error('This offer has expired.');
        transaction.update(dealRef, {
          ...terms,
          awaitingUid: user.uid === deal.vendorUid ? deal.recipientUid : deal.vendorUid,
          counterCount: Number(deal.counterCount || 0) + 1,
          history: admin.firestore.FieldValue.arrayUnion({ vendorCardIds, recipientCardIds, note, proposedByUid: user.uid, proposedAt: terms.proposedAt, type: 'counter' }),
          expiresAt,
          updatedAt: serverTimestamp()
        });
        return { status: 'countered', dealId: dealRef.id };
      }

      if (user.uid !== vendorUid) throw new Error('Only the active vendor can open a deal.');
      if (table.turnExpiresAt && table.turnExpiresAt.toMillis() <= nowMs) throw new Error('Your vendor turn for this trader has expired.');
      const newDealRef = dealsRef.doc();
      transaction.set(newDealRef, {
        ...terms,
        vendorUid,
        recipientUid,
        awaitingUid: recipientUid,
        status: 'pending',
        round: table.round || 1,
        orbit: table.orbit || 1,
        counterCount: 0,
        history: [{ vendorCardIds, recipientCardIds, note, proposedByUid: user.uid, proposedAt: terms.proposedAt, type: 'open' }],
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      transaction.update(eventRef, { table: { ...table, activeDealId: newDealRef.id }, updatedAt: serverTimestamp() });
      return { status: 'dealt', dealId: newDealRef.id };
    });

    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('tradeNightTableAction failed:', error);
    return sendJson(res, 400, { error: error.message || 'Table action failed.' });
  }
});

exports.tradeNightBootVote = onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    const eventId = String(req.body?.eventId || '').trim();
    const targetUid = String(req.body?.targetUid || '').trim();
    const reason = String(req.body?.reason || '').trim().slice(0, TRADE_NIGHT_BOOT_REASON_MAX);
    if (!clubId || !eventId || !targetUid) throw new Error('clubId, eventId, and targetUid are required.');
    if (!reason) throw new Error('A brief reason is required to start a boot vote.');
    if (targetUid === user.uid) throw new Error('You cannot vote to boot yourself.');

    const result = await getDb().runTransaction(async (transaction) => {
      const { eventRef, event, member } = await loadTradeNightContext(transaction, clubId, eventId, user.uid);
      const nowMs = Date.now();
      const table = event.table || {};
      const seats = table.seats || [];
      if (String(event.status || '').toLowerCase() !== 'live') throw new Error('Boot votes are only available while the table is live.');
      if (!seats.includes(user.uid)) throw new Error('Only seated traders can vote.');
      if (!seats.includes(targetUid)) throw new Error('That trader is no longer seated.');

      const voteRef = eventRef.collection('bootVotes').doc(targetUid);
      const reasonRef = voteRef.collection('reasons').doc(user.uid);
      const targetRegRef = eventRef.collection('registrations').doc(targetUid);
      const [voteSnap, targetRegSnap] = await Promise.all([transaction.get(voteRef), transaction.get(targetRegRef)]);
      const dealRef = table.activeDealId ? eventRef.collection('deals').doc(table.activeDealId) : null;
      const dealSnap = dealRef ? await transaction.get(dealRef) : null;

      const eligibleVoters = seats.filter((uid) => uid !== targetUid);
      const voterUids = Array.from(new Set([...(voteSnap.data()?.voterUids || []), user.uid])).filter((uid) => eligibleVoters.includes(uid));
      const unanimous = eligibleVoters.every((uid) => voterUids.includes(uid));

      transaction.set(reasonRef, {
        voterUid: user.uid,
        voterName: member.username ? `@${member.username}` : member.displayName || 'Trader',
        reason,
        createdAt: serverTimestamp()
      });
      transaction.set(voteRef, {
        targetUid,
        voterUids,
        eligibleCount: eligibleVoters.length,
        status: unanimous ? 'booted' : 'open',
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (!unanimous) return { status: 'voted', votes: voterUids.length, required: eligibleVoters.length };

      const { table: nextTable, affectedTurn } = removeSeatFromTable(table, targetUid, nowMs);
      if (affectedTurn && dealSnap?.exists && dealSnap.data().status === 'pending') {
        transaction.update(dealRef, { status: 'cancelled', cancelReason: 'participant_booted', resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      transaction.update(eventRef, {
        table: nextTable,
        bootedUids: admin.firestore.FieldValue.arrayUnion(targetUid),
        updatedAt: serverTimestamp()
      });
      if (targetRegSnap.exists) {
        transaction.update(targetRegRef, { status: 'booted', bootedAt: serverTimestamp() });
      }
      const targetReg = targetRegSnap.data() || {};
      transaction.set(eventRef.collection('boots').doc(targetUid), {
        clubId,
        eventId,
        eventTitle: event.title || 'Trade Night',
        targetUid,
        targetName: targetReg.username ? `@${targetReg.username}` : targetReg.displayName || 'Trader',
        voterUids,
        finalVoterUid: user.uid,
        bootedAt: serverTimestamp()
      });
      return { status: 'booted', votes: voterUids.length, required: eligibleVoters.length };
    });

    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('tradeNightBootVote failed:', error);
    return sendJson(res, 400, { error: error.message || 'Boot vote failed.' });
  }
});

exports.onTradeNightBoot = onDocumentCreated('clubs/{clubId}/events/{eventId}/boots/{targetUid}', async (event) => {
  const boot = event.data?.data();
  if (!boot) return;
  const { clubId, eventId, targetUid } = event.params;
  const clubRef = getDb().collection('clubs').doc(clubId);
  const [clubSnap, targetMemberSnap, reasonsSnap] = await Promise.all([
    clubRef.get(),
    clubRef.collection('members').doc(targetUid).get(),
    clubRef.collection('events').doc(eventId).collection('bootVotes').doc(targetUid).collection('reasons').get()
  ]);
  const club = clubSnap.data() || {};
  const agentUid = targetMemberSnap.data()?.agentUid || null;
  const agentSnap = agentUid ? await clubRef.collection('members').doc(agentUid).get() : null;
  const superAgentUid = agentSnap?.data()?.superAgentUid || agentSnap?.data()?.agentUid || null;
  const ownerUid = club.ownerUid || club.ownerId || null;
  const comments = reasonsSnap.docs.map((snap) => ({ voterUid: snap.id, voterName: snap.data().voterName || '', reason: snap.data().reason || '' }));

  const recipients = [
    { uid: agentUid, relation: 'agent' },
    { uid: superAgentUid, relation: 'super_agent' },
    { uid: ownerUid, relation: 'club_owner' }
  ].filter((entry, index, list) => entry.uid && entry.uid !== targetUid && list.findIndex((other) => other.uid === entry.uid) === index);

  await Promise.all(recipients.map((recipient) => notifyUser(
    recipient.uid,
    'trade_night_boot',
    `${boot.targetName || 'A trader'} was booted from ${boot.eventTitle || 'Trade Night'} in ${club.name || 'your club'} by unanimous table vote.`,
    { clubId, eventId, targetUid, relation: recipient.relation, voterUids: boot.voterUids || [], comments }
  )));
  await event.data.ref.update({ notifiedUids: recipients.map((entry) => entry.uid), notifiedAt: serverTimestamp() });
});

exports.leaveClub = onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    assertMethod(req, ['POST']);
    const user = await requireAuth(req);
    const clubId = String(req.body?.clubId || '').trim();
    if (!clubId) throw new Error('clubId is required.');

    await getDb().runTransaction(async (transaction) => {
      const clubRef = getDb().collection('clubs').doc(clubId);
      const memberRef = clubRef.collection('members').doc(user.uid);
      const [clubSnapshot, memberSnapshot] = await Promise.all([
        transaction.get(clubRef),
        transaction.get(memberRef)
      ]);
      if (!clubSnapshot.exists || !memberSnapshot.exists) throw new Error('Club membership was not found.');

      const member = memberSnapshot.data();
      if (String(member.role || '').toLowerCase() === 'owner') {
        throw new Error('The club owner cannot leave the club. Transfer ownership or delete the club instead.');
      }
      if (Number(member.escrowHeld || 0) > 0) {
        throw new Error('You cannot leave while credits are held in trade-night escrow.');
      }

      const club = clubSnapshot.data();
      const ledger = club.creditLedger || {};
      const memberBalances = { ...(ledger.memberBalances || {}) };
      delete memberBalances[user.uid];
      transaction.delete(memberRef);
      transaction.update(clubRef, {
        memberCount: Math.max(0, Number(club.memberCount || 0) - 1),
        creditLedger: { ...ledger, memberBalances },
        updatedAt: serverTimestamp()
      });
    });

    return sendJson(res, 200, { ok: true, clubId });
  } catch (error) {
    console.error('leaveClub failed:', error);
    return sendJson(res, 400, { error: error.message || 'Could not leave the club.' });
  }
});

exports.autoRefundUnshippedOrders = onSchedule({ schedule: 'every 15 minutes', secrets: [stripeSecret] }, async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const snapshot = await db.collection(ORDERS_COLLECTION).where('status', '==', 'payment_held').limit(200).get();

  for (const docSnap of snapshot.docs) {
    const order = docSnap.data();
    const createdAt = order.created_at?.toMillis?.() || 0;
    if (createdAt > cutoff.toMillis() || order.tracking_number) continue;
    try {
      await refundBuyerForOrder(order.order_id || docSnap.id, { actor: 'system', resolution: 'auto_refund_unshipped_after_5_days' });
      await Promise.all([
        notifyUser(order.buyer_id, 'order_refunded', `Your order was refunded because the seller did not add tracking within five days.`, { orderId: order.order_id || docSnap.id }),
        notifyUser(order.seller_user_id, 'order_refunded', `Order ${order.order_id || docSnap.id} was refunded after the five-day shipping deadline.`, { orderId: order.order_id || docSnap.id })
      ]);
    } catch (error) {
      console.error(`autoRefundUnshippedOrders failed for ${docSnap.id}:`, error);
    }
  }
});

exports.resolveDisputedOrders = onSchedule({ schedule: 'every 15 minutes', secrets: [stripeSecret] }, async () => {
  const snapshot = await db.collection(ORDERS_COLLECTION).where('status', '==', 'disputed').limit(200).get();
  for (const docSnap of snapshot.docs) {
    const order = docSnap.data();
    const orderId = order.order_id || docSnap.id;
    const category = String(order.dispute_category || '').toLowerCase();
    const disputedAt = order.disputed_at?.toMillis?.() || order.created_at?.toMillis?.() || Date.now();
    const trackingStatus = String(order.tracking_status || '').toLowerCase();
    const buyerZip = String(order.buyer_shipping_address?.postal_code || order.buyer_shipping_zip || '').trim();
    const deliveredZip = String(order.tracking_destination_zip || '').trim();

    try {
      if (category.includes('item not received') && ['delivered', 'delivery'].includes(trackingStatus) && buyerZip && deliveredZip && buyerZip === deliveredZip) {
        await docSnap.ref.set({ status: 'payment_held', dispute_resolution: 'auto_dismissed_delivered_to_buyer_zip', payout_frozen: false, updated_at: serverTimestamp() }, { merge: true });
        const result = await releaseFundsForOrder(orderId, order.seller_id, { actor: 'system', resolution: 'auto_dismissed_delivered', allowDisputedRelease: true });
        await Promise.all([
          notifyUser(order.buyer_id, 'dispute_dismissed', 'Your dispute was dismissed because carrier data confirms delivery to your ZIP code.', { orderId }),
          notifyUser(order.seller_user_id, 'payout_released', 'Funds were released after carrier data confirmed delivery.', { orderId, transferId: result.transferId })
        ]);
      } else if (category.includes('item not received') && Date.now() - disputedAt >= 7 * 24 * 60 * 60 * 1000 && ['unknown', 'pre_transit', ''].includes(trackingStatus)) {
        await refundBuyerForOrder(orderId, { actor: 'system', resolution: 'auto_refund_no_carrier_scan_after_7_days' });
        await Promise.all([
          notifyUser(order.buyer_id, 'order_refunded', 'Your dispute was automatically refunded because no carrier scan appeared after seven days.', { orderId }),
          notifyUser(order.seller_user_id, 'order_refunded', 'The order was refunded because no carrier scan appeared after seven days.', { orderId })
        ]);
      } else if (category.includes('counterfeit') || category.includes('incorrect') || category.includes('condition') || category.includes('fake')) {
        const returnDueAt = admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 24 * 60 * 60 * 1000);
        const certification = await validateCardCertification(order);
        await docSnap.ref.set({ certification_lookup_status: certification.status, certification_lookup_result: certification, return_tracking_due_at: order.return_tracking_due_at || returnDueAt, updated_at: serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      console.error(`resolveDisputedOrders failed for ${orderId}:`, error);
    }
  }
});

exports.autoReleaseDeliveredOrders = onSchedule({ schedule: 'every 15 minutes', secrets: [stripeSecret] }, async () => {
  const cutoff = nowTimestamp();
  const snapshot = await db
    .collection(ORDERS_COLLECTION)
    .where('status', 'in', ['shipped', 'delivered'])
    .where('auto_release_at', '<=', cutoff)
    .limit(100)
    .get();

  for (const docSnap of snapshot.docs) {
    const order = docSnap.data();
    try {
      await releaseFundsForOrder(order.order_id || docSnap.id, order.seller_id, {
        actor: 'system',
        resolution: 'auto_release_after_7_days'
      });
    } catch (error) {
      console.error(`autoReleaseDeliveredOrders failed for ${docSnap.id}:`, error);
    }
  }
});

exports.createPaymentIntent = exports.createOrderPaymentIntent;
exports.releaseSellerFunds = exports.acceptDelivery;
exports.stripeCreateCheckoutSession = exports.createOrderPaymentIntent;
exports.stripeCreatePortalSession = exports.createSellerPayoutAccount;
exports.stripeWebhook = exports.stripeEscrowWebhook;