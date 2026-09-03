import React, { useEffect, useState } from 'react';
import { getAuthenticationQueue, reviewCardAuthentication } from './authenticationService';

export default function AuthenticationQueue({ firebaseUser, onClose }) {
  const [queue, setQueue] = useState([]);
  const [busyCardId, setBusyCardId] = useState(null);
  const [notesByCard, setNotesByCard] = useState({});
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const unsubscribe = getAuthenticationQueue(setQueue);
    return unsubscribe;
  }, []);

  const handleDecision = async (cardId, decision) => {
    setBusyCardId(cardId);
    setActionError('');
    try {
      await reviewCardAuthentication({ firebaseUser, cardId, decision, notes: notesByCard[cardId] || '' });
    } catch (error) {
      setActionError(error.message || 'Unable to submit authentication decision.');
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[68] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="auth-queue-title">
      <div className="w-full max-w-2xl bg-[#171A22] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="auth-queue-title" className="text-lg font-bold text-white">Authentication Queue</h3>
            <p className="text-xs text-white/60">Review high-value cards flagged for authentication before checkout.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-white/70 hover:text-white">
            Close
          </button>
        </div>

        {actionError && <p className="text-xs text-red-300">{actionError}</p>}

        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {queue.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
              No cards are currently awaiting authentication.
            </div>
          ) : (
            queue.map((card) => {
              const isBusy = busyCardId === card.id;
              return (
                <div key={card.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{card.name || card.title || 'Untitled Card'}</p>
                      <p className="text-xs text-white/60">
                        {card.brand || ''} {card.condition ? `· ${card.condition}` : ''}
                      </p>
                      <p className="text-xs text-white/60">Value: {card.tradeValue || card.value || 'N/A'}</p>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-yellow-500/15 text-yellow-300 border-yellow-500/30">
                      Pending Verification
                    </span>
                  </div>

                  <textarea
                    value={notesByCard[card.id] || ''}
                    onChange={(event) => setNotesByCard((prev) => ({ ...prev, [card.id]: event.target.value }))}
                    placeholder="Authentication notes (optional)"
                    rows={2}
                    className="w-full rounded-lg bg-black/30 border border-white/15 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDecision(card.id, 'pass')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Pass / Authenticated
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDecision(card.id, 'reject')}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Reject / Fail
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
