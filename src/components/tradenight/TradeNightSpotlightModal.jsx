import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { formatMoney, parseDollarValue } from '../../utils/tradeNight';

const SHOT_CLOCK_SECONDS = 30;
const HANDSHAKE_HOLD_MS = 1500;

const getCardId = (card, index = 0) => card?.id || card?.cardId || card?.sku || `${card?.title || card?.name || 'card'}-${index}`;

const buzz = (pattern) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
};

const playShotClockTick = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
    oscillator.onended = () => context.close();
  } catch (_) {}
};

const toDateValue = (value) => {
  const date = value?.toDate?.() || value;
  const parsedDate = date instanceof Date ? date : new Date(date || 0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getCardValueRange = (card) => {
  if (!card) return { min: 0, max: 0, mid: 0, label: 'No value' };

  const rawRanges = [
    card?.valueRange,
    card?.saleRange,
    card?.marketRange,
    card?.range,
    card?.priceRange,
    { min: card?.comp_low, max: card?.comp_high },
    { min: card?.compLow, max: card?.compHigh },
    { min: card?.minValue || card?.lowValue, max: card?.maxValue || card?.highValue }
  ];

  let minValue = 0;
  let maxValue = 0;

  for (const candidate of rawRanges) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      const match = candidate.match(/\d+(?:\.\d+)?/g);
      if (match && match.length >= 2) {
        minValue = Number(match[0]) || minValue;
        maxValue = Number(match[match.length - 1]) || maxValue;
      }
      continue;
    }
    if (typeof candidate === 'object') {
      const nextMin = Number(candidate.min ?? candidate.low ?? candidate.lowValue ?? 0);
      const nextMax = Number(candidate.max ?? candidate.high ?? candidate.highValue ?? 0);
      if (nextMin > 0 || nextMax > 0) {
        minValue = nextMin || minValue || nextMax;
        maxValue = nextMax || maxValue || nextMin;
      }
    }
  }

  const values = [
    parseDollarValue(card?.comp_mid || card?.compMid || card?.tradeValue || card?.value || card?.avgMarketValue || card?.estimatedValue || card?.buyNowPrice || card?.marketValue),
    minValue,
    maxValue
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (!values.length) {
    return { min: 0, max: 0, mid: 0, label: 'No value' };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;

  return {
    min,
    max,
    mid,
    label: `${formatMoney(min)} – ${formatMoney(max)}`
  };
};

export default function TradeNightSpotlightModal({ eventId, clubId, currentUserId, currentUserName = '', vendor, myBinder, onClose, onConfirmed, initialSpotlightId = '', initialSpotlight = null }) {
  const [spotlightId, setSpotlightId] = useState(initialSpotlightId || '');
  const [spotlight, setSpotlight] = useState(initialSpotlight || null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [busy, setBusy] = useState(false);
  const [loadedVendorBinder, setLoadedVendorBinder] = useState([]);
  const [selectedBuyerCardIds, setSelectedBuyerCardIds] = useState([]);
  const [selectedSellerCardIds, setSelectedSellerCardIds] = useState([]);
  const [offerSent, setOfferSent] = useState(Boolean(initialSpotlightId));
  const [isHoldingHandshake, setIsHoldingHandshake] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const hasConfirmedRef = useRef(false);
  const holdTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const vendorBinder = loadedVendorBinder.length ? loadedVendorBinder : (Array.isArray(vendor?.binder) ? vendor.binder : []);

  useEffect(() => {
    setSpotlightId(initialSpotlightId || '');
    setSpotlight(initialSpotlight || null);
    setOfferSent(Boolean(initialSpotlightId));
  }, [initialSpotlightId, initialSpotlight]);

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

  const buyerPortfolioCards = useMemo(() => {
    const mine = Array.isArray(myBinder) ? myBinder : [];
    return mine
      .map((card, index) => ({ ...card, id: getCardId(card, index), valueRange: getCardValueRange(card) }))
      .filter((card) => card.valueRange.mid > 0)
      .sort((a, b) => b.valueRange.mid - a.valueRange.mid);
  }, [myBinder]);

  const sellerPortfolioCards = useMemo(() => {
    return vendorBinder
      .map((card, index) => ({ ...card, id: getCardId(card, index), valueRange: getCardValueRange(card) }))
      .filter((card) => card.valueRange.mid > 0)
      .sort((a, b) => b.valueRange.mid - a.valueRange.mid);
  }, [vendorBinder]);

  useEffect(() => {
    if (!buyerPortfolioCards.length) {
      setSelectedBuyerCardIds([]);
      return;
    }

    const recommended = buyerPortfolioCards.slice(0, 3).map((card) => card.id).filter(Boolean);
    setSelectedBuyerCardIds((previous) => {
      const next = previous.filter((cardId) => buyerPortfolioCards.some((card) => card.id === cardId)).slice(0, 3);
      if (next.length) return next;
      return recommended;
    });
  }, [buyerPortfolioCards]);

  const selectedOfferCards = useMemo(
    () => buyerPortfolioCards.filter((card) => selectedBuyerCardIds.includes(card.id)),
    [buyerPortfolioCards, selectedBuyerCardIds]
  );

  const selectedTargetCards = useMemo(
    () => sellerPortfolioCards.filter((card) => selectedSellerCardIds.includes(card.id)),
    [sellerPortfolioCards, selectedSellerCardIds]
  );

  useEffect(() => {
    if (!sellerPortfolioCards.length) {
      setSelectedSellerCardIds([]);
      return;
    }

    const buyerTotal = selectedOfferCards.reduce((sum, card) => sum + (card.valueRange.mid || 0), 0);
    const sortedByFit = [...sellerPortfolioCards].sort((a, b) => Math.abs((a.valueRange.mid || 0) - buyerTotal) - Math.abs((b.valueRange.mid || 0) - buyerTotal));
    const recommended = sortedByFit.slice(0, 3).map((card) => card.id).filter(Boolean);
    setSelectedSellerCardIds((previous) => {
      const next = previous.filter((cardId) => sellerPortfolioCards.some((card) => card.id === cardId)).slice(0, 3);
      if (next.length) return next;
      return recommended;
    });
  }, [selectedOfferCards, sellerPortfolioCards]);

  const pairedCards = useMemo(() => {
    if (!selectedOfferCards.length || !selectedTargetCards.length) return null;

    const bestPairs = selectedOfferCards
      .map((myCard) => {
        let bestMatch = null;
        selectedTargetCards.forEach((theirCard) => {
          const myRange = getCardValueRange(myCard);
          const theirRange = getCardValueRange(theirCard);
          const myValue = myRange.mid || myRange.max || myRange.min;
          const theirValue = theirRange.mid || theirRange.max || theirRange.min;
          if (!myValue || !theirValue) return;

          const difference = Math.abs(myValue - theirValue);
          if (!bestMatch || difference < bestMatch.difference) {
            bestMatch = {
              mine: myCard,
              theirs: theirCard,
              difference,
              myValue,
              theirValue,
              myRange,
              theirRange
            };
          }
        });
        return bestMatch;
      })
      .filter(Boolean)
      .sort((a, b) => a.difference - b.difference);

    if (!bestPairs.length) return null;

    const chosen = bestPairs[0];
    return {
      mine: chosen.mine,
      theirs: chosen.theirs,
      difference: chosen.difference,
      myValue: chosen.myValue,
      theirValue: chosen.theirValue,
      myRange: chosen.myRange,
      theirRange: chosen.theirRange
    };
  }, [selectedOfferCards, selectedTargetCards]);

  const dealSnapshot = useMemo(() => {
    if (!selectedOfferCards.length || !selectedTargetCards.length) return null;

    const buyerTotal = selectedOfferCards.reduce((sum, card) => sum + (getCardValueRange(card).mid || 0), 0);
    const vendorTotal = selectedTargetCards.reduce((sum, card) => sum + (getCardValueRange(card).mid || 0), 0);
    const spread = Math.abs(buyerTotal - vendorTotal);
    const equityRatio = vendorTotal > 0 ? Math.round((buyerTotal / vendorTotal) * 100) : 0;
    const score = Math.max(0, Math.min(100, Math.round(100 - Math.abs(100 - equityRatio))));
    const fairSwap = equityRatio >= 90 && equityRatio <= 110;
    const advantage = (equityRatio >= 75 && equityRatio < 90) || (equityRatio > 110 && equityRatio <= 125);

    return {
      buyerTotal,
      vendorTotal,
      spread,
      equityRatio,
      score,
      quality: fairSwap ? 'Fair Swap' : advantage ? 'Trader Advantage' : 'Steal / Risky Deal',
      bonus: fairSwap ? '+10 Club XP' : advantage ? 'Standard Trade' : 'Warning: Unbalanced'
    };
  }, [selectedOfferCards, selectedTargetCards]);

  const createTimedOffer = async () => {
    if (!eventId || !clubId || !currentUserId || !vendor?.id || !dealSnapshot || !pairedCards || busy) return;
    setBusy(true);
    try {
      const offerExpiresAt = new Date(Date.now() + SHOT_CLOCK_SECONDS * 1000);
      const ref = await addDoc(collection(db, 'tradeSpotlights'), {
        eventId,
        clubId,
        participants: [currentUserId, vendor.id],
        buyerUid: currentUserId,
        sellerUid: vendor.id,
        buyerName: currentUserName || 'Trader',
        sellerName: vendor.displayName || vendor.name || 'Trader',
        offeredCards: {
          buyer: selectedOfferCards.map((card) => ({
            id: card.id,
            title: card.title || card.name || '',
            value: card.valueRange.mid,
            valueRange: card.valueRange
          })),
          seller: selectedTargetCards.map((card) => ({
            id: card.id,
            title: card.title || card.name || '',
            value: card.valueRange.mid,
            valueRange: card.valueRange
          }))
        },
        dealMeter: dealSnapshot,
        status: 'OFFER_PENDING',
        acceptedBy: [],
        heldBy: [],
        expiresAt: offerExpiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSpotlightId(ref.id);
      setOfferSent(true);
      buzz([40, 30, 60]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!spotlightId) return undefined;

    return onSnapshot(doc(db, 'tradeSpotlights', spotlightId), (snapshot) => {
      if (!snapshot.exists()) return;
      const next = { id: snapshot.id, ...snapshot.data() };
      setSpotlight(next);

      if ((next.status === 'HANDSHAKE_LOCKED' || next.status === 'confirmed') && !hasConfirmedRef.current) {
        hasConfirmedRef.current = true;
        onConfirmed(next);
      }
    });
  }, [spotlightId, onConfirmed]);

  useEffect(() => {
    if (!spotlightId) return undefined;

    const tick = () => {
      const expireDate = toDateValue(spotlight?.expiresAt);
      const expireMs = expireDate ? expireDate.getTime() : Date.now() + SHOT_CLOCK_SECONDS * 1000;
      const remaining = Math.max(0, Math.ceil((expireMs - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0 && spotlightId && spotlight?.status === 'OFFER_PENDING') {
        updateDoc(doc(db, 'tradeSpotlights', spotlightId), {
          status: 'EXPIRED',
          expiredAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [spotlightId, spotlight?.expiresAt, spotlight?.status]);

  useEffect(() => {
    if (!offerSent || spotlight?.status !== 'OFFER_PENDING' || secondsLeft <= 0 || secondsLeft > 5) return;
    buzz(secondsLeft <= 3 ? [20, 20, 20] : 20);
    playShotClockTick();
  }, [offerSent, secondsLeft, spotlight?.status]);

  const completeHandshakeHold = async () => {
    if (!spotlightId || busy || secondsLeft <= 0 || spotlight?.status === 'EXPIRED') return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
    setBusy(true);
    try {
      const heldBy = Array.from(new Set([...(spotlight?.heldBy || spotlight?.acceptedBy || []), currentUserId]));
      const nextStatus = heldBy.length >= 2 ? 'HANDSHAKE_LOCKED' : 'HANDSHAKE_PENDING';
      const offeredCards = spotlight?.offeredCards || {};
      const currentSide = currentUserId === spotlight?.buyerUid ? 'buyer' : currentUserId === spotlight?.sellerUid ? 'seller' : '';
      const cardsToLock = Array.isArray(offeredCards[currentSide]) ? offeredCards[currentSide] : [];

      await Promise.all(cardsToLock.map((card) => updateDoc(doc(db, 'cards', card.id), {
        isLocked: true,
        lockedForTradeNight: true,
        lockedBySpotlightId: spotlightId,
        lockedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(() => null)));

      await updateDoc(doc(db, 'tradeSpotlights', spotlightId), {
        acceptedBy: heldBy,
        heldBy,
        status: nextStatus,
        lockedAt: nextStatus === 'HANDSHAKE_LOCKED' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      if (nextStatus === 'HANDSHAKE_LOCKED') {
        await setDoc(doc(db, 'tradeNightEscrows', spotlightId), {
          spotlightId,
          eventId: spotlight?.eventId || eventId,
          clubId: spotlight?.clubId || clubId,
          participants: spotlight?.participants || [currentUserId, vendor?.id].filter(Boolean),
          buyerUid: spotlight?.buyerUid || currentUserId,
          sellerUid: spotlight?.sellerUid || vendor?.id || null,
          buyerName: spotlight?.buyerName || '',
          sellerName: spotlight?.sellerName || vendor?.displayName || '',
          offeredCards,
          dealMeter: spotlight?.dealMeter || dealSnapshot || null,
          status: 'AGENT_ESCROW_VAULT',
          escrowStatus: 'awaiting_physical_verification',
          lockedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        }, { merge: true });
      }
      buzz(nextStatus === 'HANDSHAKE_LOCKED' ? [30, 40, 90, 40, 140] : [80]);
    } finally {
      setBusy(false);
      setIsHoldingHandshake(false);
      setHoldProgress(0);
    }
  };

  const startHandshakeHold = () => {
    if (!spotlightId || busy || secondsLeft <= 0 || spotlight?.acceptedBy?.includes(currentUserId)) return;
    const startedAt = Date.now();
    setIsHoldingHandshake(true);
    setHoldProgress(0);
    buzz(25);
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress(Math.min(100, Math.round(((Date.now() - startedAt) / HANDSHAKE_HOLD_MS) * 100)));
    }, 50);
    holdTimerRef.current = setTimeout(completeHandshakeHold, HANDSHAKE_HOLD_MS);
  };

  const cancelHandshakeHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
    setIsHoldingHandshake(false);
    setHoldProgress(0);
  };

  useEffect(() => cancelHandshakeHold, []);

  const handshakeProgress = Math.min(100, ((spotlight?.acceptedBy?.length || 0) / 2) * 100);
  const shotClockProgress = Math.max(0, Math.min(100, (secondsLeft / SHOT_CLOCK_SECONDS) * 100));
  const offerExpired = spotlight?.status === 'EXPIRED' || (offerSent && secondsLeft <= 0);
  const handshakeLocked = spotlight?.status === 'HANDSHAKE_LOCKED' || spotlight?.status === 'confirmed';
  const tradeLocked = offerSent || Boolean(spotlightId);
  const persistedBuyerCards = Array.isArray(spotlight?.offeredCards?.buyer) ? spotlight.offeredCards.buyer : [];
  const persistedSellerCards = Array.isArray(spotlight?.offeredCards?.seller) ? spotlight.offeredCards.seller : [];
  const hasPersistedOfferCards = persistedBuyerCards.length > 0 && persistedSellerCards.length > 0;
  const effectiveDealSnapshot = spotlight?.dealMeter || dealSnapshot;
  const displayPair = hasPersistedOfferCards ? {
    mine: currentUserId === spotlight?.buyerUid ? persistedBuyerCards[0] : persistedSellerCards[0],
    theirs: currentUserId === spotlight?.buyerUid ? persistedSellerCards[0] : persistedBuyerCards[0]
  } : pairedCards;
  const dealMeterColor = effectiveDealSnapshot?.quality === 'Fair Swap'
    ? 'from-[#10B981] via-[#FFD700] to-[#10B981]'
    : effectiveDealSnapshot?.quality === 'Trader Advantage'
      ? 'from-[#F59E0B] via-[#FFD700] to-[#F97316]'
      : 'from-[#EF4444] via-[#F97316] to-[#EF4444]';

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] flex-col overflow-hidden bg-black/95 px-4" role="dialog" aria-modal="true" aria-label="Trade night spotlight">
      <div className="flex shrink-0 items-center justify-between pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#FFD700]">Trade Night Spotlight</p>
        <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm font-semibold text-white/70 hover:text-white">Close</button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-4">
        <div className={`mb-3 inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] ${offerSent && secondsLeft <= 10 ? 'border-[#FFD700]/80 bg-[#FFD700]/20 text-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.8)] animate-pulse' : 'border-white/15 bg-white/5 text-white/65'}`}>
          <span>{offerSent ? 'Shot Clock' : 'Offer Builder'}</span>
        </div>

        <div className="relative mt-1 flex h-24 w-24 items-center justify-center rounded-full bg-white/5">
          <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${offerSent && secondsLeft <= 10 ? '#EF4444' : '#FFD700'} ${shotClockProgress * 3.6}deg, rgba(255,255,255,0.12) 0deg)` }} />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-black">
            <p className={`text-3xl font-black tabular-nums ${offerSent && secondsLeft <= 10 ? 'text-[#EF4444]' : 'text-[#FFD700]'}`}>{secondsLeft}s</p>
          </div>
        </div>

        {effectiveDealSnapshot && (
          <div className="mt-5 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
              <span>Deal meter</span>
              <span>{effectiveDealSnapshot.equityRatio}% equity</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full bg-gradient-to-r ${dealMeterColor}`} style={{ width: `${effectiveDealSnapshot.score}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/70">
              <span>{effectiveDealSnapshot.quality}</span>
              <span>{effectiveDealSnapshot.bonus} · {formatMoney(effectiveDealSnapshot.spread)} spread</span>
            </div>
          </div>
        )}

        <div className="mt-6 w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
            <span>Buyer offer</span>
            <span>{selectedOfferCards.length}/3 cards</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {buyerPortfolioCards.length ? buyerPortfolioCards.map((card) => {
              const selected = selectedBuyerCardIds.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={tradeLocked}
                  onClick={() => {
                    const next = selected
                      ? selectedBuyerCardIds.filter((id) => id !== card.id)
                      : selectedBuyerCardIds.length >= 3 ? selectedBuyerCardIds.slice(1).concat(card.id) : [...selectedBuyerCardIds, card.id];
                    setSelectedBuyerCardIds(next);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-[#FFD700] bg-[#FFD700]/15 text-[#FFD700]' : 'border-white/15 bg-white/5 text-white/70'}`}
                >
                  {card.title || card.name || 'Card'} · {card.valueRange.label}
                </button>
              );
            }) : <span className="text-[11px] text-white/55">Your binder is empty or has no valued cards yet.</span>}
          </div>
        </div>

        <div className="mt-3 w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
            <span>Target cards</span>
            <span>{selectedTargetCards.length}/3 cards</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sellerPortfolioCards.length ? sellerPortfolioCards.map((card) => {
              const selected = selectedSellerCardIds.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={tradeLocked}
                  onClick={() => {
                    const next = selected
                      ? selectedSellerCardIds.filter((id) => id !== card.id)
                      : selectedSellerCardIds.length >= 3 ? selectedSellerCardIds.slice(1).concat(card.id) : [...selectedSellerCardIds, card.id];
                    setSelectedSellerCardIds(next);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-[#10B981] bg-[#10B981]/15 text-[#34D399]' : 'border-white/15 bg-white/5 text-white/70'}`}
                >
                  {card.title || card.name || 'Card'} · {card.valueRange.label}
                </button>
              );
            }) : <span className="text-[11px] text-white/55">This trader has no valued cards available.</span>}
          </div>
        </div>

        <div className="mt-6 flex w-full max-w-md items-center justify-center gap-3 sm:gap-6">
          {[
            { card: displayPair?.mine, label: 'Your Card', fallback: 'Your Binder' },
            { card: displayPair?.theirs, label: `${vendor?.displayName || 'Trader'}'s Card`, fallback: 'Trader Binder' }
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
              <p className="text-[11px] text-emerald-300">{side.card ? getCardValueRange(side.card).label : '—'}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 w-full max-w-md rounded-2xl border border-[#10B981]/20 bg-[#10B981]/5 p-3">
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#10B981]">
            <span>Handshake</span>
            <span>{Math.min(2, spotlight?.acceptedBy?.length || 0)}/2</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#34D399]" style={{ width: `${handshakeProgress}%` }} />
          </div>
          {isHoldingHandshake && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${holdProgress}%` }} />
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/55">
          {offerExpired ? 'Offer expired. Cards return to the trade floor.' : (pairedCards || hasPersistedOfferCards) ? 'Algorithm matched a trade range that is within the shot clock.' : 'Both binders need active valued cards for an automatic pairing.'}
        </p>

        {!offerSent ? (
          <button
            type="button"
            onClick={createTimedOffer}
            disabled={busy || !pairedCards || !dealSnapshot || selectedOfferCards.length < 1 || selectedTargetCards.length < 1}
            className="mt-7 min-h-12 w-full max-w-md rounded-2xl bg-[#FFD700] px-5 py-3 text-base font-black text-black shadow-[0_12px_30px_rgba(255,215,0,0.22)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Send Offer & Start Shot Clock
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={startHandshakeHold}
            onPointerUp={cancelHandshakeHold}
            onPointerCancel={cancelHandshakeHold}
            onPointerLeave={cancelHandshakeHold}
            disabled={busy || offerExpired || !(pairedCards || hasPersistedOfferCards) || spotlight?.acceptedBy?.includes(currentUserId) || handshakeLocked}
            className="mt-7 min-h-12 w-full max-w-md rounded-2xl bg-[#10B981] px-5 py-3 text-base font-black text-black shadow-[0_12px_30px_rgba(16,185,129,0.25)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {handshakeLocked ? 'Handshake Locked' : spotlight?.acceptedBy?.includes(currentUserId) ? 'Waiting for the other trader...' : isHoldingHandshake ? 'Hold...' : 'Hold to Handshake'}
          </button>
        )}
      </div>

      <style>{'@keyframes spotlightPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } } @keyframes holoSweep { 0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 12% { opacity: 0.9; } 35% { opacity: 1; } 80% { transform: translateX(260%) skewX(-18deg); opacity: 0; } 100% { transform: translateX(260%) skewX(-18deg); opacity: 0; } }'}</style>
    </div>
  );
}
