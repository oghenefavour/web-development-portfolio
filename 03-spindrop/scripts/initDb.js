// Creates the database and tables, and loads demo data.
//   npm run db:init              -> rebuild everything with demo data
//   npm run db:init -- --no-seed -> rebuild without demo data
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { connectionOptions } = require('../src/config/db');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');

async function initDb({ database = process.env.DB_NAME || 'spindrop', seed = true, log = true } = {}) {
  const conn = await mysql.createConnection({ ...connectionOptions(), multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    await conn.query(`USE \`${database}\``);
    await conn.query(read('schema.sql'));
    if (seed) await conn.query(read('seed.sql'));
    if (log) console.log(`Database "${database}" is ready${seed ? ' with demo data' : ''}.`);
  } finally {
    await conn.end();
  }
}

// Used on start-up when AUTO_INIT_DB=true: builds the database only if it has no tables yet.
async function ensureDb({ database = process.env.DB_NAME || 'spindrop' } = {}) {
  const conn = await mysql.createConnection(connectionOptions());
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
      [database, 'users'],
    );
    if (rows[0].n > 0) return false;
  } finally {
    await conn.end();
  }
  await initDb({ database, seed: true });
  return true;
}

if (require.main === module) {
  initDb({ seed: !process.argv.includes('--no-seed') }).catch((err) => {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { initDb, ensureDb };
