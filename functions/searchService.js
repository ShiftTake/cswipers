const provider = String(process.env.SEARCH_PROVIDER || '').trim().toLowerCase();

function getConfig() {
  if (provider === 'typesense') {
    return {
      endpoint: String(process.env.TYPESENSE_ENDPOINT || '').replace(/\/$/, ''),
      apiKey: process.env.TYPESENSE_API_KEY || '',
      collection: process.env.TYPESENSE_COLLECTION || 'listings'
    };
  }
  if (provider === 'algolia') {
    return {
      endpoint: `https://${process.env.ALGOLIA_APP_ID || ''}-dsn.algolia.net/1/indexes/${process.env.ALGOLIA_INDEX || 'listings'}`,
      apiKey: process.env.ALGOLIA_ADMIN_API_KEY || ''
    };
  }
  if (provider === 'elasticsearch') {
    return {
      endpoint: String(process.env.ELASTICSEARCH_ENDPOINT || '').replace(/\/$/, ''),
      apiKey: process.env.ELASTICSEARCH_API_KEY || '',
      index: process.env.ELASTICSEARCH_INDEX || 'listings'
    };
  }
  return null;
}

function headers(config) {
  return {
    'Content-Type': 'application/json',
    ...(config?.apiKey ? { 'X-API-Key': config.apiKey, Authorization: `Bearer ${config.apiKey}` } : {})
  };
}

async function indexListing(listingData) {
  const config = getConfig();
  if (!config) return { skipped: true, reason: 'SEARCH_PROVIDER is not configured' };
  const listing = { ...listingData, objectID: listingData.id || listingData.listing_id };
  let url;
  let method = 'POST';
  let body = listing;

  if (provider === 'typesense') {
    url = `${config.endpoint}/collections/${config.collection}/documents?action=upsert`;
  } else if (provider === 'algolia') {
    url = `${config.endpoint}/${encodeURIComponent(listing.objectID)}`;
    method = 'PUT';
  } else {
    url = `${config.endpoint}/${config.index}/_doc/${encodeURIComponent(listing.objectID)}`;
    method = 'PUT';
  }

  const response = await fetch(url, { method, headers: headers(config), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Search index request failed with ${response.status}.`);
  return { indexed: true, provider };
}

async function searchListings(query = '', filters = {}, pagination = {}) {
  const config = getConfig();
  if (!config) return { hits: [], total: 0, skipped: true };
  const page = Math.max(1, Number(pagination.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(pagination.perPage || 20)));
  let url;
  let body;

  if (provider === 'typesense') {
    const filterBy = Object.entries(filters).map(([key, value]) => `${key}:=${String(value)}`).join(' && ');
    const params = new URLSearchParams({ q: query || '*', query_by: 'set_name,card_number,condition', page: String(page), per_page: String(perPage) });
    if (filterBy) params.set('filter_by', filterBy);
    url = `${config.endpoint}/collections/${config.collection}/documents/search?${params}`;
  } else if (provider === 'algolia') {
    url = `${config.endpoint}/query`;
    body = { query, page: page - 1, hitsPerPage: perPage, filters: Object.entries(filters).map(([key, value]) => `${key}:${value}`).join(' AND ') };
  } else {
    url = `${config.endpoint}/${config.index}/_search`;
    body = { from: (page - 1) * perPage, size: perPage, query: { multi_match: { query, fields: ['set_name', 'card_number', 'condition'] } } };
  }

  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: headers(config), ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Search query failed with ${response.status}.`);
  const result = await response.json();
  if (provider === 'algolia') return { hits: result.hits || [], total: result.nbHits || 0, page, perPage };
  if (provider === 'elasticsearch') return { hits: (result.hits?.hits || []).map((hit) => hit._source), total: result.hits?.total?.value || 0, page, perPage };
  return { hits: result.hits || [], total: result.found || 0, page, perPage };
}

async function deleteListingIndex(listingId) {
  const config = getConfig();
  if (!config) return { skipped: true, reason: 'SEARCH_PROVIDER is not configured' };
  let url;
  if (provider === 'typesense') url = `${config.endpoint}/collections/${config.collection}/documents/${encodeURIComponent(listingId)}`;
  else if (provider === 'algolia') url = `${config.endpoint}/${encodeURIComponent(listingId)}`;
  else url = `${config.endpoint}/${config.index}/_doc/${encodeURIComponent(listingId)}`;
  const response = await fetch(url, { method: 'DELETE', headers: headers(config) });
  if (!response.ok && response.status !== 404) throw new Error(`Search delete failed with ${response.status}.`);
  return { deleted: true, provider };
}

module.exports = { indexListing, searchListings, deleteListingIndex };
