'use strict';

const crypto = require('crypto');

/** Maximum amount (inclusive) that will be approved — amounts above this are declined */
const DECLINE_THRESHOLD = 9999;

/** Regex: exactly 4 decimal digits */
const CARD_LAST_FOUR_RE = /^\d{4}$/;

/**
 * processPayment({ totalAmount, cardLastFour })
 *
 * Simulates a payment gateway call. No real network requests are made.
 *
 * Outcomes:
 *   - Throws a validation Error for missing/invalid inputs
 *   - Returns { success: false, error: 'Payment declined' } when totalAmount > 9999
 *   - Returns { success: true, transactionId } for all other valid inputs
 *
 * @param {{ totalAmount: number, cardLastFour: string }} input
 * @returns {Promise<{ success: boolean, transactionId?: string, error?: string }>}
 */
const processPayment = async (input) => {
  // ── Input guard ──────────────────────────────────────────────────────────
  if (input === null || input === undefined || typeof input !== 'object') {
    throw new Error('processPayment requires a payment input object.');
  }

  const { totalAmount, cardLastFour } = input;

  // ── Validate totalAmount ─────────────────────────────────────────────────
  if (totalAmount === undefined || totalAmount === null) {
    throw new Error('totalAmount is required.');
  }
  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    throw new Error(`Invalid totalAmount: ${totalAmount}. Must be a positive number.`);
  }

  // ── Validate cardLastFour ────────────────────────────────────────────────
  if (cardLastFour === undefined || cardLastFour === null) {
    throw new Error('cardLastFour is required.');
  }
  if (!CARD_LAST_FOUR_RE.test(String(cardLastFour))) {
    throw new Error(
      `Invalid card details: cardLastFour must be exactly 4 digits, got "${cardLastFour}".`,
    );
  }

  // ── Simulate decline ─────────────────────────────────────────────────────
  if (totalAmount > DECLINE_THRESHOLD) {
    return { success: false, error: 'Payment declined' };
  }

  // ── Simulate approval ─────────────────────────────────────────────────────
  const transactionId = `txn_${crypto.randomUUID()}`;
  return { success: true, transactionId };
};

module.exports = { processPayment };
