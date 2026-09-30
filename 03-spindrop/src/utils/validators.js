const HttpError = require('./httpError');

const PHONE_RE = /^(\+234|0)[789][01]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredString(value, field, maxLength = 255, minLength = 1) {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new HttpError(400, minLength > 1 ? `${field} must be at least ${minLength} characters` : `${field} is required`);
  }
  const v = value.trim();
  if (v.length > maxLength) throw new HttpError(400, `${field} must be at most ${maxLength} characters`);
  return v;
}

function optionalString(value, field, maxLength = 255) {
  if (value === undefined || value === null || value === '') return null;
  return requiredString(value, field, maxLength);
}

function positiveInt(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function email(value) {
  const v = requiredString(value, 'email', 160).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'email must be a valid email address');
  return v;
}

function phone(value) {
  const v = requiredString(value, 'phone', 20).replace(/[\s-]/g, '');
  if (!PHONE_RE.test(v)) throw new HttpError(400, 'phone must be a valid Nigerian mobile number');
  return v.startsWith('0') ? `+234${v.slice(1)}` : v;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new HttpError(400, 'password must be at least 8 characters and include a letter and a number');
  }
  if (value.length > 72) throw new HttpError(400, 'password must be at most 72 characters');
  return value;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function nairaAmount(value, field, minKobo = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `${field} must be a positive amount in naira`);
  const kobo = Math.round(n * 100);
  if (kobo < minKobo) throw new HttpError(400, `${field} must be at least NGN ${(minKobo / 100).toLocaleString('en-NG')}`);
  if (kobo > 1000000000) throw new HttpError(400, `${field} is too large`);
  return kobo;
}

module.exports = { requiredString, optionalString, positiveInt, email, phone, password, oneOf, nairaAmount };
