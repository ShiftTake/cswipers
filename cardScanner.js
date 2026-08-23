const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2/cards';
const WIKIDATA_SEARCH_API_BASE = 'https://www.wikidata.org/w/api.php';

/**
 * @typedef {Object} ParsedCard
 * @property {string | null} cardName
 * @property {string | null} cardNumber
 * @property {string | null} setNumber
 */

/**
 * @param {string[]} lines
 * @returns {ParsedCard}
 */
export function parseCardText(lines) {
  let cardName = null;
  let cardNumber = null;
  let setNumber = null;

  const fractionRegex = /(\d{1,3})\/(\d{1,3})/;
  const hashtagRegex = /#(\d{1,3})/;

  for (const line of lines) {
    const cleanedLine = String(line || '').trim();
    if (!cleanedLine) continue;

    const fractionMatch = cleanedLine.match(fractionRegex);
    if (fractionMatch && !cardNumber) {
      cardNumber = fractionMatch[1];
      setNumber = fractionMatch[2];
      continue;
    }

    const hashMatch = cleanedLine.match(hashtagRegex);
    if (hashMatch && !cardNumber) {
      cardNumber = hashMatch[1];
      continue;
    }

    if (!cardName && /[a-zA-Z]{3,}/.test(cleanedLine) && !cleanedLine.includes('HP')) {
      cardName = cleanedLine;
    }
  }

  return { cardName, cardNumber, setNumber };
}

const pickBestPrice = (card) => {
  const tcgPrices = card?.tcgplayer?.prices || {};
  const marketValues = [
    tcgPrices?.holofoil?.market,
    tcgPrices?.reverseHolofoil?.market,
    tcgPrices?.normal?.market,
    tcgPrices?.firstEditionHolofoil?.market,
    tcgPrices?.firstEditionNormal?.market,
    card?.cardmarket?.prices?.averageSellPrice,
    card?.cardmarket?.prices?.trendPrice
  ].filter((value) => Number.isFinite(Number(value)));

  if (!marketValues.length) return '';
  const price = Number(marketValues[0]);
  return Number.isFinite(price) ? price.toFixed(2) : '';
};

const buildPokemonCardQuery = ({ cardName, cardNumber, setNumber }) => {
  const queryParts = [];

  if (cardName) {
    const escaped = cardName.replace(/"/g, '\\"').trim();
    queryParts.push(`name:\"${escaped}\"`);
  }

  if (cardNumber) {
    const normalized = String(cardNumber).replace(/^0+/, '') || cardNumber;
    queryParts.push(`number:${normalized}`);
  }

  if (setNumber) {
    queryParts.push(`set.printedTotal:${setNumber}`);
  }

  if (!queryParts.length) {
    return '';
  }

  return queryParts.join(' ');
};

const normalizeDetectedLines = (lines) => {
  return (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 120);
};

export async function fetchPokemonCardMetadata(parsedCard) {
  const query = buildPokemonCardQuery(parsedCard || {});
  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    q: query,
    pageSize: '5',
    orderBy: '-set.releaseDate'
  });

  const headers = {};
  if (import.meta.env.VITE_POKEMONTCG_API_KEY) {
    headers['X-Api-Key'] = import.meta.env.VITE_POKEMONTCG_API_KEY;
  }

  const response = await fetch(`${POKEMON_TCG_API_BASE}?${params.toString()}`, { headers });
  if (!response.ok) {
    throw new Error(`Pokemon API request failed: ${response.status}`);
  }

  const payload = await response.json();
  const card = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!card) {
    return null;
  }

  const price = pickBestPrice(card);

  return {
    title: card.name || parsedCard.cardName || '',
    brand: 'Pokemon',
    estimatedValue: price,
    cardNumber: card.number || parsedCard.cardNumber || '',
    setNumber: card?.set?.printedTotal ? String(card.set.printedTotal) : (parsedCard.setNumber || ''),
    setName: card?.set?.name || '',
    confidenceNote: 'Matched via pokemontcg.io',
    imageUrl: card?.images?.small || card?.images?.large || ''
  };
}

const inferSportsBrand = (lines = []) => {
  const haystack = normalizeDetectedLines(lines).join(' ').toLowerCase();
  if (haystack.includes('bowman')) return 'Bowman';
  if (haystack.includes('upper deck')) return 'Upper Deck';
  if (haystack.includes('panini')) return 'Panini';
  if (haystack.includes('topps')) return 'Topps';
  return '';
};

export async function fetchFallbackCardMetadata(parsedCard, detectedLines = []) {
  const cardName = String(parsedCard?.cardName || '').trim();
  if (!cardName) {
    return null;
  }

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    language: 'en',
    type: 'item',
    search: cardName,
    origin: '*'
  });

  const response = await fetch(`${WIKIDATA_SEARCH_API_BASE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Fallback metadata request failed: ${response.status}`);
  }

  const payload = await response.json();
  const result = Array.isArray(payload?.search) ? payload.search[0] : null;
  if (!result) {
    return null;
  }

  return {
    title: result.label || cardName,
    brand: inferSportsBrand(detectedLines) || '',
    estimatedValue: '',
    cardNumber: parsedCard?.cardNumber || '',
    setNumber: parsedCard?.setNumber || '',
    setName: result.description || '',
    confidenceNote: 'Matched via Wikidata fallback',
    imageUrl: ''
  };
}

export async function fetchCardMetadata(parsedCard, detectedLines = []) {
  try {
    const primary = await fetchPokemonCardMetadata(parsedCard);
    if (primary) {
      return primary;
    }
  } catch {
    // Fall through to the alternate source.
  }

  return fetchFallbackCardMetadata(parsedCard, detectedLines);
}

export function summarizeOcrLines(rawLines) {
  return normalizeDetectedLines(rawLines);
}
