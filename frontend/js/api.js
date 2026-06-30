/**
 * api.js — Centralised Fetch API wrapper for the Alpha Store backend.
 *
 * All network I/O lives here. No other module should call fetch() directly.
 * Every method returns a Promise that resolves to the parsed JSON `data`
 * payload, or rejects with an Error carrying the server's error message.
 */

import CONFIG from './config.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const BASE = CONFIG.API_BASE_URL.replace(/\/$/, ''); // strip trailing slash

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Core fetch wrapper.
 * @param {string} path  - Relative path e.g. '/api/products'
 * @param {RequestInit} [options] - Standard fetch options
 * @returns {Promise<unknown>} Resolved JSON body on 2xx
 * @throws {Error} With server error message on non-2xx, or network failure
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, options);
  } catch (networkError) {
    // fetch() only rejects on network failure (no connection, DNS, etc.)
    throw new Error('Network error — please check your connection.');
  }

  // Parse JSON regardless of status so we can read the error body
  let body;
  try {
    body = await response.json();
  } catch {
    // Server returned non-JSON (e.g. 502 HTML error page)
    throw new Error(`Unexpected response from server (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    // Use the server's error message if present; fall back to HTTP status text
    const message =
      body?.error ||
      (Array.isArray(body?.errors) && body.errors[0]?.msg) ||
      response.statusText ||
      'An unexpected error occurred.';
    const err = new Error(message);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * Builds a URL with a query-string from a plain object,
 * omitting keys whose value is null, undefined, or empty string.
 */
function buildUrl(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  const queryString = qs.toString();
  return queryString ? `${path}?${queryString}` : path;
}

// ─── Public API object ────────────────────────────────────────────────────────

const api = {
  // ── Products ───────────────────────────────────────────────────────────────

  /**
   * Fetch a paginated/filtered product list.
   * Omit `page` for cursor mode; include `page` for offset mode.
   *
   * @param {{ page?: number, limit?: number, category?: string,
   *            search?: string, cursor?: string }} [params]
   */
  getProducts(params = {}) {
    return request(buildUrl('/api/products', params));
  },

  /**
   * Fetch a single product by its MongoDB ObjectId.
   * @param {string} id
   */
  getProductById(id) {
    return request(`/api/products/${encodeURIComponent(id)}`);
  },

  // ── Cart ───────────────────────────────────────────────────────────────────

  /**
   * Retrieve the current cart for a session.
   * @param {string} sessionId
   */
  getCart(sessionId) {
    return request(`/api/cart/${encodeURIComponent(sessionId)}`);
  },

  /**
   * Add a product (or increment its quantity) in the cart.
   * @param {{ sessionId: string, productId: string, quantity: number }} payload
   */
  addToCart({ sessionId, productId, quantity }) {
    return request('/api/cart', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionId, productId, quantity }),
    });
  },

  /**
   * Update the quantity of an existing cart item.
   * @param {{ sessionId: string, productId: string, quantity: number }} payload
   */
  updateCartItem({ sessionId, productId, quantity }) {
    return request(`/api/cart/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ quantity }),
    });
  },

  /**
   * Remove a single product from the cart.
   * @param {{ sessionId: string, productId: string }} payload
   */
  removeCartItem({ sessionId, productId }) {
    return request(`/api/cart/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Delete the entire cart for a session.
   * @param {string} sessionId
   */
  clearCart(sessionId) {
    return request(`/api/cart/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * Place a new order.
   * @param {{ sessionId: string,
   *           shippingAddress: { street: string, city: string,
   *                              postcode: string, country: string },
   *           cardLastFour: string }} payload
   */
  createOrder({ sessionId, shippingAddress, cardLastFour }) {
    return request('/api/orders', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionId, shippingAddress, cardLastFour }),
    });
  },

  /**
   * Retrieve an order by its MongoDB ObjectId.
   * @param {string} id
   */
  getOrder(id) {
    return request(`/api/orders/${encodeURIComponent(id)}`);
  },
};

export default api;
