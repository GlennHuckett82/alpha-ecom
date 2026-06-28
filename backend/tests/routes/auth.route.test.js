'use strict';
/**
 * Auth Routes — Tests (P20)
 *
 * POST /api/auth/register  — creates user, returns { success, data: { id, email } }
 * POST /api/auth/login     — validates credentials, returns signed JWT
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/user.model');

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const valid = { email: 'alice@example.com', password: 'SecurePass1' };

  it('returns 201 with { success: true, data: { id, email } } on valid input', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(valid.email);
    expect(res.body.data.id).toBeDefined();
  });

  it('does not return the password field in the response', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it('stores the password as a bcrypt hash, not plaintext', async () => {
    await request(app).post('/api/auth/register').send(valid);
    const user = await User.findOne({ email: valid.email }).select('+password');
    expect(user.password).not.toBe(valid.password);
    const isHash = await bcrypt.compare(valid.password, user.password);
    expect(isHash).toBe(true);
  });

  it('returns 422 when email is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: 'Pass123' });
    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 422 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'Pass123' });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 when password is shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'abc' });
    expect(res.statusCode).toBe(422);
  });

  it('returns 409 when email is already registered', async () => {
    await request(app).post('/api/auth/register').send(valid);
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already/i);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const CREDS = { email: 'carol@example.com', password: 'MyPass99!' };

  beforeEach(async () => {
    const hash = await bcrypt.hash(CREDS.password, 10);
    await User.create({ email: CREDS.email, password: hash });
  });

  it('returns 200 with { success: true, token } on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDS);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns a JWT that contains { id, email } in the payload', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDS);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
    expect(decoded.email).toBe(CREDS.email);
    expect(decoded.id).toBeDefined();
  });

  it('token expires in 24 hours', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDS);
    const decoded = jwt.decode(res.body.token);
    const expiresInMs = (decoded.exp - decoded.iat) * 1000;
    expect(expiresInMs).toBe(24 * 60 * 60 * 1000);
  });

  it('returns 401 with { success: false } when email does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'Pass123' });
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when password is wrong', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email, password: 'WrongPassword' });
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns the same 401 message for wrong email and wrong password (no enumeration)', async () => {
    const resWrongEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'Pass123' });
    const resWrongPass = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email, password: 'WrongPassword' });
    expect(resWrongEmail.body.error).toBe(resWrongPass.body.error);
  });

  it('returns 422 when email field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: CREDS.password });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 when password field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDS.email });
    expect(res.statusCode).toBe(422);
  });
});
