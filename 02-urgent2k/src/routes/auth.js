const express = require('express');
const User = require('../models/userModel');
const { signToken, requireAuth } = require('../middleware/auth');
const HttpError = require('../utils/httpError');
const v = require('../utils/validators');

const router = express.Router();
const publicUser = ({ full_name, ...u }) => u;

router.post('/auth/register', async (req, res) => {
  const b = req.body || {};
  const role = v.oneOf(b.role, 'role', ['customer', 'tasker']);
  const data = {
    role,
    fullName: v.requiredString(b.fullName, 'fullName', 120, 3),
    email: v.email(b.email),
    phone: v.phone(b.phone),
    password: v.password(b.password),
    city: v.requiredString(b.city, 'city', 80),
    bio: null,
    categoryIds: [],
  };
  if (role === 'tasker') {
    if (!Array.isArray(b.categoryIds) || b.categoryIds.length === 0) {
      throw new HttpError(400, 'Taskers must choose at least one skill category');
    }
    data.categoryIds = [...new Set(b.categoryIds.map((id) => v.positiveInt(id, 'categoryIds')))];
    data.bio = v.optionalString(b.bio, 'bio', 500);
  }
  const user = await User.register(data);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/auth/login', async (req, res) => {
  const b = req.body || {};
  if (typeof b.email !== 'string' || typeof b.password !== 'string') throw new HttpError(400, 'email and password are required');
  const row = await User.authenticate(b.email.trim().toLowerCase(), b.password);
  const user = await User.findById(row.id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth(), async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
});

router.get('/categories', async (req, res) => {
  res.json({ data: await User.listCategories() });
});

router.get('/taskers', async (req, res) => {
  res.json({ data: await User.listTaskers({ category: req.query.category, city: req.query.city }) });
});

module.exports = router;
