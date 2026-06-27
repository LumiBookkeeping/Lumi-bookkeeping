// Lumi Bookkeeping — cloud bookkeeping server (Express + Postgres/JSON datastore).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const store = require('./lib/store');
const acct = require('./lib/accounting');
const auth = require('./lib/auth');
const ai = require('./lib/ai');
const payroll = require('./lib/payroll');
const inventory = require('./lib/inventory');

const app = express();
const PORT = process.env.PORT || 4000;
const PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (PROD) app.set('trust proxy', 1); // the host (Render/Fly/…) terminates TLS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'lumi-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 8 },
  })
);

// ---- File uploads ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${store.id()}__${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// ===================== AUTH =====================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = store.find('users', (u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !auth.checkPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  const user = auth.getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  const orgs = auth.userOrgs(user).map((o) => ({ id: o.id, name: o.name, lockDate: o.lockDate || null, vatScheme: o.vatScheme || 'accrual', flatRate: o.flatRate || 0, vatPeriod: o.vatPeriod || 'quarterly', hasLogo: !!o.logoFile, paymentTermsDays: o.paymentTermsDays || 30 }));
  res.json({ user: publicUser(user), orgs });
});

// ===================== PROFILE =====================
app.put('/api/me/profile', auth.requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
  store.update('users', req.user.id, { name: name.trim() });
  res.json({ user: publicUser(store.byId('users', req.user.id)) });
});

// Download a full JSON backup of a business's books.
app.get('/api/orgs/:orgId/export', auth.requireAuth, auth.requireOrg, (req, res) => {
  const orgId = req.orgId;
  const txns = store.filter('transactions', (t) => t.orgId === orgId);
  const data = {
    exportedAt: new Date().toISOString(),
    organization: store.byId('organizations', orgId),
    accounts: store.filter('accounts', (a) => a.orgId === orgId),
    contacts: store.filter('contacts', (c) => c.orgId === orgId),
    transactions: txns.map((t) => ({ ...t, lines: store.filter('lines', (l) => l.transactionId === t.id) })),
    invoices: store.filter('invoices', (x) => x.orgId === orgId),
    taxRates: store.filter('taxRates', (x) => x.orgId === orgId),
    rules: store.filter('rules', (x) => x.orgId === orgId),
    recurring: store.filter('recurring', (x) => x.orgId === orgId),
    employees: store.filter('employees', (x) => x.orgId === orgId),
    payRuns: store.filter('payRuns', (x) => x.orgId === orgId),
    fixedAssets: store.filter('fixedAssets', (x) => x.orgId === orgId),
    vatReturns: store.filter('vatReturns', (x) => x.orgId === orgId),
    budgets: store.filter('budgets', (x) => x.orgId === orgId),
  };
  const safe = (store.byId('organizations', orgId).name || 'books').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="lumi-backup-${safe}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// Company details (per org) — clients can edit their own; appear on invoices.
app.get('/api/orgs/:orgId/company', auth.requireAuth, auth.requireOrg, (req, res) => {
  const o = store.byId('organizations', req.orgId);
  res.json({ company: { name: o.name, address: o.companyAddress || '', vatNo: o.companyVatNo || '', regNo: o.companyRegNo || '', email: o.companyEmail || '', phone: o.companyPhone || '', bankDetails: o.bankDetails || '', paymentTermsDays: o.paymentTermsDays || 30, invoicePrefix: o.invoicePrefix || 'INV-', billPrefix: o.billPrefix || 'BILL-', quotePrefix: o.quotePrefix || 'QUO-', poPrefix: o.poPrefix || 'PO-', stockMethod: o.stockMethod || 'avco' } });
});
app.put('/api/orgs/:orgId/company', auth.requireAuth, auth.requireOrg, (req, res) => {
  const patch = {};
  for (const f of ['companyAddress', 'companyVatNo', 'companyRegNo', 'companyEmail', 'companyPhone', 'bankDetails', 'invoicePrefix', 'billPrefix', 'quotePrefix', 'poPrefix']) if (req.body[f] != null) patch[f] = String(req.body[f]);
  if (req.body.stockMethod && ['fifo', 'avco'].includes(req.body.stockMethod)) patch.stockMethod = req.body.stockMethod;
  if (req.body.paymentTermsDays != null) patch.paymentTermsDays = Math.max(0, Math.round(Number(req.body.paymentTermsDays) || 0));
  if (req.body.name && req.body.name.trim()) patch.name = req.body.name.trim();
  store.update('organizations', req.orgId, patch);
  store.audit({ orgId: req.orgId, user: req.user, action: 'company', entity: 'organization', entityId: req.orgId, detail: 'Company details updated' });
  res.json({ ok: true, name: patch.name });
});

// Company logo (per org) — clients can upload their own; shown on invoices.
app.post('/api/orgs/:orgId/logo', auth.requireAuth, auth.requireOrg, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' });
  if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Please upload an image (PNG, JPG or SVG).' });
  const org = store.byId('organizations', req.orgId);
  if (org.logoFile) { try { fs.unlinkSync(path.join(UPLOAD_DIR, org.logoFile)); } catch {} }
  store.update('organizations', req.orgId, { logoFile: req.file.filename, logoMime: req.file.mimetype });
  res.json({ ok: true });
});
app.get('/api/orgs/:orgId/logo', auth.requireAuth, auth.requireOrg, (req, res) => {
  const org = store.byId('organizations', req.orgId);
  if (!org.logoFile) return res.status(404).json({ error: 'No logo.' });
  const fp = path.join(UPLOAD_DIR, org.logoFile);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Missing.' });
  res.setHeader('Content-Type', org.logoMime || 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(fp).pipe(res);
});
app.delete('/api/orgs/:orgId/logo', auth.requireAuth, auth.requireOrg, (req, res) => {
  const org = store.byId('organizations', req.orgId);
  if (org.logoFile) { try { fs.unlinkSync(path.join(UPLOAD_DIR, org.logoFile)); } catch {} }
  store.update('organizations', req.orgId, { logoFile: null, logoMime: null });
  res.json({ ok: true });
});

app.put('/api/me/password', auth.requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!auth.checkPassword(currentPassword || '', req.user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  store.update('users', req.user.id, { passwordHash: auth.hashPassword(newPassword) });
  res.json({ ok: true });
});

// ===================== CLIENTS (ORGS) =====================
// Bookkeeper creates a new client business + optional client login.
app.post('/api/orgs', auth.requireAuth, (req, res) => {
  if (req.user.role !== 'bookkeeper') {
    return res.status(403).json({ error: 'Only practice staff can create clients.' });
  }
  const { name, clientName, clientEmail, clientPassword } = req.body;
  if (!name) return res.status(400).json({ error: 'Client business name is required.' });

  const org = store.insert('organizations', { name, createdAt: new Date().toISOString() });
  // Bookkeeper gets admin membership.
  store.insert('memberships', { userId: req.user.id, orgId: org.id, role: 'admin' });
  // Seed a standard chart of accounts and tax rates.
  seedChart(org.id);
  seedTaxRates(org.id);

  // Optionally create a client login tied to this org.
  let clientUser = null;
  if (clientEmail && clientPassword) {
    const exists = store.find('users', (u) => u.email.toLowerCase() === clientEmail.toLowerCase());
    if (exists) {
      store.insert('memberships', { userId: exists.id, orgId: org.id, role: 'member' });
      clientUser = exists;
    } else {
      clientUser = store.insert('users', {
        name: clientName || clientEmail,
        email: clientEmail,
        passwordHash: auth.hashPassword(clientPassword),
        role: 'client',
        createdAt: new Date().toISOString(),
      });
      store.insert('memberships', { userId: clientUser.id, orgId: org.id, role: 'member' });
    }
  }
  res.json({ org: { id: org.id, name: org.name }, clientUser: clientUser ? publicUser(clientUser) : null });
});

// ===================== CHART OF ACCOUNTS =====================
app.get('/api/orgs/:orgId/accounts', auth.requireAuth, auth.requireOrg, (req, res) => {
  res.json({ accounts: acct.chartOfAccounts(req.orgId) });
});

app.post('/api/orgs/:orgId/accounts', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { code, name, type } = req.body;
  if (!code || !name || !acct.TYPES.includes(type)) {
    return res.status(400).json({ error: 'Code, name, and a valid type are required.' });
  }
  const dup = store.find('accounts', (a) => a.orgId === req.orgId && a.code === code && !a.archived);
  if (dup) return res.status(400).json({ error: `Account code ${code} already exists.` });
  const account = store.insert('accounts', { orgId: req.orgId, code, name, type, archived: false });
  res.json({ account });
});

// ===================== TRANSACTIONS =====================
app.get('/api/orgs/:orgId/transactions', auth.requireAuth, auth.requireOrg, (req, res) => {
  const txns = store
    .filter('transactions', (t) => t.orgId === req.orgId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const accountsById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const out = txns.map((t) => {
    const lines = store.filter('lines', (l) => l.transactionId === t.id).map((l) => ({
      ...l,
      accountCode: accountsById.get(l.accountId)?.code,
      accountName: accountsById.get(l.accountId)?.name,
    }));
    const attachments = store.filter('attachments', (a) => a.transactionId === t.id);
    const total = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    return { ...t, lines, attachments, total: acct.round2(total) };
  });
  res.json({ transactions: out });
});

app.post('/api/orgs/:orgId/transactions', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { date, description, reference, lines } = req.body;
  if (!date || !description) {
    return res.status(400).json({ error: 'Date and description are required.' });
  }
  const org = store.byId('organizations', req.orgId);
  if (acct.isLocked(org, date)) {
    return res.status(400).json({ error: `Period is locked up to ${org.lockDate}. Choose a later date.` });
  }
  const orgAccounts = new Set(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => a.id));
  for (const l of lines || []) {
    if (!orgAccounts.has(l.accountId)) return res.status(400).json({ error: 'Invalid account on a line.' });
  }
  const err = acct.validateLines(lines);
  if (err) return res.status(400).json({ error: err });

  const txn = store.insert('transactions', {
    orgId: req.orgId,
    date,
    description,
    reference: reference || '',
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    status: 'posted',
    source: req.body.source || 'manual',
    sourceId: req.body.sourceId || null,
    trackingId: req.body.trackingId || null,
  });
  for (const l of lines) {
    store.insert('lines', {
      transactionId: txn.id,
      accountId: l.accountId,
      debit: acct.round2(Number(l.debit || 0)),
      credit: acct.round2(Number(l.credit || 0)),
      reconciled: false,
    });
  }
  store.audit({ orgId: req.orgId, user: req.user, action: 'create', entity: 'transaction', entityId: txn.id, detail: `${description} (${date})` });
  res.json({ transaction: txn });
});

// Edit a transaction — replaces its lines. Blocked if locked or not manual.
app.put('/api/orgs/:orgId/transactions/:txnId', auth.requireAuth, auth.requireOrg, (req, res) => {
  const txn = store.find('transactions', (t) => t.id === req.params.txnId && t.orgId === req.orgId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
  if (txn.source && txn.source !== 'manual') {
    return res.status(400).json({ error: 'This entry comes from an invoice/bill or import and must be edited there.' });
  }
  const org = store.byId('organizations', req.orgId);
  const { date, description, reference, lines } = req.body;
  if (acct.isLocked(org, txn.date) || acct.isLocked(org, date)) {
    return res.status(400).json({ error: `Period is locked up to ${org.lockDate}.` });
  }
  const orgAccounts = new Set(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => a.id));
  for (const l of lines || []) {
    if (!orgAccounts.has(l.accountId)) return res.status(400).json({ error: 'Invalid account on a line.' });
  }
  const err = acct.validateLines(lines);
  if (err) return res.status(400).json({ error: err });

  store.remove('lines', (l) => l.transactionId === txn.id);
  for (const l of lines) {
    store.insert('lines', {
      transactionId: txn.id, accountId: l.accountId,
      debit: acct.round2(Number(l.debit || 0)), credit: acct.round2(Number(l.credit || 0)), reconciled: false,
    });
  }
  store.update('transactions', txn.id, { date, description, reference: reference || '', trackingId: req.body.trackingId !== undefined ? (req.body.trackingId || null) : txn.trackingId });
  store.audit({ orgId: req.orgId, user: req.user, action: 'edit', entity: 'transaction', entityId: txn.id, detail: `${description} (${date})` });
  res.json({ transaction: store.byId('transactions', txn.id) });
});

