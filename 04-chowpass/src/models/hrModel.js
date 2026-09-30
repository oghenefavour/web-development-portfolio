const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');

async function overview(companyId, range) {
  const [[c]] = await pool.query(
    `SELECT c.*, p.code, p.name AS package_name, p.includes_dinner, p.meal_value_kobo, p.monthly_premium_kobo
       FROM companies c JOIN packages p ON p.id = c.package_id WHERE c.id = ?`,
    [companyId],
  );
  const [[staff]] = await pool.query(
    "SELECT SUM(is_active = 1) AS active, SUM(is_active = 0) AS inactive FROM users WHERE company_id = ? AND role = 'staff'",
    [companyId],
  );
  const [[meals]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(value_kobo),0) AS value FROM meal_codes
      WHERE company_id = ? AND redeemed_at IS NOT NULL AND meal_date >= ? AND meal_date < ?`,
    [companyId, range.start, range.end],
  );
  const active = Number(staff.active || 0);
  const mealsPerDay = c.includes_dinner ? 2 : 1;
  const allowance = active * 22 * mealsPerDay;
  return {
    company: { name: c.name, city: c.city },
    package: {
      code: c.code, name: c.package_name, includesDinner: Boolean(c.includes_dinner),
      mealValue: toNaira(c.meal_value_kobo), monthlyPremiumPerStaff: toNaira(c.monthly_premium_kobo),
    },
    month: range.month,
    staff: { active, inactive: Number(staff.inactive || 0) },
    invoice: { activeStaff: active, premiumPerStaff: toNaira(c.monthly_premium_kobo), total: toNaira(active * c.monthly_premium_kobo) },
    usage: {
      mealsServed: Number(meals.n),
      mealAllowance: allowance,
      utilisationPercent: allowance ? Math.round((Number(meals.n) / allowance) * 1000) / 10 : 0,
      valueConsumed: toNaira(Number(meals.value)),
    },
  };
}

async function listStaff(companyId, range) {
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.is_active,
            (SELECT COUNT(*) FROM meal_codes mc WHERE mc.staff_id = u.id AND mc.redeemed_at IS NOT NULL
               AND mc.meal_date >= ? AND mc.meal_date < ?) AS meals
       FROM users u WHERE u.company_id = ? AND u.role = 'staff' ORDER BY u.is_active DESC, u.full_name`,
    [range.start, range.end, companyId],
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, phone: r.phone, isActive: Boolean(r.is_active), mealsThisMonth: Number(r.meals) }));
}

/** HR enrols a staff member. A one-time temporary password is returned for HR to share with them. */
async function addStaff(companyId, { fullName, email, phone }) {
  const [d] = await pool.query('SELECT email FROM users WHERE email = ? OR phone = ?', [email, phone]);
  if (d.length) throw new HttpError(409, d[0].email === email ? 'An account with this email already exists' : 'An account with this phone number already exists');
  const tempPassword = `Chow-${crypto.randomBytes(3).toString('hex')}${Math.floor(10 + Math.random() * 89)}`;
  const [res] = await pool.query(
    "INSERT INTO users (role, full_name, email, phone, password_hash, company_id) VALUES ('staff', ?, ?, ?, ?, ?)",
    [fullName, email, phone, await bcrypt.hash(tempPassword, 10), companyId],
  );
  return { id: res.insertId, fullName, email, phone, isActive: true, tempPassword };
}

async function setStaffActive(companyId, staffId, isActive) {
  const [res] = await pool.query(
    "UPDATE users SET is_active = ? WHERE id = ? AND company_id = ? AND role = 'staff'",
    [isActive ? 1 : 0, staffId, companyId],
  );
  if (!res.affectedRows) throw new HttpError(404, 'Staff member not found');
  return { id: staffId, isActive };
}

async function changePackage(companyId, code) {
  const [p] = await pool.query('SELECT id FROM packages WHERE code = ?', [code]);
  if (!p.length) throw new HttpError(400, 'Unknown package');
  await pool.query('UPDATE companies SET package_id = ? WHERE id = ?', [p[0].id, companyId]);
}

module.exports = { overview, listStaff, addStaff, setStaffActive, changePackage };
