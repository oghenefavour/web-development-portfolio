const express = require('express');
const Job = require('../models/jobModel');
const { requireAuth } = require('../middleware/auth');
const v = require('../utils/validators');

const router = express.Router();
const PROVIDERS = ['rider', 'cleaner', 'mover'];

router.get('/jobs/available', requireAuth(...PROVIDERS), async (req, res) => {
  res.json({ data: await Job.listAvailable(req.user.role, req.query.city) });
});

router.get('/jobs/mine', requireAuth(...PROVIDERS), async (req, res) => {
  res.json({ data: await Job.listMine(req.user.id) });
});

router.post('/jobs/:id/accept', requireAuth(...PROVIDERS), async (req, res) => {
  res.json({ data: await Job.accept(req.user, v.positiveInt(req.params.id, 'id')) });
});

router.post('/jobs/:id/complete', requireAuth(...PROVIDERS), async (req, res) => {
  res.json({ data: await Job.complete(req.user, v.positiveInt(req.params.id, 'id')) });
});

router.get('/earnings', requireAuth(...PROVIDERS), async (req, res) => {
  res.json({ data: await Job.earnings(req.user.id) });
});

module.exports = router;