// Void — keeps the record for audit but removes it from reports.
app.post('/api/orgs/:orgId/transactions/:txnId/void', auth.requireAuth, auth.requireOrg, (req, res) => {
  const txn = store.find('transactions', (t) => t.id === req.params.txnId && t.orgId === req.orgId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
  const org = store.byId('organizations', req.orgId);
  if (acct.isLocked(org, txn.date)) return res.status(400).json({ error: `Period is locked up to ${org.lockDate}.` });
  store.update('transactions', txn.id, { status: 'void' });
  store.audit({ orgId: req.orgId, user: req.user, action: 'void', entity: 'transaction', entityId: txn.id, detail: txn.description });
  res.json({ transaction: store.byId('transactions', txn.id) });
});

// Delete — only manual, unlocked entries; removes lines too.
app.delete('/api/orgs/:orgId/transactions/:txnId', auth.requireAuth, auth.requireOrg, (req, res) => {
  const txn = store.find('transactions', (t) => t.id === req.params.txnId && t.orgId === req.orgId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
  if (txn.source && txn.source !== 'manual') return res.status(400).json({ error: 'Delete this from its invoice/bill instead.' });
  const org = store.byId('organizations', req.orgId);
  if (acct.isLocked(org, txn.date)) return res.status(400).json({ error: `Period is locked up to ${org.lockDate}.` });
  store.remove('lines', (l) => l.transactionId === txn.id);
  store.remove('attachments', (a) => a.transactionId === txn.id);
  store.remove('transactions', (t) => t.id === txn.id);
  store.audit({ orgId: req.orgId, user: req.user, action: 'delete', entity: 'transaction', entityId: txn.id, detail: txn.description });
  res.json({ ok: true });
});

// Set / clear the lock date for a client's books (bookkeeper only).
app.put('/api/orgs/:orgId/lock', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can lock periods.' });
  const lockDate = req.body.lockDate || null;
  store.update('organizations', req.orgId, { lockDate });
  store.audit({ orgId: req.orgId, user: req.user, action: 'lock', entity: 'organization', entityId: req.orgId, detail: lockDate ? `Locked to ${lockDate}` : 'Lock cleared' });
  res.json({ lockDate });
});

// Bank reconciliation for one account: cleared vs statement balance.
app.get('/api/orgs/:orgId/accounts/:accountId/reconcile', auth.requireAuth, auth.requireOrg, (req, res) => {
  const account = store.find('accounts', (a) => a.id === req.params.accountId && a.orgId === req.orgId);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const txns = store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void');
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const rows = [];
  let clearedDebit = 0, clearedCredit = 0, totalDebit = 0, totalCredit = 0;
  for (const l of store.filter('lines', (x) => x.accountId === account.id)) {
    const t = txnById.get(l.transactionId);
    if (!t) continue;
    totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0);
    if (l.reconciled) { clearedDebit += Number(l.debit || 0); clearedCredit += Number(l.credit || 0); }
    rows.push({ lineId: l.id, date: t.date, description: t.description, reference: t.reference, debit: l.debit || 0, credit: l.credit || 0, reconciled: !!l.reconciled });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const clearedBalance = acct.round2(clearedDebit - clearedCredit);
  const ledgerBalance = acct.round2(totalDebit - totalCredit);
  const statementBalance = req.query.statementBalance != null && req.query.statementBalance !== '' ? Number(req.query.statementBalance) : null;
  res.json({
    account: { id: account.id, code: account.code, name: account.name },
    rows, clearedBalance, ledgerBalance, statementBalance,
    difference: statementBalance == null ? null : acct.round2(statementBalance - clearedBalance),
  });
});

// Bulk reconcile / un-reconcile every movement on an account.
app.post('/api/orgs/:orgId/accounts/:accountId/reconcile-all', auth.requireAuth, auth.requireOrg, (req, res) => {
  const account = store.find('accounts', (a) => a.id === req.params.accountId && a.orgId === req.orgId);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const reconciled = !!req.body.reconciled;
  const orgTxns = new Set(store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void').map((t) => t.id));
  let updated = 0;
  for (const l of store.filter('lines', (x) => x.accountId === account.id)) {
    if (!orgTxns.has(l.transactionId)) continue;
    store.update('lines', l.id, { reconciled, reconciledAt: reconciled ? new Date().toISOString() : null });
    updated += 1;
  }
  res.json({ updated, reconciled });
});

app.post('/api/orgs/:orgId/lines/:lineId/reconcile', auth.requireAuth, auth.requireOrg, (req, res) => {
  const line = store.byId('lines', req.params.lineId);
  if (!line) return res.status(404).json({ error: 'Line not found.' });
  const txn = store.byId('transactions', line.transactionId);
  if (!txn || txn.orgId !== req.orgId) return res.status(403).json({ error: 'Not your line.' });
  const reconciled = !!req.body.reconciled;
  store.update('lines', line.id, { reconciled, reconciledAt: reconciled ? new Date().toISOString() : null });
  res.json({ ok: true, reconciled });
});

// ===================== DOCUMENT UPLOADS =====================
app.post(
  '/api/orgs/:orgId/transactions/:txnId/attachments',
  auth.requireAuth,
  auth.requireOrg,
  upload.single('document'),
  (req, res) => {
    const txn = store.find('transactions', (t) => t.id === req.params.txnId && t.orgId === req.orgId);
    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const att = store.insert('attachments', {
      transactionId: txn.id,
      orgId: req.orgId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.id,
      uploadedAt: new Date().toISOString(),
    });
    res.json({ attachment: att });
  }
);

app.get('/api/orgs/:orgId/attachments/:attId', auth.requireAuth, auth.requireOrg, (req, res) => {
  const att = store.find('attachments', (a) => a.id === req.params.attId && a.orgId === req.orgId);
  if (!att) return res.status(404).json({ error: 'Document not found.' });
  const filePath = path.join(UPLOAD_DIR, att.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk.' });
  res.setHeader('Content-Type', att.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${att.originalName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ===================== AUDIT TRAIL =====================
app.get('/api/orgs/:orgId/audit', auth.requireAuth, auth.requireOrg, (req, res) => {
  const entries = store
    .filter('auditLog', (x) => x.orgId === req.orgId)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 200);
  res.json({ entries });
});

// ===================== CLIENT QUERIES =====================
app.get('/api/orgs/:orgId/queries', auth.requireAuth, auth.requireOrg, (req, res) => {
  const txnById = new Map(store.filter('transactions', (t) => t.orgId === req.orgId).map((t) => [t.id, t]));
  const list = store.filter('queries', (q) => q.orgId === req.orgId)
    .sort((a, b) => (a.askedAt < b.askedAt ? 1 : -1))
    .map((q) => {
      const t = q.transactionId ? txnById.get(q.transactionId) : null;
      return { ...q, txn: t ? { id: t.id, date: t.date, description: t.description } : null };
    });
  res.json({ queries: list, openCount: list.filter((q) => q.status === 'open').length });
});

app.post('/api/orgs/:orgId/queries', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { transactionId, question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: 'Enter a question.' });
  if (transactionId && !store.find('transactions', (t) => t.id === transactionId && t.orgId === req.orgId)) {
    return res.status(400).json({ error: 'Transaction not found.' });
  }
  const q = store.insert('queries', {
    orgId: req.orgId, transactionId: transactionId || null, question: question.trim(), status: 'open',
    askedBy: req.user.id, askedByName: req.user.name, askedAt: new Date().toISOString(),
    answer: '', answeredBy: null, answeredByName: null, answeredAt: null,
  });
  store.audit({ orgId: req.orgId, user: req.user, action: 'ask', entity: 'query', entityId: q.id, detail: question.trim().slice(0, 60) });
  res.json({ query: q });
});

app.post('/api/orgs/:orgId/queries/:id/answer', auth.requireAuth, auth.requireOrg, (req, res) => {
  const q = store.find('queries', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!q) return res.status(404).json({ error: 'Query not found.' });
  if (!req.body.answer || !req.body.answer.trim()) return res.status(400).json({ error: 'Enter an answer.' });
  store.update('queries', q.id, { answer: req.body.answer.trim(), status: 'answered', answeredBy: req.user.id, answeredByName: req.user.name, answeredAt: new Date().toISOString() });
  store.audit({ orgId: req.orgId, user: req.user, action: 'answer', entity: 'query', entityId: q.id, detail: req.body.answer.trim().slice(0, 60) });
  res.json({ query: store.byId('queries', q.id) });
});

app.delete('/api/orgs/:orgId/queries/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('queries', (x) => x.id === req.params.id && x.orgId === req.orgId);
  res.json({ ok: true });
});

// ===================== DOCUMENT INBOX (upload portal) =====================
// Upload documents that sit unattached until filed against a transaction.
app.post('/api/orgs/:orgId/inbox', auth.requireAuth, auth.requireOrg, upload.array('documents', 20), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files received.' });
  const created = req.files.map((f) => store.insert('inbox', {
    orgId: req.orgId, filename: f.filename, originalName: f.originalname, mimetype: f.mimetype,
    size: f.size, note: '', uploadedBy: req.user.id, uploadedAt: new Date().toISOString(),
  }));
  res.json({ uploaded: created.length });
});

app.get('/api/orgs/:orgId/inbox', auth.requireAuth, auth.requireOrg, (req, res) => {
  const items = store.filter('inbox', (x) => x.orgId === req.orgId).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  res.json({ inbox: items });
});

app.get('/api/orgs/:orgId/inbox/:id/file', auth.requireAuth, auth.requireOrg, (req, res) => {
  const item = store.find('inbox', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!item) return res.status(404).json({ error: 'Not found.' });
  const filePath = path.join(UPLOAD_DIR, item.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing.' });
  res.setHeader('Content-Type', item.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${item.originalName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// File an inbox document against a transaction (creates an attachment, clears it from the inbox).
app.post('/api/orgs/:orgId/inbox/:id/attach', auth.requireAuth, auth.requireOrg, (req, res) => {
  const item = store.find('inbox', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!item) return res.status(404).json({ error: 'Document not found.' });
  const txn = store.find('transactions', (t) => t.id === req.body.transactionId && t.orgId === req.orgId);
  if (!txn) return res.status(400).json({ error: 'Choose a transaction to attach to.' });
  store.insert('attachments', {
    transactionId: txn.id, orgId: req.orgId, filename: item.filename, originalName: item.originalName,
    mimetype: item.mimetype, size: item.size, uploadedBy: req.user.id, uploadedAt: new Date().toISOString(),
  });
  store.remove('inbox', (x) => x.id === item.id);
  store.audit({ orgId: req.orgId, user: req.user, action: 'attach', entity: 'document', entityId: txn.id, detail: `${item.originalName} → ${txn.description}` });
  res.json({ ok: true });
});

app.delete('/api/orgs/:orgId/inbox/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const item = store.find('inbox', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!item) return res.status(404).json({ error: 'Not found.' });
  store.remove('inbox', (x) => x.id === item.id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, item.filename)); } catch {}
  res.json({ ok: true });
});

// ===================== BUDGETS =====================
app.get('/api/orgs/:orgId/budgets', auth.requireAuth, auth.requireOrg, (req, res) => {
  res.json({ budgets: store.filter('budgets', (b) => b.orgId === req.orgId) });
});
app.put('/api/orgs/:orgId/budgets', auth.requireAuth, auth.requireOrg, (req, res) => {
  const incoming = Array.isArray(req.body.budgets) ? req.body.budgets : [];
  for (const b of incoming) {
    if (!store.find('accounts', (a) => a.id === b.accountId && a.orgId === req.orgId)) continue;
    const existing = store.find('budgets', (x) => x.orgId === req.orgId && x.accountId === b.accountId);
    const monthlyAmount = acct.round2(Number(b.monthlyAmount) || 0);
    if (existing) store.update('budgets', existing.id, { monthlyAmount });
    else store.insert('budgets', { orgId: req.orgId, accountId: b.accountId, monthlyAmount });
  }
  res.json({ ok: true });
});

// Budget vs actual over a period.
app.get('/api/orgs/:orgId/reports/budget', auth.requireAuth, auth.requireOrg, (req, res) => {
  const year = new Date().toISOString().slice(0, 4);
  const from = req.query.from || `${year}-01-01`;
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const months = Math.max(1, (new Date(to).getFullYear() * 12 + new Date(to).getMonth()) - (new Date(from).getFullYear() * 12 + new Date(from).getMonth()) + 1);
  const pl = acct.profitAndLoss(req.orgId, from, to);
  const actualByAcc = new Map();
  [...pl.income, ...pl.expenses].forEach((r) => actualByAcc.set(r.accountId, r.amount));
  const budgets = new Map(store.filter('budgets', (b) => b.orgId === req.orgId).map((b) => [b.accountId, b.monthlyAmount]));
  const accounts = acct.chartOfAccounts(req.orgId).filter((a) => a.type === 'income' || a.type === 'expense');
  const rows = accounts.map((a) => {
    const budget = acct.round2((budgets.get(a.id) || 0) * months);
    const actual = acct.round2(actualByAcc.get(a.id) || 0);
    const variance = acct.round2(a.type === 'income' ? actual - budget : budget - actual); // positive = favourable
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, monthly: budgets.get(a.id) || 0, budget, actual, variance };
  });
  res.json({ from, to, months, rows });
});

// ===================== TRACKING CATEGORIES =====================
app.get('/api/orgs/:orgId/tracking', auth.requireAuth, auth.requireOrg, (req, res) => {
  res.json({ options: store.filter('tracking', (t) => t.orgId === req.orgId).sort((a, b) => a.name.localeCompare(b.name)) });
});
app.post('/api/orgs/:orgId/tracking', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (!req.body.name || !req.body.name.trim()) return res.status(400).json({ error: 'Enter a name.' });
  res.json({ option: store.insert('tracking', { orgId: req.orgId, name: req.body.name.trim() }) });
});
app.delete('/api/orgs/:orgId/tracking/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('tracking', (t) => t.id === req.params.id && t.orgId === req.orgId);
  res.json({ ok: true });
});

// Report income/expense split by tracking category over a period.
app.get('/api/orgs/:orgId/reports/tracking', auth.requireAuth, auth.requireOrg, (req, res) => {
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const txns = store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void' && t.date >= from && t.date <= to);
  const linesByTxn = new Map();
  for (const l of store.all('lines')) { if (!linesByTxn.has(l.transactionId)) linesByTxn.set(l.transactionId, []); linesByTxn.get(l.transactionId).push(l); }
  const buckets = new Map(); // key -> {income, expense}
  const add = (key, inc, exp) => { const b = buckets.get(key) || { income: 0, expense: 0 }; b.income += inc; b.expense += exp; buckets.set(key, b); };
  for (const t of txns) {
    let inc = 0, exp = 0;
    for (const l of (linesByTxn.get(t.id) || [])) {
      const a = accById.get(l.accountId); if (!a) continue;
      if (a.type === 'income') inc += Number(l.credit || 0) - Number(l.debit || 0);
      else if (a.type === 'expense') exp += Number(l.debit || 0) - Number(l.credit || 0);
    }
    if (inc === 0 && exp === 0) continue;
    add(t.trackingId || 'unassigned', inc, exp);
  }
  const options = store.filter('tracking', (t) => t.orgId === req.orgId);
  const rows = options.map((o) => { const b = buckets.get(o.id) || { income: 0, expense: 0 }; return { name: o.name, income: acct.round2(b.income), expense: acct.round2(b.expense), net: acct.round2(b.income - b.expense) }; });
  const un = buckets.get('unassigned'); if (un) rows.push({ name: 'Unassigned', income: acct.round2(un.income), expense: acct.round2(un.expense), net: acct.round2(un.income - un.expense) });
  res.json({ from, to, rows });
});

// ===================== GLOBAL SEARCH =====================
app.get('/api/orgs/:orgId/search', auth.requireAuth, auth.requireOrg, (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ results: [] });
  const results = [];
  const viewFor = (t) => (t === 'bill' ? 'bills' : t === 'quote' ? 'quotes' : 'invoices');
  store.filter('contacts', (c) => c.orgId === req.orgId && c.name.toLowerCase().includes(q)).slice(0, 5)
    .forEach((c) => results.push({ group: 'Contacts', label: c.name, sub: c.kind, view: 'contacts' }));
  store.filter('invoices', (x) => x.orgId === req.orgId && String(x.number).toLowerCase().includes(q)).slice(0, 6)
    .forEach((x) => results.push({ group: 'Documents', label: x.number, sub: `${x.type} · £${x.total}`, view: viewFor(x.type) }));
  store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void' && (String(t.description).toLowerCase().includes(q) || String(t.reference || '').toLowerCase().includes(q))).slice(0, 6)
    .forEach((t) => results.push({ group: 'Transactions', label: t.description, sub: t.date, view: 'transactions', search: t.reference || t.description }));
  store.filter('accounts', (a) => a.orgId === req.orgId && (a.name.toLowerCase().includes(q) || a.code.includes(q))).slice(0, 4)
    .forEach((a) => results.push({ group: 'Accounts', label: `${a.code} · ${a.name}`, sub: a.type, view: 'ledger' }));
  res.json({ results: results.slice(0, 18) });
});

