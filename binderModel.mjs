export const normalizeBinders = (items, fallbackId = 'main') => {
  const seen = new Set();
  const cleaned = (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 40) : '';
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, isDefault: Boolean(item.isDefault) }];
  });
  if (!cleaned.length) return [{ id: fallbackId, name: 'Main Binder', isDefault: true }];
  const defaultId = cleaned.find((item) => item.isDefault)?.id || cleaned[0].id;
  return cleaned.map((item) => ({ ...item, isDefault: item.id === defaultId }));
};

export const getBinderCards = (cards, binder, binders) => {
  const knownIds = new Set(binders.map((item) => item.id));
  return cards.filter((card) => card.binderId === binder.id || (
    binder.isDefault && (!card.binderId || !knownIds.has(card.binderId))
  ));
};

export const getCardValue = (card) => {
  const value = Number(String(card.tradeValue ?? card.value ?? card.avgMarketValue ?? 0).replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : 0;
};