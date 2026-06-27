// Lumi Bookkeeping Lite — plain-English bookkeeping for sole traders.
// VAT returns + Making Tax Digital for Income Tax. Cash basis by default.
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const store = require('./lib/store');
const auth = require('./lib/auth');
const tax = require('./lib/tax');
const hmrc = require('./lib/hmrc');

const app = express();
app.use(express.json({ limit: '14mb' }));
const ATT_DIR = path.join(store.DATA_DIR, 'attachments');
app.use(express.static(path.join(__dirname, 'public')));

const round2 = tax.round2;
const todayISO = () => new Date().toISOString().slice(0, 10);

// Plain-English categories (mapped loosely to HMRC SA103 self-employment boxes).
const CATEGORIES = {
  income: [
    { key: 'sales', label: 'Sales / takings' },
    { key: 'other_income', label: 'Other business income' },
  ],
  expense: [
    { key: 'stock', label: 'Stock & materials' },
    { key: 'wages', label: 'Wages & subcontractors' },
    { key: 'travel', label: 'Vehicle & travel' },
    { key: 'premises', label: 'Premises (rent, rates, power)' },
    { key: 'repairs', label: 'Repairs & maintenance' },
    { key: 'office', label: 'Office, phone & admin' },
    { key: 'advertising', label: 'Advertising & marketing' },
    { key: 'professional', label: 'Accountancy & legal' },
    { key: 'finance', label: 'Bank & finance charges' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'training', label: 'Training' },
    { key: 'other_expense', label: 'Other allowable expense' },
    { key: 'disallowable', label: 'Personal / drawings (not a business cost)', allowable: false },
  ],
};
const ALLOWABLE_OUT = new Set(CATEGORIES.expense.filter((c) => c.allowable !== false).map((c) => c.key));
const catLabel = (key) => {
  for (const k of ['income', 'expense']) { const c = CATEGORIES[k].find((x) => x.key === key); if (c) return c.label; }
  return key;
};

// ---- helpers ----
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; }
// A date is locked if it falls within a VAT or Income Tax period already filed.
function periodLocked(businessId, dateStr) {
  if (!dateStr) return false;
  for (const v of store.filter('vatReturns', (x) => x.businessId === businessId && x.status === 'submitted')) if (dateStr >= v.from && dateStr <= v.to) return true;
  for (const m of store.filter('mtdUpdates', (x) => x.businessId === businessId && x.status === 'submitted')) if (m.from && m.to && dateStr >= m.from && dateStr <= m.to) return true;
  return false;
}
// Record an action in the audit trail.
function audit(req, action, detail) {
  try { store.insert('auditLog', { businessId: req.businessId, userId: req.user ? req.user.id : null, userName: req.user ? req.user.name : 'system', action, detail: detail || '', at: new Date().toISOString() }); } catch (e) {}
}
function businessesFor(user) {
  const ms = store.filter('memberships', (m) => m.userId === user.id);
  return ms.map((m) => { const b = store.byId('businesses', m.businessId); return b ? { ...b, myRole: m.role } : null; }).filter(Boolean);
}
function entriesIn(businessId, from, to) {
  return store.filter('entries', (e) => e.businessId === businessId && (!from || e.date >= from) && (!to || e.date <= to));
}
function splitGross(gross, vatRate, vatRegistered) {
  gross = round2(gross);
  if (!vatRegistered || !vatRate) return { net: gross, vat: 0, gross };
  const net = round2(gross / (1 + vatRate / 100));
  return { net, vat: round2(gross - net), gross };
}
// Detach a money-in entry from its invoice, restoring the description the user
// originally gave it (if any).
function unlinkEntry(entryId) {
  const e = store.byId('entries', entryId); if (!e) return;
  store.update('entries', entryId, { invoiceId: null, invoiceNumber: null, customerName: null, description: e.originalDescription != null ? e.originalDescription : e.description, originalDescription: null });
}

