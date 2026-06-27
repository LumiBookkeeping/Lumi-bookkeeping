// Tests for FIFO / AVCO stock valuation.
const test = require('node:test');
const assert = require('node:assert');
const inv = require('../lib/inventory');

const moves = [
  { date: '2026-01-01', qty: 10, unitCost: 5 },  // buy 10 @ 5
  { date: '2026-02-01', qty: 10, unitCost: 8 },  // buy 10 @ 8
  { date: '2026-03-01', qty: -12, unitCost: 0 },  // sell 12
];

test('AVCO values remaining stock at weighted average', () => {
  const v = inv.valuation(moves, 'avco');
  assert.strictEqual(v.qty, 8);
  assert.strictEqual(v.avgCost, 6.5);   // (50+80)/20
  assert.strictEqual(v.value, 52);      // 8 * 6.5
});

test('FIFO consumes oldest layers first', () => {
  const v = inv.valuation(moves, 'fifo');
  assert.strictEqual(v.qty, 8);
  // consumed 10@5 + 2@8, remaining 8@8
  assert.strictEqual(v.value, 64);
  assert.strictEqual(v.avgCost, 8);
});

test('empty movements value to zero', () => {
  const v = inv.valuation([], 'fifo');
  assert.strictEqual(v.qty, 0);
  assert.strictEqual(v.value, 0);
});
