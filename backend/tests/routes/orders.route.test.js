'use strict';

/**
 * Orders API Routes — Supertest Tests (TDD Red Phase)
 * Written BEFORE the routes are implemented.
 *
 * POST /api/orders flow under test:
 *   validate body → find cart → checkStock each item → calculateTotal →
 *   processPayment → decrementStock (w/ rollback) → Order.create → Cart.deleteOne
 *
 * Response contract:
 *   success  { success: true,  data: <order> }
 *   failure  { success: false, error: <string> }
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Order = require('../../models/order.model');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SESSION_ID = 'order-test-session-001';

const validShipping = {
  street: '123 Test Street',
  city: 'London',
  postcode: 'SW1A 1AA',
  country: 'United Kingdom',
};

const makeProduct = (overrides = {}) => ({
  name: 'Order Test Product',
  description: 'A product used in order route tests.',
  price: 49.99,
  category: 'electronics',
  stock: 10,
  imageUrl: 'https://example.com/prod.webp',
  ...overrides,
});

/** Creates a product + a cart with one item, returns { product, cart } */
const seedCartWithProduct = async (productOverrides = {}, quantity = 2) => {
  const product = await Product.create(makeProduct(productOverrides));
  const cart = await Cart.create({
    sessionId: SESSION_ID,
    items: [{ productId: product._id, quantity }],
  });
  return { product, cart };
};

