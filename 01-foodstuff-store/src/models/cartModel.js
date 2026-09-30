const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toNaira } = require('../utils/money');
const settings = require('../config/settings');

function deliveryFeeFor(subtotalKobo) {
  if (subtotalKobo === 0) return 0;
  return subtotalKobo >= settings.freeDeliveryThresholdKobo ? 0 : settings.deliveryFeeKobo;
}

async function create() {
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO carts (id) VALUES (?)', [id]);
  return get(id);
}

async function assertExists(cartId, conn = pool) {
  const [rows] = await conn.query('SELECT id FROM carts WHERE id = ?', [cartId]);
  if (rows.length === 0) throw new HttpError(404, 'Cart not found');
}

async function get(cartId) {
  await assertExists(cartId);
  const [rows] = await pool.query(
    `SELECT ci.product_id, ci.quantity, p.name, p.unit, p.price_kobo, p.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ? ORDER BY p.name`,
    [cartId],
  );
  const items = rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    unit: r.unit,
    unitPrice: toNaira(r.price_kobo),
    quantity: r.quantity,
    lineTotal: toNaira(r.price_kobo * r.quantity),
    available: r.stock,
  }));
  const subtotalKobo = rows.reduce((sum, r) => sum + r.price_kobo * r.quantity, 0);
  const deliveryFeeKobo = deliveryFeeFor(subtotalKobo);
  return {
    id: cartId,
    items,
    itemCount: rows.reduce((sum, r) => sum + r.quantity, 0),
    subtotal: toNaira(subtotalKobo),
    deliveryFee: toNaira(deliveryFeeKobo),
    total: toNaira(subtotalKobo + deliveryFeeKobo),
  };
}

async function loadProduct(productId) {
  const [rows] = await pool.query('SELECT id, name, stock FROM products WHERE id = ? AND is_active = 1', [productId]);
  if (rows.length === 0) throw new HttpError(404, 'Product not found');
  return rows[0];
}

function checkStock(product, quantity) {
  if (quantity > settings.maxQuantityPerItem) {
    throw new HttpError(400, `You can order at most ${settings.maxQuantityPerItem} of each item`);
  }
  if (quantity > product.stock) {
    throw new HttpError(409, `Only ${product.stock} left in stock for ${product.name}`);
  }
}

async function addItem(cartId, productId, quantity) {
  await assertExists(cartId);
  const product = await loadProduct(productId);
  const [existing] = await pool.query(
    'SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId],
  );
  const newQuantity = (existing[0]?.quantity || 0) + quantity;
  checkStock(product, newQuantity);
  await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
    [cartId, productId, newQuantity],
  );
  return get(cartId);
}

async function setItemQuantity(cartId, productId, quantity) {
  await assertExists(cartId);
  if (quantity === 0) return removeItem(cartId, productId);
  const product = await loadProduct(productId);
  checkStock(product, quantity);
  const [result] = await pool.query(
    'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?', [quantity, cartId, productId],
  );
  if (result.affectedRows === 0) throw new HttpError(404, 'Item is not in this cart');
  return get(cartId);
}

async function removeItem(cartId, productId) {
  await assertExists(cartId);
  await pool.query('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId]);
  return get(cartId);
}

module.exports = { create, get, addItem, setItemQuantity, removeItem, deliveryFeeFor, assertExists };
