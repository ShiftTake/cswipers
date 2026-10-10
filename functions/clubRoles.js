function validateClubMemberUpdate({ actorUid, actor, memberUid, member, role, agentUid, agent }) {
  if (actor?.role !== 'owner' || (actor.status && actor.status !== 'active')) throw new Error('Only an active club owner can manage roles.');
  if (!member || (member.status && member.status !== 'active')) throw new Error('An active member is required.');
  if (memberUid === actorUid || member.role === 'owner') throw new Error('The club owner cannot be reassigned.');
  if (!['agent', 'member'].includes(role)) throw new Error('Choose agent or member.');
  if (agentUid && (role !== 'member' || agentUid === memberUid || agent?.role !== 'agent' || (agent.status && agent.status !== 'active'))) throw new Error('Members can only be assigned to an active club agent.');
  return { role, agentUid: role === 'member' ? agentUid || null : null };
}

module.exports = { validateClubMemberUpdate };