// Front-end for the Foodstuff Store. Plain JavaScript, talking to the REST API.
const state = {
  category: '',
  search: '',
  sort: 'name',
  page: 1,
  cartId: null,
  cart: null,
};

const EMOJI = {
  'rice-grains': '🌾',
  'beans-legumes': '🫘',
  'tubers-swallow': '🍠',
  'cooking-oils': '🫙',
  'soup-ingredients': '🥘',
  'fresh-produce': '🧅',
  'pantry-provisions': '🥫',
};

const $ = (id) => document.getElementById(id);
const naira = (n) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Catalogue ----------
async function loadCategories() {
  const { data } = await api('/categories');
  const all = [{ slug: '', name: 'All' }, ...data];
  $('categories').innerHTML = all.map((c) => `
    <button class="chip" type="button" data-slug="${escapeHtml(c.slug)}" aria-pressed="${c.slug === state.category}">
      ${c.slug ? `${EMOJI[c.slug] || ''} ` : ''}${escapeHtml(c.name)}
    </button>`).join('');
}

async function loadProducts() {
  $('status').textContent = 'Loading…';
  const params = new URLSearchParams({ page: state.page, limit: 12, sort: state.sort });
  if (state.category) params.set('category', state.category);
  if (state.search) params.set('search', state.search);
  try {
    const { data, pagination } = await api(`/products?${params}`);
    $('status').textContent = pagination.total
      ? `${pagination.total} product${pagination.total === 1 ? '' : 's'}`
      : 'No products match your search.';
    $('products').innerHTML = data.map(productCard).join('');
    renderPager(pagination);
  } catch (err) {
    $('status').textContent = 'Could not load products. Please refresh.';
  }
}

function productCard(p) {
  let stockNote = '';
  if (!p.inStock) stockNote = '<span class="stock-out">Out of stock</span>';
  else if (p.stock <= 5) stockNote = `<span class="stock-low">Only ${p.stock} left</span>`;
  return `
    <article class="card">
      <div class="emoji" aria-hidden="true">${EMOJI[p.category.slug] || '🛒'}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <div class="unit">${escapeHtml(p.unit)}</div>
      <p class="desc">${escapeHtml(p.description)}</p>
      ${stockNote}
      <div class="row">
        <span class="price">${naira(p.price)}</span>
        <button class="primary" type="button" data-add="${p.id}" ${p.inStock ? '' : 'disabled'}>Add</button>
      </div>
    </article>`;
}

function renderPager({ page, totalPages }) {
  if (totalPages <= 1) { $('pager').innerHTML = ''; return; }
  $('pager').innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => `
    <button type="button" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`).join('');
}

// ---------- Cart ----------
async function ensureCart() {
  if (state.cartId) return state.cartId;
  const saved = localStorage.getItem('cartId');
  if (saved) {
    try {
      state.cart = (await api(`/carts/${saved}`)).data;
      state.cartId = saved;
      return saved;
    } catch { localStorage.removeItem('cartId'); }
  }
  state.cart = (await api('/carts', { method: 'POST' })).data;
  state.cartId = state.cart.id;
  localStorage.setItem('cartId', state.cartId);
  return state.cartId;
}

async function refreshCart() {
  await ensureCart();
  state.cart = (await api(`/carts/${state.cartId}`)).data;
  renderCart();
}

function renderCart() {
  const cart = state.cart;
  $('cartCount').textContent = cart ? cart.itemCount : 0;
  if (!cart || cart.items.length === 0) {
    $('cartItems').innerHTML = '<p class="empty">Your cart is empty.</p>';
    $('cartTotals').innerHTML = '';
    $('checkoutBtn').disabled = true;
    return;
  }
  $('cartItems').innerHTML = cart.items.map((i) => `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(i.name)}</strong>
        <div class="meta">${escapeHtml(i.unit)} · ${naira(i.unitPrice)} each</div>
      </div>
      <strong>${naira(i.lineTotal)}</strong>
      <div class="qty">
        <button type="button" data-qty="${i.productId}" data-delta="-1" aria-label="Decrease">−</button>
        <span>${i.quantity}</span>
        <button type="button" data-qty="${i.productId}" data-delta="1" aria-label="Increase">+</button>
      </div>
      <button class="remove" type="button" data-remove="${i.productId}">Remove</button>
    </div>`).join('');
  $('cartTotals').innerHTML = `
    <div><span>Subtotal</span><span>${naira(cart.subtotal)}</span></div>
    <div><span>Delivery</span><span>${cart.deliveryFee ? naira(cart.deliveryFee) : 'Free'}</span></div>
    <div class="grand"><span>Total</span><span>${naira(cart.total)}</span></div>`;
  $('checkoutBtn').disabled = false;
}

