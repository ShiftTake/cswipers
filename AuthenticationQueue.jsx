import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function AuthenticationCard({ card, onPass, onReject, busyCardId }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const isBusy = busyCardId === card.id;

  const submitReject = () => {
    onReject(card.id, reason);
    setRejectOpen(false);
    setReason('');
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{card.name || card.title || 'Untitled Card'}</p>
          <p className="text-xs text-white/60">
            {card.brand || 'Unknown brand'} · {formatCurrency(card.tradeValue || card.value)}
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-300 border-amber-500/30">
          Pending Review
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onPass(card.id)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
        >
          Pass / Authenticated
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setRejectOpen((prev) => !prev)}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
        >
          Reject / Fail
        </button>
      </div>

      {rejectOpen && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Rejection reason"
            className="flex-1 rounded-lg bg-black/30 border border-white/15 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={submitReject}
            className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export default function AuthenticationQueue({ firebaseUser, canAccess, onClose }) {
  const [queuedCards, setQueuedCards] = useState([]);
  const [busyCardId, setBusyCardId] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!canAccess) {
      setQueuedCards([]);
      return undefined;
    }

    let flaggedCards = [];
    let pendingCards = [];
    const emit = () => {
      const merged = new Map();
      [...flaggedCards, ...pendingCards].forEach((card) => merged.set(card.id, card));
      setQueuedCards(Array.from(merged.values()));
    };

    const flaggedQuery = query(collection(db, 'cards'), where('requiresAuthentication', '==', true));
    const pendingQuery = query(collection(db, 'cards'), where('verificationStatus', '==', 'pending_verification'));

    const unsubscribeFlagged = onSnapshot(flaggedQuery, (snapshot) => {
      flaggedCards = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      emit();
    });
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      pendingCards = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      emit();
    });

    return () => {
      unsubscribeFlagged();
      unsubscribePending();
    };
  }, [canAccess]);

  const resolveAuthentication = async (cardId, decision, reason) => {
    setBusyCardId(cardId);
    setActionError('');
    try {
      const response = await fetch('/api/clubs/resolve-authentication', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`
        },
        body: JSON.stringify({ cardId, decision, reason })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to resolve authentication.');
      }
    } catch (error) {
      setActionError(error.message || 'Unable to resolve authentication right now.');
    } finally {
      setBusyCardId(null);
    }
  };

  if (!canAccess) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[68] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="auth-queue-title">
      <div className="w-full max-w-xl bg-[#171A22] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="auth-queue-title" className="text-lg font-bold text-white">Authentication Queue</h3>
            <p className="text-xs text-white/60">Review cards flagged for physical/digital authentication.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-white/70 hover:text-white">
            Close
          </button>
        </div>

        {actionError && <p className="text-xs text-red-300">{actionError}</p>}

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {queuedCards.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
              No cards awaiting authentication.
            </div>
          ) : (
            queuedCards.map((card) => (
              <AuthenticationCard
                key={card.id}
                card={card}
                busyCardId={busyCardId}
                onPass={(cardId) => resolveAuthentication(cardId, 'pass')}
                onReject={(cardId, reason) => resolveAuthentication(cardId, 'reject', reason)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
