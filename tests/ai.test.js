// Tests for Little Lumi's built-in UK VAT treatment defaults.
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

process.env.LUMI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-ai-test-'));
const ai = require('../lib/ai');

test('standard-rated goods and services default to 20%', () => {
  assert.strictEqual(ai.legislativeTreatment('Software & Subscriptions Adobe'), 'Standard 20%');
  assert.strictEqual(ai.legislativeTreatment('Marketing Meta Ads'), 'Standard 20%');
  assert.strictEqual(ai.legislativeTreatment('Sales Revenue card sales'), 'Standard 20%');
});

test('food and printed matter are zero-rated', () => {
  assert.strictEqual(ai.legislativeTreatment('Cost of Goods Sold coffee beans'), 'Zero-rated 0%');
  assert.strictEqual(ai.legislativeTreatment('milk dairy direct'), 'Zero-rated 0%');
  assert.strictEqual(ai.legislativeTreatment('books and newspapers'), 'Zero-rated 0%');
});

test('exempt / outside-scope items are No VAT', () => {
  assert.strictEqual(ai.legislativeTreatment('Wages & Salaries staff wages'), 'No VAT');
  assert.strictEqual(ai.legislativeTreatment('Rent Abbey Mill'), 'No VAT');
  assert.strictEqual(ai.legislativeTreatment('Insurance Hiscox'), 'No VAT');
  assert.strictEqual(ai.legislativeTreatment('Bank Fees SumUp card fees'), 'No VAT');
});

test('domestic fuel and power is reduced-rated 5%', () => {
  assert.strictEqual(ai.legislativeTreatment('domestic electricity supply'), 'Reduced 5%');
});

test('deriveKey strips months and noise words', () => {
  assert.strictEqual(ai.deriveKey('February rent'), 'rent');
  assert.strictEqual(ai.deriveKey('Invoice INV-0001'), '');
});

test.after(() => { try { fs.rmSync(process.env.LUMI_DATA_DIR, { recursive: true, force: true }); } catch {} });
