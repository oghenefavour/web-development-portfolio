const HttpError = require('../utils/httpError');

function notFound(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That record already exists' });
  const status = err.status || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test') console.error(err);
  const body = { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message };
  if (err.details) body.details = err.details;
  return res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
