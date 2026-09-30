process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'spindrop_test';
process.env.JWT_SECRET = 'test-secret';
require('dotenv').config({ quiet: true });

const request = require('supertest');
const { initDb } = require('../scripts/initDb');

let app;
let pool;
let ada; let musa; let grace; let kunle; let admin;

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const where = { city: 'Abuja', address: '14 Gana Street, Maitama', scheduledFor: tomorrow() };

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

beforeAll(async () => {
  await initDb({ database: process.env.DB_NAME, seed: true, log: false });
  app = require('../src/app');
  pool = require('../src/config/db');
  [ada, musa, grace, kunle, admin] = await Promise.all(
    ['ada@demo.ng', 'musa@demo.ng', 'grace@demo.ng', 'kunle@demo.ng', 'admin@spindrop.ng'].map(login),
  );
});
afterAll(async () => { await pool.end(); });

describe('pricing and quotes', () => {
  test('lists the garment price list and service options', async () => {
    const res = await request(app).get('/api/pricing').expect(200);
    const jeans = res.body.data.laundry.garments.find((g) => g.name === 'Jeans');
    expect(jeans.price).toBe(5000);
    expect(res.body.data.laundry.pickupDeliveryFee).toBe(2000);
    expect(res.body.data.moving.sizes).toHaveLength(5);
  });

  test('quotes laundry: 2 jeans + 3 cotton shirts + pickup/delivery', async () => {
    const res = await request(app).post('/api/quote/laundry')
      .send({ items: [{ garmentTypeId: 1, quantity: 2 }, { garmentTypeId: 2, quantity: 3 }] }).expect(200);
    expect(res.body.data).toMatchObject({ subtotal: 16000, fees: 2000, total: 18000 });
  });

  test('express laundry adds 50% of the clothes price', async () => {
    const res = await request(app).post('/api/quote/laundry')
      .send({ items: [{ garmentTypeId: 1, quantity: 2 }], isExpress: true }).expect(200);
    expect(res.body.data).toMatchObject({ subtotal: 10000, expressSurcharge: 5000, fees: 7000, total: 17000 });
  });

  test('quotes cleaning per room and moving per size', async () => {
    const clean = await request(app).post('/api/quote/cleaning').send({ optionCode: 'deep', rooms: 3 }).expect(200);
    expect(clean.body.data.total).toBe(21000);
    const move = await request(app).post('/api/quote/moving').send({ optionCode: '2bed' }).expect(200);
    expect(move.body.data.total).toBe(95000);
  });

  test('rejects bad quotes', async () => {
    await request(app).post('/api/quote/laundry').send({ items: [] }).expect(400);
    await request(app).post('/api/quote/laundry').send({ items: [{ garmentTypeId: 999, quantity: 1 }] }).expect(400);
    await request(app).post('/api/quote/cleaning').send({ optionCode: 'deep', rooms: 50 }).expect(400);
    await request(app).post('/api/quote/moving').send({ optionCode: 'mansion' }).expect(400);
  });
});

describe('accounts and permissions', () => {
  test('providers can sign up, but nobody can self-register as admin', async () => {
    const base = { fullName: 'New Rider', phone: '08095556666', password: 'secret123', city: 'Abuja' };
    await request(app).post('/api/auth/register').send({ ...base, role: 'rider', email: 'rider@example.com' }).expect(201);
    await request(app).post('/api/auth/register').send({ ...base, role: 'admin', email: 'boss@example.com', phone: '08095557777' }).expect(400);
  });

  test('roles are enforced', async () => {
    await request(app).post('/api/bookings/laundry').set(musa).send({}).expect(403);
    await request(app).get('/api/jobs/available').set(ada).expect(403);
    await request(app).get('/api/admin/summary').set(grace).expect(403);
    await request(app).get('/api/bookings').expect(401);
  });
});

