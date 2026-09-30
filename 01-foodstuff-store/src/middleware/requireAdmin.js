const crypto = require('crypto');
const HttpError = require('../utils/httpError');
const { adminApiKey } = require('../config/settings');

// Simple API-key guard for admin endpoints. Uses a constant-time comparison.
module.exports = function requireAdmin(req, res, next) {
  const provided = req.get('x-admin-key') || '';
  const expected = adminApiKey;
  const ok = expected.length > 0
    && provided.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) return next(new HttpError(401, 'Admin API key missing or invalid'));
  return next();
};
