import React, { useState } from 'react';
import { Users, Inbox, Menu, X, Shield, CalendarDays, MessageCircle, LayoutList } from 'lucide-react';

export default function ClubRoomNav({ value, onChange, inboxCount = 0, canManage = false }) {
  const [open, setOpen] = useState(false);
  const select = (tab) => { onChange(tab); setOpen(false); };
  return <>
    <nav aria-label="Club room views" className="grid grid-cols-3 border-b border-white/10">
      {[['tradenight', 'Trade Nights', CalendarDays], ['chat', 'Chat', MessageCircle], ['feed', 'Feed', LayoutList]].map(([tab, label, Icon]) => <button key={tab} type="button" aria-current={value === tab ? 'page' : undefined} onClick={() => select(tab)} className={`flex min-h-14 min-w-0 items-center justify-center gap-2 border-b-2 px-1 text-xs font-semibold ${value === tab ? 'border-emerald-400 text-white' : 'border-transparent text-white/50 hover:text-white'}`}><Icon size={16} />{label}</button>)}
    </nav>
    <div className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] right-5 z-40 flex flex-col items-end gap-3">
      {open && <nav aria-label="Club actions" className="w-56 rounded-lg border border-white/15 bg-[#18181b] p-2 shadow-2xl">
        {[...(canManage ? [['admin', 'Club Admin', Shield]] : []), ['members', 'Members', Users], ['inbox', 'Inbox', Inbox]].map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => select(tab)} className="flex min-h-12 w-full items-center gap-3 rounded px-3 text-sm text-white hover:bg-white/10"><Icon size={18} className="text-emerald-400" />{label}{tab === 'inbox' && inboxCount > 0 && <span className="ml-auto text-rose-300">{inboxCount}</span>}</button>)}
      </nav>}
      <button type="button" aria-label={open ? 'Close club actions' : 'Open club actions'} title="Club actions" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-500 text-black shadow-xl">{open ? <X size={24} /> : <Menu size={24} />}</button>
    </div>
  </>;
}