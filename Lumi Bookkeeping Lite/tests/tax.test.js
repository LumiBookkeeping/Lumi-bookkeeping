const test = require('node:test');
const assert = require('node:assert');
const tax = require('../lib/tax');

test('income tax: profit within personal allowance is £0', () => {
  assert.strictEqual(tax.incomeTax(12000).tax, 0);
});

test('income tax: basic rate on £30k profit', () => {
  // taxable = 30000 - 12570 = 17430 @ 20% = 3486
  assert.strictEqual(tax.incomeTax(30000).tax, 3486);
});

test('class 4 NIC on £30k profit', () => {
  // (30000 - 12570) * 6% = 1045.80
  assert.strictEqual(tax.class4(30000), 1045.8);
});

test('full estimate on £30k profit', () => {
  const e = tax.estimate(30000);
  assert.strictEqual(e.incomeTax, 3486);
  assert.strictEqual(e.class4, 1045.8);
  assert.strictEqual(e.totalDue, 4531.8);
  assert.ok(e.setAsidePct >= 15 && e.setAsidePct <= 20);
});

test('higher-rate profit crosses the 40% band', () => {
  const e = tax.estimate(60000);
  // taxable 47430: 37700@20=7540 + 9730@40=3892 = 11432
  assert.strictEqual(e.incomeTax, 11432);
  // class4: (50270-12570)*6 + (60000-50270)*2% = 2262 + 194.6 = 2456.6
  assert.strictEqual(e.class4, 2456.6);
});

test('VAT boxes from entries (cash basis)', () => {
  const entries = [
    { direction: 'in', net: 1000, vat: 200 },
    { direction: 'out', net: 500, vat: 100 },
  ];
  const b = tax.vatBoxes(entries);
  assert.strictEqual(b.box1, 200);
  assert.strictEqual(b.box4, 100);
  assert.strictEqual(b.box5, 100);
  assert.strictEqual(b.box6, 1000);
  assert.strictEqual(b.box7, 500);
});

test('MTD quarters for 2026/27 have correct boundaries and deadlines', () => {
  const q = tax.mtdQuarters(2026);
  assert.strictEqual(q.length, 4);
  assert.strictEqual(q[0].from, '2026-04-06');
  assert.strictEqual(q[0].to, '2026-07-05');
  assert.strictEqual(q[0].deadline, '2026-08-07');
  assert.strictEqual(q[3].to, '2027-04-05');
});

test('tax year boundary at 6 April', () => {
  assert.strictEqual(tax.taxYearOf('2026-04-05'), 2025);
  assert.strictEqual(tax.taxYearOf('2026-04-06'), 2026);
  assert.strictEqual(tax.taxYearLabel(2026), '2026/27');
});
