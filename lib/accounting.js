// Double-entry accounting logic and financial reports.
const store = require('./store');

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

// Normal balance side per account type. Debit-normal => balance = debits - credits.
const DEBIT_NORMAL = new Set(['asset', 'expense']);

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// All posted lines for an org, joined with their transaction, optionally filtered by date.
function orgLines(orgId, { from, to } = {}) {
  // Voided transactions are excluded from all reports.
  const txns = store.filter('transactions', (t) => t.orgId === orgId && t.status !== 'void');
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const result = [];
  for (const line of store.all('lines')) {
    const txn = txnById.get(line.transactionId);
    if (!txn) continue;
    if (from && txn.date < from) continue;
    if (to && txn.date > to) continue;
    result.push({ ...line, date: txn.date, description: txn.description, source: txn.source });
  }
  return result;
}

// Net balance for one account in its NORMAL direction (always >= 0 for normal accounts).
function accountBalance(account, lines) {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (l.accountId !== account.id) continue;
    debit += Number(l.debit || 0);
    credit += Number(l.credit || 0);
  }
  const signed = DEBIT_NORMAL.has(account.type) ? debit - credit : credit - debit;
  return { debit: round2(debit), credit: round2(credit), balance: round2(signed) };
}

function chartOfAccounts(orgId) {
  return store
    .filter('accounts', (a) => a.orgId === orgId && !a.archived)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

// A "ledger" is the data a report runs on: the chart of accounts plus every
// posted line for the org (each carrying its transaction's date/source). Build
// it synchronously from the cache for an orgId (tests, write paths), or pass a
// pre-loaded one (e.g. fetched via SQL in a route) straight through.
function ledgerFor(orgId) {
  return { accounts: chartOfAccounts(orgId), lines: orgLines(orgId) };
}
function asLedger(src) {
  return typeof src === 'string' ? ledgerFor(src) : src;
}
function inPeriod(lines, { from, to } = {}) {
  return lines.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
}

// TRIAL BALANCE — every account with its raw debit/credit totals as at a date.
function trialBalance(src, asOf) {
  const { accounts, lines: all } = asLedger(src);
  const lines = inPeriod(all, { to: asOf });
  const rows = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const acc of accounts) {
    const b = accountBalance(acc, lines);
    if (b.debit === 0 && b.credit === 0) continue;
    // Net each account to a single side for a clean trial balance.
    const net = round2(b.debit - b.credit);
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    totalDebit += debit;
    totalCredit += credit;
    rows.push({ accountId: acc.id, code: acc.code, name: acc.name, type: acc.type, debit, credit });
  }
  return {
    asOf,
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    balanced: round2(totalDebit) === round2(totalCredit),
  };
}

// PROFIT & LOSS — income less expenses over a period.
function profitAndLoss(src, from, to) {
  const { accounts, lines: all } = asLedger(src);
  const lines = inPeriod(all, { from, to });
  const income = [];
  const expenses = [];
  let totalIncome = 0;
  let totalExpense = 0;
  for (const acc of accounts) {
    if (acc.type !== 'income' && acc.type !== 'expense') continue;
    const b = accountBalance(acc, lines);
    if (b.balance === 0) continue;
    if (acc.type === 'income') {
      income.push({ accountId: acc.id, code: acc.code, name: acc.name, amount: b.balance });
      totalIncome += b.balance;
    } else {
      expenses.push({ accountId: acc.id, code: acc.code, name: acc.name, amount: b.balance });
      totalExpense += b.balance;
    }
  }
  return {
    from,
    to,
    income,
    expenses,
    totalIncome: round2(totalIncome),
    totalExpense: round2(totalExpense),
    netProfit: round2(totalIncome - totalExpense),
  };
}

// BALANCE SHEET — assets = liabilities + equity (incl. current earnings) as at a date.
function balanceSheet(src, asOf) {
  const { accounts, lines: all } = asLedger(src);
  const lines = inPeriod(all, { to: asOf });
  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const acc of accounts) {
    const b = accountBalance(acc, lines);
    if (acc.type === 'asset') {
      if (b.balance !== 0) assets.push({ accountId: acc.id, code: acc.code, name: acc.name, amount: b.balance });
      totalAssets += b.balance;
    } else if (acc.type === 'liability') {
      if (b.balance !== 0) liabilities.push({ accountId: acc.id, code: acc.code, name: acc.name, amount: b.balance });
      totalLiabilities += b.balance;
    } else if (acc.type === 'equity') {
      if (b.balance !== 0) equity.push({ accountId: acc.id, code: acc.code, name: acc.name, amount: b.balance });
      totalEquity += b.balance;
    } else if (acc.type === 'income') {
      totalIncome += b.balance;
    } else if (acc.type === 'expense') {
      totalExpense += b.balance;
    }
  }

  const currentEarnings = round2(totalIncome - totalExpense);
  if (currentEarnings !== 0) {
    equity.push({ code: '—', name: 'Current period earnings', amount: currentEarnings });
    totalEquity += currentEarnings;
  }

  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    totalEquity: round2(totalEquity),
    balanced: round2(totalAssets) === round2(totalLiabilities + totalEquity),
  };
}

// Validate a transaction's lines balance before posting.
function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return 'A transaction needs at least two lines (one debit and one credit).';
  }
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    const d = Number(l.debit || 0);
    const c = Number(l.credit || 0);
    if (d < 0 || c < 0) return 'Amounts cannot be negative.';
    if (d > 0 && c > 0) return 'A line can be either a debit or a credit, not both.';
    if (d === 0 && c === 0) return 'Each line needs a debit or credit amount.';
    debit += d;
    credit += c;
  }
  if (round2(debit) !== round2(credit)) {
    return `Debits (${round2(debit)}) must equal credits (${round2(credit)}).`;
  }
  return null;
}

