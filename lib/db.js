// PostgreSQL plumbing for the Lumi store.
//
// Stage 1 of the SQL migration keeps the app's data model intact: every
// collection becomes one table holding the document as JSONB. This is a
// faithful, low-risk port of the JSON datastore that makes the data durable,
// backed-up and hostable. Stage 2 will progressively normalise hot paths into
// real columns/queries and drop the in-memory cache for multi-instance scaling.
const { Pool } = require('pg');

// A camelCase collection name -> snake_case table name (e.g. auditLog -> audit_log).
function table(coll) {
  return coll.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

// Managed Postgres providers (Neon, Supabase, Render, RDS…) require TLS.
function needsSSL(connectionString) {
  const s = connectionString || '';
  if (/[?&]sslmode=disable/.test(s)) return false;
  if (/[?&]sslmode=require/.test(s)) return true;
  return /neon\.tech|supabase\.|render\.com|amazonaws\.com|\.cloud/.test(s);
}

function makePool(connectionString) {
  const useSSL = needsSSL(connectionString);
  // TLS is configured explicitly below, so strip libpq sslmode/channel_binding
  // params from the URL — they only trigger a noisy deprecation warning here.
  let cs = connectionString;
  if (useSSL && cs) {
    try {
      const u = new URL(cs);
      u.searchParams.delete('sslmode');
      u.searchParams.delete('channel_binding');
      cs = u.toString();
    } catch (e) { /* leave as-is if not a parseable URL */ }
  }
  return new Pool({
    connectionString: cs,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    // Verify the server certificate (managed providers use publicly-trusted
    // certs). Set PG_SSL_NO_VERIFY=1 only if a provider genuinely needs it.
    ssl: useSSL ? { rejectUnauthorized: process.env.PG_SSL_NO_VERIFY !== '1' } : undefined,
  });
}

// Create one table per collection if it doesn't already exist. Safe to run on
// every boot. id is the document id; org_id is denormalised from data->>'orgId'
// for tenant-scoped indexing; data holds the full record.
async function bootstrap(pool, collections) {
  for (const coll of collections) {
    const t = table(coll);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${t} (id text PRIMARY KEY, org_id text, data jsonb NOT NULL)`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS ${t}_org_id_idx ON ${t} (org_id)`);
  }
  // Hot path: reports JOIN lines -> transactions by the transactionId held in
  // the line's JSONB. Index that expression so the join doesn't scan.
  await pool.query(`CREATE INDEX IF NOT EXISTS lines_txn_idx ON ${table('lines')} ((data->>'transactionId'))`);
}

module.exports = { Pool, makePool, bootstrap, table, needsSSL };
