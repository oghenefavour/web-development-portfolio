const express = require('express');
const User = require('../models/userModel');
const { signToken, requireAuth } = require('../middleware/auth');
const HttpError = require('../utils/httpError');
const v = require('../utils/validators');

const router = express.Router();
const pub = ({ full_name, ...u }) => u;

const person = (b) => ({
  fullName: v.requiredString(b.fullName, 'fullName', 120, 3),
  email: v.email(b.email),
  phone: v.phone(b.phone),
  password: v.password(b.password),
});

router.get('/packages', async (req, res) => {
  res.json({ data: await User.listPackages() });
});

router.post('/auth/register-company', async (req, res) => {
  const b = req.body || {};
  const user = await User.registerCompany({
    ...person(b),
    companyName: v.requiredString(b.companyName, 'companyName', 120, 2),
    city: v.requiredString(b.city, 'city', 80),
    packageCode: v.requiredString(b.packageCode, 'packageCode', 20),
  });
  res.status(201).json({ token: signToken(user), user: pub(user) });
});

router.post('/auth/register-restaurant', async (req, res) => {
  const b = req.body || {};
  const user = await User.registerRestaurant({
    ...person(b),
    restaurantName: v.requiredString(b.restaurantName, 'restaurantName', 120, 2),
    address: v.requiredString(b.address, 'address', 255),
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
  if (!user || !user.isActive) throw new HttpError(401, 'Please log in again');
  res.json({ user: pub(user) });
});

module.exports = router;