// ===================== AUTH =====================
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Enter your name, email and a password of at least 6 characters.' });
  if (store.find('users', (u) => u.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ error: 'An account with that email already exists.' });
  const user = store.insert('users', { name, email, passwordHash: bcrypt.hashSync(password, 10), role: 'trader' });
  const token = auth.newSession(user.id);
  res.setHeader('Set-Cookie', `lumi_lite=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ user: publicUser(user) });
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = store.find('users', (u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const token = auth.newSession(user.id);
  res.setHeader('Set-Cookie', `lumi_lite=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ user: publicUser(user) });
});
app.post('/api/logout', auth.requireAuth, (req, res) => { auth.endSession(req.token); res.setHeader('Set-Cookie', 'lumi_lite=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', auth.requireAuth, (req, res) => { res.json({ user: publicUser(req.user), businesses: businessesFor(req.user) }); });

// ===================== BUSINESS / ONBOARDING =====================
app.post('/api/businesses', auth.requireAuth, (req, res) => {
  const { name, ownerName, tradeType, basis, vatRegistered, vatNumber, vatScheme, utr } = req.body;
  if (!name) return res.status(400).json({ error: 'What do you call your business?' });
  const biz = store.insert('businesses', {
    name, ownerName: ownerName || req.user.name, tradeType: tradeType || '',
    basis: basis === 'accruals' ? 'accruals' : 'cash',
    vatRegistered: !!vatRegistered, vatNumber: vatNumber || '', vatScheme: vatScheme || 'standard',
    utr: utr || '', createdAt: new Date().toISOString(),
  });
  store.insert('memberships', { userId: req.user.id, businessId: biz.id, role: 'owner' });
  res.json({ business: biz });
});
app.get('/api/businesses/:businessId', auth.requireAuth, auth.requireBusiness, (req, res) => {
  res.json({ business: store.byId('businesses', req.businessId), categories: CATEGORIES });
});
app.put('/api/businesses/:businessId', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const patch = {};
  for (const f of ['name', 'ownerName', 'tradeType', 'vatNumber', 'utr', 'nino']) if (req.body[f] != null) patch[f] = String(req.body[f]);
  if (req.body.basis) patch.basis = req.body.basis === 'accruals' ? 'accruals' : 'cash';
  if (req.body.vatRegistered != null) patch.vatRegistered = !!req.body.vatRegistered;
  if (req.body.vatScheme) patch.vatScheme = req.body.vatScheme;
  store.update('businesses', req.businessId, patch);
  audit(req, 'settings.update', 'Updated business settings');
  res.json({ business: store.byId('businesses', req.businessId) });
});

// ===================== ENTRIES (money in / money out) =====================
app.get('/api/businesses/:businessId/entries', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const { from, to, direction } = req.query;
  let list = entriesIn(req.businessId, from, to);
  if (direction) list = list.filter((e) => e.direction === direction);
  list = list.map((e) => ({ ...e, categoryLabel: catLabel(e.category), locked: periodLocked(req.businessId, e.date) })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  res.json({ entries: list });
});
app.post('/api/businesses/:businessId/entries', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  const { date, direction, category, description, gross, vatRate, method } = req.body;
  if (!date || !['in', 'out'].includes(direction) || !(Number(gross) > 0)) return res.status(400).json({ error: 'Enter a date, whether it is money in or out, and an amount.' });
  if (periodLocked(req.businessId, date)) return res.status(400).json({ error: 'That date falls in a period you have already filed to HMRC, so it is locked. Choose a later date.' });
  const { net, vat } = splitGross(Number(gross), Number(vatRate) || 0, biz.vatRegistered);
  const entry = store.insert('entries', {
    businessId: req.businessId, date, direction, category: category || (direction === 'in' ? 'sales' : 'other_expense'),
    description: description || '', gross: round2(gross), vatRate: biz.vatRegistered ? (Number(vatRate) || 0) : 0, net, vat,
    method: method || 'bank', attachmentId: null, createdAt: new Date().toISOString(),
  });
  audit(req, 'entry.create', `${direction === 'in' ? 'Money in' : 'Money out'} ${gross} on ${date}${description ? ' — ' + description : ''}`);
  res.json({ entry });
});
app.put('/api/businesses/:businessId/entries/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const e = store.byId('entries', req.params.id); if (!e || e.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  if (periodLocked(req.businessId, e.date) || (req.body.date && periodLocked(req.businessId, req.body.date))) return res.status(400).json({ error: 'This entry is in a filed period, so it is locked and cannot be changed.' });
  const biz = store.byId('businesses', req.businessId);
  const patch = {};
  for (const f of ['date', 'category', 'description', 'method', 'direction']) if (req.body[f] != null) patch[f] = req.body[f];
  if (req.body.gross != null || req.body.vatRate != null) {
    const gross = req.body.gross != null ? Number(req.body.gross) : e.gross;
    const rate = req.body.vatRate != null ? Number(req.body.vatRate) : e.vatRate;
    const s = splitGross(gross, rate, biz.vatRegistered); patch.gross = s.gross; patch.net = s.net; patch.vat = s.vat; patch.vatRate = biz.vatRegistered ? rate : 0;
  }
  store.update('entries', e.id, patch);
  audit(req, 'entry.edit', `Edited entry on ${e.date}`);
  res.json({ entry: store.byId('entries', e.id) });
});
app.delete('/api/businesses/:businessId/entries/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const e = store.byId('entries', req.params.id);
  if (e && e.businessId === req.businessId && periodLocked(req.businessId, e.date)) return res.status(400).json({ error: 'This entry is in a filed period, so it is locked and cannot be deleted.' });
  if (e && e.businessId === req.businessId) {
    audit(req, 'entry.delete', `Deleted ${e.direction === 'in' ? 'money in' : 'money out'} ${e.gross} on ${e.date}`);
    // If this money-in was matched to an invoice, put the invoice back to 'awaiting payment'.
    if (e.invoiceId) { const inv = store.byId('invoices', e.invoiceId); if (inv) store.update('invoices', inv.id, { status: 'sent', paidDate: null, entryId: null, autoEntry: false }); }
    if (e.mileageId) store.remove('mileage', (m) => m.id === e.mileageId);
  }
  store.remove('entries', (x) => x.id === req.params.id && x.businessId === req.businessId); res.json({ ok: true });
});

// ---- Receipts (attach a photo/PDF to an entry) ----
function ensureAttDir() { if (!fs.existsSync(ATT_DIR)) fs.mkdirSync(ATT_DIR, { recursive: true }); }
const ALLOWED_RECEIPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'application/pdf'];
app.post('/api/businesses/:businessId/entries/:id/receipt', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const e = store.byId('entries', req.params.id); if (!e || e.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  const m = /^data:([^;]+);base64,(.+)$/.exec(req.body.dataUrl || '');
  if (!m) return res.status(400).json({ error: 'No file received.' });
  const mimetype = m[1].toLowerCase(); const buf = Buffer.from(m[2], 'base64');
  if (!ALLOWED_RECEIPT.includes(mimetype)) return res.status(400).json({ error: 'Please upload an image (JPG/PNG) or a PDF.' });
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'That file is too big (max 10MB).' });
  ensureAttDir();
  const ext = mimetype === 'application/pdf' ? 'pdf' : (mimetype.split('/')[1] || 'bin');
  const att = store.insert('attachments', { businessId: req.businessId, entryId: e.id, originalName: String(req.body.originalName || 'receipt').slice(0, 120), mimetype, size: buf.length, uploadedAt: new Date().toISOString() });
  fs.writeFileSync(path.join(ATT_DIR, att.id + '.' + ext), buf);
  store.update('attachments', att.id, { filename: att.id + '.' + ext });
  if (e.attachmentId && e.attachmentId !== att.id) { const old = store.byId('attachments', e.attachmentId); if (old) { try { fs.unlinkSync(path.join(ATT_DIR, old.filename)); } catch (x) {} store.remove('attachments', (a) => a.id === old.id); } }
  store.update('entries', e.id, { attachmentId: att.id });
  audit(req, 'receipt.add', `Attached "${att.originalName}" to entry on ${e.date}`);
  res.json({ attachment: store.byId('attachments', att.id) });
});
app.get('/api/businesses/:businessId/attachments/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const a = store.byId('attachments', req.params.id); if (!a || a.businessId !== req.businessId) return res.status(404).send('Not found');
  const fp = path.join(ATT_DIR, a.filename || ''); if (!a.filename || !fs.existsSync(fp)) return res.status(404).send('File missing');
  res.setHeader('Content-Type', a.mimetype); res.setHeader('Content-Disposition', `inline; filename="${a.originalName.replace(/[^\w.\- ]/g, '_')}"`);
  fs.createReadStream(fp).pipe(res);
});
app.delete('/api/businesses/:businessId/entries/:id/receipt', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const e = store.byId('entries', req.params.id); if (!e || e.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  if (e.attachmentId) { const a = store.byId('attachments', e.attachmentId); if (a) { try { fs.unlinkSync(path.join(ATT_DIR, a.filename)); } catch (x) {} store.remove('attachments', (x) => x.id === a.id); } store.update('entries', e.id, { attachmentId: null }); }
  res.json({ ok: true });
});

