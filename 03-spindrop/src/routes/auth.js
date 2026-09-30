const express = require('express');
const User = require('../models/userModel');
const { signToken, requireAuth } = require('../middleware/auth');
const HttpError = require('../utils/httpError');
const v = require('../utils/validators');

const router = express.Router();
const pub = ({ full_name, ...u }) => u;

router.post('/auth/register', async (req, res) => {
  const b = req.body || {};
  const user = await User.register({
    // Admin (laundromat staff) accounts can't be self-registered.
    role: v.oneOf(b.role, 'role', ['customer', 'rider', 'cleaner', 'mover']),
    fullName: v.requiredString(b.fullName, 'fullName', 120, 3),
    email: v.email(b.email),
    phone: v.phone(b.phone),
    password: v.password(b.password),
    city: v.requiredString(b.city, 'city', 80),
  });
  res.status(201).json({ token: signToken(user), user: pub(user) });
});

router.post('/auth/login', async (req, res) => {
  const b = req.body || {};
  if (typeof b.email !== 'string' || typeof b.password !== 'string') throw new HttpError(400, 'email and password are required');
  const user = await User.authenticate(b.email.trim().toLowerCase(), b.password);
  res.json({ token: signToken(user), user: pub(user) });
});

router.get('/me', requireAuth(), async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: pub(user) });
});

module.exports = router;
