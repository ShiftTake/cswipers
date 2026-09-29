const PLATFORM_FEE_RATE = 0.03;
const MAX_COMMUNITY_FEE_RATE = 0.07;
const MAX_TOTAL_RAKE_RATE = 0.10;

function calculateTransactionAmounts({
  baseAmountCents,
  shippingFeeCents,
  communityFeeRate = 0,
  clubShareRate = 0.5
}) {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
    throw new Error('baseAmountCents must be a positive integer.');
  }
  if (!Number.isSafeInteger(shippingFeeCents) || shippingFeeCents < 0) {
    throw new Error('shippingFeeCents must be a non-negative integer.');
  }
  if (!Number.isFinite(communityFeeRate) || communityFeeRate < 0 || communityFeeRate > MAX_COMMUNITY_FEE_RATE) {
    throw new Error('communityFeeRate must be between 0% and 7%.');
  }
  if (PLATFORM_FEE_RATE + communityFeeRate > MAX_TOTAL_RAKE_RATE) {
    throw new Error('Total rake cannot exceed 10%.');
  }
  if (!Number.isFinite(clubShareRate) || clubShareRate < 0 || clubShareRate > 1) {
    throw new Error('clubShareRate must be between 0 and 1.');
  }

  const platformFeeCents = Math.round(baseAmountCents * PLATFORM_FEE_RATE);
  const communityFeeCents = Math.round(baseAmountCents * communityFeeRate);
  const serviceFeeCents = platformFeeCents + communityFeeCents;
  const clubShareCents = Math.round(communityFeeCents * clubShareRate);
  const agentShareCents = communityFeeCents - clubShareCents;
  const totalAmountCents = baseAmountCents + shippingFeeCents + serviceFeeCents;
  const sellerNetPayoutCents = baseAmountCents + shippingFeeCents;

  return {
    platformFeeCents,
    communityFeeCents,
    serviceFeeCents,
    clubShareCents,
    agentShareCents,
    totalAmountCents,
    sellerNetPayoutCents,
    totalRakeRate: PLATFORM_FEE_RATE + communityFeeRate
  };
}

function buildPayoutPlan({
  sellerAmountCents,
  sellerAccountId,
  clubAmountCents = 0,
  clubAccountId = '',
  agentAmountCents = 0,
  agentAccountId = ''
}) {
  const entries = [
    { type: 'seller', amountCents: sellerAmountCents, accountId: sellerAccountId },
    { type: 'club', amountCents: clubAmountCents, accountId: clubAccountId },
    { type: 'agent', amountCents: agentAmountCents, accountId: agentAccountId }
  ];

  return entries.filter((entry) => entry.amountCents > 0).map((entry) => {
    if (!Number.isSafeInteger(entry.amountCents)) throw new Error(`${entry.type} payout must be an integer number of cents.`);
    if (!String(entry.accountId || '').startsWith('acct_')) throw new Error(`${entry.type} payout account is not connected.`);
    return entry;
  });
}

function resolveListingFeeAttribution({ cardOwnerUid, sellerUid, cardClubId, sellerMembership, agentMembership }) {
  if (!sellerUid || cardOwnerUid !== sellerUid) throw new Error('Only the card owner can start checkout.');
  if (!cardClubId) return { clubId: null, agentUid: null };
  if (!sellerMembership || (sellerMembership.status && sellerMembership.status !== 'active')) {
    throw new Error('The seller must have an active membership in the listing club.');
  }

  const role = String(sellerMembership.role || 'member').toLowerCase();
  const agentUid = role === 'agent' ? sellerUid : String(sellerMembership.agentUid || '').trim();
  if (agentUid && (
    !agentMembership ||
    String(agentMembership.role || '').toLowerCase() !== 'agent' ||
    (agentMembership.status && agentMembership.status !== 'active')
  )) {
    throw new Error('The seller assigned to this listing does not have an active club agent.');
  }

  return { clubId: cardClubId, agentUid: agentUid || null };
}

function parsePriceCents(value) {
  const normalized = String(value ?? '').replace(/[^\d.]/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A valid positive card price is required.');
  return Math.round(amount * 100);
}

function resolveCheckoutPrice({ card, buyerUid, sellerUid, offer = null, feeOnly = false }) {
  if (!card || card.ownerUid !== sellerUid) throw new Error('The selected card does not belong to this seller.');
  if (!buyerUid || buyerUid === sellerUid) throw new Error('A card owner cannot purchase their own listing.');
  if (feeOnly) return { baseAmountCents: 0, feeOnly: true };

  if (offer) {
    if (offer.status !== 'accepted') throw new Error('The offer must be accepted before checkout.');
    if (offer.buyerUid !== buyerUid || offer.sellerUid !== sellerUid) throw new Error('Offer participants do not match checkout.');
    if (offer.cardId !== card.id) throw new Error('The offer card does not match checkout.');
    if (!['cash_sale', 'hybrid_trade'].includes(String(offer.dealType || '').toLowerCase())) {
      throw new Error('This offer does not include a payable cash amount.');
    }
    return { baseAmountCents: parsePriceCents(offer.cashAmount ?? offer.amount), feeOnly: false };
  }

  if (!['sale_only', 'trade_and_sale'].includes(String(card.saleMode || 'trade_and_sale').toLowerCase())) {
    throw new Error('This card is not listed for sale.');
  }
  return {
    baseAmountCents: parsePriceCents(card.buyNowPrice || card.tradeValue || card.value),
    feeOnly: false
  };
}

module.exports = {
  calculateTransactionAmounts,
  buildPayoutPlan,
  resolveListingFeeAttribution,
  resolveCheckoutPrice
};
