'use strict';

/**
 * notFoundHandler - catches any request that reaches this point without
 * a matching route and replies with a uniform 404 JSON response.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
};

/**
 * validationErrorHandler - handles validation errors.
 * Only intercepts errors with statusCode 422 AND an errors array;
 * everything else is forwarded to generalErrorHandler.
 */
const validationErrorHandler = (err, req, res, next) => {
  if (err.statusCode === 422 && Array.isArray(err.errors)) {
    return res.status(422).json({ success: false, errors: err.errors });
  }
  return next(err);
};

/**
 * generalErrorHandler - last-resort 500 handler.
 * Logs the full stack in non-production environments only.
 */
// eslint-disable-next-line no-unused-vars
const generalErrorHandler = (err, req, res, next) => {
  // Respect an explicit HTTP status code set on the error (e.g. 403 from CORS)
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  if (status === 500 && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[Server Error]', err.stack || err.message);
  }
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && status === 500
    ? 'An internal server error occurred'
    : (err.message || 'An internal server error occurred');
  return res.status(status).json({ success: false, error: message });
};

module.exports = { notFoundHandler, validationErrorHandler, generalErrorHandler };
