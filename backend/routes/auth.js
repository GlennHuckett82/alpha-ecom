'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const router = Router();

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', [
  body('email')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 characters'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  try {
    const { email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hash });

    return res.status(201).json({
      success: true,
      data: { id: user._id, email: user.email },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('password is required'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  try {
    const { email, password } = req.body;

    // Explicitly request the password field (select: false by default)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Return the same message for wrong email or wrong password to prevent enumeration
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' },
    );

    return res.status(200).json({ success: true, token });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
