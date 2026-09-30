const express = require('express');
const Order = require('../models/orderModel');
const requireAdmin = require('../middleware/requireAdmin');
const HttpError = require('../utils/httpError');
const {
  cartId, requiredString, normalisePhone, optionalEmail, positiveInt,
} = require('../utils/validators');

const router = express.Router();

// Checkout: turn a cart into an order.
router.post('/orders', async (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  const customer = {
    name: requiredString(c.name, 'customer.name', 120),
    phone: normalisePhone(c.phone),
    email: optionalEmail(c.email),
    address: requiredString(c.address, 'customer.address', 255),
    city: requiredString(c.city, 'customer.city', 80),
  };
  const order = await Order.checkout(cartId(b.cartId), customer);
  res.status(201).json({ data: order });
});

// Customers track an order with its reference plus the phone number used at checkout.
router.get('/orders/track/:reference', async (req, res) => {
  const order = await Order.findByReference(String(req.params.reference).toUpperCase());
  const phone = req.query.phone ? normalisePhone(req.query.phone) : null;
  if (!order || !phone || order.customer.phone !== phone) {
    throw new HttpError(404, 'No order found with that reference and phone number');
  }
  res.json({ data: order });
});

// Admin: list and manage orders.
router.get('/orders', requireAdmin, async (req, res) => {
  const status = req.query.status;
  if (status && !Object.hasOwn(Order.TRANSITIONS, status)) throw new HttpError(400, 'Unknown status filter');
  const page = req.query.page ? positiveInt(req.query.page, 'page') : 1;
  const limit = req.query.limit ? positiveInt(req.query.limit, 'limit', { max: 100 }) : 20;
  res.json(await Order.list({ status, page, limit }));
});

router.get('/orders/:reference', requireAdmin, async (req, res) => {
  const order = await Order.findByReference(String(req.params.reference).toUpperCase());
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ data: order });
});

router.patch('/orders/:reference/status', requireAdmin, async (req, res) => {
  const status = requiredString((req.body || {}).status, 'status', 30);
  const order = await Order.updateStatus(String(req.params.reference).toUpperCase(), status);
  res.json({ data: order });
});

module.exports = router;
