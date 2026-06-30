'use strict';
/**
 * createIndexes.js — run with: npm run db:indexes
 *
 * Calls Model.syncIndexes() for every model so that indexes declared in the
 * schema are created (or confirmed) in MongoDB and any stale indexes that are
 * no longer in the schema are dropped.
 *
 * Safe to run repeatedly — syncIndexes() is idempotent.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import all models so their schemas (and therefore their index declarations)
// are registered before we call syncIndexes().
const Product = require('../models/product.model');
const Order   = require('../models/order.model');
const Cart    = require('../models/cart.model');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI is not set. Add it to your .env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB.');

    await Product.syncIndexes();
    console.log('  Product indexes synced:');
    console.log('    - { name: "text", description: "text" }  (full-text search)');
    console.log('    - { category: 1, price: 1 }              (category filter + price sort)');
    console.log('    - { stock: 1 }                           (stock lookup)');

    await Order.syncIndexes();
    console.log('  Order indexes synced:');
    console.log('    - { status: 1, createdAt: -1 }           (admin dashboard)');
    console.log('    - { sessionId: 1 }                       (order history)');

    await Cart.syncIndexes();
    console.log('  Cart indexes synced:');
    console.log('    - { sessionId: 1 } unique                (fast cart lookup)');

    console.log('All indexes created/confirmed successfully.');
  } catch (err) {
    console.error('Failed to sync indexes:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

run();
