process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'urgent2k_test';
process.env.JWT_SECRET = 'test-secret';
require('dotenv').config({ quiet: true });

const request = require('supertest');
const { initDb } = require('../scripts/initDb');

let app;
let pool;
const PASSWORD = 'Password123!';

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

const newTask = (overrides = {}) => ({
  categoryId: 1,
  title: 'Clean my kitchen',
  description: 'Kitchen needs a thorough clean before guests arrive.',
  city: 'Abuja',
  area: 'Maitama',
  address: '5 Gana Street',
  budget: 8000,
  isUrgent: true,
  ...overrides,
});

let ada; let tunde; let emeka; let zainab; let chidi;

beforeAll(async () => {
  await initDb({ database: process.env.DB_NAME, seed: true, log: false });
  app = require('../src/app');
  pool = require('../src/config/db');
  ada = await login('ada@demo.ng');
  tunde = await login('tunde@demo.ng');
  emeka = await login('emeka@demo.ng');
  zainab = await login('zainab@demo.ng');
  chidi = await login('chidi@demo.ng');
});

afterAll(async () => { await pool.end(); });

describe('accounts', () => {
  test('registers a customer and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      role: 'customer', fullName: 'Ngozi Eze', email: 'Ngozi@Example.com', phone: '0809 111 2222', password: 'secret123', city: 'Enugu',
    }).expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ role: 'customer', email: 'ngozi@example.com', phone: '+2348091112222' });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('registers a tasker with skill categories', async () => {
    const res = await request(app).post('/api/auth/register').send({
      role: 'tasker', fullName: 'Bola Ade', email: 'bola@example.com', phone: '08092223333', password: 'secret123', city: 'Abuja', categoryIds: [1, 5], bio: 'Neat and fast.',
    }).expect(201);
    expect(res.body.user.categories.map((c) => c.slug)).toEqual(['cleaning', 'laundry']);
  });

  test('rejects duplicates, weak passwords and taskers without skills', async () => {
    const base = { role: 'customer', fullName: 'Test User', phone: '08093334444', password: 'secret123', city: 'Abuja' };
    await request(app).post('/api/auth/register').send({ ...base, email: 'ada@demo.ng' }).expect(409);
    await request(app).post('/api/auth/register').send({ ...base, email: 'x@example.com', password: 'short' }).expect(400);
    await request(app).post('/api/auth/register').send({ ...base, email: 'y@example.com', role: 'tasker' }).expect(400);
  });

  test('login fails with the same message for unknown email or wrong password', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'nobody@demo.ng', password: PASSWORD }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'ada@demo.ng', password: 'Wrong1234' }).expect(401);
    expect(a.body.error).toBe(b.body.error);
  });

  test('protected routes need a valid token', async () => {
    await request(app).get('/api/me').expect(401);
    await request(app).get('/api/me').set({ Authorization: 'Bearer not-a-token' }).expect(401);
    const res = await request(app).get('/api/me').set(ada).expect(200);
    expect(res.body.user.fullName).toBe('Ada Obi');
  });
});

describe('browsing', () => {
  test('lists categories and taskers without exposing contact details', async () => {
    const cats = await request(app).get('/api/categories').expect(200);
    expect(cats.body.data).toHaveLength(8);
    const taskers = await request(app).get('/api/taskers?category=cleaning&city=Abuja').expect(200);
    expect(taskers.body.data[0]).toMatchObject({ fullName: 'Zainab Musa', rating: 4.7 });
    expect(taskers.body.data[0]).not.toHaveProperty('phone');
    expect(taskers.body.data[0]).not.toHaveProperty('email');
  });

  test('open tasks hide the exact address from taskers', async () => {
    const res = await request(app).get('/api/tasks?city=Abuja').set(emeka).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].isUrgent).toBe(true);
    res.body.data.forEach((t) => expect(t).not.toHaveProperty('address'));
  });
});