describe('laundry: order → pickup → wash → deliver', () => {
  let bookingId;
  let pickupJobId;

  test('customer places a laundry order and a pickup job appears for riders', async () => {
    const res = await request(app).post('/api/bookings/laundry').set(ada).send({
      ...where, items: [{ garmentTypeId: 1, quantity: 2 }, { garmentTypeId: 2, quantity: 3 }], notes: 'Gate code 1234',
    }).expect(201);
    expect(res.body.data).toMatchObject({ type: 'laundry', status: 'pending_pickup', total: 18000 });
    expect(res.body.data.reference).toMatch(/^SD-/);
    expect(res.body.data.items).toHaveLength(2);
    bookingId = res.body.data.id;

    const jobs = await request(app).get('/api/jobs/available?city=Abuja').set(musa).expect(200);
    const job = jobs.body.data.find((j) => j.booking.reference === res.body.data.reference);
    expect(job).toMatchObject({ kind: 'laundry_pickup', payout: 800 });
    expect(job.booking).not.toHaveProperty('address'); // private until accepted
    pickupJobId = job.id;

    const cleanerJobs = await request(app).get('/api/jobs/available').set(grace).expect(200);
    expect(cleanerJobs.body.data.some((j) => j.id === pickupJobId)).toBe(false);
  });

  test('a rider accepts the pickup; nobody else can take it', async () => {
    await request(app).post(`/api/jobs/${pickupJobId}/accept`).set(grace).expect(403);
    const res = await request(app).post(`/api/jobs/${pickupJobId}/accept`).set(musa).expect(200);
    expect(res.body.data.booking).toMatchObject({ address: '14 Gana Street, Maitama', customer: { name: 'Ada Obi' } });
    const second = await request(app).post('/api/auth/login').send({ email: 'rider@example.com', password: 'secret123' });
    await request(app).post(`/api/jobs/${pickupJobId}/accept`).set({ Authorization: `Bearer ${second.body.token}` }).expect(409);
  });

  test('customer can no longer cancel once a rider is on the way', async () => {
    await request(app).post(`/api/bookings/${bookingId}/cancel`).set(ada).expect(409);
  });

  test('rider completes pickup; staff move it through washing to ready', async () => {
    await request(app).post(`/api/jobs/${pickupJobId}/complete`).set(musa).expect(200);
    await request(app).patch(`/api/admin/bookings/${bookingId}/status`).set(admin).send({ status: 'ready' }).expect(409);
    await request(app).patch(`/api/admin/bookings/${bookingId}/status`).set(admin).send({ status: 'washing' }).expect(200);
    const ready = await request(app).patch(`/api/admin/bookings/${bookingId}/status`).set(admin).send({ status: 'ready' }).expect(200);
    expect(ready.body.data.jobs.map((j) => j.kind)).toEqual(['laundry_pickup', 'laundry_delivery']);
  });

  test('a rider delivers and the customer sees the full timeline', async () => {
    const jobs = await request(app).get('/api/jobs/available').set(musa).expect(200);
    const delivery = jobs.body.data.find((j) => j.kind === 'laundry_delivery');
    await request(app).post(`/api/jobs/${delivery.id}/accept`).set(musa).expect(200);
    const mid = await request(app).get(`/api/bookings/${bookingId}`).set(ada).expect(200);
    expect(mid.body.data.status).toBe('out_for_delivery');
    await request(app).post(`/api/jobs/${delivery.id}/complete`).set(musa).expect(200);

    const done = await request(app).get(`/api/bookings/${bookingId}`).set(ada).expect(200);
    expect(done.body.data.status).toBe('delivered');
    expect(done.body.data.timeline.map((e) => e.status)).toEqual(
      ['pending_pickup', 'pending_pickup', 'picked_up', 'washing', 'ready', 'out_for_delivery', 'delivered'],
    );
    const earnings = await request(app).get('/api/earnings').set(musa).expect(200);
    expect(earnings.body.data).toMatchObject({ earned: 1600, jobsCompleted: 2 });
  });
});

describe('cleaning and moving', () => {
  test('cleaner accepts and completes a deep clean; keeps 80%', async () => {
    const b = await request(app).post('/api/bookings/cleaning').set(ada).send({ ...where, optionCode: 'deep', rooms: 3 }).expect(201);
    expect(b.body.data).toMatchObject({ status: 'pending', total: 21000, option: 'Deep clean (per room)', rooms: 3 });
    const jobs = await request(app).get('/api/jobs/available').set(grace).expect(200);
    const job = jobs.body.data.find((j) => j.booking.reference === b.body.data.reference);
    expect(job.payout).toBe(16800);
    await request(app).post(`/api/jobs/${job.id}/accept`).set(grace).expect(200);
    await request(app).post(`/api/jobs/${job.id}/complete`).set(grace).expect(200);
    const after = await request(app).get(`/api/bookings/${b.body.data.id}`).set(ada).expect(200);
    expect(after.body.data.status).toBe('completed');
  });

  test('moving needs a destination; mover sees both addresses after accepting', async () => {
    await request(app).post('/api/bookings/moving').set(ada).send({ ...where, optionCode: '1bed' }).expect(400);
    const b = await request(app).post('/api/bookings/moving').set(ada)
      .send({ ...where, optionCode: '1bed', toAddress: '8 Lake Chad Crescent, Maitama' }).expect(201);
    const jobs = await request(app).get('/api/jobs/available').set(kunle).expect(200);
    const job = jobs.body.data.find((j) => j.booking.reference === b.body.data.reference);
    const accepted = await request(app).post(`/api/jobs/${job.id}/accept`).set(kunle).expect(200);
    expect(accepted.body.data.booking.toAddress).toBe('8 Lake Chad Crescent, Maitama');
  });

  test('customer can cancel before anyone accepts; the job disappears', async () => {
    const b = await request(app).post('/api/bookings/cleaning').set(ada).send({ ...where, optionCode: 'standard', rooms: 1 }).expect(201);
    const res = await request(app).post(`/api/bookings/${b.body.data.id}/cancel`).set(ada).expect(200);
    expect(res.body.data.status).toBe('cancelled');
    const jobs = await request(app).get('/api/jobs/available').set(grace).expect(200);
    expect(jobs.body.data.some((j) => j.booking.reference === b.body.data.reference)).toBe(false);
  });

  test('bookings must be scheduled in the future', async () => {
    await request(app).post('/api/bookings/cleaning').set(ada)
      .send({ ...where, scheduledFor: '2020-01-01T10:00:00Z', optionCode: 'standard', rooms: 1 }).expect(400);
  });
});

describe('admin dashboard', () => {
  test('summarises revenue, payouts, providers and the pipeline', async () => {
    const res = await request(app).get('/api/admin/summary').set(admin).expect(200);
    expect(res.body.data).toMatchObject({
      revenue: 18000 + 21000 + 60000,
      providerPayouts: 1600 + 16800 + 48000,
      providers: { rider: 2, cleaner: 1, mover: 1 },
    });
    expect(res.body.data.pipeline.laundry).toEqual({ delivered: 1 });
    const list = await request(app).get('/api/admin/bookings?type=laundry').set(admin).expect(200);
    expect(list.body.data).toHaveLength(1);
  });
});
