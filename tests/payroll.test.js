// Tests for the simplified UK PAYE/NI payroll calculation.
const test = require('node:test');
const assert = require('node:assert');
const pr = require('../lib/payroll');

test('personal allowance parses from tax code', () => {
  assert.strictEqual(pr.personalAllowance('1257L'), 12570);
  assert.strictEqual(pr.personalAllowance('1000L'), 10000);
  assert.strictEqual(pr.personalAllowance('BR'), 0);
});

test('basic-rate employee: tax and NI', () => {
  // £28,000, 1257L, Cat A
  assert.strictEqual(pr.annualIncomeTax(28000, '1257L'), 3086);   // (28000-12570)*20%
  assert.strictEqual(pr.annualEmployeeNI(28000, 'A'), 1234.4);    // (28000-12570)*8%
  assert.strictEqual(pr.annualEmployerNI(28000), 2608.2);         // (28000-9100)*13.8%
});

test('higher-rate employee crosses the 40% band', () => {
  // £52,000 -> basic 37,700*20% + higher 1,730*40%
  assert.strictEqual(pr.annualIncomeTax(52000, '1257L'), 8232);
  // NI: 37,700*8% + 1,730*2%
  assert.strictEqual(pr.annualEmployeeNI(52000, 'A'), 3050.6);
});

test('monthly period figures net correctly', () => {
  const p = pr.calcPeriod({ annualSalary: 28000, taxCode: '1257L', niCategory: 'A', payFrequency: 'monthly' });
  assert.strictEqual(p.gross, 2333.33);
  assert.strictEqual(p.net, pr.round2(p.gross - p.tax - p.employeeNI));
});

test('below thresholds: no tax or NI', () => {
  assert.strictEqual(pr.annualIncomeTax(10000, '1257L'), 0);
  assert.strictEqual(pr.annualEmployeeNI(10000, 'A'), 0);
});
