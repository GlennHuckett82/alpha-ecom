'use strict';

/**
 * Products API Routes — Supertest Tests (TDD Red Phase)
 * Written BEFORE the route is implemented.
 * All tests should FAIL until routes/products.js is built and mounted.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Product = require('../../models/product.model');

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const makeProduct = (overrides = {}) => ({
  name: 'Test Product',
  description: 'A reliable test product used in route tests.',
  price: 19.99,
  category: 'electronics',
  stock: 50,
  imageUrl: 'https://example.com/img.webp',
  ...overrides,
});

const seedProducts = async (count, overrides = {}) => {
  const docs = Array.from({ length: count }, (_, i) =>
    makeProduct({ name: `Product ${i + 1}`, ...overrides }),
  );
  return Product.insertMany(docs);
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure text + compound indexes exist in the in-memory DB before tests run
  await Product.createIndexes();
});

// ─── GET /api/products ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  describe('response shape', () => {
    it('returns 200 with success:true and a data array in both modes', async () => {
      const res = await request(app).get('/api/products');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('cursor mode (default, no ?page=) returns nextCursor and hasNextPage — not pagination', async () => {
      const res = await request(app).get('/api/products');

      expect(res.body).toHaveProperty('nextCursor');
      expect(res.body).toHaveProperty('hasNextPage');
      expect(res.body.pagination).toBeUndefined();
    });

    it('offset mode (?page=) returns pagination object with all required fields', async () => {
      const res = await request(app).get('/api/products?page=1');
      const { pagination } = res.body;

      expect(pagination).toHaveProperty('page');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('total');
      expect(pagination).toHaveProperty('totalPages');
      expect(pagination).toHaveProperty('hasNextPage');
      expect(pagination).toHaveProperty('hasPrevPage');
    });

    it('returns an empty data array when no products exist', async () => {
      const res = await request(app).get('/api/products');

      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      await seedProducts(25);
    });

    it('defaults to page 1 and limit 12 in offset mode (?page=1)', async () => {
      const res = await request(app).get('/api/products?page=1');

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(12);
      expect(res.body.data).toHaveLength(12);
    });

    it('respects ?page= and ?limit= query params', async () => {
      const res = await request(app).get('/api/products?page=2&limit=5');

      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.data).toHaveLength(5);
    });

    it('returns correct total and totalPages', async () => {
      const res = await request(app).get('/api/products?page=1&limit=10');

      expect(res.body.pagination.total).toBe(25);
      expect(res.body.pagination.totalPages).toBe(3); // ceil(25/10)
    });

    it('sets hasNextPage true when more pages exist', async () => {
      const res = await request(app).get('/api/products?page=1&limit=10');
      expect(res.body.pagination.hasNextPage).toBe(true);
    });

    it('sets hasNextPage false on the last page', async () => {
      const res = await request(app).get('/api/products?page=3&limit=10');
      expect(res.body.pagination.hasNextPage).toBe(false);
    });

    it('sets hasPrevPage false on page 1', async () => {
      const res = await request(app).get('/api/products?page=1');
      expect(res.body.pagination.hasPrevPage).toBe(false);
    });

    it('sets hasPrevPage true on page 2+', async () => {
      const res = await request(app).get('/api/products?page=2&limit=5');
      expect(res.body.pagination.hasPrevPage).toBe(true);
    });

    it('caps limit at 50 in offset mode', async () => {
      await seedProducts(60); // total now 85
      const res = await request(app).get('/api/products?page=1&limit=100');

      expect(res.body.pagination.limit).toBe(50);
      expect(res.body.data).toHaveLength(50);
    });

    it('returns an empty data array for a page beyond the last', async () => {
      const res = await request(app).get('/api/products?page=999&limit=12');

      expect(res.body.data).toHaveLength(0);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('?category= filter', () => {
    beforeEach(async () => {
      await seedProducts(3, { category: 'electronics' });
      await seedProducts(2, { category: 'clothing' });
    });

    it('returns only products matching the category', async () => {
      const res = await request(app).get('/api/products?category=electronics');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(3);
      res.body.data.forEach((p) => expect(p.category).toBe('electronics'));
    });

    it('is case-insensitive for category (stored lowercase)', async () => {
      const res = await request(app).get('/api/products?category=ELECTRONICS');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('returns empty data when category has no matches', async () => {
      const res = await request(app).get('/api/products?page=1&category=nonexistent');

      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it('pagination total reflects filtered count, not overall count', async () => {
      const res = await request(app).get('/api/products?page=1&category=clothing');

      expect(res.body.pagination.total).toBe(2);
    });
  });

  describe('?search= filter', () => {
    beforeEach(async () => {
      await Product.create(makeProduct({ name: 'Blue Running Shoes', description: 'Great for jogging.' }));
      await Product.create(makeProduct({ name: 'Red Running Shoes', description: 'Lightweight.' }));
      await Product.create(makeProduct({ name: 'Wireless Headphones', description: 'Noise cancelling.' }));
    });

    it('returns products matching the search term in name', async () => {
      const res = await request(app).get('/api/products?search=Headphones');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].name).toMatch(/headphones/i);
    });

    it('returns multiple results when search term matches several names', async () => {
      const res = await request(app).get('/api/products?search=Running');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('returns empty data when search term has no matches', async () => {
      const res = await request(app).get('/api/products?search=xyznonexistent');

      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('query param validation', () => {
    it('returns 422 when page is not a positive integer', async () => {
      const res = await request(app).get('/api/products?page=abc');

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 422 when page is 0', async () => {
      const res = await request(app).get('/api/products?page=0');
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when limit is not a positive integer', async () => {
      const res = await request(app).get('/api/products?limit=abc');
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when limit is 0', async () => {
      const res = await request(app).get('/api/products?limit=0');
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when cursor is not a valid MongoDB ObjectId', async () => {
      const res = await request(app).get('/api/products?cursor=not-a-valid-id');
      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Cursor-based pagination ─────────────────────────────────────────────────

  describe('cursor-based pagination', () => {
    beforeEach(async () => {
      await seedProducts(15);
    });

    it('first page (no cursor) returns up to limit items with nextCursor', async () => {
      const res = await request(app).get('/api/products?limit=5');

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(typeof res.body.nextCursor).toBe('string');
      expect(res.body.hasNextPage).toBe(true);
    });

    it('subsequent page (with cursor) returns the next distinct batch', async () => {
      const page1 = await request(app).get('/api/products?limit=5');
      const cursor = page1.body.nextCursor;

      const page2 = await request(app).get(`/api/products?limit=5&cursor=${cursor}`);

      expect(page2.statusCode).toBe(200);
      expect(page2.body.data).toHaveLength(5);

      // No overlap between pages
      const ids1 = new Set(page1.body.data.map((p) => p._id));
      page2.body.data.forEach((p) => expect(ids1.has(p._id)).toBe(false));
    });

    it('last page has hasNextPage: false and nextCursor: null', async () => {
      // 15 products total; first page takes 10, leaving 5
      const page1 = await request(app).get('/api/products?limit=10');
      const page2 = await request(app).get(
        `/api/products?limit=10&cursor=${page1.body.nextCursor}`,
      );

      expect(page2.body.data).toHaveLength(5);
      expect(page2.body.hasNextPage).toBe(false);
      expect(page2.body.nextCursor).toBeNull();
    });

    it('all pages together cover every product without duplicates', async () => {
      const page1 = await request(app).get('/api/products?limit=6');
      const page2 = await request(app).get(
        `/api/products?limit=6&cursor=${page1.body.nextCursor}`,
      );
      const page3 = await request(app).get(
        `/api/products?limit=6&cursor=${page2.body.nextCursor}`,
      );

      const allIds = [
        ...page1.body.data.map((p) => p._id),
        ...page2.body.data.map((p) => p._id),
        ...page3.body.data.map((p) => p._id),
      ];
      expect(new Set(allIds).size).toBe(15);
      expect(page3.body.hasNextPage).toBe(false);
    });

    it('caps limit at 50 in cursor mode', async () => {
      await seedProducts(60); // 75 total
      const res = await request(app).get('/api/products?limit=100');

      expect(res.body.data).toHaveLength(50);
      expect(res.body.hasNextPage).toBe(true);
    });

    it('returns empty data, null nextCursor, hasNextPage: false when filter matches nothing', async () => {
      const res = await request(app).get('/api/products?category=nonexistent-cat');

      expect(res.body.data).toHaveLength(0);
      expect(res.body.nextCursor).toBeNull();
      expect(res.body.hasNextPage).toBe(false);
    });

    it('cursor mode does not expose pagination object', async () => {
      const res = await request(app).get('/api/products?limit=5');
      expect(res.body.pagination).toBeUndefined();
    });
  });
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────

describe('GET /api/products/:id', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create(makeProduct({ name: 'Specific Product' }));
  });

  it('returns 200 with { success: true, data: product } for a valid id', async () => {
    const res = await request(app).get(`/api/products/${product._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data._id).toBe(product._id.toString());
  });

  it('returns the correct product fields', async () => {
    const res = await request(app).get(`/api/products/${product._id}`);
    const { data } = res.body;

    expect(data.name).toBe('Specific Product');
    expect(data.price).toBe(19.99);
    expect(data.category).toBe('electronics');
    expect(data.stock).toBe(50);
  });

  it('returns 404 with { success: false } when product does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/products/${nonExistentId}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 422 when id is not a valid ObjectId', async () => {
    const res = await request(app).get('/api/products/not-a-valid-id');

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
