# Stage 2 — make the app stateless (multi-instance)

Stage 1 put Postgres under the existing store but kept an **in-memory cache** hydrated
on boot, so the app must run as a single instance. Stage 2 removes that dependency by
reading and writing **directly to Postgres**, so you can run several instances behind a
load balancer and scale out.

This is an **incremental** migration — do it route by route, verifying each, never big-bang.

## Order of work (this order keeps it correct at every step)

1. **Reads → direct SQL.** Safe to do first: writes still flow through the cache + write-through
   queue, so the cache stays correct; reads just bypass it. (Started — see below.)
2. **Writes → direct SQL.** Replace `insert/update/remove`'s cache-mutation + write-queue with
   awaited SQL. Once done, no code reads the cache.
3. **Drop the cache.** Remove the boot-time hydrate and the write queue from `lib/store.js`.
   The app is now stateless.
4. **Shared session store.** `express-session` currently uses the default in-memory store
   (per-instance, lost on restart). Switch to `connect-pg-simple` (Postgres-backed) so sessions
   work across instances. **Required for multi-instance.**
5. **Uploads → object storage.** Move `data/uploads` to S3/Cloudflare R2 (see DEPLOY.md).

## The read-conversion recipe (steps 1)

Available async helpers on the store (dual-mode: real SQL on Postgres, cache on the JSON
backend; they flush pending writes first for read-your-writes):

- `await store.queryByOrg(coll, orgId)` — `SELECT data FROM <coll> WHERE org_id = $1`
- `await store.queryById(coll, id)` — single row by id
- `await store.queryAll(coll)` — whole collection

Per GET handler:

```js
// before
app.get('…', auth.requireAuth, auth.requireOrg, (req, res) => {
  const rows = store.filter('contacts', (x) => x.orgId === req.orgId);
  res.json({ contacts: rows });
});

// after — handler becomes async, wrapped so errors reach the error middleware
app.get('…', auth.requireAuth, auth.requireOrg, wrap(async (req, res) => {
  const rows = await store.queryByOrg('contacts', req.orgId);
  res.json({ contacts: rows });
}));
```

- `store.byId(c, id)` → `await store.queryById(c, id)`.
- Keep incidental conditions in JS after the query, e.g. `(await store.queryByOrg('taxRates', id)).filter(t => !t.archived)`.
  The indexed `org_id` query does the heavy lifting; small extra filters in JS are fine.
- `wrap()` and the 500 error middleware are already in `server.js`.

## Proven so far

- `GET /api/orgs/:orgId/contacts` and `GET /api/orgs/:orgId/tax-rates` converted and verified
  serving correct data from Neon via direct SQL.

## Remaining (rough)

- ~100 read call sites across the GET routes (`store.filter` / `store.byId`) — convert in batches
  by domain (accounts, items, invoices, transactions, reports, payroll…). The enriched/report
  endpoints (dashboard, P&L, reconcile) read several collections; convert each `filter`/`byId`
  the same way. Consider a JSONB expression index on hot lookups (e.g. `lines.transactionId`).
- Then writes (step 2), drop the cache (step 3), session store (step 4), uploads (step 5).
