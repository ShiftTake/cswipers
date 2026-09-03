import { addDoc, collection, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OFFER_ROUNDS = 3;

const buildExpiryTimestamp = () => Timestamp.fromDate(new Date(Date.now() + OFFER_TTL_MS));

const normalizeOfferAmount = (value, fieldName = 'offerAmount') => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than $0.`);
  }
  return Number(amount.toFixed(2));
};

export async function createOffer({ listingId, cardId, buyerId, sellerId, offerAmount }) {
  const normalizedListingId = String(listingId || '').trim();
  const normalizedCardId = String(cardId || normalizedListingId).trim();
  const normalizedBuyerId = String(buyerId || '').trim();
  const normalizedSellerId = String(sellerId || '').trim();
  const amount = normalizeOfferAmount(offerAmount);

  if (!normalizedListingId || !normalizedCardId || !normalizedBuyerId || !normalizedSellerId) {
    throw new Error('listingId, cardId, buyerId, and sellerId are required.');
  }

  const offerRef = await addDoc(collection(db, 'offers'), {
    listingId: normalizedListingId,
    cardId: normalizedCardId,
    buyerId: normalizedBuyerId,
    sellerId: normalizedSellerId,
    buyerUid: normalizedBuyerId,
    sellerUid: normalizedSellerId,
    fromUserId: normalizedBuyerId,
    toUserId: normalizedSellerId,
    offerAmount: amount,
    amount,
    counterAmount: null,
    roundCount: 1,
    status: 'pending',
    expiresAt: buildExpiryTimestamp(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  return offerRef.id;
}

export async function respondToOffer({ offerId, action, counterAmount }) {
  const normalizedOfferId = String(offerId || '').trim();
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!normalizedOfferId) throw new Error('offerId is required.');
  if (!['accept', 'decline', 'counter'].includes(normalizedAction)) {
    throw new Error('action must be accept, decline, or counter.');
  }

  const offerRef = doc(db, 'offers', normalizedOfferId);
  await runTransaction(db, async (transaction) => {
    const offerSnap = await transaction.get(offerRef);
    if (!offerSnap.exists()) throw new Error('Offer not found.');

    const offer = offerSnap.data() || {};
    const roundCount = Number(offer.roundCount || 1);
    if (normalizedAction === 'counter') {
      if (roundCount >= MAX_OFFER_ROUNDS) {
        throw new Error(`Counter-offers are capped at ${MAX_OFFER_ROUNDS} rounds.`);
      }
      const normalizedCounterAmount = normalizeOfferAmount(counterAmount, 'counterAmount');
      transaction.update(offerRef, {
        counterAmount: normalizedCounterAmount,
        roundCount: roundCount + 1,
        status: 'countered',
        expiresAt: buildExpiryTimestamp(),
        updatedAt: Timestamp.now()
      });
      return;
    }

    transaction.update(offerRef, {
      status: normalizedAction === 'accept' ? 'accepted' : 'declined',
      updatedAt: Timestamp.now()
    });
  });
}

export { MAX_OFFER_ROUNDS, OFFER_TTL_MS };