// ===================== IMPORT (from Xero / QuickBooks / Sage CSV) =====================
app.post('/api/businesses/:businessId/import/entries', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  const rows = Array.isArray(req.body.entries) ? req.body.entries : [];
  if (!rows.length) return res.status(400).json({ error: 'Nothing to import.' });
  let added = 0, skipped = 0;
  for (const e of rows) {
    const gross = Number(e.gross);
    if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !['in', 'out'].includes(e.direction) || !(gross > 0)) { skipped++; continue; }
    const { net, vat } = splitGross(gross, Number(e.vatRate) || 0, biz.vatRegistered);
    store.insert('entries', {
      businessId: req.businessId, date: e.date, direction: e.direction,
      category: e.category || (e.direction === 'in' ? 'sales' : 'other_expense'),
      description: String(e.description || '').slice(0, 200), gross: round2(gross),
      vatRate: biz.vatRegistered ? (Number(e.vatRate) || 0) : 0, net, vat,
      method: 'import', attachmentId: null, createdAt: new Date().toISOString(),
    });
    added++;
  }
  if (added) audit(req, 'import', `Imported ${added} entries from a CSV${skipped ? ` (skipped ${skipped})` : ''}`);
  res.json({ added, skipped });
});
app.get('/api/businesses/:businessId/audit', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const log = store.filter('auditLog', (a) => a.businessId === req.businessId).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200);
  res.json({ log });
});

// ===================== MILEAGE =====================
// 55p per mile for the first 10,000 business miles in a tax year, then 25p after
// (the 10,000 threshold is cumulative across the year). Motorcycles use a flat 24p.
const MILEAGE = { first: 0.55, after: 0.25, threshold: 10000, motorcycle: 0.24 };

// Recompute every trip's claim for each tax year in date order, so the 10,000-mile
// tier is applied correctly however trips are added, edited or deleted. Keeps each
// trip's linked travel expense in step.
function recomputeMileage(businessId) {
  const allTrips = store.filter('mileage', (m) => m.businessId === businessId);
  const byYear = {};
  for (const m of allTrips) { const ty = tax.taxYearOf(m.date); (byYear[ty] = byYear[ty] || []).push(m); }
  for (const ty of Object.keys(byYear)) {
    const list = byYear[ty].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let cumulative = 0;
    for (const m of list) {
      const miles = Number(m.miles) || 0;
      let amount, rate;
      if (m.vehicle === 'motorcycle') { rate = MILEAGE.motorcycle; amount = round2(miles * rate); }
      else {
        const atFirst = Math.max(0, MILEAGE.threshold - cumulative);
        const hi = Math.min(miles, atFirst), lo = miles - hi;
        amount = round2(hi * MILEAGE.first + lo * MILEAGE.after);
        rate = miles ? round2(amount / miles) : MILEAGE.first;
        cumulative += miles;
      }
      store.update('mileage', m.id, { amount, rate });
      const e = store.find('entries', (x) => x.mileageId === m.id);
      const route = m.from && m.to ? `${m.from} → ${m.to}` : (m.purpose || '');
      const desc = `Mileage — ${miles} miles${route ? ' (' + route + ')' : ''}`;
      if (e) store.update('entries', e.id, { gross: amount, net: amount, vat: 0, date: m.date, description: desc });
    }
  }
}

app.get('/api/businesses/:businessId/mileage', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const list = store.filter('mileage', (m) => m.businessId === req.businessId).sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json({ mileage: list, rates: MILEAGE });
});
app.post('/api/businesses/:businessId/mileage', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const { date, miles, vehicle, purpose, from, to } = req.body;
  if (!date || !(Number(miles) > 0)) return res.status(400).json({ error: 'Enter the date and how many miles.' });
  if (periodLocked(req.businessId, date)) return res.status(400).json({ error: 'That date is in a period you have already filed to HMRC, so it is locked.' });
  const row = store.insert('mileage', { businessId: req.businessId, date, miles: round2(miles), vehicle: vehicle || 'car', purpose: purpose || '', from: from || '', to: to || '', rate: MILEAGE.first, amount: 0 });
  store.insert('entries', { businessId: req.businessId, date, direction: 'out', category: 'travel', description: `Mileage — ${row.miles} miles`, gross: 0, vatRate: 0, net: 0, vat: 0, method: 'mileage', attachmentId: null, createdAt: new Date().toISOString(), mileageId: row.id });
  recomputeMileage(req.businessId);
  res.json({ mileage: store.byId('mileage', row.id) });
});
app.put('/api/businesses/:businessId/mileage/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const m = store.byId('mileage', req.params.id); if (!m || m.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  const patch = {};
  if (req.body.date) patch.date = req.body.date;
  if (req.body.miles != null) { if (!(Number(req.body.miles) > 0)) return res.status(400).json({ error: 'Enter how many miles.' }); patch.miles = round2(req.body.miles); }
  if (req.body.vehicle) patch.vehicle = req.body.vehicle;
  if (req.body.purpose != null) patch.purpose = String(req.body.purpose);
  if (req.body.from != null) patch.from = String(req.body.from);
  if (req.body.to != null) patch.to = String(req.body.to);
  store.update('mileage', m.id, patch);
  recomputeMileage(req.businessId);
  res.json({ mileage: store.byId('mileage', m.id) });
});
app.delete('/api/businesses/:businessId/mileage/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  store.remove('entries', (e) => e.mileageId === req.params.id && e.businessId === req.businessId);
  store.remove('mileage', (m) => m.id === req.params.id && m.businessId === req.businessId);
  recomputeMileage(req.businessId);
  res.json({ ok: true });
});

