'use strict';
/**
 * Error Handler Middleware — Tests (TDD Red Phase)
 *
 * Tests three layers:
 *   notFoundHandler        — 404 for any unmatched route
 *   validationErrorHandler — 422 for errors with statusCode 422 + errors[]
 *   generalErrorHandler    — 500 for all other thrown errors
 *
 * Two test surfaces:
 *   1. Minimal test Express app  — isolates middleware behaviour precisely
 *   2. Main app integration      — confirms end-to-end wiring in server.js
 */
const express = require('express');
const request = require('supertest');
const Product = require('../../models/product.model');

// Lazy-require so the main app picks up any changes to server.js
const getMainApp = () => require('../../server');

// --- Minimal test app ---
const buildTestApp = () => {
  const {
    notFoundHandler,
    validationErrorHandler,
    generalErrorHandler,
  } = require('../../middleware/errorHandler');
  const app = express();
  app.use(express.json());

  app.get('/test/server-error', (req, res, next) => {
    next(new Error('Database connection lost'));
  });

  app.get('/test/validation-error', (req, res, next) => {
    const err = new Error('Validation failed');
    err.statusCode = 422;
    err.errors = [
      { type: 'field', msg: 'name is required', path: 'name', location: 'body' },
      { type: 'field', msg: 'price must be > 0', path: 'price', location: 'body' },
    ];
    next(err);
  });

  app.get('/test/non-validation-error', (req, res, next) => {
    const err = new Error('Access denied');
    err.statusCode = 403;
    next(err);
  });

  app.use(notFoundHandler);
  app.use(validationErrorHandler);
  app.use(generalErrorHandler);
  return app;
};

// --- notFoundHandler ---
describe('notFoundHandler', () => {
  let app;
  beforeAll(() => { app = buildTestApp(); });

  it('returns 404 when a GET route does not exist', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when a POST route does not exist', async () => {
    const res = await request(app).post('/no-such-route');
    expect(res.statusCode).toBe(404);
  });

  it('returns { success: false, error: "Not found" }', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  it('response Content-Type is application/json', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// --- validationErrorHandler ---
describe('validationErrorHandler', () => {
  let app;
  beforeAll(() => { app = buildTestApp(); });

  it('returns 422 when the error has statusCode 422 and an errors array', async () => {
    const res = await request(app).get('/test/validation-error');
    expect(res.statusCode).toBe(422);
  });

  it('response body has { success: false, errors: [...] }', async () => {
    const res = await request(app).get('/test/validation-error');
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('preserves the errors array from the thrown error object', async () => {
    const res = await request(app).get('/test/validation-error');
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0].path).toBe('name');
    expect(res.body.errors[1].path).toBe('price');
  });

  it('passes non-422 errors through to the general error handler (preserves statusCode)', async () => {
    // The test route throws an error with statusCode 403 — not a validation error,
    // so validationErrorHandler skips it and generalErrorHandler uses err.statusCode.
    const res = await request(app).get('/test/non-validation-error');
    expect(res.statusCode).toBe(403);
  });
});

// --- generalErrorHandler ---
describe('generalErrorHandler', () => {
  let app;
  beforeAll(() => { app = buildTestApp(); });

  it('returns 500 for a generic thrown Error', async () => {
    const res = await request(app).get('/test/server-error');
    expect(res.statusCode).toBe(500);
  });

  it('response body has { success: false, error: <message> }', async () => {
    const res = await request(app).get('/test/server-error');
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('includes the actual error message in test/dev environment', async () => {
    const res = await request(app).get('/test/server-error');
    expect(res.body.error).toBe('Database connection lost');
  });

  it('returns a generic message in production and does not leak internals', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/test/server-error');
    process.env.NODE_ENV = original;
    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/Database connection lost/);
  });

  it('does not expose a stack trace in the response body', async () => {
    const res = await request(app).get('/test/server-error');
    expect(res.body.stack).toBeUndefined();
  });
});

// --- Integration: main app error handling ---
describe('Integration: main app error handling', () => {
  let app;

  beforeAll(async () => {
    app = getMainApp();
    await Product.createIndexes();
  });

  it('returns JSON 404 for an unknown /api route', async () => {
    const res = await request(app).get('/api/nonexistent-endpoint');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.success).toBe(false);
  });

  it('returns JSON 404 for an entirely unknown route', async () => {
    const res = await request(app).get('/totally-unknown');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('returns JSON 500 when a route handler throws an unexpected error', async () => {
    const {
      notFoundHandler,
      validationErrorHandler,
      generalErrorHandler,
    } = require('../../middleware/errorHandler');
    const testApp = express();
    testApp.get('/test/throw', () => { throw new Error('Unexpected crash'); });
    testApp.use(notFoundHandler);
    testApp.use(validationErrorHandler);
    testApp.use(generalErrorHandler);

    const res = await request(testApp).get('/test/throw');
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
