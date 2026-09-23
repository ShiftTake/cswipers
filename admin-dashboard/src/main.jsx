import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Flag,
  Gavel,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Vault,
  WalletCards,
  X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { firebaseAuth, firestore } from './firebaseAdmin';
import './styles.css';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
const toDate = (value) => value?.toDate?.() || (value ? new Date(value) : null);
const dateLabel = (value) => toDate(value)?.toLocaleDateString() || 'Date unavailable';
const statusText = (value) => String(value || 'unknown').replaceAll('_', ' ');
const centsOrDollars = (value) => Number(value || 0) / (Number(value || 0) > 10000 ? 100 : 1);

function normalizeAddress(address = {}) {
  const line1 = address.line1 || address.street || address.street1 || '';
  const city = address.city || '';
  const state = address.state || '';
  const zip = address.postal_code || address.zip || '';
  const country = address.country || 'US';
  return [line1, [city, state, zip].filter(Boolean).join(', '), country].filter(Boolean).join(' | ');
}

function normalizeOrder(record) {
  return {
    ...record,
    orderId: record.order_id || record.orderId || record.id,
    cardTitle: record.card_title || record.cardTitle || 'Card transaction',
    buyerUid: record.buyer_id || record.buyerUid || record.buyerId || '',
    buyerName: record.buyer_name || record.buyerName || 'Buyer',
    sellerUid: record.seller_user_id || record.sellerUid || record.sellerUserId || '',
    sellerName: record.seller_name || record.sellerName || 'Seller',
    status: record.status || record.escrowStatus || record.escrow_status || 'pending',
    totalPaid: centsOrDollars(record.total_paid ?? record.chargedTotalAmount ?? record.amount_charged ?? record.totalPaid),
    escrowAmount: centsOrDollars(record.amount_base ?? record.escrowAmount ?? record.sellerPayoutAmount),
    serviceFee: centsOrDollars(record.service_fee ?? record.marketplaceFeeAmount ?? record.serviceFee),
    trackingNumber: record.tracking_number || record.trackingNumber || '',
    carrier: record.carrier || record.shippingCarrier || '',
    shipTo: record.buyer_shipping_address || record.buyerShippingAddress || record.shippingAddress || null,
    createdAt: record.created_at || record.createdAt || record.createdAtServer || null,
    source: record.source || 'orders'
  };
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const profile = (await getDoc(doc(firestore, 'users', credential.user.uid))).data();
      const token = await credential.user.getIdTokenResult();
      if (profile?.isAdmin !== true && token.claims.admin !== true) {
        await signOut(firebaseAuth);
        throw new Error('This account does not have administrator access.');
      }
      onLogin(profile || { uid: credential.user.uid });
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
    }
  };

  return (
    <main className="login-shell">
      <div className="login-panel">
        <div className="brand-mark"><ShieldCheck size={22} /> CS</div>
        <p className="eyebrow">Operations Console</p>
        <h1>CardSwipers Admin</h1>
        <p className="muted">Sign in with an administrator account to continue.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="error-message"><AlertTriangle size={16} />{error}</div>}
          <button className="primary-button" type="submit">Sign in</button>
        </form>
      </div>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18} /></div><p className="eyebrow">{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}

