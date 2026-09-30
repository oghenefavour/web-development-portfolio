const express = require('express');
const Task = require('../models/taskModel');
const Offer = require('../models/offerModel');
const { requireAuth } = require('../middleware/auth');
const HttpError = require('../utils/httpError');
const v = require('../utils/validators');
const { minBudgetKobo } = require('../config/settings');

const router = express.Router();
const id = (value) => v.positiveInt(value, 'id');

// ----- Customers -----
router.post('/tasks', requireAuth('customer'), async (req, res) => {
  const b = req.body || {};
  let scheduledFor = null;
  if (b.scheduledFor) {
    const d = new Date(b.scheduledFor);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'scheduledFor must be a valid date and time');
    scheduledFor = d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const task = await Task.create(req.user.id, {
    categoryId: v.positiveInt(b.categoryId, 'categoryId'),
    title: v.requiredString(b.title, 'title', 120, 5),
    description: v.requiredString(b.description, 'description', 1000, 10),
    city: v.requiredString(b.city, 'city', 80),
    area: v.requiredString(b.area, 'area', 80),
    address: v.requiredString(b.address, 'address', 255),
    budgetKobo: v.nairaAmount(b.budget, 'budget', minBudgetKobo),
    isUrgent: Boolean(b.isUrgent),
    scheduledFor,
  });
  res.status(201).json({ data: task });
});

router.get('/tasks/mine', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Task.listForCustomer(req.user.id) });
});

router.post('/tasks/:id/offers/:offerId/accept', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Task.acceptOffer(req.user.id, id(req.params.id), v.positiveInt(req.params.offerId, 'offerId')) });
});

router.post('/tasks/:id/confirm', requireAuth('customer'), async (req, res) => {
  const b = req.body || {};
  const task = await Task.confirmAndReview(req.user.id, id(req.params.id), {
    rating: v.positiveInt(b.rating, 'rating', { min: 1, max: 5 }),
    comment: v.optionalString(b.comment, 'comment', 500),
  });
  res.json({ data: task });
});

router.post('/tasks/:id/cancel', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Task.cancel(req.user.id, id(req.params.id)) });
});

// ----- Taskers -----
router.get('/tasks', requireAuth(), async (req, res) => {
  res.json({ data: await Task.listOpen({ category: req.query.category, city: req.query.city, viewer: req.user }) });
});

router.get('/jobs/mine', requireAuth('tasker'), async (req, res) => {
  res.json({ data: await Task.listForTasker(req.user.id) });
});

router.post('/tasks/:id/offers', requireAuth('tasker'), async (req, res) => {
  const b = req.body || {};
  const offer = await Offer.create(req.user.id, id(req.params.id), {
    priceKobo: v.nairaAmount(b.price, 'price', minBudgetKobo),
    message: v.requiredString(b.message, 'message', 500, 5),
  });
  res.status(201).json({ data: offer });
});

router.get('/offers/mine', requireAuth('tasker'), async (req, res) => {
  res.json({ data: await Offer.listForTasker(req.user.id) });
});

router.post('/offers/:id/withdraw', requireAuth('tasker'), async (req, res) => {
  res.json({ data: await Offer.withdraw(req.user.id, id(req.params.id)) });
});

router.post('/tasks/:id/complete', requireAuth('tasker'), async (req, res) => {
  res.json({ data: await Task.markCompleted(req.user.id, id(req.params.id)) });
});

router.get('/earnings', requireAuth('tasker'), async (req, res) => {
  res.json({ data: await Offer.earnings(req.user.id) });
});

// Anyone logged in can view a task (sensitive fields are filtered by role inside the model).
router.get('/tasks/:id', requireAuth(), async (req, res) => {
  res.json({ data: await Task.getById(id(req.params.id), req.user) });
});

module.exports = router;
