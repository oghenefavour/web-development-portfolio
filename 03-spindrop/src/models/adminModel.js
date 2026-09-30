const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const Booking = require('./bookingModel');
const settings = require('../config/settings');

// Laundry steps that the laundromat staff control. Pickup and delivery are moved on by riders.
const ADMIN_STEPS = { picked_up: 'washing', washing: 'ready' };

async function listBookings({ type, status }) {
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const [rows] = await pool.query(
    `SELECT id FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT 200`,
    params,
  );
  return Promise.all(rows.map((r) => Booking.getById(r.id)));
}

/** Staff move a laundry order forward: picked_up -> washing -> ready. "ready" creates the delivery job for riders. */
async function advanceLaundry(bookingId, nextStatus) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    if (!rows.length) throw new HttpError(404, 'Booking not found');
    const b = rows[0];
    if (b.type !== 'laundry') throw new HttpError(400, 'Only laundry orders are updated by staff');
    if (ADMIN_STEPS[b.status] !== nextStatus) {
      throw new HttpError(409, `Cannot move an order from "${b.status}" to "${nextStatus}"`);
    }
    await conn.query('UPDATE bookings SET status = ? WHERE id = ?', [nextStatus, bookingId]);
    if (nextStatus === 'washing') {
      await Booking.addEvent(conn, bookingId, 'washing', 'Your clothes are being washed and ironed.');
    } else {
      await Booking.createJob(conn, bookingId, 'laundry_delivery', 'rider', settings.riderPayoutPerLegKobo);
      await Booking.addEvent(conn, bookingId, 'ready', 'All clean! Looking for a rider to deliver your clothes.');
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return Booking.getById(bookingId);
}

async function summary() {
  const [byStatus] = await pool.query('SELECT type, status, COUNT(*) AS n FROM bookings GROUP BY type, status');
  const [[money]] = await pool.query(
    `SELECT COALESCE(SUM(total_kobo), 0) AS revenue, COUNT(*) AS bookings
       FROM bookings WHERE status <> 'cancelled'`,
  );
  const [[payouts]] = await pool.query(
    "SELECT COALESCE(SUM(payout_kobo), 0) AS due FROM jobs WHERE status IN ('accepted','completed')",
  );
  const [providers] = await pool.query("SELECT role, COUNT(*) AS n FROM users WHERE role IN ('rider','cleaner','mover') GROUP BY role");
  const [[openJobs]] = await pool.query("SELECT COUNT(*) AS n FROM jobs WHERE status = 'open'");
  const pipeline = {};
  byStatus.forEach((r) => { pipeline[r.type] = { ...(pipeline[r.type] || {}), [r.status]: Number(r.n) }; });
  return {
    bookings: Number(money.bookings),
    revenue: toNaira(Number(money.revenue)),
    providerPayouts: toNaira(Number(payouts.due)),
    grossMargin: toNaira(Number(money.revenue) - Number(payouts.due)),
    openJobs: Number(openJobs.n),
    providers: Object.fromEntries(providers.map((p) => [p.role, Number(p.n)])),
    pipeline,
  };
}

module.exports = { listBookings, advanceLaundry, summary, ADMIN_STEPS };
