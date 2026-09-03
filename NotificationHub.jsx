import React, { useEffect, useMemo, useState } from 'react';
import { getUserOffers, respondToOffer, MAX_OFFER_ROUNDS } from './offersService';

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

function OfferStatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    countered: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    accepted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    declined: 'bg-red-500/15 text-red-300 border-red-500/30'
  };
  const label = {
    pending: 'Pending',
    countered: 'Countered',
    accepted: 'Accepted',
    declined: 'Declined'
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}>
      {label[status] || status}
    </span>
  );
}

const ORDER_STEP_LABELS = ['Offer Accepted', 'In Verification', 'Shipped', 'Completed / Payout'];

function OfferProgressBar({ offer }) {
  const needsVerification = Boolean(offer.requiresAuthentication);
  const verified = offer.verificationStatus === 'verified';
  const rejected = offer.verificationStatus === 'rejected';
  const shipped = ['shipped', 'delivered'].includes(offer.shippingStatus);
  const completed = offer.status === 'completed' || offer.shippingStatus === 'completed';

  let currentStep = 0;
  if (completed) currentStep = 3;
  else if (shipped) currentStep = 2;
  else if (needsVerification && !verified) currentStep = 1;
  else currentStep = 2;

  return (
    <div className="flex items-start pt-1">
      {ORDER_STEP_LABELS.map((label, index) => {
        const isVerificationStep = index === 1;
        const isFailed = isVerificationStep && rejected;
        const isSkipped = isVerificationStep && !needsVerification && index !== currentStep;
        const isDone = !isFailed && !isSkipped && index < currentStep;
        const isCurrent = !isFailed && !isSkipped && index === currentStep;
        const dotClass = isFailed
          ? 'bg-red-500 border-red-500'
          : isSkipped
          ? 'bg-white/10 border-white/20'
          : isDone
          ? 'bg-emerald-500 border-emerald-500'
          : isCurrent
          ? 'bg-[#E50914] border-[#E50914]'
          : 'bg-white/10 border-white/20';

        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1" style={{ width: '25%' }}>
              <span className={`w-2.5 h-2.5 rounded-full border ${dotClass}`} />
              <span className={`text-[9px] text-center leading-tight ${isCurrent || isFailed ? 'text-white font-semibold' : 'text-white/50'}`}>
                {isFailed ? 'Verification Failed' : label}
              </span>
            </div>
            {index < ORDER_STEP_LABELS.length - 1 && (
              <span className={`flex-1 h-0.5 mt-[5px] ${index < currentStep ? 'bg-emerald-500' : 'bg-white/15'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SellingOfferCard({ offer, onAccept, onDecline, onCounter, busyOfferId }) {
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterValue, setCounterValue] = useState('');
  const [counterError, setCounterError] = useState('');

  const isBusy = busyOfferId === offer.id;
  const canCounter = Number(offer.roundCount || 1) < MAX_OFFER_ROUNDS;
  const isActionable = offer.status === 'pending' || offer.status === 'countered';

  const handleSubmitCounter = () => {
    const amount = Number(counterValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCounterError('Enter a valid counter amount.');
      return;
    }
    setCounterError('');
    onCounter(offer.id, amount);
    setCounterOpen(false);
    setCounterValue('');
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{offer.cardId || 'Listing'}</p>
          <p className="text-xs text-white/60">
            Offer: {formatCurrency(offer.offerAmount)}
            {offer.counterAmount != null && ` · Countered: ${formatCurrency(offer.counterAmount)}`}
          </p>
        </div>
        <OfferStatusBadge status={offer.status} />
      </div>

      {isActionable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAccept(offer.id)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDecline(offer.id)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            Decline
          </button>
          {canCounter && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setCounterOpen((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white disabled:opacity-50"
            >
              Counter Offer
            </button>
          )}
        </div>
      )}

      {counterOpen && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={counterValue}
            onChange={(event) => setCounterValue(event.target.value)}
            placeholder="Counter amount"
            className="w-32 rounded-lg bg-black/30 border border-white/15 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSubmitCounter}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      )}
      {counterError && <p className="text-[11px] text-red-300">{counterError}</p>}
      {offer.status === 'accepted' && <OfferProgressBar offer={offer} />}
    </div>
  );
}

function BuyingOfferCard({ offer, onAcceptCounter, onDecline, busyOfferId }) {
  const isBusy = busyOfferId === offer.id;
  const isCountered = offer.status === 'countered';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{offer.cardId || 'Listing'}</p>
          <p className="text-xs text-white/60">
            Your offer: {formatCurrency(offer.offerAmount)}
            {isCountered && ` · Countered: ${formatCurrency(offer.counterAmount)}`}
          </p>
        </div>
        <OfferStatusBadge status={offer.status} />
      </div>

      {isCountered && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAcceptCounter(offer.id)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            Accept Counter
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDecline(offer.id)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}
      {offer.status === 'accepted' && <OfferProgressBar offer={offer} />}
    </div>
  );
}

export default function NotificationHub({ userId, onClose }) {
  const [activeTab, setActiveTab] = useState('selling');
  const [buyingOffers, setBuyingOffers] = useState([]);
  const [sellingOffers, setSellingOffers] = useState([]);
  const [busyOfferId, setBusyOfferId] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!userId) return undefined;
    const unsubscribe = getUserOffers(userId, ({ buying, selling }) => {
      setBuyingOffers(buying);
      setSellingOffers(selling);
    });
    return unsubscribe;
  }, [userId]);

  const pendingSellingCount = useMemo(
    () => sellingOffers.filter((offer) => offer.status === 'pending').length,
    [sellingOffers]
  );

  const runAction = async (offerId, action, counterAmount) => {
    setBusyOfferId(offerId);
    setActionError('');
    try {
      await respondToOffer({ offerId, action, counterAmount });
    } catch (error) {
      setActionError(error.message || 'Unable to update this offer right now.');
    } finally {
      setBusyOfferId(null);
    }
  };

  const offersForTab = activeTab === 'selling' ? sellingOffers : buyingOffers;

  return (
    <div className="fixed inset-0 bg-black/70 z-[67] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="notification-hub-title">
      <div className="w-full max-w-xl bg-[#171A22] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="notification-hub-title" className="text-lg font-bold text-white">Offer Notifications</h3>
            <p className="text-xs text-white/60">Manage offers you've sent and received.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-white/70 hover:text-white">
            Close
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('selling')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'selling' ? 'bg-[#E50914] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Selling{pendingSellingCount > 0 ? ` (${pendingSellingCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buying')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'buying' ? 'bg-[#E50914] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Buying
          </button>
        </div>

        {actionError && <p className="text-xs text-red-300">{actionError}</p>}

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {offersForTab.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
              {activeTab === 'selling' ? 'No offers received yet.' : 'No offers sent yet.'}
            </div>
          ) : activeTab === 'selling' ? (
            sellingOffers.map((offer) => (
              <SellingOfferCard
                key={offer.id}
                offer={offer}
                busyOfferId={busyOfferId}
                onAccept={(offerId) => runAction(offerId, 'accept')}
                onDecline={(offerId) => runAction(offerId, 'decline')}
                onCounter={(offerId, amount) => runAction(offerId, 'counter', amount)}
              />
            ))
          ) : (
            buyingOffers.map((offer) => (
              <BuyingOfferCard
                key={offer.id}
                offer={offer}
                busyOfferId={busyOfferId}
                onAcceptCounter={(offerId) => runAction(offerId, 'accept')}
                onDecline={(offerId) => runAction(offerId, 'decline')}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
