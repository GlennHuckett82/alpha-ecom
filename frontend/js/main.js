/**
 * main.js — Alpha Store entry point (index.html)
 *
 * P33: Product listing (fetch + render, loading states, pagination, search, filter)
 * P34: Product detail page
 * P35: Cart state manager
 * P36: Cart page logic
 * P37: Order form validation & submission
 * P38: Debounced search & category filter
 */

import { initProductListing } from './products.js';

// TODO (P36): import and initialise cart page

// ── Bootstrap ──────────────────────────────────────────────────────────────
// ES modules with `defer` already execute after the DOM is parsed,
// so no DOMContentLoaded wrapper is needed.
initProductListing();