describe('the full task journey', () => {
  let taskId;
  let zainabOfferId;

  test('customer posts a task (minimum budget NGN 2,000)', async () => {
    await request(app).post('/api/tasks').set(ada).send(newTask({ budget: 1500 })).expect(400);
    await request(app).post('/api/tasks').set(zainab).send(newTask()).expect(403); // taskers can't post
    const res = await request(app).post('/api/tasks').set(ada).send(newTask()).expect(201);
    expect(res.body.data).toMatchObject({ status: 'open', budget: 8000, address: '5 Gana Street' });
    taskId = res.body.data.id;
  });

  test('taskers can only offer on tasks in their skills, once', async () => {
    await request(app).post(`/api/tasks/${taskId}/offers`).set(emeka).send({ price: 7000, message: 'I can do it.' }).expect(403);
    const res = await request(app).post(`/api/tasks/${taskId}/offers`).set(zainab)
      .send({ price: 7500, message: 'I can come within the hour.' }).expect(201);
    zainabOfferId = res.body.data.id;
    await request(app).post(`/api/tasks/${taskId}/offers`).set(zainab).send({ price: 7000, message: 'Again please' }).expect(409);
  });

  test('customer sees offers with tasker ratings', async () => {
    const res = await request(app).get(`/api/tasks/${taskId}`).set(ada).expect(200);
    expect(res.body.data.offers).toEqual([
      expect.objectContaining({ id: zainabOfferId, price: 7500, status: 'pending', tasker: expect.objectContaining({ name: 'Zainab Musa', rating: 4.7 }) }),
    ]);
  });

  test('only the owner can accept; accepting holds payment and assigns the tasker', async () => {
    await request(app).post(`/api/tasks/${taskId}/offers/${zainabOfferId}/accept`).set(tunde).expect(403);
    const res = await request(app).post(`/api/tasks/${taskId}/offers/${zainabOfferId}/accept`).set(ada).expect(200);
    expect(res.body.data).toMatchObject({ status: 'assigned', agreedPrice: 7500, platformFee: 750 });
    expect(res.body.data.tasker.name).toBe('Zainab Musa');

    const [[payment]] = await pool.query('SELECT status, amount_kobo FROM payments WHERE task_id = ?', [taskId]);
    expect(payment).toEqual({ status: 'held', amount_kobo: 750000 });
  });

  test('the assigned tasker now sees the address and customer phone; others do not', async () => {
    const assigned = await request(app).get(`/api/tasks/${taskId}`).set(zainab).expect(200);
    expect(assigned.body.data).toMatchObject({ address: '5 Gana Street', yourPayout: 6750, customer: { phone: '+2348031111111' } });
    const other = await request(app).get(`/api/tasks/${taskId}`).set(emeka).expect(200);
    expect(other.body.data).not.toHaveProperty('address');
  });

  test('customer cannot confirm before the tasker completes; then confirms and reviews', async () => {
    await request(app).post(`/api/tasks/${taskId}/confirm`).set(ada).send({ rating: 5 }).expect(409);
    await request(app).post(`/api/tasks/${taskId}/complete`).set(emeka).expect(403);
    await request(app).post(`/api/tasks/${taskId}/complete`).set(zainab).expect(200);
    await request(app).post(`/api/tasks/${taskId}/confirm`).set(ada).send({ rating: 9 }).expect(400);
    const res = await request(app).post(`/api/tasks/${taskId}/confirm`).set(ada).send({ rating: 5, comment: 'Spotless!' }).expect(200);
    expect(res.body.data.status).toBe('confirmed');
  });

  test('payment is released and the tasker earnings and rating update', async () => {
    const earnings = await request(app).get('/api/earnings').set(zainab).expect(200);
    expect(earnings.body.data).toMatchObject({ paidOut: 6750, inEscrow: 0, platformFeesPaid: 750, paidJobs: 1 });
    const me = await request(app).get('/api/me').set(zainab).expect(200);
    expect(me.body.user).toMatchObject({ jobsCompleted: 7, ratingCount: 7, rating: 4.7 }); // (28+5)/7 = 4.71
  });
});

describe('cancelling and withdrawing', () => {
  test('cancelling an assigned task refunds the held payment', async () => {
    const { body } = await request(app).post('/api/tasks').set(tunde).send(newTask({ categoryId: 4, city: 'Lagos', title: 'Move a wardrobe' })).expect(201);
    const offer = await request(app).post(`/api/tasks/${body.data.id}/offers`).set(chidi).send({ price: 10000, message: 'Available now.' }).expect(201);
    await request(app).post(`/api/tasks/${body.data.id}/offers/${offer.body.data.id}/accept`).set(tunde).expect(200);
    const res = await request(app).post(`/api/tasks/${body.data.id}/cancel`).set(tunde).expect(200);
    expect(res.body.data.status).toBe('cancelled');
    const [[payment]] = await pool.query('SELECT status FROM payments WHERE task_id = ?', [body.data.id]);
    expect(payment.status).toBe('refunded');
    await request(app).post(`/api/tasks/${body.data.id}/offers`).set(chidi).send({ price: 9000, message: 'Still keen' }).expect(409);
  });

  test('taskers can withdraw a pending offer and offer again later', async () => {
    const { body } = await request(app).post('/api/tasks').set(ada).send(newTask({ title: 'Iron 20 shirts', categoryId: 5 })).expect(201);
    const offer = await request(app).post(`/api/tasks/${body.data.id}/offers`).set(zainab).send({ price: 6000, message: 'Can do today.' }).expect(201);
    await request(app).post(`/api/offers/${offer.body.data.id}/withdraw`).set(zainab).expect(200);
    await request(app).post(`/api/offers/${offer.body.data.id}/withdraw`).set(zainab).expect(409);
    const again = await request(app).post(`/api/tasks/${body.data.id}/offers`).set(zainab).send({ price: 5500, message: 'New price.' }).expect(201);
    expect(again.body.data).toMatchObject({ price: 5500, status: 'pending' });
    const mine = await request(app).get('/api/offers/mine').set(zainab).expect(200);
    expect(mine.body.data.some((o) => o.task.id === body.data.id)).toBe(true);
  });
});
