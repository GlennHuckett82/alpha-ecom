'use strict';

/**
 * Cart API Routes — Supertest Tests (TDD Red Phase)
 * Written BEFORE the routes are implemented.
 *
 * Response contract (all routes):
 *   success  { success: true,  data: <cart> }
 *   failure  { success: false, error: <string> }
 *
 * Populate behaviour:
 *   GET  — items[].productId is a populated object { _id, name, price, imageUrl, stock }
 *   POST/PUT/DELETE — items[].productId is an ObjectId string (no populate for mutations)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'test-session-abc-123';

const makeProduct = (overrides = {}) => ({
  name: 'Cart Test Product',
  description: 'A product used in cart route tests.',
  price: 29.99,
  category: 'electronics',
  stock: 10,
  imageUrl: 'https://example.com/img.webp',
  ...overrides,
});

// ─── GET /api/cart/:sessionId ─────────────────────────────────────────────────

describe('GET /api/cart/:sessionId', () => {
  it('returns 404 when session does not exist', async () => {
    const res = await request(app).get('/api/cart/nonexistent-session');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 200 with { success: true, data } when cart exists', async () => {
    await Cart.create({ sessionId: SESSION_ID, items: [] });

    const res = await request(app).get(`/api/cart/${SESSION_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.sessionId).toBe(SESSION_ID);
  });

  it('returns an empty items array when cart has no items', async () => {
    await Cart.create({ sessionId: SESSION_ID, items: [] });

    const res = await request(app).get(`/api/cart/${SESSION_ID}`);

    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('returns populated product data within items', async () => {
    const product = await Product.create(makeProduct());
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 3 }],
    });

    const res = await request(app).get(`/api/cart/${SESSION_ID}`);

    expect(res.statusCode).toBe(200);
    const item = res.body.data.items[0];
    expect(item.quantity).toBe(3);
    expect(item.productId).toHaveProperty('name');
    expect(item.productId).toHaveProperty('price');
    expect(item.productId).toHaveProperty('imageUrl');
    expect(item.productId).toHaveProperty('stock');
    expect(item.productId).not.toHaveProperty('category'); // only selected fields
  });
});

// ─── POST /api/cart ───────────────────────────────────────────────────────────

describe('POST /api/cart', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create(makeProduct());
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  describe('body validation', () => {
    it('returns 422 when sessionId is missing', async () => {
      const res = await request(app).post('/api/cart')
        .send({ productId: product._id.toString(), quantity: 1 });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 422 when sessionId is an empty string', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: '', productId: product._id.toString(), quantity: 1 });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when productId is missing', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, quantity: 1 });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when productId is not a valid ObjectId', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: 'not-an-id', quantity: 1 });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when quantity is missing', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString() });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when quantity is 0', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 0 });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when quantity is negative', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: -5 });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when quantity is a float', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 1.5 });

      expect(res.statusCode).toBe(422);
    });
  });

  // ── New cart creation ────────────────────────────────────────────────────────

  describe('creates a new cart', () => {
    it('returns 201 when no cart exists for the session', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 2 });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('creates the cart with the correct sessionId', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 2 });

      expect(res.body.data.sessionId).toBe(SESSION_ID);
    });

    it('creates the cart with one item at the requested quantity', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 2 });

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(2);
    });

    it('persists the cart to the database', async () => {
      await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 2 });

      const cart = await Cart.findOne({ sessionId: SESSION_ID });
      expect(cart).not.toBeNull();
      expect(cart.items).toHaveLength(1);
    });
  });

  // ── Adding to existing cart ──────────────────────────────────────────────────

  describe('adds to an existing cart', () => {
    it('returns 200 when cart already exists', async () => {
      await Cart.create({ sessionId: SESSION_ID, items: [] });

      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 1 });

      expect(res.statusCode).toBe(200);
    });

    it('appends a new product to an existing cart', async () => {
      await Cart.create({ sessionId: SESSION_ID, items: [] });

      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 3 });

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(3);
    });

    it('increments quantity when the same product is added again', async () => {
      await Cart.create({
        sessionId: SESSION_ID,
        items: [{ productId: product._id, quantity: 2 }],
      });

      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 3 });

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(5);
    });

    it('keeps other items intact when adding a new product', async () => {
      const otherProduct = await Product.create(makeProduct({ name: 'Other Product' }));
      await Cart.create({
        sessionId: SESSION_ID,
        items: [{ productId: otherProduct._id, quantity: 1 }],
      });

      await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 2 });

      const cart = await Cart.findOne({ sessionId: SESSION_ID });
      expect(cart.items).toHaveLength(2);
    });
  });

  // ── Stock validation ─────────────────────────────────────────────────────────

  describe('stock validation', () => {
    it('returns 422 when quantity exceeds available stock', async () => {
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 999 });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/insufficient stock/i);
    });

    it('returns 404 when product does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: nonExistentId, quantity: 1 });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('succeeds when quantity exactly equals stock', async () => {
      // product has stock=10
      const res = await request(app).post('/api/cart')
        .send({ sessionId: SESSION_ID, productId: product._id.toString(), quantity: 10 });

      expect(res.statusCode).toBe(201);
    });
  });
});

// ─── PUT /api/cart/:sessionId/items/:productId ────────────────────────────────

describe('PUT /api/cart/:sessionId/items/:productId', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create(makeProduct());
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 422 for an invalid productId in the URL', async () => {
    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/not-an-id`)
      .send({ quantity: 2 });

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when quantity body field is missing', async () => {
    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({});

    expect(res.statusCode).toBe(422);
  });

  it('returns 422 when quantity is 0', async () => {
    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: 0 });

    expect(res.statusCode).toBe(422);
  });

  it('returns 422 when quantity is negative', async () => {
    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: -2 });

    expect(res.statusCode).toBe(422);
  });

  // ── 404 cases ────────────────────────────────────────────────────────────────

  it('returns 404 when the cart session does not exist', async () => {
    const res = await request(app)
      .put(`/api/cart/nonexistent-session/items/${product._id}`)
      .send({ quantity: 2 });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 when the product is not in the cart', async () => {
    await Cart.create({ sessionId: SESSION_ID, items: [] });

    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: 2 });

    expect(res.statusCode).toBe(404);
  });

  // ── Successful update ────────────────────────────────────────────────────────

  it('returns 200 with { success: true, data: cart } on success', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 1 }],
    });

    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: 5 });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('updates the item to the new quantity', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 1 }],
    });

    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: 7 });

    expect(res.body.data.items[0].quantity).toBe(7);
  });

  // ── Stock validation ─────────────────────────────────────────────────────────

  it('returns 422 when new quantity exceeds available stock', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 1 }],
    });

    const res = await request(app)
      .put(`/api/cart/${SESSION_ID}/items/${product._id}`)
      .send({ quantity: 999 });

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toMatch(/insufficient stock/i);
  });
});

// ─── DELETE /api/cart/:sessionId/items/:productId ─────────────────────────────

describe('DELETE /api/cart/:sessionId/items/:productId', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create(makeProduct());
  });

  it('returns 422 for an invalid productId in the URL', async () => {
    const res = await request(app)
      .delete(`/api/cart/${SESSION_ID}/items/not-an-id`);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when the cart session does not exist', async () => {
    const res = await request(app)
      .delete(`/api/cart/nonexistent-session/items/${product._id}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 when the item is not in the cart', async () => {
    await Cart.create({ sessionId: SESSION_ID, items: [] });

    const res = await request(app)
      .delete(`/api/cart/${SESSION_ID}/items/${product._id}`);

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with { success: true, data: cart } after removal', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 2 }],
    });

    const res = await request(app)
      .delete(`/api/cart/${SESSION_ID}/items/${product._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('removes only the targeted item, leaving others intact', async () => {
    const otherProduct = await Product.create(makeProduct({ name: 'Other Product' }));
    await Cart.create({
      sessionId: SESSION_ID,
      items: [
        { productId: product._id, quantity: 2 },
        { productId: otherProduct._id, quantity: 1 },
      ],
    });

    const res = await request(app)
      .delete(`/api/cart/${SESSION_ID}/items/${product._id}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productId.toString()).toBe(otherProduct._id.toString());
  });

  it('returns an empty items array when the last item is removed', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 2 }],
    });

    const res = await request(app)
      .delete(`/api/cart/${SESSION_ID}/items/${product._id}`);

    expect(res.body.data.items).toHaveLength(0);
  });
});

// ─── DELETE /api/cart/:sessionId ──────────────────────────────────────────────

describe('DELETE /api/cart/:sessionId', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create(makeProduct());
  });

  it('returns 404 when cart session does not exist', async () => {
    const res = await request(app).delete('/api/cart/nonexistent-session');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 200 with { success: true, data: cart } after clearing', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 3 }],
    });

    const res = await request(app).delete(`/api/cart/${SESSION_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('empties the items array in the response', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 3 }],
    });

    const res = await request(app).delete(`/api/cart/${SESSION_ID}`);

    expect(res.body.data.items).toHaveLength(0);
  });

  it('cart document still exists in the DB after clear (not deleted)', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 1 }],
    });

    await request(app).delete(`/api/cart/${SESSION_ID}`);

    const cart = await Cart.findOne({ sessionId: SESSION_ID });
    expect(cart).not.toBeNull();
    expect(cart.items).toHaveLength(0);
  });

  it('sessionId is preserved after clearing', async () => {
    await Cart.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 1 }],
    });

    const res = await request(app).delete(`/api/cart/${SESSION_ID}`);

    expect(res.body.data.sessionId).toBe(SESSION_ID);
  });
});
