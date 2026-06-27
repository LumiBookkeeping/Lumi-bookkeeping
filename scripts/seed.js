// Seed demo data: a bookkeeper, two client businesses, a client login, and sample transactions.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const auth = require('../lib/auth');
const { seedChart, seedTaxRates } = require('../server');

// Reset (overwrite any existing data without unlinking, for read-only-friendly mounts).
const db = store.load();
for (const k of Object.keys(db)) db[k] = [];
store.save();

function acc(orgId, code) {
  return store.find('accounts', (a) => a.orgId === orgId && a.code === code);
}
function tx(orgId, date, description, reference, lines, createdBy) {
  const t = store.insert('transactions', {
    orgId, date, description, reference: reference || '',
    createdBy, createdAt: new Date().toISOString(), status: 'posted',
  });
  for (const [code, debit, credit] of lines) {
    store.insert('lines', {
      transactionId: t.id, accountId: acc(orgId, code).id,
      debit: debit || 0, credit: credit || 0,
    });
  }
  return t;
}

// --- Users ---
const bookkeeper = store.insert('users', {
  name: 'Chris Sullivan', email: 'bookkeeper@lumi.app',
  passwordHash: auth.hashPassword('demo1234'), role: 'bookkeeper',
  createdAt: new Date().toISOString(),
});

const client = store.insert('users', {
  name: 'Jordan Lee', email: 'client@lumi.app',
  passwordHash: auth.hashPassword('demo1234'), role: 'client',
  createdAt: new Date().toISOString(),
});

// --- Client business 1: Bright Cafe ---
const cafe = store.insert('organizations', {
  name: 'Bright Cafe Ltd', createdAt: new Date().toISOString(),
  companyAddress: '12 High Street, Winchester, SO23 9AB', companyVatNo: 'GB 123 4567 89', companyRegNo: '12345678',
  companyEmail: 'hello@brightcafe.example', companyPhone: '01962 000000', bankDetails: 'Sort 00-00-00 · Acct 12345678',
});
seedChart(cafe.id);
seedTaxRates(cafe.id);
store.insert('memberships', { userId: bookkeeper.id, orgId: cafe.id, role: 'admin' });
store.insert('memberships', { userId: client.id, orgId: cafe.id, role: 'member' });
const std20 = store.find('taxRates', (t) => t.orgId === cafe.id && t.name === 'Standard 20%');
const trkKitchen = store.insert('tracking', { orgId: cafe.id, name: 'Café' });
const trkEvents = store.insert('tracking', { orgId: cafe.id, name: 'Events & catering' });

tx(cafe.id, '2026-01-05', "Owner's opening investment", 'CAP-01',
  [['1000', 20000, 0], ['3000', 0, 20000]], bookkeeper.id);
tx(cafe.id, '2026-01-10', 'Bought espresso machine', 'INV-204',
  [['1400', 6500, 0], ['1000', 0, 6500]], bookkeeper.id);
tx(cafe.id, '2026-02-01', 'February rent', 'RENT-02',
  [['6000', 1800, 0], ['1000', 0, 1800]], bookkeeper.id);
tx(cafe.id, '2026-02-28', 'February coffee sales', 'SALES-02',
  [['1000', 9400, 0], ['4000', 0, 9400]], bookkeeper.id);
tx(cafe.id, '2026-02-28', 'Coffee bean purchases', 'COGS-02',
  [['5000', 2600, 0], ['2000', 0, 2600]], bookkeeper.id);
tx(cafe.id, '2026-03-15', 'Staff wages', 'PAY-03',
  [['6100', 3200, 0], ['1000', 0, 3200]], bookkeeper.id);
tx(cafe.id, '2026-03-31', 'March coffee sales', 'SALES-03',
  [['1000', 11200, 0], ['4000', 0, 11200]], bookkeeper.id);

// --- Contacts, an approved invoice (AR) and a draft, plus an approved bill (AP) for the cafe ---
const acme = store.insert('contacts', { orgId: cafe.id, name: 'Acme Catering Clients', kind: 'customer', email: 'pay@acme.test' });
const greenBeans = store.insert('contacts', { orgId: cafe.id, name: 'Green Beans Roastery', kind: 'supplier', email: 'ar@greenbeans.test' });

