// Seed a demo sole trader so the app has something to show.
// Run: npm run seed   (clears and recreates the demo data)
const bcrypt = require('bcryptjs');
const store = require('./../lib/store');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function split(gross, rate) { const net = round2(gross / (1 + rate / 100)); return { net, vat: round2(gross - net) }; }
function iso(d) { return d.toISOString().slice(0, 10); }

// Reset in memory, then save.
const db = store.load();
for (const k of Object.keys(db)) db[k] = [];
store.save();

const user = store.insert('users', { name: 'Sam Taylor', email: 'sam@demo.app', passwordHash: bcrypt.hashSync('demo1234', 10), role: 'trader' });
const business = store.insert('businesses', {
  name: "Sam's Plumbing", ownerName: 'Sam Taylor', tradeType: 'Plumber', basis: 'cash',
  vatRegistered: true, vatNumber: 'GB 218 4471 02', vatScheme: 'standard', utr: '1234567890', createdAt: new Date().toISOString(),
});
store.insert('memberships', { userId: user.id, businessId: business.id, role: 'owner' });

const expenseMix = [
  ['stock', 'Materials from the merchant', 20],
  ['travel', 'Fuel', 20],
  ['office', 'Mobile phone bill', 20],
  ['insurance', 'Public liability insurance', 0],
  ['professional', 'Accountant fee', 20],
  ['advertising', 'Local advert', 20],
];
const start = new Date('2025-10-06');
const end = new Date('2026-06-10');
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const day = d.getDay();
  // Sales most weekdays
  if (day >= 1 && day <= 5 && rnd() > 0.35) {
    const gross = round2(300 + rnd() * 900);
    const { net, vat } = split(gross, 20);
    store.insert('entries', { businessId: business.id, date: iso(d), direction: 'in', category: 'sales', description: 'Job — ' + ['boiler service', 'leak repair', 'bathroom fit', 'tap replacement', 'radiator install'][Math.floor(rnd() * 5)], gross, vatRate: 20, net, vat, method: 'bank', attachmentId: null, createdAt: new Date().toISOString() });
  }
  // Occasional expense
  if (rnd() > 0.78) {
    const [cat, desc, rate] = expenseMix[Math.floor(rnd() * expenseMix.length)];
    const gross = round2(40 + rnd() * 420);
    const { net, vat } = split(gross, rate);
    store.insert('entries', { businessId: business.id, date: iso(d), direction: 'out', category: cat, description: desc, gross, vatRate: rate, net, vat, method: 'card', attachmentId: null, createdAt: new Date().toISOString() });
  }
}

// A couple of mileage trips
for (const [date, miles, purpose] of [['2026-05-12', 38, 'Job in Winchester'], ['2026-05-20', 22, 'Merchant run'], ['2026-06-03', 54, 'Emergency callout']]) {
  const rate = 0.55, amount = round2(miles * rate);
  const m = store.insert('mileage', { businessId: business.id, date, miles, vehicle: 'van', purpose, rate, amount });
  store.insert('entries', { businessId: business.id, date, direction: 'out', category: 'travel', description: `Mileage — ${miles} miles (${purpose})`, gross: amount, vatRate: 0, net: amount, vat: 0, method: 'mileage', attachmentId: null, createdAt: new Date().toISOString(), mileageId: m.id });
}

// An open invoice
store.insert('invoices', { businessId: business.id, number: 'INV-001', customerName: 'Mrs Albright', customerEmail: 'albright@example.com', issueDate: '2026-06-05', dueDate: '2026-06-19', lines: [{ description: 'New bathroom installation', amount: 2400, vatRate: 20, vat: 480 }], net: 2400, vat: 480, total: 2880, status: 'sent' });

const counts = Object.fromEntries(Object.keys(db).map((k) => [k, db[k].length]));
console.log('Seeded Lumi Lite demo:', JSON.stringify(counts));
console.log('Login: sam@demo.app / demo1234');
