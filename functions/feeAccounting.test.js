const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPayoutPlan,
  calculateTransactionAmounts,
  resolveCheckoutPrice,
  resolveListingFeeAttribution
} = require('./feeAccounting');

test('charges 3% once while returning item and shipping proceeds to the seller', () => {
  const amounts = calculateTransactionAmounts({
    baseAmountCents: 100000,
    shippingFeeCents: 1299
  });

  assert.equal(amounts.platformFeeCents, 3000);
  assert.equal(amounts.communityFeeCents, 0);
  assert.equal(amounts.totalAmountCents, 104299);
  assert.equal(amounts.sellerNetPayoutCents, 101299);
  assert.equal(amounts.totalAmountCents - amounts.sellerNetPayoutCents, amounts.serviceFeeCents);
});

test('splits a 7.5% total rake without charging it twice', () => {
  const amounts = calculateTransactionAmounts({
    baseAmountCents: 100000,
    shippingFeeCents: 1299,
    communityFeeRate: 0.045,
    clubShareRate: 0.5
  });

  assert.equal(amounts.platformFeeCents, 3000);
  assert.equal(amounts.communityFeeCents, 4500);
  assert.equal(amounts.clubShareCents, 2250);
  assert.equal(amounts.agentShareCents, 2250);
  assert.equal(amounts.totalAmountCents, 108799);
  assert.equal(amounts.sellerNetPayoutCents, 101299);
  assert.equal(amounts.totalAmountCents - amounts.sellerNetPayoutCents, 7500);
  assert.equal(amounts.clubShareCents + amounts.agentShareCents, amounts.communityFeeCents);
});

test('rejects a community rate above the allowed maximum', () => {
  assert.throws(() => calculateTransactionAmounts({
    baseAmountCents: 100000,
    shippingFeeCents: 0,
    communityFeeRate: 0.071
  }), /between 0% and 7%/);
});

  test('routes seller, club, and agent amounts to their connected accounts', () => {
    const plan = buildPayoutPlan({
      sellerAmountCents: 101299,
      sellerAccountId: 'acct_seller',
      clubAmountCents: 2250,
      clubAccountId: 'acct_club',
      agentAmountCents: 2250,
      agentAccountId: 'acct_agent'
    });

    assert.deepEqual(plan.map(({ type, amountCents }) => ({ type, amountCents })), [
      { type: 'seller', amountCents: 101299 },
      { type: 'club', amountCents: 2250 },
      { type: 'agent', amountCents: 2250 }
    ]);
  });

  test('does not allow a nonzero community share without a connected account', () => {
    assert.throws(() => buildPayoutPlan({
      sellerAmountCents: 101299,
      sellerAccountId: 'acct_seller',
      clubAmountCents: 2250,
      clubAccountId: ''
    }), /club payout account is not connected/);
  });

    test('derives the fee club and agent from the seller-owned listing membership', () => {
      assert.deepEqual(resolveListingFeeAttribution({
        cardOwnerUid: 'seller-1',
        sellerUid: 'seller-1',
        cardClubId: 'club-1',
        sellerMembership: { role: 'member', agentUid: 'agent-1', status: 'active' },
        agentMembership: { role: 'agent', status: 'active' }
      }), { clubId: 'club-1', agentUid: 'agent-1' });
    });

    test('rejects buyer-supplied club attribution when the seller is not a club member', () => {
      assert.throws(() => resolveListingFeeAttribution({
        cardOwnerUid: 'seller-1',
        sellerUid: 'seller-1',
        cardClubId: 'club-1',
        sellerMembership: null,
        agentMembership: null
      }), /active membership/);
    });

    test('rejects checkout when the caller is not the card owner', () => {
      assert.throws(() => resolveListingFeeAttribution({
        cardOwnerUid: 'seller-1',
        sellerUid: 'attacker-1',
        cardClubId: 'club-1',
        sellerMembership: { role: 'member', status: 'active' },
        agentMembership: null
      }), /Only the card owner/);
    });

    test('routes an agent seller through their own active club agent record', () => {
      assert.deepEqual(resolveListingFeeAttribution({
        cardOwnerUid: 'agent-1',
        sellerUid: 'agent-1',
        cardClubId: 'club-1',
        sellerMembership: { role: 'agent', status: 'active' },
        agentMembership: { role: 'agent', status: 'active' }
      }), { clubId: 'club-1', agentUid: 'agent-1' });
    });

    test('prices direct checkout from the saved listing instead of the client amount', () => {
      const result = resolveCheckoutPrice({
        card: { id: 'card-1', ownerUid: 'seller-1', saleMode: 'trade_and_sale', buyNowPrice: '$725.50' },
        buyerUid: 'buyer-1',
        sellerUid: 'seller-1'
      });
      assert.equal(result.baseAmountCents, 72550);
    });

    test('uses the accepted offer amount and verifies buyer, seller, and card', () => {
      const result = resolveCheckoutPrice({
        card: { id: 'card-1', ownerUid: 'seller-1', saleMode: 'trade_and_sale', buyNowPrice: '$900' },
        buyerUid: 'buyer-1',
        sellerUid: 'seller-1',
        offer: {
          id: 'offer-1',
          status: 'accepted',
          buyerUid: 'buyer-1',
          sellerUid: 'seller-1',
          cardId: 'card-1',
          dealType: 'hybrid_trade',
          cashAmount: 400
        }
      });
      assert.equal(result.baseAmountCents, 40000);
    });

    test('rejects unaccepted or mismatched offers and trade-only checkouts', () => {
      const card = { id: 'card-1', ownerUid: 'seller-1', saleMode: 'trade_and_sale', buyNowPrice: '$900' };
      const offer = {
        status: 'pending',
        buyerUid: 'buyer-1',
        sellerUid: 'seller-1',
        cardId: 'card-1',
        dealType: 'hybrid_trade',
        cashAmount: 400
      };
      assert.throws(() => resolveCheckoutPrice({ card, buyerUid: 'buyer-1', sellerUid: 'seller-1', offer }), /must be accepted/);
      assert.throws(() => resolveCheckoutPrice({
        card,
        buyerUid: 'attacker',
        sellerUid: 'seller-1',
        offer: { ...offer, status: 'accepted' }
      }), /participants do not match/);
      assert.throws(() => resolveCheckoutPrice({
        card,
        buyerUid: 'buyer-1',
        sellerUid: 'seller-1',
        offer: { ...offer, status: 'accepted', dealType: 'pure_trade' }
      }), /does not include a payable cash amount/);
    });

    test('rejects self-purchase of a listing', () => {
      assert.throws(() => resolveCheckoutPrice({
        card: { id: 'card-1', ownerUid: 'seller-1', saleMode: 'sale_only', buyNowPrice: '$900' },
        buyerUid: 'seller-1',
        sellerUid: 'seller-1'
      }), /cannot purchase their own listing/);
    });