function DataTable({ columns, rows, emptyText }) {
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
            )) : <tr><td colSpan={columns.length} className="empty-cell">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Overview({ stats, orders, tradeNightEscrows, queues }) {
  const chartData = stats.monthly.map((value, index) => ({ month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index], gmv: value }));
  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Executive overview</p><h2>Marketplace health</h2><p className="muted">Live volume, fulfillment, moderation, and Trade Night exposure.</p></div><span className="live-chip"><CheckCircle2 size={14} /> Live data</span></div>
      <div className="metric-grid">
        <MetricCard icon={CircleDollarSign} label="GMV" value={money(stats.gmv)} detail="Completed gross volume" />
        <MetricCard icon={WalletCards} label="Net revenue" value={money(stats.netRevenue)} detail="Service fees collected" />
        <MetricCard icon={Truck} label="Transactions" value={stats.orders} detail="Orders + purchase intents" />
        <MetricCard icon={Vault} label="Trade vaults" value={tradeNightEscrows.length} detail="Handshake-locked trade nights" />
        <MetricCard icon={AlertTriangle} label="Open queues" value={queues.openCount} detail="Verifications, reports, flags" />
      </div>
      <div className="panel chart-panel"><div className="panel-heading"><div><h3>Monthly GMV</h3><p className="muted">Current calendar year</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid stroke="#30363D" vertical={false} /><XAxis dataKey="month" stroke="#8B949E" tickLine={false} axisLine={false} /><YAxis stroke="#8B949E" tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} /><Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10 }} formatter={(value) => money(value)} /><Bar dataKey="gmv" fill="#FFD700" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      <div className="panel"><div className="panel-heading"><div><h3>Recent operational records</h3><p className="muted">Latest orders, payment intents, and shipping states</p></div></div><div className="compact-list">{orders.slice(0, 6).map((order) => <div className="list-row" key={`${order.source}-${order.id}`}><div><strong>{order.cardTitle}</strong><span>{order.orderId} | {order.buyerName} to {order.sellerName}</span></div><div className="row-right"><strong>{money(order.totalPaid)}</strong><span>{statusText(order.status)}</span></div></div>)}</div></div>
    </section>
  );
}

function UsersView({ users, onToggle }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((user) => `${user.displayName} ${user.email} ${user.uid || user.id}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Accounts</p><h2>User management</h2></div><label className="search-box"><Search size={16} /><input placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <DataTable
        columns={[
          { key: 'user', label: 'User', render: (user) => <><strong>{user.displayName || 'Unnamed user'}</strong><span>{user.email || user.uid || user.id}</span></> },
          { key: 'address', label: 'Address', render: (user) => normalizeAddress(user.shippingAddress) || 'No address' },
          { key: 'sales', label: 'Total sales', render: (user) => money(user.annualGrossVolume || 0) },
          { key: 'verification', label: 'Verification', render: (user) => <span className={`status-pill ${user.isVerified || user.sellerVerificationStatus === 'verified' ? 'success' : 'neutral'}`}><ShieldCheck size={13} />{user.isVerified || user.sellerVerificationStatus === 'verified' ? 'Verified' : 'Unverified'}</span> },
          { key: 'status', label: 'Status', render: (user) => <span className={`status-pill ${user.status === 'deactivated' ? 'danger' : 'success'}`}>{user.status || 'active'}</span> },
          { key: 'action', label: 'Action', render: (user) => <button className="table-action" onClick={() => onToggle(user)} disabled={user.isAdmin}>{user.status === 'deactivated' ? 'Enable' : 'Disable'}</button> }
        ]}
        rows={filtered}
        emptyText="No users match this search."
      />
    </section>
  );
}

function Operations({ orders, tradeNightEscrows }) {
  const [search, setSearch] = useState('');
  const filteredOrders = orders.filter((order) => `${order.orderId} ${order.cardTitle} ${order.buyerName} ${order.sellerName} ${order.trackingNumber}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Fulfillment</p><h2>Orders & Trade Night vaults</h2><p className="muted">Who is sending, who receives, addresses, tracking, payment state, and escrow state.</p></div><label className="search-box"><Search size={16} /><input placeholder="Search order, card, user, tracking" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <DataTable
        columns={[
          { key: 'record', label: 'Record', render: (order) => <><strong>{order.cardTitle}</strong><span>{order.orderId} | {order.source}</span></> },
          { key: 'fromto', label: 'From / To', render: (order) => <><strong>{order.sellerName} to {order.buyerName}</strong><span>{order.sellerUid || 'seller uid missing'} / {order.buyerUid || 'buyer uid missing'}</span></> },
          { key: 'shipto', label: 'Ship-to address', render: (order) => normalizeAddress(order.shipTo) || 'No ship-to address captured' },
          { key: 'tracking', label: 'Tracking', render: (order) => <><strong>{order.carrier || 'Carrier pending'}</strong><span>{order.trackingNumber || 'Tracking pending'}</span></> },
          { key: 'status', label: 'Status', render: (order) => <span className="status-pill neutral">{statusText(order.status)}</span> },
          { key: 'amount', label: 'Amount', render: (order) => money(order.totalPaid || order.escrowAmount) }
        ]}
        rows={filteredOrders}
        emptyText="No orders match this search."
      />
      <DataTable
        columns={[
          { key: 'vault', label: 'Vault', render: (vault) => <><strong>{vault.spotlightId || vault.id}</strong><span>{vault.clubId || 'No club'} / {vault.eventId || 'No event'}</span></> },
          { key: 'participants', label: 'Participants', render: (vault) => <><strong>{vault.sellerName || vault.sellerUid || 'Seller'} to {vault.buyerName || vault.buyerUid || 'Buyer'}</strong><span>{(vault.participants || []).join(', ')}</span></> },
          { key: 'cards', label: 'Cards', render: (vault) => [...(vault.offeredCards?.buyer || []), ...(vault.offeredCards?.seller || [])].map((card) => card.title || card.id).join(', ') || 'No cards listed' },
          { key: 'meter', label: 'Deal meter', render: (vault) => `${vault.dealMeter?.quality || 'No score'} ${vault.dealMeter?.equityRatio ? `(${vault.dealMeter.equityRatio}%)` : ''}` },
          { key: 'status', label: 'Status', render: (vault) => <span className="status-pill warning">{statusText(vault.escrowStatus || vault.status)}</span> }
        ]}
        rows={tradeNightEscrows}
        emptyText="No Trade Night escrow vault records yet."
      />
    </section>
  );
}

