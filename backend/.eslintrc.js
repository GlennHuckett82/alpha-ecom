'use strict';

module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'commonjs',
  },
  rules: {
    // Allow console in server-side code (use sparingly)
    'no-console': ['warn', { allow: ['error', 'warn', 'info'] }],

    // Prettier handles these — disable conflicting ESLint rules
    'indent': 'off',
    'quotes': ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'always-multiline'],
    'semi': ['error', 'always'],

    // Express/Node patterns
    'no-underscore-dangle': ['error', { allow: ['_id', '__v'] }],
    'consistent-return': 'off',

    // Allow unused 'next' in Express error handlers
    'no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['tests/**/*.js', '**/*.test.js'],
      env: { jest: true },
      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
