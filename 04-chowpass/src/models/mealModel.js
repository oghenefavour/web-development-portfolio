const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const clock = require('../utils/clock');
const { windows } = require('../config/settings');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/** Which meal (if any) can be claimed right now, and until when. */
function currentMeal(includesDinner, at = clock.now()) {
  const { date, minutes } = clock.lagos(at);
  if (minutes >= windows.lunch.start && minutes < windows.lunch.end) {
    return { type: 'lunch', date, expiresAt: clock.lagosToUtcSql(date, windows.lunch.end) };
  }
  if (includesDinner && minutes >= windows.dinner.start && minutes < windows.dinner.end) {
    return { type: 'dinner', date, expiresAt: clock.lagosToUtcSql(date, windows.dinner.end) };
  }
  if (process.env.ALLOW_ANYTIME_MEALS === 'true') {
    // Demo mode: let visitors try the flow at any hour. Codes last until midnight.
    const type = includesDinner && minutes >= windows.lunch.end ? 'dinner' : 'lunch';
    return { type, date, expiresAt: clock.lagosToUtcSql(date, 24 * 60), demo: true };
  }
  return null;
}

async function staffContext(staffId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT u.id, u.full_name, u.is_active, u.company_id, c.name AS company_name, c.is_active AS company_active,
            p.name AS package_name, p.includes_dinner, p.meal_value_kobo
       FROM users u JOIN companies c ON c.id = u.company_id JOIN packages p ON p.id = c.package_id
      WHERE u.id = ? AND u.role = 'staff'`,
    [staffId],
  );
  if (!rows.length) throw new HttpError(404, 'Staff member not found');
  return rows[0];
}

/** Staff view for today: which meals are covered, what has been eaten and any active code. */
async function staffToday(staffId) {
  const s = await staffContext(staffId);
  const { date } = clock.lagos();
  const [codes] = await pool.query(
    `SELECT mc.code, mc.meal_type, mc.expires_at, mc.redeemed_at, r.name AS restaurant
       FROM meal_codes mc LEFT JOIN restaurants r ON r.id = mc.restaurant_id
      WHERE mc.staff_id = ? AND mc.meal_date = ?`,
    [staffId, date],
  );
  const meals = ['lunch', ...(s.includes_dinner ? ['dinner'] : [])].map((type) => {
    const c = codes.find((x) => x.meal_type === type);
    let status = 'available';
    if (c && c.redeemed_at) status = 'redeemed';
    else if (c && new Date(`${c.expires_at.replace(' ', 'T')}Z`) > clock.now()) status = 'code_active';
    return {
      type, window: windows[type].label, status,
      code: status === 'code_active' ? c.code : null,
      expiresAt: status === 'code_active' ? c.expires_at : null,
      restaurant: status === 'redeemed' ? c.restaurant : null,
    };
  });
  const open = currentMeal(Boolean(s.includes_dinner));
  const [[month]] = await pool.query(
    'SELECT COUNT(*) AS n FROM meal_codes WHERE staff_id = ? AND redeemed_at IS NOT NULL AND meal_date >= ?',
    [staffId, `${clock.lagos().month}-01`],
  );
  return {
    company: s.company_name,
    package: s.package_name,
    mealValue: toNaira(s.meal_value_kobo),
    date,
    openMeal: open ? open.type : null,
    demoMode: Boolean(open && open.demo),
    meals,
    mealsThisMonth: Number(month.n),
  };
}

/** Generates (or returns the existing) one-time code for the meal that is open right now. */
async function generateCode(staffId) {
  const s = await staffContext(staffId);
  if (!s.is_active) throw new HttpError(403, 'Your meal plan is not active');
  if (!s.company_active) throw new HttpError(403, "Your company's plan is paused");
  const meal = currentMeal(Boolean(s.includes_dinner));
  if (!meal) {
    const w = s.includes_dinner ? `${windows.lunch.label} or ${windows.dinner.label}` : windows.lunch.label;
    throw new HttpError(409, `Meal codes are available during meal times only (${w})`);
  }
  const [existing] = await pool.query(
    'SELECT * FROM meal_codes WHERE staff_id = ? AND meal_date = ? AND meal_type = ?',
    [staffId, meal.date, meal.type],
  );
  if (existing.length) {
    if (existing[0].redeemed_at) throw new HttpError(409, `You have already had your ${meal.type} today`);
    return { code: existing[0].code, mealType: meal.type, expiresAt: existing[0].expires_at, mealValue: toNaira(s.meal_value_kobo) };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    try {
      await pool.query(
        'INSERT INTO meal_codes (code, staff_id, company_id, meal_date, meal_type, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [code, staffId, s.company_id, meal.date, meal.type, meal.expiresAt],
      );
      return { code, mealType: meal.type, expiresAt: meal.expiresAt, mealValue: toNaira(s.meal_value_kobo) };
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err; // extremely rare code collision: try another
    }
  }
  throw new HttpError(503, 'Could not create a code, please try again');
}

/** A restaurant redeems a staff member's code. Locking the row stops the same code being used twice. */
async function redeem(restaurantId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/\s|-/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-character meal code');
  const { date } = clock.lagos();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM meal_codes WHERE code = ? AND meal_date = ? FOR UPDATE', [code, date]);
    if (!rows.length) throw new HttpError(404, 'Code not found. Ask the staff member to check their app');
    const mc = rows[0];
    if (mc.redeemed_at) throw new HttpError(409, 'This code has already been used');
    if (new Date(`${mc.expires_at.replace(' ', 'T')}Z`) <= clock.now()) throw new HttpError(410, 'This code has expired');
    const s = await staffContext(mc.staff_id, conn);
    if (!s.is_active || !s.company_active) throw new HttpError(403, 'This staff member is not covered at the moment');
    await conn.query(
      'UPDATE meal_codes SET redeemed_at = ?, restaurant_id = ?, value_kobo = ? WHERE id = ?',
      [clock.toSql(clock.now()), restaurantId, s.meal_value_kobo, mc.id],
    );
    await conn.commit();
    return {
      staff: s.full_name,
      company: s.company_name,
      mealType: mc.meal_type,
      amount: toNaira(s.meal_value_kobo),
      message: `Serve ${s.full_name.split(' ')[0]} a ${mc.meal_type} worth up to ₦${toNaira(s.meal_value_kobo).toLocaleString('en-NG')}`,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function restaurantOverview(restaurantId, range) {
  const { date } = clock.lagos();
  const [[today]] = await pool.query(
    'SELECT COUNT(*) AS meals, COALESCE(SUM(value_kobo),0) AS amount FROM meal_codes WHERE restaurant_id = ? AND meal_date = ?',
    [restaurantId, date],
  );
  const [[month]] = await pool.query(
    `SELECT COUNT(*) AS meals, COALESCE(SUM(value_kobo),0) AS amount FROM meal_codes
      WHERE restaurant_id = ? AND meal_date >= ? AND meal_date < ?`,
    [restaurantId, range.start, range.end],
  );
  const [byCompany] = await pool.query(
    `SELECT c.name, COUNT(*) AS meals, SUM(mc.value_kobo) AS amount FROM meal_codes mc JOIN companies c ON c.id = mc.company_id
      WHERE mc.restaurant_id = ? AND mc.meal_date >= ? AND mc.meal_date < ? GROUP BY c.id ORDER BY amount DESC`,
    [restaurantId, range.start, range.end],
  );
  const [recent] = await pool.query(
    `SELECT mc.redeemed_at, mc.meal_type, mc.value_kobo, u.full_name, c.name AS company
       FROM meal_codes mc JOIN users u ON u.id = mc.staff_id JOIN companies c ON c.id = mc.company_id
      WHERE mc.restaurant_id = ? ORDER BY mc.redeemed_at DESC LIMIT 10`,
    [restaurantId],
  );
  return {
    month: range.month,
    today: { meals: Number(today.meals), amount: toNaira(Number(today.amount)) },
    thisMonth: { meals: Number(month.meals), amountOwed: toNaira(Number(month.amount)) },
    byCompany: byCompany.map((r) => ({ company: r.name, meals: Number(r.meals), amount: toNaira(Number(r.amount)) })),
    recent: recent.map((r) => ({
      at: r.redeemed_at, mealType: r.meal_type, amount: toNaira(r.value_kobo),
      staff: `${r.full_name.split(' ')[0]} ${r.full_name.split(' ').slice(-1)[0][0]}.`, company: r.company,
    })),
  };
}

module.exports = { currentMeal, staffToday, generateCode, redeem, restaurantOverview };