function Management({ clubs, sellerVerifications, chatReports, flaggedCards, tradeSpotlights }) {
  const openVerifications = sellerVerifications.filter((item) => !['approved', 'verified', 'rejected'].includes(String(item.status || item.verificationStatus || '').toLowerCase()));
  const openReports = chatReports.filter((item) => !['resolved', 'closed', 'dismissed'].includes(String(item.status || '').toLowerCase()));
  const openFlags = flaggedCards.filter((item) => !['resolved', 'dismissed', 'deleted'].includes(String(item.status || '').toLowerCase()));
  const activeSpotlights = tradeSpotlights.filter((item) => ['OFFER_PENDING', 'HANDSHAKE_PENDING', 'HANDSHAKE_LOCKED'].includes(String(item.status || '').toUpperCase()));

  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Management</p><h2>Operational queues</h2><p className="muted">Club, verification, moderation, and live Trade Night information for daily management.</p></div></div>
      <div className="metric-grid">
        <MetricCard icon={Building2} label="Clubs" value={clubs.length} detail="Public and private communities" />
        <MetricCard icon={ShieldCheck} label="Seller reviews" value={openVerifications.length} detail="Pending verification records" />
        <MetricCard icon={MessageSquareWarning} label="Chat reports" value={openReports.length} detail="Open member safety reports" />
        <MetricCard icon={Flag} label="Card flags" value={openFlags.length} detail="Listing reports needing review" />
        <MetricCard icon={Activity} label="Live spotlights" value={activeSpotlights.length} detail="Active Trade Night offers" />
      </div>
      <DataTable
        columns={[
          { key: 'club', label: 'Club', render: (club) => <><strong>{club.name || club.title || club.id}</strong><span>{club.id}</span></> },
          { key: 'owner', label: 'Owner', render: (club) => club.ownerName || club.ownerUid || club.ownerId || 'Unknown owner' },
          { key: 'access', label: 'Access', render: (club) => <span className="status-pill neutral">{club.isPublic === false ? 'private' : 'public'}</span> },
          { key: 'members', label: 'Members', render: (club) => Number(club.memberCount || club.membersCount || 0) },
          { key: 'created', label: 'Created', render: (club) => dateLabel(club.createdAt) }
        ]}
        rows={clubs}
        emptyText="No clubs found."
      />
      <DataTable
        columns={[
          { key: 'user', label: 'Seller', render: (item) => <><strong>{item.displayName || item.userName || item.email || item.userId || item.id}</strong><span>{item.userId || item.uid || item.id}</span></> },
          { key: 'status', label: 'Status', render: (item) => <span className="status-pill warning">{statusText(item.status || item.verificationStatus || 'pending')}</span> },
          { key: 'reason', label: 'Details', render: (item) => item.reason || item.note || item.stripeSessionId || 'Identity / payout review' },
          { key: 'updated', label: 'Updated', render: (item) => dateLabel(item.updatedAt || item.createdAt) }
        ]}
        rows={sellerVerifications}
        emptyText="No seller verification records found."
      />
      <DataTable
        columns={[
          { key: 'report', label: 'Report', render: (item) => <><strong>{item.reason || item.category || 'Chat report'}</strong><span>{item.id}</span></> },
          { key: 'people', label: 'People', render: (item) => `${item.reportedByName || item.reportedByUid || 'Reporter'} / ${item.targetName || item.targetUid || item.reportedUserId || 'Target'}` },
          { key: 'status', label: 'Status', render: (item) => <span className="status-pill danger">{statusText(item.status || 'open')}</span> },
          { key: 'created', label: 'Created', render: (item) => dateLabel(item.createdAt) }
        ]}
        rows={chatReports}
        emptyText="No chat reports found."
      />
      <DataTable
        columns={[
          { key: 'card', label: 'Flagged card', render: (item) => <><strong>{item.cardTitle || item.title || item.cardId || item.id}</strong><span>{item.cardOwnerName || item.cardOwnerUid || 'Unknown owner'}</span></> },
          { key: 'reason', label: 'Reason', render: (item) => item.reason || item.flagReason || 'No reason provided' },
          { key: 'status', label: 'Status', render: (item) => <span className="status-pill warning">{statusText(item.status || 'open')}</span> },
          { key: 'created', label: 'Flagged', render: (item) => dateLabel(item.flaggedAt || item.createdAt) }
        ]}
        rows={flaggedCards}
        emptyText="No flagged cards found."
      />
      <DataTable
        columns={[
          { key: 'spotlight', label: 'Spotlight', render: (item) => <><strong>{item.id}</strong><span>{item.clubId || 'No club'} / {item.eventId || 'No event'}</span></> },
          { key: 'participants', label: 'Participants', render: (item) => (item.participants || []).join(', ') || 'No participants' },
          { key: 'status', label: 'Status', render: (item) => <span className="status-pill neutral">{statusText(item.status)}</span> },
          { key: 'expires', label: 'Expires', render: (item) => dateLabel(item.expiresAt) }
        ]}
        rows={tradeSpotlights}
        emptyText="No Trade Night spotlights found."
      />
    </section>
  );
}