// Approved sales invoice with 20% VAT -> Dr AR 1800, Cr Sales 1500, Cr VAT 300
const invTxn = tx(cafe.id, '2026-03-20', 'Invoice INV-0001', 'INV-0001',
  [['1100', 1800, 0], ['4000', 0, 1500], ['2100', 0, 300]], bookkeeper.id);
store.update('transactions', invTxn.id, { source: 'invoice', sourceId: 'seed-inv-1' });
store.insert('invoices', {
  id: 'seed-inv-1', orgId: cafe.id, type: 'invoice', contactId: acme.id, number: 'INV-0001',
  issueDate: '2026-03-20', dueDate: '2026-04-19',
  lines: [{ accountId: acc(cafe.id, '4000').id, description: 'Event catering', amount: 1500, taxRateId: std20.id, tax: 300 }],
  subtotal: 1500, taxTotal: 300, total: 1800, status: 'awaiting_payment', transactionId: invTxn.id, paymentTransactionId: null,
});

store.insert('invoices', {
  orgId: cafe.id, type: 'invoice', contactId: acme.id, number: 'INV-0002',
  issueDate: '2026-04-02', dueDate: '2026-05-02',
  lines: [{ accountId: acc(cafe.id, '4000').id, description: 'Workshop coffee', amount: 600, taxRateId: std20.id, tax: 120 }],
  subtotal: 600, taxTotal: 120, total: 720, status: 'draft', transactionId: null, paymentTransactionId: null,
});

// Approved supplier bill with 20% VAT -> Dr COGS 950, Dr VAT 190, Cr AP 1140
const billTxn = tx(cafe.id, '2026-03-10', 'Bill BILL-0001', 'BILL-0001',
  [['5000', 950, 0], ['2100', 190, 0], ['2000', 0, 1140]], bookkeeper.id);
store.update('transactions', billTxn.id, { source: 'bill', sourceId: 'seed-bill-1' });
store.insert('invoices', {
  id: 'seed-bill-1', orgId: cafe.id, type: 'bill', contactId: greenBeans.id, number: 'BILL-0001',
  issueDate: '2026-03-10', dueDate: '2026-03-25',
  lines: [{ accountId: acc(cafe.id, '5000').id, description: 'Coffee beans', amount: 950, taxRateId: std20.id, tax: 190 }],
  subtotal: 950, taxTotal: 190, total: 1140, status: 'awaiting_payment', transactionId: billTxn.id, paymentTransactionId: null,
});

// A categorisation rule and a couple of action-list tasks
store.insert('rules', { orgId: cafe.id, match: 'Green Beans', accountId: acc(cafe.id, '5000').id, taxRateId: std20.id, kind: 'spend' });
store.insert('tasks', { orgId: cafe.id, text: 'Send March bank statement to bookkeeper', done: false, createdBy: bookkeeper.id, createdAt: new Date().toISOString() });
store.insert('tasks', { orgId: cafe.id, text: 'Confirm new espresso machine is a fixed asset', done: false, createdBy: bookkeeper.id, createdAt: new Date().toISOString() });

