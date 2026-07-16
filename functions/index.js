const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');

admin.initializeApp();

const db = admin.firestore();
const stripeSecret = defineSecret('STRIPE_SECRET_KEY');

const ORDERS_COLLECTION = 'paymentOrders';
const DEFAULT_CURRENCY = 'usd';
const PLATFORM_FEE_RATE = 0.02;
const PURCHASE_INTENTS_COLLECTION = 'purchaseIntents';

function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  return res.status(statusCode).json(payload);
}

function getStripeClient() {
  const secret = stripeSecret.value() || process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('Missing STRIPE_SECRET_KEY secret.');
  }

  return new Stripe(secret, {
    apiVersion: '2024-06-20'
  });
}

function toCents(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error('itemPrice must be a positive number.');
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

function assertPost(req) {
  if (req.method === 'OPTIONS') {
    return 'options';
  }

  if (req.method !== 'POST') {
    throw new Error('Method not allowed.');
  }

  return null;
}

exports.createPaymentIntent = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertPost(req) === 'options') {
    return res.status(204).send('');
  }

  try {
    const { itemPrice, currency, orderId: requestedOrderId } = req.body || {};
    const baseItemPriceCents = toCents(itemPrice);
    const totalChargeCents = Math.round(baseItemPriceCents * 1.02);
    const platformFeeCents = totalChargeCents - baseItemPriceCents;
    const orderId = buildOrderId(requestedOrderId);
    const transferGroup = buildTransferGroup(orderId);
    const normalizedCurrency = normalizeCurrency(currency);
    const stripe = getStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalChargeCents,
      currency: normalizedCurrency,
      automatic_payment_methods: {
        enabled: true
      },
      transfer_group: transferGroup,
      metadata: {
        orderId,
        transferGroup,
        baseItemPriceCents: String(baseItemPriceCents),
        totalChargeCents: String(totalChargeCents),
        platformFeeCents: String(platformFeeCents),
        pricingModel: 'separate_charges_and_transfers'
      }
    });

    await db.collection(ORDERS_COLLECTION).doc(orderId).set(
      {
        orderId,
        transferGroup,
        currency: normalizedCurrency,
        baseItemPriceCents,
        totalChargeCents,
        platformFeeCents,
        paymentIntentId: paymentIntent.id,
        paymentIntentStatus: paymentIntent.status,
        sellerConnectedAccountId: null,
        sellerTransferId: null,
        sellerTransferAmountCents: null,
        status: 'payment_intent_created',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return sendJson(res, 200, {
      orderId,
      transferGroup,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      baseItemPrice: (baseItemPriceCents / 100).toFixed(2),
      totalCharge: (totalChargeCents / 100).toFixed(2),
      platformFee: (platformFeeCents / 100).toFixed(2),
      currency: normalizedCurrency
    });
  } catch (error) {
    console.error('createPaymentIntent failed:', error);
    return sendJson(res, 400, {
      error: error.message || 'Unable to create payment intent.'
    });
  }
});

