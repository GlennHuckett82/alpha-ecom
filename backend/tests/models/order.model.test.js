'use strict';

/**
 * Order Model — Unit Tests (TDD Red Phase)
 * These tests are written BEFORE the model is implemented (P11).
 * All tests should FAIL until the Mongoose schema is built in P11.
 *
 * Note: subdocument error paths use bracket notation — e.g.
 * err.errors['items.0.priceAtPurchase'] — because Jest's toHaveProperty
 * splits on '.' as a path separator, which does not match Mongoose's
 * literal dot-key strings for nested validation errors.
 */

const mongoose = require('mongoose');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createProduct = async (overrides = {}) => {
  const product = new Product({
    name: 'Order Test Product',
    description: 'A product fixture used in order tests.',
    price: 25.00,
    category: 'test',
    stock: 100,
    ...overrides,
  });
  return product.save();
};

/** Returns a valid shippingAddress subdocument */
const validAddress = () => ({
  street: '123 High Street',
  city: 'London',
  postcode: 'SW1A 1AA',
  country: 'United Kingdom',
});

/** Returns a plain object representing a valid order */
const validOrderData = (productId) => ({
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  items: [
    { productId, quantity: 2, priceAtPurchase: 25.00 },
  ],
  totalAmount: 50.00,
  shippingAddress: validAddress(),
});

