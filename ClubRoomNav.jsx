import React from 'react';

export default function ClubRoomNav({ value, onChange, inboxCount = 0 }) {
  return <nav aria-label="Club room views" className="grid grid-cols-5 border-b border-white/10">
    {[['tradenight', 'Trade Night'], ['chat', 'Chat'], ['feed', 'Feed'], ['members', 'Members'], ['inbox', 'Inbox']].map(([tab, label]) => <button key={tab} type="button" aria-current={value === tab ? 'page' : undefined} onClick={() => onChange(tab)} className={`min-h-14 min-w-0 border-b-2 px-1 text-[11px] font-bold ${value === tab ? 'border-emerald-400 text-white' : 'border-transparent text-white/50 hover:text-white'}`}>{label}{tab === 'inbox' && inboxCount > 0 && <span className="ml-1 text-rose-300">{inboxCount}</span>}</button>)}
  </nav>;
}