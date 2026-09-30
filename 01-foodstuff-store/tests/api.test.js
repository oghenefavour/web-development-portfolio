// Integration tests: run against a real MySQL test database that is rebuilt before the suite.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'foodstuff_store_test';
process.env.ADMIN_API_KEY = 'test-admin-key';
require('dotenv').config({ quiet: true });

const request = require('supertest');
const initDb = require('../scripts/initDb');

let app;
let pool;

const customer = {
  name: 'Ada Obi',
  phone: '08031234567',
  email: 'ada@example.com',
  address: '12 Aminu Kano Crescent, Wuse 2',
  city: 'Abuja',
};
const admin = { 'x-admin-key': 'test-admin-key' };

async function newCartWith(items) {
  const { body } = await request(app).post('/api/carts').expect(201);
  for (const [productId, quantity] of items) {
    await request(app).post(`/api/carts/${body.data.id}/items`).send({ productId, quantity }).expect(201);
  }
  return body.data.id;
}

async function stockOf(productId) {
  const { body } = await request(app).get(`/api/products/${productId}`).expect(200);
  return body.data.stock;
}

beforeAll(async () => {
  await initDb({ database: process.env.DB_NAME, seed: true, log: false });
  app = require('../src/app');
  pool = require('../src/config/db');
});

afterAll(async () => {
  await pool.end();
});

describe('health', () => {
  test('reports the API and database are up', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error).toMatch(/Route not found/);
  });
});

describe('catalogue', () => {
  test('lists categories with product counts', async () => {
    const res = await request(app).get('/api/categories').expect(200);
    expect(res.body.data).toHaveLength(7);
    expect(res.body.data[0]).toMatchObject({ slug: 'rice-grains', productCount: 4 });
  });

  test('lists products with pagination', async () => {
    const res = await request(app).get('/api/products?limit=5&page=2').expect(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 5, total: 22, totalPages: 5 });
  });

  test('filters by category and searches by name', async () => {
    const byCategory = await request(app).get('/api/products?category=cooking-oils').expect(200);
    expect(byCategory.body.data.map((p) => p.name)).toEqual(['Groundnut Oil', 'Palm Oil']);

    const bySearch = await request(app).get('/api/products?search=garri').expect(200);
    expect(bySearch.body.data).toHaveLength(2);
  });

  test('sorts by price', async () => {
    const res = await request(app).get('/api/products?sort=price_desc&limit=1').expect(200);
    expect(res.body.data[0]).toMatchObject({ name: 'Local Parboiled Rice', unit: '50kg bag', price: 95000 });
  });

  test('returns 404 for a missing product and 400 for a bad id', async () => {
    await request(app).get('/api/products/9999').expect(404);
    await request(app).get('/api/products/abc').expect(400);
  });
});

describe('cart', () => {
  test('adds items, merges repeats and calculates totals with delivery fee', async () => {
    const id = await newCartWith([[7, 2], [7, 1], [11, 1]]); // 3 x garri (4,500) + palm oil (12,000)
    const res = await request(app).get(`/api/carts/${id}`).expect(200);
    const garri = res.body.data.items.find((i) => i.productId === 7);
    expect(garri.quantity).toBe(3);
    expect(res.body.data).toMatchObject({ itemCount: 4, subtotal: 25500, deliveryFee: 2500, total: 28000 });
  });

  test('gives free delivery on orders of NGN 100,000 or more', async () => {
    const id = await newCartWith([[1, 1], [2, 1]]); // 95,000 + 49,000
    const res = await request(app).get(`/api/carts/${id}`).expect(200);
    expect(res.body.data).toMatchObject({ subtotal: 144000, deliveryFee: 0, total: 144000 });
  });

  test('rejects quantities above available stock', async () => {
    const id = await newCartWith([]);
    const res = await request(app).post(`/api/carts/${id}/items`).send({ productId: 15, quantity: 21 }).expect(409);
    expect(res.body.error).toMatch(/Only 20 left/);
  });

  test('updates quantity and removes items', async () => {
    const id = await newCartWith([[5, 1], [6, 1]]);
    await request(app).patch(`/api/carts/${id}/items/5`).send({ quantity: 4 }).expect(200);
    const afterZero = await request(app).patch(`/api/carts/${id}/items/6`).send({ quantity: 0 }).expect(200);
    expect(afterZero.body.data.items).toEqual([expect.objectContaining({ productId: 5, quantity: 4 })]);
    const afterDelete = await request(app).delete(`/api/carts/${id}/items/5`).expect(200);
    expect(afterDelete.body.data.items).toHaveLength(0);
  });

  test('validates cart ids and missing carts', async () => {
    await request(app).get('/api/carts/not-a-uuid').expect(400);
    await request(app).get('/api/carts/3f1b7c2e-9a4d-4b8e-8f2a-1c2d3e4f5a6b').expect(404);
  });
});

