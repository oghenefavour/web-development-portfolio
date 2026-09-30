const mysql = require('mysql2/promise');

// SSL for cloud databases (e.g. Aiven): DB_SSL=true, optionally DB_SSL_CA with the CA certificate text.
function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;
  if (process.env.DB_SSL_CA) return { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') };
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

function connectionOptions() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: sslOptions(),
  };
}

const pool = mysql.createPool({
  ...connectionOptions(),
  database: process.env.DB_NAME || 'spindrop',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  dateStrings: true,
});

module.exports = pool;
module.exports.connectionOptions = connectionOptions;