const getValidationError = async (doc) => {
  try {
    await doc.save();
    return null;
  } catch (err) {
    return err;
  }
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Order Model', () => {
  let productId;

  beforeAll(async () => {
    const product = await createProduct();
    productId = product._id;
  });

  // ── Valid document ────────────────────────────────────────────────────────

  describe('valid order', () => {
    it('saves successfully with all required fields', async () => {
      const order = new Order(validOrderData(productId));
      const saved = await order.save();

      expect(saved._id).toBeDefined();
      expect(mongoose.Types.ObjectId.isValid(saved._id)).toBe(true);
      expect(saved.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(saved.items).toHaveLength(1);
      expect(saved.items[0].productId.toString()).toBe(productId.toString());
      expect(saved.items[0].quantity).toBe(2);
      expect(saved.items[0].priceAtPurchase).toBe(25.00);
      expect(saved.totalAmount).toBe(50.00);
    });

    it('saves successfully with multiple items', async () => {
      const p2 = await createProduct({ name: 'Second Order Product' });
      const order = new Order({
        sessionId: 'multi-item-order-session-0000000',
        items: [
          { productId, quantity: 1, priceAtPurchase: 25.00 },
          { productId: p2._id, quantity: 3, priceAtPurchase: 10.00 },
        ],
        totalAmount: 55.00,
        shippingAddress: validAddress(),
      });
      const saved = await order.save();

      expect(saved.items).toHaveLength(2);
      expect(saved.totalAmount).toBe(55.00);
    });
  });

  // ── Required field: sessionId ─────────────────────────────────────────────

  describe('sessionId validation', () => {
    it('fails validation when sessionId is missing', async () => {
      const data = validOrderData(productId);
      delete data.sessionId;

      const order = new Order(data);
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('sessionId');
    });
  });

  // ── Status field ──────────────────────────────────────────────────────────

  describe('status validation', () => {
    it('defaults to "pending" when status is not provided', async () => {
      const order = new Order(validOrderData(productId));
      const saved = await order.save();

      expect(saved.status).toBe('pending');
    });

    it('accepts "pending" as a valid status', async () => {
      const order = new Order({ ...validOrderData(productId), status: 'pending' });
      const saved = await order.save();

      expect(saved.status).toBe('pending');
    });

    it('accepts "processing" as a valid status', async () => {
      const order = new Order({ ...validOrderData(productId), status: 'processing' });
      const saved = await order.save();

      expect(saved.status).toBe('processing');
    });

    it('accepts "completed" as a valid status', async () => {
      const order = new Order({ ...validOrderData(productId), status: 'completed' });
      const saved = await order.save();

      expect(saved.status).toBe('completed');
    });

    it('accepts "cancelled" as a valid status', async () => {
      const order = new Order({ ...validOrderData(productId), status: 'cancelled' });
      const saved = await order.save();

      expect(saved.status).toBe('cancelled');
    });

    it('fails validation when status is an unrecognised value', async () => {
      const order = new Order({ ...validOrderData(productId), status: 'refunded' });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('status');
    });

    it('fails validation when status is an empty string', async () => {
      const order = new Order({ ...validOrderData(productId), status: '' });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('status');
    });
  });

  // ── Item: priceAtPurchase ─────────────────────────────────────────────────

  describe('item priceAtPurchase validation', () => {
    it('fails validation when priceAtPurchase is missing from an item', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1 }], // no priceAtPurchase
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      // Bracket notation required for Mongoose subdocument error dot-key strings
      expect(err.errors['items.0.priceAtPurchase']).toBeDefined();
    });

    it('fails validation when priceAtPurchase is zero', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1, priceAtPurchase: 0 }],
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.priceAtPurchase']).toBeDefined();
    });

    it('fails validation when priceAtPurchase is negative', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1, priceAtPurchase: -5.00 }],
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.priceAtPurchase']).toBeDefined();
    });

    it('accepts priceAtPurchase of 0.01 (minimum valid value)', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1, priceAtPurchase: 0.01 }],
        totalAmount: 0.01,
      });
      const saved = await order.save();

      expect(saved.items[0].priceAtPurchase).toBe(0.01);
    });

    it('preserves priceAtPurchase independently of the current product price', async () => {
      // priceAtPurchase is a snapshot — it should differ from Product.price
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1, priceAtPurchase: 99.99 }],
        totalAmount: 99.99,
      });
      const saved = await order.save();

      // Product price is 25.00 but order captures 99.99 (e.g. old price)
      expect(saved.items[0].priceAtPurchase).toBe(99.99);
    });
  });

  // ── Item: quantity ────────────────────────────────────────────────────────

  describe('item quantity validation', () => {
    it('fails validation when item quantity is missing', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, priceAtPurchase: 25.00 }],
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.quantity']).toBeDefined();
    });

    it('fails validation when item quantity is zero', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 0, priceAtPurchase: 25.00 }],
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.quantity']).toBeDefined();
    });

    it('fails validation when item quantity is negative', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: -1, priceAtPurchase: 25.00 }],
      });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['items.0.quantity']).toBeDefined();
    });
  });

  // ── totalAmount ───────────────────────────────────────────────────────────

  describe('totalAmount validation', () => {
    it('fails validation when totalAmount is missing', async () => {
      const data = validOrderData(productId);
      delete data.totalAmount;

      const order = new Order(data);
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('totalAmount');
    });

    it('fails validation when totalAmount is zero', async () => {
      const order = new Order({ ...validOrderData(productId), totalAmount: 0 });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('totalAmount');
    });

    it('fails validation when totalAmount is negative', async () => {
      const order = new Order({ ...validOrderData(productId), totalAmount: -10 });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('totalAmount');
    });

    it('accepts totalAmount of 0.01 (minimum valid value)', async () => {
      const order = new Order({
        ...validOrderData(productId),
        items: [{ productId, quantity: 1, priceAtPurchase: 0.01 }],
        totalAmount: 0.01,
      });
      const saved = await order.save();

      expect(saved.totalAmount).toBe(0.01);
    });
  });

  // ── shippingAddress ───────────────────────────────────────────────────────

  describe('shippingAddress validation', () => {
    it('fails validation when shippingAddress.street is missing', async () => {
      const address = validAddress();
      delete address.street;

      const order = new Order({ ...validOrderData(productId), shippingAddress: address });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['shippingAddress.street']).toBeDefined();
    });

    it('fails validation when shippingAddress.city is missing', async () => {
      const address = validAddress();
      delete address.city;

      const order = new Order({ ...validOrderData(productId), shippingAddress: address });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['shippingAddress.city']).toBeDefined();
    });

    it('fails validation when shippingAddress.postcode is missing', async () => {
      const address = validAddress();
      delete address.postcode;

      const order = new Order({ ...validOrderData(productId), shippingAddress: address });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['shippingAddress.postcode']).toBeDefined();
    });

    it('fails validation when shippingAddress.country is missing', async () => {
      const address = validAddress();
      delete address.country;

      const order = new Order({ ...validOrderData(productId), shippingAddress: address });
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      expect(err.errors['shippingAddress.country']).toBeDefined();
    });

    it('fails validation when shippingAddress is missing entirely', async () => {
      const data = validOrderData(productId);
      delete data.shippingAddress;

      const order = new Order(data);
      const err = await getValidationError(order);

      expect(err).not.toBeNull();
      // At least one shippingAddress sub-field should be flagged
      const hasAddressError = Object.keys(err.errors).some((key) =>
        key.startsWith('shippingAddress'),
      );
      expect(hasAddressError).toBe(true);
    });
  });

  // ── Timestamps ───────────────────────────────────────────────────────────

  describe('timestamps', () => {
    it('automatically sets createdAt when an order is saved', async () => {
      const before = new Date();
      const order = new Order(validOrderData(productId));
      const saved = await order.save();
      const after = new Date();

      expect(saved.createdAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(saved.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('automatically sets updatedAt when an order is saved', async () => {
      const order = new Order(validOrderData(productId));
      const saved = await order.save();

      expect(saved.updatedAt).toBeDefined();
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });

    it('updates updatedAt when the order status changes', async () => {
      const order = new Order(validOrderData(productId));
      const saved = await order.save();
      const originalUpdatedAt = saved.updatedAt;

      await new Promise((resolve) => { setTimeout(resolve, 10); });

      saved.status = 'processing';
      const updated = await saved.save();

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
