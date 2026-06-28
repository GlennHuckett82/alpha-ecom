'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'email is invalid'],
    },
    // select: false means the field is never returned unless .select('+password') is called
    password: {
      type: String,
      required: [true, 'password is required'],
      minlength: [6, 'password must be at least 6 characters'],
      select: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