// --- ~800 varied transactions for Bright Cafe (stress-tests AI, coding & cashflow) ---
(function generateVolume() {
  let s = 987654321;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const amt = (lo, hi) => Math.round((lo + (hi - lo) * rnd()) * 100) / 100;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const db = store.load();
  const accId = (code) => acc(cafe.id, code).id;
  const push = (date, desc, lines) => {
    const trk = /catering|event|deliveroo|uber|just eat/i.test(desc) ? trkEvents.id : trkKitchen.id;
    const t = { id: store.id(), orgId: cafe.id, date, description: desc, reference: '', createdBy: bookkeeper.id, createdAt: new Date().toISOString(), status: 'posted', source: 'manual', sourceId: null, trackingId: trk };
    db.transactions.push(t);
    for (const [code, dr, cr] of lines) db.lines.push({ id: store.id(), transactionId: t.id, accountId: accId(code), debit: dr || 0, credit: cr || 0, reconciled: false });
  };
  const income = (date, desc, a) => push(date, desc, [['1000', a, 0], ['4000', 0, a]]);
  const spend = (date, desc, code, a) => push(date, desc, [[code, a, 0], ['1000', 0, a]]);

  // Varied vendor pools — recurring categories with many distinct supplier names.
  const beans = ['Green Beans Roastery', 'Bean Bros Wholesale', 'Roast & Co'];
  const dairy = ['Dairy Direct', 'Meadow Milk Co', 'Cotswold Creamery'];
  const bakery = ['Local Bakery', 'Sourdough & Sons', 'The Pastry House'];
  const produce = ['Fresh Produce Co', 'Market Greens', 'Orchard Supplies'];
  const utilities = [['Electricity — Southern Electric', 180, 320], ['Gas — British Gas', 90, 200], ['Broadband — BT Business', 45, 45], ['Energy — Octopus', 120, 240]];
  const marketing = ['Meta Ads', 'Google Ads', 'Instagram Boost', 'Flyer Print Co', 'Local Radio Spot'];
  const software = ['Xero subscription', 'Adobe subscription', 'Canva Pro', 'Microsoft 365', 'Dropbox', 'Slack'];
  const oneoffs = [['Equipment repair — FixIt', '6300', 60, 400], ['Staff training course', '6800', 90, 300], ['Train to London', '6800', 30, 95],
    ['Parking — NCP', '6300', 4, 18], ['Stationery — Ryman', '6300', 8, 45], ['Plants — GreenLeaf', '6300', 15, 60],
    ['First aid supplies', '6300', 12, 40], ['Uniform — Workwear Co', '6300', 40, 160], ['Locksmith callout', '6300', 70, 180],
    ['Pest control — BugOff', '6900', 60, 120], ['Signage — PrintWorks', '6500', 80, 350], ['Crockery — Catering Supplies', '6300', 50, 240]];

  const start = new Date('2026-01-01'), end = new Date('2026-06-11');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), dow = d.getDay(), dom = d.getDate(), mon = d.getMonth();
    // Daily sales (strong recurring signals)
    if (dow !== 0) { income(iso, 'Card sales', amt(180, 650)); income(iso, 'Contactless sales', amt(120, 480)); }
    if (dow === 0) income(iso, 'Card sales', amt(90, 260));
    if (dow === 5 || dow === 6) income(iso, 'Cash takings', amt(80, 320));
    // Delivery platform payouts (recurring, multiple platforms)
    if (dow === 1) income(iso, 'Deliveroo payout', amt(120, 400));
    if (dow === 2) income(iso, 'Uber Eats payout', amt(90, 320));
    if (dow === 4) income(iso, 'Just Eat payout', amt(80, 300));
    // Occasional larger sales
    if (chance(0.12)) income(iso, `Catering order — ${pick(['Acme', 'Riverside', 'office party', 'wedding', 'corporate'])}`, amt(200, 900));
    // Weekly stock (varied suppliers, shared product key)
    if (dow === 1) spend(iso, `Coffee beans — ${pick(beans)}`, '5000', amt(140, 260));
    if (dow === 3) spend(iso, `Milk — ${pick(dairy)}`, '5000', amt(60, 120));
    if (dow === 4) spend(iso, `Pastries — ${pick(bakery)}`, '5000', amt(70, 150));
    if (dow === 2 && chance(0.7)) spend(iso, `Fresh produce — ${pick(produce)}`, '5000', amt(40, 110));
    if (dow === 5) spend(iso, 'Staff wages', '6100', amt(900, 1500));
    // Monthly fixed/recurring
    if (dom === 1) spend(iso, 'Rent — Abbey Mill', '6000', 1800);
    if (dom === 2) { const u = pick(utilities); spend(iso, u[0], '6200', amt(u[1], u[2])); }
    if (dom === 9) { const u = utilities[(mon + 1) % utilities.length]; spend(iso, u[0], '6200', amt(u[1], u[2])); }
    if (dom === 5) spend(iso, 'Card fees — SumUp', '6400', amt(40, 110));
    if (dom === 6) spend(iso, `Marketing — ${pick(marketing)}`, '6500', amt(50, 250));
    if (dom === 7) spend(iso, 'Insurance — Hiscox', '6600', 65);
    if (dom === 8) spend(iso, `Software — ${pick(software)}`, '6700', amt(15, 60));
    if (dom === 10) spend(iso, 'Accountancy — Lumi', '6800', 180);
    if (dom === 12) spend(iso, `Cleaning — ${pick(['SparkleClean', 'Window Wizards'])}`, '6900', amt(70, 140));
    if (dom === 15 && mon % 3 === 0) spend(iso, 'Water — Southern Water', '6200', amt(80, 160));
    // Random one-off noise (mostly singletons — the AI should ignore these)
    if (chance(0.16)) { const o = pick(oneoffs); spend(iso, o[0], o[1], amt(o[2], o[3])); }
  }
  store.save();
})();