describe('checkout and orders', () => {
  test('creates an order, reduces stock and empties the cart', async () => {
    const before = await stockOf(12);
    const id = await newCartWith([[12, 2], [21, 3]]); // 2 x groundnut oil (16,500) + 3 x sugar (1,800)
    const res = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(201);

    expect(res.body.data).toMatchObject({
      status: 'pending',
      subtotal: 38400,
      deliveryFee: 2500,
      total: 40900,
      customer: { name: 'Ada Obi', phone: '+2348031234567', email: 'ada@example.com' },
    });
    expect(res.body.data.reference).toMatch(/^FS-[A-Z2-9]{6}$/);
    expect(await stockOf(12)).toBe(before - 2);

    const cart = await request(app).get(`/api/carts/${id}`).expect(200);
    expect(cart.body.data.items).toHaveLength(0);
  });

  test('refuses to check out an empty cart', async () => {
    const id = await newCartWith([]);
    const res = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(400);
    expect(res.body.error).toBe('Your cart is empty');
  });

  test('validates customer details', async () => {
    const id = await newCartWith([[9, 1]]);
    const badPhone = await request(app).post('/api/orders')
      .send({ cartId: id, customer: { ...customer, phone: '12345' } }).expect(400);
    expect(badPhone.body.error).toMatch(/phone/);
    await request(app).post('/api/orders')
      .send({ cartId: id, customer: { ...customer, address: '' } }).expect(400);
  });

  test('fails safely if stock ran out after the item was added to the cart', async () => {
    const id = await newCartWith([[17, 5]]);
    await request(app).patch('/api/products/17').set(admin).send({ stock: 2 }).expect(200);
    const res = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(409);
    expect(res.body.details).toEqual([expect.objectContaining({ productId: 17, requested: 5, available: 2 })]);
    expect(await stockOf(17)).toBe(2); // nothing was deducted
  });

  test('customers can track an order with reference + phone only', async () => {
    const id = await newCartWith([[22, 1]]);
    const { body } = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(201);
    const ref = body.data.reference;

    await request(app).get(`/api/orders/track/${ref}?phone=08031234567`).expect(200);
    await request(app).get(`/api/orders/track/${ref}?phone=08099999999`).expect(404);
  });

  test('admin endpoints require the API key', async () => {
    await request(app).get('/api/orders').expect(401);
    await request(app).get('/api/orders').set({ 'x-admin-key': 'wrong-key-wrong-key' }).expect(401);
    const res = await request(app).get('/api/orders?status=pending').set(admin).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('moves orders through valid statuses and blocks invalid jumps', async () => {
    const id = await newCartWith([[10, 1]]);
    const { body } = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(201);
    const ref = body.data.reference;

    await request(app).patch(`/api/orders/${ref}/status`).set(admin).send({ status: 'delivered' }).expect(409);
    await request(app).patch(`/api/orders/${ref}/status`).set(admin).send({ status: 'confirmed' }).expect(200);
    await request(app).patch(`/api/orders/${ref}/status`).set(admin).send({ status: 'out_for_delivery' }).expect(200);
    const done = await request(app).patch(`/api/orders/${ref}/status`).set(admin).send({ status: 'delivered' }).expect(200);
    expect(done.body.data.status).toBe('delivered');
  });

  test('cancelling an order returns items to stock', async () => {
    const before = await stockOf(14);
    const id = await newCartWith([[14, 4]]);
    const { body } = await request(app).post('/api/orders').send({ cartId: id, customer }).expect(201);
    expect(await stockOf(14)).toBe(before - 4);

    await request(app).patch(`/api/orders/${body.data.reference}/status`).set(admin).send({ status: 'cancelled' }).expect(200);
    expect(await stockOf(14)).toBe(before);
  });
});

describe('admin product management', () => {
  test('creates and updates a product', async () => {
    const created = await request(app).post('/api/products').set(admin).send({
      categoryId: 5, name: 'Ogbono', unit: '1 kg', priceKobo: 750000, stock: 10,
    }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Ogbono', price: 7500, stock: 10 });

    const updated = await request(app).patch(`/api/products/${created.body.data.id}`).set(admin)
      .send({ priceKobo: 800000 }).expect(200);
    expect(updated.body.data.price).toBe(8000);
  });

  test('rejects invalid product data', async () => {
    await request(app).post('/api/products').set(admin).send({ categoryId: 99, name: 'X', unit: '1', priceKobo: 1 }).expect(400);
    await request(app).post('/api/products').set(admin).send({ categoryId: 1, name: '', unit: '1', priceKobo: 1 }).expect(400);
    await request(app).patch('/api/products/9999').set(admin).send({ stock: 1 }).expect(404);
  });
});
