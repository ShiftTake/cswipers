import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app);
const fetchCardCompsCallable = httpsCallable(functions, 'fetchCardComps');

const CACHE_TTL_MS = 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000; // PriceCharting rate limit: 1 req/sec
const DEBOUNCE_MS = 300;

const searchCache = new Map();
let debounceTimer = null;
let lastRequestAt = 0;

function cacheKey(query, category) {
  return `${String(category || '').toLowerCase()}::${String(query || '').trim().toLowerCase()}`;
}

/**
 * Debounced, rate-limited, TTL-cached card search against fetchCardComps.
 * @param {string} query
 * @param {string} [category]
 * @returns {Promise<Array<{id:string,title:string,setName:string,imageUrl:string|null,comps:{raw:number|null,psa9:number|null,psa10:number|null}}>>}
 */
export function searchCards(query, category = '') {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return Promise.resolve([]);

  const key = cacheKey(trimmed, category);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.results);
  }

  if (debounceTimer) clearTimeout(debounceTimer);

  return new Promise((resolve, reject) => {
    debounceTimer = setTimeout(async () => {
      const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      lastRequestAt = Date.now();

      try {
        const response = await fetchCardCompsCallable({ query: trimmed, category });
        const results = response.data?.results || [];
        searchCache.set(key, { results, at: Date.now() });
        resolve(results);
      } catch (error) {
        reject(error);
      }
    }, DEBOUNCE_MS);
  });
}