// ===================== INVOICES (simple) =====================
app.get('/api/businesses/:businessId/invoices', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const list = store.filter('invoices', (i) => i.businessId === req.businessId).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  res.json({ invoices: list });
});
app.post('/api/businesses/:businessId/invoices', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  const { customerName, customerEmail, issueDate, dueDate, lines } = req.body;
  if (!customerName || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Add a customer and at least one line.' });
  let net = 0, vat = 0;
  const calcLines = lines.map((l) => {
    const amount = round2(l.amount); const rate = biz.vatRegistered ? (Number(l.vatRate) || 0) : 0; const lv = round2(amount * rate / 100);
    net += amount; vat += lv; return { description: l.description || '', amount, vatRate: rate, vat: lv };
  });
  const count = store.filter('invoices', (i) => i.businessId === req.businessId).length + 1;
  const inv = store.insert('invoices', {
    businessId: req.businessId, number: 'INV-' + String(count).padStart(3, '0'), customerName, customerEmail: customerEmail || '',
    issueDate: issueDate || todayISO(), dueDate: dueDate || todayISO(), lines: calcLines, net: round2(net), vat: round2(vat), total: round2(net + vat), status: 'draft',
  });
  res.json({ invoice: inv });
});
// Edit an invoice's details (only while it isn't marked paid).
app.put('/api/businesses/:businessId/invoices/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const inv = store.byId('invoices', req.params.id); if (!inv || inv.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  if (inv.status === 'paid') return res.status(400).json({ error: 'Mark this invoice as unpaid before editing it.' });
  const biz = store.byId('businesses', req.businessId);
  const { customerName, customerEmail, issueDate, dueDate, lines } = req.body;
  if (!customerName || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Add a customer and at least one line.' });
  let net = 0, vat = 0;
  const calcLines = lines.map((l) => { const amount = round2(l.amount); const rate = biz.vatRegistered ? (Number(l.vatRate) || 0) : 0; const lv = round2(amount * rate / 100); net += amount; vat += lv; return { description: l.description || '', amount, vatRate: rate, vat: lv }; });
  store.update('invoices', inv.id, { customerName, customerEmail: customerEmail || '', issueDate: issueDate || inv.issueDate, dueDate: dueDate || inv.dueDate, lines: calcLines, net: round2(net), vat: round2(vat), total: round2(net + vat) });
  res.json({ invoice: store.byId('invoices', inv.id) });
});
// Change status. Going to 'paid' records the money in (if not already matched). Going
// back to draft/sent detaches the payment — deleting an auto-created one, or unlinking
// a real cash-in entry it was reconciled against.
app.post('/api/businesses/:businessId/invoices/:id/status', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const inv = store.byId('invoices', req.params.id); if (!inv || inv.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  const status = req.body.status;
  if (!['draft', 'sent', 'paid'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (status === 'paid') {
    const patch = { status: 'paid', paidDate: req.body.date || todayISO() };
    if (!inv.entryId) {
      const e = store.insert('entries', { businessId: req.businessId, date: req.body.date || todayISO(), direction: 'in', category: 'sales', description: `Invoice ${inv.number} — ${inv.customerName}`, gross: inv.total, vatRate: inv.vat ? round2(inv.vat / inv.net * 100) : 0, net: inv.net, vat: inv.vat, method: 'invoice', attachmentId: null, createdAt: new Date().toISOString(), invoiceId: inv.id, invoiceNumber: inv.number, customerName: inv.customerName });
      patch.entryId = e.id; patch.autoEntry = true;
    }
    store.update('invoices', inv.id, patch);
  } else {
    if (inv.entryId) {
      if (inv.autoEntry) store.remove('entries', (e) => e.id === inv.entryId);
      else unlinkEntry(inv.entryId);
    }
    store.update('invoices', inv.id, { status, paidDate: null, entryId: null, autoEntry: false });
  }
  audit(req, 'invoice.status', `Invoice ${inv.number} marked ${status}`);
  res.json({ invoice: store.byId('invoices', inv.id) });
});
// Reconcile an invoice against an existing money-in entry (no new entry created).
app.post('/api/businesses/:businessId/invoices/:id/reconcile', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const inv = store.byId('invoices', req.params.id); if (!inv || inv.businessId !== req.businessId) return res.status(404).json({ error: 'Not found.' });
  const e = store.byId('entries', req.body.entryId);
  if (!e || e.businessId !== req.businessId || e.direction !== 'in') return res.status(400).json({ error: 'Choose a money-in entry to match.' });
  if (e.invoiceId && e.invoiceId !== inv.id) return res.status(400).json({ error: 'That payment is already matched to another invoice.' });
  // Drop any payment already linked to this invoice (auto-created one removed, real one unlinked).
  if (inv.entryId && inv.entryId !== e.id) { if (inv.autoEntry) store.remove('entries', (x) => x.id === inv.entryId); else unlinkEntry(inv.entryId); }
  // Stamp the entry with the invoice + customer so it's clear what it relates to (keep the original wording to restore later).
  store.update('entries', e.id, { invoiceId: inv.id, invoiceNumber: inv.number, customerName: inv.customerName, originalDescription: e.originalDescription != null ? e.originalDescription : e.description, description: `Invoice ${inv.number} — ${inv.customerName}` });
  store.update('invoices', inv.id, { status: 'paid', paidDate: e.date, entryId: e.id, autoEntry: false });
  res.json({ invoice: store.byId('invoices', inv.id), entry: store.byId('entries', e.id) });
});
app.delete('/api/businesses/:businessId/invoices/:id', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const inv = store.byId('invoices', req.params.id);
  if (inv && inv.entryId) { if (inv.autoEntry) store.remove('entries', (e) => e.id === inv.entryId); else unlinkEntry(inv.entryId); }
  store.remove('invoices', (i) => i.id === req.params.id && i.businessId === req.businessId); res.json({ ok: true });
});

