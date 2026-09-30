const express = require('express');
const Pricing = require('../models/pricingModel');
const Booking = require('../models/bookingModel');
const { requireAuth } = require('../middleware/auth');
const HttpError = require('../utils/httpError');
const v = require('../utils/validators');
const settings = require('../config/settings');

const router = express.Router();

// Validates the body for each service type and returns clean input for the model.
function parseBooking(type, b = {}) {
  const input = { notes: v.optionalString(b.notes, 'notes', 500) };
  if (type === 'laundry') {
    if (!Array.isArray(b.items) || b.items.length === 0) throw new HttpError(400, 'items must list at least one garment');
    input.items = b.items.map((i) => ({
      garmentTypeId: v.positiveInt(i.garmentTypeId, 'garmentTypeId'),
      quantity: v.positiveInt(i.quantity, 'quantity', { max: settings.maxItemQuantity }),
    }));
    input.isExpress = Boolean(b.isExpress);
  } else if (type === 'cleaning') {
    input.optionCode = v.requiredString(b.optionCode, 'optionCode', 40);
    input.rooms = v.positiveInt(b.rooms, 'rooms', { max: settings.maxRooms });
  } else if (type === 'moving') {
    input.optionCode = v.requiredString(b.optionCode, 'optionCode', 40);
  }
  return input;
}

function parseLocation(type, b = {}) {
  const loc = {
    city: v.requiredString(b.city, 'city', 80),
    address: v.requiredString(b.address, type === 'moving' ? 'address (moving from)' : 'address', 255),
  };
  if (type === 'moving') loc.toAddress = v.requiredString(b.toAddress, 'toAddress (moving to)', 255);
  const d = new Date(b.scheduledFor);
  if (!b.scheduledFor || Number.isNaN(d.getTime())) throw new HttpError(400, 'scheduledFor must be a valid date and time');
  if (d.getTime() < Date.now() - 5 * 60 * 1000) throw new HttpError(400, 'scheduledFor must be in the future');
  loc.scheduledFor = d.toISOString().slice(0, 19).replace('T', ' ');
  return loc;
}

const TYPES = ['laundry', 'cleaning', 'moving'];

router.get('/pricing', async (req, res) => {
  res.json({ data: await Pricing.getPricing() });
});

// Live price quote (no login needed) so the UI shows exactly what will be charged.
router.post('/quote/:type', async (req, res) => {
  const type = v.oneOf(req.params.type, 'type', TYPES);
  const q = await Pricing.quote(type, parseBooking(type, req.body));
  res.json({ data: Pricing.formatQuote(q) });
});

router.post('/bookings/:type', requireAuth('customer'), async (req, res) => {
  const type = v.oneOf(req.params.type, 'type', TYPES);
  const input = { ...parseBooking(type, req.body), ...parseLocation(type, req.body) };
  res.status(201).json({ data: await Booking.create(req.user.id, type, input) });
});

router.get('/bookings', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Booking.listForCustomer(req.user.id) });
});

router.get('/bookings/:id', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Booking.getForCustomer(req.user.id, v.positiveInt(req.params.id, 'id')) });
});

router.post('/bookings/:id/cancel', requireAuth('customer'), async (req, res) => {
  res.json({ data: await Booking.cancel(req.user.id, v.positiveInt(req.params.id, 'id')) });
});

module.exports = router;