// ===================== ACCOUNT LEDGER (drill-down / general ledger) =====================
app.get('/api/orgs/:orgId/accounts/:accountId/ledger', auth.requireAuth, auth.requireOrg, (req, res) => {
  const account = store.find('accounts', (a) => a.id === req.params.accountId && a.orgId === req.orgId);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const from = req.query.from || null;
  const to = req.query.to || null;
  const debitNormal = account.type === 'asset' || account.type === 'expense';
  const txns = store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void');
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const entries = [];
  let opening = 0;
  for (const l of store.filter('lines', (x) => x.accountId === account.id)) {
    const t = txnById.get(l.transactionId);
    if (!t) continue;
    const signed = debitNormal ? Number(l.debit || 0) - Number(l.credit || 0) : Number(l.credit || 0) - Number(l.debit || 0);
    if (from && t.date < from) { opening += signed; continue; }
    if (to && t.date > to) continue;
    entries.push({ date: t.date, description: t.description, reference: t.reference, debit: l.debit || 0, credit: l.credit || 0, signed, source: t.source });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  opening = acct.round2(opening);
  let bal = opening;
  const rows = entries.map((e) => { bal = acct.round2(bal + e.signed); return { ...e, balance: bal }; });
  res.json({ account: { id: account.id, code: account.code, name: account.name, type: account.type }, openingBalance: opening, rows, closingBalance: acct.round2(bal) });
});

// ===================== REPORTS =====================
app.get('/api/orgs/:orgId/reports/trial-balance', auth.requireAuth, auth.requireOrg, (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);
  res.json(acct.trialBalance(req.orgId, asOf));
});

app.get('/api/orgs/:orgId/reports/profit-loss', auth.requireAuth, auth.requireOrg, (req, res) => {
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  res.json(acct.profitAndLoss(req.orgId, from, to));
});

app.get('/api/orgs/:orgId/reports/balance-sheet', auth.requireAuth, auth.requireOrg, (req, res) => {
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);
  res.json(acct.balanceSheet(req.orgId, asOf));
});

// ===================== EXPENSE CLAIMS =====================
app.get('/api/orgs/:orgId/expense-claims', auth.requireAuth, auth.requireOrg, (req, res) => {
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const claims = store.filter('expenseClaims', (x) => x.orgId === req.orgId).sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((x) => ({ ...x, accountName: accById.get(x.accountId)?.name }));
  res.json({ claims, pending: claims.filter((c) => c.status === 'submitted').length });
});
app.post('/api/orgs/:orgId/expense-claims', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { claimant, date, description, accountId, amount, taxRateId } = req.body;
  if (!date || !description) return res.status(400).json({ error: 'Date and description are required.' });
  if (!store.find('accounts', (a) => a.id === accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Choose an expense category.' });
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Enter an amount.' });
  const claim = store.insert('expenseClaims', {
    orgId: req.orgId, claimant: claimant || req.user.name, date, description, accountId, amount: acct.round2(Number(amount)),
    taxRateId: taxRateId || null, status: 'submitted', transactionId: null, createdBy: req.user.id, createdAt: new Date().toISOString(),
  });
  store.audit({ orgId: req.orgId, user: req.user, action: 'claim', entity: 'expense', entityId: claim.id, detail: `${description} ${amount}` });
  res.json({ claim });
});
app.post('/api/orgs/:orgId/expense-claims/:id/status', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can review claims.' });
  const claim = store.find('expenseClaims', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!claim) return res.status(404).json({ error: 'Not found.' });
  const status = req.body.status;
  if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  store.update('expenseClaims', claim.id, { status });
  res.json({ claim: store.byId('expenseClaims', claim.id) });
});
app.post('/api/orgs/:orgId/expense-claims/:id/reimburse', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can reimburse.' });
  const claim = store.find('expenseClaims', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!claim) return res.status(404).json({ error: 'Not found.' });
  if (claim.status !== 'approved') return res.status(400).json({ error: 'Approve the claim first.' });
  const bank = store.find('accounts', (a) => a.id === req.body.paymentAccountId && a.orgId === req.orgId);
  if (!bank) return res.status(400).json({ error: 'Choose the account that reimbursed.' });
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  let net = claim.amount, tax = 0;
  if (claim.taxRateId) { const tr = store.find('taxRates', (t) => t.id === claim.taxRateId && t.orgId === req.orgId); if (tr && tr.rate > 0) { net = acct.round2(claim.amount / (1 + tr.rate / 100)); tax = acct.round2(claim.amount - net); } }
  const vat = accountByCode(req.orgId, '2100');
  const lines = [{ accountId: claim.accountId, debit: net, credit: 0 }];
  if (tax > 0 && vat) lines.push({ accountId: vat.id, debit: tax, credit: 0 });
  lines.push({ accountId: bank.id, debit: 0, credit: claim.amount });
  try {
    const txn = postJournal(req.orgId, req.user, { date, description: `Expense claim — ${claim.description}`, reference: 'EXP', lines, source: 'manual' });
    store.update('expenseClaims', claim.id, { status: 'paid', transactionId: txn.id });
    store.audit({ orgId: req.orgId, user: req.user, action: 'reimburse', entity: 'expense', entityId: claim.id, detail: claim.description });
    res.json({ claim: store.byId('expenseClaims', claim.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/orgs/:orgId/expense-claims/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const claim = store.find('expenseClaims', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!claim) return res.status(404).json({ error: 'Not found.' });
  if (claim.status === 'paid') return res.status(400).json({ error: 'Paid claims cannot be deleted.' });
  store.remove('expenseClaims', (x) => x.id === claim.id);
  res.json({ ok: true });
});

// ===================== PRODUCTS & SERVICES (item catalog) =====================
app.get('/api/orgs/:orgId/items', auth.requireAuth, auth.requireOrg, (req, res) => {
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const method = store.byId('organizations', req.orgId).stockMethod || 'avco';
  const items = store.filter('items', (x) => x.orgId === req.orgId).sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => {
      const base = { ...i, accountName: accById.get(i.saleAccountId)?.name };
      if (i.trackQty) {
        const moves = store.filter('stockMovements', (m) => m.itemId === i.id);
        const v = inventory.valuation(moves, method);
        return { ...base, qtyOnHand: v.qty, stockValue: v.value, avgCost: v.avgCost };
      }
      return base;
    });
  const stockTotal = inventory.round2(items.filter((i) => i.trackQty).reduce((s, i) => s + (i.stockValue || 0), 0));
  res.json({ items, method, stockTotal });
});
app.post('/api/orgs/:orgId/items', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { code, name, description, salePrice, saleAccountId, taxRateId, trackQty, qtyOnHand, reorderLevel } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (saleAccountId && !store.find('accounts', (a) => a.id === saleAccountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Invalid account.' });
  const item = store.insert('items', {
    orgId: req.orgId, code: code || '', name, description: description || '',
    salePrice: acct.round2(Number(salePrice) || 0), saleAccountId: saleAccountId || null, taxRateId: taxRateId || null,
    trackQty: !!trackQty, qtyOnHand: acct.round2(Number(qtyOnHand) || 0), reorderLevel: acct.round2(Number(reorderLevel) || 0),
    costPrice: acct.round2(Number(req.body.costPrice) || 0),
  });
  if (trackQty && Number(qtyOnHand) > 0) {
    store.insert('stockMovements', { orgId: req.orgId, itemId: item.id, date: new Date().toISOString().slice(0, 10), qty: acct.round2(Number(qtyOnHand)), unitCost: acct.round2(Number(req.body.costPrice) || 0), note: 'Opening stock' });
  }
  res.json({ item });
});
app.put('/api/orgs/:orgId/items/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const item = store.find('items', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!item) return res.status(404).json({ error: 'Not found.' });
  const patch = {};
  for (const f of ['code', 'name', 'description']) if (req.body[f] != null) patch[f] = String(req.body[f]);
  if (req.body.salePrice != null) patch.salePrice = acct.round2(Number(req.body.salePrice) || 0);
  if (req.body.saleAccountId !== undefined) patch.saleAccountId = req.body.saleAccountId || null;
  if (req.body.taxRateId !== undefined) patch.taxRateId = req.body.taxRateId || null;
  if (req.body.trackQty !== undefined) patch.trackQty = !!req.body.trackQty;
  if (req.body.qtyOnHand != null) patch.qtyOnHand = acct.round2(Number(req.body.qtyOnHand) || 0);
  if (req.body.reorderLevel != null) patch.reorderLevel = acct.round2(Number(req.body.reorderLevel) || 0);
  store.update('items', item.id, patch);
  res.json({ item: store.byId('items', item.id) });
});
app.post('/api/orgs/:orgId/items/:id/adjust', auth.requireAuth, auth.requireOrg, (req, res) => {
  const item = store.find('items', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!item) return res.status(404).json({ error: 'Not found.' });
  const delta = Number(req.body.delta);
  if (!delta) return res.status(400).json({ error: 'Enter a quantity to add or remove.' });
  // Inflows carry a unit cost (defaults to the item's cost price); outflows are valued by the chosen method.
  const unitCost = delta > 0 ? acct.round2(Number(req.body.unitCost != null ? req.body.unitCost : item.costPrice) || 0) : 0;
  store.insert('stockMovements', { orgId: req.orgId, itemId: item.id, date: req.body.date || new Date().toISOString().slice(0, 10), qty: acct.round2(delta), unitCost, note: req.body.note || (delta > 0 ? 'Stock in' : 'Stock out') });
  const method = store.byId('organizations', req.orgId).stockMethod || 'avco';
  const v = inventory.valuation(store.filter('stockMovements', (m) => m.itemId === item.id), method);
  store.update('items', item.id, { trackQty: true, qtyOnHand: v.qty });
  store.audit({ orgId: req.orgId, user: req.user, action: 'stock', entity: 'item', entityId: item.id, detail: `${item.name} ${delta > 0 ? '+' : ''}${delta}` });
  res.json({ item: { ...store.byId('items', item.id), stockValue: v.value, avgCost: v.avgCost } });
});
app.delete('/api/orgs/:orgId/items/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('items', (x) => x.id === req.params.id && x.orgId === req.orgId);
  res.json({ ok: true });
});

// ===================== CONTACTS (customers / suppliers) =====================
app.get('/api/orgs/:orgId/contacts', auth.requireAuth, auth.requireOrg, (req, res) => {
  const contacts = store.filter('contacts', (x) => x.orgId === req.orgId).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ contacts });
});
app.post('/api/orgs/:orgId/contacts', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { name, kind, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const contact = store.insert('contacts', { orgId: req.orgId, name, kind: kind || 'customer', email: email || '' });
  res.json({ contact });
});