// --- Forward-dated open invoices & bills so the cashflow forecast has movements ---
(function futureItems() {
  const riverside = store.insert('contacts', { orgId: cafe.id, name: 'Riverside Events', kind: 'customer', email: 'accounts@riverside.test' });
  let invSeq = 3, billSeq = 2;
  const makeDoc = (type, contact, issue, due, net, code) => {
    const tax = Math.round(net * 20) / 100; const total = net + tax;
    const num = (type === 'invoice' ? 'INV-' : 'BILL-') + String(type === 'invoice' ? invSeq++ : billSeq++).padStart(4, '0');
    const id = 'seed-' + num;
    const lines = type === 'invoice'
      ? [['1100', total, 0], [code, 0, net], ['2100', 0, tax]]
      : [[code, net, 0], ['2100', tax, 0], ['2000', 0, total]];
    const t = tx(cafe.id, issue, `${type === 'invoice' ? 'Invoice' : 'Bill'} ${num}`, num, lines, bookkeeper.id);
    store.update('transactions', t.id, { source: type, sourceId: id });
    store.insert('invoices', {
      id, orgId: cafe.id, type, contactId: contact.id, number: num, issueDate: issue, dueDate: due,
      lines: [{ accountId: acc(cafe.id, code).id, description: '', amount: net, taxRateId: std20.id, tax }],
      subtotal: net, taxTotal: tax, total, status: 'awaiting_payment', transactionId: t.id, paymentTransactionId: null,
    });
  };
  makeDoc('invoice', acme, '2026-06-05', '2026-06-20', 1400, '4000');
  makeDoc('invoice', riverside, '2026-06-08', '2026-06-27', 2200, '4000');
  makeDoc('invoice', riverside, '2026-06-10', '2026-07-10', 900, '4000');
  makeDoc('invoice', acme, '2026-06-11', '2026-07-25', 1750, '4000');
  makeDoc('bill', greenBeans, '2026-06-06', '2026-06-18', 640, '5000');
  makeDoc('bill', greenBeans, '2026-06-09', '2026-07-01', 480, '5000');
})();

// --- Recurring templates ---
store.insert('recurring', { orgId: cafe.id, type: 'invoice', contactId: acme.id, description: 'Monthly catering retainer', accountId: acc(cafe.id, '4000').id, amount: 500, taxRateId: std20.id, frequency: 'monthly', nextDate: '2026-06-01', active: true, createdAt: new Date().toISOString() });
store.insert('recurring', { orgId: cafe.id, type: 'bill', contactId: greenBeans.id, description: 'Weekly bean delivery', accountId: acc(cafe.id, '5000').id, amount: 180, taxRateId: std20.id, frequency: 'weekly', nextDate: '2026-06-18', active: true, createdAt: new Date().toISOString() });

// --- Products & services ---
store.insert('items', { orgId: cafe.id, code: 'CAT-HR', name: 'Event catering (per hour)', description: 'On-site catering service', salePrice: 120, saleAccountId: acc(cafe.id, '4000').id, taxRateId: std20.id });
store.insert('items', { orgId: cafe.id, code: 'CART', name: 'Coffee cart hire (half day)', description: '', salePrice: 350, saleAccountId: acc(cafe.id, '4000').id, taxRateId: std20.id });
store.insert('items', { orgId: cafe.id, code: 'BEANS-1KG', name: 'Retail coffee beans 1kg', description: '', salePrice: 18, saleAccountId: acc(cafe.id, '4000').id, taxRateId: std20.id, trackQty: true, qtyOnHand: 8, reorderLevel: 10 });

