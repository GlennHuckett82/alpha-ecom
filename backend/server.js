'use strict';

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// ─── Security & Utility Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5500')
      .split(',')
      .map((o) => o.trim());
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error('Not allowed by CORS');
      err.statusCode = 403;
      callback(err);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,   // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,    // Disable X-RateLimit-* headers
  message: { success: false, error: 'Too many requests, please try again later.' },
  // Skip rate limiting during automated tests so the suite never trips the limit
  skip: () => process.env.NODE_ENV === 'test',
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/products', require('./routes/products'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/auth', require('./routes/auth'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// ─── Error Handling ───────────────────────────────────────────────────────────
const { notFoundHandler, validationErrorHandler, generalErrorHandler } = require('./middleware/errorHandler');
app.use(notFoundHandler);
app.use(validationErrorHandler);
app.use(generalErrorHandler);

// ─── Database Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not defined in environment variables');
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

// ─── Server Bootstrap ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Export app before listen so Supertest can import without starting the server
module.exports = app;

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
}
