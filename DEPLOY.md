# Deploying Lumi Bookkeeping

This takes the app from running on your Mac to running on the web, on Postgres.
Plan ~30 minutes. You'll need a GitHub account (free) and a card on file for the
hosts (the tiers below are free or ~£7/mo).

What you'll end up with:
- A **Postgres database** (Neon) holding your data, in the EU.
- The **app running on the web** (Render) at a `…onrender.com` URL, later your own domain.

---

## Step 1 — Create the database (Neon)

1. Go to **https://neon.tech** and sign up (free).
2. Create a project. **Choose an EU region** (e.g. *Europe (London)* or *Europe (Frankfurt)*) — keeps client data in the EU for UK GDPR.
3. On the project dashboard, copy the **connection string**. It looks like:
   ```
   postgresql://user:password@ep-xxxx.eu-west-2.aws.neon.tech/neondb?sslmode=require
   ```
   Keep it safe — it's a password.

## Step 2 — Load your existing data into it (from your Mac)

In the project folder:

1. Copy the env template and open it:
   ```
   cp .env.example .env
   ```
2. In `.env`, set `DATABASE_URL` to the Neon string from Step 1, and generate a session secret:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste that value as `SESSION_SECRET`.
3. Migrate your current data into Postgres, then confirm it round-trips:
   ```
   npm run migrate:pg
   npm run db:smoke
   ```
   `migrate:pg` prints the row counts it copied; `db:smoke` should print **PASS**.
4. (Optional) Run locally against Postgres to see it working:
   ```
   npm start
   ```
   It should print `Data: PostgreSQL — N rows loaded`. Stop it with Ctrl-C.

## Step 3 — Put the code on GitHub

1. Create a **private** repo at https://github.com/new (e.g. `lumi-bookkeeping`). Don't add a README.
2. In the project folder:
   ```
   git add -A
   git commit -m "Postgres migration + hosting config"
   git branch -M main
   git remote add origin https://github.com/<you>/lumi-bookkeeping.git
   git push -u origin main
   ```
   `.env` and `data/` are gitignored, so no secrets or local data are pushed.

## Step 4 — Deploy on Render

1. Go to **https://render.com** and sign up (free), connecting your GitHub.
2. **New → Blueprint**, pick the `lumi-bookkeeping` repo. Render reads `render.yaml`
   and proposes a web service. It auto-generates `SESSION_SECRET` for you.
3. When prompted (or under the service's **Environment**), set **`DATABASE_URL`** to the
   same Neon string from Step 1, and **Save**.
4. **Apply / Deploy.** First build takes a few minutes.

## Step 5 — Verify it's live

1. Open `https://<your-service>.onrender.com/healthz` → should show
   `{"ok":true,"backend":"postgres",...}`.
2. Open the root URL and log in. Your data (migrated in Step 2) is there.

## Step 6 — Your own domain (optional)

In Render → your service → **Settings → Custom Domains**, add
`app.lumiaccountancy.co.uk`. Render shows a CNAME target; add that CNAME in your
DNS (Netlify, where the main site lives). HTTPS is issued automatically.

---

## Good to know

- **Free tier** spins the app down after ~15 min idle (first hit then takes ~30s to wake)
  and gives no persistent disk, so **uploaded receipts are lost on each redeploy**. For real
  use, upgrade the Render service to **Starter (~$7/mo)** and add a disk, *or* wait for the
  Stage 2 move to S3/R2 object storage. The figures, invoices and books all live in Postgres
  and are safe regardless.
- **Backups:** Neon keeps automatic point-in-time backups — check the retention on your plan.
- **Single instance for now.** Stage 2 converts the data layer to live SQL queries so you can
  run multiple instances and scale out.
- **Before real clients:** privacy policy + terms, confirm PI insurance covers providing
  software, and (for live HMRC filing) the HMRC recognition track — see the project notes.

## Rough cost to start

- Neon Postgres: **free**
- Render web service: **free** to trial, **~$7/mo** for always-on + disk
- Domain: already yours
