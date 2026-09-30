require('dotenv').config({ quiet: true });
const app = require('./app');
const { ensureDb } = require('../scripts/initDb');

const port = Number(process.env.PORT) || 3000;

(async () => {
  if (process.env.AUTO_INIT_DB === 'true') {
    try {
      const created = await ensureDb();
      if (created) console.log('First start: database tables and demo data created.');
    } catch (err) {
      // Keep the website up so the problem is visible; the API will report database errors until fixed.
      console.error(`Could not set up the database yet (${err.message}). Check the DB_* settings.`);
    }
  }
  app.listen(port, () => console.log(`ChowPass running on http://localhost:${port}`));
})().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
