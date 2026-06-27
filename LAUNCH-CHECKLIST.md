# Lumi Bookkeeping — your launch checklist

What *you* need to do. The code work (Postgres migration, Stage 2 conversions,
the accounting-engine refactor) is handled separately — this is only your part.
Full deploy detail lives in DEPLOY.md.

---

## Phase 1 — Go live (do now) ~15 min

- [ ] **1. Create the GitHub repo.** At https://github.com/new make a **private** repo
      named `lumi-bookkeeping` (don't tick "add a README").
- [ ] **2. Push the code:**
      ```
      cd ~/Claude/Projects/"Lumi Bookkeeping"
      git remote add origin https://github.com/<your-username>/lumi-bookkeeping.git
      git push -u origin main
      ```
- [ ] **3. Deploy on Render.** https://render.com → sign up (connect GitHub) →
      **New → Blueprint** → pick `lumi-bookkeeping`. It reads `render.yaml` and
      auto-generates the session secret.
- [ ] **4. Set `DATABASE_URL`** on the Render service to your Neon connection string → Save → Deploy.
- [ ] **5. Verify.** Open `https://<your-app>.onrender.com/healthz` → should show
      `"backend":"postgres"`. Then open the app and log in.
- [ ] **6. (Optional) Custom domain.** Render → Settings → Custom Domains →
      add `app.lumiaccountancy.co.uk`, then add the CNAME it gives you in Netlify DNS.
- [ ] **7. Security: rotate the Neon password** (you shared it in chat). Neon
      dashboard → reset password → update it in your local `.env` **and** in Render's `DATABASE_URL`.

You now have a live product.

---

## Phase 2 — Ongoing, while Stage 2 is converted in batches (~30s each)

Each time a batch is finished and committed to your repo:

- [ ] **Run `git push`.** Render auto-deploys it. Do a quick click-through of the app.

That's the whole loop. Nothing to pull — commits are already in your local `main`.

---

## Phase 3 — Before real clients rely on it (safety net)

So Stage 2 changes are tested before they ever touch live client data:

- [ ] **8. Create a staging database** — a second Neon database (or a Neon *branch* of
      your existing one).
- [ ] **9. Create a staging Render service** pointed at it (a copy of production).

Then changes are validated on staging first and only promoted to production once
confirmed. (Config + testing handled for you — you just create the two resources.)

---

## Phase 4 — When you need to scale to multiple instances (later)

Only needed once real load justifies it:

- [ ] **10. Object storage for uploads.** Create a **Cloudflare R2** (or AWS S3) bucket
      + access keys, add them to Render's env vars. (Code wiring handled for you.)
- [ ] **11. Raise the instance count** in Render (a setting + a paid plan) to run 2+ copies.

Postgres-backed sessions are handled in code — no action needed from you.

---

## Rough costs

- Neon Postgres: free to start
- Render web service: free to trial, ~$7/mo for always-on + a disk
- Object storage (Phase 4): ~free at low volume
- Domain: already yours
