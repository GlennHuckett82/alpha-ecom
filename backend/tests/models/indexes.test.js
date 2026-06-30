'use strict';
/**
 * MongoDB Index Tests (P21)
 *
 * Strategy:
 *   - beforeAll  → createIndexes() (index metadata survives afterEach wipes)
 *   - beforeEach → seed minimal documents so each test is independent
 *   - hint-based queries prove the index exists and is usable
 *   - .explain() confirms IXSCAN (index scan) not COLLSCAN (collection scan)
 *
 * jest.setup.js afterEach wipes all collections between tests, so every
 * test that needs documents seeds its own data via beforeEach.
 */

const mongoose = require('mongoose');
const Product  = require('../../models/product.model');
const Order    = require('../../models/order.model');
const Cart     = require('../../models/cart.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the explain plan string contains an index scan stage */
const hasIndexScan = (plan) => JSON.stringify(plan).includes('IXSCAN');

const makeProduct = (overrides = {}) => ({
  name:        'Test Product',
  description: 'Used in index tests.',
  price:       9.99,
  category:    'test-cat',
  stock:       10,
  ...overrides,
});

const makeOrder = (productId) => ({
  sessionId: 'idx-test-session',
  items: [{ productId, quantity: 1, priceAtPurchase: 9.99 }],
  totalAmount: 9.99,
  shippingAddress: { street: '1 Index St', city: 'London', postcode: 'SW1A 1AA', country: 'UK' },
});

// ─── Product indexes ──────────────────────────────────────────────────────────

describe('Product indexes', () => {
  beforeAll(async () => {
    // Ensure index metadata is synced to the in-memory MongoDB instance
    await Product.createIndexes();
  });

  beforeEach(async () => {
    await Product.insertMany([
      makeProduct({ name: 'Cheap Widget',  price:  4.99, category: 'widgets', stock: 10 }),
      makeProduct({ name: 'Pricey Widget', price: 49.99, category: 'widgets', stock:  5 }),
      makeProduct({ name: 'Basic Gadget',  price:  9.99, category: 'gadgets', stock:  8 }),
    ]);
  });

  // ── Compound index { category: 1, price: 1 } ────────────────────────────────

  it('hint on { category:1, price:1 } returns correct documents for a category filter', async () => {
    const results = await Product
      .find({ category: 'widgets' })
      .hint({ category: 1, price: 1 })
      .sort({ price: 1 })
      .lean();

    expect(results).toHaveLength(2);
    results.forEach((p) => expect(p.category).toBe('widgets'));
    // Results should come back cheapest-first (index order)
    expect(results[0].price).toBe(4.99);
    expect(results[1].price).toBe(49.99);
  });

  it('explain plan shows IXSCAN when hinting { category:1, price:1 }', async () => {
    const plan = await Product
      .find({ category: 'widgets' })
      .hint({ category: 1, price: 1 })
      .explain('executionStats');

    expect(hasIndexScan(plan)).toBe(true);
  });

  it('compound index covers category+price range queries (hint returns results)', async () => {
    const results = await Product
      .find({ category: 'widgets', price: { $lte: 10 } })
      .hint({ category: 1, price: 1 })
      .lean();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Cheap Widget');
  });

  // ── Stock index { stock: 1 } ─────────────────────────────────────────────────

  it('hint on { stock:1 } returns documents matching a stock filter', async () => {
    const results = await Product
      .find({ stock: { $gte: 8 } })
      .hint({ stock: 1 })
      .lean();

    expect(results).toHaveLength(2); // stock 10 and stock 8
  });

  it('explain plan shows IXSCAN when hinting { stock:1 }', async () => {
    const plan = await Product
      .find({ stock: { $gt: 0 } })
      .hint({ stock: 1 })
      .explain('executionStats');

    expect(hasIndexScan(plan)).toBe(true);
  });

  // ── Text index { name: 'text', description: 'text' } ─────────────────────────

  it('text index allows $text search on name field', async () => {
    const results = await Product
      .find({ $text: { $search: 'Cheap' } })
      .lean();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Cheap Widget');
  });

  it('text index $text search does not return documents without the keyword', async () => {
    const results = await Product
      .find({ $text: { $search: 'ZZZ_NONEXISTENT' } })
      .lean();

    expect(results).toHaveLength(0);
  });
});

// ─── Order indexes ────────────────────────────────────────────────────────────

describe('Order indexes', () => {
  let sampleProductId;

  beforeAll(async () => {
    await Order.createIndexes();
    sampleProductId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    await Order.insertMany([
      { ...makeOrder(sampleProductId), status: 'pending'   },
      { ...makeOrder(sampleProductId), status: 'pending'   },
      { ...makeOrder(sampleProductId), status: 'completed' },
    ]);
  });

  it('hint on { status:1, createdAt:-1 } returns correct documents', async () => {
    const results = await Order
      .find({ status: 'pending' })
      .hint({ status: 1, createdAt: -1 })
      .lean();

    expect(results).toHaveLength(2);
    results.forEach((o) => expect(o.status).toBe('pending'));
  });

  it('explain plan shows IXSCAN when hinting { status:1, createdAt:-1 }', async () => {
    const plan = await Order
      .find({ status: 'pending' })
      .hint({ status: 1, createdAt: -1 })
      .explain('executionStats');

    expect(hasIndexScan(plan)).toBe(true);
  });

  it('sessionId index allows hint-based session lookup', async () => {
    const results = await Order
      .find({ sessionId: 'idx-test-session' })
      .hint({ sessionId: 1 })
      .lean();

    expect(results).toHaveLength(3);
  });
});

// ─── Cart indexes ─────────────────────────────────────────────────────────────

describe('Cart indexes', () => {
  beforeAll(async () => {
    await Cart.createIndexes();
  });

  it('sessionId unique index prevents duplicate sessionId values', async () => {
    await Cart.create({ sessionId: 'unique-sess-1', items: [] });
    await expect(
      Cart.create({ sessionId: 'unique-sess-1', items: [] }),
    ).rejects.toThrow();
  });

  it('hint on { sessionId:1 } returns the correct cart', async () => {
    await Cart.create({ sessionId: 'hint-cart-sess', items: [] });
    const results = await Cart
      .find({ sessionId: 'hint-cart-sess' })
      .hint({ sessionId: 1 })
      .lean();

    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('hint-cart-sess');
  });

  it('explain plan shows IXSCAN when hinting { sessionId:1 }', async () => {
    await Cart.create({ sessionId: 'explain-cart-sess', items: [] });
    const plan = await Cart
      .find({ sessionId: 'explain-cart-sess' })
      .hint({ sessionId: 1 })
      .explain('executionStats');

    expect(hasIndexScan(plan)).toBe(true);
  });
});
