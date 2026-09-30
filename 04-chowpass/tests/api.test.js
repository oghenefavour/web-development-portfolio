process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'chowpass_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ALLOW_ANYTIME_MEALS = 'false';
require('dotenv').config({ quiet: true });

const request = require('supertest');
const { initDb } = require('../scripts/initDb');
const clock = require('../src/utils/clock');

let app;
let pool;
let hr; let ada; let tunde; let kitchen; let nkechi; let admin; let greenleafHr; let emeka;

// Times are set on today's date (UTC). Lagos = UTC + 1 hour.
const today = new Date().toISOString().slice(0, 10);
const at = (hhmmUtc) => new Date(`${today}T${hhmmUtc}:00Z`);

async function login(email, password = 'Password123!') {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}
async function monthMeals(where, params) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(value_kobo),0) AS v FROM meal_codes WHERE redeemed_at IS NOT NULL AND meal_date >= ? AND ${where}`,
    [`${today.slice(0, 7)}-01`, ...params],
  );
  return { n: Number(r.n), naira: Number(r.v) / 100 };
}

beforeAll(async () => {
  await initDb({ database: process.env.DB_NAME, seed: true, log: false });
  app = require('../src/app');
  pool = require('../src/config/db');
  [hr, ada, tunde, kitchen, nkechi, admin, greenleafHr, emeka] = await Promise.all([
    'hr@demo.ng', 'ada@demo.ng', 'tunde@demo.ng', 'kitchen@demo.ng', 'nkechi@demo.ng', 'admin@chowpass.ng', 'hr@greenleaf.demo', 'emeka@greenleaf.demo',
  ].map((e) => login(e)));
});
afterEach(() => clock.setNow(null));
afterAll(async () => { await pool.end(); });

describe('packages and sign-up', () => {
  test('lists the three fixed-price packages', async () => {
    const res = await request(app).get('/api/packages').expect(200);
    expect(res.body.data.map((p) => [p.code, p.mealValue, p.monthlyPremium, p.includesDinner])).toEqual([
      ['basic', 2500, 55000, false], ['standard', 3500, 77000, false], ['premium', 3500, 154000, true],
    ]);
  });

  test('a company signs up with a package; a restaurant signs up', async () => {
    const c = await request(app).post('/api/auth/register-company').send({
      companyName: 'Blue Owl Studio', city: 'Abuja', packageCode: 'basic',
      fullName: 'Temi Ojo', email: 'temi@blueowl.ng', phone: '08091112233', password: 'secret123',
    }).expect(201);
    expect(c.body.user).toMatchObject({ role: 'hr', company: { name: 'Blue Owl Studio', package: { code: 'basic' } } });
    const r = await request(app).post('/api/auth/register-restaurant').send({
      restaurantName: 'Suya Spot', address: '2 Kado Close', city: 'Abuja',
      fullName: 'Musa Bello', email: 'musa@suyaspot.ng', phone: '08091112244', password: 'secret123',
    }).expect(201);
    expect(r.body.user).toMatchObject({ role: 'restaurant', restaurant: { name: 'Suya Spot' } });
    await request(app).post('/api/auth/register-company').send({ companyName: 'X', city: 'Abuja', packageCode: 'gold', fullName: 'Aaa', email: 'a@b.ng', phone: '08091112255', password: 'secret123' }).expect(400);
  });

  test('roles are enforced', async () => {
    await request(app).post('/api/staff/code').set(hr).expect(403);
    await request(app).post('/api/restaurant/redeem').set(ada).send({ code: 'ABCDEF' }).expect(403);
    await request(app).get('/api/hr/overview').set(kitchen).expect(403);
    await request(app).get('/api/admin/overview').set(hr).expect(403);
  });
});

describe('meal codes and redemption', () => {
  let adaCode;

  test('no code outside meal times', async () => {
    clock.setNow(at('07:00')); // 8:00 am in Lagos
    const res = await request(app).post('/api/staff/code').set(ada).expect(409);
    expect(res.body.error).toMatch(/meal times/);
  });

  test('staff get one lunch code at lunchtime (the same code if they ask again)', async () => {
    clock.setNow(at('11:30')); // 12:30 pm Lagos
    const first = await request(app).post('/api/staff/code').set(ada).expect(201);
    expect(first.body.data).toMatchObject({ mealType: 'lunch', mealValue: 3500 });
    expect(first.body.data.code).toMatch(/^[A-Z2-9]{6}$/);
    const again = await request(app).post('/api/staff/code').set(ada).expect(201);
    expect(again.body.data.code).toBe(first.body.data.code);
    adaCode = first.body.data.code;
    const today = await request(app).get('/api/staff/today').set(ada).expect(200);
    expect(today.body.data.meals).toEqual([expect.objectContaining({ type: 'lunch', status: 'code_active', code: adaCode })]);
  });

  test('a restaurant redeems the code once and gets the meal value', async () => {
    clock.setNow(at('11:45'));
    const before = await monthMeals('restaurant_id = ?', [1]);
    await request(app).post('/api/restaurant/redeem').set(kitchen).send({ code: 'bad' }).expect(400);
    await request(app).post('/api/restaurant/redeem').set(kitchen).send({ code: 'ZZZZZZ' }).expect(404);
    const ok = await request(app).post('/api/restaurant/redeem').set(kitchen).send({ code: adaCode.toLowerCase() }).expect(200);
    expect(ok.body.data).toMatchObject({ staff: 'Ada Obi', company: 'Kora Tech Ltd', mealType: 'lunch', amount: 3500 });
    await request(app).post('/api/restaurant/redeem').set(nkechi).send({ code: adaCode }).expect(409);

    const overview = await request(app).get('/api/restaurant/overview').set(kitchen).expect(200);
    expect(overview.body.data.today).toEqual({ meals: 1, amount: 3500 });
    expect(overview.body.data.thisMonth).toEqual({ meals: before.n + 1, amountOwed: before.naira + 3500 });
  });

  test('one lunch per day: no second code after eating', async () => {
    clock.setNow(at('12:30'));
    const res = await request(app).post('/api/staff/code').set(ada).expect(409);
    expect(res.body.error).toMatch(/already had your lunch/);
    const today = await request(app).get('/api/staff/today').set(ada).expect(200);
    expect(today.body.data.meals[0]).toMatchObject({ status: 'redeemed', restaurant: 'Jollof Junction' });
  });

  test('codes expire when the lunch window closes', async () => {
    clock.setNow(at('14:50')); // 3:50 pm Lagos
    const { body } = await request(app).post('/api/staff/code').set(tunde).expect(201);
    clock.setNow(at('15:05')); // 4:05 pm Lagos: window closed
    await request(app).post('/api/restaurant/redeem').set(kitchen).send({ code: body.data.code }).expect(410);
  });

  test('dinner only for packages that include it', async () => {
    clock.setNow(at('17:30')); // 6:30 pm Lagos
    await request(app).post('/api/staff/code').set(ada).expect(409); // Standard Lunch has no dinner
    const res = await request(app).post('/api/staff/code').set(emeka).expect(201); // Premium includes dinner
    expect(res.body.data.mealType).toBe('dinner');
  });

  test('demo mode allows codes at any hour (for the live demo)', async () => {
    clock.setNow(at('06:00'));
    process.env.ALLOW_ANYTIME_MEALS = 'true';
    const res = await request(app).post('/api/staff/code').set(tunde).expect(201);
    expect(res.body.data.mealType).toBe('lunch');
    process.env.ALLOW_ANYTIME_MEALS = 'false';
  });
});

describe('HR dashboard', () => {
  test('overview shows staff, the monthly invoice and usage', async () => {
    const res = await request(app).get('/api/hr/overview').set(hr).expect(200);
    const meals = await monthMeals('company_id = ?', [1]);
    expect(res.body.data).toMatchObject({
      company: { name: 'Kora Tech Ltd' },
      package: { code: 'standard', monthlyPremiumPerStaff: 77000 },
      staff: { active: 3, inactive: 0 },
      invoice: { activeStaff: 3, total: 231000 },
      usage: { mealsServed: meals.n, mealAllowance: 66 },
    });
  });

  test('HR adds staff (temporary password works) and can deactivate them', async () => {
    const res = await request(app).post('/api/hr/staff').set(hr).send({ fullName: 'Kemi Ade', email: 'kemi@kora.ng', phone: '08097776655' }).expect(201);
    expect(res.body.data.tempPassword).toMatch(/^Chow-/);
    const kemi = await login('kemi@kora.ng', res.body.data.tempPassword);
    clock.setNow(at('11:30'));
    await request(app).post('/api/staff/code').set(kemi).expect(201);

    await request(app).patch(`/api/hr/staff/${res.body.data.id}`).set(hr).send({ isActive: false }).expect(200);
    await request(app).post('/api/staff/code').set(kemi).expect(403);
    await request(app).post('/api/auth/login').send({ email: 'kemi@kora.ng', password: res.body.data.tempPassword }).expect(403);
  });

  test('HR cannot manage another company’s staff', async () => {
    await request(app).patch('/api/hr/staff/3').set(greenleafHr).send({ isActive: false }).expect(404);
    const list = await request(app).get('/api/hr/staff').set(greenleafHr).expect(200);
    expect(list.body.data.map((s) => s.fullName)).toEqual(['Emeka Nwosu']);
  });

  test('HR can change package', async () => {
    const res = await request(app).patch('/api/hr/package').set(greenleafHr).send({ packageCode: 'standard' }).expect(200);
    expect(res.body.data.package.code).toBe('standard');
    await request(app).patch('/api/hr/package').set(greenleafHr).send({ packageCode: 'premium' }).expect(200);
  });
});

describe('platform settlement', () => {
  test('admin sees premiums receivable, restaurant payables and margin', async () => {
    const res = await request(app).get('/api/admin/overview').set(admin).expect(200);
    const paid = await monthMeals('1 = ?', [1]);
    const d = res.body.data;
    const kora = d.companies.find((c) => c.name === 'Kora Tech Ltd');
    expect(kora).toMatchObject({ activeStaff: 3, invoice: 231000 });
    expect(d.totals.restaurantPayable).toBe(paid.naira);
    expect(d.totals.margin).toBe(d.totals.premiumsReceivable - d.totals.restaurantPayable);
    expect(d.restaurants.reduce((s, r) => s + r.owed, 0)).toBe(paid.naira);
  });

  test('month filter is validated', async () => {
    await request(app).get('/api/admin/overview?month=2026-13').set(admin).expect(400);
    const res = await request(app).get('/api/admin/overview?month=2020-01').set(admin).expect(200);
    expect(res.body.data.totals.mealsServed).toBe(0);
  });
});
