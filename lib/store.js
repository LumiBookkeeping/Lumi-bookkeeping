// Datastore. Single source of truth for all app data.
//
// Two interchangeable backends behind ONE synchronous, predicate-based API so
// callers never change:
//   • JSON file  (default, zero-config) — for local dev and the test suite.
//   • PostgreSQL (when DATABASE_URL is set, or a pool is injected) — durable,
//     backed-up and hostable; the real-product backend.
//
// Reads/filters always run synchronously over an in-memory cache. With Postgres
// the cache is hydrated once by init() at boot, and every mutation is written
// through to Postgres via a serialized queue. Callers must `await store.init()`
// before serving requests when using Postgres (server.js does this).
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
const COLLECTIONS = Object.keys(EMPTY);

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

// ---- Postgres backend state (inactive unless init() wires it up) ----
let pgPool = null;        // active pg Pool, or null for the JSON backend
let db = null;            // lib/db helpers, loaded lazily
let writeQueue = [];      // pending { op, coll, id, orgId, data } operations
let draining = false;
let writeError = null;    // last write-through failure (surfaced for monitoring)

function isPg() {
  return !!pgPool;
}

function load() {
  if (cache) return cache;
  if (isPg()) throw new Error('store.init() must be awaited before use (Postgres backend)');
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of COLLECTIONS) if (!cache[k]) cache[k] = [];
    } catch (e) {
      cache = JSON.parse(JSON.stringify(EMPTY));
    }
  } else {
    cache = JSON.parse(JSON.stringify(EMPTY));
    save();
  }
  return cache;
}

