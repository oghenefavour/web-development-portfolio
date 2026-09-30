const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const Booking = require('./bookingModel');

const KIND_LABEL = {
  laundry_pickup: 'Laundry pickup',
  laundry_delivery: 'Laundry delivery',
  cleaning: 'Home cleaning',
  moving: 'Moving',
};

function format(r, showPrivate) {
  const job = {
    id: r.id,
    kind: r.kind,
    kindLabel: KIND_LABEL[r.kind],
    status: r.status,
    payout: toNaira(r.payout_kobo),
    booking: {
      reference: r.reference,
      city: r.city,
      area: r.address.split(',').slice(-1)[0].trim(),
      scheduledFor: r.scheduled_for,
      option: r.option_label,
      rooms: r.rooms,
      isExpress: Boolean(r.is_express),
      itemCount: Number(r.item_count || 0),
      notes: r.notes,
    },
  };
  if (showPrivate) {
    job.booking.address = r.address;
    job.booking.toAddress = r.to_address;
    job.booking.customer = { name: r.customer_name, phone: r.customer_phone };
  }
  return job;
}

const SELECT = `
  SELECT j.*, b.reference, b.city, b.address, b.to_address, b.scheduled_for, b.rooms, b.is_express, b.notes,
         so.label AS option_label, u.full_name AS customer_name, u.phone AS customer_phone,
         (SELECT COALESCE(SUM(quantity),0) FROM laundry_items li WHERE li.booking_id = b.id) AS item_count
    FROM jobs j
    JOIN bookings b ON b.id = j.booking_id
    JOIN users u ON u.id = b.customer_id
    LEFT JOIN service_options so ON so.service = b.type AND so.code = b.option_code`;

async function listAvailable(role, city) {
  const params = [role];
  let where = "j.status = 'open' AND j.provider_role = ?";
  if (city) { where += ' AND b.city = ?'; params.push(city); }
  const [rows] = await pool.query(`${SELECT} WHERE ${where} ORDER BY b.scheduled_for ASC, j.id ASC`, params);
  return rows.map((r) => format(r, false));
}

async function listMine(providerId) {
  const [rows] = await pool.query(`${SELECT} WHERE j.provider_id = ? ORDER BY j.status = 'completed', b.scheduled_for DESC, j.id DESC`, [providerId]);
  return rows.map((r) => format(r, true));
}

async function getMine(providerId, jobId) {
  const [rows] = await pool.query(`${SELECT} WHERE j.id = ?`, [jobId]);
  if (!rows.length || rows[0].provider_id !== providerId) throw new HttpError(404, 'Job not found');
  return format(rows[0], true);
}

/** A provider claims an open job. Row locking stops two riders taking the same job. */
async function accept(provider, jobId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [jobId]);
    if (!rows.length) throw new HttpError(404, 'Job not found');
    const job = rows[0];
    if (job.provider_role !== provider.role) throw new HttpError(403, `Only ${job.provider_role}s can take this job`);
    if (job.status !== 'open') throw new HttpError(409, 'Sorry, this job has already been taken');
    await conn.query("UPDATE jobs SET status = 'accepted', provider_id = ?, accepted_at = NOW() WHERE id = ?", [provider.id, jobId]);

    const name = provider.name;
    if (job.kind === 'laundry_pickup') {
      await Booking.addEvent(conn, job.booking_id, 'pending_pickup', `${name} is on the way to pick up your clothes.`);
    } else if (job.kind === 'laundry_delivery') {
      await conn.query("UPDATE bookings SET status = 'out_for_delivery' WHERE id = ?", [job.booking_id]);
      await Booking.addEvent(conn, job.booking_id, 'out_for_delivery', `${name} is bringing your clean clothes.`);
    } else {
      await conn.query("UPDATE bookings SET status = 'accepted' WHERE id = ?", [job.booking_id]);
      await Booking.addEvent(conn, job.booking_id, 'accepted', `${name} has accepted your booking.`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getMine(provider.id, jobId);
}

async function complete(provider, jobId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM jobs WHERE id = ? FOR UPDATE', [jobId]);
    if (!rows.length || rows[0].provider_id !== provider.id) throw new HttpError(404, 'Job not found');
    const job = rows[0];
    if (job.status !== 'accepted') throw new HttpError(409, `Cannot complete a job that is ${job.status}`);
    await conn.query("UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = ?", [jobId]);
    const next = { laundry_pickup: 'picked_up', laundry_delivery: 'delivered', cleaning: 'completed', moving: 'completed' }[job.kind];
    const note = {
      picked_up: 'Clothes picked up and on the way to the laundry.',
      delivered: 'Delivered. Enjoy your fresh clothes!',
      completed: 'Job completed.',
    }[next];
    await conn.query('UPDATE bookings SET status = ? WHERE id = ?', [next, job.booking_id]);
    await Booking.addEvent(conn, job.booking_id, next, note);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getMine(provider.id, jobId);
}

async function earnings(providerId) {
  const [[r]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN payout_kobo END), 0) AS earned,
            COALESCE(SUM(CASE WHEN status = 'accepted' THEN payout_kobo END), 0) AS upcoming,
            SUM(status = 'completed') AS done
       FROM jobs WHERE provider_id = ?`,
    [providerId],
  );
  return { earned: toNaira(Number(r.earned)), upcoming: toNaira(Number(r.upcoming)), jobsCompleted: Number(r.done || 0) };
}

module.exports = { listAvailable, listMine, accept, complete, earnings };