async function addToCart(productId) {
  await ensureCart();
  try {
    state.cart = (await api(`/carts/${state.cartId}/items`, { method: 'POST', body: { productId, quantity: 1 } })).data;
    renderCart();
    toast('Added to cart');
  } catch (err) { toast(err.message); }
}

async function changeQuantity(productId, delta) {
  const item = state.cart.items.find((i) => i.productId === productId);
  if (!item) return;
  try {
    state.cart = (await api(`/carts/${state.cartId}/items/${productId}`, {
      method: 'PATCH', body: { quantity: Math.max(0, item.quantity + delta) },
    })).data;
    renderCart();
  } catch (err) { toast(err.message); }
}

async function removeFromCart(productId) {
  state.cart = (await api(`/carts/${state.cartId}/items/${productId}`, { method: 'DELETE' })).data;
  renderCart();
}

// ---------- Orders ----------
function orderSummary(order, heading) {
  return `
    <h2>${heading}</h2>
    <p>Reference: <span class="ref">${escapeHtml(order.reference)}</span></p>
    <p>Status: <span class="pill">${escapeHtml(order.status.replace(/_/g, ' '))}</span></p>
    <ul class="order-lines">
      ${order.items.map((i) => `<li><span>${i.quantity} × ${escapeHtml(i.name)} (${escapeHtml(i.unit)})</span><span>${naira(i.lineTotal)}</span></li>`).join('')}
    </ul>
    <p>Delivery: ${order.deliveryFee ? naira(order.deliveryFee) : 'Free'} · <strong>Total: ${naira(order.total)}</strong></p>
    <p>Delivering to ${escapeHtml(order.delivery.address)}, ${escapeHtml(order.delivery.city)}.</p>`;
}

async function placeOrder(form) {
  const fd = new FormData(form);
  const customer = Object.fromEntries(['name', 'phone', 'email', 'address', 'city'].map((k) => [k, fd.get(k)]));
  $('checkoutError').textContent = '';
  $('placeOrderBtn').disabled = true;
  try {
    const { data } = await api('/orders', { method: 'POST', body: { cartId: state.cartId, customer } });
    $('checkoutDialog').close();
    closeDrawer();
    form.reset();
    $('orderBody').innerHTML = `${orderSummary(data, 'Order placed 🎉')}<p>Save your reference to track this order.</p>`;
    $('orderDialog').showModal();
    await refreshCart();
    await loadProducts();
  } catch (err) {
    $('checkoutError').textContent = err.message;
  } finally {
    $('placeOrderBtn').disabled = false;
  }
}

async function trackOrder(form) {
  const fd = new FormData(form);
  const reference = String(fd.get('reference') || '').trim().toUpperCase();
  const phone = String(fd.get('phone') || '').trim();
  $('trackError').textContent = '';
  if (!reference || !phone) { $('trackError').textContent = 'Enter your order reference and phone number.'; return; }
  try {
    const { data } = await api(`/orders/track/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`);
    $('trackDialog').close();
    $('orderBody').innerHTML = orderSummary(data, 'Your order');
    $('orderDialog').showModal();
  } catch (err) {
    $('trackError').textContent = err.message;
  }
}

// ---------- UI wiring ----------
function openDrawer() { $('cartDrawer').classList.add('open'); $('cartDrawer').setAttribute('aria-hidden', 'false'); }
function closeDrawer() { $('cartDrawer').classList.remove('open'); $('cartDrawer').setAttribute('aria-hidden', 'true'); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.add) addToCart(Number(t.dataset.add));
  else if (t.dataset.qty) changeQuantity(Number(t.dataset.qty), Number(t.dataset.delta));
  else if (t.dataset.remove) removeFromCart(Number(t.dataset.remove));
  else if (t.dataset.page) { state.page = Number(t.dataset.page); loadProducts(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (t.dataset.slug !== undefined) {
    state.category = t.dataset.slug;
    state.page = 1;
    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === t)));
    loadProducts();
  } else if (t.dataset.close) closeDrawer();
  else if (t.dataset.closeDialog) $(t.dataset.closeDialog).close();
});

$('cartBtn').addEventListener('click', async () => { await refreshCart(); openDrawer(); });
$('checkoutBtn').addEventListener('click', () => { $('checkoutError').textContent = ''; $('checkoutDialog').showModal(); });
$('trackBtn').addEventListener('click', () => { $('trackError').textContent = ''; $('trackDialog').showModal(); });
$('checkoutForm').addEventListener('submit', (e) => { e.preventDefault(); placeOrder(e.target); });
$('trackForm').addEventListener('submit', (e) => { e.preventDefault(); trackOrder(e.target); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; loadProducts(); });

let searchTimer;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; loadProducts(); }, 300);
});

(async function init() {
  await loadCategories();
  await loadProducts();
  try { await refreshCart(); } catch { /* cart loads when first used */ }
}());