// ===================== TAX RATES =====================
app.get('/api/orgs/:orgId/tax-rates', auth.requireAuth, auth.requireOrg, (req, res) => {
  const rates = store.filter('taxRates', (t) => t.orgId === req.orgId && !t.archived);
  res.json({ taxRates: rates });
});
app.post('/api/orgs/:orgId/tax-rates', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { name, rate } = req.body;
  const r = Number(rate);
  if (!name || isNaN(r) || r < 0 || r > 100) return res.status(400).json({ error: 'Give a name and a rate between 0 and 100.' });
  const tr = store.insert('taxRates', { orgId: req.orgId, name, rate: r, archived: false });
  res.json({ taxRate: tr });
});

// Statement for one contact: their invoices/bills, what's paid and what's outstanding.
app.get('/api/orgs/:orgId/contacts/:id/statement', auth.requireAuth, auth.requireOrg, (req, res) => {
  const contact = store.find('contacts', (c) => c.id === req.params.id && c.orgId === req.orgId);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  const docs = store.filter('invoices', (x) => x.orgId === req.orgId && x.contactId === contact.id)
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  let outstanding = 0, billed = 0, paid = 0;
  for (const d of docs) {
    if (d.type === 'quote') continue;
    billed += d.total;
    paid += d.amountPaid || 0;
    if (d.status === 'awaiting_payment') outstanding += acct.round2(d.total - (d.amountPaid || 0));
  }
  res.json({
    contact: { id: contact.id, name: contact.name, kind: contact.kind, email: contact.email },
    docs: docs.map((d) => ({ id: d.id, type: d.type, number: d.number, issueDate: d.issueDate, dueDate: d.dueDate, total: d.total, status: d.status })),
    billed: acct.round2(billed), paid: acct.round2(paid), outstanding: acct.round2(outstanding),
  });
});

// ===================== INTERNAL: post a balanced journal =====================
function postJournal(orgId, user, { date, description, reference, lines, source, sourceId }) {
  const org = store.byId('organizations', orgId);
  if (acct.isLocked(org, date)) throw new Error(`Period is locked up to ${org.lockDate}.`);
  const err = acct.validateLines(lines);
  if (err) throw new Error(err);
  const txn = store.insert('transactions', {
    orgId, date, description, reference: reference || '',
    createdBy: user.id, createdAt: new Date().toISOString(),
    status: 'posted', source: source || 'manual', sourceId: sourceId || null,
  });
  for (const l of lines) {
    store.insert('lines', {
      transactionId: txn.id, accountId: l.accountId,
      debit: acct.round2(Number(l.debit || 0)), credit: acct.round2(Number(l.credit || 0)), reconciled: false,
    });
  }
  return txn;
}
function accountByCode(orgId, code) {
  return store.find('accounts', (a) => a.orgId === orgId && a.code === code && !a.archived);
}

// ===================== INVOICES & BILLS =====================
app.get('/api/orgs/:orgId/invoices', auth.requireAuth, auth.requireOrg, (req, res) => {
  const type = req.query.type; // 'invoice' | 'bill' | undefined
  let invoices = store.filter('invoices', (x) => x.orgId === req.orgId && (!type || x.type === type));
  const contactsById = new Map(store.filter('contacts', (c) => c.orgId === req.orgId).map((c) => [c.id, c]));
  invoices = invoices
    .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
    .map((inv) => ({ ...inv, contactName: contactsById.get(inv.contactId)?.name || '—' }));
  res.json({ invoices });
});

app.post('/api/orgs/:orgId/invoices', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { type, contactId, number, issueDate, dueDate, lines } = req.body;
  if (!['invoice', 'bill', 'quote', 'po'].includes(type)) return res.status(400).json({ error: 'Invalid document type.' });
  if (!contactId || !store.find('contacts', (c) => c.id === contactId && c.orgId === req.orgId)) {
    return res.status(400).json({ error: 'Choose a valid contact.' });
  }
  if (!issueDate) return res.status(400).json({ error: 'Issue date is required.' });
  if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Add at least one line.' });
  let subtotal = 0, taxTotal = 0;
  const cleanLines = [];
  for (const l of lines) {
    if (!store.find('accounts', (a) => a.id === l.accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Invalid account on a line.' });
    const amt = acct.round2(Number(l.amount || 0));
    if (amt <= 0) return res.status(400).json({ error: 'Each line needs a positive amount.' });
    let rate = 0, taxRateId = l.taxRateId || null;
    if (taxRateId) {
      const tr = store.find('taxRates', (t) => t.id === taxRateId && t.orgId === req.orgId);
      if (!tr) return res.status(400).json({ error: 'Invalid tax rate on a line.' });
      rate = tr.rate;
    }
    const tax = acct.round2(amt * rate / 100);
    subtotal += amt; taxTotal += tax;
    cleanLines.push({ accountId: l.accountId, description: l.description || '', amount: amt, taxRateId, tax });
  }
  const seq = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === type).length + 1;
  const orgN = store.byId('organizations', req.orgId);
  const prefix = type === 'invoice' ? (orgN.invoicePrefix || 'INV-') : type === 'bill' ? (orgN.billPrefix || 'BILL-') : type === 'po' ? (orgN.poPrefix || 'PO-') : (orgN.quotePrefix || 'QUO-');
  const autoNum = prefix + String(seq).padStart(4, '0');
  const invoice = store.insert('invoices', {
    orgId: req.orgId, type, contactId,
    number: number || autoNum, issueDate, dueDate: dueDate || issueDate,
    lines: cleanLines, notes: (req.body.notes || '').slice(0, 600),
    subtotal: acct.round2(subtotal), taxTotal: acct.round2(taxTotal), total: acct.round2(subtotal + taxTotal),
    status: 'draft', transactionId: null, paymentTransactionId: null,
  });
  store.audit({ orgId: req.orgId, user: req.user, action: 'create', entity: type, entityId: invoice.id, detail: `${invoice.number} ${invoice.total}` });
  res.json({ invoice });
});

// Duplicate an invoice/bill/quote into a fresh draft.
app.post('/api/orgs/:orgId/invoices/:id/duplicate', auth.requireAuth, auth.requireOrg, (req, res) => {
  const src = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!src) return res.status(404).json({ error: 'Not found.' });
  const org = store.byId('organizations', req.orgId);
  const seq = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === src.type).length + 1;
  const prefix = src.type === 'invoice' ? (org.invoicePrefix || 'INV-') : src.type === 'bill' ? (org.billPrefix || 'BILL-') : (org.quotePrefix || 'QUO-');
  const issueDate = new Date().toISOString().slice(0, 10);
  const due = new Date(); due.setDate(due.getDate() + (org.paymentTermsDays || 30));
  const copy = store.insert('invoices', {
    orgId: req.orgId, type: src.type, contactId: src.contactId, number: prefix + String(seq).padStart(4, '0'),
    issueDate, dueDate: due.toISOString().slice(0, 10), lines: src.lines.map((l) => ({ ...l })), notes: src.notes || '',
    subtotal: src.subtotal, taxTotal: src.taxTotal, total: src.total, status: 'draft', transactionId: null, paymentTransactionId: null, amountPaid: 0,
  });
  res.json({ invoice: copy });
});

// Edit a draft invoice / bill / quote (recomputes totals).
app.put('/api/orgs/:orgId/invoices/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be edited.' });
  const { contactId, issueDate, dueDate, lines, number, notes } = req.body;
  if (!store.find('contacts', (c) => c.id === contactId && c.orgId === req.orgId)) return res.status(400).json({ error: 'Choose a valid contact.' });
  if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Add at least one line.' });
  let subtotal = 0, taxTotal = 0;
  const cleanLines = [];
  for (const l of lines) {
    if (!store.find('accounts', (a) => a.id === l.accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Invalid account on a line.' });
    const amt = acct.round2(Number(l.amount || 0));
    if (amt <= 0) return res.status(400).json({ error: 'Each line needs a positive amount.' });
    let rate = 0;
    if (l.taxRateId) { const tr = store.find('taxRates', (t) => t.id === l.taxRateId && t.orgId === req.orgId); if (!tr) return res.status(400).json({ error: 'Invalid tax rate.' }); rate = tr.rate; }
    const tax = acct.round2(amt * rate / 100);
    subtotal += amt; taxTotal += tax;
    cleanLines.push({ accountId: l.accountId, description: l.description || '', amount: amt, taxRateId: l.taxRateId || null, tax });
  }
  store.update('invoices', inv.id, {
    contactId, issueDate: issueDate || inv.issueDate, dueDate: dueDate || inv.dueDate, number: number || inv.number,
    lines: cleanLines, notes: (notes || '').slice(0, 600), subtotal: acct.round2(subtotal), taxTotal: acct.round2(taxTotal), total: acct.round2(subtotal + taxTotal),
  });
  res.json({ invoice: store.byId('invoices', inv.id) });
});

// Full single invoice with contact and company details (for the PDF document).
app.get('/api/orgs/:orgId/invoices/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  const contact = inv.contactId ? store.byId('contacts', inv.contactId) : null;
  const org = store.byId('organizations', req.orgId);
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const lines = inv.lines.map((l) => ({ ...l, accountName: accById.get(l.accountId)?.name }));
  res.json({
    invoice: { ...inv, lines },
    contact: contact ? { name: contact.name, email: contact.email, kind: contact.kind } : null,
    company: {
      name: org.name, address: org.companyAddress || '', vatNo: org.companyVatNo || '', regNo: org.companyRegNo || '',
      email: org.companyEmail || '', phone: org.companyPhone || '', bankDetails: org.bankDetails || '',
      logoUrl: org.logoFile ? `/api/orgs/${req.orgId}/logo` : '',
    },
  });
});

app.post('/api/orgs/:orgId/invoices/:id/sent', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  const patch = { sentAt: new Date().toISOString() };
  if ((inv.type === 'quote' || inv.type === 'po') && inv.status === 'draft') patch.status = 'sent';
  store.update('invoices', inv.id, patch);
  store.audit({ orgId: req.orgId, user: req.user, action: 'send', entity: inv.type, entityId: inv.id, detail: `${inv.number} to ${req.body.to || 'customer'}` });
  res.json({ ok: true });
});

