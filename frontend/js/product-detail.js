/**
 * product-detail.js — Product detail page controller (product.html)
 *
 * Responsibilities:
 *   • Read ?id= from the URL; show "not found" if absent or invalid
 *   • Fetch the product via api.getProductById(id)
 *   • Populate all fields via textContent / setAttribute (never innerHTML)
 *   • Show skeleton while loading
 *   • Display stock status and disable add-to-cart when stock = 0
 *   • Handle add-to-cart: validate quantity, call api.addToCart(),
 *     show success/error in #cart-feedback, update header cart badge
 *   • Error: "Product not found" with a link back to the listing
 */

import api from './api.js';

// ── DOM refs ───────────────────────────────────────────────────────────────

const statusEl        = document.getElementById('detail-status');
const article         = document.getElementById('product-detail-content');
const breadcrumbName  = document.getElementById('breadcrumb-product-name');
const imgEl           = document.getElementById('product-image');
const captionEl       = document.getElementById('product-image-caption');
const nameEl          = document.getElementById('product-name');
const priceEl         = document.getElementById('product-price');
const categoryEl      = document.getElementById('product-category');
const descriptionEl   = document.getElementById('product-description');
const stockEl         = document.getElementById('stock-status');
const qtyInput        = document.getElementById('quantity-input');
const addToCartBtn    = document.getElementById('add-to-cart');
const feedbackEl      = document.getElementById('cart-feedback');
const cartBadge       = document.getElementById('cart-badge');

// ── Guard ──────────────────────────────────────────────────────────────────
// Only run on pages that have the product detail markup
if (!article) throw new Error('product-detail.js loaded on wrong page');

// ── Currency formatter ─────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

// ── Skeleton loading ───────────────────────────────────────────────────────

function showSkeleton() {
  article.setAttribute('aria-hidden', 'true');

  // Image skeleton
  imgEl.removeAttribute('src');
  imgEl.setAttribute('alt', '');
  imgEl.className = 'skeleton';
  imgEl.style.aspectRatio = '4 / 3';

  // Text field skeletons
  [nameEl, priceEl, categoryEl, descriptionEl, stockEl, captionEl].forEach((el) => {
    el.textContent = '';
    el.classList.add('skeleton', 'skeleton-text');
  });

  nameEl.classList.add('skeleton-text--lg', 'skeleton-text--w75');
  priceEl.classList.add('skeleton-text--w33');
  categoryEl.classList.add('skeleton-text--sm', 'skeleton-text--w50');
  descriptionEl.classList.add('skeleton-text--w100');
  stockEl.classList.add('skeleton-text--sm', 'skeleton-text--w50');

  addToCartBtn.disabled = true;
  statusEl.textContent = 'Loading product…';
}

function clearSkeleton() {
  article.removeAttribute('aria-hidden');
  imgEl.className = '';
  imgEl.style.aspectRatio = '';
  [nameEl, priceEl, categoryEl, descriptionEl, stockEl, captionEl].forEach((el) => {
    el.className = el.className
      .split(' ')
      .filter((c) => !c.startsWith('skeleton'))
      .join(' ');
  });
  statusEl.textContent = '';
}

// ── Error / not-found state ────────────────────────────────────────────────

function showNotFound(message = 'Product not found.') {
  article.hidden = true;

  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = message; // textContent — no innerHTML

  const link = document.createElement('a');
  link.href = 'index.html';
  link.className = 'btn btn-secondary';
  link.textContent = '← Back to products';

  const wrapper = document.createElement('section');
  wrapper.className = 'empty-state';
  wrapper.appendChild(div);
  wrapper.appendChild(link);

  // Insert after the article
  article.insertAdjacentElement('afterend', wrapper);

  document.title = 'Product not found — Alpha Store';
  statusEl.textContent = message;
  breadcrumbName.textContent = 'Not found';
}

// ── Populate page ──────────────────────────────────────────────────────────

