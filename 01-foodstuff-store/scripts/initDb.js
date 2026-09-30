// Creates the database (if needed), builds the tables and loads sample data.
// Usage: npm run db:init            (schema + sample data)
//        npm run db:init -- --no-seed
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { connectionOptions } = require('../src/config/db');

async function initDb({ database = process.env.DB_NAME || 'foodstuff_store', seed = true, log = true } = {}) {
  const conn = await mysql.createConnection({ ...connectionOptions(), multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    await conn.query(`USE \`${database}\``);
    await conn.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
    if (seed) await conn.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8'));
    if (log) console.log(`Database "${database}" is ready${seed ? ' with sample data' : ''}.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  initDb({ seed: !process.argv.includes('--no-seed') }).catch((err) => {
    console.error('Database setup failed:', err.message);
    process.exit(1);
  });
}

// Used on start-up when AUTO_INIT_DB=true: builds the database only if it has no tables yet.
async function ensureDb({ database = process.env.DB_NAME || 'foodstuff_store' } = {}) {
  const conn = await mysql.createConnection(connectionOptions());
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
      [database, 'products'],
    );
    if (rows[0].n > 0) return false;
  } finally {
    await conn.end();
  }
  await initDb({ database, seed: true });
  return true;
}

module.exports = initDb;
module.exports.ensureDb = ensureDb;
