const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();

const db = admin.firestore();

const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const shippoApiKey = defineSecret('SHIPPO_API_KEY');
const shippingWebhookSecret = defineSecret('SHIPPING_WEBHOOK_SECRET');
let stripeClient = null;

const ORDERS_COLLECTION = 'orders';
const PURCHASE_INTENTS_COLLECTION = 'purchaseIntents';
const USERS_COLLECTION = 'users';
const DEFAULT_CURRENCY = 'usd';
const PLATFORM_FEE_RATE = 0.05;
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

function platformFeeCentsFromBase(baseAmountCents) {
  return Math.round(baseAmountCents * PLATFORM_FEE_RATE);
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

  return admin.auth().verifyIdToken(token);
}

function getAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function requireAdmin(req) {
  const decodedToken = await requireAuth(req);
  const adminEmails = getAdminEmails();
  const email = String(decodedToken.email || '').toLowerCase();
  if (!email || !adminEmails.has(email)) {
    throw new Error('Admin access required.');
  }

  return decodedToken;
}

async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await db.collection(USERS_COLLECTION).doc(userId).get();
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
    orderId: order.order_id,
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
  await db.collection('notifications').add({
    userId,
    type,
    message,
    read: false,
    ...data,
    createdAt: serverTimestamp()
  });
}

async function getOrderOrThrow(orderId) {
  const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
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

  if (String(order.stripe_transfer_id || '').trim()) {
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

  const transfer = await stripe.transfers.create({
    amount: Number(order.seller_net_payout || baseAmountCents),
    currency: order.currency || DEFAULT_CURRENCY,
    destination: connectedAccountId,
    transfer_group: order.transfer_group,
    metadata: {
      orderId,
      resolution: metadata.resolution || 'standard_release',
      actor: metadata.actor || 'system'
    }
  });

  const nextOrderState = {
    seller_id: connectedAccountId,
    stripe_transfer_id: transfer.id,
    status: 'completed',
    funds_released_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  await orderRef.set(nextOrderState, { merge: true });
  await syncPurchaseIntentMirror(orderId, { ...order, ...nextOrderState });

  return {
    transferId: transfer.id,
    status: transfer.status,
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
      itemPrice,
      currency,
      orderId: requestedOrderId,
      buyerId,
      sellerConnectedAccountId,
      sellerUserId,
      sellerName,
      cardId,
      cardTitle,
      cardBrand,
      cardImageFrontUrl,
      cardImageBackUrl,
      buyerShippingAddress
    } = req.body || {};

    if (buyerId && buyerId !== decodedToken.uid) {
      return sendJson(res, 403, { error: 'buyerId must match the authenticated user.' });
    }

    const baseAmountCents = toCents(itemPrice, 'itemPrice');
    const shippingFeeCents = baseAmountCents > INSURED_SHIPPING_THRESHOLD_CENTS
      ? INSURED_SHIPPING_FEE_CENTS
      : STANDARD_SHIPPING_FEE_CENTS;
    const serviceFeeCents = platformFeeCentsFromBase(baseAmountCents);
    const taxCents = 0;
    const totalAmountCents = baseAmountCents + shippingFeeCents + serviceFeeCents + taxCents;
    const sellerNetPayoutCents = baseAmountCents + shippingFeeCents - serviceFeeCents;
    const normalizedCurrency = normalizeCurrency(currency);
    const orderId = buildOrderId(requestedOrderId);
    const transferGroup = buildTransferGroup(orderId);
    const buyerProfile = await getUserProfile(decodedToken.uid);
    const sellerProfile = await getUserProfile(sellerUserId);
    ensureTosAccepted(buyerProfile);
    if (baseAmountCents > 50000 && (!isVerifiedProfile(buyerProfile) || !isVerifiedProfile(sellerProfile))) {
      throw new Error('Buyer and seller verification are required for transactions above $500.');
    }
    const stripe = getStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: normalizedCurrency,
      automatic_payment_methods: { enabled: true },
      transfer_group: transferGroup,
      metadata: {
        orderId,
        buyerId: decodedToken.uid,
        sellerUserId: sellerUserId || '',
        sellerConnectedAccountId: String(sellerConnectedAccountId || '').trim(),
        baseAmountCents: String(baseAmountCents),
        totalAmountCents: String(totalAmountCents),
        shippingFeeCents: String(shippingFeeCents),
        serviceFeeCents: String(serviceFeeCents),
        taxCents: String(taxCents),
        pricingModel: 'separate_charges_and_transfers'
      }
    });

    const orderRecord = buildOrderRecord({
      orderId,
      buyerProfile,
      buyerId: decodedToken.uid,
      buyerEmail: decodedToken.email || buyerProfile?.email || '',
      buyerName: decodedToken.name || buyerProfile?.displayName || 'Buyer',
      sellerConnectedAccountId,
      sellerUserId,
      sellerName,
      cardId,
      cardTitle,
      cardBrand,
      cardImageFrontUrl: req.body?.cardImageFrontUrl || null,
      cardImageBackUrl: req.body?.cardImageBackUrl || null,
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

    await db.collection(ORDERS_COLLECTION).doc(orderId).set(orderRecord, { merge: true });
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
      platformFee: (serviceFeeCents / 100).toFixed(2),
      serviceFee: (serviceFeeCents / 100).toFixed(2),
      percentageFee: ((baseAmountCents * PLATFORM_FEE_RATE) / 100).toFixed(2),
      flatFee: (Math.min(PLATFORM_FLAT_FEE_CENTS, serviceFeeCents) / 100).toFixed(2),
      shippingFee: (shippingFeeCents / 100).toFixed(2),
      tax: (taxCents / 100).toFixed(2),
      totalPaid: (totalAmountCents / 100).toFixed(2),
      sellerNetPayout: (sellerNetPayoutCents / 100).toFixed(2),
      currency: normalizedCurrency,
      status: 'pending_payment'
    });
  } catch (error) {
    console.error('createOrderPaymentIntent failed:', error);
    return sendJson(res, 400, { error: error.message || 'Unable to create payment intent.' });
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

exports.stripeEscrowWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret] }, async (req, res) => {
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
    const event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);

    if (event.type === 'identity.verification_session.verified') {
      const verificationSession = event.data.object;
      const userId = String(verificationSession.metadata?.userId || '').trim();
      if (userId) {
        await db.collection(USERS_COLLECTION).doc(userId).set({
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
      await Promise.all([
        notifyUser(order.buyer_id, 'payout_released', `Funds were released for ${order.card_title || 'your order'}.`, { orderId }),
        notifyUser(order.seller_user_id, 'payout_released', `Your payout was released for ${order.card_title || 'your sale'}.`, { orderId, transferId: transfer.id })
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
    }

    return res.status(200).send('ok');
  } catch (error) {
    console.error('stripeEscrowWebhook failed:', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
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

    const result = await db.runTransaction(async (transaction) => {
      const clubRef = db.collection('clubs').doc(clubId);
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
      if (registrationSnap.exists) throw new Error('You are already registered for this trade night.');

      const member = memberSnap.data();
      const event = eventSnap.data();
      if (member.status && member.status !== 'active') throw new Error('Your club membership is not active.');
      if (String(event.status || '').toLowerCase() !== 'registration') throw new Error('Registration is closed for this trade night.');
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
        status: 'registered',
        buyInCredits,
        escrowStatus: 'held',
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