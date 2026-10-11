import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Share2, Users, Shield, CalendarDays } from 'lucide-react';

const dateOf = (value) => {
  if (!value) return null;
  const date = new Date(value?.toDate?.() || value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function ClubAdminView({ club, members, events, loading, error, info, onBack, onNavigate, onShare }) {
  const [period, setPeriod] = useState('all');
  const within = (value) => {
    if (period === 'all') return true;
    const date = dateOf(value);
    const now = new Date();
    return date && (period === 'today' ? date.toDateString() === now.toDateString() : date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear());
  };
  const active = members.filter((member) => !member.status || member.status === 'active');
  const scopedEvents = events.filter((event) => within(event.scheduledFor || event.createdAt));
  return <section className="club-fullscreen" aria-label="Club Admin">
    <header className="club-screen-header"><button type="button" onClick={onBack} aria-label="Back to club room" title="Back to club room"><ArrowLeft size={22} /></button><h1>Club Admin</h1><span /></header>
    <div className="club-screen-body">
      <div className="club-admin-identity"><h2>{club.name}</h2><p>ID: {club.code || club.id}</p></div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}{info && <p role="status" className="mb-4 text-sm text-emerald-300">{info}</p>}
      <div className="club-admin-totals">{[['Active Members', active.length], ['Agents', active.filter((member) => member.role === 'agent').length], ['Live Tables', loading || error ? '--' : events.filter((event) => event.status === 'live').length]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
      <div className="club-admin-period"><h2>Club Activity</h2><div className="club-segments" aria-label="Activity period">{[['today', 'Today'], ['month', 'This Month'], ['all', 'All Time']].map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div></div>
      <div className="club-activity-summary"><div><span>New Members</span><strong>{members.filter((member) => within(member.joinedAt)).length}</strong></div><div><span>Trade Nights</span><strong>{loading || error ? '--' : scopedEvents.length}</strong></div><div><span>Registering</span><strong>{loading || error ? '--' : scopedEvents.filter((event) => event.status === 'registration').length}</strong></div>{loading && <p role="status" className="py-2 text-xs text-white/50">Loading activity...</p>}</div>
      <nav className="club-admin-menu" aria-label="Club management">{[['share', 'Invite & Share', Share2], ['members', 'Member Management', Users], ['agents', 'Agent Management', Shield], ['scheduled', 'Scheduled Trade Nights', CalendarDays]].map(([route, label, Icon]) => <button key={route} type="button" onClick={() => route === 'share' ? onShare() : onNavigate(route)}><Icon size={21} /><span>{label}</span><ChevronRight size={19} /></button>)}</nav>
    </div>
  </section>;
}