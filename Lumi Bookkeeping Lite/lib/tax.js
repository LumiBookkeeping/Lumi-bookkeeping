// Plain-English tax engine for sole traders.
// Figures use the frozen 2026/27 UK thresholds (Personal Allowance and the basic-rate
// band are frozen through to 2027/28). Update CONST below if HMRC figures change.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TAX = {
  year: '2026/27',
  personalAllowance: 12570,        // tax-free amount
  paTaperStart: 100000,            // PA reduced £1 per £2 over this; gone at £125,140
  basicRateLimit: 37700,           // taxable income above PA taxed at 20% up to here
  higherRateLimit: 125140,         // 40% band ends here
  basicRate: 0.20, higherRate: 0.40, additionalRate: 0.45,
  // Class 4 National Insurance (self-employed profits)
  class4Lower: 12570, class4Upper: 50270, class4Main: 0.06, class4Upper2: 0.02,
  // Class 2 NIC is no longer mandatory from 2024/25 (credits given above the small
  // profits threshold without payment). Shown as £0 with a note.
  smallProfitsThreshold: 6725,
  // VAT
  vatRegistrationThreshold: 90000,
  // MTD for Income Tax qualifying-income threshold (mandation from Apr 2026)
  mtdItsaThreshold: 50000,
};

// Personal allowance after the high-income taper.
function personalAllowance(totalIncome) {
  if (totalIncome <= TAX.paTaperStart) return TAX.personalAllowance;
  const reduction = Math.floor((totalIncome - TAX.paTaperStart) / 2);
  return Math.max(0, TAX.personalAllowance - reduction);
}

// Income tax on a given taxable income (self-employment profit + any other income).
function incomeTax(totalIncome) {
  const pa = personalAllowance(totalIncome);
  const taxable = Math.max(0, totalIncome - pa);
  let tax = 0;
  const basicBand = TAX.basicRateLimit;                       // width of 20% band
  const higherBand = TAX.higherRateLimit - TAX.personalAllowance - TAX.basicRateLimit; // approx width of 40% band
  const inBasic = Math.min(taxable, basicBand);
  tax += inBasic * TAX.basicRate;
  const afterBasic = Math.max(0, taxable - basicBand);
  const inHigher = Math.min(afterBasic, Math.max(0, higherBand));
  tax += inHigher * TAX.higherRate;
  const inAdditional = Math.max(0, afterBasic - Math.max(0, higherBand));
  tax += inAdditional * TAX.additionalRate;
  return { pa, taxable, tax: round2(tax), bands: { basic: round2(inBasic), higher: round2(inHigher), additional: round2(inAdditional) } };
}

// Class 4 National Insurance on self-employment profit.
function class4(profit) {
  if (profit <= TAX.class4Lower) return 0;
  const main = Math.min(profit, TAX.class4Upper) - TAX.class4Lower;
  const upper = Math.max(0, profit - TAX.class4Upper);
  return round2(main * TAX.class4Main + upper * TAX.class4Upper2);
}

// Full estimate: tax + NIC for a sole trader on a given profit (+ optional other income).
function estimate(profit, otherIncome = 0) {
  profit = Math.max(0, round2(profit));
  const total = profit + Math.max(0, otherIncome);
  const it = incomeTax(total);
  const c4 = class4(profit);
  const c2 = 0; // not mandatory from 2024/25
  const totalDue = round2(it.tax + c4 + c2);
  const setAsidePct = profit > 0 ? Math.min(60, Math.ceil((totalDue / profit) * 100)) : 0;
  return {
    year: TAX.year, profit, otherIncome: Math.max(0, otherIncome), totalIncome: total,
    personalAllowance: it.pa, taxableIncome: it.taxable, incomeTax: it.tax, bands: it.bands,
    class4: c4, class2: c2, totalDue, setAsidePct,
    payOnAccount: round2(totalDue / 2),
  };
}

// VAT return boxes (cash basis) from a list of entries within a period.
function vatBoxes(entries) {
  let box1 = 0, box4 = 0, box6 = 0, box7 = 0;
  for (const e of entries) {
    if (e.direction === 'in') { box1 += Number(e.vat || 0); box6 += Number(e.net || 0); }
    else { box4 += Number(e.vat || 0); box7 += Number(e.net || 0); }
  }
  const b1 = round2(box1), b4 = round2(box4);
  return {
    box1: b1, box2: 0, box3: b1, box4: b4, box5: round2(b1 - b4),
    box6: Math.round(box6), box7: Math.round(box7), box8: 0, box9: 0,
  };
}

// The four standard MTD quarterly update periods for a tax year (e.g. taxYearStart=2026
// means 6 Apr 2026 – 5 Apr 2027), with submission deadlines.
function mtdQuarters(taxYearStart) {
  const y = taxYearStart;
  const q = (fromY, fromM, fromD, toY, toM, toD, dlY, dlM, dlD, n) => ({
    quarter: n,
    from: `${fromY}-${String(fromM).padStart(2, '0')}-${String(fromD).padStart(2, '0')}`,
    to: `${toY}-${String(toM).padStart(2, '0')}-${String(toD).padStart(2, '0')}`,
    deadline: `${dlY}-${String(dlM).padStart(2, '0')}-${String(dlD).padStart(2, '0')}`,
  });
  return [
    q(y, 4, 6, y, 7, 5, y, 8, 7, 1),
    q(y, 7, 6, y, 10, 5, y, 11, 7, 2),
    q(y, 10, 6, y + 1, 1, 5, y + 1, 2, 7, 3),
    q(y + 1, 1, 6, y + 1, 4, 5, y + 1, 5, 7, 4),
  ];
}

// Which tax year a date falls in (returns the starting calendar year, 6 Apr boundary).
function taxYearOf(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const boundary = new Date(`${y}-04-06`);
  return d < boundary ? y - 1 : y;
}
function taxYearLabel(start) { return `${start}/${String((start + 1) % 100).padStart(2, '0')}`; }

module.exports = { TAX, round2, personalAllowance, incomeTax, class4, estimate, vatBoxes, mtdQuarters, taxYearOf, taxYearLabel };
