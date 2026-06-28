'use strict';

const { Router } = require('express');
const { query, param, validationResult } = require('express-validator');
const Product = require('../models/product.model');

const router = Router();

/** Sends a 422 with the express-validator error array */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }
  return null;
};

// ─── Validation rules ─────────────────────────────────────────────────────────

const listValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('limit must be a positive integer')
    .toInt(),
  query('category')
    .optional()
    .trim()
    .escape(),
  query('search')
    .optional()
    .trim(),
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('id must be a valid MongoDB ObjectId'),
];

// ─── GET /api/products ────────────────────────────────────────────────────────

router.get('/', listValidation, async (req, res, next) => {
  const invalid = handleValidationErrors(req, res);
  if (invalid) return;

  try {
    const page  = req.query.page  || 1;
    const limit = Math.min(req.query.limit || 12, 50);
    const skip  = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category.toLowerCase();
    }
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [products, total] = await Promise.all([
      Product.find(filter).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────

router.get('/:id', idValidation, async (req, res, next) => {
  const invalid = handleValidationErrors(req, res);
  if (invalid) return;

  try {
    const product = await Product.findById(req.params.id).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

