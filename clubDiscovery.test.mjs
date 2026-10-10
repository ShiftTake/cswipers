import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPublicClubs, DEFAULT_CLUB_FILTERS } from './clubDiscovery.mjs';
const clubs = [
  { id: 'private', accessMode: 'private', name: 'Baseball' },
  { id: 'live', accessMode: 'public', name: 'Collectors', categories: ['Baseball'], memberCount: 20, tradeNightSummary: { liveCount: 1 } },
  { id: 'idle', visibility: 'auto-join', name: 'TCG', category: 'Pokemon', membersCount: 5 }
];
test('Discover excludes private clubs and supports legacy public visibility', () => {
  assert.deepEqual(filterPublicClubs(clubs, DEFAULT_CLUB_FILTERS).map((club) => club.id), ['live', 'idle']);
});
test('Discover combines category, live, search and member filters', () => {
  assert.deepEqual(filterPublicClubs(clubs, { search: 'collect', category: 'Baseball', tradeNightStatus: 'live', minMembers: '10' }).map((club) => club.id), ['live']);
  assert.equal(filterPublicClubs(clubs, { ...DEFAULT_CLUB_FILTERS, minMembers: '30' }).length, 0);
  assert.deepEqual(filterPublicClubs(clubs, { ...DEFAULT_CLUB_FILTERS, tradeNightStatus: 'idle' }).map((club) => club.id), ['idle']);
});