// Simple JSON-file datastore for Lumi Bookkeeping Lite.
// One file, easy to back up. Can be swapped for a database later.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.LUMI_LITE_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  users: [],          // { id, name, email, passwordHash, role: trader|bookkeeper }
  businesses: [],     // { id, name, ownerName, basis: cash|accruals, vatRegistered, vatNumber, vatScheme, utr, mtdIncomeYear, tradeType, createdAt }
  memberships: [],    // { id, userId, businessId, role: owner|agent }
  entries: [],        // { id, businessId, date, direction: in|out, category, description, gross, vatRate, net, vat, method, attachmentId, createdAt }
  invoices: [],       // { id, businessId, number, customerName, customerEmail, issueDate, dueDate, lines:[{description, amount, vatRate, vat}], net, vat, total, status: draft|sent|paid, paidDate }
  mileage: [],        // { id, businessId, date, miles, vehicle: car|van|motorcycle, purpose, rate, amount }
  vatReturns: [],     // { id, businessId, from, to, boxes, status, submittedAt, reference }
  mtdUpdates: [],     // { id, businessId, taxYear, quarter, from, to, totals, status, submittedAt }
  attachments: [],    // { id, businessId, filename, originalName, mimetype, size, uploadedAt }
  settings: [],       // { id, businessId, key, value }
  hmrcApp: [],        // singleton developer-app config: { id, clientId, clientSecret, env, redirectUri, scopes }
  hmrcTokens: [],     // per business OAuth tokens: { id, businessId, accessToken, refreshToken, expiresAt, scope, obtainedAt }
  auditLog: [],       // { id, businessId, userId, userName, action, detail, at }
};

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

let cache = null;
function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); for (const k of Object.keys(EMPTY)) if (!cache[k]) cache[k] = []; }
    catch (e) { cache = JSON.parse(JSON.stringify(EMPTY)); }
  } else { cache = JSON.parse(JSON.stringify(EMPTY)); save(); }
  return cache;
}
function save() { ensureDir(); const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cache, null, 2)); fs.renameSync(tmp, DB_FILE); }
function id() { return crypto.randomBytes(9).toString('base64url'); }

function all(c) { return load()[c]; }
function find(c, p) { return load()[c].find(p); }
function filter(c, p) { return load()[c].filter(p); }
function byId(c, rid) { return load()[c].find((r) => r.id === rid) || null; }
function insert(c, rec) { const db = load(); const row = { id: id(), ...rec }; db[c].push(row); save(); return row; }
function update(c, rid, patch) { const db = load(); const row = db[c].find((r) => r.id === rid); if (!row) return null; Object.assign(row, patch); save(); return row; }
function remove(c, p) { const db = load(); const before = db[c].length; db[c] = db[c].filter((r) => !p(r)); save(); return before - db[c].length; }

module.exports = { DATA_DIR, DB_FILE, load, save, id, all, find, filter, byId, insert, update, remove };
