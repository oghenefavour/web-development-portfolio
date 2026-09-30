const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');

async function assertUnique(conn, email, phone) {
  const [d] = await conn.query('SELECT email FROM users WHERE email = ? OR phone = ?', [email, phone]);
  if (d.length) throw new HttpError(409, d[0].email === email ? 'An account with this email already exists' : 'An account with this phone number already exists');
}

async function packageByCode(conn, code) {
  const [p] = await conn.query('SELECT * FROM packages WHERE code = ?', [code]);
  if (!p.length) throw new HttpError(400, 'Unknown package');
  return p[0];
}

async function registerCompany({ companyName, city, packageCode, fullName, email, phone, password }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertUnique(conn, email, phone);
    const pkg = await packageByCode(conn, packageCode);
    const [c] = await conn.query('INSERT INTO companies (name, city, package_id) VALUES (?, ?, ?)', [companyName, city, pkg.id]);
    const [u] = await conn.query(
      "INSERT INTO users (role, full_name, email, phone, password_hash, company_id) VALUES ('hr', ?, ?, ?, ?, ?)",
      [fullName, email, phone, await bcrypt.hash(password, 10), c.insertId],
    );
    await conn.commit();
    return findById(u.insertId);
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function registerRestaurant({ restaurantName, address, city, fullName, email, phone, password }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertUnique(conn, email, phone);
    const [r] = await conn.query('INSERT INTO restaurants (name, address, city) VALUES (?, ?, ?)', [restaurantName, address, city]);
    const [u] = await conn.query(
      "INSERT INTO users (role, full_name, email, phone, password_hash, restaurant_id) VALUES ('restaurant', ?, ?, ?, ?, ?)",
      [fullName, email, phone, await bcrypt.hash(password, 10), r.insertId],
    );
    await conn.commit();
    return findById(u.insertId);
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function authenticate(email, password) {
  const [rows] = await pool.query('SELECT id, password_hash, is_active FROM users WHERE email = ?', [email]);
  const ok = rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password');
  if (!rows[0].is_active) throw new HttpError(403, 'This account has been deactivated by your company');
  return findById(rows[0].id);
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT u.*, c.name AS company_name, c.is_active AS company_active,
            p.code AS package_code, p.name AS package_name, p.includes_dinner, p.meal_value_kobo, p.monthly_premium_kobo,
            r.name AS restaurant_name, r.address AS restaurant_address
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       LEFT JOIN packages p ON p.id = c.package_id
       LEFT JOIN restaurants r ON r.id = u.restaurant_id
      WHERE u.id = ?`,
    [id],
  );
  if (!rows.length) return null;
  const u = rows[0];
  const user = {
    id: u.id, role: u.role, fullName: u.full_name, email: u.email, phone: u.phone, isActive: Boolean(u.is_active), full_name: u.full_name,
  };
  if (u.company_id) {
    user.company = {
      id: u.company_id,
      name: u.company_name,
      isActive: Boolean(u.company_active),
      package: {
        code: u.package_code, name: u.package_name, includesDinner: Boolean(u.includes_dinner),
        mealValue: toNaira(u.meal_value_kobo), monthlyPremium: toNaira(u.monthly_premium_kobo),
      },
    };
  }
  if (u.restaurant_id) user.restaurant = { id: u.restaurant_id, name: u.restaurant_name, address: u.restaurant_address };
  return user;
}

async function listPackages() {
  const [rows] = await pool.query('SELECT * FROM packages ORDER BY monthly_premium_kobo');
  return rows.map((p) => ({
    code: p.code, name: p.name, description: p.description, includesDinner: Boolean(p.includes_dinner),
    mealValue: toNaira(p.meal_value_kobo), monthlyPremium: toNaira(p.monthly_premium_kobo),
  }));
}

module.exports = { registerCompany, registerRestaurant, authenticate, findById, listPackages };
