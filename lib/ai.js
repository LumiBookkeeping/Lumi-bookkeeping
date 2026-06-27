// Lightweight, on-device "assistant" that learns categorisation patterns from the
// existing ledger and proposes rules for review. Deterministic and explainable —
// no external model required (can be upgraded to an LLM later).
const store = require('./store');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
const STOP = new Set([...MONTHS, 'payment', 'payments', 'invoice', 'bill', 'purchase', 'purchases',
  'the', 'from', 'for', 'and', 'ltd', 'limited', 'co', 'inv', 'to', 'of', 'monthly', 'opening', 'misc', 'general']);

// Built-in UK VAT treatment defaults. Returns the name of one of the standard
// tax rates seeded per org. A conservative simplification — always flagged "confirm".
function legislativeTreatment(text) {
  const s = String(text || '').toLowerCase();
  // Exempt or outside the scope of VAT
  if (/wage|salar|payroll|paye|pension|dividend|drawings/.test(s)) return 'No VAT';
  if (/\brent\b|lease|landlord/.test(s)) return 'No VAT';            // commercial rent exempt unless opted to tax
  if (/insurance/.test(s)) return 'No VAT';
  if (/bank fee|bank charge|\binterest\b|finance charge|loan|card fee|merchant fee/.test(s)) return 'No VAT';
  if (/business rates|council tax|\bhmrc\b|\bvat\b|corporation tax/.test(s)) return 'No VAT';
  // Zero-rated (most cold food, books, newspapers, public transport, children's clothing)
  if (/food|milk|bean|bakery|pastr|produce|grocer|fruit|veg|meat|bread|book|newspaper|magazine|child/.test(s)) return 'Zero-rated 0%';
  // Reduced 5% (domestic fuel & power, energy-saving)
  if (/domestic|residential/.test(s) && /fuel|power|electric|gas|energy|heating/.test(s)) return 'Reduced 5%';
  // Default: most goods and services
  return 'Standard 20%';
}

