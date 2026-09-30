const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const Pricing = require('./pricingModel');
const settings = require('../config/settings');

// Status flows per service.
const FLOWS = {
  laundry: ['pending_pickup', 'picked_up', 'washing', 'ready', 'out_for_delivery', 'delivered'],
  cleaning: ['pending', 'accepted', 'completed'],
  moving: ['pending', 'accepted', 'completed'],
};
const LABELS = {
  pending_pickup: 'Waiting for pickup',
  picked_up: 'Picked up',
  washing: 'Washing',
  ready: 'Ready for delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  pending: 'Waiting for a provider',
  accepted: 'Provider assigned',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function newReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `SD-${Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('')}`;
}

async function addEvent(conn, bookingId, status, note) {
  await conn.query('INSERT INTO booking_events (booking_id, status, note) VALUES (?, ?, ?)', [bookingId, status, note]);
}

async function createJob(conn, bookingId, kind, providerRole, payoutKobo) {
  await conn.query(
    'INSERT INTO jobs (booking_id, kind, provider_role, payout_kobo) VALUES (?, ?, ?, ?)',
    [bookingId, kind, providerRole, payoutKobo],
  );
}

async function create(customerId, type, input) {
  const q = await Pricing.quote(type, input);
  const conn = await pool.getConnection();
  let bookingId;
  try {
    await conn.beginTransaction();
    const status = FLOWS[type][0];
    const [res] = await conn.query(
      `INSERT INTO bookings (reference, customer_id, type, status, city, address, to_address, option_code, rooms,
                             is_express, scheduled_for, notes, subtotal_kobo, fee_kobo, total_kobo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newReference(), customerId, type, status, input.city, input.address, input.toAddress || null,
        input.optionCode || null, input.rooms || null, input.isExpress ? 1 : 0, input.scheduledFor,
        input.notes, q.subtotalKobo, q.feeKobo, q.totalKobo],
    );
    bookingId = res.insertId;
    if (type === 'laundry') {
      for (const l of q.lines) {
        await conn.query(
          `INSERT INTO laundry_items (booking_id, garment_type_id, name, unit_price_kobo, quantity, line_total_kobo)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [bookingId, l.garmentTypeId, l.name, l.unitPriceKobo, l.quantity, l.lineTotalKobo],
        );
      }
      await createJob(conn, bookingId, 'laundry_pickup', 'rider', settings.riderPayoutPerLegKobo);
      await addEvent(conn, bookingId, status, 'Order placed. Looking for a rider to pick up your clothes.');
    } else {
      const payout = Math.round((q.totalKobo * settings.providerSharePercent) / 100);
      await createJob(conn, bookingId, type, type === 'cleaning' ? 'cleaner' : 'mover', payout);
      await addEvent(conn, bookingId, status, `Booking placed. Looking for a ${type === 'cleaning' ? 'cleaner' : 'mover'}.`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(bookingId);
}

async function getById(id) {
  const [rows] = await pool.query(
    `SELECT b.*, u.full_name AS customer_name, u.phone AS customer_phone, so.label AS option_label
       FROM bookings b JOIN users u ON u.id = b.customer_id
       LEFT JOIN service_options so ON so.service = b.type AND so.code = b.option_code
      WHERE b.id = ?`,
    [id],
  );
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  const b = rows[0];
  const [items] = await pool.query('SELECT name, unit_price_kobo, quantity, line_total_kobo FROM laundry_items WHERE booking_id = ? ORDER BY id', [id]);
  const [jobs] = await pool.query(
    `SELECT j.id, j.kind, j.status, j.payout_kobo, u.full_name AS provider_name, u.phone AS provider_phone
       FROM jobs j LEFT JOIN users u ON u.id = j.provider_id WHERE j.booking_id = ? ORDER BY j.id`,
    [id],
  );
  const [events] = await pool.query('SELECT status, note, created_at FROM booking_events WHERE booking_id = ? ORDER BY id', [id]);
  return {
    id: b.id,
    reference: b.reference,
    type: b.type,
    status: b.status,
    statusLabel: LABELS[b.status],
    city: b.city,
    address: b.address,
    toAddress: b.to_address,
    option: b.option_label,
    rooms: b.rooms,
    isExpress: Boolean(b.is_express),
    scheduledFor: b.scheduled_for,
    notes: b.notes,
    customer: { id: b.customer_id, name: b.customer_name, phone: b.customer_phone },
    items: items.map((i) => ({ name: i.name, unitPrice: toNaira(i.unit_price_kobo), quantity: i.quantity, lineTotal: toNaira(i.line_total_kobo) })),
    jobs: jobs.map((j) => ({
      id: j.id, kind: j.kind, status: j.status, payout: toNaira(j.payout_kobo),
      provider: j.provider_name ? { name: j.provider_name, phone: j.provider_phone } : null,
    })),
    timeline: events.map((e) => ({ status: e.status, label: LABELS[e.status], note: e.note, at: e.created_at })),
    subtotal: toNaira(b.subtotal_kobo),
    fees: toNaira(b.fee_kobo),
    total: toNaira(b.total_kobo),
    createdAt: b.created_at,
  };
}

async function listForCustomer(customerId) {
  const [rows] = await pool.query('SELECT id FROM bookings WHERE customer_id = ? ORDER BY created_at DESC, id DESC', [customerId]);
  return Promise.all(rows.map((r) => getById(r.id)));
}

async function getForCustomer(customerId, id) {
  const booking = await getById(id);
  if (booking.customer.id !== customerId) throw new HttpError(404, 'Booking not found');
  return booking;
}

/** Customers can cancel until a provider has taken the first job. */
async function cancel(customerId, id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length || rows[0].customer_id !== customerId) throw new HttpError(404, 'Booking not found');
    const b = rows[0];
    const [taken] = await conn.query("SELECT id FROM jobs WHERE booking_id = ? AND status <> 'open'", [id]);
    if (b.status !== FLOWS[b.type][0] || taken.length) {
      throw new HttpError(409, 'This booking can no longer be cancelled because a provider is already on it');
    }
    await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);
    await conn.query("UPDATE jobs SET status = 'cancelled' WHERE booking_id = ?", [id]);
    await addEvent(conn, id, 'cancelled', 'Cancelled by customer.');
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getById(id);
}

module.exports = { create, getById, listForCustomer, getForCustomer, cancel, addEvent, createJob, FLOWS, LABELS };