// A date is locked if it falls on or before the org's lock date.
function isLocked(org, date) {
  return !!(org && org.lockDate && date && date <= org.lockDate);
}

function accountByCode(orgId, code) {
  return store.find('accounts', (a) => a.orgId === orgId && a.code === code && !a.archived);
}

// VAT control account movements over a period.
// Output tax (on sales) is credited to the account; input tax (on purchases) is debited.
function vatReturn(src, from, to, vatCode = '2100') {
  const { accounts, lines: all } = asLedger(src);
  const vat = accounts.find((a) => a.code === vatCode);
  const out = { from, to, outputTax: 0, inputTax: 0, netDue: 0, hasAccount: !!vat };
  if (!vat) return out;
  const lines = inPeriod(all, { from, to }).filter((l) => l.accountId === vat.id);
  let credit = 0, debit = 0;
  for (const l of lines) { credit += Number(l.credit || 0); debit += Number(l.debit || 0); }
  out.outputTax = round2(credit);  // VAT charged on sales
  out.inputTax = round2(debit);    // VAT reclaimed on purchases
  out.netDue = round2(credit - debit); // positive = pay HMRC, negative = refund
  return out;
}

// Live VAT position: net balance of the VAT account as at a date (credit balance = owed).
function vatPosition(src, asOf, vatCode = '2100') {
  const { accounts, lines: all } = asLedger(src);
  const vat = accounts.find((a) => a.code === vatCode);
  if (!vat) return { net: 0, owed: 0, refund: 0, hasAccount: false };
  const lines = inPeriod(all, { to: asOf }).filter((l) => l.accountId === vat.id);
  let credit = 0, debit = 0;
  for (const l of lines) { credit += Number(l.credit || 0); debit += Number(l.debit || 0); }
  const net = round2(credit - debit);
  return { net, owed: net > 0 ? net : 0, refund: net < 0 ? -net : 0, hasAccount: true };
}

// VAT return supporting accrual, cash and flat-rate schemes, laid out as UK boxes 1–9.
function vatReturnBoxed(orgId, from, to, scheme = 'accrual', flatRate = 0, vatCode = '2100') {
  const vat = accountByCode(orgId, vatCode);
  const pl = profitAndLoss(orgId, from, to);
  const netSales = pl.totalIncome;      // Box 6 (net)
  const netPurchases = pl.totalExpense; // Box 7 (net)
  let output = 0, input = 0;

  if (vat) {
    const txns = store.filter('transactions', (t) => t.orgId === orgId && t.status !== 'void');
    const txnById = new Map(txns.map((t) => [t.id, t]));
    const vatLines = store.filter('lines', (l) => l.accountId === vat.id)
      .map((l) => ({ ...l, txn: txnById.get(l.transactionId) }))
      .filter((l) => l.txn && l.txn.date >= from && l.txn.date <= to);

    if (scheme === 'accrual') {
      for (const l of vatLines) { output += Number(l.credit || 0); input += Number(l.debit || 0); }
    } else if (scheme === 'cash') {
      // Cash basis: cash/bank VAT entries count when they happen; invoice/bill VAT counts when paid.
      for (const l of vatLines) {
        if (l.txn.source === 'invoice' || l.txn.source === 'bill') continue; // accrual recognition — exclude
        output += Number(l.credit || 0); input += Number(l.debit || 0);
      }
      const invoices = store.filter('invoices', (x) => x.orgId === orgId && x.status === 'paid');
      for (const inv of invoices) {
        const payTxn = inv.paymentTransactionId ? store.byId('transactions', inv.paymentTransactionId) : null;
        if (!payTxn || payTxn.date < from || payTxn.date > to) continue;
        if (inv.type === 'invoice') output += Number(inv.taxTotal || 0);
        else input += Number(inv.taxTotal || 0);
      }
    } else if (scheme === 'flat') {
      // Flat rate: a fixed % of gross (VAT-inclusive) turnover; input VAT not generally reclaimable.
      let accrualOutput = 0;
      for (const l of vatLines) accrualOutput += Number(l.credit || 0);
      const grossTurnover = round2(netSales + accrualOutput);
      output = round2(grossTurnover * (Number(flatRate) || 0) / 100);
      input = 0;
    }
  }
  output = round2(output); input = round2(input);
  return {
    scheme, flatRate: Number(flatRate) || 0, from, to,
    box1: output, box2: 0, box3: output, box4: input, box5: round2(output - input),
    box6: round2(netSales), box7: round2(netPurchases), box8: 0, box9: 0,
    hasAccount: !!vat,
  };
}

// Estimated UK corporation tax with marginal relief (no associated companies assumed).
function corporationTaxEstimate(profit) {
  const p = Math.max(0, round2(profit));
  const SMALL = 50000, UPPER = 250000, SMALL_RATE = 0.19, MAIN_RATE = 0.25, MR_FRACTION = 3 / 200;
  let tax, effectiveRate;
  if (p <= SMALL) { tax = p * SMALL_RATE; }
  else if (p >= UPPER) { tax = p * MAIN_RATE; }
  else { tax = p * MAIN_RATE - (UPPER - p) * MR_FRACTION; }
  tax = round2(tax);
  effectiveRate = p > 0 ? round2((tax / p) * 100) : 0;
  return { profit: p, tax, effectiveRate };
}

module.exports = {
  TYPES,
  round2,
  isLocked,
  accountByCode,
  vatReturn,
  vatReturnBoxed,
  vatPosition,
  corporationTaxEstimate,
  chartOfAccounts,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  validateLines,
  accountBalance,
  orgLines,
};
