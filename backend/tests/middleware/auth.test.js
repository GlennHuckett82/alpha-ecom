'use strict';
/**
 * Auth Middleware — Tests (P20)
 *
 * protect middleware:
 *   - 401 when Authorization header is absent
 *   - 401 when header does not start with "Bearer "
 *   - 401 for invalid / expired tokens
 *   - next() called and req.user populated for valid tokens
 *
 * Integration against the real app:
 *   - POST /api/orders → 401 with no token
 *   - GET /api/orders/:id → 401 with no token
 *   - Protected routes pass auth gate with a valid token
 */

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/user.model');

const SECRET = process.env.JWT_SECRET || 'test-secret';

// ─── Unit: protect middleware in isolation ────────────────────────────────────

describe('protect middleware (unit)', () => {
  let testApp;

  beforeAll(() => {
    const { protect } = require('../../middleware/auth');
    testApp = express();
    testApp.use(express.json());

    // Protected route: echoes req.user back so we can inspect it
    testApp.get('/protected', protect, (req, res) => {
      res.json({ success: true, user: req.user });
    });
  });

  const makeToken = (payload = { id: 'abc123', email: 'u@test.com' }, opts = {}) =>
    jwt.sign(payload, SECRET, { expiresIn: '1h', ...opts });

  it('returns 401 when Authorization header is missing entirely', async () => {
    const res = await request(testApp).get('/protected');
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', 'Token some-token');
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for a syntactically invalid token', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const badToken = jwt.sign({ id: 'x' }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    // expiresIn: 0 creates a token that is already expired
    const expiredToken = jwt.sign({ id: 'x', email: 'x@x.com' }, SECRET, { expiresIn: 0 });
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.statusCode).toBe(401);
  });

  it('calls next() and returns 200 for a valid token', async () => {
    const token = makeToken();
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('attaches decoded payload to req.user', async () => {
    const payload = { id: 'user-id-42', email: 'check@test.com' };
    const token = makeToken(payload);
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.user.id).toBe(payload.id);
    expect(res.body.user.email).toBe(payload.email);
  });
});

// ─── Integration: protect applied to orders routes ───────────────────────────

describe('protect middleware (integration — orders routes)', () => {
  let validToken;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Pass99!', 10);
    const user = await User.create({ email: 'auth-int@test.com', password: hash });
    validToken = jwt.sign({ id: user._id, email: user.email }, SECRET, { expiresIn: '24h' });
  });

  // ── No token → 401 ──────────────────────────────────────────────────────────

  it('POST /api/orders returns 401 with no Authorization header', async () => {
    const res = await request(app).post('/api/orders').send({
      sessionId: 'sess-1',
      shippingAddress: { street: '1 St', city: 'London', postcode: 'SW1', country: 'UK' },
      cardLastFour: '1234',
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/orders/:id returns 401 with no Authorization header', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/orders/${fakeId}`);
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── Valid token → auth passes (route may still fail for other reasons) ───────

  it('POST /api/orders passes auth gate with a valid token (returns 4xx, not 401)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        sessionId: 'no-cart-sess',
        shippingAddress: { street: '1 St', city: 'London', postcode: 'SW1', country: 'UK' },
        cardLastFour: '1234',
      });
    // 401 would mean auth failed; 404 means auth passed but no cart found
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/orders/:id passes auth gate with a valid token (returns 404 for unknown id)', async () => {
    const unknownId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/orders/${unknownId}`)
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(404);
  });
});