// Quote status: accept / decline (quotes don't post to the ledger).
app.post('/api/orgs/:orgId/invoices/:id/quote-status', auth.requireAuth, auth.requireOrg, (req, res) => {
  const q = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId && x.type === 'quote');
  if (!q) return res.status(404).json({ error: 'Quote not found.' });
  const status = req.body.status;
  if (!['sent', 'accepted', 'declined', 'draft'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  store.update('invoices', q.id, { status });
  store.audit({ orgId: req.orgId, user: req.user, action: 'quote-' + status, entity: 'quote', entityId: q.id, detail: q.number });
  res.json({ quote: store.byId('invoices', q.id) });
});

// Convert a quote → draft sales invoice, or a purchase order → draft bill.
app.post('/api/orgs/:orgId/invoices/:id/convert', auth.requireAuth, auth.requireOrg, (req, res) => {
  const src = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId && (x.type === 'quote' || x.type === 'po'));
  if (!src) return res.status(404).json({ error: 'Quote or purchase order not found.' });
  if (src.convertedToId) return res.status(400).json({ error: 'This has already been converted.' });
  const org = store.byId('organizations', req.orgId);
  const newType = src.type === 'quote' ? 'invoice' : 'bill';
  const seq = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === newType).length + 1;
  const number = (newType === 'invoice' ? (org.invoicePrefix || 'INV-') : (org.billPrefix || 'BILL-')) + String(seq).padStart(4, '0');
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(); due.setDate(due.getDate() + (org.paymentTermsDays || 30));
  const doc = store.insert('invoices', {
    orgId: req.orgId, type: newType, contactId: src.contactId, number, issueDate: today, dueDate: due.toISOString().slice(0, 10),
    lines: src.lines.map((l) => ({ ...l })), subtotal: src.subtotal, taxTotal: src.taxTotal, total: src.total,
    status: 'draft', transactionId: null, paymentTransactionId: null, fromQuoteId: src.id,
  });
  store.update('invoices', src.id, { status: 'converted', convertedToId: doc.id });
  store.audit({ orgId: req.orgId, user: req.user, action: 'convert', entity: src.type, entityId: src.id, detail: `${src.number} → ${number}` });
  res.json({ invoice: doc });
});

