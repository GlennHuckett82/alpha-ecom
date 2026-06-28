'use strict';

/**
 * paymentService — Unit Tests (TDD Red Phase)
 * Written BEFORE the service is implemented.
 * All tests should FAIL until paymentService.js is built.
 *
 * paymentService is pure simulation logic — no DB or external calls.
 */

const { processPayment } = require('../../services/paymentService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a valid payment input */
const validPayment = (overrides = {}) => ({
  totalAmount: 49.99,
  cardLastFour: '4242',
  ...overrides,
});

// ─── processPayment — successful path ────────────────────────────────────────

describe('paymentService.processPayment — successful payments', () => {
  it('returns { success: true } for valid input', async () => {
    const result = await processPayment(validPayment());
    expect(result.success).toBe(true);
  });

  it('returns a transactionId string for valid input', async () => {
    const result = await processPayment(validPayment());
    expect(result.transactionId).toBeDefined();
    expect(typeof result.transactionId).toBe('string');
    expect(result.transactionId.length).toBeGreaterThan(0);
  });

  it('returns a unique transactionId on each call', async () => {
    const r1 = await processPayment(validPayment());
    const r2 = await processPayment(validPayment());
    expect(r1.transactionId).not.toBe(r2.transactionId);
  });

  it('accepts totalAmount of 0.01 (minimum valid amount)', async () => {
    const result = await processPayment(validPayment({ totalAmount: 0.01 }));
    expect(result.success).toBe(true);
  });

  it('accepts totalAmount of exactly 9999 (boundary — should succeed)', async () => {
    const result = await processPayment(validPayment({ totalAmount: 9999 }));
    expect(result.success).toBe(true);
  });

  it('accepts any 4-digit cardLastFour string', async () => {
    const result = await processPayment(validPayment({ cardLastFour: '0000' }));
    expect(result.success).toBe(true);
  });

  it('does not expose cardLastFour in the response', async () => {
    const result = await processPayment(validPayment({ cardLastFour: '1234' }));
    expect(result).not.toHaveProperty('cardLastFour');
  });
});

// ─── processPayment — declined payments ──────────────────────────────────────

describe('paymentService.processPayment — declined payments', () => {
  it('returns { success: false } when totalAmount > 9999', async () => {
    const result = await processPayment(validPayment({ totalAmount: 9999.01 }));
    expect(result.success).toBe(false);
  });

  it('returns error message "Payment declined" when totalAmount > 9999', async () => {
    const result = await processPayment(validPayment({ totalAmount: 10000 }));
    expect(result.error).toBe('Payment declined');
  });

  it('does not include a transactionId on a declined payment', async () => {
    const result = await processPayment(validPayment({ totalAmount: 99999 }));
    expect(result.transactionId).toBeUndefined();
  });

  it('declines large amounts regardless of card number', async () => {
    const result = await processPayment(validPayment({ totalAmount: 10000, cardLastFour: '9999' }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Payment declined');
  });
});

// ─── processPayment — validation errors (throws) ─────────────────────────────

describe('paymentService.processPayment — validation errors', () => {
  it('throws when cardLastFour is missing', async () => {
    const input = validPayment();
    delete input.cardLastFour;
    await expect(processPayment(input)).rejects.toThrow();
  });

  it('throws when cardLastFour is not exactly 4 digits', async () => {
    await expect(processPayment(validPayment({ cardLastFour: '123' }))).rejects.toThrow();
    await expect(processPayment(validPayment({ cardLastFour: '12345' }))).rejects.toThrow();
  });

  it('throws with an informative message for invalid cardLastFour', async () => {
    await expect(
      processPayment(validPayment({ cardLastFour: 'abcd' })),
    ).rejects.toThrow(/card/i);
  });

  it('throws when cardLastFour contains non-digit characters', async () => {
    await expect(processPayment(validPayment({ cardLastFour: '12ab' }))).rejects.toThrow();
    await expect(processPayment(validPayment({ cardLastFour: '12 4' }))).rejects.toThrow();
    await expect(processPayment(validPayment({ cardLastFour: '12.4' }))).rejects.toThrow();
  });

  it('throws when cardLastFour is an empty string', async () => {
    await expect(processPayment(validPayment({ cardLastFour: '' }))).rejects.toThrow();
  });

  it('throws when totalAmount is missing', async () => {
    const input = validPayment();
    delete input.totalAmount;
    await expect(processPayment(input)).rejects.toThrow();
  });

  it('throws when totalAmount is zero', async () => {
    await expect(processPayment(validPayment({ totalAmount: 0 }))).rejects.toThrow();
  });

  it('throws when totalAmount is negative', async () => {
    await expect(processPayment(validPayment({ totalAmount: -1 }))).rejects.toThrow();
  });

  it('throws when called with no argument', async () => {
    await expect(processPayment()).rejects.toThrow();
  });

  it('throws when called with null', async () => {
    await expect(processPayment(null)).rejects.toThrow();
  });
});
