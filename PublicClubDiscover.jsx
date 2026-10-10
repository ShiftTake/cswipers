import React from 'react';
import { CLUB_CATEGORIES, DEFAULT_CLUB_FILTERS, filterPublicClubs, clubIsLive, getClubCategories } from './clubDiscovery.mjs';

export default function PublicClubDiscover({ clubs, filters, onFilter, onOpen, loading, error }) {
  const publicClubs = filterPublicClubs(clubs, filters);
  return <section aria-label="Public club Discover" className="mb-5 border-b border-white/10 pb-5">
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-bold">Public Clubs</h2><span className="text-xs text-white/50">{publicClubs.length} clubs</span></div>
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input type="search" aria-label="Search public clubs" value={filters.search} onChange={(event) => onFilter({ ...filters, search: event.target.value })} placeholder="Search clubs" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-base" />
      <select aria-label="Club category" value={filters.category} onChange={(event) => onFilter({ ...filters, category: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm"><option value="all">All categories</option>{CLUB_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
      <select aria-label="Trade Night status" value={filters.tradeNightStatus} onChange={(event) => onFilter({ ...filters, tradeNightStatus: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm"><option value="all">All Trade Nights</option><option value="live">Live now</option><option value="idle">Not live</option></select>
      <input type="number" min="0" aria-label="Minimum club members" value={filters.minMembers} onChange={(event) => onFilter({ ...filters, minMembers: event.target.value })} placeholder="Min members" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-base" />
    </div>
    {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : loading ? <p role="status" className="py-4 text-sm text-white/50">Loading public clubs...</p> : !publicClubs.length ? <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-white/50"><p>No public clubs match.</p><button type="button" onClick={() => onFilter(DEFAULT_CLUB_FILTERS)} className="min-h-11 px-3 text-white">Clear Filters</button></div> : <div className="flex gap-3 overflow-x-auto pb-1">
      {publicClubs.map((club) => <button key={club.id} type="button" onClick={() => onOpen(club)} className="flex w-64 shrink-0 items-center gap-3 rounded-lg border border-white/10 bg-zinc-900 p-3 text-left hover:border-emerald-400/50">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">{club.logoUrl ? <img src={club.logoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-black text-emerald-300">{String(club.name || 'CS').slice(0, 2).toUpperCase()}</span>}</div>
        <div className="min-w-0"><h3 className="truncate text-sm font-bold">{club.name}</h3><p className="mt-1 truncate text-xs text-white/50">{getClubCategories(club).join(', ') || 'Trading cards'}</p><p className="mt-1 text-xs text-white/65">{Number(club.memberCount ?? club.membersCount ?? 0)} members {clubIsLive(club) && <span className="ml-1 font-bold text-emerald-300">Live</span>}</p></div>
      </button>)}
    </div>}
  </section>;
}