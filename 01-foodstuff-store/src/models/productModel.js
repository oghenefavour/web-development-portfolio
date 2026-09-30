const pool = require('../config/db');
const { toNaira } = require('../utils/money');

const SORTS = {
  name: 'p.name ASC, p.unit ASC',
  price_asc: 'p.price_kobo ASC',
  price_desc: 'p.price_kobo DESC',
  newest: 'p.created_at DESC, p.id DESC',
};

function format(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: toNaira(row.price_kobo),
    priceKobo: row.price_kobo,
    stock: row.stock,
    inStock: row.stock > 0,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
  };
}

async function listCategories() {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.slug, COUNT(p.id) AS productCount
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      GROUP BY c.id ORDER BY c.id`,
  );
  return rows;
}

async function list({ category, search, sort = 'name', page = 1, limit = 20, inStockOnly = false }) {
  const where = ['p.is_active = 1'];
  const params = [];
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (search) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (inStockOnly) where.push('p.stock > 0');
  const whereSql = where.join(' AND ');
  const orderBy = SORTS[sort] || SORTS.name;
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return {
    data: rows.map(format),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? AND p.is_active = 1`,
    [id],
  );
  return rows[0] ? format(rows[0]) : null;
}

async function create({ categoryId, name, description, unit, priceKobo, stock }) {
  const [result] = await pool.query(
    `INSERT INTO products (category_id, name, description, unit, price_kobo, stock)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [categoryId, name, description || null, unit, priceKobo, stock],
  );
  return findById(result.insertId);
}

async function update(id, fields) {
  const columns = { name: 'name', description: 'description', unit: 'unit', priceKobo: 'price_kobo', stock: 'stock', isActive: 'is_active' };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columns)) {
    if (fields[key] !== undefined) { sets.push(`${column} = ?`); params.push(fields[key]); }
  }
  if (sets.length === 0) return findById(id);
  await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return findById(id);
}

async function exists(id) {
  const [rows] = await pool.query('SELECT id FROM products WHERE id = ?', [id]);
  return rows.length > 0;
}

async function categoryExists(id) {
  const [rows] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
  return rows.length > 0;
}

module.exports = { listCategories, list, findById, create, update, exists, categoryExists };
