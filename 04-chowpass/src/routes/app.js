const express = require('express');
const pool = require('../config/db');
const Meal = require('../models/mealModel');
const Hr = require('../models/hrModel');
const Admin = require('../models/adminModel');
const { requireAuth } = require('../middleware/auth');
const { monthRange } = require('../utils/month');
const v = require('../utils/validators');

const router = express.Router();

// Staff and HR routes need the user's company; look it up once from the database (not the token).
async function withCompany(req, res, next) {
  const [rows] = await pool.query('SELECT company_id, is_active FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length || !rows[0].is_active) return res.status(403).json({ error: 'This account is not active' });
  req.companyId = rows[0].company_id;
  return next();
}
async function withRestaurant(req, res, next) {
  const [rows] = await pool.query('SELECT restaurant_id FROM users WHERE id = ?', [req.user.id]);
  req.restaurantId = rows[0].restaurant_id;
  next();
}

// ----- Staff -----
router.get('/staff/today', requireAuth('staff'), withCompany, async (req, res) => {
  res.json({ data: await Meal.staffToday(req.user.id) });
});
router.post('/staff/code', requireAuth('staff'), withCompany, async (req, res) => {
  res.status(201).json({ data: await Meal.generateCode(req.user.id) });
});

// ----- Restaurants -----
router.post('/restaurant/redeem', requireAuth('restaurant'), withRestaurant, async (req, res) => {
  res.json({ data: await Meal.redeem(req.restaurantId, (req.body || {}).code) });
});
router.get('/restaurant/overview', requireAuth('restaurant'), withRestaurant, async (req, res) => {
  res.json({ data: await Meal.restaurantOverview(req.restaurantId, monthRange(req.query.month)) });
});

// ----- HR -----
router.get('/hr/overview', requireAuth('hr'), withCompany, async (req, res) => {
  res.json({ data: await Hr.overview(req.companyId, monthRange(req.query.month)) });
});
router.get('/hr/staff', requireAuth('hr'), withCompany, async (req, res) => {
  res.json({ data: await Hr.listStaff(req.companyId, monthRange(req.query.month)) });
});
router.post('/hr/staff', requireAuth('hr'), withCompany, async (req, res) => {
  const b = req.body || {};
  const staff = await Hr.addStaff(req.companyId, {
    fullName: v.requiredString(b.fullName, 'fullName', 120, 3),
    email: v.email(b.email),
    phone: v.phone(b.phone),
  });
  res.status(201).json({ data: staff });
});
router.patch('/hr/staff/:id', requireAuth('hr'), withCompany, async (req, res) => {
  const isActive = (req.body || {}).isActive;
  if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
  return res.json({ data: await Hr.setStaffActive(req.companyId, v.positiveInt(req.params.id, 'id'), isActive) });
});
router.patch('/hr/package', requireAuth('hr'), withCompany, async (req, res) => {
  await Hr.changePackage(req.companyId, v.requiredString((req.body || {}).packageCode, 'packageCode', 20));
  res.json({ data: await Hr.overview(req.companyId, monthRange()) });
});

// ----- Platform admin -----
router.get('/admin/overview', requireAuth('admin'), async (req, res) => {
  res.json({ data: await Admin.overview(monthRange(req.query.month)) });
});

module.exports = router;