// ===================== DASHBOARD (plain-English summary) =====================
app.get('/api/businesses/:businessId/summary', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  const tyStart = tax.taxYearOf(todayISO());
  const from = `${tyStart}-04-06`, to = `${tyStart + 1}-04-05`;
  const yr = entriesIn(req.businessId, from, to);
  let moneyIn = 0, moneyOut = 0, allowableOut = 0;
  for (const e of yr) {
    if (e.direction === 'in') moneyIn += e.net; // net of VAT for profit
    else { moneyOut += e.net; if (ALLOWABLE_OUT.has(e.category)) allowableOut += e.net; }
  }
  const profit = round2(moneyIn - allowableOut);
  const est = tax.estimate(profit);
  // VAT position so far this VAT period (rolling current quarter from registration — simplified to calendar quarter)
  let vat = null;
  if (biz.vatRegistered) {
    const d = new Date(todayISO()); const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    const qf = new Date(d.getFullYear(), qStartMonth, 1).toISOString().slice(0, 10);
    const boxes = tax.vatBoxes(entriesIn(req.businessId, qf, todayISO()));
    vat = { from: qf, to: todayISO(), due: boxes.box5 };
  }
  // turnover vs MTD / VAT thresholds (rolling 12 months gross sales)
  const since12 = new Date(); since12.setMonth(since12.getMonth() - 12);
  const rolling = entriesIn(req.businessId, since12.toISOString().slice(0, 10), todayISO()).filter((e) => e.direction === 'in').reduce((s, e) => s + e.gross, 0);
  // Outstanding invoices (sent but not paid)
  const sentInv = store.filter('invoices', (i) => i.businessId === req.businessId && i.status === 'sent');
  const outstanding = round2(sentInv.reduce((s, i) => s + i.total, 0));
  const overdue = round2(sentInv.filter((i) => i.dueDate < todayISO()).reduce((s, i) => s + i.total, 0));
  // How many payments could be reconciled right now (exact-amount, one-to-one).
  const allEnt = store.filter('entries', (e) => e.businessId === req.businessId);
  const unmatchedIn = allEnt.filter((e) => e.direction === 'in' && !e.invoiceId);
  let reconcileReady = 0; const usedE = new Set();
  for (const inv of sentInv) { const m = unmatchedIn.find((e) => !usedE.has(e.id) && Math.abs(e.gross - inv.total) < 0.01); if (m) { usedE.add(m.id); reconcileReady++; } }
  // Upcoming filing deadlines (VAT quarterly + Income Tax quarterly updates + final declaration).
  const DAYms = 86400000, nowD = new Date(todayISO()), tyNow = tax.taxYearOf(todayISO());
  const deadlines = [];
  for (const ty of [tyNow - 1, tyNow, tyNow + 1]) {
    tax.mtdQuarters(ty).forEach((q) => deadlines.push({ type: 'Income Tax update', label: `Q${q.quarter} ${tax.taxYearLabel(ty)}`, date: q.deadline }));
    deadlines.push({ type: 'Income Tax final declaration', label: tax.taxYearLabel(ty), date: `${ty + 2}-01-31` });
  }
  if (biz.vatRegistered) {
    for (let i = -1; i <= 3; i++) {
      const base = new Date(nowD.getFullYear(), Math.floor(nowD.getMonth() / 3) * 3 + i * 3, 1);
      const end = new Date(base.getFullYear(), base.getMonth() + 3, 0);
      const due = new Date(end.getFullYear(), end.getMonth() + 1, 7);
      deadlines.push({ type: 'VAT return', label: `quarter to ${end.toISOString().slice(0, 10)}`, date: due.toISOString().slice(0, 10) });
    }
  }
  const fromCut = new Date(nowD.getTime() - 14 * DAYms).toISOString().slice(0, 10);
  const toCut = new Date(nowD.getTime() + 200 * DAYms).toISOString().slice(0, 10);
  const upcoming = deadlines.filter((d) => d.date >= fromCut && d.date <= toCut).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 4)
    .map((d) => ({ ...d, daysAway: Math.round((new Date(d.date) - nowD) / DAYms) }));
  res.json({
    outstandingInvoices: outstanding, outstandingCount: sentInv.length, overdueInvoices: overdue,
    reconcileReady, unmatchedIncomeCount: unmatchedIn.length, deadlines: upcoming,
    taxYear: tax.taxYearLabel(tyStart), from, to, basis: biz.basis,
    moneyIn: round2(moneyIn), moneyOut: round2(allowableOut), profit, estimate: est,
    vat, vatRegistered: biz.vatRegistered, rolling12mSales: round2(rolling),
    vatThreshold: tax.TAX.vatRegistrationThreshold, mtdThreshold: tax.TAX.mtdItsaThreshold,
    entryCount: yr.length,
  });
});

// ===================== VAT RETURN =====================
app.get('/api/businesses/:businessId/vat/periods', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  if (!biz.vatRegistered) return res.json({ vatRegistered: false, periods: [] });
  // Build the last 4 + current calendar quarters.
  const periods = []; const now = new Date();
  for (let i = 4; i >= 0; i--) {
    const base = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - i * 3, 1);
    const from = base.toISOString().slice(0, 10);
    const end = new Date(base.getFullYear(), base.getMonth() + 3, 0).toISOString().slice(0, 10);
    const filed = store.find('vatReturns', (v) => v.businessId === req.businessId && v.from === from);
    const dueDate = new Date(base.getFullYear(), base.getMonth() + 4, 7).toISOString().slice(0, 10);
    const ended = todayISO() > end;
    const boxes = tax.vatBoxes(entriesIn(req.businessId, from, end));
    periods.push({ from, to: end, label: `${from} to ${end}`, ended, dueDate, boxes, status: filed ? 'submitted' : ended ? 'ready' : 'open', reference: filed ? filed.reference : null });
  }
  res.json({ vatRegistered: true, scheme: biz.vatScheme, periods: periods.reverse() });
});
app.post('/api/businesses/:businessId/vat/submit', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Choose a period.' });
  if (todayISO() <= to) return res.status(400).json({ error: 'This VAT period has not finished yet.' });
  if (store.find('vatReturns', (v) => v.businessId === req.businessId && v.from === from)) return res.status(400).json({ error: 'This period has already been filed.' });
  const boxes = tax.vatBoxes(entriesIn(req.businessId, from, to));
  const reference = 'LUMI-VAT-' + Date.now().toString(36).toUpperCase();
  const v = store.insert('vatReturns', { businessId: req.businessId, from, to, boxes, status: 'submitted', submittedAt: new Date().toISOString(), reference, liability: Math.abs(boxes.box5) });
  audit(req, 'vat.submit', `Filed VAT return ${from} → ${to} (net due ${Math.abs(boxes.box5)})`);
  // NOTE: real HMRC MTD VAT submission needs an HMRC-recognised connection (a hosting step).
  res.json({ vatReturn: v, note: 'Recorded as filed in Lumi. Sending to HMRC needs an HMRC-recognised connection, which is set up when the app is hosted.' });
});

