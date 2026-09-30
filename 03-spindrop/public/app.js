// SpinDrop front end: plain JavaScript single-page app.
const state = { token: null, user: null, pricing: null, service: 'laundry', basket: {}, providerTab: 'available' };

const $ = (s, r = document) => r.querySelector(s);
const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (d) => (d ? new Date(d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z')).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const ICON = { laundry: '👕', cleaning: '🧽', moving: '🚚', laundry_pickup: '🛵', laundry_delivery: '🛵' };
const FLOWS = {
  laundry: ['pending_pickup', 'picked_up', 'washing', 'ready', 'out_for_delivery', 'delivered'],
  cleaning: ['pending', 'accepted', 'completed'],
  moving: ['pending', 'accepted', 'completed'],
};
const ROLE_LABEL = { customer: 'Customer', rider: 'Rider', cleaner: 'Cleaner', mover: 'Mover', admin: 'Laundry staff' };

function defaultTime() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) logout();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
function saveSession(token, user) {
  state.token = token; state.user = user;
  try { localStorage.setItem('sd_token', token); } catch { /* ignore */ }
}
function logout() {
  state.token = null; state.user = null;
  try { localStorage.removeItem('sd_token'); } catch { /* ignore */ }
  render();
}
function statusPill(b) {
  const cls = b.status === 'cancelled' ? 'cancelled' : ['delivered', 'completed'].includes(b.status) ? 'done' : 'live';
  return `<span class="pill ${cls}">${esc(b.statusLabel || b.status)}</span>`;
}

// ---------------- Landing ----------------
function renderLanding() {
  const p = state.pricing;
  const top = p.laundry.garments.slice(0, 6);
  $('#app').innerHTML = `
    <section class="hero">
      <h1>Laundry picked up, <em>washed</em> and delivered.</h1>
      <p>Book a rider to collect your clothes, pay by garment type, and get them back fresh. Need a deep clean or help moving? SpinDrop's cleaners and movers have you covered.</p>
      <div class="cta"><button class="primary" data-open-auth="register">Book a pickup</button>
      <button class="ghost" data-open-auth="register" data-role="rider">Join as a rider, cleaner or mover</button></div>
    </section>
    <div class="grid">
      <div class="card"><div class="big-icon">👕</div><h3>Laundry pickup &amp; delivery</h3><p class="meta">Priced per garment. Pickup and delivery ${naira(p.laundry.pickupDeliveryFee)}. Express (24h) +${p.laundry.expressSurchargePercent}%.</p></div>
      <div class="card"><div class="big-icon">🧽</div><h3>Home cleaning</h3><p class="meta">${p.cleaning.perRoom.map((o) => `${esc(o.label)} ${naira(o.price)}`).join(' · ')}</p></div>
      <div class="card"><div class="big-icon">🚚</div><h3>Movers</h3><p class="meta">From ${naira(p.moving.sizes[0].price)} for a few items to ${naira(p.moving.sizes.at(-1).price)} for a 3-bedroom flat.</p></div>
    </div>
    <h2>Laundry prices</h2>
    <div class="garments">${top.map((g) => `<div class="garment"><div class="name">${esc(g.name)}<small>${esc(g.group)}</small></div><b>${naira(g.price)}</b></div>`).join('')}</div>
    <p class="meta">…and ${p.laundry.garments.length - top.length} more items, including suits, agbada, duvets and curtains.</p>`;
}

// ---------------- Customer ----------------
async function renderCustomer() {
  $('#app').innerHTML = `
    <section class="hero"><h1>Hi ${esc(state.user.fullName.split(' ')[0])}, what can we sort out?</h1></section>
    <div class="tabs">${['laundry', 'cleaning', 'moving'].map((s) => `<button class="tab" aria-selected="${state.service === s}" data-service="${s}">${ICON[s]} ${s === 'laundry' ? 'Laundry' : s === 'cleaning' ? 'Home cleaning' : 'Moving'}</button>`).join('')}</div>
    <div class="book">
      <form class="panel" id="bookForm" novalidate>${serviceFields()}
        <div class="form-grid">
          <label>City <input name="city" required value="${esc(state.user.city)}"></label>
          <label>${state.service === 'moving' ? 'Moving from (address)' : state.service === 'laundry' ? 'Pickup address' : 'Address'} <input name="address" required></label>
          ${state.service === 'moving' ? '<label>Moving to (address) <input name="toAddress" required></label>' : ''}
          <label>${state.service === 'laundry' ? 'Pickup time' : 'Date &amp; time'} <input name="scheduledFor" type="datetime-local" required value="${defaultTime()}"></label>
        </div>
        <label>Notes (optional) <input name="notes" maxlength="500" placeholder="Gate code, landmarks, special care…"></label>
        <p class="form-error" data-error></p>
      </form>
      <aside class="panel quote" id="quote"></aside>
    </div>
    <h2>My orders</h2>
    <div id="orders"></div>`;
  await updateQuote();
  await loadOrders();
}

function serviceFields() {
  const p = state.pricing;
  if (state.service === 'laundry') {
    const groups = [...new Set(p.laundry.garments.map((g) => g.group))];
    return `${groups.map((grp) => `<div class="group-title">${esc(grp)}</div><div class="garments">${p.laundry.garments.filter((g) => g.group === grp).map((g) => {
      const q = state.basket[g.id] || 0;
      return `<div class="garment ${q ? 'on' : ''}"><div class="name">${esc(g.name)}<small>${naira(g.price)}</small></div>
        <div class="stepper"><button type="button" data-qty="${g.id}" data-d="-1" aria-label="Remove one">−</button><span>${q}</span><button type="button" data-qty="${g.id}" data-d="1" aria-label="Add one">+</button></div></div>`;
    }).join('')}</div>`).join('')}
      <p><label class="check"><input type="checkbox" name="isExpress"> Express, back within 24 hours (+${p.laundry.expressSurchargePercent}%)</label></p>`;
  }
  if (state.service === 'cleaning') {
    return `<div class="form-grid">
      <label>Type of clean <select name="optionCode">${p.cleaning.perRoom.map((o) => `<option value="${o.code}">${esc(o.label)}: ${naira(o.price)}</option>`).join('')}</select></label>
      <label>Number of rooms <input name="rooms" type="number" min="1" max="${p.cleaning.maxRooms}" value="2"></label></div>`;
  }
  return `<div class="form-grid"><label>Move size <select name="optionCode">${p.moving.sizes.map((o) => `<option value="${o.code}">${esc(o.label)}: ${naira(o.price)}</option>`).join('')}</select></label></div>`;
}

function bookingBody(form) {
  const fd = Object.fromEntries(new FormData(form));
  const body = { ...fd };
  if (state.service === 'laundry') {
    body.items = Object.entries(state.basket).filter(([, q]) => q > 0).map(([id, q]) => ({ garmentTypeId: Number(id), quantity: q }));
    body.isExpress = Boolean(fd.isExpress);
  }
  if (body.rooms) body.rooms = Number(body.rooms);
  if (body.scheduledFor) body.scheduledFor = new Date(body.scheduledFor).toISOString();
  return body;
}

async function updateQuote() {
  const box = $('#quote');
  if (!box) return;
  const body = bookingBody($('#bookForm'));
  if (state.service === 'laundry' && !body.items.length) {
    box.innerHTML = '<h3>Your quote</h3><p class="meta">Add garments with the + buttons to see your price.</p><button class="primary" disabled style="width:100%">Book pickup</button>';
    return;
  }
  try {
    const { data: q } = await api(`/quote/${state.service}`, { method: 'POST', body });
    box.innerHTML = `<h3>Your quote</h3>
      ${(q.lines || []).map((l) => `<div class="line"><span>${l.quantity} × ${esc(l.name)}</span><span>${naira(l.lineTotal)}</span></div>`).join('')}
      ${q.option ? `<div class="line"><span>${esc(q.option)}${q.rooms ? ` × ${q.rooms}` : ''}</span><span>${naira(q.subtotal)}</span></div>` : ''}
      ${q.expressSurcharge ? `<div class="line"><span>Express (24h)</span><span>${naira(q.expressSurcharge)}</span></div>` : ''}
      ${state.service === 'laundry' ? `<div class="line"><span>Pickup &amp; delivery</span><span>${naira(state.pricing.laundry.pickupDeliveryFee)}</span></div>` : ''}
      <div class="line total"><span>Total</span><span>${naira(q.total)}</span></div>
      <button class="primary" type="submit" form="bookForm" style="width:100%;margin-top:10px">${state.service === 'laundry' ? 'Book pickup' : 'Book now'}</button>`;
  } catch (e) {
    box.innerHTML = `<h3>Your quote</h3><p class="form-error">${esc(e.message)}</p>`;
  }
}

async function loadOrders() {
  const { data } = await api('/bookings');
  const box = $('#orders');
  if (!data.length) { box.innerHTML = '<p class="empty">No orders yet.</p>'; return; }
  box.innerHTML = `<div class="grid">${data.map((b) => {
    const flow = FLOWS[b.type];
    const idx = flow.indexOf(b.status);
    const provider = b.jobs.filter((j) => j.provider).at(-1);
    const canCancel = b.status === flow[0] && b.jobs.every((j) => j.status === 'open');
    return `<article class="card">
      <div class="row"><span>${ICON[b.type]} <b>${esc(b.reference)}</b></span>${statusPill(b)}</div>
      ${b.status !== 'cancelled' ? `<div class="progress">${flow.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      <div class="meta">${b.type === 'laundry' ? b.items.map((i) => `${i.quantity} ${esc(i.name)}`).join(', ') : esc(b.option || '')}${b.rooms ? ` · ${b.rooms} rooms` : ''}${b.isExpress ? ' · ⚡ Express' : ''}</div>
      <div class="meta">📅 ${when(b.scheduledFor)}</div>
      ${provider ? `<div class="meta">👤 ${esc(provider.provider.name)} · ${esc(provider.provider.phone)}</div>` : ''}
      <ul class="timeline">${b.timeline.slice(-3).map((e) => `<li>${esc(e.note)}</li>`).join('')}</ul>
      <div class="row"><span class="price">${naira(b.total)}</span>${canCancel ? `<button class="ghost small danger" data-cancel="${b.id}">Cancel</button>` : ''}</div>
    </article>`;
  }).join('')}</div>`;
}

// ---------------- Providers ----------------
async function renderProvider(tab = state.providerTab) {
  state.providerTab = tab;
  const { data: e } = await api('/earnings');
  $('#app').innerHTML = `
    <section class="hero"><h1>${ROLE_LABEL[state.user.role]} dashboard</h1><p>Hi ${esc(state.user.fullName.split(' ')[0])}, pick up jobs near you and get paid for every completed one.</p></section>
    <div class="tiles">
      <div class="tile"><b>${naira(e.earned)}</b><span>Earned</span></div>
      <div class="tile"><b>${naira(e.upcoming)}</b><span>From jobs in progress</span></div>
      <div class="tile"><b>${e.jobsCompleted}</b><span>Jobs completed</span></div>
    </div>
    <div class="tabs"><button class="tab" data-ptab="available" aria-selected="${tab === 'available'}">Available jobs</button><button class="tab" data-ptab="mine" aria-selected="${tab === 'mine'}">My jobs</button></div>
    <div id="jobs"></div>`;
  const { data } = await api(tab === 'available' ? `/jobs/available?city=${encodeURIComponent(state.user.city)}` : '/jobs/mine');
  $('#jobs').innerHTML = data.length ? `<div class="grid">${data.map((j) => `
    <article class="card">
      <div class="row"><span>${ICON[j.kind]} <b>${esc(j.kindLabel)}</b></span><span class="price">${naira(j.payout)}</span></div>
      <div class="meta">${esc(j.booking.reference)} · 📅 ${when(j.booking.scheduledFor)}</div>
      <div class="meta">${j.booking.itemCount ? `${j.booking.itemCount} garments` : esc(j.booking.option || '')}${j.booking.rooms ? ` · ${j.booking.rooms} rooms` : ''}${j.booking.isExpress ? ' · ⚡ Express' : ''}</div>
      ${j.booking.address ? `<div class="meta">📍 ${esc(j.booking.address)}${j.booking.toAddress ? ` → ${esc(j.booking.toAddress)}` : ''}</div>
        <div class="meta">👤 ${esc(j.booking.customer.name)} · ${esc(j.booking.customer.phone)}</div>` : `<div class="meta">📍 ${esc(j.booking.area)}, ${esc(j.booking.city)} (full address after you accept)</div>`}
      ${j.booking.notes && j.booking.address ? `<div class="meta">📝 ${esc(j.booking.notes)}</div>` : ''}
      ${j.status === 'open' ? `<button class="primary small" data-accept="${j.id}">Accept job</button>` : ''}
      ${j.status === 'accepted' ? `<button class="primary small" data-complete="${j.id}">${j.kind === 'laundry_pickup' ? 'Picked up' : j.kind === 'laundry_delivery' ? 'Delivered' : 'Mark completed'}</button>` : ''}
      ${j.status === 'completed' ? '<span class="pill done">Completed</span>' : ''}
    </article>`).join('')}</div>` : `<p class="empty">${tab === 'available' ? 'No open jobs near you right now.' : 'No jobs yet. Accept one from “Available jobs”.'}</p>`;
}

// ---------------- Admin ----------------
async function renderAdmin() {
  const [{ data: s }, { data: laundry }, { data: all }] = await Promise.all([api('/admin/summary'), api('/admin/bookings?type=laundry'), api('/admin/bookings')]);
  const cols = [
    ['pending_pickup', 'Awaiting pickup', null],
    ['picked_up', 'Picked up', ['washing', 'Start washing']],
    ['washing', 'Washing', ['ready', 'Mark ready']],
    ['ready', 'Ready (rider needed)', null],
    ['out_for_delivery', 'Out for delivery', null],
    ['delivered', 'Delivered', null],
  ];
  $('#app').innerHTML = `
    <section class="hero"><h1>Operations</h1><p>Move laundry through the wash, and watch revenue and provider payouts.</p></section>
    <div class="tiles">
      <div class="tile"><b>${naira(s.revenue)}</b><span>Revenue (${s.bookings} bookings)</span></div>
      <div class="tile"><b>${naira(s.providerPayouts)}</b><span>Provider payouts</span></div>
      <div class="tile"><b>${naira(s.grossMargin)}</b><span>Gross margin</span></div>
      <div class="tile"><b>${s.openJobs}</b><span>Jobs waiting for a provider</span></div>
      <div class="tile"><b>${s.providers.rider || 0} · ${s.providers.cleaner || 0} · ${s.providers.mover || 0}</b><span>Riders · cleaners · movers</span></div>
    </div>
    <h2>Laundry board</h2>
    <div class="board">${cols.map(([st, title, action]) => {
      const items = laundry.filter((b) => b.status === st);
      return `<div class="col"><h4>${title}<span>${items.length}</span></h4>${items.map((b) => `
        <div class="mini"><b>${esc(b.reference)}</b><span class="meta">${esc(b.customer.name)} · ${b.items.reduce((n, i) => n + i.quantity, 0)} items${b.isExpress ? ' · ⚡' : ''}</span>
        ${action ? `<button class="primary small" data-advance="${b.id}" data-to="${action[0]}">${action[1]}</button>` : ''}</div>`).join('')}</div>`;
    }).join('')}</div>
    <h2>Cleaning &amp; moving</h2>
    ${(() => { const other = all.filter((b) => b.type !== 'laundry'); return other.length ? `<div class="grid">${other.map((b) => `<article class="card"><div class="row"><span>${ICON[b.type]} <b>${esc(b.reference)}</b></span>${statusPill(b)}</div><div class="meta">${esc(b.option)}${b.rooms ? ` × ${b.rooms}` : ''} · ${esc(b.customer.name)}</div><div class="price">${naira(b.total)}</div></article>`).join('')}</div>` : '<p class="empty">No cleaning or moving bookings yet.</p>'; })()}`;
}

// ---------------- Router & events ----------------
function renderNav() {
  $('#nav').innerHTML = state.user
    ? `<span class="who">${esc(state.user.fullName)} · ${ROLE_LABEL[state.user.role]}</span><button class="ghost small" data-action="logout">Log out</button>`
    : '<button class="ghost small" data-open-auth="login">Log in</button><button class="primary small" data-open-auth="register">Sign up</button>';
}
async function render() {
  renderNav();
  try {
    if (!state.user) renderLanding();
    else if (state.user.role === 'customer') await renderCustomer();
    else if (state.user.role === 'admin') await renderAdmin();
    else await renderProvider();
  } catch (e) { toast(e.message); }
}
function switchAuthTab(tab) {
  $('#loginForm').hidden = tab !== 'login';
  $('#registerForm').hidden = tab !== 'register';
  document.querySelectorAll('[data-auth-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.authTab === tab)));
}

let quoteTimer;
const queueQuote = () => { clearTimeout(quoteTimer); quoteTimer = setTimeout(updateQuote, 250); };

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.openAuth) {
      document.querySelectorAll('[data-error]').forEach((x) => { x.textContent = ''; });
      switchAuthTab(b.dataset.openAuth);
      if (b.dataset.role) $('#registerForm select[name=role]').value = b.dataset.role;
      $('#authDialog').showModal();
    } else if (b.dataset.authTab) switchAuthTab(b.dataset.authTab);
    else if (b.dataset.closeDialog) $(`#${b.dataset.closeDialog}`).close();
    else if (b.dataset.action === 'logout') logout();
    else if (b.dataset.service) { state.service = b.dataset.service; await renderCustomer(); }
    else if (b.dataset.qty) {
      const id = b.dataset.qty;
      state.basket[id] = Math.max(0, Math.min(50, (state.basket[id] || 0) + Number(b.dataset.d)));
      const card = b.closest('.garment');
      card.querySelector('.stepper span').textContent = state.basket[id];
      card.classList.toggle('on', state.basket[id] > 0);
      queueQuote();
    } else if (b.dataset.cancel) {
      if (!window.confirm('Cancel this order?')) return;
      await api(`/bookings/${b.dataset.cancel}/cancel`, { method: 'POST' });
      toast('Order cancelled'); await loadOrders();
    } else if (b.dataset.ptab) await renderProvider(b.dataset.ptab);
    else if (b.dataset.accept) { await api(`/jobs/${b.dataset.accept}/accept`, { method: 'POST' }); toast('Job accepted'); await renderProvider('mine'); }
    else if (b.dataset.complete) { await api(`/jobs/${b.dataset.complete}/complete`, { method: 'POST' }); toast('Nice work!'); await renderProvider('mine'); }
    else if (b.dataset.advance) { await api(`/admin/bookings/${b.dataset.advance}/status`, { method: 'PATCH', body: { status: b.dataset.to } }); toast('Order updated'); await renderAdmin(); }
  } catch (err) { toast(err.message); }
});

document.addEventListener('input', (e) => { if (e.target.closest('#bookForm')) queueQuote(); });

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = form.querySelector('[data-error]');
  if (err) err.textContent = '';
  try {
    if (form.id === 'loginForm' || form.id === 'registerForm') {
      const fd = Object.fromEntries(new FormData(form));
      const { token, user } = await api(form.id === 'loginForm' ? '/auth/login' : '/auth/register', { method: 'POST', body: fd });
      saveSession(token, user);
      $('#authDialog').close(); form.reset();
      await render();
    } else if (form.id === 'bookForm') {
      const { data } = await api(`/bookings/${state.service}`, { method: 'POST', body: bookingBody(form) });
      toast(`Booked! Reference ${data.reference}`);
      state.basket = {};
      await renderCustomer();
    }
  } catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message); }
});

(async function init() {
  state.pricing = (await api('/pricing')).data;
  let saved = null;
  try { saved = localStorage.getItem('sd_token'); } catch { /* ignore */ }
  if (saved) { state.token = saved; try { state.user = (await api('/me')).user; } catch { state.token = null; } }
  await render();
}());
