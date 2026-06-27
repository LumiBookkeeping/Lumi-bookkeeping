// Tests for the double-entry engine and reports. Run with: npm test
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

// Point the datastore at a throwaway temp dir BEFORE requiring it.
process.env.LUMI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-test-'));
const store = require('../lib/store');
const acct = require('../lib/accounting');

// Build a clean set of books in the temp store.
function reset() {
  const db = store.load();
  for (const k of Object.keys(db)) db[k] = [];
  store.save();
}
function makeOrg(lockDate) {
  const org = store.insert('organizations', { name: 'Test Co', lockDate: lockDate || null, createdAt: '2026-01-01' });
  const codes = [
    ['1000', 'Bank', 'asset'], ['1100', 'AR', 'asset'],
    ['2000', 'AP', 'liability'], ['3000', 'Capital', 'equity'],
    ['4000', 'Sales', 'income'], ['6000', 'Rent', 'expense'],
  ];
  const acc = {};
  for (const [code, name, type] of codes) acc[code] = store.insert('accounts', { orgId: org.id, code, name, type, archived: false });
  return { org, acc };
}
function post(orgId, date, lines, status) {
  const t = store.insert('transactions', { orgId, date, description: 'x', status: status || 'posted' });
  for (const [accId, dr, cr] of lines) store.insert('lines', { transactionId: t.id, accountId: accId, debit: dr || 0, credit: cr || 0 });
  return t;
}

test('validateLines accepts a balanced entry', () => {
  assert.strictEqual(acct.validateLines([{ debit: 100 }, { credit: 100 }]), null);
});
test('validateLines rejects an unbalanced entry', () => {
  assert.match(acct.validateLines([{ debit: 100 }, { credit: 90 }]), /must equal/);
});
test('validateLines rejects a single line', () => {
  assert.match(acct.validateLines([{ debit: 100 }]), /at least two/);
});
test('validateLines rejects negative amounts', () => {
  assert.match(acct.validateLines([{ debit: -5 }, { credit: -5 }]), /negative/);
});
test('validateLines rejects a line with both debit and credit', () => {
  assert.match(acct.validateLines([{ debit: 5, credit: 5 }, { credit: 5 }]), /either a debit or a credit/);
});

test('trial balance is balanced and totals match', () => {
  reset();
  const { org, acc } = makeOrg();
  post(org.id, '2026-01-05', [[acc['1000'].id, 10000, 0], [acc['3000'].id, 0, 10000]]);
  post(org.id, '2026-02-01', [[acc['6000'].id, 1500, 0], [acc['1000'].id, 0, 1500]]);
  post(org.id, '2026-02-28', [[acc['1000'].id, 4000, 0], [acc['4000'].id, 0, 4000]]);
  const tb = acct.trialBalance(org.id, '2026-12-31');
  assert.strictEqual(tb.balanced, true);
  assert.strictEqual(tb.totalDebit, tb.totalCredit);
  assert.strictEqual(tb.totalDebit, 14000); // bank 12500 + rent 1500
});

test('profit & loss nets income minus expenses over the period', () => {
  reset();
  const { org, acc } = makeOrg();
  post(org.id, '2026-02-28', [[acc['1000'].id, 4000, 0], [acc['4000'].id, 0, 4000]]);
  post(org.id, '2026-02-01', [[acc['6000'].id, 1500, 0], [acc['1000'].id, 0, 1500]]);
  const pl = acct.profitAndLoss(org.id, '2026-01-01', '2026-12-31');
  assert.strictEqual(pl.totalIncome, 4000);
  assert.strictEqual(pl.totalExpense, 1500);
  assert.strictEqual(pl.netProfit, 2500);
});

test('profit & loss respects the date range', () => {
  reset();
  const { org, acc } = makeOrg();
  post(org.id, '2026-02-28', [[acc['1000'].id, 4000, 0], [acc['4000'].id, 0, 4000]]);
  post(org.id, '2026-05-10', [[acc['1000'].id, 1000, 0], [acc['4000'].id, 0, 1000]]);
  const q1 = acct.profitAndLoss(org.id, '2026-01-01', '2026-03-31');
  assert.strictEqual(q1.totalIncome, 4000); // May sale excluded
});

test('balance sheet balances: assets = liabilities + equity', () => {
  reset();
  const { org, acc } = makeOrg();
  post(org.id, '2026-01-05', [[acc['1000'].id, 10000, 0], [acc['3000'].id, 0, 10000]]);
  post(org.id, '2026-02-28', [[acc['1000'].id, 4000, 0], [acc['4000'].id, 0, 4000]]);
  post(org.id, '2026-02-01', [[acc['6000'].id, 1500, 0], [acc['1000'].id, 0, 1500]]);
  const bs = acct.balanceSheet(org.id, '2026-12-31');
  assert.strictEqual(bs.balanced, true);
  assert.strictEqual(bs.totalAssets, bs.totalLiabilities + bs.totalEquity);
  assert.strictEqual(bs.totalAssets, 12500);
  // Equity = capital 10000 + current earnings (4000 - 1500) = 12500
  assert.strictEqual(bs.totalEquity, 12500);
});

test('voided transactions are excluded from reports', () => {
  reset();
  const { org, acc } = makeOrg();
  post(org.id, '2026-02-28', [[acc['1000'].id, 4000, 0], [acc['4000'].id, 0, 4000]]);
  post(org.id, '2026-03-01', [[acc['1000'].id, 999, 0], [acc['4000'].id, 0, 999]], 'void');
  const pl = acct.profitAndLoss(org.id, '2026-01-01', '2026-12-31');
  assert.strictEqual(pl.totalIncome, 4000); // void 999 ignored
});

test('isLocked compares dates correctly', () => {
  assert.strictEqual(acct.isLocked({ lockDate: '2026-01-31' }, '2026-01-15'), true);
  assert.strictEqual(acct.isLocked({ lockDate: '2026-01-31' }, '2026-02-01'), false);
  assert.strictEqual(acct.isLocked({ lockDate: null }, '2026-01-15'), false);
});

test.after(() => { try { fs.rmSync(process.env.LUMI_DATA_DIR, { recursive: true, force: true }); } catch {} });
