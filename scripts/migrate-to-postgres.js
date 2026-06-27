// One-time (idempotent) migration: load data/db.json into PostgreSQL.
//
//   1. Provision a Postgres database (e.g. Neon) and put its URL in .env
//   2. npm run migrate:pg
//   3. npm start   (now reads/writes Postgres)
//
// Safe to re-run: rows are upserted by id, so re-running syncs without dupes.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { COLLECTIONS } = require('../lib/store');

const DATA_DIR = process.env.LUMI_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Postgres URL.');
    process.exit(1);
  }
  if (!fs.existsSync(DB_FILE)) {
    console.error(`No data file at ${DB_FILE} — nothing to migrate.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const pool = db.makePool(url);
  console.log('Bootstrapping schema…');
  await db.bootstrap(pool, COLLECTIONS);

  let total = 0;
  for (const coll of COLLECTIONS) {
    const rows = Array.isArray(data[coll]) ? data[coll] : [];
    const t = db.table(coll);
    let n = 0;
    for (const row of rows) {
      if (!row || !row.id) continue;
      await pool.query(
        `INSERT INTO ${t} (id, org_id, data) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, data = EXCLUDED.data`,
        [row.id, row.orgId == null ? null : String(row.orgId), JSON.stringify(row)]
      );
      n++;
    }
    if (n) console.log(`  ${t.padEnd(16)} ${n}`);
    total += n;
  }
  console.log(`\nMigrated ${total} rows from db.json into Postgres.`);
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
