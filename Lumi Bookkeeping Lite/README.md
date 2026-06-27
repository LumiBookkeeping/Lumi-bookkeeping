# Lumi Bookkeeping Lite

Plain-English bookkeeping for **sole traders** — with VAT returns and **Making Tax Digital for Income Tax**.

A lighter sibling to Lumi Bookkeeping: no double-entry jargon, no corporation tax or payroll. Just *money in*, *money out*, and the two things HMRC asks sole traders to file.

## What it does

- **Money in & out** — record sales and costs in seconds, sorted into plain-English categories (which map to HMRC's self-employment boxes behind the scenes).
- **Home dashboard** — money in, money out, profit so far, and a clear *"put aside £X for tax"* figure.
- **VAT returns** — automatic VAT boxes per quarter, shown once a period has finished (for VAT-registered traders).
- **Making Tax Digital for Income Tax** — quarterly update totals with their HMRC deadlines, a running Income Tax + National Insurance estimate, and the final-declaration date.
- **Invoices** — raise a simple invoice, mark it paid, and it flows straight into your figures.
- **Mileage** — log business trips at HMRC's 45p/mile and it's added to your costs automatically.
- **Cash basis** by default (HMRC's default for small sole traders); switch to traditional in Settings.

## Tax figures

Uses the frozen **2026/27** UK thresholds: £12,570 personal allowance, £37,700 basic-rate band, Class 4 NIC at 6% / 2%, £90,000 VAT registration point, £50,000 MTD-for-Income-Tax threshold. All in `lib/tax.js` — easy to update.

> Tax and VAT figures are estimates to help you plan. Filing to HMRC for real needs an HMRC-recognised connection, which is set up when the app is hosted. Buttons that "file" or "send" record it inside Lumi and are clearly labelled.

## Run it

1. Install [Node.js](https://nodejs.org) (LTS).
2. In this folder: `npm install`
3. Optional demo data: `npm run seed` (login `sam@demo.app` / `demo1234`)
4. `npm start`
5. Open **http://localhost:4100**

Or just double-click **Start Lumi Lite.command**.

## Tests

`npm test` — covers the tax engine (Income Tax, Class 4 NIC, VAT boxes, MTD quarters).