// ─── POST /api/orders ─────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  // ── Body validation ──────────────────────────────────────────────────────────

  describe('body validation', () => {
    it('returns 422 when sessionId is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        shippingAddress: validShipping,
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 422 when shippingAddress is missing entirely', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when shippingAddress.street is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: { city: 'London', postcode: 'SW1A 1AA', country: 'UK' },
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when shippingAddress.city is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: { street: '1 Road', postcode: 'SW1A 1AA', country: 'UK' },
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when shippingAddress.postcode is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: { street: '1 Road', city: 'London', country: 'UK' },
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when shippingAddress.country is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: { street: '1 Road', city: 'London', postcode: 'SW1A 1AA' },
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when cardLastFour is missing', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when cardLastFour is fewer than 4 digits', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '123',
      });

      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when cardLastFour contains non-digit characters', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '12ab',
      });

      expect(res.statusCode).toBe(422);
    });
  });

  // ── Business logic errors ────────────────────────────────────────────────────

  describe('business logic errors', () => {
    it('returns 404 when no cart exists for the sessionId', async () => {
      const res = await request(app).post('/api/orders').send({
        sessionId: 'no-cart-for-this-session',
        shippingAddress: validShipping,
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/cart.*not found|not found.*cart/i);
    });

    it('returns 422 when the cart exists but is empty', async () => {
      await Cart.create({ sessionId: SESSION_ID, items: [] });

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/empty/i);
    });

    it('returns 422 when a cart item has insufficient stock', async () => {
      // product stock=2 but cart quantity=5
      await seedCartWithProduct({ stock: 2 }, 5);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '1234',
      });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/insufficient stock/i);
    });

    it('does not decrement stock when stock check fails', async () => {
      const { product } = await seedCartWithProduct({ stock: 2 }, 5);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '1234',
      });

      const unchanged = await Product.findById(product._id);
      expect(unchanged.stock).toBe(2);
    });
  });

  // ── Successful order creation ─────────────────────────────────────────────────

  describe('successful order creation', () => {
    it('returns 201 with { success: true, data: order }', async () => {
      await seedCartWithProduct({}, 2);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data._id).toBeDefined();
    });

    it('order has the correct sessionId', async () => {
      await seedCartWithProduct({}, 2);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      expect(res.body.data.sessionId).toBe(SESSION_ID);
    });

    it('order status defaults to "pending"', async () => {
      await seedCartWithProduct({}, 2);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      expect(res.body.data.status).toBe('pending');
    });

    it('order totalAmount equals product price × quantity', async () => {
      const { product } = await seedCartWithProduct({ price: 29.99 }, 3);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const expectedTotal = Math.round(29.99 * 3 * 100) / 100;
      expect(res.body.data.totalAmount).toBe(expectedTotal);
    });

    it('order item has priceAtPurchase equal to the product price at time of order', async () => {
      const { product } = await seedCartWithProduct({ price: 49.99 }, 2);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      expect(res.body.data.items[0].priceAtPurchase).toBe(49.99);
    });

    it('order item quantity matches the cart quantity', async () => {
      await seedCartWithProduct({}, 3);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      expect(res.body.data.items[0].quantity).toBe(3);
    });

    it('order shippingAddress matches the submitted address', async () => {
      await seedCartWithProduct({}, 1);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const addr = res.body.data.shippingAddress;
      expect(addr.street).toBe(validShipping.street);
      expect(addr.city).toBe(validShipping.city);
      expect(addr.postcode).toBe(validShipping.postcode);
      expect(addr.country).toBe(validShipping.country);
    });

    it('cart is deleted after a successful order', async () => {
      await seedCartWithProduct({}, 2);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const cart = await Cart.findOne({ sessionId: SESSION_ID });
      expect(cart).toBeNull();
    });

    it('product stock is decremented by the ordered quantity', async () => {
      const { product } = await seedCartWithProduct({ stock: 10 }, 3);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const updated = await Product.findById(product._id);
      expect(updated.stock).toBe(7); // 10 - 3
    });

    it('order is persisted to the database', async () => {
      await seedCartWithProduct({}, 2);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const saved = await Order.findById(res.body.data._id);
      expect(saved).not.toBeNull();
      expect(saved.sessionId).toBe(SESSION_ID);
    });

    it('handles a cart with multiple different products correctly', async () => {
      const product1 = await Product.create(makeProduct({ price: 10.00, stock: 5 }));
      const product2 = await Product.create(makeProduct({ name: 'Second Product', price: 20.00, stock: 5 }));
      await Cart.create({
        sessionId: SESSION_ID,
        items: [
          { productId: product1._id, quantity: 2 },
          { productId: product2._id, quantity: 1 },
        ],
      });

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '9999',
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.items).toHaveLength(2);
      // 10*2 + 20*1 = 40
      expect(res.body.data.totalAmount).toBe(40.00);

      const p1 = await Product.findById(product1._id);
      const p2 = await Product.findById(product2._id);
      expect(p1.stock).toBe(3);
      expect(p2.stock).toBe(4);
    });
  });

  // ── Payment declined ─────────────────────────────────────────────────────────

  describe('payment declined', () => {
    it('returns 422 when the calculated total exceeds the payment threshold', async () => {
      // price=1000, quantity=11 → total=11000 (> 9999 decline threshold)
      await seedCartWithProduct({ price: 1000, stock: 20 }, 11);

      const res = await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '0000',
      });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/declined/i);
    });

    it('does not decrement stock when payment is declined', async () => {
      const { product } = await seedCartWithProduct({ price: 1000, stock: 20 }, 11);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '0000',
      });

      const unchanged = await Product.findById(product._id);
      expect(unchanged.stock).toBe(20);
    });

    it('does not delete the cart when payment is declined', async () => {
      await seedCartWithProduct({ price: 1000, stock: 20 }, 11);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '0000',
      });

      const cart = await Cart.findOne({ sessionId: SESSION_ID });
      expect(cart).not.toBeNull();
    });

    it('does not create an order record when payment is declined', async () => {
      await seedCartWithProduct({ price: 1000, stock: 20 }, 11);

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '0000',
      });

      const count = await Order.countDocuments({ sessionId: SESSION_ID });
      expect(count).toBe(0);
    });
  });

  // ── Stock rollback ───────────────────────────────────────────────────────────

  describe('stock rollback on order save failure', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('restores decremented stock when Order.create throws', async () => {
      const { product } = await seedCartWithProduct({ stock: 10 }, 3);

      // Force the Order model create to fail after stock has been decremented
      jest.spyOn(Order, 'create').mockRejectedValueOnce(new Error('DB write error'));

      await request(app).post('/api/orders').send({
        sessionId: SESSION_ID,
        shippingAddress: validShipping,
        cardLastFour: '4242',
      });

      const restored = await Product.findById(product._id);
      expect(restored.stock).toBe(10); // stock rolled back to original
    });
  });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  let order;

  beforeEach(async () => {
    const product = await Product.create(makeProduct());
    order = await Order.create({
      sessionId: SESSION_ID,
      items: [{ productId: product._id, quantity: 2, priceAtPurchase: 49.99 }],
      totalAmount: 99.98,
      shippingAddress: validShipping,
    });
  });

  it('returns 200 with { success: true, data: order } for a valid id', async () => {
    const res = await request(app).get(`/api/orders/${order._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data._id).toBe(order._id.toString());
  });

  it('returns the correct order fields', async () => {
    const res = await request(app).get(`/api/orders/${order._id}`);
    const { data } = res.body;

    expect(data.sessionId).toBe(SESSION_ID);
    expect(data.totalAmount).toBe(99.98);
    expect(data.status).toBe('pending');
    expect(data.shippingAddress.city).toBe(validShipping.city);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(1);
  });

  it('returns 404 with { success: false } when order does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/orders/${nonExistentId}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 422 when id is not a valid ObjectId', async () => {
    const res = await request(app).get('/api/orders/not-a-valid-id');

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
