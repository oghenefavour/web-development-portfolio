const express = require('express');
const Product = require('../models/productModel');
const requireAdmin = require('../middleware/requireAdmin');
const HttpError = require('../utils/httpError');
const { positiveInt, requiredString } = require('../utils/validators');

const router = express.Router();

router.get('/categories', async (req, res) => {
  res.json({ data: await Product.listCategories() });
});

router.get('/products', async (req, res) => {
  const page = req.query.page ? positiveInt(req.query.page, 'page') : 1;
  const limit = req.query.limit ? positiveInt(req.query.limit, 'limit', { max: 100 }) : 20;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
  const result = await Product.list({
    category: req.query.category,
    search,
    sort: req.query.sort,
    inStockOnly: req.query.inStock === 'true',
    page,
    limit,
  });
  res.json(result);
});

router.get('/products/:id', async (req, res) => {
  const product = await Product.findById(positiveInt(req.params.id, 'id'));
  if (!product) throw new HttpError(404, 'Product not found');
  res.json({ data: product });
});

router.post('/products', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const categoryId = positiveInt(b.categoryId, 'categoryId');
  if (!(await Product.categoryExists(categoryId))) throw new HttpError(400, 'categoryId does not exist');
  const product = await Product.create({
    categoryId,
    name: requiredString(b.name, 'name', 120),
    description: b.description ? requiredString(b.description, 'description', 500) : null,
    unit: requiredString(b.unit, 'unit', 40),
    priceKobo: positiveInt(b.priceKobo, 'priceKobo'),
    stock: positiveInt(b.stock ?? 0, 'stock', { min: 0 }),
  });
  res.status(201).json({ data: product });
});

router.patch('/products/:id', requireAdmin, async (req, res) => {
  const id = positiveInt(req.params.id, 'id');
  const b = req.body || {};
  const fields = {};
  if (b.name !== undefined) fields.name = requiredString(b.name, 'name', 120);
  if (b.description !== undefined) fields.description = b.description ? requiredString(b.description, 'description', 500) : null;
  if (b.unit !== undefined) fields.unit = requiredString(b.unit, 'unit', 40);
  if (b.priceKobo !== undefined) fields.priceKobo = positiveInt(b.priceKobo, 'priceKobo');
  if (b.stock !== undefined) fields.stock = positiveInt(b.stock, 'stock', { min: 0 });
  if (b.isActive !== undefined) fields.isActive = b.isActive ? 1 : 0;
  if (!(await Product.exists(id))) throw new HttpError(404, 'Product not found');
  const product = await Product.update(id, fields);
  // A deactivated product is hidden from the shop, so confirm the change instead of returning it.
  res.json({ data: product || { id, isActive: false } });
});

module.exports = router;
