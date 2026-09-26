import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const TRADE_NIGHT_DEFAULT_MIN_BINDER_VALUE = 500;
export const TRADE_NIGHT_DEFAULT_MIN_CARD_COUNT = 6;
const BOOT_REASON_MAX = 280;

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const parseDollarValue = (value) => {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const getInitials = (value = 'T') => String(value).replace(/^@+/, '').slice(0, 2).toUpperCase() || 'T';

export const getEntryCriteria = (event = {}) => ({
  minBinderValue: Math.max(0, Number(event.entryCriteria?.minBinderValue ?? TRADE_NIGHT_DEFAULT_MIN_BINDER_VALUE)),
  minCardCount: Math.max(0, Math.floor(Number(event.entryCriteria?.minCardCount ?? TRADE_NIGHT_DEFAULT_MIN_CARD_COUNT)))
});

export const evaluateBinderCriteria = (cards, criteria) => {
  const totalValue = cards.reduce((sum, card) => sum + Number(card.value || 0), 0);
  const missing = [];
  if (cards.length < criteria.minCardCount) {
    missing.push(`Add ${criteria.minCardCount - cards.length} more card(s) — minimum ${criteria.minCardCount} cards so you have inventory for a full orbit.`);
  }
  if (totalValue < criteria.minBinderValue) {
    missing.push(`Add ${formatMoney(criteria.minBinderValue - totalValue)} more in value — minimum binder total is ${formatMoney(criteria.minBinderValue)}.`);
  }
  return { ok: missing.length === 0, missing, totalValue, cardCount: cards.length };
};

const getTableTurn = (table = {}) => {
  const seats = table.seats || [];
  if (seats.length < 2) return { vendorUid: seats[0] || null, recipientUid: null, dealerSeat: 0 };
  const dealerSeat = ((table.dealerSeat || 0) % seats.length + seats.length) % seats.length;
  const offset = Math.min(Math.max(1, table.targetOffset || 1), seats.length - 1);
  return { vendorUid: seats[dealerSeat], recipientUid: seats[(dealerSeat + offset) % seats.length], dealerSeat };
};

function CountdownBar({ remainingMs, totalMs }) {
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${progress * 100}%`, backgroundColor: `hsl(${Math.round(progress * 120)} 85% 50%)` }}
      />
    </div>
  );
}

function BootIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 3h5v8l6 3a3 3 0 0 1 3 3v2H4v-3l3-2z" />
      <path d="M4 21h17" />
    </svg>
  );
}

function MiniCard({ card, pulsing = false }) {
  return (
    <div className={`relative w-16 shrink-0 overflow-hidden rounded-lg border border-white/30 bg-white text-black shadow-lg sm:w-20 ${pulsing ? 'cs-deal-pulse' : ''}`}>
      <div className="aspect-[5/7] w-full bg-slate-200">
        {card.imageUrl ? <img src={card.imageUrl} alt={card.name || 'Card'} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="px-1 py-0.5">
        <p className="truncate text-[9px] font-bold leading-tight">{card.name || 'Card'}</p>
        <p className="text-[9px] font-black text-emerald-700">{formatMoney(card.value)}</p>
      </div>
    </div>
  );
}

export function TradeNightEntryModal({ event, currentUid, busy, onCancel, onSubmit }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showRequirements, setShowRequirements] = useState(false);
  const criteria = getEntryCriteria(event);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'cards'), where('ownerUid', '==', currentUid), limit(100)))
      .then((snapshot) => {
        if (cancelled) return;
        const loaded = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || data.title || 'Card',
            imageUrl: data.imageFrontUrl || data.imageUrl || '',
            value: parseDollarValue(data.tradeValue || data.value || data.avgMarketValue)
          };
        });
        setCards(loaded);
        setSelectedIds(loaded.map((card) => card.id));
      })
      .catch((error) => console.error('Failed loading entry binder:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUid]);

  const selectedCards = cards.filter((card) => selectedIds.includes(card.id));
  const check = evaluateBinderCriteria(selectedCards, criteria);

  const toggle = (cardId) => setSelectedIds((previous) => (
    previous.includes(cardId) ? previous.filter((id) => id !== cardId) : [...previous, cardId]
  ));

  const handleEnter = () => {
    if (!check.ok) {
      setShowRequirements(true);
      return;
    }
    onSubmit(selectedIds);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl border border-white/10 bg-[#0D1117] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Select Entry Binder</p>
        <h3 className="mt-1 text-lg font-black">{event.title || 'Trade Night'}</h3>
        <p className="mt-1 text-xs text-white/60">
          Requirements: at least {criteria.minCardCount} cards and {formatMoney(criteria.minBinderValue)} total value.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded-xl border px-3 py-2 ${check.cardCount >= criteria.minCardCount ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-red-400/40 bg-red-500/10'}`}>
            <p className="text-white/55">Cards</p>
            <p className="text-base font-black">{check.cardCount} / {criteria.minCardCount}</p>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${check.totalValue >= criteria.minBinderValue ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-red-400/40 bg-red-500/10'}`}>
            <p className="text-white/55">Binder value</p>
            <p className="text-base font-black">{formatMoney(check.totalValue)} / {formatMoney(criteria.minBinderValue)}</p>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-white/60">Loading your binder...</p>
          ) : cards.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/60">Your binder is empty. Post cards to build an entry binder.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {cards.map((card) => {
                const selected = selectedIds.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggle(card.id)}
                    aria-pressed={selected}
                    className={`overflow-hidden rounded-xl border text-left ${selected ? 'border-emerald-400 ring-2 ring-emerald-400/40' : 'border-white/10 opacity-60'}`}
                  >
                    <div className="aspect-[5/7] bg-white/5">
                      {card.imageUrl ? <img src={card.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="truncate text-[10px] font-semibold">{card.name}</p>
                      <p className="text-[10px] text-emerald-300">{formatMoney(card.value)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold">Cancel</button>
          <button
            type="button"
            onClick={handleEnter}
            disabled={busy || loading}
            aria-disabled={!check.ok}
            className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${check.ok ? 'bg-[#E11D48] hover:bg-[#BE123C]' : 'cursor-not-allowed bg-white/10 text-white/45'} disabled:opacity-60`}
          >
            {busy ? 'Registering...' : 'Enter Trade Night'}
          </button>
        </div>
      </div>

      {showRequirements && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-red-400/30 bg-[#161B22] p-4">
            <h4 className="text-base font-black text-red-200">Binder doesn't meet entry requirements</h4>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-white/80">
              {check.missing.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <button type="button" onClick={() => setShowRequirements(false)} className="mt-4 min-h-11 w-full rounded-xl bg-white/10 text-sm font-bold hover:bg-white/20">Update Binder</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DealComposer({ myCards, theirCards, initial, isVendor, counterpartName, busy, onCancel, onSubmit }) {
  const [myIds, setMyIds] = useState(isVendor ? initial.vendorCardIds || [] : initial.recipientCardIds || []);
  const [theirIds, setTheirIds] = useState(isVendor ? initial.recipientCardIds || [] : initial.vendorCardIds || []);
  const [note, setNote] = useState(initial.note || '');

  const toggle = (setter) => (cardId) => setter((previous) => (
    previous.includes(cardId) ? previous.filter((id) => id !== cardId) : [...previous, cardId].slice(0, 20)
  ));
  const myValue = myCards.filter((card) => myIds.includes(card.id)).reduce((sum, card) => sum + card.value, 0);
  const theirValue = theirCards.filter((card) => theirIds.includes(card.id)).reduce((sum, card) => sum + card.value, 0);

  const renderGrid = (cards, ids, onToggle) => (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cards.length === 0 ? <p className="text-xs text-white/50">No cards in entry binder.</p> : cards.map((card) => (
        <button key={card.id} type="button" onClick={() => onToggle(card.id)} aria-pressed={ids.includes(card.id)} className={`shrink-0 rounded-lg ${ids.includes(card.id) ? 'ring-2 ring-amber-300' : 'opacity-55'}`}>
          <MiniCard card={card} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0D1117] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h4 className="text-base font-black">{initial.vendorCardIds?.length || initial.recipientCardIds?.length ? 'Counter / Propose Trade' : 'Propose Deal'} · {counterpartName}</h4>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/50">You give · {formatMoney(myValue)}</p>
        <div className="mt-1.5">{renderGrid(myCards, myIds, toggle(setMyIds))}</div>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/50">You get · {formatMoney(theirValue)}</p>
        <div className="mt-1.5">{renderGrid(theirCards, theirIds, toggle(setTheirIds))}</div>
        <input
          type="text"
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note"
          className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-base focus:border-white/35 focus:outline-none"
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold">Cancel</button>
          <button
            type="button"
            disabled={busy || (!myIds.length && !theirIds.length)}
            onClick={() => onSubmit(isVendor ? { vendorCardIds: myIds, recipientCardIds: theirIds, note } : { vendorCardIds: theirIds, recipientCardIds: myIds, note })}
            className="min-h-11 flex-1 rounded-xl bg-amber-400 text-sm font-black text-black disabled:opacity-50"
          >
            {busy ? 'Sending...' : 'Send Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TradeNightTable({ clubId, event, registrations, members, currentUid, canModerate, apiPost, onClose }) {
  const [now, setNow] = useState(Date.now());
  const [deal, setDeal] = useState(null);
  const [bootVotes, setBootVotes] = useState({});
  const [selectedSeatUid, setSelectedSeatUid] = useState('');
  const [bootTarget, setBootTarget] = useState(null);
  const [bootReason, setBootReason] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const expireKeyRef = useRef('');

  const table = event.table || {};
  const isLive = String(event.status || '').toLowerCase() === 'live';
  const bootedUids = event.bootedUids || [];
  const isBooted = bootedUids.includes(currentUid);

  const registrationByUid = useMemo(() => {
    const map = new Map();
    registrations.forEach((registration) => map.set(registration.userId || registration.id, registration));
    return map;
  }, [registrations]);

  const seats = isLive
    ? table.seats || []
    : registrations.filter((registration) => registration.status !== 'booted').map((registration) => registration.userId || registration.id);
  const { vendorUid, recipientUid, dealerSeat } = isLive ? getTableTurn(table) : { vendorUid: null, recipientUid: null, dealerSeat: 0 };
  const activeDeal = deal && deal.status === 'pending' && deal.id === table.activeDealId ? deal : null;
  const dealVendorUid = activeDeal?.vendorUid || vendorUid;
  const dealRecipientUid = activeDeal?.recipientUid || recipientUid;
  const isParticipant = currentUid === dealVendorUid || currentUid === dealRecipientUid;
  const isAwaiting = activeDeal ? activeDeal.awaitingUid === currentUid : currentUid === vendorUid;

  const turnEndsAt = activeDeal ? toMillis(activeDeal.expiresAt) : toMillis(table.turnExpiresAt);
  const remainingMs = Math.max(0, turnEndsAt - now);
  const totalMs = activeDeal ? 45000 : 30000;
  const totalBinderPool = seats.reduce((sum, uid) => sum + Number(registrationByUid.get(uid)?.binderValue || 0), 0);

  const getSeatName = (uid) => {
    const registration = registrationByUid.get(uid) || {};
    const member = members.find((entry) => entry.uid === uid) || {};
    const username = registration.username || member.username;
    return username ? `@${username}` : registration.displayName || member.displayName || 'Trader';
  };
  const getSeatImage = (uid) => registrationByUid.get(uid)?.profileImageUrl || members.find((entry) => entry.uid === uid)?.profileImageUrl || '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!table.activeDealId) {
      setDeal(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'clubs', clubId, 'events', event.id, 'deals', table.activeDealId),
      (snapshot) => setDeal(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
      (snapshotError) => console.error('Failed loading active deal:', snapshotError)
    );
  }, [clubId, event.id, table.activeDealId]);

  useEffect(() => {
    if (!isLive) return undefined;
    return onSnapshot(
      collection(db, 'clubs', clubId, 'events', event.id, 'bootVotes'),
      (snapshot) => {
        const next = {};
        snapshot.docs.forEach((docSnap) => { next[docSnap.id] = docSnap.data(); });
        setBootVotes(next);
      },
      (snapshotError) => console.error('Failed loading boot votes:', snapshotError)
    );
  }, [clubId, event.id, isLive]);

  const runAction = async (action, extra = {}) => {
    setBusy(action);
    setError('');
    try {
      await apiPost('/api/clubs/trade-night-action', { clubId, eventId: event.id, action, ...extra });
      return true;
    } catch (actionError) {
      if (action !== 'expire') setError(actionError.message || 'Table action failed.');
      return false;
    } finally {
      setBusy('');
    }
  };

  // Deal participants expire the clock first; the rest of the table acts as a fallback if they drop.
  useEffect(() => {
    if (!isLive || isBooted || !seats.includes(currentUid) || !turnEndsAt) return;
    const graceMs = isParticipant ? 1000 : 5000;
    const key = `${table.activeDealId || ''}:${turnEndsAt}`;
    if (now > turnEndsAt + graceMs && expireKeyRef.current !== key) {
      expireKeyRef.current = key;
      runAction('expire');
    }
  });

  const submitBoot = async () => {
    const reason = bootReason.trim();
    if (!reason || !bootTarget) return;
    setBusy('boot');
    setError('');
    try {
      const result = await apiPost('/api/clubs/trade-night-boot', { clubId, eventId: event.id, targetUid: bootTarget, reason });
      setInfo(result.status === 'booted'
        ? `${getSeatName(bootTarget)} was booted by unanimous vote.`
        : `Boot vote recorded (${result.votes}/${result.required}).`);
      setBootTarget(null);
      setBootReason('');
    } catch (bootError) {
      setError(bootError.message || 'Could not submit boot vote.');
    } finally {
      setBusy('');
    }
  };

  const mySeatIndex = Math.max(0, seats.indexOf(currentUid));
  const seatPosition = (index, radiusX = 44, radiusY = 41) => {
    const angle = Math.PI / 2 + ((index - mySeatIndex) * 2 * Math.PI) / Math.max(seats.length, 1);
    return { left: `${50 + radiusX * Math.cos(angle)}%`, top: `${50 + radiusY * Math.sin(angle)}%` };
  };

  const counterpartUid = currentUid === dealVendorUid ? dealRecipientUid : dealVendorUid;
  const canDecline = isLive && isParticipant && Boolean(activeDeal || currentUid === vendorUid) && !busy;
  const canPropose = isLive && isParticipant && isAwaiting && remainingMs > 0 && !busy && Boolean(dealRecipientUid);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f0c] text-white" role="dialog" aria-modal="true" aria-label="Trade night table">
      <style>{`
        @keyframes csDealPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.55); }
          50% { transform: scale(1.06); box-shadow: 0 0 22px 6px rgba(250, 204, 21, 0.45); }
        }
        .cs-deal-pulse { animation: csDealPulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .cs-deal-pulse { animation: none; } }
      `}</style>

      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold">Leave Table</button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-black">{event.title || 'Trade Night'}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">{isLive ? `Orbit ${table.orbit || 1} · Round ${table.round || 1}` : 'Waiting to start'}</p>
        </div>
        {canModerate && !isLive && String(event.status || '').toLowerCase() === 'registration' ? (
          <button type="button" onClick={() => runAction('start')} disabled={Boolean(busy) || seats.length < 2} className="min-h-10 rounded-xl bg-[#22C55E] px-3 text-xs font-bold text-black disabled:opacity-50">
            {busy === 'start' ? 'Starting...' : 'Start Table'}
          </button>
        ) : <span className="w-[84px]" />}
      </header>

      {(error || info) && (
        <div className="px-4">
          <p className={`rounded-xl border px-3 py-2 text-xs ${error ? 'border-red-400/30 bg-red-900/30 text-red-100' : 'border-emerald-400/30 bg-emerald-900/25 text-emerald-100'}`}>{error || info}</p>
        </div>
      )}

      <div className="relative min-h-0 flex-1 px-3 pb-28 pt-2">
        <div className="relative mx-auto h-full max-h-[760px] w-full max-w-[460px]">
          <div className="absolute inset-x-[9%] inset-y-[7%] rounded-[999px] border-[10px] border-[#1a1a1a] bg-[radial-gradient(ellipse_at_center,#2f8f3a_0%,#1f6b2a_55%,#154a1d_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.55),0_10px_40px_rgba(0,0,0,0.6)]" />

          <div className="absolute inset-x-[18%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 text-center">
            {activeDeal ? (
              <>
                <p className="rounded-full bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
                  {getSeatName(activeDeal.vendorUid)} deals to {getSeatName(activeDeal.recipientUid)}
                </p>
                <div className="flex max-w-full items-center justify-center gap-1.5 overflow-x-auto px-1 py-2">
                  {(activeDeal.vendorCards || []).map((card) => <MiniCard key={card.id} card={card} pulsing />)}
                </div>
                {(activeDeal.recipientCards || []).length > 0 && (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">for</span>
                    <div className="flex max-w-full items-center justify-center gap-1.5 overflow-x-auto px-1">
                      {activeDeal.recipientCards.map((card) => <MiniCard key={card.id} card={card} />)}
                    </div>
                  </>
                )}
                {activeDeal.note && <p className="max-w-full truncate text-[11px] italic text-white/75">“{activeDeal.note}”</p>}
                <p className="text-[11px] text-white/70">Waiting on {getSeatName(activeDeal.awaitingUid)} · {Math.ceil(remainingMs / 1000)}s</p>
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-black/40 px-4 py-1.5">
                  <p className="text-[10px] text-white/70">Table Binder Pool</p>
                  <p className="text-lg font-black text-amber-300">{formatMoney(totalBinderPool)}</p>
                </div>
                <p className="text-2xl font-black tracking-tight text-white/15">CardSwipers</p>
                <div className="space-y-0.5 text-[11px] text-white/55">
                  {isLive ? (
                    <>
                      <p>Vendor: {getSeatName(vendorUid)}{recipientUid ? ` → ${getSeatName(recipientUid)}` : ''}</p>
                      <p>Deal window closes in {Math.ceil(remainingMs / 1000)}s</p>
                    </>
                  ) : (
                    <p>{seats.length} trader(s) seated · waiting for the host</p>
                  )}
                  <p>Seated {seats.length}{bootedUids.length ? ` · Booted ${bootedUids.length}` : ''}</p>
                </div>
              </>
            )}
          </div>

          {seats.map((uid, index) => {
            const name = getSeatName(uid);
            const image = getSeatImage(uid);
            const registration = registrationByUid.get(uid) || {};
            const isVendorSeat = isLive && uid === vendorUid;
            const isActionSeat = isLive && uid === (activeDeal ? activeDeal.awaitingUid : vendorUid);
            const votes = bootVotes[uid];
            const voteCount = votes?.status === 'open' ? (votes.voterUids || []).length : 0;
            const requiredVotes = Math.max(1, seats.length - 1);
            return (
              <div key={uid} className="absolute z-10 w-[92px] -translate-x-1/2 -translate-y-1/2" style={seatPosition(index)}>
                <button
                  type="button"
                  onClick={() => setSelectedSeatUid((previous) => (previous === uid ? '' : uid))}
                  className="relative mx-auto block"
                  aria-label={`${name} seat options`}
                >
                  <span className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-[#1f2937] text-sm font-black ${isActionSeat ? 'border-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.6)]' : uid === currentUid ? 'border-white/70' : 'border-white/20'}`}>
                    {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : getInitials(name)}
                  </span>
                  {isVendorSeat && <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-md bg-sky-500 px-1.5 text-[9px] font-black uppercase">Vendor</span>}
                  {uid === dealRecipientUid && isLive && <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-md bg-amber-400 px-1.5 text-[9px] font-black uppercase text-black">Deal</span>}
                  {voteCount > 0 && <span className="absolute -right-2 top-0 rounded-md bg-red-600 px-1 text-[9px] font-black">Boot {voteCount}/{requiredVotes}</span>}
                </button>
                <div className={`-mt-1 rounded-lg border bg-black/80 px-1.5 py-1 text-center ${uid === currentUid ? 'border-white/40' : 'border-white/10'}`}>
                  <p className="truncate text-[11px] font-semibold">{name}</p>
                  <p className="text-[12px] font-black text-cyan-300">{formatMoney(registration.binderValue)}</p>
                  {isActionSeat && <CountdownBar remainingMs={remainingMs} totalMs={totalMs} />}
                </div>
                {selectedSeatUid === uid && uid !== currentUid && isLive && !isBooted && (
                  <div className="absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2">
                    <button
                      type="button"
                      onClick={() => { setBootTarget(uid); setSelectedSeatUid(''); }}
                      className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-400/40 bg-red-900/85 px-2.5 text-xs font-bold text-red-100"
                    >
                      <BootIcon /> Boot
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {isLive && seats.length > 1 && (() => {
            const position = seatPosition(dealerSeat, 27, 26);
            return (
              <span
                className="absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-600 bg-gradient-to-b from-amber-200 to-amber-400 text-xs font-black italic text-amber-900 shadow-md transition-all duration-700"
                style={position}
                aria-label={`Dealer button: ${getSeatName(vendorUid)}`}
              >
                D
              </span>
            );
          })()}
        </div>
      </div>

      {isLive && isParticipant && !isBooted && (
        <div className="fixed bottom-0 right-0 z-[85] w-[min(260px,70vw)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="rounded-2xl border border-white/10 bg-black/75 p-2.5 backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-[10px] text-white/65">
              <span>{isAwaiting ? 'Your action' : `Waiting on ${getSeatName(activeDeal?.awaitingUid || vendorUid)}`}</span>
              <span className="font-black text-white">{Math.ceil(remainingMs / 1000)}s</span>
            </div>
            <CountdownBar remainingMs={remainingMs} totalMs={totalMs} />
            <div className="mt-2 grid gap-1.5">
              {activeDeal && isAwaiting && (
                <button type="button" onClick={() => runAction('accept')} disabled={Boolean(busy) || remainingMs <= 0} className="min-h-11 rounded-xl bg-[#22C55E] text-sm font-black text-black disabled:opacity-50">
                  {busy === 'accept' ? 'Accepting...' : 'Accept Deal'}
                </button>
              )}
              <button type="button" onClick={() => setComposerOpen(true)} disabled={!canPropose} className="min-h-11 rounded-xl bg-amber-400 text-sm font-black text-black disabled:opacity-40">
                {activeDeal ? 'Counter / Propose Trade' : currentUid === vendorUid ? 'Propose Deal' : 'Counter / Propose Trade'}
              </button>
              <button type="button" onClick={() => runAction('decline')} disabled={!canDecline} className="min-h-11 rounded-xl border border-red-400/40 bg-red-900/50 text-sm font-bold text-red-100 disabled:opacity-40">
                {busy === 'decline' ? 'Declining...' : activeDeal ? 'Decline Deal' : 'Decline Deal (Skip)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {composerOpen && counterpartUid && (
        <DealComposer
          myCards={registrationByUid.get(currentUid)?.binderCards || []}
          theirCards={registrationByUid.get(counterpartUid)?.binderCards || []}
          initial={activeDeal || {}}
          isVendor={currentUid === dealVendorUid}
          counterpartName={getSeatName(counterpartUid)}
          busy={busy === 'propose'}
          onCancel={() => setComposerOpen(false)}
          onSubmit={async (terms) => {
            if (await runAction('propose', terms)) setComposerOpen(false);
          }}
        />
      )}

      {bootTarget && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-red-400/30 bg-[#161B22] p-4">
            <h4 className="flex items-center gap-2 text-base font-black text-red-200"><BootIcon className="h-5 w-5" /> Vote to boot {getSeatName(bootTarget)}</h4>
            <p className="mt-1 text-xs text-white/60">A unanimous vote from every other seated trader removes them from this Trade Night. Your comment is sent to their agent, super agent, and the club owner.</p>
            <textarea
              value={bootReason}
              maxLength={BOOT_REASON_MAX}
              onChange={(changeEvent) => setBootReason(changeEvent.target.value)}
              rows={3}
              placeholder="Brief reason (required)"
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-base focus:border-white/35 focus:outline-none"
            />
            <p className="text-right text-[10px] text-white/45">{bootReason.length}/{BOOT_REASON_MAX}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setBootTarget(null); setBootReason(''); }} className="min-h-11 flex-1 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={submitBoot} disabled={!bootReason.trim() || busy === 'boot'} className="min-h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold disabled:opacity-50">
                {busy === 'boot' ? 'Submitting...' : 'Submit Vote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBooted && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-red-400/30 bg-[#161B22] p-5 text-center">
            <BootIcon className="mx-auto h-8 w-8 text-red-300" />
            <h4 className="mt-2 text-base font-black">You were removed from this Trade Night</h4>
            <p className="mt-1 text-xs text-white/60">The table voted unanimously to boot you. You can't re-enter this Trade Night.</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-xl bg-white/10 text-sm font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
