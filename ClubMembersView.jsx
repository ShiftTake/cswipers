import React, { useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Check, X, UserRound } from 'lucide-react';

export default function ClubMembersView({ members, requests, currentUid, canManage, canModerate, busy, error, info, accessMode, initialRole = 'all', onBack, onRole, onCredits, onRemove, onBlock, onReport, onApprove, onReject }) {
  const [tab, setTab] = useState('members');
  const [role, setRole] = useState(initialRole);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState('');
  const matches = (record) => `${record.username || ''} ${record.displayName || ''} ${record.userName || ''} ${record.uid || record.userId || ''} ${record.email || record.userEmail || ''}`.toLowerCase().includes(search.trim().toLowerCase());
  const filtered = members.filter((member) => (role === 'all' || (member.role || 'member') === role) && matches(member));
  const pending = requests.filter(matches);
  const avatar = (record) => <div className="club-avatar">{record.profileImageUrl || record.photoURL || record.avatarUrl ? <img src={record.profileImageUrl || record.photoURL || record.avatarUrl} alt="" /> : <UserRound size={23} />}</div>;
  return <section className="club-fullscreen" aria-label="Members">
    <header className="club-screen-header"><button type="button" onClick={onBack} aria-label="Back to club room" title="Back to club room"><ArrowLeft size={22} /></button><h1>Members</h1><span /></header>
    <div className="club-screen-body">
      <div className="club-view-tabs" role="tablist" aria-label="Membership lists">
        <button type="button" role="tab" aria-selected={tab === 'members'} onClick={() => setTab('members')}>Member List <span>{members.length}</span></button>
        {canModerate && <button type="button" role="tab" aria-selected={tab === 'applicants'} onClick={() => setTab('applicants')}>Applicants <span>{requests.length}</span></button>}
      </div>
      {tab === 'members' ? <div className="club-segments" aria-label="Member role filter">{[['all', 'All'], ['owner', 'Owner'], ['agent', 'Agent'], ['member', 'Member']].map(([value, label]) => <button type="button" key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>)}</div> : <p className="club-policy">{accessMode === 'public' ? 'Public club · Members join directly' : 'Private club · Approval required'}</p>}
      <label className="club-search"><Search size={18} /><input type="search" aria-label="Search members by name or ID" placeholder="Search name or ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}{info && <p role="status" className="text-sm text-emerald-300">{info}</p>}
      <div className="club-member-list">
        {tab === 'members' ? filtered.map((member) => <article key={member.uid} className="club-member-row">
          <div className="club-member-identity">{avatar(member)}<div className="min-w-0 flex-1"><h2>{member.username ? `@${member.username}` : member.displayName || member.email || 'Collector'}</h2><p>ID: {member.uid}</p></div><span className="club-role">{member.role || 'member'}</span>{member.uid !== currentUid && <button type="button" aria-label={`Actions for ${member.displayName || member.uid}`} title="Member actions" aria-expanded={expanded === member.uid} onClick={() => setExpanded(expanded === member.uid ? '' : member.uid)} className="club-icon-button"><ChevronDown size={18} /></button>}</div>
          {expanded === member.uid && <div className="club-member-actions">
            {canManage && member.role !== 'owner' && <label>Role<select aria-label={`Role for ${member.displayName || member.uid}`} value={member.role || 'member'} disabled={Boolean(busy)} onChange={(event) => onRole(member.uid, event.target.value, member.agentUid || '')}><option value="member">Member</option><option value="agent">Agent</option></select></label>}
            {canManage && (member.role || 'member') === 'member' && <label>Assigned agent<select aria-label={`Assigned agent for ${member.displayName || member.uid}`} value={member.agentUid || ''} disabled={Boolean(busy)} onChange={(event) => onRole(member.uid, 'member', event.target.value)}><option value="">Unassigned</option>{members.filter((agent) => agent.role === 'agent' && (!agent.status || agent.status === 'active')).map((agent) => <option key={agent.uid} value={agent.uid}>{agent.displayName || agent.username || agent.uid}</option>)}</select></label>}
            <p className="w-full text-xs text-white/50">{member.credits === 'infinite' ? 'Unlimited credits' : `${Number(member.credits || 0)} credits`}</p>
            {canModerate && member.role !== 'owner' && <><button type="button" disabled={Boolean(busy) || (!canManage && member.role !== 'member')} onClick={() => onCredits(member)}>Add Credits</button><button type="button" disabled={Boolean(busy)} onClick={() => onRemove(member)} className="danger">Remove</button><button type="button" disabled={Boolean(busy)} onClick={() => onBlock(member, 'Manual moderator action')} className="danger">Block</button></>}
            <button type="button" disabled={Boolean(busy)} onClick={() => onReport(member)}>Report</button>
          </div>}
        </article>) : pending.map((request) => <article key={request.id} className="club-member-row"><div className="club-member-identity">{avatar(request)}<div className="min-w-0 flex-1"><h2>{request.userName || request.username || 'Collector'}</h2><p>ID: {request.userId}</p></div><span className="club-role">Pending</span></div><div className="club-applicant-actions"><button type="button" disabled={Boolean(busy)} onClick={() => onReject(request)}><X size={16} />Reject</button><button type="button" disabled={Boolean(busy)} onClick={() => onApprove(request)}><Check size={16} />{busy === `join-approve-${request.id}` ? 'Approving...' : 'Approve'}</button></div></article>)}
        {(tab === 'members' ? filtered : pending).length === 0 && <p className="club-empty">{search ? 'No matching collectors.' : tab === 'members' ? 'No members yet.' : 'No pending applicants.'}</p>}
      </div>
    </div>
  </section>;
}