// ===================== MAKING TAX DIGITAL FOR INCOME TAX =====================
app.get('/api/businesses/:businessId/mtd', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const biz = store.byId('businesses', req.businessId);
  const tyStart = req.query.year ? Number(req.query.year) : tax.taxYearOf(todayISO());
  const quarters = tax.mtdQuarters(tyStart).map((q) => {
    const ents = entriesIn(req.businessId, q.from, q.to);
    const income = {}, expenses = {};
    let incomeTotal = 0, expenseTotal = 0;
    for (const e of ents) {
      if (e.direction === 'in') { income[e.category] = round2((income[e.category] || 0) + e.net); incomeTotal += e.net; }
      else if (ALLOWABLE_OUT.has(e.category)) { expenses[e.category] = round2((expenses[e.category] || 0) + e.net); expenseTotal += e.net; }
    }
    const filed = store.find('mtdUpdates', (m) => m.businessId === req.businessId && m.taxYear === tyStart && m.quarter === q.quarter);
    const ended = todayISO() > q.to;
    return {
      ...q,
      income: Object.entries(income).map(([k, v]) => ({ category: k, label: catLabel(k), amount: v })),
      expenses: Object.entries(expenses).map(([k, v]) => ({ category: k, label: catLabel(k), amount: v })),
      incomeTotal: round2(incomeTotal), expenseTotal: round2(expenseTotal), profit: round2(incomeTotal - expenseTotal),
      ended, status: filed ? 'submitted' : ended ? 'ready' : 'open', reference: filed ? filed.reference : null,
    };
  });
  // Year-to-date estimate
  const from = `${tyStart}-04-06`, to = `${tyStart + 1}-04-05`;
  const yr = entriesIn(req.businessId, from, to);
  let income = 0, allowable = 0;
  for (const e of yr) { if (e.direction === 'in') income += e.net; else if (ALLOWABLE_OUT.has(e.category)) allowable += e.net; }
  const profit = round2(income - allowable);
  res.json({
    taxYear: tax.taxYearLabel(tyStart), taxYearStart: tyStart, basis: biz.basis,
    quarters, estimate: tax.estimate(profit),
    finalDeclarationDeadline: `${tyStart + 2}-01-31`,
    mandated: profit >= 0, // informational; real mandation is on qualifying income
  });
});
app.post('/api/businesses/:businessId/mtd/submit', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const { year, quarter, from, to } = req.body;
  if (year == null || quarter == null || !from || !to) return res.status(400).json({ error: 'Choose a quarter.' });
  if (todayISO() <= to) return res.status(400).json({ error: 'This quarter has not finished yet.' });
  if (store.find('mtdUpdates', (m) => m.businessId === req.businessId && m.taxYear === Number(year) && m.quarter === Number(quarter))) return res.status(400).json({ error: 'This quarter has already been sent.' });
  const ents = entriesIn(req.businessId, from, to);
  let income = 0, expenses = 0;
  for (const e of ents) { if (e.direction === 'in') income += e.net; else if (ALLOWABLE_OUT.has(e.category)) expenses += e.net; }
  const reference = 'LUMI-MTD-' + Date.now().toString(36).toUpperCase();
  const m = store.insert('mtdUpdates', { businessId: req.businessId, taxYear: Number(year), quarter: Number(quarter), from, to, totals: { income: round2(income), expenses: round2(expenses), profit: round2(income - expenses) }, status: 'submitted', submittedAt: new Date().toISOString(), reference });
  audit(req, 'itsa.submit', `Filed Income Tax update Q${quarter} ${from} → ${to}`);
  res.json({ update: m, note: 'Recorded as sent in Lumi. Sending to HMRC needs an HMRC-recognised connection, which is set up when the app is hosted.' });
});

// ===================== HMRC CONNECTION (sandbox) =====================
const hmrcStates = new Map(); // state -> { businessId, userId, createdAt }

// Developer-app credentials (Client ID / Secret / environment / redirect URI).
app.get('/api/hmrc/config', auth.requireAuth, (req, res) => res.json(hmrc.publicConfig()));
app.post('/api/hmrc/config', auth.requireAuth, (req, res) => {
  const { clientId, clientSecret, env, redirectUri, scopes } = req.body;
  if (!clientId || !redirectUri) return res.status(400).json({ error: 'Client ID and redirect URI are required.' });
  hmrc.saveConfig({ clientId, clientSecret, env, redirectUri, scopes });
  res.json(hmrc.publicConfig());
});

// Per-business connection status.
app.get('/api/businesses/:businessId/hmrc/status', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const t = hmrc.tokenRow(req.businessId);
  res.json({ configured: hmrc.isConfigured(), connected: hmrc.isConnected(req.businessId), scope: t ? t.scope : '', obtainedAt: t ? t.obtainedAt : null, expiresAt: t ? t.expiresAt : null });
});

// Step 1 — browser navigates here; we redirect to HMRC's consent screen.
app.get('/api/hmrc/connect/:businessId', auth.requireAuth, (req, res) => {
  if (!store.find('memberships', (m) => m.userId === req.user.id && m.businessId === req.params.businessId)) return res.status(403).send('No access to this business.');
  if (!hmrc.isConfigured()) return res.status(400).send('Add your HMRC Client ID and Secret in Settings first.');
  const state = hmrc.newState();
  hmrcStates.set(state, { businessId: req.params.businessId, userId: req.user.id, createdAt: Date.now() });
  res.redirect(hmrc.authorizeUrl(state));
});

