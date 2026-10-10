const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function createBackend(seed = {}) {
  const records = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const listeners = {};
  const timestamp = (value) => ({ toMillis: () => value, toDate: () => new Date(value) });
  const snapshot = (key) => ({ id: key.split('/').at(-1), exists: records.has(key), data: () => records.get(key) });
  const reference = (key, filters = []) => ({
    path: key,
    filters,
    doc: (id) => reference(`${key}/${id}`),
    collection: (name) => reference(`${key}/${name}`),
    where: (field, operator, value) => reference(key, [...filters, { field, operator, value }])
  });
  const database = {
    collection: (name) => reference(name),
    runTransaction: async (callback) => {
      const writes = [];
      const result = await callback({
        get: async (ref) => {
          assert.equal(writes.length, 0, 'Firestore reads must precede writes');
          if (ref.path.split('/').length % 2 === 0) return snapshot(ref.path);
          const docs = [...records.keys()].filter((key) => key.startsWith(`${ref.path}/`) && key.split('/').length === ref.path.split('/').length + 1)
            .filter((key) => ref.filters.every(({ field, operator, value }) => operator === 'in' ? value.includes(records.get(key)[field]) : records.get(key)[field] === value)).map(snapshot);
          return { docs, size: docs.length };
        },
        set: (ref, value) => writes.push(() => records.set(ref.path, value)),
        update: (ref, value) => writes.push(() => {
          assert.ok(records.has(ref.path), 'updated record must exist');
          records.set(ref.path, { ...records.get(ref.path), ...value });
        }),
        delete: (ref) => writes.push(() => records.delete(ref.path))
      });
      writes.forEach((write) => write());
      return result;
    }
  };
  const firestore = Object.assign(() => database, { FieldValue: { serverTimestamp: () => 123 }, Timestamp: { fromMillis: timestamp, now: () => timestamp(123) } });
  const wrap = (...args) => args.at(-1);
  const context = {
    exports: listeners,
    console: { error() {}, log() {} },
    process: { env: {} },
    require: (name) => {
      if (name === 'firebase-admin') return { initializeApp() {}, firestore, auth: () => ({ verifyIdToken: async (uid) => ({ uid, email: `${uid}@example.test` }) }) };
      if (name === 'firebase-functions/v2/https') return { onRequest: wrap };
      if (name === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
      if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: wrap, onDocumentWritten: wrap };
      if (name === 'firebase-functions/params') return { defineSecret: (name) => name };
      if (name.startsWith('./')) return require(path.join(__dirname, name));
      if (name === 'crypto') return require(name);
      throw new Error(`Unexpected dependency during club action: ${name}`);
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context);
  const invoke = async (name, uid, body) => {
    const response = { set() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await listeners[name]({ method: 'POST', headers: { authorization: uid ? `Bearer ${uid}` : '' }, body }, response);
    return response;
  };
  return { records, listeners, invoke, context };
}

const club = { ownerUid: 'owner', accessMode: 'public', memberCount: 2, creditLedger: { memberBalances: { player: { role: 'member', credits: 80, escrowHeld: 20 } } } };
const seed = {
  'clubs/club': club,
  'clubs/club/members/owner': { role: 'owner', status: 'active', credits: 'infinite' },
  'clubs/club/members/player': { role: 'member', status: 'active', credits: 80, escrowHeld: 20 },
  'clubs/club/members/agent': { role: 'agent', status: 'active', credits: 100 },
  'users/new': { displayName: 'New Collector' }
};

test('public joins are idempotent and cannot overwrite owner roles or balances', async () => {
  const backend = createBackend(seed);
  assert.equal((await backend.invoke('clubMembershipAction', 'new', { clubId: 'club', action: 'join' })).code, 200);
  assert.equal((await backend.invoke('clubMembershipAction', 'new', { clubId: 'club', action: 'join' })).code, 200);
  assert.equal(backend.records.get('clubs/club').memberCount, 3);
  assert.equal((await backend.invoke('clubMembershipAction', 'owner', { clubId: 'club', action: 'join' })).code, 200);
  assert.deepEqual(backend.records.get('clubs/club/members/owner'), seed['clubs/club/members/owner']);
});

test('joins reject unauthenticated, private and banned callers without writes', async () => {
  for (const addition of [{}, { 'clubs/club': { ...club, accessMode: 'private' } }, { 'clubs/club/bans/new': { reason: 'Blocked' } }]) {
    const backend = createBackend({ ...seed, ...addition });
    const result = await backend.invoke('clubMembershipAction', Object.keys(addition).length ? 'new' : '', { clubId: 'club', action: 'join' });
    assert.equal(result.code, 400);
    assert.equal(backend.records.has('clubs/club/members/new'), false);
  }
});

test('agent approval assigns the agent, updates count once and consumes the request', async () => {
  const backend = createBackend({ ...seed, 'clubs/club/joinRequests/request': { userId: 'new', userName: 'New Collector', status: 'pending' } });
  assert.equal((await backend.invoke('clubMembershipAction', 'agent', { clubId: 'club', action: 'approve', requestId: 'request' })).code, 200);
  assert.equal(backend.records.get('clubs/club/members/new').agentUid, 'agent');
  assert.equal(backend.records.get('clubs/club').memberCount, 3);
  assert.equal(backend.records.has('clubs/club/joinRequests/request'), false);
  assert.equal((await backend.invoke('clubMembershipAction', 'agent', { clubId: 'club', action: 'approve', requestId: 'request' })).code, 400);
});

test('non-moderators cannot approve requests and rejection preserves member balances', async () => {
  const backend = createBackend({ ...seed, 'clubs/club/joinRequests/request': { userId: 'player', status: 'pending' } });
  assert.equal((await backend.invoke('clubMembershipAction', 'player', { clubId: 'club', action: 'approve', requestId: 'request' })).code, 400);
  assert.equal((await backend.invoke('clubMembershipAction', 'owner', { clubId: 'club', action: 'reject', requestId: 'request' })).code, 200);
  assert.deepEqual(backend.records.get('clubs/club/members/player'), seed['clubs/club/members/player']);
});

test('role updates keep credits and escrow intact and reject non-owners', async () => {
  const backend = createBackend(seed);
  assert.equal((await backend.invoke('updateClubMemberRole', 'agent', { clubId: 'club', memberUid: 'player', role: 'agent' })).code, 400);
  assert.equal((await backend.invoke('updateClubMemberRole', 'owner', { clubId: 'club', memberUid: 'player', role: 'agent' })).code, 200);
  const member = backend.records.get('clubs/club/members/player');
  assert.equal(member.role, 'agent');
  assert.equal(member.credits, 80);
  assert.equal(member.escrowHeld, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(backend.records.get('clubs/club').creditLedger.memberBalances.player)), { role: 'agent', credits: 80, escrowHeld: 20 });
});

test('agent demotion requires all assigned members to be reassigned first', async () => {
  const backend = createBackend({
    ...seed,
    'clubs/club': { ...club, creditLedger: { memberBalances: { ...club.creditLedger.memberBalances, agent: { role: 'agent', credits: 100, escrowHeld: 10 } } } },
    'clubs/club/members/agent': { ...seed['clubs/club/members/agent'], escrowHeld: 10 },
    'clubs/club/members/player': { ...seed['clubs/club/members/player'], agentUid: 'agent' },
    'clubs/club/members/inactive': { role: 'member', status: 'inactive', agentUid: 'agent' },
    'clubs/club/members/replacement': { role: 'agent', status: 'active' },
    'clubs/other/members/player': { role: 'member', agentUid: 'agent' }
  });
  const before = structuredClone([...backend.records]);
  const demotion = { clubId: 'club', memberUid: 'agent', role: 'member' };
  const rejected = await backend.invoke('updateClubMemberRole', 'owner', demotion);
  assert.equal(rejected.code, 400);
  assert.match(rejected.payload.error, /reassign.*members first/i);
  assert.deepEqual([...backend.records], before);
  assert.equal((await backend.invoke('updateClubMemberRole', 'owner', { clubId: 'club', memberUid: 'player', role: 'member', agentUid: 'replacement' })).code, 200);
  assert.equal((await backend.invoke('updateClubMemberRole', 'owner', demotion)).code, 400);
  backend.records.set('clubs/club/members/inactive', { role: 'member', status: 'inactive', agentUid: 'replacement' });
  assert.equal((await backend.invoke('updateClubMemberRole', 'owner', demotion)).code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(backend.records.get('clubs/club/members/agent'))), { role: 'member', status: 'active', credits: 100, escrowHeld: 10, agentUid: null, updatedAt: 123 });
  assert.deepEqual(JSON.parse(JSON.stringify(backend.records.get('clubs/club').creditLedger.memberBalances.agent)), { role: 'member', credits: 100, escrowHeld: 10 });
});