function Watchlist({ users }) {
  const watchlist = users.filter((user) => Number(user.annualGrossVolume || 0) >= 15000 || Number(user.annualTransactionCount || 0) >= 150).sort((a, b) => Number(b.annualGrossVolume || 0) - Number(a.annualGrossVolume || 0));
  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Compliance</p><h2>Tax & 1099 watchlist</h2><p className="muted">Seller activity near the $20,000 / 200-sale thresholds.</p></div></div>
      <DataTable
        columns={[
          { key: 'seller', label: 'Seller', render: (user) => <><strong>{user.displayName || 'Unnamed user'}</strong><span>{user.email}</span></> },
          { key: 'volume', label: 'Annual gross volume', render: (user) => <>{money(user.annualGrossVolume || 0)} <span className="progress-track"><i style={{ width: `${Math.min(100, Number(user.annualGrossVolume || 0) / 200)}%` }} /></span></> },
          { key: 'sales', label: 'Completed sales', render: (user) => `${Number(user.annualTransactionCount || 0)} / 200` },
          { key: 'status', label: 'Threshold status', render: (user) => <span className={`status-pill ${Number(user.annualGrossVolume || 0) >= 20000 || Number(user.annualTransactionCount || 0) >= 200 ? 'danger' : 'warning'}`}><AlertTriangle size={13} />{Number(user.annualGrossVolume || 0) >= 20000 || Number(user.annualTransactionCount || 0) >= 200 ? 'Threshold reached' : 'Approaching'}</span> }
        ]}
        rows={watchlist}
        emptyText="No sellers are currently near the watchlist thresholds."
      />
    </section>
  );
}

