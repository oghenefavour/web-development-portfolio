const HttpError = require('./httpError');

const PHONE_RE = /^(\+234|0)[789][01]\d{8}$/;          // Nigerian mobile numbers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveInt(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function requiredString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new HttpError(400, `${field} must be at most ${maxLength} characters`);
  return trimmed;
}

function normalisePhone(value) {
  const phone = requiredString(value, 'customer.phone', 20).replace(/[\s-]/g, '');
  if (!PHONE_RE.test(phone)) throw new HttpError(400, 'customer.phone must be a valid Nigerian mobile number');
  return phone.startsWith('0') ? `+234${phone.slice(1)}` : phone;
}

function optionalEmail(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
    throw new HttpError(400, 'customer.email must be a valid email address');
  }
  return value.trim().toLowerCase();
}

function cartId(value) {
  if (!UUID_RE.test(String(value))) throw new HttpError(400, 'cartId must be a valid UUID');
  return String(value).toLowerCase();
}

module.exports = { positiveInt, requiredString, normalisePhone, optionalEmail, cartId };