// Reduce a description to a short, distinctive key (1–2 significant words).
function deriveKey(desc) {
  const tokens = String(desc || '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  return tokens.slice(0, 2).join(' ');
}

// Propose categorisation rules from recurring descriptions not yet covered by a rule.
function suggestRules(orgId) {
  const accounts = store.filter('accounts', (a) => a.orgId === orgId);
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const rules = store.filter('rules', (r) => r.orgId === orgId);
  const dismissed = new Set(store.filter('aiDismissed', (d) => d.orgId === orgId).map((d) => d.match));
  const txns = store.filter('transactions', (t) => t.orgId === orgId && t.status !== 'void');
  const taxRates = store.filter('taxRates', (t) => t.orgId === orgId && !t.archived);
  const rateByName = new Map(taxRates.map((t) => [t.name, t]));
  const vatAcc = accounts.find((a) => a.code === '2100' && !a.archived);

  // Infer the VAT rate a group has historically carried (only 5%/20%, since 0% is
  // ambiguous between zero-rated and outside-scope). Returns a rate name or null.
  const historicVatName = (txnIds, catAccountId) => {
    if (!vatAcc) return null;
    const counts = {};
    for (const tid of txnIds) {
      const lines = store.filter('lines', (l) => l.transactionId === tid);
      const vatLine = lines.find((l) => l.accountId === vatAcc.id);
      const catLine = lines.find((l) => l.accountId === catAccountId);
      if (!vatLine || !catLine) continue;
      const tax = Math.abs(Number(vatLine.debit || 0) + Number(vatLine.credit || 0));
      const net = Math.abs(Number(catLine.debit || 0) + Number(catLine.credit || 0));
      if (!net) continue;
      const pct = Math.round((tax / net) * 100);
      const name = pct >= 18 ? 'Standard 20%' : pct >= 3 ? 'Reduced 5%' : null;
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    let best = null, n = 0;
    for (const k of Object.keys(counts)) if (counts[k] > n) { best = k; n = counts[k]; }
    return best;
  };

  const groups = new Map(); // key -> { counts:Map<accountId,n>, descs:Set, txnIds:[] }
  for (const t of txns) {
    const key = deriveKey(t.description);
    if (!key) continue;
    const lines = store.filter('lines', (l) => l.transactionId === t.id);
    const catLine = lines.find((l) => {
      const a = accById.get(l.accountId);
      return a && (a.type === 'income' || a.type === 'expense');
    });
    if (!catLine) continue;
    if (!groups.has(key)) groups.set(key, { counts: new Map(), descs: new Set(), txnIds: [] });
    const g = groups.get(key);
    g.counts.set(catLine.accountId, (g.counts.get(catLine.accountId) || 0) + 1);
    g.descs.add(t.description);
    g.txnIds.push(t.id);
  }

  const out = [];
  for (const [key, g] of groups) {
    if (dismissed.has(key)) continue;
    // Skip if an existing rule already covers this key (either direction of containment).
    if (rules.some((r) => {
      const m = r.match.toLowerCase();
      return key.includes(m) || m.includes(key);
    })) continue;
    // Dominant category account for the group.
    let best = null, bestN = 0, total = 0;
    for (const [aid, n] of g.counts) { total += n; if (n > bestN) { best = aid; bestN = n; } }
    const acc = accById.get(best);
    if (!acc) continue;
    // Recommend a VAT rate: history first, else the built-in UK legislative default.
    let taxName = historicVatName(g.txnIds, best);
    let taxSource = taxName ? 'history' : 'legislation';
    if (!taxName) taxName = legislativeTreatment(`${acc.name} ${key}`);
    const taxRate = rateByName.get(taxName) || null;
    out.push({
      id: 'ai_' + Buffer.from(key).toString('hex').slice(0, 12),
      match: key,
      accountId: best,
      accountCode: acc.code,
      accountName: acc.name,
      accountType: acc.type,
      kind: acc.type === 'income' ? 'receive' : 'spend',
      count: g.txnIds.length,
      confidence: total ? Math.round((bestN / total) * 100) : 100,
      samples: [...g.descs].slice(0, 3),
      taxRateId: taxRate ? taxRate.id : null,
      taxRateName: taxName,
      taxSource,
    });
  }
  out.sort((a, b) => b.count - a.count || b.confidence - a.confidence);
  return out.slice(0, 12);
}

// ---- Cashflow scenario note parser ----
// Reads a plain-English note about upcoming events and proposes editable cashflow
// adjustments {label, amount, direction, date}. Heuristic and deterministic — it
// suggests; the user reviews and confirms. Not a substitute for an LLM, but honest.
const NUMWORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };

function wordNum(w) {
  if (w == null) return null;
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  return NUMWORD[w.toLowerCase()] != null ? NUMWORD[w.toLowerCase()] : null;
}

function parseAmount(clause) {
  const re = /£\s?([\d,]+(?:\.\d{1,2})?)\s*(k|m|thousand|million|grand)?|\b([\d,]+(?:\.\d{1,2})?)\s*(k|m|thousand|million|grand|pounds|gbp)\b/i;
  const m = clause.match(re);
  if (!m) return null;
  const numStr = m[1] || m[3];
  const mult = (m[2] || m[4] || '').toLowerCase();
  let val = parseFloat(String(numStr).replace(/,/g, ''));
  if (isNaN(val)) return null;
  if (mult === 'k' || mult === 'thousand' || mult === 'grand') val *= 1000;
  else if (mult === 'm' || mult === 'million') val *= 1000000;
  return Math.round(val * 100) / 100;
}

function unitDays(u) { return u === 'day' ? 1 : u === 'week' ? 7 : 30; }

function timeframe(clause) {
  const s = clause.toLowerCase();
  let m;
  // "X weeks before / in advance / beforehand / ahead / prior"
  if ((m = s.match(/(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\s*(day|week|month)s?\s*(?:before|in advance|beforehand|ahead|prior|earlier)/))) {
    return { kind: 'before', days: (wordNum(m[1]) || 1) * unitDays(m[2]) };
  }
  if (/(before|in advance|beforehand|ahead of|prior|earlier)/.test(s) && /(day|week|month)/.test(s)) {
    const u = s.match(/(day|week|month)/)[1];
    return { kind: 'before', days: unitDays(u) };
  }
  if (/beforehand|in advance/.test(s)) return { kind: 'before', days: 7 };
  // future references
  if (/tomorrow/.test(s)) return { kind: 'future', days: 1 };
  if (/\btoday\b|right now|\bnow\b/.test(s)) return { kind: 'future', days: 0 };
  if ((m = s.match(/in\s*(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\s*(day|week|month)s?/))) {
    return { kind: 'future', days: (wordNum(m[1]) || 1) * unitDays(m[2]) };
  }
  if ((m = s.match(/(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\s*(day|week|month)s?(?:'?s)?\s*(?:time|from now|away|out)/))) {
    return { kind: 'future', days: (wordNum(m[1]) || 1) * unitDays(m[2]) };
  }
  if (/next week/.test(s)) return { kind: 'future', days: 7 };
  if (/next month/.test(s)) return { kind: 'future', days: 30 };
  return null;
}

const IN_WORDS = /earn|revenue|receive|deposit|income|sales|takings|paid|grant|refund|funding|rebate|collect|bring|turnover|won|booking|in from/;
const OUT_WORDS = /buy|purchas|\bpay\b|paying|spend|cost|suppl|expense|\bbill\b|wage|salar|\brent\b|stock|outlay|invest|order|outgoing|owe/;
function noteDirection(clause) {
  const s = clause.toLowerCase();
  const inHit = IN_WORDS.test(s), outHit = OUT_WORDS.test(s);
  if (inHit && !outHit) return 'in';
  if (outHit && !inHit) return 'out';
  if (inHit && outHit) return s.search(OUT_WORDS) < s.search(IN_WORDS) ? 'out' : 'in';
  return 'in';
}

function noteLabel(clause, dir) {
  const s = clause.toLowerCase();
  if (/event|festival|fair|wedding|conference|show/.test(s)) return dir === 'in' ? 'Event revenue' : 'Event costs';
  if (/suppl/.test(s)) return 'Supplies';
  if (/deposit/.test(s)) return 'Deposits';
  if (/stock|inventory|ingredient/.test(s)) return 'Stock purchase';
  if (/wage|salar|payroll|staff/.test(s)) return 'Wages';
  if (/\brent\b/.test(s)) return 'Rent';
  if (/tax|vat|hmrc|paye/.test(s)) return 'Tax payment';
  if (/equipment|machine|kit|fit-?out|refurb/.test(s)) return 'Equipment';
  if (/grant|funding/.test(s)) return 'Grant / funding';
  if (/refund|rebate/.test(s)) return 'Refund';
  return dir === 'in' ? 'Expected income' : 'Expected payment';
}

function parseCashflowNote(text, todayStr) {
  const today = new Date(todayStr);
  const clauses = String(text || '')
    .split(/[.;\n]|\band then\b|\band\b|,|\bbut\b|\bthen\b/i)
    .map((c) => c.trim()).filter(Boolean);
  const interim = clauses
    .map((c) => ({ c, amt: parseAmount(c), dir: noteDirection(c), tf: timeframe(c) }))
    .filter((x) => x.amt != null && x.amt > 0);
  const anchor = interim.find((x) => x.tf && x.tf.kind === 'future');
  const anchorDays = anchor ? anchor.tf.days : 0;
  return interim.map((x) => {
    let days = 0;
    if (x.tf) days = x.tf.kind === 'future' ? x.tf.days : anchorDays - x.tf.days;
    if (days < 0) days = 0;
    const d = new Date(today.getTime() + days * 86400000);
    // Confidence: clear when both a £ amount and an explicit timeframe are present and
    // the in/out direction is unambiguous; lower when timing or direction had to be guessed.
    const s = x.c.toLowerCase();
    const dirCertain = IN_WORDS.test(s) !== OUT_WORDS.test(s);
    const tfCertain = !!x.tf;
    const confidence = (tfCertain && dirCertain) ? 'high' : (tfCertain || dirCertain) ? 'medium' : 'low';
    return { label: noteLabel(x.c, x.dir), amount: x.amt, direction: x.dir, date: d.toISOString().slice(0, 10), confidence, snippet: x.c.slice(0, 90) };
  });
}

module.exports = { deriveKey, suggestRules, legislativeTreatment, parseCashflowNote };
