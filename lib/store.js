// Simple JSON-file datastore. Single source of truth for all app data.
// Structured so it can be swapped for SQL/Postgres later without changing callers much.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Data location can be overridden (used by the test suite) via LUMI_DATA_DIR.
const DATA_DIR = process.env.LUMI_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  users: [],
  organizations: [],  // { id, name, lockDate, createdAt }
  memberships: [],    // { id, userId, orgId, role }
  accounts: [],       // { id, orgId, code, name, type, archived }
  transactions: [],   // { id, orgId, date, description, reference, createdBy, createdAt, status, source, sourceId }
  lines: [],          // { id, transactionId, accountId, debit, credit, reconciled, reconciledAt }
  attachments: [],    // { id, transactionId, orgId, filename, originalName, mimetype, size, uploadedBy, uploadedAt }
  contacts: [],       // { id, orgId, name, kind: customer|supplier, email }
  invoices: [],       // { id, orgId, type, contactId, number, issueDate, dueDate, lines:[{accountId,description,amount,taxRateId,tax}], subtotal, taxTotal, total, status, transactionId, paymentTransactionId }
  auditLog: [],       // { id, orgId, userId, userName, action, entity, entityId, detail, at }
  taxRates: [],       // { id, orgId, name, rate, archived }
  rules: [],          // { id, orgId, match, accountId, taxRateId, kind: any|spend|receive }
  tasks: [],          // { id, orgId, text, done, createdBy, createdAt }
  aiDismissed: [],    // { id, orgId, match }
  inbox: [],          // { id, orgId, filename, originalName, mimetype, size, note, uploadedBy, uploadedAt }
  queries: [],        // { id, orgId, transactionId, question, status, askedBy, askedByName, askedAt, answer, answeredBy, answeredByName, answeredAt }
  fixedAssets: [],    // { id, orgId, name, cost, purchaseDate, usefulLifeYears, assetAccountId, depreciatedTo }
  budgets: [],        // { id, orgId, accountId, monthlyAmount }
  recurring: [],      // { id, orgId, type, contactId, description, accountId, amount, taxRateId, frequency, nextDate, active, createdAt }
  vatReturns: [],     // { id, orgId, from, to, boxes, status, submittedAt, submittedBy, reference }
  items: [],          // { id, orgId, code, name, description, salePrice, saleAccountId, taxRateId }
  tracking: [],       // { id, orgId, name }  (tracking-category options, e.g. Kitchen / Events)
  stockMovements: [], // { id, orgId, itemId, date, qty, unitCost, note }
  expenseClaims: [],  // { id, orgId, claimant, date, description, accountId, amount, taxRateId, status, transactionId, createdBy, createdAt }
  employees: [],      // { id, orgId, name, niNumber, annualSalary, taxCode, niCategory, payFrequency, active }
  payRuns: [],        // { id, orgId, periodLabel, payDate, from, to, status, lines, totals, submittedAt }
  cashScenarios: [],  // { id, orgId, label, amount, direction: in|out, date, note, createdAt }
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of Object.keys(EMPTY)) if (!cache[k]) cache[k] = [];
    } catch (e) {
      cache = JSON.parse(JSON.stringify(EMPTY));
    }
  } else {
    cache = JSON.parse(JSON.stringify(EMPTY));
    save();
  }
  return cache;
}

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id() {
  return crypto.randomBytes(9).toString('base64url');
}

// Generic collection accessors
function all(coll) {
  return load()[coll];
}
function find(coll, predicate) {
  return load()[coll].find(predicate);
}
function filter(coll, predicate) {
  return load()[coll].filter(predicate);
}
function insert(coll, record) {
  const db = load();
  const row = { id: id(), ...record };
  db[coll].push(row);
  save();
  return row;
}
function update(coll, rowId, patch) {
  const db = load();
  const row = db[coll].find((r) => r.id === rowId);
  if (!row) return null;
  Object.assign(row, patch);
  save();
  return row;
}
function remove(coll, predicate) {
  const db = load();
  const before = db[coll].length;
  db[coll] = db[coll].filter((r) => !predicate(r));
  save();
  return before - db[coll].length;
}

function byId(coll, rowId) {
  return load()[coll].find((r) => r.id === rowId) || null;
}

// Append an audit entry.
function audit({ orgId, user, action, entity, entityId, detail }) {
  return insert('auditLog', {
    orgId,
    userId: user ? user.id : null,
    userName: user ? user.name : 'system',
    action,
    entity,
    entityId: entityId || null,
    detail: detail || '',
    at: new Date().toISOString(),
  });
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  load,
  save,
  id,
  all,
  find,
  filter,
  insert,
  update,
  remove,
  byId,
  audit,
};
