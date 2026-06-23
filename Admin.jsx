import React from 'react';

export default function AdminPanel({
  adminSearch,
  setAdminSearch,
  totalUsers,
  activeUsers,
  deactivatedUsers,
  adminUsersError,
  flaggedCards,
  flaggedCardsError,
  flaggedCardsLoading,
  handleDeleteFlaggedCard,
  handleDeleteFlagRecord,
  adminUsersLoading,
  filteredAdminUsers,
  firebaseUser,
  adminActionUserId,
  handleToggleUserStatus
}) {
  return (
    <div className="space-y-6 py-3 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Admin Management</h2>
          <p className="text-sm text-red-100">View user accounts, monitor totals, and manage account access.</p>
        </div>
        <input
          type="text"
          value={adminSearch}
          onChange={(e) => setAdminSearch(e.target.value)}
          placeholder="Search by email, name, or uid"
          className="w-full md:w-80 px-4 py-2.5 bg-red-950/70 border border-red-400/30 rounded-xl text-sm focus:outline-none focus:border-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Users on Platform</p>
          <p className="text-3xl font-bold mt-2">{totalUsers}</p>
        </div>
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Active Accounts</p>
          <p className="text-3xl font-bold mt-2">{activeUsers}</p>
        </div>
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Blocked Accounts</p>
          <p className="text-3xl font-bold mt-2">{deactivatedUsers}</p>
        </div>
      </div>

      {adminUsersError && (
        <div className="text-sm text-red-200 bg-red-900/40 border border-red-400/30 rounded-xl p-3">{adminUsersError}</div>
      )}

      <div className="border-t border-white/10 pt-8 mt-8">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          Reported Cards
          {flaggedCards.length > 0 && <span className="px-2 py-1 rounded-full bg-red-600 text-xs font-semibold">{flaggedCards.length}</span>}
        </h3>

        {flaggedCardsError && (
          <div className="text-sm text-red-200 bg-red-900/40 border border-red-400/30 rounded-xl p-3 mb-4">{flaggedCardsError}</div>
        )}

        {flaggedCardsLoading ? (
          <div className="p-4 text-sm text-red-100">Loading flagged cards...</div>
        ) : flaggedCards.length === 0 ? (
          <div className="p-4 text-sm text-red-100 bg-red-950/30 border border-red-400/20 rounded-xl">No flagged cards to review.</div>
        ) : (
          <div className="space-y-3">
            {flaggedCards.map((flag) => (
              <div key={flag.id} className="bg-red-950/40 border border-red-400/30 rounded-xl p-4">
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-8 space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-red-200">Card</p>
                      <p className="font-semibold text-white">{flag.cardTitle || 'Unknown Card'}</p>
                      <p className="text-xs text-red-300">Owner: {flag.cardOwnerName}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-red-200 mt-2">Report Reason</p>
                      <p className="text-sm text-white/80">{flag.reason}</p>
                    </div>
                    <div className="text-xs text-red-300">
                      Flagged by: {flag.flaggedByEmail} {' '}<span aria-hidden="true">•</span>{' '}
                      {flag.flaggedAt?.seconds ? new Date(flag.flaggedAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div className="col-span-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteFlaggedCard(flag.id, flag.cardId)}
                      className="text-xs px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
                    >
                      Delete Card
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFlagRecord(flag.id)}
                      className="text-xs px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-medium"
                    >
                      Clear Flag
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-8 mt-8">
        <h3 className="text-xl font-bold mb-4">User Management</h3>

        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-red-200 border-b border-red-500/30 font-bold">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Created</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {adminUsersLoading ? (
            <div className="p-4 text-sm text-red-100">Loading users...</div>
          ) : filteredAdminUsers.length === 0 ? (
            <div className="p-4 text-sm text-red-100">No users found for the current filter.</div>
          ) : (
            filteredAdminUsers.map((userRecord) => {
              const createdDate = userRecord.createdAt?.seconds
                ? new Date(userRecord.createdAt.seconds * 1000).toLocaleDateString()
                : 'N/A';
              const status = userRecord.status || 'active';
              const isSelf = userRecord.uid === firebaseUser?.uid;
              const isProcessing = adminActionUserId === userRecord.uid;

              return (
                <div key={userRecord.uid || userRecord.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-red-500/20 items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="font-semibold truncate">{userRecord.email || 'No email'}</p>
                    <p className="text-xs text-red-200 truncate">{userRecord.uid}</p>
                    {userRecord.location && <p className="text-xs text-red-300 truncate">Location: {userRecord.location}</p>}
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/20 uppercase">{userRecord.role || 'user'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs px-2 py-1 rounded-lg uppercase ${status === 'deactivated' ? 'bg-red-800/50 border border-red-300/30' : 'bg-emerald-800/40 border border-emerald-300/30'}`}>
                      {status}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-red-100">{createdDate}</div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(userRecord)}
                      disabled={isSelf || isProcessing}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSelf ? 'Current User' : isProcessing ? 'Saving...' : status === 'deactivated' ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
