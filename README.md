# Lumi Bookkeeping

A cloud-style, double-entry bookkeeping app for a bookkeeping practice and its clients — built as a working MVP. The bookkeeper manages multiple client businesses; each client logs in to see only their own books, record transactions, attach supporting documents, and run a Trial Balance, Profit & Loss, and Balance Sheet.

## Run it

You need [Node.js](https://nodejs.org) 18+ installed. In this folder:

```bash
npm install      # one-time: install dependencies
npm run seed     # load demo clients + sample transactions (optional)
npm start        # start the server
```

Then open **http://localhost:4000**.

### Demo logins

| Role | Email | Password | Sees |
|------|-------|----------|------|
| Bookkeeper | `bookkeeper@lumi.app` | `demo1234` | Bright Cafe **and** Maple Design |
| Client | `client@lumi.app` | `demo1234` | Bright Cafe only |

Use the **client switcher** at the top right (bookkeeper view) to move between client businesses. Use **＋ Add client** in the sidebar to create a new business and, optionally, a login for that client.

## What it does

**Foundations**

- **Multi-tenant** — each client business has its own isolated set of books; a client can never see another client's data (enforced server-side).
- **Double-entry ledger** — every transaction must balance (debits = credits) before it posts; unbalanced entries are rejected.
- **Chart of accounts** — each new client starts with a standard chart (asset / liability / equity / income / expense); you can add accounts.
- **Document upload** — attach receipts, invoices, or statements to any transaction and view them later.
- **Reports** computed live from the ledger, each exportable to **CSV** or **PDF** (Print): **Trial Balance** and **Balance Sheet** (as at a date), and **Profit & Loss** (date range).

**Core bookkeeping depth**

- **Edit, void and delete** transactions. Voiding keeps the record for audit but removes it from reports.
- **Lock periods** — set a lock date so nothing on or before it can be changed (e.g. after a period is filed).
- **Bank reconciliation** — tick off transactions against a statement balance and see the cleared balance and any difference.

**Invoicing & bills**

- **Customers & suppliers** (contacts).
- **Sales invoices** and **supplier bills** with draft → awaiting payment → paid statuses.
- Approving an invoice/bill **auto-posts** the journal (to Accounts Receivable / Accounts Payable); recording payment settles it against the bank.
- **AR / AP aging** — outstanding amounts bucketed by Current / 1–30 / 31–60 / 60+ days overdue.

**Data in and out**

- **CSV bank import** — upload a bank statement, map the date/description/amount columns, assign categories, preview, and import as balanced transactions.
- **CSV & PDF export** of every report.

**VAT / sales tax**

- **Tax rates** per client (Standard 20%, Reduced 5%, Zero-rated, No VAT) selectable on each invoice/bill line, with subtotal / VAT / total shown live.
- Approving a VAT invoice or bill **posts the tax** to the VAT control account (output tax on sales, reclaimable input tax on purchases).
- **VAT Return** report (output tax, input tax, net due or refund) over any period.

**Insight for clients**

- **Dashboard** shows a live **VAT liability/refund position** and an **estimated corporation tax** figure (UK rates with marginal relief, on the year's profit to date).
- **Action list** on the front page — computed items (drafts to approve, overdue invoices/bills, bank lines to reconcile, VAT due) plus custom to-dos you can tick off.
- **Cashflow forecast** — projects up to **12 months** ahead (weekly or monthly view) by learning your recurring income/expense patterns and adding specific unpaid invoices/bills. Shows opening/in/out/closing for each period, a lowest-balance alert, and the recurring items driving it.
- **Categorisation rules** — match a supplier/customer name to an account (and tax rate); applied automatically when importing bank CSVs.

**Sales documents & branding**

- **Invoice PDFs** — generate a typeset invoice/quote document (logo, company header, line items, VAT, bank details) and **send to the customer** by email.
- **Quotes & estimates** — create, send, accept/decline and **convert a quote to a draft invoice** in one click (quotes don't touch the ledger).
- **Company branding in settings** — clients can upload a **logo** (shown on invoices and the app header), edit full **company details**, and set **default payment terms**; notes/terms can be added per document.

**Practice tools**

- **VAT returns** — quarterly/monthly periods with a boxed (MTD-format) return; submission is gated until the period ends and shows the filing due date/countdown.
- **Payroll** — employees, pay runs with PAYE/NI calculation, payslips, the wages journal, and an RTI-ready FPS submission.
- **Aged debtors & creditors**, **budget vs actual**, **general ledger drill-down**, **bulk reconcile**, **recurring invoices**, **month-end checklist**, **client queries**, and a **JSON backup** download.

> **HMRC note:** VAT (MTD) and payroll (RTI) submission flows are built in the correct format and recorded in Lumi, but **live transmission to HMRC** requires Lumi to be a recognised HMRC software vendor and hosted online — clearly labelled in-app as not-yet-live.

**Trust & correctness**

- **Activity log** — an audit trail of who changed what and when (create, edit, void, delete, approve, pay, import, lock).
- **Automated tests** — run `npm test` (accounting engine + UK payroll PAYE/NI calculations).

All amounts are in **GBP (£)**.

## How it's built

| Layer | Choice | Why |
|-------|--------|-----|
| Server | Node.js + Express | Ubiquitous, simple, easy to host anywhere later |
| Auth | session cookies + bcrypt password hashing | Standard, secure-by-default for an MVP |
| Data | JSON datastore (`data/db.json`) | Zero-setup for a prototype; the access layer (`lib/store.js`) is deliberately thin so it can be swapped for **PostgreSQL** with minimal changes to callers |
| Accounting | `lib/accounting.js` | All ledger math and reports in one tested module |
| Frontend | Vanilla JS single-page app | No build step — open and go |

```
server.js              HTTP API + routes
lib/store.js           data access (swap for SQL later)
lib/accounting.js      double-entry rules + reports
lib/auth.js            login, roles, org access control
public/                the web UI (index.html, app.js, styles.css)
scripts/seed.js        demo data
tests/                 automated tests (npm test)
data/                  database + uploaded documents (created at runtime)
```

## Notes & next steps for production

This is a functional MVP, not yet production-hardened. Natural next steps:

1. **Move to PostgreSQL** (replace `lib/store.js`) for concurrency and durability — the planned step before hosting it online.
2. **HTTPS + a hosted deployment** (e.g. Render, Fly.io, or AWS) so clients can reach it on the web.
3. **VAT / sales-tax returns** building on the locked-period support already in place.
4. **Two-factor auth, password reset by email, and finer-grained permissions.**
5. **Recurring invoices, partial payments, and credit notes.**
6. **More automated tests** across the API routes, not just the accounting engine.
