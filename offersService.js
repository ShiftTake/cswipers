import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, runTransaction, Timestamp, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  getClubTradeRules,
  getExpiryTimestamp,
  isTradeNightActive,
  requiresAuthenticationForAmount,
  validatePriceWithinClubRules
} from './tradeNightService';

const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OFFER_ROUNDS = 3;

const normalizeOfferAmount = (value, fieldName = 'offerAmount') => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than $0.`);
  }
  return Number(amount.toFixed(2));
};

export async function createOffer({ listingId, cardId, buyerId, sellerId, offerAmount, clubId = null }) {
  const normalizedListingId = String(listingId || '').trim();
  const normalizedCardId = String(cardId || normalizedListingId).trim();
  const normalizedBuyerId = String(buyerId || '').trim();
  const normalizedSellerId = String(sellerId || '').trim();
  const normalizedClubId = String(clubId || '').trim() || null;
  const amount = normalizeOfferAmount(offerAmount);

  if (!normalizedListingId || !normalizedCardId || !normalizedBuyerId || !normalizedSellerId) {
    throw new Error('listingId, cardId, buyerId, and sellerId are required.');
  }

  const clubRules = await getClubTradeRules(normalizedClubId);
  if (normalizedClubId) {
    validatePriceWithinClubRules(amount, clubRules);
  }
  const tradeNightActive = normalizedClubId ? await isTradeNightActive(normalizedClubId) : false;

  const offerRef = await addDoc(collection(db, 'offers'), {
    listingId: normalizedListingId,
    cardId: normalizedCardId,
    buyerId: normalizedBuyerId,
    sellerId: normalizedSellerId,
    buyerUid: normalizedBuyerId,
    sellerUid: normalizedSellerId,
    fromUserId: normalizedBuyerId,
    toUserId: normalizedSellerId,
    clubId: normalizedClubId,
    offerAmount: amount,
    amount,
    counterAmount: null,
    roundCount: 1,
    status: 'pending',
    isTradeNight: tradeNightActive,
    requiresAuthentication: false,
    expiresAt: getExpiryTimestamp(tradeNightActive),
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

  // Club-scoped governance data must be read outside the transaction since it
  // depends on external collections (clubs/events) not covered by MAX_OFFER_ROUNDS writes.
  let clubRules = null;
  let tradeNightActive = false;
  if (normalizedAction === 'counter' || normalizedAction === 'accept') {
    const preSnap = await getDoc(offerRef);
    if (!preSnap.exists()) throw new Error('Offer not found.');
    const clubId = preSnap.data()?.clubId || null;
    clubRules = await getClubTradeRules(clubId);
    if (normalizedAction === 'counter') {
      tradeNightActive = clubId ? await isTradeNightActive(clubId) : false;
    }
  }

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
      if (offer.clubId) {
        validatePriceWithinClubRules(normalizedCounterAmount, clubRules);
      }
      transaction.update(offerRef, {
        counterAmount: normalizedCounterAmount,
        roundCount: roundCount + 1,
        status: 'countered',
        isTradeNight: tradeNightActive,
        expiresAt: getExpiryTimestamp(tradeNightActive),
        updatedAt: Timestamp.now()
      });
      return;
    }

    if (normalizedAction === 'accept') {
      const finalAmount = Number(offer.counterAmount ?? offer.offerAmount ?? offer.amount ?? 0);
      const needsAuthentication = requiresAuthenticationForAmount(finalAmount, clubRules);
      const listingId = String(offer.listingId || offer.cardId || '').trim();
      if (listingId) {
        const listingRef = doc(db, 'cards', listingId);
        const listingSnap = await transaction.get(listingRef);
        if (listingSnap.exists()) {
          transaction.update(listingRef, {
            isLocked: true,
            lockedForCheckout: true,
            lockedByOfferId: normalizedOfferId,
            lockedAt: Timestamp.now(),
            requiresAuthentication: needsAuthentication,
            verificationStatus: needsAuthentication ? 'pending_verification' : 'not_required'
          });
        }
      }

      transaction.update(offerRef, {
        status: 'accepted',
        requiresAuthentication: needsAuthentication,
        updatedAt: Timestamp.now()
      });
      return;
    }

    transaction.update(offerRef, {
      status: 'declined',
      requiresAuthentication: false,
      updatedAt: Timestamp.now()
    });
  });
}

/**
 * Subscribes to real-time offers where the user is either the buyer or the seller.
 * Invokes onChange with { buying, selling } arrays whenever either side updates.
 * Returns an unsubscribe function that tears down both listeners.
 */
export function getUserOffers(userId, onChange) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || typeof onChange !== 'function') {
    return () => {};
  }

  let buying = [];
  let selling = [];

  const emit = () => {
    onChange({
      buying: [...buying].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
      selling: [...selling].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    });
  };

  const buyingQuery = query(collection(db, 'offers'), where('buyerId', '==', normalizedUserId), orderBy('createdAt', 'desc'));
  const sellingQuery = query(collection(db, 'offers'), where('sellerId', '==', normalizedUserId), orderBy('createdAt', 'desc'));

  const unsubscribeBuying = onSnapshot(buyingQuery, (snapshot) => {
    buying = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    emit();
  });

  const unsubscribeSelling = onSnapshot(sellingQuery, (snapshot) => {
    selling = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    emit();
  });

  return () => {
    unsubscribeBuying();
    unsubscribeSelling();
  };
}

export { MAX_OFFER_ROUNDS, OFFER_TTL_MS };