function Disputes({ disputes, onResolve }) {
  return (
    <section className="content-grid">
      <div className="page-heading"><div><p className="eyebrow">Risk operations</p><h2>Dispute command center</h2><p className="muted">Review fulfillment facts and resolve active escrow cases.</p></div></div>
      {disputes.length ? disputes.map((dispute) => <article className="panel dispute-card" key={dispute.id}><div className="panel-heading"><div><span className="status-pill danger"><Gavel size={13} /> Active dispute</span><h3>{dispute.cardTitle || 'Order dispute'}</h3><p className="muted">Order #{dispute.orderId}</p></div><span className="muted">{dateLabel(dispute.disputed_at || dispute.disputedAt)}</span></div><div className="dispute-grid"><div><p className="eyebrow">Category</p><strong>{dispute.dispute_category || dispute.disputeCategory || 'Uncategorized'}</strong><p className="body-copy">{dispute.dispute_reason || dispute.disputeReason || 'No explanation provided.'}</p></div><div><p className="eyebrow">Fulfillment</p><p className="body-copy">{dispute.sellerName} to {dispute.buyerName}<br />{normalizeAddress(dispute.shipTo) || 'No ship-to address'}<br />{dispute.carrier || 'Carrier pending'} {dispute.trackingNumber || ''}</p></div></div><div className="action-row"><button className="danger-button" onClick={() => onResolve(dispute, 'refund_buyer')}><X size={15} /> Refund buyer</button><button className="success-button" onClick={() => onResolve(dispute, 'release_to_seller')}><CheckCircle2 size={15} /> Release payout</button></div></article>) : <div className="panel empty-state"><CheckCircle2 size={22} /><h3>No active disputes</h3><p className="muted">The command center is clear.</p></div>}
    </section>
  );
}

function App() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview');
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [sellerVerifications, setSellerVerifications] = useState([]);
  const [chatReports, setChatReports] = useState([]);
  const [flaggedCards, setFlaggedCards] = useState([]);
  const [tradeSpotlights, setTradeSpotlights] = useState([]);
  const [tradeNightEscrows, setTradeNightEscrows] = useState([]);

  const loadData = async () => {
    const [userSnapshot, orderSnapshot, purchaseSnapshot, clubSnapshot, verificationSnapshot, chatReportSnapshot, flaggedCardSnapshot, spotlightSnapshot, tradeEscrowSnapshot] = await Promise.all([
      getDocs(collection(firestore, 'users')),
      getDocs(query(collection(firestore, 'orders'), orderBy('created_at', 'desc'))),
      getDocs(collection(firestore, 'purchaseIntents')),
      getDocs(collection(firestore, 'clubs')),
      getDocs(collection(firestore, 'sellerVerifications')),
      getDocs(collection(firestore, 'chatReports')),
      getDocs(collection(firestore, 'flaggedCards')),
      getDocs(collection(firestore, 'tradeSpotlights')),
      getDocs(collection(firestore, 'tradeNightEscrows'))
    ]);
    const nextUsers = userSnapshot.docs.map((item) => ({ id: item.id, uid: item.id, ...item.data() }));
    const rawOrders = orderSnapshot.docs.map((item) => normalizeOrder({ id: item.id, source: 'orders', ...item.data() }));
    const rawPurchaseIntents = purchaseSnapshot.docs.map((item) => normalizeOrder({ id: item.id, source: 'purchaseIntents', ...item.data() }));
    const uniqueOrders = new Map([...rawPurchaseIntents, ...rawOrders].map((order) => [order.orderId || order.id, order]));

    setUsers(nextUsers);
    setOrders([...uniqueOrders.values()].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)));
    setClubs(clubSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setSellerVerifications(verificationSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setChatReports(chatReportSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setFlaggedCards(flaggedCardSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setTradeSpotlights(spotlightSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setTradeNightEscrows(tradeEscrowSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  };

  useEffect(() => onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) { setLoading(false); return; }
    const profile = (await getDoc(doc(firestore, 'users', user.uid))).data();
    const token = await user.getIdTokenResult();
    if (profile?.isAdmin === true || token.claims.admin === true) {
      setAdmin(profile || { uid: user.uid });
      await loadData();
    } else {
      await signOut(firebaseAuth);
    }
    setLoading(false);
  }), []);

  const stats = useMemo(() => {
    const completed = orders.filter((order) => ['completed', 'released', 'fulfilled'].includes(String(order.status || '').toLowerCase()));
    const monthly = Array(12).fill(0);
    completed.forEach((order) => {
      const date = toDate(order.createdAt);
      if (date) monthly[date.getMonth()] += Number(order.totalPaid || 0);
    });
    return {
      gmv: completed.reduce((sum, order) => sum + Number(order.totalPaid || 0), 0),
      netRevenue: completed.reduce((sum, order) => sum + Number(order.serviceFee || 0), 0),
      orders: orders.length,
      activeUsers: users.filter((user) => user.status !== 'deactivated').length,
      monthly
    };
  }, [orders, users]);

  const queues = useMemo(() => {
    const openVerifications = sellerVerifications.filter((item) => !['approved', 'verified', 'rejected'].includes(String(item.status || item.verificationStatus || '').toLowerCase())).length;
    const openReports = chatReports.filter((item) => !['resolved', 'closed', 'dismissed'].includes(String(item.status || '').toLowerCase())).length;
    const openFlags = flaggedCards.filter((item) => !['resolved', 'dismissed', 'deleted'].includes(String(item.status || '').toLowerCase())).length;
    return { openCount: openVerifications + openReports + openFlags };
  }, [sellerVerifications, chatReports, flaggedCards]);

  const callAdminFunction = async (path, body) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseAuth.currentUser.getIdToken()}` }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Administrator action failed.');
    return payload;
  };

  const toggleUser = async (user) => {
    await callAdminFunction('/api/admin/block-user', { userId: user.id, status: user.status === 'deactivated' ? 'active' : 'deactivated', reason: user.status === 'deactivated' ? 'Admin account unblock' : 'Admin account block' });
    await loadData();
  };

  const resolveDispute = async (dispute, action) => {
    await callAdminFunction('/api/admin/resolve-dispute', { orderId: dispute.orderId || dispute.id, action });
    await loadData();
  };

  if (loading) return <div className="loading-screen">Loading admin console...</div>;
  if (!admin) return <Login onLogin={setAdmin} />;

  const disputes = orders.filter((order) => String(order.status || '').toLowerCase() === 'disputed');
  const navigation = [
    ['overview', 'Overview', LayoutDashboard],
    ['operations', 'Operations', Truck],
    ['management', 'Management', Activity],
    ['users', 'Users', Users],
    ['watchlist', '1099 Watchlist', ShieldCheck],
    ['disputes', 'Disputes', Gavel]
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><ShieldCheck size={19} /> CardSwipers</div>
        <p className="sidebar-label">Admin workspace</p>
        <nav>{navigation.map(([key, label, Icon]) => <button key={key} className={view === key ? 'nav-item active' : 'nav-item'} onClick={() => setView(key)}><Icon size={17} />{label}</button>)}</nav>
        <button className="nav-item sign-out" onClick={() => signOut(firebaseAuth)}><LogOut size={17} />Sign out</button>
      </aside>
      <main className="main-content">
        {view === 'overview' && <Overview stats={stats} orders={orders} tradeNightEscrows={tradeNightEscrows} queues={queues} />}
        {view === 'operations' && <Operations orders={orders} tradeNightEscrows={tradeNightEscrows} />}
        {view === 'management' && <Management clubs={clubs} sellerVerifications={sellerVerifications} chatReports={chatReports} flaggedCards={flaggedCards} tradeSpotlights={tradeSpotlights} />}
        {view === 'users' && <UsersView users={users} onToggle={toggleUser} />}
        {view === 'watchlist' && <Watchlist users={users} />}
        {view === 'disputes' && <Disputes disputes={disputes} onResolve={resolveDispute} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
