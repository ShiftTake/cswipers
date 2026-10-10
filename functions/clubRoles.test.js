const test = require('node:test');
const assert = require('node:assert/strict');
const { validateClubMemberUpdate } = require('./clubRoles');
const base = { actorUid: 'owner', actor: { role: 'owner', status: 'active' }, memberUid: 'player', member: { role: 'member', status: 'active' }, role: 'member' };
test('role updates allow owner assignment to an active agent', () => {
  assert.deepEqual(validateClubMemberUpdate({ ...base, agentUid: 'agent', agent: { role: 'agent' } }), { role: 'member', agentUid: 'agent' });
  assert.deepEqual(validateClubMemberUpdate({ ...base, role: 'agent' }), { role: 'agent', agentUid: null });
});
test('role updates reject unauthorized, inactive and owner targets', () => {
  for (const override of [{ actor: { role: 'agent' } }, { actor: { role: 'owner', status: 'banned' } }, { member: { role: 'owner' } }, { memberUid: 'owner' }, { member: { role: 'member', status: 'banned' } }, { role: 'owner' }, { role: 'super_agent' }]) assert.throws(() => validateClubMemberUpdate({ ...base, ...override }));
});
test('agent assignments reject self, non-agents and inactive agents', () => {
  for (const override of [{ agentUid: 'player', agent: { role: 'agent' } }, { agentUid: 'agent', agent: { role: 'member' } }, { agentUid: 'agent', agent: { role: 'agent', status: 'banned' } }, { role: 'agent', agentUid: 'agent', agent: { role: 'agent' } }]) assert.throws(() => validateClubMemberUpdate({ ...base, ...override }));
});