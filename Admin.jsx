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
  handleToggleUserStatus,
  marketplaceTotals,
  premiumMRR,
  verifiedSellerCount,
  currentEscrowTotal,
  marketplaceStatsByUser,
  ratingStatsByUser,
  sellerVerifications,
  premiumSubscriptions,
  handleAdminReviewVerification
}) {
  const formatMoney = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(Number(value || 0));

  const activePremiumCount = (premiumSubscriptions || []).filter((subscription) => {
    const status = String(subscription.status || '').toLowerCase();
    return !status || status === 'active';
  }).length;

  return (
    <div className="space-y-6 py-3 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Admin Management</h2>
          <p className="text-sm text-red-100">Review users, verification queue, and payment pipeline health.</p>
        </div>
        <input
          type="text"
          value={adminSearch}
          onChange={(e) => setAdminSearch(e.target.value)}
          placeholder="Search by email, name, or uid"
          className="w-full md:w-80 px-4 py-2.5 bg-red-950/70 border border-red-400/30 rounded-xl text-sm focus:outline-none focus:border-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
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
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Total Sales</p>
          <p className="text-3xl font-bold mt-2">{formatMoney(marketplaceTotals?.totalSales)}</p>
        </div>
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Escrow Total</p>
          <p className="text-3xl font-bold mt-2">{formatMoney(currentEscrowTotal)}</p>
        </div>
        <div className="bg-red-950/70 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Platform Fees</p>
          <p className="text-3xl font-bold mt-2">{formatMoney(marketplaceTotals?.platformFees)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Verified Sellers</p>
          <p className="text-3xl font-bold mt-2">{verifiedSellerCount || 0}</p>
        </div>
        <div className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Premium MRR</p>
          <p className="text-3xl font-bold mt-2">{formatMoney(premiumMRR)}</p>
          <p className="text-xs text-red-200 mt-2">Active premium accounts: {activePremiumCount}</p>
        </div>
        <div className="bg-red-950/50 border border-red-400/30 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-red-200">Seller Payouts</p>
          <p className="text-3xl font-bold mt-2">{formatMoney(marketplaceTotals?.sellerPayouts)}</p>
        </div>
      </div>

      {adminUsersError && (
        <div className="text-sm text-red-200 bg-red-900/40 border border-red-400/30 rounded-xl p-3">{adminUsersError}</div>
      )}

      <div className="border-t border-white/10 pt-8 mt-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-xl font-bold">Verification Queue</h3>
          <span className="text-xs uppercase tracking-widest text-red-200">{sellerVerifications?.length || 0} records</span>
        </div>
        {sellerVerifications?.length > 0 ? (
          <div className="space-y-3">
            {sellerVerifications
              .slice()
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              .slice(0, 15)
              .map((record) => {
                const status = String(record.status || 'pending').toLowerCase();
                const isPending = status === 'pending';
                const verificationTypes = Array.isArray(record.verificationTypes) ? record.verificationTypes : [];

                return (
                  <div key={record.id} className="bg-red-950/50 border border-red-400/20 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{record.legalName || record.email || record.userEmail || 'Verification request'}</p>
                        <p className="text-xs text-red-200 mt-1">
                          {record.email || record.userEmail || 'No email'} · {record.phone || 'No phone'}
                        </p>
                        <p className="text-xs text-red-200 mt-1">
                          Type: {verificationTypes.length > 0 ? verificationTypes.join(', ') : 'buyer, seller'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-red-100">
                        <p>Status: {status}</p>
                        <p>
                          Submitted: {record.createdAt?.seconds ? new Date(record.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {record.verificationDocumentUrl && (
                      <a
                        href={record.verificationDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs hover:bg-white/20"
                      >
                        View Uploaded ID
                      </a>
                    )}

                    {isPending && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdminReviewVerification(record, 'verified')}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminReviewVerification(record, 'rejected')}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="p-4 text-sm text-red-100 bg-red-950/30 border border-red-400/20 rounded-xl">No verification requests yet.</div>
        )}
      </div>

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
                      Flagged by: {flag.flaggedByEmail} <span aria-hidden="true">•</span>{' '}
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
            <div className="col-span-3">User</div>
            <div className="col-span-1">Role</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Verification</div>
            <div className="col-span-2">Sales</div>
            <div className="col-span-1">Ratings</div>
            <div className="col-span-1">Created</div>
            <div className="col-span-1 text-right">Actions</div>
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
              const userMetrics = marketplaceStatsByUser?.[userRecord.uid] || { salesTotal: 0, orderCount: 0 };
              const userRatings = ratingStatsByUser?.[userRecord.uid] || {};
              const buyerRating = userRatings.buyer;
              const sellerRating = userRatings.seller;

              return (
                <div key={userRecord.uid || userRecord.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-red-500/20 items-center">
                  <div className="col-span-3 min-w-0">
                    <p className="font-semibold truncate">{userRecord.email || 'No email'}</p>
                    <p className="text-xs text-red-200 truncate">{userRecord.uid}</p>
                    {userRecord.location && <p className="text-xs text-red-300 truncate">Location: {userRecord.location}</p>}
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/20 uppercase">{userRecord.role || 'user'}</span>
                  </div>
                  <div className="col-span-1">
                    <span className={`text-xs px-2 py-1 rounded-lg uppercase ${status === 'deactivated' ? 'bg-red-800/50 border border-red-300/30' : 'bg-emerald-800/40 border border-emerald-300/30'}`}>
                      {status}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-red-100">
                    <p>Buyer: {userRecord.buyerVerificationStatus || userRecord.verificationStatus || 'unverified'}</p>
                    <p>Seller: {userRecord.sellerVerificationStatus || userRecord.verificationStatus || 'unverified'}</p>
                  </div>
                  <div className="col-span-2 text-xs text-red-100">
                    <p className="font-semibold text-white">{formatMoney(userMetrics.salesTotal)}</p>
                    <p className="text-red-200">{userMetrics.orderCount || 0} orders</p>
                  </div>
                  <div className="col-span-1 text-xs text-red-100">
                    <p>B: {buyerRating?.count ? `${buyerRating.average.toFixed(1)}★` : 'N/A'}</p>
                    <p>S: {sellerRating?.count ? `${sellerRating.average.toFixed(1)}★` : 'N/A'}</p>
                  </div>
                  <div className="col-span-1 text-xs text-red-100">{createdDate}</div>
                  <div className="col-span-1 flex justify-end">
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