// Approve — posts the journal to AR/AP.
app.post('/api/orgs/:orgId/invoices/:id/approve', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  if (inv.type === 'quote' || inv.type === 'po') return res.status(400).json({ error: 'Quotes and purchase orders are converted, not approved.' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be approved.' });
  const control = accountByCode(req.orgId, inv.type === 'invoice' ? '1100' : '2000');
  if (!control) return res.status(400).json({ error: `Missing ${inv.type === 'invoice' ? 'Accounts Receivable (1100)' : 'Accounts Payable (2000)'} account.` });
  const taxTotal = acct.round2(inv.taxTotal || 0);
  let vat = null;
  if (taxTotal > 0) {
    vat = accountByCode(req.orgId, '2100');
    if (!vat) return res.status(400).json({ error: 'Missing VAT / Sales Tax Payable (2100) account.' });
  }
  let lines;
  if (inv.type === 'invoice') {
    // Dr AR (gross), Cr income (net), Cr VAT (output tax)
    lines = [{ accountId: control.id, debit: inv.total, credit: 0 }, ...inv.lines.map((l) => ({ accountId: l.accountId, debit: 0, credit: l.amount }))];
    if (vat) lines.push({ accountId: vat.id, debit: 0, credit: taxTotal });
  } else {
    // Dr expense (net), Dr VAT (input tax), Cr AP (gross)
    lines = [...inv.lines.map((l) => ({ accountId: l.accountId, debit: l.amount, credit: 0 }))];
    if (vat) lines.push({ accountId: vat.id, debit: taxTotal, credit: 0 });
    lines.push({ accountId: control.id, debit: 0, credit: inv.total });
  }
  try {
    const txn = postJournal(req.orgId, req.user, {
      date: inv.issueDate, description: `${inv.type === 'invoice' ? 'Invoice' : 'Bill'} ${inv.number}`,
      reference: inv.number, lines, source: inv.type, sourceId: inv.id,
    });
    store.update('invoices', inv.id, { status: 'awaiting_payment', transactionId: txn.id });
    store.audit({ orgId: req.orgId, user: req.user, action: 'approve', entity: inv.type, entityId: inv.id, detail: inv.number });
    res.json({ invoice: store.byId('invoices', inv.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Pay — records a (possibly partial) settlement against bank.
app.post('/api/orgs/:orgId/invoices/:id/pay', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  if (inv.status !== 'awaiting_payment') return res.status(400).json({ error: 'Only approved, unpaid items can be paid.' });
  const bank = store.find('accounts', (a) => a.id === req.body.paymentAccountId && a.orgId === req.orgId);
  if (!bank) return res.status(400).json({ error: 'Choose the bank/cash account used.' });
  const remaining = acct.round2(inv.total - (inv.amountPaid || 0));
  let amount = req.body.amount != null ? acct.round2(Number(req.body.amount)) : remaining;
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter a payment amount.' });
  if (amount > remaining) return res.status(400).json({ error: `Payment exceeds the £${remaining.toFixed(2)} outstanding.` });
  const control = accountByCode(req.orgId, inv.type === 'invoice' ? '1100' : '2000');
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  const lines = inv.type === 'invoice'
    ? [{ accountId: bank.id, debit: amount, credit: 0 }, { accountId: control.id, debit: 0, credit: amount }]
    : [{ accountId: control.id, debit: amount, credit: 0 }, { accountId: bank.id, debit: 0, credit: amount }];
  try {
    const txn = postJournal(req.orgId, req.user, {
      date, description: `Payment — ${inv.number}`, reference: inv.number, lines, source: 'payment', sourceId: inv.id,
    });
    const amountPaid = acct.round2((inv.amountPaid || 0) + amount);
    const fully = amountPaid >= acct.round2(inv.total) - 0.001;
    store.update('invoices', inv.id, { amountPaid, status: fully ? 'paid' : 'awaiting_payment', paymentTransactionId: txn.id });
    store.audit({ orgId: req.orgId, user: req.user, action: fully ? 'pay' : 'part-pay', entity: inv.type, entityId: inv.id, detail: `${inv.number} ${amount}` });
    res.json({ invoice: store.byId('invoices', inv.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/orgs/:orgId/invoices/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const inv = store.find('invoices', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!inv) return res.status(404).json({ error: 'Not found.' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be deleted. Void the posted entry instead.' });
  store.remove('invoices', (x) => x.id === inv.id);
  res.json({ ok: true });
});

// ===================== RECURRING INVOICES / BILLS =====================
function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'fortnightly') d.setDate(d.getDate() + 14);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1); // monthly
  return d.toISOString().slice(0, 10);
}

app.get('/api/orgs/:orgId/recurring', auth.requireAuth, auth.requireOrg, (req, res) => {
  const contactsById = new Map(store.filter('contacts', (x) => x.orgId === req.orgId).map((x) => [x.id, x]));
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const today = new Date().toISOString().slice(0, 10);
  const list = store.filter('recurring', (r) => r.orgId === req.orgId).map((r) => ({
    ...r, contactName: contactsById.get(r.contactId)?.name || '—', accountName: accById.get(r.accountId)?.name || '',
    due: r.active && r.nextDate <= today,
  }));
  res.json({ recurring: list, dueCount: list.filter((r) => r.due).length });
});

app.post('/api/orgs/:orgId/recurring', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { type, contactId, description, accountId, amount, taxRateId, frequency, nextDate } = req.body;
  if (type !== 'invoice' && type !== 'bill') return res.status(400).json({ error: 'Type must be invoice or bill.' });
  if (!store.find('contacts', (c) => c.id === contactId && c.orgId === req.orgId)) return res.status(400).json({ error: 'Choose a contact.' });
  if (!store.find('accounts', (a) => a.id === accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Choose an account.' });
  if (!(Number(amount) > 0) || !nextDate) return res.status(400).json({ error: 'Enter an amount and start date.' });
  const rec = store.insert('recurring', {
    orgId: req.orgId, type, contactId, description: description || '', accountId, amount: acct.round2(Number(amount)),
    taxRateId: taxRateId || null, frequency: frequency || 'monthly', nextDate, active: true, createdAt: new Date().toISOString(),
  });
  res.json({ recurring: rec });
});

app.delete('/api/orgs/:orgId/recurring/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('recurring', (r) => r.id === req.params.id && r.orgId === req.orgId);
  res.json({ ok: true });
});

// Generate draft invoices/bills for every template that's due, advancing their next date.
app.post('/api/orgs/:orgId/recurring/generate', auth.requireAuth, auth.requireOrg, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  let generated = 0;
  for (const r of store.filter('recurring', (x) => x.orgId === req.orgId && x.active)) {
    let guard = 0;
    while (r.nextDate <= today && guard < 24) {
      const tr = r.taxRateId ? store.find('taxRates', (t) => t.id === r.taxRateId && t.orgId === req.orgId) : null;
      const rate = tr ? tr.rate : 0;
      const tax = acct.round2(r.amount * rate / 100);
      const seq = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === r.type).length + 1;
      const num = (r.type === 'invoice' ? 'INV-' : 'BILL-') + String(seq).padStart(4, '0');
      const due = advanceDate(r.nextDate, 'monthly');
      store.insert('invoices', {
        orgId: req.orgId, type: r.type, contactId: r.contactId, number: num, issueDate: r.nextDate, dueDate: due,
        lines: [{ accountId: r.accountId, description: r.description, amount: r.amount, taxRateId: r.taxRateId || null, tax }],
        subtotal: r.amount, taxTotal: tax, total: acct.round2(r.amount + tax), status: 'draft', transactionId: null, paymentTransactionId: null, recurringId: r.id,
      });
      const nd = advanceDate(r.nextDate, r.frequency);
      store.update('recurring', r.id, { nextDate: nd });
      r.nextDate = nd;
      generated += 1; guard += 1;
    }
  }
  store.audit({ orgId: req.orgId, user: req.user, action: 'generate', entity: 'recurring', detail: `${generated} drafts` });
  res.json({ generated });
});

// AR / AP aging — open (approved, unpaid) items bucketed by overdue age.
app.get('/api/orgs/:orgId/reports/aging', auth.requireAuth, auth.requireOrg, (req, res) => {
  const type = req.query.type === 'payable' ? 'bill' : 'invoice';
  const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);
  const contactsById = new Map(store.filter('contacts', (c) => c.orgId === req.orgId).map((c) => [c.id, c]));
  const open = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === type && x.status === 'awaiting_payment');
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  const rows = open.map((inv) => {
    const remaining = acct.round2(inv.total - (inv.amountPaid || 0));
    const days = Math.floor((new Date(asOf) - new Date(inv.dueDate)) / 86400000);
    let bucket = 'current'; // not yet due
    if (days > 60) bucket = 'd90'; else if (days > 30) bucket = 'd60'; else if (days > 0) bucket = 'd30';
    buckets[bucket] += remaining;
    return { number: inv.number, contactName: contactsById.get(inv.contactId)?.name || '—', dueDate: inv.dueDate, daysOverdue: Math.max(0, days), amount: remaining };
  }).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  for (const k of Object.keys(buckets)) buckets[k] = acct.round2(buckets[k]);
  res.json({ type, asOf, rows, buckets, total: acct.round2(total) });
});

// ===================== VAT RETURN =====================
app.get('/api/orgs/:orgId/reports/vat', auth.requireAuth, auth.requireOrg, (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || '0000-01-01';
  res.json(acct.vatReturn(req.orgId, from, to));
});

// ===================== ORG SETTINGS (VAT scheme) =====================
app.put('/api/orgs/:orgId/settings', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can change settings.' });
  const patch = {};
  if (req.body.vatScheme && ['accrual', 'cash', 'flat'].includes(req.body.vatScheme)) patch.vatScheme = req.body.vatScheme;
  if (req.body.flatRate != null) patch.flatRate = Number(req.body.flatRate) || 0;
  if (req.body.vatPeriod && ['quarterly', 'monthly'].includes(req.body.vatPeriod)) patch.vatPeriod = req.body.vatPeriod;
  for (const f of ['companyAddress', 'companyVatNo', 'companyRegNo', 'companyEmail', 'companyPhone', 'bankDetails']) {
    if (req.body[f] != null) patch[f] = String(req.body[f]);
  }
  store.update('organizations', req.orgId, patch);
  store.audit({ orgId: req.orgId, user: req.user, action: 'settings', entity: 'organization', entityId: req.orgId, detail: JSON.stringify(patch) });
  res.json({ org: { id: req.orgId, vatScheme: patch.vatScheme, flatRate: patch.flatRate } });
});

// Boxed VAT return using the org's chosen scheme.
app.get('/api/orgs/:orgId/reports/vat-return', auth.requireAuth, auth.requireOrg, (req, res) => {
  const org = store.byId('organizations', req.orgId);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || '0000-01-01';
  const scheme = req.query.scheme || org.vatScheme || 'accrual';
  res.json(acct.vatReturnBoxed(req.orgId, from, to, scheme, org.flatRate || 0));
});

// ===================== VAT PERIODS & MTD-READY SUBMISSION =====================
app.get('/api/orgs/:orgId/vat-periods', auth.requireAuth, auth.requireOrg, (req, res) => {
  const org = store.byId('organizations', req.orgId);
  const year = Number(req.query.year) || Number(new Date().toISOString().slice(0, 4));
  const scheme = org.vatScheme || 'accrual';
  const monthly = (org.vatPeriod || 'quarterly') === 'monthly';
  const periods = [];
  if (monthly) {
    for (let m = 0; m < 12; m++) {
      const from = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const to = new Date(year, m + 1, 0).toISOString().slice(0, 10);
      periods.push({ from, to, label: new Date(year, m, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }) });
    }
  } else {
    for (let q = 0; q < 4; q++) {
      const from = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      const to = new Date(year, q * 3 + 3, 0).toISOString().slice(0, 10);
      periods.push({ from, to, label: `Q${q + 1} ${year} (${from.slice(5)} – ${to.slice(5)})` });
    }
  }
  const stored = store.filter('vatReturns', (v) => v.orgId === req.orgId);
  const todayStr = new Date().toISOString().slice(0, 10);
  const DAY = 86400000;
  const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / DAY);
  const rows = periods.map((p) => {
    const boxes = acct.vatReturnBoxed(req.orgId, p.from, p.to, scheme, org.flatRate || 0);
    const sub = stored.find((v) => v.from === p.from && v.to === p.to);
    // MTD filing deadline: one calendar month and 7 days after the period ends.
    const due = new Date(p.to); due.setMonth(due.getMonth() + 1); due.setDate(due.getDate() + 7);
    const dueDate = due.toISOString().slice(0, 10);
    const ended = p.to < todayStr;
    return {
      ...p, box5: boxes.box5, box1: boxes.box1, box4: boxes.box4,
      ended, dueDate, daysUntilEnd: daysBetween(todayStr, p.to), daysUntilDue: daysBetween(todayStr, dueDate),
      status: sub ? 'submitted' : (ended ? 'open' : 'in_progress'),
      submittedAt: sub ? sub.submittedAt : null, reference: sub ? sub.reference : null,
    };
  });
  res.json({ scheme, period: monthly ? 'monthly' : 'quarterly', rows });
});

// Generate and "submit" a VAT return (stub — records it; live MTD filing needs HMRC recognition).
app.post('/api/orgs/:orgId/vat-returns', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can submit VAT returns.' });
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Period required.' });
  const org = store.byId('organizations', req.orgId);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (to >= todayStr) return res.status(400).json({ error: 'This VAT period has not finished yet — you can submit it once it ends.' });
  const boxes = acct.vatReturnBoxed(req.orgId, from, to, org.vatScheme || 'accrual', org.flatRate || 0);
  const existing = store.find('vatReturns', (v) => v.orgId === req.orgId && v.from === from && v.to === to);
  if (existing) return res.status(400).json({ error: 'This period has already been submitted.' });
  const reference = 'LUMI-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const rec = store.insert('vatReturns', { orgId: req.orgId, from, to, boxes, status: 'submitted', submittedAt: new Date().toISOString(), submittedBy: req.user.name, reference });
  store.audit({ orgId: req.orgId, user: req.user, action: 'vat-submit', entity: 'vat', entityId: rec.id, detail: `${from}–${to} net ${boxes.box5}` });
  res.json({ vatReturn: rec });
});

// ===================== OPENING BALANCES =====================
app.post('/api/orgs/:orgId/opening-balances', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can enter opening balances.' });
  const { date, entries } = req.body;
  if (!date || !Array.isArray(entries) || !entries.length) return res.status(400).json({ error: 'Provide a date and at least one balance.' });
  const lines = [];
  let net = 0;
  for (const e of entries) {
    if (!store.find('accounts', (a) => a.id === e.accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Invalid account.' });
    const debit = acct.round2(Number(e.debit || 0)), credit = acct.round2(Number(e.credit || 0));
    if (debit === 0 && credit === 0) continue;
    lines.push({ accountId: e.accountId, debit, credit });
    net += debit - credit;
  }
  if (!lines.length) return res.status(400).json({ error: 'Enter at least one balance.' });
  net = acct.round2(net);
  if (net !== 0) {
    const suspense = accountByCode(req.orgId, '3300');
    if (!suspense) return res.status(400).json({ error: 'Missing Opening Balances Suspense (3300) account.' });
    lines.push({ accountId: suspense.id, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0 });
  }
  try {
    const txn = postJournal(req.orgId, req.user, { date, description: 'Opening balances', reference: 'OB', lines, source: 'manual' });
    store.audit({ orgId: req.orgId, user: req.user, action: 'opening-balances', entity: 'transaction', entityId: txn.id, detail: `${lines.length} lines` });
    res.json({ transaction: txn });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ===================== FIXED ASSETS & DEPRECIATION =====================
app.get('/api/orgs/:orgId/fixed-assets', auth.requireAuth, auth.requireOrg, (req, res) => {
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  const assets = store.filter('fixedAssets', (x) => x.orgId === req.orgId).map((a) => {
    const monthly = a.usefulLifeYears > 0 ? acct.round2(a.cost / (a.usefulLifeYears * 12)) : 0;
    return { ...a, monthly, accountName: accById.get(a.assetAccountId)?.name, netBookValue: acct.round2(a.cost - (a.accumulated || 0)) };
  });
  res.json({ assets });
});

app.post('/api/orgs/:orgId/fixed-assets', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { name, cost, purchaseDate, usefulLifeYears, assetAccountId } = req.body;
  if (!name || !(Number(cost) > 0) || !purchaseDate || !(Number(usefulLifeYears) > 0)) {
    return res.status(400).json({ error: 'Name, cost, purchase date and useful life are required.' });
  }
  if (!store.find('accounts', (a) => a.id === assetAccountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Choose the asset account.' });
  const asset = store.insert('fixedAssets', {
    orgId: req.orgId, name, cost: acct.round2(Number(cost)), purchaseDate,
    usefulLifeYears: Number(usefulLifeYears), assetAccountId, accumulated: 0, depreciatedTo: purchaseDate,
  });
  res.json({ asset });
});

// Post straight-line depreciation from where it was last run up to a chosen date.
app.post('/api/orgs/:orgId/fixed-assets/:id/depreciate', auth.requireAuth, auth.requireOrg, (req, res) => {
  const asset = store.find('fixedAssets', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!asset) return res.status(404).json({ error: 'Asset not found.' });
  const asOf = req.body.asOf || new Date().toISOString().slice(0, 10);
  const monthsBetween = (a, b) => (new Date(b).getFullYear() - new Date(a).getFullYear()) * 12 + (new Date(b).getMonth() - new Date(a).getMonth());
  const months = monthsBetween(asset.depreciatedTo, asOf);
  if (months <= 0) return res.status(400).json({ error: 'Nothing to depreciate up to that date yet.' });
  const monthly = asset.cost / (asset.usefulLifeYears * 12);
  let charge = acct.round2(monthly * months);
  const remaining = acct.round2(asset.cost - (asset.accumulated || 0));
  if (charge > remaining) charge = remaining;
  if (charge <= 0) return res.status(400).json({ error: 'This asset is already fully depreciated.' });
  const dep = accountByCode(req.orgId, '7000'), accum = accountByCode(req.orgId, '1500');
  if (!dep || !accum) return res.status(400).json({ error: 'Missing Depreciation (7000) or Accumulated Depreciation (1500) account.' });
  try {
    const txn = postJournal(req.orgId, req.user, {
      date: asOf, description: `Depreciation — ${asset.name}`, reference: 'DEP',
      lines: [{ accountId: dep.id, debit: charge, credit: 0 }, { accountId: accum.id, debit: 0, credit: charge }], source: 'manual',
    });
    store.update('fixedAssets', asset.id, { accumulated: acct.round2((asset.accumulated || 0) + charge), depreciatedTo: asOf });
    store.audit({ orgId: req.orgId, user: req.user, action: 'depreciate', entity: 'asset', entityId: asset.id, detail: `${asset.name} ${charge}` });
    res.json({ charge, transaction: txn });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ===================== CASHFLOW FORECAST =====================
// Projects recurring cash patterns (learned from the last 84 days) forward, plus the
// specific open invoices/bills, across a weekly or monthly horizon up to 12 months.
const DAY = 86400000;
const isoOf = (d) => d.toISOString().slice(0, 10);

function detectRecurring(orgId, today) {
  const cashIds = new Set(store.filter('accounts', (a) => a.orgId === orgId && a.type === 'asset' && /^10\d\d$/.test(a.code)).map((a) => a.id));
  const sinceStr = isoOf(new Date(today.getTime() - 84 * DAY));
  const todayStr = isoOf(today);
  const txns = store.filter('transactions', (t) => t.orgId === orgId && t.status !== 'void' && t.date >= sinceStr && t.date <= todayStr && t.source !== 'invoice' && t.source !== 'bill');
  const linesByTxn = new Map();
  for (const l of store.all('lines')) {
    if (!linesByTxn.has(l.transactionId)) linesByTxn.set(l.transactionId, []);
    linesByTxn.get(l.transactionId).push(l);
  }
  const groups = new Map();
  for (const t of txns) {
    const key = ai.deriveKey(t.description);
    if (!key) continue;
    let delta = 0;
    for (const l of (linesByTxn.get(t.id) || [])) if (cashIds.has(l.accountId)) delta += Number(l.debit || 0) - Number(l.credit || 0);
    if (delta === 0) continue;
    if (!groups.has(key)) groups.set(key, { key, total: 0, count: 0 });
    const g = groups.get(key); g.total += delta; g.count += 1;
  }
  const drivers = [];
  for (const g of groups.values()) {
    if (g.count < 3) continue; // only genuinely recurring patterns
    drivers.push({ key: g.key, dailyRate: g.total / 84, count: g.count });
  }
  return drivers;
}

// Average daily cash IN and OUT over a recent window, from actual cash movements.
// Excludes AR/AP settlements (source 'payment') so specific open invoices/bills can
// be layered on without double counting. This is the historical prediction baseline.
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
function operatingCashRates(orgId, today, windowDays) {
  const cashIds = new Set(store.filter('accounts', (a) => a.orgId === orgId && a.type === 'asset' && /^10\d\d$/.test(a.code)).map((a) => a.id));
  const since = isoOf(new Date(today.getTime() - windowDays * DAY));
  const todayStr = isoOf(today);
  const txns = store.filter('transactions', (t) => t.orgId === orgId && t.status !== 'void' && t.date >= since && t.date <= todayStr && t.source !== 'payment');
  const linesByTxn = new Map();
  for (const l of store.all('lines')) { if (!linesByTxn.has(l.transactionId)) linesByTxn.set(l.transactionId, []); linesByTxn.get(l.transactionId).push(l); }
  let inSum = 0, outSum = 0;
  const weekBuckets = new Map(); // week index back from today -> net cash
  for (const t of txns) {
    let delta = 0;
    for (const l of (linesByTxn.get(t.id) || [])) if (cashIds.has(l.accountId)) delta += Number(l.debit || 0) - Number(l.credit || 0);
    if (delta === 0) continue;
    if (delta > 0) inSum += delta; else outSum += -delta;
    const wk = Math.floor((today - new Date(t.date)) / (7 * DAY));
    weekBuckets.set(wk, (weekBuckets.get(wk) || 0) + delta);
  }
  // Weekly net samples (exclude the current partial week, index 0) for the range band.
  const weeklyNet = [];
  for (const [wk, net] of weekBuckets) if (wk >= 1) weeklyNet.push(net);
  weeklyNet.sort((a, b) => a - b);
  const meanWeeklyNet = (inSum - outSum) / windowDays * 7;
  return {
    dailyIn: inSum / windowDays, dailyOut: outSum / windowDays, windowDays,
    weeklyNet, samples: weeklyNet.length, meanWeeklyNet,
    q1WeeklyNet: weeklyNet.length ? quantile(weeklyNet, 0.25) : meanWeeklyNet,
    q3WeeklyNet: weeklyNet.length ? quantile(weeklyNet, 0.75) : meanWeeklyNet,
  };
}

app.get('/api/orgs/:orgId/reports/cashflow', auth.requireAuth, auth.requireOrg, (req, res) => {
  const unit = req.query.unit === 'month' ? 'month' : 'week';
  const horizon = Math.min(unit === 'month' ? 12 : 52, Math.max(4, Number(req.query.horizon) || (unit === 'month' ? 6 : 12)));
  const today = new Date(new Date().toISOString().slice(0, 10));
  const cashIds = new Set(store.filter('accounts', (a) => a.orgId === req.orgId && a.type === 'asset' && /^10\d\d$/.test(a.code)).map((a) => a.id));
  let opening = 0;
  for (const l of acct.orgLines(req.orgId, { to: isoOf(today) })) if (cashIds.has(l.accountId)) opening += Number(l.debit || 0) - Number(l.credit || 0);
  opening = acct.round2(opening);

  // Build period boundaries.
  const periods = [];
  for (let i = 0; i < horizon; i++) {
    let start, end, label;
    if (unit === 'week') {
      start = new Date(today.getTime() + i * 7 * DAY); end = new Date(start.getTime() + 7 * DAY);
      label = isoOf(start);
    } else {
      start = i === 0 ? new Date(today) : new Date(today.getFullYear(), today.getMonth() + i, 1);
      end = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
      label = start.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
    }
    periods.push({ label, start: isoOf(start), end: isoOf(end), days: Math.round((end - start) / DAY), inflow: 0, outflow: 0, recurringNet: 0, knownNet: 0 });
  }
  const horizonEnd = new Date(periods[periods.length - 1].end);
  const idxFor = (dateStr) => {
    const d = new Date(dateStr);
    if (d < today) return 0;
    for (let i = 0; i < periods.length; i++) if (isoOf(d) >= periods[i].start && isoOf(d) < periods[i].end) return i;
    return -1;
  };

  // Historical operating baseline: average daily cash in/out over the last 90 days,
  // projected across each future period (so the forecast reflects real patterns).
  const histWindow = 90;
  const rates = operatingCashRates(req.orgId, today, histWindow);
  for (const p of periods) {
    const pin = acct.round2(rates.dailyIn * p.days);
    const pout = acct.round2(rates.dailyOut * p.days);
    p.baselineIn = pin; p.baselineOut = pout;
    p.inflow += pin; p.outflow += pout;
  }
  const drivers = detectRecurring(req.orgId, today); // shown in the "what's driving this" panel
  // Specific open invoices/bills on their due dates.
  for (const inv of store.filter('invoices', (x) => x.orgId === req.orgId && x.status === 'awaiting_payment')) {
    const i = idxFor(inv.dueDate);
    if (i < 0) continue;
    const amt = inv.type === 'invoice' ? inv.total : -inv.total;
    p_apply(periods[i], amt);
  }
  // User scenario adjustments (Little Lumi note suggestions + manual entries).
  const scenarios = store.filter('cashScenarios', (s) => s.orgId === req.orgId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const sc of scenarios) {
    const i = idxFor(sc.date);
    if (i < 0) continue;
    p_apply(periods[i], sc.direction === 'out' ? -Math.abs(sc.amount) : Math.abs(sc.amount));
  }
  function p_apply(p, amt) { p.knownNet = acct.round2((p.knownNet || 0) + amt); if (amt >= 0) p.inflow += amt; else p.outflow += -amt; }

  let bal = opening, lowBal = opening, highBal = opening, lowestLow = opening;
  let lowest = { balance: opening, label: 'today' };
  const out = periods.map((p) => {
    const inflow = acct.round2(p.inflow), outflow = acct.round2(p.outflow);
    const known = p.knownNet || 0;
    // Range band: vary only the uncertain operating baseline by its historical quartiles;
    // known invoices/bills and user scenarios are fixed across all three lines.
    const opCentral = (p.baselineIn || 0) - (p.baselineOut || 0);
    const opLow = rates.q1WeeklyNet * (p.days / 7);
    const opHigh = rates.q3WeeklyNet * (p.days / 7);
    const lowNet = Math.min(opLow, opCentral) + known;
    const highNet = Math.max(opHigh, opCentral) + known;
    const openBal = bal;
    bal = acct.round2(bal + inflow - outflow);
    lowBal = acct.round2(lowBal + lowNet);
    highBal = acct.round2(highBal + highNet);
    if (bal < lowest.balance) lowest = { balance: bal, label: p.label };
    if (lowBal < lowestLow) lowestLow = lowBal;
    return { label: p.label, start: p.start, opening: openBal, inflow, outflow, net: acct.round2(inflow - outflow), closing: bal, closingLow: lowBal, closingHigh: highBal };
  });

  const driverList = drivers
    .map((d) => ({ description: d.key, perWeek: acct.round2(d.dailyRate * 7), perMonth: acct.round2(d.dailyRate * 30), direction: d.dailyRate >= 0 ? 'in' : 'out' }))
    .sort((a, b) => Math.abs(b.perMonth) - Math.abs(a.perMonth));

  res.json({ unit, horizon, openingCash: opening, periods: out, closingCash: bal, closingLow: lowBal, closingHigh: highBal, lowest, lowestLow: acct.round2(lowestLow), drivers: driverList, scenarios,
    history: { windowDays: rates.windowDays, samples: rates.samples, dailyIn: acct.round2(rates.dailyIn), dailyOut: acct.round2(rates.dailyOut),
      perWeekIn: acct.round2(rates.dailyIn * 7), perWeekOut: acct.round2(rates.dailyOut * 7),
      q1WeeklyNet: acct.round2(rates.q1WeeklyNet), q3WeeklyNet: acct.round2(rates.q3WeeklyNet) } });
});

// Suggest cashflow adjustments from a plain-English note (Little Lumi reads it).
app.post('/api/orgs/:orgId/reports/cashflow/parse', auth.requireAuth, auth.requireOrg, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({ suggestions: ai.parseCashflowNote(req.body.text || '', today) });
});
// Save / remove a scenario adjustment that overlays on the forecast.
app.post('/api/orgs/:orgId/reports/cashflow/scenarios', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { label, amount, direction, date, note } = req.body;
  const amt = Math.abs(Number(amount));
  if (!label || !amt || !date) return res.status(400).json({ error: 'A label, amount and date are required.' });
  const sc = store.insert('cashScenarios', { orgId: req.orgId, label: String(label).slice(0, 80), amount: acct.round2(amt),
    direction: direction === 'out' ? 'out' : 'in', date, note: note || '', createdAt: new Date().toISOString() });
  store.audit({ orgId: req.orgId, user: req.user, action: 'create', entity: 'cashScenario', entityId: sc.id, detail: `${sc.label} ${sc.direction} ${sc.amount}` });
  res.json({ scenario: sc });
});
app.delete('/api/orgs/:orgId/reports/cashflow/scenarios/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('cashScenarios', (s) => s.id === req.params.id && s.orgId === req.orgId);
  res.json({ ok: true });
});

// ===================== DASHBOARD SUMMARY (live figures + action list) =====================
app.get('/api/orgs/:orgId/dashboard', auth.requireAuth, auth.requireOrg, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const plYear = acct.profitAndLoss(req.orgId, `${year}-01-01`, `${year}-12-31`);
  const ct = acct.corporationTaxEstimate(plYear.netProfit);
  const vat = acct.vatPosition(req.orgId, today);

  // Action items
  const inv = store.filter('invoices', (x) => x.orgId === req.orgId);
  const draftInv = inv.filter((x) => x.type === 'invoice' && x.status === 'draft').length;
  const draftBill = inv.filter((x) => x.type === 'bill' && x.status === 'draft').length;
  const overdueInv = inv.filter((x) => x.type === 'invoice' && x.status === 'awaiting_payment' && x.dueDate < today).length;
  const overdueBill = inv.filter((x) => x.type === 'bill' && x.status === 'awaiting_payment' && x.dueDate < today).length;
  const unrec = store.filter('lines', (l) => {
    const t = store.byId('transactions', l.transactionId);
    if (!t || t.orgId !== req.orgId || t.status === 'void') return false;
    const a = store.byId('accounts', l.accountId);
    return a && a.type === 'asset' && /^10\d\d$/.test(a.code) && !l.reconciled;
  }).length;

  const actions = [];
  if (draftInv) actions.push({ text: `Approve ${draftInv} draft invoice${draftInv > 1 ? 's' : ''}`, view: 'invoices' });
  if (draftBill) actions.push({ text: `Approve ${draftBill} draft bill${draftBill > 1 ? 's' : ''}`, view: 'bills' });
  if (overdueInv) actions.push({ text: `Chase ${overdueInv} overdue invoice${overdueInv > 1 ? 's' : ''}`, view: 'invoices' });
  if (overdueBill) actions.push({ text: `Pay ${overdueBill} overdue bill${overdueBill > 1 ? 's' : ''}`, view: 'bills' });
  if (unrec) actions.push({ text: `Reconcile ${unrec} bank line${unrec > 1 ? 's' : ''}`, view: 'reconcile' });
  if (vat.owed > 0) actions.push({ text: `VAT owed to HMRC: position ${vat.owed.toFixed(2)}`, view: 'vat' });
  const recurringDue = store.filter('recurring', (r) => r.orgId === req.orgId && r.active && r.nextDate <= today).length;
  if (recurringDue) actions.push({ text: `Generate ${recurringDue} recurring invoice${recurringDue > 1 ? 's' : ''} now due`, view: 'recurring' });
  const acceptedQuotes = store.filter('invoices', (x) => x.orgId === req.orgId && x.type === 'quote' && x.status === 'accepted' && !x.convertedToId).length;
  if (acceptedQuotes) actions.push({ text: `Convert ${acceptedQuotes} accepted quote${acceptedQuotes > 1 ? 's' : ''} to invoices`, view: 'quotes' });

  // Bank data freshness: days since the most recent movement on each cash account.
  const cash = store.filter('accounts', (a) => a.orgId === req.orgId && a.type === 'asset' && /^10\d\d$/.test(a.code));
  const txnDate = new Map(store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void').map((t) => [t.id, t.date]));
  const todayMs = new Date(today).getTime();
  const bankFreshness = cash.map((a) => {
    let last = null;
    for (const l of store.filter('lines', (x) => x.accountId === a.id)) {
      const d = txnDate.get(l.transactionId);
      if (d && (!last || d > last)) last = d;
    }
    const daysSince = last ? Math.floor((todayMs - new Date(last).getTime()) / 86400000) : null;
    return { accountId: a.id, code: a.code, name: a.name, lastDate: last, daysSince };
  });
  const worst = bankFreshness.reduce((m, b) => (b.daysSince != null && b.daysSince > m ? b.daysSince : m), 0);
  if (worst >= 7) actions.unshift({ text: `Bank data is ${worst} days out of date — import the latest statement`, view: 'import' });

  const tasks = store.filter('tasks', (t) => t.orgId === req.orgId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Last 6 months income vs expense trend.
  const trend = [];
  const base = new Date(today);
  for (let i = 5; i >= 0; i--) {
    const s = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const e = new Date(base.getFullYear(), base.getMonth() - i + 1, 0);
    const p = acct.profitAndLoss(req.orgId, s.toISOString().slice(0, 10), e.toISOString().slice(0, 10));
    trend.push({ label: s.toLocaleString('en-GB', { month: 'short' }), income: p.totalIncome, expense: p.totalExpense });
  }
  const openQueries = store.filter('queries', (q) => q.orgId === req.orgId && q.status === 'open').length;
  const checks = {
    unreconciled: unrec, draftInvoices: draftInv, draftBills: draftBill,
    overdueInvoices: overdueInv, overdueBills: overdueBill, openQueries,
    recurringDue: store.filter('recurring', (r) => r.orgId === req.orgId && r.active && r.nextDate <= today).length,
    vatOwed: vat.owed,
  };
  res.json({ netProfitYtd: plYear.netProfit, corporationTax: ct, vat, actions, tasks, bankFreshness, trend, checks });
});

// ===================== CATEGORISATION RULES =====================
app.get('/api/orgs/:orgId/rules', auth.requireAuth, auth.requireOrg, (req, res) => {
  const rules = store.filter('rules', (r) => r.orgId === req.orgId);
  const accById = new Map(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => [a.id, a]));
  res.json({ rules: rules.map((r) => ({ ...r, accountName: accById.get(r.accountId)?.name, accountCode: accById.get(r.accountId)?.code })) });
});
app.post('/api/orgs/:orgId/rules', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { match, accountId, taxRateId, kind } = req.body;
  if (!match || !match.trim()) return res.status(400).json({ error: 'Enter text to match (e.g. a supplier name).' });
  if (!store.find('accounts', (a) => a.id === accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Choose an account.' });
  const rule = store.insert('rules', { orgId: req.orgId, match: match.trim(), accountId, taxRateId: taxRateId || null, kind: kind || 'any' });
  res.json({ rule });
});
app.put('/api/orgs/:orgId/rules/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const rule = store.find('rules', (r) => r.id === req.params.id && r.orgId === req.orgId);
  if (!rule) return res.status(404).json({ error: 'Rule not found.' });
  const { match, accountId, taxRateId, kind } = req.body;
  if (!match || !match.trim()) return res.status(400).json({ error: 'Enter text to match.' });
  if (!store.find('accounts', (a) => a.id === accountId && a.orgId === req.orgId)) return res.status(400).json({ error: 'Choose an account.' });
  store.update('rules', rule.id, { match: match.trim(), accountId, taxRateId: taxRateId || null, kind: kind || 'any' });
  res.json({ rule: store.byId('rules', rule.id) });
});

app.delete('/api/orgs/:orgId/rules/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('rules', (r) => r.id === req.params.id && r.orgId === req.orgId);
  res.json({ ok: true });
});

// ===================== CLIENT TASKS (action list) =====================
app.post('/api/orgs/:orgId/tasks', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Task text required.' });
  const task = store.insert('tasks', { orgId: req.orgId, text: text.trim(), done: false, createdBy: req.user.id, createdAt: new Date().toISOString() });
  res.json({ task });
});
app.patch('/api/orgs/:orgId/tasks/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  const t = store.find('tasks', (x) => x.id === req.params.id && x.orgId === req.orgId);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  store.update('tasks', t.id, { done: !!req.body.done });
  res.json({ task: store.byId('tasks', t.id) });
});
app.delete('/api/orgs/:orgId/tasks/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('tasks', (x) => x.id === req.params.id && x.orgId === req.orgId);
  res.json({ ok: true });
});

// ===================== AI ASSISTANT (categorisation suggestions) =====================
app.get('/api/orgs/:orgId/ai/suggestions', auth.requireAuth, auth.requireOrg, (req, res) => {
  res.json({ suggestions: ai.suggestRules(req.orgId) });
});

// Approve a suggestion: create the rule, optionally recategorise matching manual/import txns.
app.post('/api/orgs/:orgId/ai/apply', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { match, accountId, taxRateId, kind, recategorize } = req.body;
  const acc = store.find('accounts', (a) => a.id === accountId && a.orgId === req.orgId);
  if (!match || !acc) return res.status(400).json({ error: 'Missing match or account.' });
  const rule = store.insert('rules', { orgId: req.orgId, match: String(match).trim(), accountId, taxRateId: taxRateId || null, kind: kind || 'any' });

  let recategorized = 0;
  if (recategorize) {
    const org = store.byId('organizations', req.orgId);
    const needle = String(match).toLowerCase();
    const txns = store.filter('transactions', (t) => t.orgId === req.orgId && t.status !== 'void'
      && (!t.source || t.source === 'manual' || t.source === 'import')
      && String(t.description).toLowerCase().includes(needle));
    for (const t of txns) {
      if (acct.isLocked(org, t.date)) continue;
      const lines = store.filter('lines', (l) => l.transactionId === t.id);
      const catLine = lines.find((l) => {
        const a = store.byId('accounts', l.accountId);
        return a && (a.type === 'income' || a.type === 'expense');
      });
      if (catLine && catLine.accountId !== accountId) {
        store.update('lines', catLine.id, { accountId });
        recategorized += 1;
      }
    }
  }
  store.audit({ orgId: req.orgId, user: req.user, action: 'ai-apply', entity: 'rule', entityId: rule.id, detail: `${match} → ${acc.code} (${recategorized} recategorised)` });
  res.json({ rule, recategorized });
});

app.post('/api/orgs/:orgId/ai/dismiss', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { match } = req.body;
  if (!match) return res.status(400).json({ error: 'Missing match.' });
  store.insert('aiDismissed', { orgId: req.orgId, match: String(match).trim() });
  res.json({ ok: true });
});

