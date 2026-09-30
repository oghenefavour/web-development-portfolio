const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');

function format(u) {
  return { id: u.id, role: u.role, fullName: u.full_name, email: u.email, phone: u.phone, city: u.city, full_name: u.full_name };
}

async function register({ role, fullName, email, phone, password, city }) {
  const [dupes] = await pool.query('SELECT email FROM users WHERE email = ? OR phone = ?', [email, phone]);
  if (dupes.length) {
    throw new HttpError(409, dupes[0].email === email ? 'An account with this email already exists' : 'An account with this phone number already exists');
  }
  const hash = await bcrypt.hash(password, 10);
  const [res] = await pool.query(
    'INSERT INTO users (role, full_name, email, phone, password_hash, city) VALUES (?, ?, ?, ?, ?, ?)',
    [role, fullName, email, phone, hash, city],
  );
  return findById(res.insertId);
}

async function authenticate(email, password) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const ok = rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password');
  return format(rows[0]);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows.length ? format(rows[0]) : null;
}

module.exports = { register, authenticate, findById };
