import React, { useState } from 'react';

export default function NotificationHub({ notifications, offers, currentUid, busy, error, onClose, onRead, onReadAll, onOpenOffer, onOpenClub }) {
  const [tab, setTab] = useState('activity');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const clubNotifications = notifications.filter((item) => item.clubId || String(item.type || '').startsWith('club'));
  const activity = (tab === 'clubs' ? clubNotifications : notifications).filter((item) => !unreadOnly || !item.read);
  const selectedOffers = offers.filter((offer) => tab === 'received' ? offer.toUserId === currentUid : offer.fromUserId === currentUid);
  const dateLabel = (value) => {
    const date = value?.toDate?.() || new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const counts = { activity: notifications.filter((item) => !item.read).length, received: offers.filter((offer) => offer.toUserId === currentUid && offer.status === 'pending').length, clubs: clubNotifications.filter((item) => !item.read).length };
  return <div className="fixed inset-0 z-[76] flex flex-col overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-labelledby="notification-hub-title">
    <header className="border-b border-white/10 px-4 pt-[max(1rem,env(safe-area-inset-top))]"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 pb-3"><h2 id="notification-hub-title" className="text-xl font-bold">Notification Hub</h2><button type="button" onClick={onClose} aria-label="Close notification hub" title="Close" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-xl">x</button></div></header>
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
      <div role="tablist" aria-label="Notification views" className="grid grid-cols-4 border-b border-white/10">
        {[['activity', 'Activity'], ['received', 'Received'], ['sent', 'Sent'], ['clubs', 'Clubs']].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} type="button" onClick={() => setTab(value)} className={`min-h-14 border-b-2 text-xs font-bold ${tab === value ? 'border-rose-500 text-white' : 'border-transparent text-white/50'}`}>{label}{counts[value] > 0 && <span className="ml-1 text-rose-300">{counts[value]}</span>}</button>)}
      </div>
      {error && <p role="alert" className="py-3 text-sm text-rose-300">{error}</p>}
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === 'activity' || tab === 'clubs' ? <>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3"><label className="flex min-h-11 items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Unread only</label><button type="button" disabled={Boolean(busy)} onClick={onReadAll} className="min-h-11 px-3 text-xs font-semibold text-emerald-300 disabled:opacity-50">Mark All Read</button></div>
          {!activity.length ? <p className="py-10 text-center text-sm text-white/50">No {unreadOnly ? 'unread ' : ''}notifications.</p> : activity.map((item) => <article key={`${item.persisted ? 'server' : 'local'}-${item.id}`} className={`mb-3 rounded-lg border p-4 ${item.read ? 'border-white/10 bg-zinc-950' : 'border-rose-500/30 bg-zinc-900'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-bold">{item.title || String(item.type || 'Update').replaceAll('_', ' ')}</h3><span className="text-[10px] text-white/40">{dateLabel(item.createdAt)}</span></div>
            <p className="mt-2 break-words text-sm text-white/65">{item.message}</p>
            {Array.isArray(item.comments) && item.comments.length > 0 && <details className="mt-3 text-xs text-white/65"><summary className="cursor-pointer">Table vote comments ({item.comments.length})</summary>{item.comments.map((comment, index) => <p key={`${comment.voterUid}-${index}`} className="mt-2 break-words"><strong>{comment.voterName || 'Trader'}:</strong> {comment.reason}</p>)}</details>}
            <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => onRead(item)} className="min-h-11 px-2 text-xs font-semibold text-white/80 disabled:opacity-50">{item.read ? 'Open' : 'Read / Open'}</button>{item.clubId && <button type="button" onClick={() => onOpenClub(item.clubId)} className="min-h-11 px-2 text-xs font-semibold text-emerald-300">Open Club Inbox</button>}</div>
          </article>)}
        </> : <div className="space-y-3 pt-4">{!selectedOffers.length ? <p className="py-10 text-center text-sm text-white/50">No {tab} offers.</p> : selectedOffers.map((offer) => <button key={offer.id} type="button" onClick={() => onOpenOffer(offer)} className="block w-full rounded-lg border border-white/10 bg-zinc-900 p-4 text-left hover:border-white/30"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{offer.cardTitle || 'Card trade'}</h3><span className="text-xs capitalize text-emerald-300">{offer.status || 'pending'}</span></div><p className="mt-2 text-xs text-white/55">{offer.dealType === 'pure_trade' ? `${(offer.cards || []).length} cards offered` : `Cash adjustment: $${Number(offer.cashAmount || offer.amount || 0).toFixed(2)}`} / {dateLabel(offer.createdAt)}</p><p className="mt-2 text-xs text-white/75">{tab === 'received' ? offer.fromUserName || 'Collector' : 'You'} offered</p></button>)}</div>}
      </div>
    </div>
  </div>;
}