// ===================== BANK STATEMENT IMPORT =====================
// Body: { bankAccountId, rows: [{ date, description, amount, categoryAccountId }] }
// amount > 0 = money received (Dr bank / Cr category); amount < 0 = money paid (Dr category / Cr bank).
app.post('/api/orgs/:orgId/import-bank', auth.requireAuth, auth.requireOrg, (req, res) => {
  const { bankAccountId, rows } = req.body;
  const bank = store.find('accounts', (a) => a.id === bankAccountId && a.orgId === req.orgId);
  if (!bank) return res.status(400).json({ error: 'Choose the bank account to import into.' });
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows to import.' });
  const orgAccounts = new Set(store.filter('accounts', (a) => a.orgId === req.orgId).map((a) => a.id));
  const vatAcc = accountByCode(req.orgId, '2100');
  let imported = 0;
  const errors = [];
  rows.forEach((r, i) => {
    const amount = acct.round2(Number(r.amount));
    if (!r.date || !amount || !orgAccounts.has(r.categoryAccountId)) {
      errors.push(`Row ${i + 1}: needs a date, non-zero amount, and category.`);
      return;
    }
    const gross = Math.abs(amount);
    // Optional VAT: bank amounts are treated as VAT-inclusive (gross).
    let rate = 0;
    if (r.taxRateId) {
      const tr = store.find('taxRates', (t) => t.id === r.taxRateId && t.orgId === req.orgId);
      if (tr) rate = tr.rate;
    }
    let net = gross, tax = 0;
    if (rate > 0 && vatAcc) { net = acct.round2(gross / (1 + rate / 100)); tax = acct.round2(gross - net); }
    let lines;
    if (amount > 0) { // money in
      lines = [{ accountId: bank.id, debit: gross, credit: 0 }, { accountId: r.categoryAccountId, debit: 0, credit: net }];
      if (tax > 0) lines.push({ accountId: vatAcc.id, debit: 0, credit: tax });
    } else { // money out
      lines = [{ accountId: r.categoryAccountId, debit: net, credit: 0 }];
      if (tax > 0) lines.push({ accountId: vatAcc.id, debit: tax, credit: 0 });
      lines.push({ accountId: bank.id, debit: 0, credit: gross });
    }
    try {
      postJournal(req.orgId, req.user, { date: r.date, description: r.description || 'Imported transaction', reference: 'Bank import', lines, source: 'import' });
      imported += 1;
    } catch (e) { errors.push(`Row ${i + 1}: ${e.message}`); }
  });
  store.audit({ orgId: req.orgId, user: req.user, action: 'import', entity: 'bank', detail: `${imported} rows` });
  res.json({ imported, errors });
});

