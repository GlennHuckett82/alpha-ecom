'use strict';

/**
 * ============================================================
 * SCHEMA DESIGN: Product
 * Collection: products
 * Implemented in: P7
 * ============================================================
 *
 * FIELDS
 * ──────
 * name          {String}
 *               - required: true
 *               - trim: true
 *               - minlength: 2
 *               - maxlength: 150
 *               - Indexed: text index for full-text search (P21)
 *
 * description   {String}
 *               - required: true
 *               - trim: true
 *               - maxlength: 2000
 *
 * price         {Number}
 *               - required: true
 *               - min: 0.01  (price must be a positive value)
 *               - Stored in base currency units (e.g. GBP pence as float: 9.99)
 *
 * category      {String}
 *               - required: true
 *               - trim: true
 *               - lowercase: true  (normalise for filtering)
 *               - Indexed: single-field index for category filter queries (P21)
 *
 * stock         {Number}
 *               - required: true
 *               - min: 0    (stock cannot be negative)
 *               - default: 0
 *               - Integer only — enforced at service layer (inventoryService)
 *
 * imageUrl      {String}
 *               - required: false
 *               - default: ''   (empty string = placeholder image shown in UI)
 *               - No URL validation at DB layer; validated in route middleware
 *
 * createdAt     {Date}
 *               - Handled automatically by Mongoose `timestamps: true` option
 *               - Exposed as createdAt + updatedAt
 *
 * ──────────────────────────────────────────────────────────
 * INDEXES (created in P21 via Model.syncIndexes())
 * ──────────────────────────────────────────────────────────
 * 1. Text index  : { name: 'text', description: 'text' }
 *    Purpose     : Full-text search for the ?search= query param on GET /products
 *
 * 2. Compound    : { category: 1, price: 1 }
 *    Purpose     : Supports category filter + price sort without a collection scan
 *
 * 3. Single      : { stock: 1 }
 *    Purpose     : Fast lookup when checking/decrementing stock in inventoryService
 *
 * ──────────────────────────────────────────────────────────
 * RELATIONSHIPS
 * ──────────────────────────────────────────────────────────
 * Referenced by:
 *   Cart.items[].productId  → ObjectId ref: 'Product'
 *   Order.items[].productId → ObjectId ref: 'Product'
 *
 * ──────────────────────────────────────────────────────────
 * SAMPLE DOCUMENT
 * ──────────────────────────────────────────────────────────
 * {
 *   _id:         ObjectId("64f1a2b3c4d5e6f7a8b9c0d1"),
 *   name:        "Wireless Headphones",
 *   description: "Over-ear noise-cancelling headphones with 30hr battery.",
 *   price:       49.99,
 *   category:    "electronics",
 *   stock:       120,
 *   imageUrl:    "https://example.com/images/headphones.webp",
 *   createdAt:   ISODate("2024-01-15T10:30:00Z"),
 *   updatedAt:   ISODate("2024-03-01T08:00:00Z")
 * }
 *
 * ============================================================
 * Implementation — P7
 * ============================================================
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [150, 'Name must not exceed 150 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: [2000, 'Description must not exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0.01, 'Price must be greater than 0'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      lowercase: true,
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    imageUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true, // auto-manages createdAt + updatedAt
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Full-text search across name and description (used by GET /products?search=)
productSchema.index({ name: 'text', description: 'text' });

// Compound index: category filter + price sort without a collection scan
productSchema.index({ category: 1, price: 1 });

// Fast stock lookups in inventoryService
productSchema.index({ stock: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Product', productSchema);