// --- Quotes ---
store.insert('invoices', { orgId: cafe.id, type: 'quote', contactId: acme.id, number: 'QUO-0001', issueDate: '2026-06-05', dueDate: '2026-07-05', lines: [{ accountId: acc(cafe.id, '4000').id, description: 'Summer event catering', amount: 2400, taxRateId: std20.id, tax: 480 }], subtotal: 2400, taxTotal: 480, total: 2880, status: 'sent', transactionId: null, paymentTransactionId: null });
store.insert('invoices', { orgId: cafe.id, type: 'quote', contactId: acme.id, number: 'QUO-0002', issueDate: '2026-06-09', dueDate: '2026-07-09', lines: [{ accountId: acc(cafe.id, '4000').id, description: 'Coffee cart hire', amount: 600, taxRateId: std20.id, tax: 120 }], subtotal: 600, taxTotal: 120, total: 720, status: 'draft', transactionId: null, paymentTransactionId: null });

// --- Expense claims ---
store.insert('expenseClaims', { orgId: cafe.id, claimant: 'Sam Carter', date: '2026-06-09', description: 'Taxi to supplier meeting', accountId: acc(cafe.id, '6300').id, amount: 24, taxRateId: std20.id, status: 'submitted', transactionId: null, createdBy: client.id, createdAt: new Date().toISOString() });
store.insert('expenseClaims', { orgId: cafe.id, claimant: 'Priya Shah', date: '2026-06-05', description: 'Cleaning supplies (paid cash)', accountId: acc(cafe.id, '6900').id, amount: 42, taxRateId: std20.id, status: 'approved', transactionId: null, createdBy: client.id, createdAt: new Date().toISOString() });

// --- Purchase order ---
store.insert('invoices', { orgId: cafe.id, type: 'po', contactId: greenBeans.id, number: 'PO-0001', issueDate: '2026-06-08', dueDate: '2026-06-22', lines: [{ accountId: acc(cafe.id, '5000').id, description: 'Bulk coffee beans order', amount: 1200, taxRateId: std20.id, tax: 240 }], subtotal: 1200, taxTotal: 240, total: 1440, status: 'sent', transactionId: null, paymentTransactionId: null });

// --- Payroll: employees ---
store.insert('employees', { orgId: cafe.id, name: 'Sam Carter', niNumber: 'AB123456C', annualSalary: 28000, taxCode: '1257L', niCategory: 'A', payFrequency: 'monthly', active: true });
store.insert('employees', { orgId: cafe.id, name: 'Priya Shah', niNumber: 'CD654321B', annualSalary: 24000, taxCode: '1257L', niCategory: 'A', payFrequency: 'monthly', active: true });
store.insert('employees', { orgId: cafe.id, name: 'Mia Owens', niNumber: 'EF112233A', annualSalary: 52000, taxCode: '1257L', niCategory: 'A', payFrequency: 'monthly', active: true });

// --- Client business 2: Maple Design ---
const studio = store.insert('organizations', { name: 'Maple Design Studio', createdAt: new Date().toISOString() });
seedChart(studio.id);
seedTaxRates(studio.id);
store.insert('memberships', { userId: bookkeeper.id, orgId: studio.id, role: 'admin' });

tx(studio.id, '2026-01-02', 'Owner capital', 'CAP-01',
  [['1000', 8000, 0], ['3000', 0, 8000]], bookkeeper.id);
tx(studio.id, '2026-02-20', 'Design project invoice — Acme', 'INV-1001',
  [['1100', 5400, 0], ['4000', 0, 5400]], bookkeeper.id);
tx(studio.id, '2026-03-01', 'Software subscriptions', 'EXP-31',
  [['6300', 420, 0], ['1000', 0, 420]], bookkeeper.id);

console.log('Seed complete.');
console.log('  Bookkeeper login:  bookkeeper@lumi.app  /  demo1234   (sees both clients)');
console.log('  Client login:      client@lumi.app      /  demo1234   (sees Bright Cafe only)');