// ===================== PAYROLL =====================
app.get('/api/orgs/:orgId/employees', auth.requireAuth, auth.requireOrg, (req, res) => {
  const employees = store.filter('employees', (e) => e.orgId === req.orgId).map((e) => ({ ...e, period: payroll.calcPeriod(e) }));
  res.json({ employees });
});
app.post('/api/orgs/:orgId/employees', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can manage payroll.' });
  const { name, annualSalary, taxCode, niCategory, payFrequency, niNumber } = req.body;
  if (!name || !(Number(annualSalary) >= 0)) return res.status(400).json({ error: 'Name and salary are required.' });
  const e = store.insert('employees', {
    orgId: req.orgId, name, niNumber: niNumber || '', annualSalary: acct.round2(Number(annualSalary)),
    taxCode: taxCode || '1257L', niCategory: niCategory || 'A', payFrequency: payFrequency || 'monthly', active: true,
  });
  res.json({ employee: e });
});
app.delete('/api/orgs/:orgId/employees/:id', auth.requireAuth, auth.requireOrg, (req, res) => {
  store.remove('employees', (e) => e.id === req.params.id && e.orgId === req.orgId);
  res.json({ ok: true });
});

app.get('/api/orgs/:orgId/pay-runs', auth.requireAuth, auth.requireOrg, (req, res) => {
  const runs = store.filter('payRuns', (p) => p.orgId === req.orgId).sort((a, b) => (a.payDate < b.payDate ? 1 : -1));
  res.json({ payRuns: runs });
});

// Run payroll for a period: compute each active employee, post the journal, store the run.
app.post('/api/orgs/:orgId/pay-runs', auth.requireAuth, auth.requireOrg, (req, res) => {
  if (req.user.role !== 'bookkeeper') return res.status(403).json({ error: 'Only practice staff can run payroll.' });
  const { periodLabel, payDate } = req.body;
  if (!payDate) return res.status(400).json({ error: 'Pay date is required.' });
  const employees = store.filter('employees', (e) => e.orgId === req.orgId && e.active);
  if (!employees.length) return res.status(400).json({ error: 'Add employees first.' });
  const lines = employees.map((e) => ({ employeeId: e.id, name: e.name, ...payroll.calcPeriod(e) }));
  const totals = lines.reduce((t, l) => ({
    gross: acct.round2(t.gross + l.gross), tax: acct.round2(t.tax + l.tax),
    employeeNI: acct.round2(t.employeeNI + l.employeeNI), employerNI: acct.round2(t.employerNI + l.employerNI),
    net: acct.round2(t.net + l.net),
  }), { gross: 0, tax: 0, employeeNI: 0, employerNI: 0, net: 0 });

  // Journal: Dr Wages (gross + employer NI), Cr Bank (net), Cr PAYE/NI payable (tax + both NIs)
  const wages = accountByCode(req.orgId, '6100'), bank = accountByCode(req.orgId, '1000'), paye = accountByCode(req.orgId, '2300');
  let txnId = null;
  if (wages && bank && paye) {
    const liability = acct.round2(totals.tax + totals.employeeNI + totals.employerNI);
    try {
      const txn = postJournal(req.orgId, req.user, {
        date: payDate, description: `Payroll — ${periodLabel || payDate}`, reference: 'PAYRUN',
        lines: [
          { accountId: wages.id, debit: acct.round2(totals.gross + totals.employerNI), credit: 0 },
          { accountId: bank.id, debit: 0, credit: totals.net },
          { accountId: paye.id, debit: 0, credit: liability },
        ], source: 'payroll',
      });
      txnId = txn.id;
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const run = store.insert('payRuns', { orgId: req.orgId, periodLabel: periodLabel || payDate, payDate, lines, totals, status: 'posted', transactionId: txnId, submittedAt: null });
  store.audit({ orgId: req.orgId, user: req.user, action: 'payrun', entity: 'payroll', entityId: run.id, detail: `${lines.length} staff · net ${totals.net}` });
  res.json({ payRun: run });
});

// Mock RTI / FPS submission to HMRC.
app.post('/api/orgs/:orgId/pay-runs/:id/submit', auth.requireAuth, auth.requireOrg, (req, res) => {
  const run = store.find('payRuns', (p) => p.id === req.params.id && p.orgId === req.orgId);
  if (!run) return res.status(404).json({ error: 'Pay run not found.' });
  store.update('payRuns', run.id, { submittedAt: new Date().toISOString(), fpsRef: 'FPS-' + Math.random().toString(36).slice(2, 8).toUpperCase() });
  store.audit({ orgId: req.orgId, user: req.user, action: 'fps-submit', entity: 'payroll', entityId: run.id, detail: run.periodLabel });
  res.json({ payRun: store.byId('payRuns', run.id) });
});

// ===================== STANDARD CHART SEED =====================
function seedChart(orgId) {
  const defaults = [
    ['1000', 'Business Bank Account', 'asset'],
    ['1100', 'Accounts Receivable', 'asset'],
    ['1200', 'Inventory', 'asset'],
    ['1400', 'Office Equipment', 'asset'],
    ['1500', 'Accumulated Depreciation', 'asset'],
    ['2000', 'Accounts Payable', 'liability'],
    ['2100', 'VAT / Sales Tax Payable', 'liability'],
    ['2200', 'Loans Payable', 'liability'],
    ['2300', 'PAYE / NI Payable', 'liability'],
    ['3000', "Owner's Capital", 'equity'],
    ['3100', 'Retained Earnings', 'equity'],
    ['3300', 'Opening Balances Suspense', 'equity'],
    ['4000', 'Sales Revenue', 'income'],
    ['4100', 'Other Income', 'income'],
    ['5000', 'Cost of Goods Sold', 'expense'],
    ['6000', 'Rent', 'expense'],
    ['6100', 'Wages & Salaries', 'expense'],
    ['6200', 'Utilities', 'expense'],
    ['6300', 'Office Supplies', 'expense'],
    ['6400', 'Bank Fees', 'expense'],
    ['6500', 'Marketing', 'expense'],
    ['6600', 'Insurance', 'expense'],
    ['6700', 'Software & Subscriptions', 'expense'],
    ['6800', 'Professional Fees', 'expense'],
    ['6900', 'Cleaning', 'expense'],
    ['7000', 'Depreciation', 'expense'],
  ];
  for (const [code, name, type] of defaults) {
    store.insert('accounts', { orgId, code, name, type, archived: false });
  }
}

function seedTaxRates(orgId) {
  const rates = [
    ['Standard 20%', 20], ['Reduced 5%', 5], ['Zero-rated 0%', 0], ['No VAT', 0],
  ];
  for (const [name, rate] of rates) store.insert('taxRates', { orgId, name, rate, archived: false });
}

// Health check for hosting platforms (public, no auth).
app.get('/healthz', (req, res) => {
  res.json({ ok: true, backend: store.isPg() ? 'postgres' : 'json', uptime: Math.round(process.uptime()) });
});

// ===================== STATIC FRONTEND =====================
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  (async () => {
    if (PROD && !process.env.SESSION_SECRET) console.warn('  WARNING: SESSION_SECRET is not set — using an insecure default. Set it before going live.');
    const info = await store.init();
    if (info.backend === 'postgres') console.log(`  Data: PostgreSQL — ${info.rows} rows loaded`);
    else console.log('  Data: local JSON file (set DATABASE_URL to use Postgres)');

    const server = app.listen(PORT, () => {
      console.log(`\n  Lumi Bookkeeping running →  http://localhost:${PORT}\n`);
    });

    // On shutdown, flush any pending Postgres writes before exiting.
    const shutdown = async (sig) => {
      console.log(`\n  ${sig} — flushing pending writes…`);
      try { await store.flush(); } catch (e) {}
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })().catch((err) => {
    console.error('Failed to start Lumi Bookkeeping:', err);
    process.exit(1);
  });
}

module.exports = { app, seedChart, seedTaxRates };
