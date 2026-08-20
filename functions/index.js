const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');
const { enforceRateLimit } = require('./rateLimiter');
const { indexListing, searchListings, deleteListingIndex } = require('./searchService');

admin.initializeApp();
const db = admin.firestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const MASTER_CARDS = 'masterCards';
const LISTINGS = 'listings';
const TRANSACTIONS = 'Transactions';
const NOTIFICATIONS = 'notifications';

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, stripe-signature');
}

function json(res, status, body) {
  cors(res);
  return res.status(status).json(body);
}

function authToken(req) {
  const value = String(req.headers.authorization || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function requireAuth(req) {
  const token = authToken(req);
  if (!token) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  return admin.auth().verifyIdToken(token);
}

function method(req, allowed) {
  if (req.method === 'OPTIONS') return true;
  if (!allowed.includes(req.method)) throw Object.assign(new Error('Method not allowed.'), { statusCode: 405 });
  return false;
}

function requestError(error) {
  return { status: Number(error.statusCode || 400), message: error.message || 'Request failed.' };
}

function cleanMasterCard(input = {}) {
  const masterCard = {
    set_name: String(input.set_name || '').trim(),
    card_number: String(input.card_number || '').trim(),
    rarity: String(input.rarity || '').trim(),
    release_year: Number(input.release_year),
    canonical_image_url: String(input.canonical_image_url || '').trim()
  };
  if (!masterCard.set_name || !masterCard.card_number || !masterCard.rarity || !Number.isInteger(masterCard.release_year) || !masterCard.canonical_image_url) {
    throw new Error('set_name, card_number, rarity, release_year, and canonical_image_url are required.');
  }
  return masterCard;
}

function cleanListing(input = {}, sellerId) {
  const listing = {
    seller_id: sellerId,
    master_card_id: String(input.master_card_id || '').trim(),
    condition: String(input.condition || '').trim(),
    grade_psa: input.grade_psa == null ? null : String(input.grade_psa).trim(),
    price: Number(input.price),
    status: String(input.status || 'active').trim().toLowerCase()
  };
  if (!listing.master_card_id || !listing.condition || !Number.isFinite(listing.price) || listing.price < 0) {
    throw new Error('master_card_id, condition, and a non-negative price are required.');
  }
  if (!['active', 'paused', 'sold', 'deleted'].includes(listing.status)) throw new Error('Invalid listing status.');
  return listing;
}

function listingIndexData(id, listing, masterCard) {
  return {
    id,
    listing_id: id,
    seller_id: listing.seller_id,
    master_card_id: listing.master_card_id,
    set_name: masterCard.set_name,
    card_number: masterCard.card_number,
    rarity: masterCard.rarity,
    release_year: masterCard.release_year,
    canonical_image_url: masterCard.canonical_image_url,
    condition: listing.condition,
    grade_psa: listing.grade_psa,
    price: listing.price,
    status: listing.status
  };
}

exports.createListing = onRequest(async (req, res) => {
  try {
    if (method(req, ['POST'])) return res.status(204).send('');
    const user = await requireAuth(req);
    enforceRateLimit(req, user.uid, { capacity: 12, refillPerSecond: 0.1 });
    const input = req.body || {};
    const masterCard = cleanMasterCard(input.master_card || input.masterCard);
    const listing = cleanListing(input, user.uid);
    const masterCardId = String(input.master_card_id || '').trim() || db.collection(MASTER_CARDS).doc().id;
    const masterCardRef = db.collection(MASTER_CARDS).doc(masterCardId);
    const listingRef = db.collection(LISTINGS).doc();
    const legacyCardRef = db.collection('cards').doc();
    const existingMasterCard = await masterCardRef.get();
    if (existingMasterCard.exists) {
      const existing = existingMasterCard.data();
      if (JSON.stringify(existing) !== JSON.stringify(masterCard)) throw new Error('master_card_id does not match the canonical card definition.');
    }
    const batch = db.batch();
    if (!existingMasterCard.exists) batch.create(masterCardRef, { ...masterCard, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
    batch.create(listingRef, { ...listing, master_card_id: masterCardRef.id, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
    if (input.legacy_card && typeof input.legacy_card === 'object') {
      batch.create(legacyCardRef, {
        ...input.legacy_card,
        master_card_id: masterCardRef.id,
        listing_id: listingRef.id,
        ownerUid: user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        listedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    return json(res, 201, { listing_id: listingRef.id, master_card_id: masterCardRef.id, legacy_card_id: input.legacy_card ? legacyCardRef.id : null, status: listing.status });
  } catch (error) {
    const result = requestError(error);
    if (result.status === 429) res.set('Retry-After', String(error.retryAfterSeconds || 1));
    return json(res, result.status, { error: result.message });
  }
});

exports.searchListings = onRequest(async (req, res) => {
  try {
    if (method(req, ['GET', 'POST'])) return res.status(204).send('');
    await requireAuth(req);
    const input = req.method === 'GET' ? req.query : req.body || {};
    const result = await searchListings(input.query || '', input.filters || {}, { page: input.page, perPage: input.perPage });
    return json(res, 200, result);
  } catch (error) {
    const result = requestError(error);
    return json(res, result.status, { error: result.message });
  }
});

exports.deleteListing = onRequest(async (req, res) => {
  try {
    if (method(req, ['DELETE', 'POST'])) return res.status(204).send('');
    const user = await requireAuth(req);
    enforceRateLimit(req, user.uid, { capacity: 12, refillPerSecond: 0.1 });
    const listingId = String(req.body?.listing_id || req.query.listing_id || '').trim();
    if (!listingId) throw new Error('listing_id is required.');
    const ref = db.collection(LISTINGS).doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) return json(res, 404, { error: 'Listing not found.' });
    if (snap.data().seller_id !== user.uid) return json(res, 403, { error: 'Only the seller can delete this listing.' });
    await ref.set({ status: 'deleted', updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await deleteListingIndex(listingId);
    return json(res, 200, { listing_id: listingId, status: 'deleted' });
  } catch (error) {
    const result = requestError(error);
    return json(res, result.status, { error: result.message });
  }
});

exports.createOrderCheckout = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  try {
    if (method(req, ['POST'])) return res.status(204).send('');
    const user = await requireAuth(req);
    enforceRateLimit(req, user.uid, { capacity: 5, refillPerSecond: 1 / 30 });
    const listingId = String(req.body?.listing_id || '').trim();
    if (!listingId) throw new Error('listing_id is required.');
    const listingRef = db.collection(LISTINGS).doc(listingId);
    const listingSnap = await listingRef.get();
    if (!listingSnap.exists) throw new Error('Listing not found.');
    const listing = listingSnap.data();
    if (listing.status !== 'active') throw new Error('Listing is no longer available.');
    if (listing.seller_id === user.uid) throw new Error('You cannot purchase your own listing.');
    const stripe = new Stripe(stripeSecret.value() || process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const orderId = crypto.randomUUID();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(listing.price) * 100),
      currency: String(req.body?.currency || 'usd').toLowerCase(),
      metadata: { orderId, listingId, buyerId: user.uid, sellerId: listing.seller_id },
      description: `CardSwipers listing ${listingId}`
    });
    await db.collection('orders').doc(orderId).create({ order_id: orderId, listing_id: listingId, buyer_id: user.uid, seller_id: listing.seller_id, amount: paymentIntent.amount, currency: paymentIntent.currency, stripe_payment_intent_id: paymentIntent.id, status: 'pending_payment', created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
    return json(res, 201, { order_id: orderId, payment_intent_id: paymentIntent.id, client_secret: paymentIntent.client_secret });
  } catch (error) {
    const result = requestError(error);
    if (result.status === 429) res.set('Retry-After', String(error.retryAfterSeconds || 1));
    return json(res, result.status, { error: result.message });
  }
});

exports.stripeWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret] }, async (req, res) => {
  try {
    if (method(req, ['POST'])) return res.status(204).send('');
    const stripe = new Stripe(stripeSecret.value() || process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type !== 'payment_intent.succeeded') return res.status(200).send('ok');
    const paymentIntent = event.data.object;
    const metadata = paymentIntent.metadata || {};
    const orderId = String(metadata.orderId || metadata.order_id || '').trim();
    const listingId = String(metadata.listingId || metadata.listing_id || '').trim();
    if (!orderId || !listingId) throw new Error('Payment intent is missing order or listing metadata.');
    const orderRef = db.collection('orders').doc(orderId);
    const listingRef = db.collection(LISTINGS).doc(listingId);
    const transactionRef = db.collection(TRANSACTIONS).doc(event.id);
    let notificationTargets = [];
    await db.runTransaction(async (transaction) => {
      const existingLedger = await transaction.get(transactionRef);
      if (existingLedger.exists) return;
      const orderSnap = await transaction.get(orderRef);
      const listingSnap = await transaction.get(listingRef);
      if (!orderSnap.exists || !listingSnap.exists) throw new Error('Order or listing not found for payment event.');
      const order = orderSnap.data();
      const listing = listingSnap.data();
      if (listing.status !== 'active' && listing.status !== 'sold') throw new Error('Listing cannot be fulfilled in its current state.');
      transaction.create(transactionRef, { event_id: event.id, event_type: event.type, order_id: orderId, listing_id: listingId, buyer_id: order.buyer_id, seller_id: order.seller_id, amount: paymentIntent.amount, currency: paymentIntent.currency, payment_intent_id: paymentIntent.id, created_at: admin.firestore.FieldValue.serverTimestamp() });
      transaction.set(listingRef, { status: 'sold', sold_at: admin.firestore.FieldValue.serverTimestamp(), order_id: orderId, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(orderRef, { status: 'paid', fulfilled_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      notificationTargets = [order.buyer_id, order.seller_id].filter(Boolean);
    });
    const notificationWrites = notificationTargets.map((userId) => db.collection(NOTIFICATIONS).add({ user_id: userId, type: 'order_paid', order_id: orderId, listing_id: listingId, message: 'Payment succeeded and the listing is now marked sold.', created_at: admin.firestore.FieldValue.serverTimestamp(), read: false }));
    await Promise.all(notificationWrites);
    return res.status(200).send('ok');
  } catch (error) {
    console.error('stripeWebhook failed:', error);
    return res.status(400).send(`Webhook Error: ${error.message || 'Invalid event.'}`);
  }
});

exports.indexListingOnWrite = onDocumentWritten(`${LISTINGS}/{listingId}`, async (event) => {
  const after = event.data?.after;
  const before = event.data?.before;
  if (!after?.exists) {
    if (before?.exists) await deleteListingIndex(event.params.listingId).catch((error) => console.error('Search delete failed:', error));
    return;
  }
  const listing = after.data();
  const masterCardSnap = await db.collection(MASTER_CARDS).doc(listing.master_card_id).get();
  if (!masterCardSnap.exists) return;
  await indexListing(listingIndexData(event.params.listingId, listing, masterCardSnap.data())).catch((error) => console.error('Search index failed:', error));
});

exports.migrateLegacyCard = onDocumentCreated('cards/{cardId}', async (event) => {
  const card = event.data?.data();
  if (!card || card.master_card_id) return;
  const masterCardId = db.collection(MASTER_CARDS).doc().id;
  const listingRef = db.collection(LISTINGS).doc(event.params.cardId);
  const masterCard = {
    set_name: String(card.set_name || card.brand || 'Unknown set'),
    card_number: String(card.card_number || card.number || event.params.cardId),
    rarity: String(card.rarity || 'unknown'),
    release_year: Number(card.release_year || new Date().getFullYear()),
    canonical_image_url: String(card.canonical_image_url || card.imageFrontUrl || card.imageUrl || '')
  };
  if (!masterCard.canonical_image_url) return;
  const batch = db.batch();
  batch.create(db.collection(MASTER_CARDS).doc(masterCardId), { ...masterCard, migrated_from_card_id: event.params.cardId, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
  batch.create(listingRef, { seller_id: card.ownerUid, master_card_id: masterCardId, condition: card.condition || 'Unknown', grade_psa: card.grade || null, price: Number.parseFloat(String(card.buyNowPrice || card.value || '0').replace(/[^0-9.]/g, '')) || 0, status: 'active', legacy_card_id: event.params.cardId, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });
  await batch.commit();
});