function populatePage(product) {
  // Page title
  document.title = `${product.name} — Alpha Store`;

  // Breadcrumb — safe textContent
  breadcrumbName.textContent = product.name;

  // Image
  imgEl.src = product.imageUrl || '';
  imgEl.alt = product.name;
  captionEl.textContent = product.name;

  // Info fields — textContent only
  nameEl.textContent        = product.name;
  priceEl.textContent       = currency.format(Number(product.price));
  categoryEl.textContent    = product.category;
  descriptionEl.textContent = product.description;

  // Stock status
  if (product.stock > 0) {
    stockEl.textContent   = `In stock (${product.stock} available)`;
    stockEl.style.color   = 'var(--color-success)';
    addToCartBtn.disabled = false;
    qtyInput.max          = String(product.stock);
  } else {
    stockEl.textContent   = 'Out of stock';
    stockEl.style.color   = 'var(--color-error)';
    addToCartBtn.disabled = true;
    qtyInput.disabled     = true;
  }

  clearSkeleton();
}

// ── Cart feedback ──────────────────────────────────────────────────────────

function showFeedback(message, isError = false) {
  feedbackEl.textContent = message; // textContent — safe
  feedbackEl.className   = isError ? 'error-message' : 'success-message';
  // aria-live="assertive" on #cart-feedback will announce it automatically
  // Auto-clear after 5 s to avoid stale messages
  clearTimeout(showFeedback._timer);
  showFeedback._timer = setTimeout(() => {
    feedbackEl.textContent = '';
    feedbackEl.className   = '';
  }, 5000);
}

// ── Cart badge ─────────────────────────────────────────────────────────────

function updateCartBadge(count) {
  if (!cartBadge) return;
  const n = Math.max(0, count);
  cartBadge.textContent       = n > 0 ? String(n) : '';
  cartBadge.dataset.count     = String(n);
  cartBadge.setAttribute('aria-label', `Shopping cart, ${n} item${n !== 1 ? 's' : ''}`);
}

function incrementBadge() {
  const current = parseInt(cartBadge?.textContent, 10) || 0;
  updateCartBadge(current + parseInt(qtyInput.value, 10) || 1);
}

// ── Add to cart handler ────────────────────────────────────────────────────

function wireAddToCart(product) {
  addToCartBtn.addEventListener('click', async () => {
    const qty   = parseInt(qtyInput.value, 10);
    const stock = product.stock;

    // Client-side validation
    if (!Number.isInteger(qty) || qty < 1) {
      showFeedback('Please enter a valid quantity.', true);
      return;
    }
    if (qty > stock) {
      showFeedback(`Only ${stock} item${stock !== 1 ? 's' : ''} available.`, true);
      return;
    }

    addToCartBtn.disabled = true;
    addToCartBtn.textContent = 'Adding…';

    try {
      // sessionId sourced from localStorage; cartState (P35) manages this —
      // fall back to a simple UUID until cartState is in place.
      const sessionId = getSessionId();
      await api.addToCart({ sessionId, productId: product._id, quantity: qty });
      showFeedback(`${product.name} added to cart!`);
      incrementBadge();
    } catch (err) {
      showFeedback(err.message || 'Failed to add to cart.', true);
    } finally {
      addToCartBtn.disabled    = stock === 0;
      addToCartBtn.textContent = 'Add to Cart';
    }
  });
}

// ── Session ID (temporary until cartState P35 lands) ──────────────────────

function getSessionId() {
  const KEY = 'alpha_session_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    // Crypto-safe UUID v4
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');

  if (!id) {
    showNotFound('No product ID specified.');
    return;
  }

  showSkeleton();

  try {
    const result  = await api.getProductById(id);
    const product = result.data ?? result; // API returns { success, data }
    populatePage(product);
    wireAddToCart(product);
  } catch (err) {
    clearSkeleton();
    const message = err.status === 404
      ? 'Product not found.'
      : err.message || 'Failed to load product.';
    showNotFound(message);
  }
}

init();
