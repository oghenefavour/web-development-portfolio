const express = require('express');
const Admin = require('../models/adminModel');
const { requireAuth } = require('../middleware/auth');
const v = require('../utils/validators');

const router = express.Router();

router.get('/admin/summary', requireAuth('admin'), async (req, res) => {
  res.json({ data: await Admin.summary() });
});

router.get('/admin/bookings', requireAuth('admin'), async (req, res) => {
  const type = req.query.type ? v.oneOf(req.query.type, 'type', ['laundry', 'cleaning', 'moving']) : undefined;
  res.json({ data: await Admin.listBookings({ type, status: req.query.status }) });
});

router.patch('/admin/bookings/:id/status', requireAuth('admin'), async (req, res) => {
  const status = v.oneOf((req.body || {}).status, 'status', Object.values(Admin.ADMIN_STEPS));
  res.json({ data: await Admin.advanceLaundry(v.positiveInt(req.params.id, 'id'), status) });
});

module.exports = router;