exports.releaseSellerFunds = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertPost(req) === 'options') {
    return res.status(204).send('');
  }

  try {
    const { orderId: rawOrderId, connectedAccountId } = req.body || {};
    const orderId = buildOrderId(rawOrderId);

    if (!connectedAccountId || !String(connectedAccountId).trim().startsWith('acct_')) {
      return sendJson(res, 400, {
        error: 'connectedAccountId must be a valid Stripe connected account id.'
      });
    }

    const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return sendJson(res, 404, {
        error: 'No payment order was found for that orderId.'
      });
    }

    const order = orderSnap.data();
    const baseItemPriceCents = Number(order.baseItemPriceCents || 0);
    const transferGroup = order.transferGroup || buildTransferGroup(orderId);
    const normalizedCurrency = normalizeCurrency(order.currency || DEFAULT_CURRENCY);

    if (String(order.sellerTransferId || '').trim()) {
      return sendJson(res, 200, {
        orderId,
        transferId: order.sellerTransferId,
        transferGroup,
        status: 'funds_already_released'
      });
    }

    if (!baseItemPriceCents || baseItemPriceCents <= 0) {
      return sendJson(res, 400, {
        error: 'Stored base item price is missing or invalid for this order.'
      });
    }

    if (order.paymentIntentId) {
      const stripe = getStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return sendJson(res, 409, {
          error: `PaymentIntent must be succeeded before releasing funds. Current status: ${paymentIntent.status}.`
        });
      }
    }

    const stripe = getStripeClient();
    const transfer = await stripe.transfers.create({
      amount: baseItemPriceCents,
      currency: normalizedCurrency,
      destination: String(connectedAccountId).trim(),
      transfer_group: transferGroup,
      metadata: {
        orderId,
        paymentIntentId: order.paymentIntentId || '',
        pricingModel: 'separate_charges_and_transfers'
      }
    });

    await orderRef.set(
      {
        sellerConnectedAccountId: String(connectedAccountId).trim(),
        sellerTransferId: transfer.id,
        sellerTransferAmountCents: baseItemPriceCents,
        sellerTransferStatus: transfer.status,
        status: 'funds_released',
        fundsReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return sendJson(res, 200, {
      orderId,
      transferId: transfer.id,
      transferGroup,
      sellerConnectedAccountId: connectedAccountId,
      transferredAmount: (baseItemPriceCents / 100).toFixed(2),
      currency: normalizedCurrency,
      status: transfer.status
    });
  } catch (error) {
    console.error('releaseSellerFunds failed:', error);
    return sendJson(res, 400, {
      error: error.message || 'Unable to release seller funds.'
    });
  }
});

exports.submitTracking = onRequest({ secrets: [stripeSecret] }, async (req, res) => {
  setCorsHeaders(res);

  if (assertPost(req) === 'options') {
    return res.status(204).send('');
  }

  try {
    const { orderId: rawOrderId, carrier, trackingNumber, trackingUrl } = req.body || {};
    const orderId = buildOrderId(rawOrderId);
    const normalizedCarrier = String(carrier || '').trim();
    const normalizedTrackingNumber = String(trackingNumber || '').trim();
    const normalizedTrackingUrl = String(trackingUrl || '').trim();

    if (!normalizedCarrier || !normalizedTrackingNumber) {
      return sendJson(res, 400, {
        error: 'carrier and trackingNumber are required.'
      });
    }

    const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return sendJson(res, 404, {
        error: 'No payment order was found for that orderId.'
      });
    }

    const orderUpdate = {
      shippingCarrier: normalizedCarrier,
      trackingNumber: normalizedTrackingNumber,
      trackingUrl: normalizedTrackingUrl || null,
      shipmentStatus: 'tracking_submitted',
      status: 'tracking_submitted',
      shippedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await orderRef.set(orderUpdate, { merge: true });

    const purchaseIntentRef = db.collection(PURCHASE_INTENTS_COLLECTION).doc(orderId);
    const purchaseIntentSnap = await purchaseIntentRef.get();
    if (purchaseIntentSnap.exists) {
      await purchaseIntentRef.set(
        {
          shippingCarrier: normalizedCarrier,
          trackingNumber: normalizedTrackingNumber,
          trackingUrl: normalizedTrackingUrl || null,
          shipmentStatus: 'tracking_submitted',
          escrowStatus: 'shipped',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return sendJson(res, 200, {
      orderId,
      carrier: normalizedCarrier,
      trackingNumber: normalizedTrackingNumber,
      trackingUrl: normalizedTrackingUrl || null,
      status: 'tracking_submitted'
    });
  } catch (error) {
    console.error('submitTracking failed:', error);
    return sendJson(res, 400, {
      error: error.message || 'Unable to submit tracking details.'
    });
  }
});