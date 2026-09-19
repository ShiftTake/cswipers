import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { formatMoney, parseDollarValue } from '../../utils/tradeNight';

const toDateValue = (value) => {
  const date = value?.toDate?.() || value;
  const parsedDate = date instanceof Date ? date : new Date(date || 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export default function TradeNightSpotlightModal({ eventId, clubId, currentUserId, vendor, myBinder, onClose, onConfirmed }) {
  const [spotlightId, setSpotlightId] = useState('');
  const [spotlight, setSpotlight] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [busy, setBusy] = useState(false);
  const [loadedVendorBinder, setLoadedVendorBinder] = useState([]);
  const hasConfirmedRef = useRef(false);
  const vendorBinder = loadedVendorBinder.length ? loadedVendorBinder : (Array.isArray(vendor?.binder) ? vendor.binder : []);

  useEffect(() => {
    hasConfirmedRef.current = false;
  }, [spotlightId]);

  useEffect(() => {
    if (!vendor?.id) {
      setLoadedVendorBinder([]);
      return undefined;
    }

    const binderQuery = query(collection(db, 'cards'), where('ownerUid', '==', vendor.id), limit(50));
    return onSnapshot(
      binderQuery,
      (snapshot) => {
        setLoadedVendorBinder(snapshot.docs.map((cardDoc) => ({ id: cardDoc.id, ...cardDoc.data() })));
      },
      () => setLoadedVendorBinder([])
    );
  }, [vendor?.id]);

  const pairedCards = (() => {
    const mine = Array.isArray(myBinder) ? myBinder : [];
    if (!mine.length || !vendorBinder.length) return null;

    let bestPair = null;
    mine.forEach((myCard) => {
      vendorBinder.forEach((theirCard) => {
        const myValue = parseDollarValue(myCard.tradeValue || myCard.value || myCard.avgMarketValue);
        const theirValue = parseDollarValue(theirCard.tradeValue || theirCard.value || theirCard.avgMarketValue);
        if (!myValue || !theirValue) return;

        const difference = Math.abs(myValue - theirValue);
        if (!bestPair || difference < bestPair.difference) {
          bestPair = { mine: myCard, theirs: theirCard, difference, myValue, theirValue };
        }
      });
    });

    return bestPair;
  })();

  useEffect(() => {
    let active = true;
    if (!eventId || !clubId || !currentUserId || !vendor?.id) return undefined;

    addDoc(collection(db, 'tradeSpotlights'), {
      eventId,
      clubId,
      participants: [currentUserId, vendor.id],
      buyerUid: currentUserId,
      sellerUid: vendor.id,
      offeredCards: pairedCards ? {
        buyer: {
          id: pairedCards.mine.id,
          title: pairedCards.mine.title || pairedCards.mine.name || '',
          value: pairedCards.myValue
        },
        seller: {
          id: pairedCards.theirs.id,
          title: pairedCards.theirs.title || pairedCards.theirs.name || '',
          value: pairedCards.theirValue
        }
      } : null,
      status: 'revealing',
      acceptedBy: [],
      expiresAt: new Date(Date.now() + 30000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).then((ref) => {
      if (active) setSpotlightId(ref.id);
    }).catch(() => onClose());

    return () => {
      active = false;
    };
  }, [eventId, clubId, currentUserId, vendor?.id]);

  useEffect(() => {
    if (!spotlightId) return undefined;

    return onSnapshot(doc(db, 'tradeSpotlights', spotlightId), (snapshot) => {
      if (!snapshot.exists()) return;
      const next = { id: snapshot.id, ...snapshot.data() };
      setSpotlight(next);

      if (next.status === 'confirmed' && !hasConfirmedRef.current) {
        hasConfirmedRef.current = true;
        onConfirmed(next);
      }
    });
  }, [spotlightId, onConfirmed]);

  useEffect(() => {
    if (!spotlightId) return undefined;

    const tick = () => {
      const expireDate = toDateValue(spotlight?.expiresAt);
      const expireMs = expireDate ? expireDate.getTime() : Date.now() + 30000;
      const remaining = Math.max(0, Math.ceil((expireMs - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0 && spotlightId && (!spotlight || spotlight.status !== 'expired')) {
        updateDoc(doc(db, 'tradeSpotlights', spotlightId), {
          status: 'expired',
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [spotlightId, spotlight?.expiresAt, spotlight?.status]);

  useEffect(() => {
    if (!spotlightId || !spotlight || !pairedCards) return undefined;

    const nextOfferedCards = {
      buyer: {
        id: pairedCards.mine.id,
        title: pairedCards.mine.title || pairedCards.mine.name || '',
        value: pairedCards.myValue
      },
      seller: {
        id: pairedCards.theirs.id,
        title: pairedCards.theirs.title || pairedCards.theirs.name || '',
        value: pairedCards.theirValue
      }
    };

    if (
      !spotlight.offeredCards ||
      spotlight.offeredCards.buyer?.id !== nextOfferedCards.buyer.id ||
      spotlight.offeredCards.seller?.id !== nextOfferedCards.seller.id
    ) {
      updateDoc(doc(db, 'tradeSpotlights', spotlightId), {
        offeredCards: nextOfferedCards,
        updatedAt: serverTimestamp()
      }).catch(() => {});
    }

    return undefined;
  }, [spotlightId, spotlight, pairedCards]);

  const shakeOnIt = async () => {
    if (!spotlightId || busy || secondsLeft <= 0) return;
    setBusy(true);
    try {
      const acceptedBy = Array.from(new Set([...(spotlight?.acceptedBy || []), currentUserId]));
      await updateDoc(doc(db, 'tradeSpotlights', spotlightId), {
        acceptedBy,
        status: acceptedBy.length >= 2 ? 'confirmed' : 'awaiting_acceptance',
        updatedAt: serverTimestamp()
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] flex-col overflow-hidden bg-black/95 px-4" role="dialog" aria-modal="true" aria-label="Trade night spotlight">
      <div className="flex shrink-0 items-center justify-between pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FFD700]">Trade Night Spotlight</p>
        <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm font-semibold text-white/70 hover:text-white">Close</button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-4">
        <div className={`mb-3 inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] ${secondsLeft <= 10 ? 'border-[#FFD700]/80 bg-[#FFD700]/20 text-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.8)] animate-pulse' : 'border-white/15 bg-white/5 text-white/65'}`}>
          <span>Shot Clock</span>
        </div>

        <p className={`mt-1 text-5xl font-black tabular-nums ${secondsLeft <= 10 ? 'text-[#EF4444]' : 'text-[#FFD700]'}`}>{secondsLeft}s</p>

        <div className="mt-8 flex w-full max-w-md items-center justify-center gap-3 sm:gap-6">
          {[
            { card: pairedCards?.mine, label: 'Your Card', fallback: 'Your Binder' },
            { card: pairedCards?.theirs, label: `${vendor?.displayName || 'Vendor'}'s Card`, fallback: 'Vendor Binder' }
          ].map((side) => (
            <div key={side.label} className="min-w-0 flex-1 text-center">
              <p className="mb-2 truncate text-[10px] font-bold uppercase tracking-wider text-white/55">{side.label}</p>
              <div className="relative mx-auto aspect-[3/4] w-full max-w-[150px] animate-[spotlightPulse_1.6s_ease-in-out_infinite] overflow-hidden rounded-2xl border-2 border-[#FFD700]/80 bg-gradient-to-br from-[#1A1A1A] via-zinc-900 to-[#0A0A0A] shadow-[0_0_50px_rgba(255,215,0,0.45)]">
                <div className="pointer-events-none absolute inset-0 rounded-2xl border border-[#FDE68A]/60" />
                <div className="pointer-events-none absolute inset-[1px] rounded-[14px] bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,0.42),transparent_18%),radial-gradient(circle_at_68%_70%,rgba(255,215,0,0.18),transparent_34%)]" />
                <div className="pointer-events-none absolute inset-y-0 left-[-30%] w-[38%] -rotate-12 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 blur-sm" style={{ animation: 'holoSweep 2.8s ease-in-out infinite' }} />
                {side.card?.imageUrl ? (
                  <img src={side.card.imageUrl} alt={side.card.title || side.card.name || side.label} className="relative z-10 h-full w-full object-cover" />
                ) : (
                  <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-2 text-white/50">
                    <span className="text-4xl">🃏</span>
                    <span className="text-[10px]">{side.fallback}</span>
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-semibold text-white">{side.card?.title || side.card?.name || 'Waiting for active binder'}</p>
              <p className="text-[11px] text-emerald-300">{side.card ? formatMoney(side.card.tradeValue || side.card.value || side.card.avgMarketValue) : '—'}</p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-white/55">
          {pairedCards ? 'Balanced market-value pairing found.' : 'Both binders need active valued cards for an automatic pairing.'}
        </p>

        <button
          type="button"
          onClick={shakeOnIt}
          disabled={busy || secondsLeft <= 0 || !pairedCards || spotlight?.acceptedBy?.includes(currentUserId)}
          className="mt-7 min-h-12 w-full max-w-md rounded-2xl bg-[#10B981] px-5 py-3 text-base font-black text-black shadow-[0_12px_30px_rgba(16,185,129,0.25)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {spotlight?.acceptedBy?.includes(currentUserId) ? 'Waiting for the other trader...' : 'Shake on It 🤝'}
        </button>
      </div>

      <style>{'@keyframes spotlightPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } } @keyframes holoSweep { 0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 12% { opacity: 0.9; } 35% { opacity: 1; } 80% { transform: translateX(260%) skewX(-18deg); opacity: 0; } 100% { transform: translateX(260%) skewX(-18deg); opacity: 0; } }'}</style>
    </div>
  );
}