// Persist the whole dataset (JSON backend only; Postgres writes per-row).
function save() {
  if (isPg()) return; // Postgres persists incrementally via the write queue.
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id() {
  return crypto.randomBytes(9).toString('base64url');
}

// ---- Initialise the chosen backend. Safe to call once at boot. ----
// opts.pool  — inject a pg-compatible Pool (used by tests with pg-mem).
// Falls back to DATABASE_URL, then to the JSON file.
async function init(opts = {}) {
  const connectionString = opts.connectionString || process.env.DATABASE_URL;
  if (opts.pool || connectionString) {
    db = require('./db');
    pgPool = opts.pool || db.makePool(connectionString);
    await db.bootstrap(pgPool, COLLECTIONS);
    cache = JSON.parse(JSON.stringify(EMPTY));
    for (const coll of COLLECTIONS) {
      const { rows } = await pgPool.query(`SELECT data FROM ${db.table(coll)}`);
      cache[coll] = rows.map((r) => r.data);
    }
    return { backend: 'postgres', rows: COLLECTIONS.reduce((n, c) => n + cache[c].length, 0) };
  }
  load(); // JSON backend
  return { backend: 'json', file: DB_FILE };
}

// ---- write-through queue (Postgres) ----
function enqueueUpsert(coll, row) {
  writeQueue.push({ op: 'upsert', coll, id: row.id, orgId: row.orgId == null ? null : String(row.orgId), data: JSON.stringify(row) });
  drain();
}
function enqueueDelete(coll, ids) {
  for (const rowId of ids) writeQueue.push({ op: 'delete', coll, id: rowId });
  drain();
}
async function drain() {
  if (draining || !pgPool) return;
  draining = true;
  try {
    while (writeQueue.length) {
      const it = writeQueue.shift();
      const t = db.table(it.coll);
      try {
        if (it.op === 'upsert') {
          await pgPool.query(
            `INSERT INTO ${t} (id, org_id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, data = EXCLUDED.data`,
            [it.id, it.orgId, it.data]
          );
        } else {
          await pgPool.query(`DELETE FROM ${t} WHERE id = $1`, [it.id]);
        }
      } catch (err) {
        // Keep the cache as the working truth; log loudly so monitoring catches
        // divergence. Stage 2 (per-request transactions) closes this window.
        writeError = err;
        console.error(`[store] write-through failed (${it.op} ${t} ${it.id}):`, err.message);
      }
    }
  } finally {
    draining = false;
  }
}
// Wait for all queued writes to land (call before shutdown).
async function flush() {
  while (writeQueue.length || draining) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

function persistUpsert(coll, row) {
  if (isPg()) enqueueUpsert(coll, row);
  else save();
}
function persistDelete(coll, ids) {
  if (isPg()) enqueueDelete(coll, ids);
  else save();
}

// ---- Generic collection accessors (synchronous, over the cache) ----
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
  const dbc = load();
  const row = { id: id(), ...record };
  dbc[coll].push(row);
  persistUpsert(coll, row);
  return row;
}
function update(coll, rowId, patch) {
  const dbc = load();
  const row = dbc[coll].find((r) => r.id === rowId);
  if (!row) return null;
  Object.assign(row, patch);
  persistUpsert(coll, row);
  return row;
}
function remove(coll, predicate) {
  const dbc = load();
  const removed = dbc[coll].filter(predicate);
  if (!removed.length) return 0;
  dbc[coll] = dbc[coll].filter((r) => !predicate(r));
  persistDelete(coll, removed.map((r) => r.id));
  return removed.length;
}

function byId(coll, rowId) {
  return load()[coll].find((r) => r.id === rowId) || null;
}

// ---- Async query helpers (Stage 2) ----
// Read straight from Postgres, bypassing the in-memory cache, so the app can
// run stateless across multiple instances. The JSON backend falls back to the
// cache. Pending write-through ops are flushed first so a read always reflects
// writes made earlier in the same request (read-your-writes).
async function ready() {
  if (isPg() && (writeQueue.length || draining)) await flush();
}
async function queryAll(coll) {
  if (!isPg()) return load()[coll].slice();
  await ready();
  const { rows } = await pgPool.query(`SELECT data FROM ${db.table(coll)}`);
  return rows.map((r) => r.data);
}
async function queryByOrg(coll, orgId) {
  if (!isPg()) return load()[coll].filter((r) => r.orgId === orgId);
  await ready();
  const { rows } = await pgPool.query(`SELECT data FROM ${db.table(coll)} WHERE org_id = $1`, [orgId]);
  return rows.map((r) => r.data);
}
async function queryById(coll, rowId) {
  if (!isPg()) return byId(coll, rowId);
  await ready();
  const { rows } = await pgPool.query(`SELECT data FROM ${db.table(coll)} WHERE id = $1`, [rowId]);
  return rows[0] ? rows[0].data : null;
}

// Load the data an org's financial reports run on: the chart of accounts
// (non-archived, by code) + every posted (non-void) line, each carrying its
// transaction's date/description/source. Shape matches accounting.ledgerFor()
// so the engine can consume either. JOIN on Postgres; cache scan on JSON.
async function loadLedger(orgId) {
  if (!isPg()) {
    const dbc = load();
    const accounts = dbc.accounts
      .filter((a) => a.orgId === orgId && !a.archived)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const txnById = new Map(
      dbc.transactions.filter((t) => t.orgId === orgId && t.status !== 'void').map((t) => [t.id, t])
    );
    const lines = [];
    for (const line of dbc.lines) {
      const txn = txnById.get(line.transactionId);
      if (txn) lines.push({ ...line, date: txn.date, description: txn.description, source: txn.source });
    }
    return { accounts, lines };
  }
  await ready();
  const accRes = await pgPool.query(`SELECT data FROM ${db.table('accounts')} WHERE org_id = $1`, [orgId]);
  const accounts = accRes.rows
    .map((r) => r.data)
    .filter((a) => !a.archived)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const lineRes = await pgPool.query(
    `SELECT l.data AS line, t.data AS txn
       FROM ${db.table('lines')} l
       JOIN ${db.table('transactions')} t ON t.id = l.data->>'transactionId'
      WHERE t.org_id = $1 AND COALESCE(t.data->>'status', '') <> 'void'`,
    [orgId]
  );
  const lines = lineRes.rows.map((r) => ({ ...r.line, date: r.txn.date, description: r.txn.description, source: r.txn.source }));
  return { accounts, lines };
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
  COLLECTIONS,
  init,
  flush,
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
  queryAll,
  queryByOrg,
  queryById,
  loadLedger,
  audit,
  isPg,
  lastWriteError: () => writeError,
};