// Step 2 — HMRC redirects back here with a code; we swap it for tokens.
app.get('/api/hmrc/callback', auth.requireAuth, async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const page = (title, msg, ok) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF8F4;color:#1A1A18;display:grid;place-items:center;min-height:100vh;margin:0">
    <div style="background:#fff;border-top:3px solid ${ok ? '#3a7a52' : '#b23a3a'};border-radius:16px;padding:32px 36px;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.15);text-align:center">
    <h2 style="font-family:Georgia,serif">${title}</h2><p style="color:#6B6860">${msg}</p>
    <a href="/" style="display:inline-block;margin-top:8px;background:#1A1A18;color:#FAF8F4;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">Back to Lumi Lite</a></div></body>`;
  if (error) return res.status(400).send(page('Connection cancelled', error_description || error, false));
  const ctx = state && hmrcStates.get(state);
  if (!ctx || ctx.userId !== req.user.id) return res.status(400).send(page('Something went wrong', 'This connection link is invalid or has expired. Please try again from Settings.', false));
  hmrcStates.delete(state);
  try {
    const data = await hmrc.exchangeCode(code);
    hmrc.saveTokens(ctx.businessId, data);
    store.insert('auditLog', { businessId: ctx.businessId, userId: req.user.id, userName: req.user.name, action: 'hmrc.connect', detail: 'Connected to HMRC', at: new Date().toISOString() });
    res.send(page('Connected to HMRC', 'Your sandbox connection is live. You can now run a test from Settings.', true));
  } catch (e) {
    res.status(400).send(page('Could not connect', e.message, false));
  }
});

// Test the connection with HMRC's Hello World (no fraud headers needed).
app.post('/api/businesses/:businessId/hmrc/test', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  try {
    const world = await hmrc.helloWorld();
    let user = null;
    if (hmrc.isConnected(req.businessId)) user = await hmrc.helloUser(req.businessId);
    res.json({ world, user });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/businesses/:businessId/hmrc/disconnect', auth.requireAuth, auth.requireBusiness, (req, res) => { hmrc.disconnect(req.businessId); audit(req, 'hmrc.disconnect', 'Disconnected from HMRC'); res.json({ ok: true }); });

// Build fraud-prevention headers for a request (browser clientData + server-derived IP).
function publicIpOf(req) { let ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''; if (ip.startsWith('::ffff:')) ip = ip.slice(7); if (ip === '::1') ip = '127.0.0.1'; return ip; }
async function fraudFor(req) {
  const reqIp = publicIpOf(req);
  const pub = await hmrc.publicIp(reqIp);
  // Always send the connection port — HMRC requires the header present and any valid port satisfies the validator.
  return hmrc.buildFraudHeaders({ clientData: req.body.clientData || {}, publicIp: pub, publicPort: req.socket.remotePort, userId: req.user.id });
}

// Check our fraud-prevention headers against HMRC's validator.
app.post('/api/businesses/:businessId/hmrc/validate-headers', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  try { res.json(await hmrc.validateFraudHeaders(req.businessId, await fraudFor(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});
// Retrieve VAT obligations (open return periods + their period keys).
app.post('/api/businesses/:businessId/hmrc/vat/obligations', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const vrn = String(req.body.vrn || '').replace(/\D/g, '');
  if (vrn.length < 9) return res.status(400).json({ error: 'Enter the 9-digit VAT number (VRN) of your HMRC test user.' });
  try { res.json(await hmrc.vatObligations(req.businessId, vrn, { status: req.body.status || 'O', from: req.body.from, to: req.body.to }, await fraudFor(req))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Submit a VAT return for a period (boxes computed from the entries in that period).
app.post('/api/businesses/:businessId/hmrc/vat/submit', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const vrn = String(req.body.vrn || '').replace(/\D/g, '');
  const { periodKey, from, to } = req.body;
  if (vrn.length < 9 || !periodKey || !from || !to) return res.status(400).json({ error: 'Need the VRN, period key and dates.' });
  const b = tax.vatBoxes(entriesIn(req.businessId, from, to));
  const payload = {
    periodKey,
    vatDueSales: b.box1, vatDueAcquisitions: b.box2, totalVatDue: b.box3,
    vatReclaimedCurrPeriod: b.box4, netVatDue: Math.abs(b.box5),
    totalValueSalesExVAT: b.box6, totalValuePurchasesExVAT: b.box7,
    totalValueGoodsSuppliedExVAT: b.box8, totalAcquisitionsExVAT: b.box9,
    finalised: true,
  };
  try {
    const r = await hmrc.vatSubmitReturn(req.businessId, vrn, payload, await fraudFor(req));
    if (r.ok) { store.insert('vatReturns', { businessId: req.businessId, from, to, boxes: b, status: 'submitted', submittedAt: new Date().toISOString(), httpStatus: r.status, reference: (r.data && r.data.formBundleNumber) || 'HMRC-SANDBOX', liability: Math.abs(b.box5), hmrc: r.data }); audit(req, 'vat.submit', `Filed VAT return ${from} → ${to} (net due ${Math.abs(b.box5)}) — HMRC ${r.status}`); }
    res.json({ ...r, payload });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Income Tax (MTD ITSA) ----
// Map our plain-English categories to HMRC self-employment periodExpenses fields.
const ITSA_EXPENSE_FIELD = {
  stock: 'costOfGoods', wages: 'wagesAndStaffCosts', travel: 'carVanTravelExpenses',
  premises: 'premisesRunningCosts', repairs: 'maintenanceCosts', office: 'adminCosts',
  advertising: 'advertisingCosts', professional: 'professionalFees', finance: 'financeCharges',
  insurance: 'otherExpenses', training: 'otherExpenses', other_expense: 'otherExpenses',
};
// Build the cumulative period summary body from entries in [from, to].
function itsaPeriodBody(businessId, from, to) {
  const ents = entriesIn(businessId, from, to);
  let turnover = 0, otherInc = 0; const exp = {};
  for (const e of ents) {
    if (e.direction === 'in') { if (e.category === 'other_income') otherInc += e.net; else turnover += e.net; }
    else if (ITSA_EXPENSE_FIELD[e.category]) { const f = ITSA_EXPENSE_FIELD[e.category]; exp[f] = round2((exp[f] || 0) + e.net); }
  }
  const periodExpenses = {};
  for (const k of Object.keys(exp)) if (exp[k] > 0) periodExpenses[k] = exp[k];
  const body = { periodDates: { periodStartDate: from, periodEndDate: to }, periodIncome: { turnover: round2(turnover), other: round2(otherInc) } };
  if (Object.keys(periodExpenses).length) body.periodExpenses = periodExpenses;
  return body;
}

app.post('/api/businesses/:businessId/hmrc/itsa/businesses', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const nino = String(req.body.nino || '').replace(/\s/g, '').toUpperCase();
  if (nino.length < 9) return res.status(400).json({ error: 'Enter the National Insurance number (NINO) of your test user.' });
  try { res.json(await hmrc.itsaBusinesses(req.businessId, nino, await fraudFor(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/businesses/:businessId/hmrc/itsa/obligations', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const nino = String(req.body.nino || '').replace(/\s/g, '').toUpperCase();
  if (nino.length < 9) return res.status(400).json({ error: 'Enter the NINO.' });
  try { res.json(await hmrc.itsaObligations(req.businessId, nino, { status: req.body.status, from: req.body.from, to: req.body.to }, await fraudFor(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/businesses/:businessId/hmrc/itsa/submit', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const nino = String(req.body.nino || '').replace(/\s/g, '').toUpperCase();
  const { seBusinessId, periodStartDate, periodEndDate } = req.body;
  if (nino.length < 9 || !seBusinessId || !periodStartDate || !periodEndDate) return res.status(400).json({ error: 'Need NINO, business ID and the obligation dates.' });
  // Derive the tax year from the obligation itself; cumulative figures run from 6 April of that year.
  const tyStart = tax.taxYearOf(periodStartDate);
  if (tyStart < 2025) return res.status(400).json({ error: `This obligation is for ${hmrc.itsaTaxYear(tyStart)}. HMRC's cumulative update API only supports 2025-26 onwards — switch the tax year at the top of the Income Tax page to 2025/26 (or later) and submit one of those quarters.` });
  const cumStart = `${tyStart}-04-06`;
  const taxYear = hmrc.itsaTaxYear(tyStart);
  const body = itsaPeriodBody(req.businessId, cumStart, periodEndDate);
  try {
    const r = await hmrc.itsaSubmitCumulative(req.businessId, nino, seBusinessId, taxYear, body, await fraudFor(req));
    if (r.ok) { store.insert('mtdUpdates', { businessId: req.businessId, taxYear: tyStart, from: cumStart, to: periodEndDate, totals: { income: body.periodIncome.turnover + body.periodIncome.other, expenses: Object.values(body.periodExpenses || {}).reduce((a, b) => a + b, 0) }, status: 'submitted', submittedAt: new Date().toISOString(), httpStatus: r.status, reference: `HMRC accepted (${r.status})`, liability: null, hmrc: r.data }); audit(req, 'itsa.submit', `Filed Income Tax update ${taxYear} to ${periodEndDate} (turnover ${body.periodIncome.turnover}) — HMRC ${r.status}`); }
    res.json({ ...r, body, taxYear });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Recursively find the first numeric value whose key matches a pattern.
function deepFind(obj, rx, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return null; seen.add(obj);
  for (const k of Object.keys(obj)) { const v = obj[k]; if (rx.test(k) && typeof v === 'number') return v; if (v && typeof v === 'object') { const r = deepFind(v, rx, seen); if (r != null) return r; } }
  return null;
}
app.post('/api/businesses/:businessId/hmrc/itsa/calc', auth.requireAuth, auth.requireBusiness, async (req, res) => {
  const nino = String(req.body.nino || '').replace(/\s/g, '').toUpperCase();
  const tyStart = Number(req.body.taxYearStart);
  const taxYear = hmrc.itsaTaxYear(tyStart);
  if (nino.length < 9 || !req.body.taxYearStart) return res.status(400).json({ error: 'Need NINO and tax year.' });
  try {
    const trig = await hmrc.itsaTriggerCalc(req.businessId, nino, taxYear, await fraudFor(req));
    const calcId = trig.data && (trig.data.calculationId || trig.data.id);
    if (!trig.ok || !calcId) return res.json({ trigger: { status: trig.status, data: trig.data, attempts: trig.attempts } });
    await new Promise((r) => setTimeout(r, 2000)); // give HMRC a moment to calculate
    const result = await hmrc.itsaGetCalc(req.businessId, nino, taxYear, calcId, await fraudFor(req), trig.tried && trig.tried.v);
    const liability = deepFind(result.data, /(totalIncomeTaxAndNicsDue|incomeTaxAndNicsDue|totalIncomeTaxNicsCgtDue|totalTaxDue)/i);
    // Store the liability against the most recent update for this tax year.
    const rec = store.filter('mtdUpdates', (m) => m.businessId === req.businessId && m.taxYear === tyStart).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
    if (rec && liability != null) store.update('mtdUpdates', rec.id, { liability, calculatedAt: new Date().toISOString(), calculationId: calcId });
    res.json({ trigger: trig, calculationId: calcId, result, liability });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Submission history (what's been filed to HMRC, with the latest response + liability).
app.get('/api/businesses/:businessId/hmrc/submissions', auth.requireAuth, auth.requireBusiness, (req, res) => {
  const vat = store.filter('vatReturns', (v) => v.businessId === req.businessId && v.httpStatus)
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .map((v) => ({ from: v.from, to: v.to, submittedAt: v.submittedAt, httpStatus: v.httpStatus, reference: v.reference, liability: v.liability != null ? v.liability : (v.boxes ? Math.abs(v.boxes.box5) : null) }));
  const itsa = store.filter('mtdUpdates', (m) => m.businessId === req.businessId && m.httpStatus)
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .map((m) => ({ taxYear: m.taxYear, from: m.from, to: m.to, submittedAt: m.submittedAt, httpStatus: m.httpStatus, reference: m.reference, totals: m.totals, liability: m.liability, calculatedAt: m.calculatedAt || null }));
  res.json({ vat, itsa });
});

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'Lumi Bookkeeping Lite' }));
// SPA fallback
app.get('*', (req, res) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' }); res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const PORT = process.env.PORT || 4100;
if (require.main === module) app.listen(PORT, () => console.log(`Lumi Bookkeeping Lite running at http://localhost:${PORT}`));
module.exports = { app, CATEGORIES };