test('public event summaries contain counts only and refresh on event deletion', async () => {
  const backend = createBackend({ ...seed, 'clubs/club/events/live': { status: 'live', table: { private: true } }, 'clubs/club/events/open': { status: 'registration' } });
  await backend.listeners.onClubTradeNightStatus({ params: { clubId: 'club' } });
  assert.deepEqual(JSON.parse(JSON.stringify(backend.records.get('clubs/club').tradeNightSummary)), { liveCount: 1, registrationCount: 1 });
  backend.records.delete('clubs/club/events/live');
  await backend.listeners.onClubTradeNightStatus({ params: { clubId: 'club' } });
  assert.equal(backend.records.get('clubs/club').tradeNightSummary.liveCount, 0);
});

test('poker dealer rotates through every recipient before the next dealer', () => {
  const { context } = createBackend();
  let table = { seats: ['first', 'second', 'third'], dealerSeat: 0, targetOffset: 1, round: 1, orbit: 1 };
  assert.equal(context.getTableTurn(table).recipientUid, 'second');
  table = context.advanceTable(table, 100);
  assert.equal(context.getTableTurn(table).vendorUid, 'first');
  assert.equal(context.getTableTurn(table).recipientUid, 'third');
  table = context.advanceTable(table, 200);
  assert.equal(context.getTableTurn(table).vendorUid, 'second');
  for (let turn = 0; turn < 4; turn += 1) table = context.advanceTable(table, 300 + turn);
  assert.equal(context.getTableTurn(table).vendorUid, 'first');
  assert.equal(table.orbit, 2);
});

test('poker entry criteria still require both card count and binder value', () => {
  const { context } = createBackend();
  assert.equal(context.evaluateBinderCriteria([{ value: 1000 }], { minCardCount: 6, minBinderValue: 500 }).ok, false);
  assert.equal(context.evaluateBinderCriteria(Array.from({ length: 6 }, () => ({ value: 100 })), { minCardCount: 6, minBinderValue: 500 }).ok, true);
});