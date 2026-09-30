const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');

async function register({ role, fullName, email, phone, password, city, bio, categoryIds }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [dupes] = await conn.query('SELECT email, phone FROM users WHERE email = ? OR phone = ?', [email, phone]);
    if (dupes.length) {
      throw new HttpError(409, dupes[0].email === email ? 'An account with this email already exists' : 'An account with this phone number already exists');
    }
    const hash = await bcrypt.hash(password, 10);
    const [res] = await conn.query(
      'INSERT INTO users (role, full_name, email, phone, password_hash, city) VALUES (?, ?, ?, ?, ?, ?)',
      [role, fullName, email, phone, hash, city],
    );
    if (role === 'tasker') {
      const [cats] = await conn.query('SELECT id FROM categories WHERE id IN (?)', [categoryIds]);
      if (cats.length !== categoryIds.length) throw new HttpError(400, 'One or more categories do not exist');
      await conn.query('INSERT INTO tasker_profiles (user_id, bio) VALUES (?, ?)', [res.insertId, bio]);
      await conn.query('INSERT INTO tasker_categories (user_id, category_id) VALUES ?', [categoryIds.map((c) => [res.insertId, c])]);
    }
    await conn.commit();
    return findById(res.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function authenticate(email, password) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  // Same error for "no such user" and "wrong password" so attackers can't discover accounts.
  const ok = rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password');
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.role, u.full_name, u.email, u.phone, u.city, u.created_at,
            tp.bio, tp.rating_total, tp.rating_count, tp.jobs_completed
       FROM users u LEFT JOIN tasker_profiles tp ON tp.user_id = u.id WHERE u.id = ?`,
    [id],
  );
  if (!rows.length) return null;
  const u = rows[0];
  const user = { id: u.id, role: u.role, fullName: u.full_name, email: u.email, phone: u.phone, city: u.city, full_name: u.full_name };
  if (u.role === 'tasker') {
    const [cats] = await pool.query(
      'SELECT c.id, c.name, c.slug, c.icon FROM tasker_categories tc JOIN categories c ON c.id = tc.category_id WHERE tc.user_id = ? ORDER BY c.id',
      [id],
    );
    Object.assign(user, {
      bio: u.bio,
      rating: u.rating_count ? Math.round((u.rating_total / u.rating_count) * 10) / 10 : null,
      ratingCount: u.rating_count,
      jobsCompleted: u.jobs_completed,
      categories: cats,
    });
  }
  return user;
}

async function listTaskers({ category, city }) {
  const where = ["u.role = 'tasker'"];
  const params = [];
  if (city) { where.push('u.city = ?'); params.push(city); }
  if (category) {
    where.push('EXISTS (SELECT 1 FROM tasker_categories tc JOIN categories c ON c.id = tc.category_id WHERE tc.user_id = u.id AND c.slug = ?)');
    params.push(category);
  }
  const [rows] = await pool.query(
    `SELECT u.id FROM users u JOIN tasker_profiles tp ON tp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY (tp.rating_total / NULLIF(tp.rating_count, 0)) DESC, tp.jobs_completed DESC`,
    params,
  );
  const taskers = await Promise.all(rows.map((r) => findById(r.id)));
  // Public view: hide contact details.
  return taskers.map(({ email, phone, full_name, ...pub }) => pub);
}

async function listCategories() {
  const [rows] = await pool.query('SELECT id, name, slug, icon FROM categories ORDER BY id');
  return rows;
}

module.exports = { register, authenticate, findById, listTaskers, listCategories };
