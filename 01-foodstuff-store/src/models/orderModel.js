const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const { deliveryFeeFor, assertExists } = require('./cartModel');

// Allowed status changes; anything else is rejected.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

function newReference() {
  // e.g. FS-7K2P9Q: short, readable, no ambiguous characters (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return `FS-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

function format(order, items) {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
    },
    delivery: { address: order.delivery_address, city: order.delivery_city },
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      unit: i.unit,
      unitPrice: toNaira(i.unit_price_kobo),
      quantity: i.quantity,
      lineTotal: toNaira(i.line_total_kobo),
    })),
    subtotal: toNaira(order.subtotal_kobo),
    deliveryFee: toNaira(order.delivery_fee_kobo),
    total: toNaira(order.total_kobo),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

async function findByReference(reference, conn = pool) {
  const [orders] = await conn.query('SELECT * FROM orders WHERE reference = ?', [reference]);
  if (orders.length === 0) return null;
  const [items] = await conn.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orders[0].id]);
  return format(orders[0], items);
}

/**
 * Turns a cart into an order inside a single transaction:
 * locks the product rows, re-checks stock, reduces stock, records the order and empties the cart.
 * If anything fails, nothing is saved.
 */
async function checkout(cartId, customer) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertExists(cartId, conn);

    const [lines] = await conn.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.unit, p.price_kobo, p.stock, p.is_active
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ? ORDER BY ci.product_id
        FOR UPDATE`,
      [cartId],
    );
    if (lines.length === 0) throw new HttpError(400, 'Your cart is empty');

    const problems = lines
      .filter((l) => !l.is_active || l.quantity > l.stock)
      .map((l) => ({ productId: l.product_id, name: l.name, requested: l.quantity, available: l.is_active ? l.stock : 0 }));
    if (problems.length) throw new HttpError(409, 'Some items are no longer available in the quantity requested', problems);

    const subtotalKobo = lines.reduce((sum, l) => sum + l.price_kobo * l.quantity, 0);
    const deliveryFeeKobo = deliveryFeeFor(subtotalKobo);
    const reference = newReference();

    const [result] = await conn.query(
      `INSERT INTO orders (reference, customer_name, customer_phone, customer_email, delivery_address,
                           delivery_city, subtotal_kobo, delivery_fee_kobo, total_kobo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reference, customer.name, customer.phone, customer.email, customer.address, customer.city,
        subtotalKobo, deliveryFeeKobo, subtotalKobo + deliveryFeeKobo],
    );

    for (const l of lines) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit, unit_price_kobo, quantity, line_total_kobo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, l.product_id, l.name, l.unit, l.price_kobo, l.quantity, l.price_kobo * l.quantity],
      );
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [l.quantity, l.product_id]);
    }
    await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

    await conn.commit();
    return findByReference(reference);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function list({ status, page = 1, limit = 20 }) {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${where}`, params);
  const [rows] = await pool.query(
    `SELECT id, reference, status, customer_name, customer_phone, delivery_city, total_kobo, created_at
       FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  return {
    data: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      city: r.delivery_city,
      total: toNaira(r.total_kobo),
      createdAt: r.created_at,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Moves an order to a new status. Cancelling puts the items back into stock. */
async function updateStatus(reference, nextStatus) {
  if (!Object.hasOwn(TRANSITIONS, nextStatus)) {
    throw new HttpError(400, `status must be one of: ${Object.keys(TRANSITIONS).join(', ')}`);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query('SELECT id, status FROM orders WHERE reference = ? FOR UPDATE', [reference]);
    if (orders.length === 0) throw new HttpError(404, 'Order not found');
    const order = orders[0];
    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw new HttpError(409, `Cannot change an order from "${order.status}" to "${nextStatus}"`);
    }
    if (nextStatus === 'cancelled') {
      const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const item of items) {
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, order.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return findByReference(reference);
}

module.exports = { checkout, findByReference, list, updateStatus, TRANSITIONS };
