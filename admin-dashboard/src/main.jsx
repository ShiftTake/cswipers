import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Gavel,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { firebaseAuth, firestore } from './firebaseAdmin';
import './styles.css';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
const toDate = (value) => value?.toDate?.() || (value ? new Date(value) : null);
const statusText = (value) => String(value || 'unknown').replaceAll('_', ' ');

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
      onLogin(profile);
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
    }
  };
  return <main className="login-shell"><div className="login-panel"><div className="brand-mark"><ShieldCheck size={22} /> CS</div><p className="eyebrow">Operations Console</p><h1>CardSwipers Admin</h1><p className="muted">Sign in with an administrator account to continue.</p><form onSubmit={submit} className="stack"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="error-message"><AlertTriangle size={16} />{error}</div>}<button className="primary-button" type="submit">Sign in</button></form></div></main>;
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18} /></div><p className="eyebrow">{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}

function Overview({ stats, orders }) {
  const chartData = stats.monthly.map((value, index) => ({ month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index], gmv: value }));
  return <section className="content-grid"><div className="page-heading"><div><p className="eyebrow">Executive overview</p><h2>Marketplace health</h2><p className="muted">A live view of volume, liquidity, and escrow exposure.</p></div><span className="live-chip"><CheckCircle2 size={14} /> Live data</span></div><div className="metric-grid"><MetricCard icon={CircleDollarSign} label="GMV" value={money(stats.gmv)} detail="Completed gross volume" /><MetricCard icon={WalletCards} label="Net revenue" value={money(stats.netRevenue)} detail="Service fees collected" /><MetricCard icon={ArrowUpRight} label="Total orders" value={stats.orders} detail="All recorded orders" /><MetricCard icon={Users} label="Active users" value={stats.activeUsers} detail="Non-deactivated accounts" /><MetricCard icon={WalletCards} label="Escrow held" value={money(stats.escrow)} detail="Awaiting release" /></div><div className="panel chart-panel"><div className="panel-heading"><div><h3>Monthly GMV</h3><p className="muted">Current calendar year</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid stroke="#30363D" vertical={false} /><XAxis dataKey="month" stroke="#8B949E" tickLine={false} axisLine={false} /><YAxis stroke="#8B949E" tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} /><Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10 }} formatter={(value) => money(value)} /><Bar dataKey="gmv" fill="#FFD700" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div><div className="panel"><div className="panel-heading"><div><h3>Recent orders</h3><p className="muted">Latest transaction activity</p></div></div><div className="compact-list">{orders.slice(0, 5).map((order) => <div className="list-row" key={order.id}><div><strong>{order.card_title || order.cardTitle || 'Untitled card'}</strong><span>#{order.order_id || order.orderId || order.id}</span></div><div className="row-right"><strong>{money((order.total_paid || order.chargedTotalAmount || 0) / (order.total_paid ? 100 : 1))}</strong><span className="status-text">{statusText(order.status)}</span></div></div>)}</div></div></section>;
}

function UsersView({ users, onToggle }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((user) => `${user.displayName} ${user.email} ${user.uid}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="content-grid"><div className="page-heading"><div><p className="eyebrow">Accounts</p><h2>User management</h2></div><label className="search-box"><Search size={16} /><input placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Username</th><th>Total sales</th><th>Verification</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><strong>{user.displayName || 'Unnamed user'}</strong><span>{user.email || user.uid}</span></td><td>{money(user.annualGrossVolume || 0)}</td><td><span className={`status-pill ${user.isVerified ? 'success' : 'neutral'}`}><ShieldCheck size={13} />{user.isVerified ? 'Verified' : 'Unverified'}</span></td><td><span className={`status-pill ${user.status === 'deactivated' ? 'danger' : 'success'}`}>{user.status || 'active'}</span></td><td><button className="table-action" onClick={() => onToggle(user)} disabled={user.isAdmin}>{user.status === 'deactivated' ? 'Enable' : 'Disable'}</button></td></tr>)}</tbody></table></div></div></section>;
}

function Watchlist({ users }) {
  const watchlist = users.filter((user) => Number(user.annualGrossVolume || 0) >= 15000 || Number(user.annualTransactionCount || 0) >= 150).sort((a, b) => Number(b.annualGrossVolume || 0) - Number(a.annualGrossVolume || 0));
  return <section className="content-grid"><div className="page-heading"><div><p className="eyebrow">Compliance</p><h2>Tax & 1099 watchlist</h2><p className="muted">Seller activity near the $20,000 / 200-sale thresholds.</p></div></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Seller</th><th>Annual gross volume</th><th>Completed sales</th><th>Threshold status</th></tr></thead><tbody>{watchlist.length ? watchlist.map((user) => { const volume = Number(user.annualGrossVolume || 0); const count = Number(user.annualTransactionCount || 0); return <tr key={user.id}><td><strong>{user.displayName || 'Unnamed user'}</strong><span>{user.email}</span></td><td>{money(volume)} <span className="progress-track"><i style={{ width: `${Math.min(100, volume / 200)}%` }} /></span></td><td>{count} / 200</td><td><span className={`status-pill ${volume >= 20000 || count >= 200 ? 'danger' : 'warning'}`}><AlertTriangle size={13} />{volume >= 20000 || count >= 200 ? 'Threshold reached' : 'Approaching'}</span></td></tr>; }) : <tr><td colSpan="4" className="empty-cell">No sellers are currently near the watchlist thresholds.</td></tr>}</tbody></table></div></div></section>;
}

function Disputes({ disputes, onResolve }) {
  return <section className="content-grid"><div className="page-heading"><div><p className="eyebrow">Risk operations</p><h2>Dispute command center</h2><p className="muted">Review evidence and resolve active escrow cases.</p></div></div>{disputes.length ? disputes.map((dispute) => <article className="panel dispute-card" key={dispute.id}><div className="panel-heading"><div><span className="status-pill danger"><Gavel size={13} /> Active dispute</span><h3>{dispute.card_title || dispute.cardTitle || 'Order dispute'}</h3><p className="muted">Order #{dispute.order_id || dispute.orderId || dispute.id}</p></div><span className="muted">{toDate(dispute.disputed_at || dispute.disputedAt)?.toLocaleDateString() || 'Date unavailable'}</span></div><div className="dispute-grid"><div><p className="eyebrow">Category</p><strong>{dispute.dispute_category || dispute.disputeCategory || 'Uncategorized'}</strong><p className="body-copy">{dispute.dispute_reason || dispute.disputeReason || 'No explanation provided.'}</p></div><div><p className="eyebrow">Evidence</p>{(dispute.dispute_evidence || dispute.evidence || []).length ? (dispute.dispute_evidence || dispute.evidence).map((file) => <a className="evidence-link" href={file.url} target="_blank" rel="noreferrer" key={file.url}>{file.name || 'Open evidence'} <ArrowUpRight size={14} /></a>) : <p className="muted">No files submitted.</p>}</div></div><div className="action-row"><button className="danger-button" onClick={() => onResolve(dispute, 'refund_buyer')}><X size={15} /> Refund buyer</button><button className="success-button" onClick={() => onResolve(dispute, 'release_to_seller')}><CheckCircle2 size={15} /> Release payout</button></div></article>) : <div className="panel empty-state"><CheckCircle2 size={22} /><h3>No active disputes</h3><p className="muted">The command center is clear.</p></div>}</section>;
}

function App() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview');
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const loadData = async () => {
    const [userSnapshot, orderSnapshot] = await Promise.all([getDocs(collection(firestore, 'users')), getDocs(query(collection(firestore, 'orders'), orderBy('created_at', 'desc')))]);
    const nextUsers = userSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const nextOrders = orderSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    setUsers(nextUsers); setOrders(nextOrders); setDisputes(nextOrders.filter((order) => order.status === 'disputed'));
  };
  useEffect(() => onAuthStateChanged(firebaseAuth, async (user) => { if (!user) { setLoading(false); return; } const profile = (await getDoc(doc(firestore, 'users', user.uid))).data(); const token = await user.getIdTokenResult(); if (profile?.isAdmin === true || token.claims.admin === true) { setAdmin(profile || { uid: user.uid }); await loadData(); } else await signOut(firebaseAuth); setLoading(false); }), []);
  const stats = useMemo(() => { const completed = orders.filter((order) => ['completed', 'released', 'fulfilled'].includes(order.status)); const gmv = completed.reduce((sum, order) => sum + Number(order.total_paid || order.amount_charged || 0) / (order.total_paid ? 100 : 1), 0); const escrow = orders.filter((order) => ['payment_held', 'shipped', 'delivered'].includes(order.status)).reduce((sum, order) => sum + Number(order.amount_base || order.escrowAmount || 0) / (order.amount_base ? 100 : 1), 0); const monthly = Array(12).fill(0); completed.forEach((order) => { const date = toDate(order.created_at || order.createdAt); if (date) monthly[date.getMonth()] += Number(order.total_paid || order.amount_charged || 0) / (order.total_paid ? 100 : 1); }); return { gmv, netRevenue: completed.reduce((sum, order) => sum + Number(order.service_fee || order.marketplaceFeeAmount || 0) / (order.service_fee ? 100 : 1), 0), orders: orders.length, activeUsers: users.filter((user) => user.status !== 'deactivated').length, escrow, monthly }; }, [orders, users]);
  const callAdminFunction = async (path, body) => { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseAuth.currentUser.getIdToken()}` }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Administrator action failed.'); return payload; };
  const toggleUser = async (user) => { await callAdminFunction('/api/admin/block-user', { userId: user.id, status: user.status === 'deactivated' ? 'active' : 'deactivated', reason: user.status === 'deactivated' ? 'Admin account unblock' : 'Admin account block' }); await loadData(); };
  const resolveDispute = async (dispute, action) => { const endpoint = action === 'refund_buyer' ? '/api/admin/disputes/resolve' : '/api/admin/disputes/resolve'; const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await firebaseAuth.currentUser.getIdToken()}` }, body: JSON.stringify({ orderId: dispute.order_id || dispute.id, action }) }); if (!response.ok) throw new Error('Unable to resolve dispute.'); await loadData(); };
  if (loading) return <div className="loading-screen">Loading admin console...</div>;
  if (!admin) return <Login onLogin={setAdmin} />;
  const navigation = [['overview', 'Overview', LayoutDashboard], ['users', 'Users', Users], ['watchlist', '1099 Watchlist', ShieldCheck], ['disputes', 'Disputes', Gavel]];
  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark"><ShieldCheck size={19} /> CardSwipers</div><p className="sidebar-label">Admin workspace</p><nav>{navigation.map(([key, label, Icon]) => <button key={key} className={view === key ? 'nav-item active' : 'nav-item'} onClick={() => setView(key)}><Icon size={17} />{label}</button>)}</nav><button className="nav-item sign-out" onClick={() => signOut(firebaseAuth)}><LogOut size={17} />Sign out</button></aside><main className="main-content">{view === 'overview' && <Overview stats={stats} orders={orders} />}{view === 'users' && <UsersView users={users} onToggle={toggleUser} />}{view === 'watchlist' && <Watchlist users={users} />}{view === 'disputes' && <Disputes disputes={disputes} onResolve={resolveDispute} />}</main></div>;
}

createRoot(document.getElementById('root')).render(<App />);
