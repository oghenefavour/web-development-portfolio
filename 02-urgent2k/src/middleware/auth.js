const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');
const { jwtSecret, jwtExpiresIn } = require('../config/settings');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.full_name }, jwtSecret, { expiresIn: jwtExpiresIn });
}

// Requires a valid "Authorization: Bearer <token>" header. Optionally restricts to certain roles.
function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Please log in'));
    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = { id: payload.sub, role: payload.role, name: payload.name };
    } catch {
      return next(new HttpError(401, 'Your session has expired. Please log in again'));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new HttpError(403, `Only ${roles.join(' or ')} accounts can do this`));
    }
    return next();
  };
}

module.exports = { signToken, requireAuth };
