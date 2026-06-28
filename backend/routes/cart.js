'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const Cart = require('../models/cart.model');
const { checkStock } = require('../services/inventoryService');

const router = Router();

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Returns 422 if express-validator found errors, otherwise null. */
const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/** Maps inventoryService errors to the correct HTTP status code. */
const handleInventoryError = (err, res) => {
  if (/not found/i.test(err.message)) {
    res.status(404).json({ success: false, error: err.message });
    return true;
  }
  if (/insufficient stock/i.test(err.message)) {
    res.status(422).json({ success: false, error: err.message });
    return true;
  }
  return false;
};

// ─── Reusable validation chains ───────────────────────────────────────────────

const productIdParam = param('productId')
  .isMongoId()
  .withMessage('productId must be a valid MongoDB ObjectId');

const quantityBody = body('quantity')
  .isInt({ min: 1 })
  .withMessage('quantity must be a positive integer')
  .toInt();

// ─── GET /api/cart/:sessionId ─────────────────────────────────────────────────

router.get('/:sessionId', async (req, res, next) => {
  try {
    const cart = await Cart
      .findOne({ sessionId: req.params.sessionId })
      .populate('items.productId', 'name price imageUrl stock');

    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/cart ───────────────────────────────────────────────────────────
// Creates cart if needed; increments quantity if item already present.

router.post('/', [
  body('sessionId')
    .notEmpty()
    .withMessage('sessionId is required')
    .trim()
    .escape(),
  body('productId')
    .isMongoId()
    .withMessage('productId must be a valid MongoDB ObjectId'),
  quantityBody,
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  const { sessionId, productId, quantity } = req.body;

  try {
    // Validate stock before touching the cart
    await checkStock(productId, quantity);

    let cart = await Cart.findOne({ sessionId });
    const isNew = !cart;

    if (isNew) {
      cart = new Cart({ sessionId, items: [{ productId, quantity }] });
    } else {
      const existingIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId,
      );
      if (existingIndex === -1) {
        cart.items.push({ productId, quantity });
      } else {
        cart.items[existingIndex].quantity += quantity;
      }
    }

    await cart.save();

    return res.status(isNew ? 201 : 200).json({ success: true, data: cart });
  } catch (err) {
    if (handleInventoryError(err, res)) return;
    return next(err);
  }
});

// ─── PUT /api/cart/:sessionId/items/:productId ────────────────────────────────
// Sets the item quantity to an exact value (replaces, does not add).

router.put('/:sessionId/items/:productId', [
  productIdParam,
  quantityBody,
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  const { sessionId, productId } = req.params;
  const { quantity } = req.body;

  try {
    const cart = await Cart.findOne({ sessionId });
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId,
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'Item not found in cart' });
    }

    // Validate new quantity against current stock
    await checkStock(productId, quantity);

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    if (handleInventoryError(err, res)) return;
    return next(err);
  }
});

// ─── DELETE /api/cart/:sessionId/items/:productId ─────────────────────────────
// Removes a single item from the cart.
// Must be defined BEFORE DELETE /:sessionId to avoid route shadowing.

router.delete('/:sessionId/items/:productId', [
  productIdParam,
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  const { sessionId, productId } = req.params;

  try {
    const cart = await Cart.findOne({ sessionId });
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId,
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'Item not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
});

// ─── DELETE /api/cart/:sessionId ──────────────────────────────────────────────
// Clears all items from the cart (document is kept, items array emptied).

router.delete('/:sessionId', async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ sessionId: req.params.sessionId });
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    cart.items = [];
    await cart.save();

    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
