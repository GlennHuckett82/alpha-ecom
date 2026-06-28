'use strict';

const jwt = require('jsonwebtoken');

/**
 * protect - JWT authentication guard.
 *
 * Expects:  Authorization: Bearer <token>
 * Success:  attaches decoded payload to req.user, calls next()
 * Failure:  responds 401
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

module.exports = { protect };
