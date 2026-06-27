// Tests the Postgres backend of lib/store.js against a faithful in-memory
// fake pg pool (no native Postgres needed in CI / locally). It emulates exactly
// the queries the store issues, so it exercises the real write-through and
// hydrate-on-boot logic. The literal SQL is additionally validated against a
// real database via `npm run db:smoke` once DATABASE_URL is set.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../lib/store');

// Minimal pg-compatible pool: CREATE TABLE/INDEX, SELECT data, upsert, delete.
function fakePgPool() {
  const tables = new Map(); // name -> Map(id -> { id, org_id, data })
  const tableFor = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  return {
    _tables: tables,
    async query(sql, params) {
      let m;
      if ((m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i))) { tableFor(m[1]); return { rows: [] }; }
      if (/^\s*CREATE INDEX/i.test(sql)) return { rows: [] };
      if ((m = sql.match(/SELECT data FROM (\w+)(?:\s+WHERE\s+(org_id|id)\s*=\s*\$1)?/i))) {
        let vals = [...tableFor(m[1]).values()];
        if (m[2] === 'org_id') vals = vals.filter((r) => r.org_id === params[0]);
        else if (m[2] === 'id') vals = vals.filter((r) => r.id === params[0]);
        return { rows: vals.map((r) => ({ data: r.data })) };
      }
      if ((m = sql.match(/INSERT INTO (\w+)/i))) {
        const [id, org_id, dataStr] = params;
        tableFor(m[1]).set(id, { id, org_id, data: JSON.parse(dataStr) }); // jsonb round-trip
        return { rows: [] };
      }
      if ((m = sql.match(/DELETE FROM (\w+) WHERE id/i))) {
        tableFor(m[1]).delete(params[0]);
        return { rows: [] };
      }
      throw new Error('fakePgPool: unhandled SQL: ' + sql);
    },
    async end() {},
  };
}

test('postgres backend: write-through persists across a restart', async () => {
  const pool = fakePgPool();
  const info = await store.init({ pool });
  assert.equal(info.backend, 'postgres');
  assert.equal(store.isPg(), true);

  const org = store.insert('organizations', { name: 'Acme Ltd' });
  const tx = store.insert('transactions', { orgId: org.id, description: 'Opening', status: 'posted' });
  store.insert('lines', { transactionId: tx.id, accountId: 'a1', debit: 100, credit: 0 });
  store.update('transactions', tx.id, { description: 'Opening balance' });
  const extra = store.insert('transactions', { orgId: org.id, description: 'to-delete', status: 'posted' });
  assert.equal(store.remove('transactions', (t) => t.id === extra.id), 1);
  await store.flush();

  // Re-hydrate from the same database, as a fresh process would on boot.
  const info2 = await store.init({ pool });
  assert.equal(info2.rows, 3); // org + remaining tx + line
  const orgs = store.all('organizations');
  const txs = store.filter('transactions', (t) => t.orgId === org.id);
  assert.equal(orgs.length, 1);
  assert.equal(orgs[0].name, 'Acme Ltd');
  assert.equal(txs.length, 1, 'the deleted transaction did not come back');
  assert.equal(txs[0].description, 'Opening balance', 'the update persisted');
  assert.equal(store.all('lines').length, 1);
  // orgId is denormalised into the indexed org_id column.
  assert.equal(pool._tables.get('transactions').get(tx.id).org_id, org.id);
});

test('postgres backend: byId + audit round-trip', async () => {
  const pool = fakePgPool();
  await store.init({ pool });
  const a = store.insert('accounts', { orgId: 'o1', code: '4000', name: 'Sales', type: 'income' });
  store.audit({ orgId: 'o1', user: { id: 'u1', name: 'Chris' }, action: 'create', entity: 'account', entityId: a.id });
  await store.flush();

  await store.init({ pool });
  assert.equal(store.byId('accounts', a.id).name, 'Sales');
  const log = store.all('auditLog');
  assert.equal(log.length, 1);
  assert.equal(log[0].userName, 'Chris');
  assert.equal(log[0].action, 'create');
});

test('postgres backend: async query helpers read straight from the DB (read-your-writes)', async () => {
  const pool = fakePgPool();
  await store.init({ pool });
  const o1 = store.insert('organizations', { name: 'Org One' });
  const o2 = store.insert('organizations', { name: 'Org Two' });
  store.insert('accounts', { orgId: o1.id, code: '4000', name: 'Sales' });
  store.insert('accounts', { orgId: o1.id, code: '5000', name: 'COGS' });
  store.insert('accounts', { orgId: o2.id, code: '4000', name: 'Other Sales' });

  // queryByOrg flushes the write queue first, so just-written rows are visible.
  const a1 = await store.queryByOrg('accounts', o1.id);
  assert.deepEqual(a1.map((a) => a.code).sort(), ['4000', '5000']);
  const a2 = await store.queryByOrg('accounts', o2.id);
  assert.equal(a2.length, 1);
  assert.equal((await store.queryById('organizations', o1.id)).name, 'Org One');
  assert.equal((await store.queryAll('organizations')).length, 2);
});
