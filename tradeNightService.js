import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from './firebase';

const OFFER_TTL_STANDARD_MS = 24 * 60 * 60 * 1000;
const OFFER_TTL_TRADE_NIGHT_MS = 15 * 60 * 1000;
const DEFAULT_AUTO_AUTH_THRESHOLD = 250;

/**
 * Checks whether a club currently has a live Trade Night event window open.
 * An event is considered active while `now` falls between its `scheduledFor`
 * timestamp and that timestamp plus its `roundMinutes` window.
 */
export async function isTradeNightActive(clubId) {
  const normalizedClubId = String(clubId || '').trim();
  if (!normalizedClubId) return false;

  const eventsQuery = query(
    collection(db, 'clubs', normalizedClubId, 'events'),
    where('status', 'in', ['active', 'registration']),
    orderBy('scheduledFor', 'desc'),
    limit(10)
  );

  const snapshot = await getDocs(eventsQuery);
  const now = Date.now();

  return snapshot.docs.some((docSnap) => {
    const event = docSnap.data() || {};
    const scheduledForMs = event.scheduledFor?.toMillis?.() ?? new Date(event.scheduledFor || 0).getTime();
    if (!Number.isFinite(scheduledForMs) || scheduledForMs <= 0) return false;
    const windowMs = Math.max(1, Number(event.roundMinutes || 10)) * 60 * 1000;
    return now >= scheduledForMs && now <= scheduledForMs + windowMs;
  });
}

/**
 * Loads a club's governance rules for offers/counter-offers, falling back to
 * permissive defaults when the club has not configured price boundaries.
 */
export async function getClubTradeRules(clubId) {
  const normalizedClubId = String(clubId || '').trim();
  if (!normalizedClubId) {
    return { minPriceFloor: null, maxPriceCeiling: null, autoAuthThreshold: DEFAULT_AUTO_AUTH_THRESHOLD };
  }

  const clubSnap = await getDoc(doc(db, 'clubs', normalizedClubId));
  const rules = (clubSnap.exists() ? clubSnap.data()?.tradeNightRules : null) || {};

  return {
    minPriceFloor: rules.minPriceFloor != null ? Number(rules.minPriceFloor) : null,
    maxPriceCeiling: rules.maxPriceCeiling != null ? Number(rules.maxPriceCeiling) : null,
    autoAuthThreshold: rules.autoAuthThreshold != null ? Number(rules.autoAuthThreshold) : DEFAULT_AUTO_AUTH_THRESHOLD
  };
}

/**
 * Throws if `amount` falls outside the club's configured price boundaries.
 */
export function validatePriceWithinClubRules(amount, rules) {
  const { minPriceFloor, maxPriceCeiling } = rules || {};
  if (minPriceFloor != null && amount < minPriceFloor) {
    throw new Error(`Offers below $${Number(minPriceFloor).toFixed(2)} are not allowed in this club.`);
  }
  if (maxPriceCeiling != null && amount > maxPriceCeiling) {
    throw new Error(`Offers above $${Number(maxPriceCeiling).toFixed(2)} are not allowed in this club.`);
  }
}

/**
 * Returns true when a final trade amount must be routed to the authentication queue.
 */
export function requiresAuthenticationForAmount(amount, rules) {
  const threshold = Number(rules?.autoAuthThreshold ?? DEFAULT_AUTO_AUTH_THRESHOLD);
  return Number(amount) >= threshold;
}

/**
 * Builds the Firestore expiry timestamp for an offer/counter based on Trade Night state.
 */
export function getExpiryTimestamp(isTradeNight) {
  const ttl = isTradeNight ? OFFER_TTL_TRADE_NIGHT_MS : OFFER_TTL_STANDARD_MS;
  return Timestamp.fromDate(new Date(Date.now() + ttl));
}

export { OFFER_TTL_STANDARD_MS, OFFER_TTL_TRADE_NIGHT_MS, DEFAULT_AUTO_AUTH_THRESHOLD };
