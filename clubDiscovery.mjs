export const CLUB_CATEGORIES = ['Baseball', 'Basketball', 'Football', 'Hockey', 'Soccer', 'Pokemon', 'Magic', 'Yu-Gi-Oh', 'One Piece', 'Other'];
export const DEFAULT_CLUB_FILTERS = { search: '', category: 'all', tradeNightStatus: 'all', minMembers: '' };
export const isPublicClub = (club) => ['public', 'auto-join'].includes(String(club.accessMode || club.visibility || 'private').toLowerCase());
export const clubIsLive = (club) => Boolean(club.tradeNightSummary?.liveCount > 0);
export const getClubCategories = (club) => Array.isArray(club.categories) && club.categories.length ? club.categories : [club.category, club.brand].filter(Boolean);
export const filterPublicClubs = (clubs, filters) => clubs.filter((club) => {
  if (!isPublicClub(club)) return false;
  const search = String(filters.search || '').trim().toLowerCase();
  const live = clubIsLive(club);
  return (!search || `${club.name || ''} ${club.description || ''}`.toLowerCase().includes(search))
    && (filters.category === 'all' || getClubCategories(club).some((category) => String(category).toLowerCase() === filters.category.toLowerCase()))
    && (filters.tradeNightStatus === 'all' || (filters.tradeNightStatus === 'live' ? live : !live))
    && (!filters.minMembers || Number(club.memberCount ?? club.membersCount ?? 0) >= Number(filters.minMembers));
});