'use strict';

/**
 * Product Model — Unit Tests (TDD Red Phase)
 * These tests are written BEFORE the model is implemented (P7).
 * All tests should FAIL until the Mongoose schema is built in P7.
 */

const mongoose = require('mongoose');
const Product = require('../../models/product.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a plain object with all valid required fields */
const validProductData = () => ({
  name: 'Wireless Headphones',
  description: 'Over-ear noise-cancelling headphones with 30hr battery life.',
  price: 49.99,
  category: 'electronics',
  stock: 120,
  imageUrl: 'https://example.com/images/headphones.webp',
});

/**
 * Saves a Mongoose document and returns the validation error.
 * Resolves with the error object, or null if the save succeeded.
 */
const getValidationError = async (doc) => {
  try {
    await doc.save();
    return null;
  } catch (err) {
    return err;
  }
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Product Model', () => {
  // ── Valid document ────────────────────────────────────────────────────────

  describe('valid product', () => {
    it('saves successfully with all required fields provided', async () => {
      const product = new Product(validProductData());
      const saved = await product.save();

      expect(saved._id).toBeDefined();
      expect(saved.name).toBe('Wireless Headphones');
      expect(saved.description).toBe(
        'Over-ear noise-cancelling headphones with 30hr battery life.',
      );
      expect(saved.price).toBe(49.99);
      expect(saved.category).toBe('electronics');
      expect(saved.stock).toBe(120);
      expect(saved.imageUrl).toBe('https://example.com/images/headphones.webp');
    });

    it('saves successfully when imageUrl is omitted (optional field)', async () => {
      const data = validProductData();
      delete data.imageUrl;

      const product = new Product(data);
      const saved = await product.save();

      expect(saved._id).toBeDefined();
      expect(saved.imageUrl).toBeDefined(); // defaults to empty string
    });
  });

  // ── Required field: name ─────────────────────────────────────────────────

  describe('name validation', () => {
    it('fails validation when name is missing', async () => {
      const data = validProductData();
      delete data.name;

      const product = new Product(data);
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('name');
    });

    it('fails validation when name is an empty string', async () => {
      const product = new Product({ ...validProductData(), name: '' });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('name');
    });

    it('fails validation when name is shorter than 2 characters', async () => {
      const product = new Product({ ...validProductData(), name: 'A' });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('name');
    });

    it('fails validation when name exceeds 150 characters', async () => {
      const product = new Product({
        ...validProductData(),
        name: 'A'.repeat(151),
      });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('name');
    });
  });

  // ── Required field: price ────────────────────────────────────────────────

  describe('price validation', () => {
    it('fails validation when price is missing', async () => {
      const data = validProductData();
      delete data.price;

      const product = new Product(data);
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('price');
    });

    it('fails validation when price is zero', async () => {
      const product = new Product({ ...validProductData(), price: 0 });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('price');
    });

    it('fails validation when price is negative', async () => {
      const product = new Product({ ...validProductData(), price: -5.99 });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('price');
    });

    it('accepts a price of 0.01 (minimum valid price)', async () => {
      const product = new Product({ ...validProductData(), price: 0.01 });
      const saved = await product.save();

      expect(saved.price).toBe(0.01);
    });
  });

  // ── Required field: stock ────────────────────────────────────────────────

  describe('stock validation', () => {
    it('fails validation when stock is missing', async () => {
      const data = validProductData();
      delete data.stock;

      // stock has a default of 0, so this should NOT fail — verify default is applied
      const product = new Product(data);
      const saved = await product.save();

      expect(saved.stock).toBe(0);
    });

    it('fails validation when stock is negative', async () => {
      const product = new Product({ ...validProductData(), stock: -1 });
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('stock');
    });

    it('accepts stock of 0 (out of stock is valid)', async () => {
      const product = new Product({ ...validProductData(), stock: 0 });
      const saved = await product.save();

      expect(saved.stock).toBe(0);
    });
  });

  // ── Required field: category ─────────────────────────────────────────────

  describe('category validation', () => {
    it('fails validation when category is missing', async () => {
      const data = validProductData();
      delete data.category;

      const product = new Product(data);
      const err = await getValidationError(product);

      expect(err).not.toBeNull();
      expect(err.errors).toHaveProperty('category');
    });

    it('stores category in lowercase', async () => {
      const product = new Product({ ...validProductData(), category: 'ELECTRONICS' });
      const saved = await product.save();

      expect(saved.category).toBe('electronics');
    });
  });

  // ── Whitespace trimming ──────────────────────────────────────────────────

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace from name', async () => {
      const product = new Product({
        ...validProductData(),
        name: '  Wireless Headphones  ',
      });
      const saved = await product.save();

      expect(saved.name).toBe('Wireless Headphones');
    });

    it('trims leading and trailing whitespace from description', async () => {
      const product = new Product({
        ...validProductData(),
        description: '   Great product description.   ',
      });
      const saved = await product.save();

      expect(saved.description).toBe('Great product description.');
    });

    it('trims whitespace from category', async () => {
      const product = new Product({
        ...validProductData(),
        category: '  electronics  ',
      });
      const saved = await product.save();

      expect(saved.category).toBe('electronics');
    });
  });

  // ── Timestamps ───────────────────────────────────────────────────────────

  describe('timestamps', () => {
    it('automatically sets createdAt when a product is saved', async () => {
      const before = new Date();
      const product = new Product(validProductData());
      const saved = await product.save();
      const after = new Date();

      expect(saved.createdAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(saved.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('automatically sets updatedAt when a product is saved', async () => {
      const product = new Product(validProductData());
      const saved = await product.save();

      expect(saved.updatedAt).toBeDefined();
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });

    it('updates updatedAt when the document is modified', async () => {
      const product = new Product(validProductData());
      const saved = await product.save();
      const originalUpdatedAt = saved.updatedAt;

      // Small delay to ensure timestamp difference is detectable
      await new Promise((resolve) => { setTimeout(resolve, 10); });

      saved.price = 59.99;
      const updated = await saved.save();

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ── Mongoose ObjectId ────────────────────────────────────────────────────

  describe('document identity', () => {
    it('assigns a valid Mongoose ObjectId as _id', async () => {
      const product = new Product(validProductData());
      const saved = await product.save();

      expect(mongoose.Types.ObjectId.isValid(saved._id)).toBe(true);
    });

    it('each saved product has a unique _id', async () => {
      const p1 = await new Product(validProductData()).save();
      const p2 = await new Product(validProductData()).save();

      expect(p1._id.toString()).not.toBe(p2._id.toString());
    });
  });
});
