// Simplified UK PAYE / National Insurance calculation for a single pay period.
// Uses approximate 2024/25 thresholds — an estimate to be reviewed, not an
// HMRC-recognised RTI calculation. Structured so real tables can slot in later.
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

const PERIODS = { monthly: 12, fortnightly: 26, weekly: 52 };

// Income tax bands (England/Wales/NI), annual.
const PA_DEFAULT = 12570;       // personal allowance (tax code 1257L)
const BASIC_LIMIT = 50270;      // 20% up to here
const HIGHER_LIMIT = 125140;    // 40% up to here, 45% above

// National Insurance (Category A), annual-equivalent thresholds.
const NI_PRIMARY = 12570;       // employee starts paying
const NI_UEL = 50270;           // upper earnings limit
const NI_SECONDARY = 9100;      // employer starts paying
const NI_EE_MAIN = 0.08;        // employee 8%
const NI_EE_UPPER = 0.02;       // employee 2% above UEL
const NI_ER = 0.138;            // employer 13.8%

function personalAllowance(taxCode) {
  const m = String(taxCode || '').match(/(\d+)\s*[LMN]/i);
  if (m) return Number(m[1]) * 10;
  if (/^BR$/i.test(taxCode)) return 0;
  return PA_DEFAULT;
}

function annualIncomeTax(salary, taxCode) {
  if (/^BR$/i.test(taxCode)) return round2(salary * 0.2);
  if (/^D0$/i.test(taxCode)) return round2(salary * 0.4);
  const pa = personalAllowance(taxCode);
  const taxable = Math.max(0, salary - pa);
  let tax = 0;
  const basicBand = Math.max(0, Math.min(salary, BASIC_LIMIT) - pa);
  tax += basicBand * 0.2;
  const higherBand = Math.max(0, Math.min(salary, HIGHER_LIMIT) - BASIC_LIMIT);
  tax += higherBand * 0.4;
  const addl = Math.max(0, salary - HIGHER_LIMIT);
  tax += addl * 0.45;
  return round2(Math.max(0, tax));
}

function annualEmployeeNI(salary, category) {
  if (/[CWX]/i.test(category || '')) return 0; // e.g. over state pension age / exempt
  const main = Math.max(0, Math.min(salary, NI_UEL) - NI_PRIMARY) * NI_EE_MAIN;
  const upper = Math.max(0, salary - NI_UEL) * NI_EE_UPPER;
  return round2(main + upper);
}

function annualEmployerNI(salary) {
  return round2(Math.max(0, salary - NI_SECONDARY) * NI_ER);
}

// Compute one period's figures for an employee.
function calcPeriod(employee) {
  const n = PERIODS[employee.payFrequency] || 12;
  const salary = Number(employee.annualSalary || 0);
  const gross = round2(salary / n);
  const tax = round2(annualIncomeTax(salary, employee.taxCode) / n);
  const employeeNI = round2(annualEmployeeNI(salary, employee.niCategory) / n);
  const employerNI = round2(annualEmployerNI(salary) / n);
  const net = round2(gross - tax - employeeNI);
  return { gross, tax, employeeNI, employerNI, net };
}

module.exports = { calcPeriod, personalAllowance, annualIncomeTax, annualEmployeeNI, annualEmployerNI, round2, PERIODS };
