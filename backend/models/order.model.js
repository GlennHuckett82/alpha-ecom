'use strict';

/**
 * ============================================================
 * SCHEMA DESIGN: Order
 * Collection: orders
 * Implemented in: P11
 * ============================================================
 *
 * DESIGN DECISION: priceAtPurchase per item
 *   Product prices can change after an order is placed. Each order
 *   line item captures the price at the moment of purchase so that
 *   order history is always accurate regardless of future price edits.
 *
 * FIELDS
 * ──────
 * sessionId     {String}
 *               - required: true
 *               - trim: true
 *               - Links order back to the session that created it
 *               - Becomes userId if JWT auth (P20) is implemented
 *
 * items         {Array of subdocuments}
 *               - required: true
 *               - validate: array must contain at least 1 item
 *               - Each subdocument contains:
 *
 *     items[].productId          {ObjectId}
 *                                - required: true
 *                                - ref: 'Product'
 *
 *     items[].quantity           {Number}
 *                                - required: true
 *                                - min: 1
 *
 *     items[].priceAtPurchase    {Number}
 *                                - required: true
 *                                - min: 0.01
 *                                - Snapshot of Product.price at time of order
 *                                - Immutable after creation
 *
 * totalAmount   {Number}
 *               - required: true
 *               - min: 0.01
 *               - Calculated by pricingService.calculateOrderTotal(items)
 *               - Equals sum of (priceAtPurchase × quantity) for all items
 *               - Cross-validated in route handler before save
 *
 * status        {String}
 *               - required: true
 *               - enum: ['pending', 'processing', 'completed', 'cancelled']
 *               - default: 'pending'
 *               - State transitions:
 *                   pending → processing (payment accepted)
 *                   processing → completed (fulfilment confirmed)
 *                   pending|processing → cancelled (cancellation requested)
 *               - Indexed: single-field index for admin order filtering (P21)
 *
 * shippingAddress {Object — subdocument (not a ref)}
 *               - Embedded directly (not a separate collection) because
 *                 address belongs to the order, not a user profile
 *
 *     shippingAddress.street    {String}  required, trim, maxlength: 200
 *     shippingAddress.city      {String}  required, trim, maxlength: 100
 *     shippingAddress.postcode  {String}  required, trim, maxlength: 20
 *     shippingAddress.country   {String}  required, trim, maxlength: 100
 *
 * createdAt     {Date}
 *               - Handled automatically by Mongoose `timestamps: true` option
 *               - Indexed: descending index for recent-orders queries (P21)
 *
 * ──────────────────────────────────────────────────────────
 * INDEXES (created in P21 via Model.syncIndexes())
 * ──────────────────────────────────────────────────────────
 * 1. Compound    : { status: 1, createdAt: -1 }
 *    Purpose     : Admin dashboard — filter by status, sorted newest-first
 *
 * 2. Single      : { sessionId: 1 }
 *    Purpose     : Retrieve all orders for a session (order history page)
 *
 * ──────────────────────────────────────────────────────────
 * RELATIONSHIPS
 * ──────────────────────────────────────────────────────────
 * items[].productId references: Product._id
 *   Populated in GET /api/orders/:id for order detail view
 *
 * Order creation flow (P16):
 *   1. Validate cart exists and has items
 *   2. inventoryService.checkStock() for each item
 *   3. pricingService.calculateOrderTotal() → totalAmount
 *   4. paymentService.processPayment()      → transactionId
 *   5. inventoryService.decrementStock()    for each item
 *   6. Order.create()                       → saved order
 *   7. Cart.deleteOne({ sessionId })        → cart cleared
 *
 * ──────────────────────────────────────────────────────────
 * SAMPLE DOCUMENT
 * ──────────────────────────────────────────────────────────
 * {
 *   _id:       ObjectId("64f3c4d5e6f7a8b9c0d3e4f5"),
 *   sessionId: "550e8400-e29b-41d4-a716-446655440000",
 *   items: [
 *     {
 *       productId:       ObjectId("64f1a2b3..."),
 *       quantity:        2,
 *       priceAtPurchase: 49.99
 *     },
 *     {
 *       productId:       ObjectId("64f1a2c4..."),
 *       quantity:        1,
 *       priceAtPurchase: 12.50
 *     }
 *   ],
 *   totalAmount: 112.48,
 *   status:      "pending",
 *   shippingAddress: {
 *     street:   "123 High Street",
 *     city:     "London",
 *     postcode: "SW1A 1AA",
 *     country:  "United Kingdom"
 *   },
 *   createdAt:  ISODate("2024-03-01T10:00:00Z"),
 *   updatedAt:  ISODate("2024-03-01T10:00:05Z")
 * }
 *
 * ============================================================
 * Implementation — P11
 * ============================================================
 */

const mongoose = require('mongoose');

// ─── Item subdocument schema ──────────────────────────────────────────────────

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Item productId is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    priceAtPurchase: {
      type: Number,
      required: [true, 'priceAtPurchase is required'],
      min: [0.01, 'priceAtPurchase must be greater than 0'],
    },
  },
  { _id: false },
);

// ─── Shipping address subdocument schema ─────────────────────────────────────

const shippingAddressSchema = new mongoose.Schema(
  {
    street: {
      type: String,
      required: [true, 'Street is required'],
      trim: true,
      maxlength: [200, 'Street must not exceed 200 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City must not exceed 100 characters'],
    },
    postcode: {
      type: String,
      required: [true, 'Postcode is required'],
      trim: true,
      maxlength: [20, 'Postcode must not exceed 20 characters'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [100, 'Country must not exceed 100 characters'],
    },
  },
  { _id: false },
);

// ─── Order schema ─────────────────────────────────────────────────────────────

const orderSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      trim: true,
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'Order must contain at least one item'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'totalAmount is required'],
      min: [0.01, 'totalAmount must be greater than 0'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'processing', 'completed', 'cancelled'],
        message: '"{VALUE}" is not a valid order status',
      },
      default: 'pending',
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: [true, 'shippingAddress is required'],
    },
  },
  {
    timestamps: true, // auto-manages createdAt + updatedAt
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Admin dashboard: filter by status, sorted newest-first
orderSchema.index({ status: 1, createdAt: -1 });

// Order history lookup by session
orderSchema.index({ sessionId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Order', orderSchema);
