// Validates the REAL Postgres backend end-to-end (the literal SQL the store
// issues) against the database in DATABASE_URL. Inserts, updates, re-hydrates
// and deletes a throwaway row, then cleans up. Run after provisioning:
//   npm run db:smoke
require('dotenv').config();
const store = require('../lib/store');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to smoke-test.');
    process.exit(1);
  }
  const info = await store.init();
  console.log(`Connected: ${info.backend} — ${info.rows} rows present`);

  const marker = '__smoke_' + Date.now();
  const org = store.insert('organizations', { name: marker });
  store.update('organizations', org.id, { lockDate: '2026-01-01' });
  await store.flush();

  await store.init(); // re-hydrate from the database, as a fresh boot would
  const found = store.byId('organizations', org.id);
  const ok = !!found && found.name === marker && found.lockDate === '2026-01-01';

  store.remove('organizations', (o) => o.id === org.id); // clean up
  await store.flush();

  console.log(ok ? 'PASS: real Postgres CRUD round-trip works.' : 'FAIL: data did not round-trip.');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
