'use strict';
/**
 * CORS Origin Enforcement — Tests (P18)
 *
 * Verifies that the cors middleware:
 *   - Allows requests from origins listed in CORS_ORIGIN
 *   - Allows requests with no Origin header (same-origin / direct calls)
 *   - Rejects requests from unlisted origins with HTTP 403
 */

const request = require('supertest');

// Isolate from other test files by using jest.isolateModules per test
// so env changes take effect on a fresh server instance.

describe('CORS origin enforcement', () => {
  const ALLOWED = 'http://localhost:5500';
  const DISALLOWED = 'http://evil.example.com';

  let app;

  beforeAll(() => {
    process.env.CORS_ORIGIN = ALLOWED;
    // server is likely already cached by other test files; that is fine —
    // the origin function reads process.env.CORS_ORIGIN at request time.
    app = require('../../server');
  });

  afterAll(() => {
    delete process.env.CORS_ORIGIN;
  });

  it('returns 200 for requests with no Origin header (direct/same-origin)', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for requests from an allowed origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', ALLOWED);
    expect(res.statusCode).toBe(200);
  });

  it('sets Access-Control-Allow-Origin for allowed origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', ALLOWED);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('rejects requests from a disallowed origin with 403', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', DISALLOWED);
    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('does not set Access-Control-Allow-Origin for disallowed origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', DISALLOWED);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports multiple allowed origins from CORS_ORIGIN env var', async () => {
    // Override env for this single test — reads at request time so no re-require needed
    const original = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:5500,http://localhost:3000';

    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(res.statusCode).toBe(200);

    process.env.CORS_ORIGIN = original;
  });

  it('rejects an origin that is a substring of an allowed origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost');
    expect(res.statusCode).toBe(403);
  });
});
