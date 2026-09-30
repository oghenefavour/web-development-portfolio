// Urgent2k front end: plain JavaScript single-page app talking to the REST API.
const state = { token: null, user: null, categories: [], view: null };

const $ = (sel, root = document) => root.querySelector(sel);
const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (r) => (r ? `<span class="stars">${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</span> ${r}` : 'New');
const pill = (status) => `<span class="pill ${esc(status)}">${esc(status.replace(/_/g, ' '))}</span>`;
const ago = (d) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(`${d.replace(' ', 'T')}Z`).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) { logout(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------------- Session ----------------
function saveSession(token, user) {
  state.token = token;
  state.user = user;
  try { localStorage.setItem('u2k_token', token); } catch { /* private mode */ }
}
function logout() {
  state.token = null;
  state.user = null;
  try { localStorage.removeItem('u2k_token'); } catch { /* ignore */ }
  render();
}

function renderNav() {
  const nav = $('#nav');
  if (!state.user) {
    nav.innerHTML = `
      <button class="ghost small" data-open-auth="login">Log in</button>
      <button class="primary small" data-open-auth="register">Sign up</button>`;
    return;
  }
  nav.innerHTML = `
    <span class="who">${esc(state.user.fullName)} · ${state.user.role === 'tasker' ? 'Tasker' : 'Customer'}</span>
    <button class="ghost small" data-action="logout">Log out</button>`;
}

// ---------------- Landing ----------------
async function renderLanding() {
  const app = $('#app');
  app.innerHTML = `
    <section class="hero">
      <h1>Need it done <em>today?</em><br>Urgent2k it.</h1>
      <p>Post any task, from errands and cleaning to generator repairs and moving help, and get offers from trusted local taskers. Tasks start from ₦2,000.</p>
      <div class="cta">
        <button class="primary" data-open-auth="register">Post a task</button>
        <button class="ghost" data-open-auth="register" data-role="tasker">Become a tasker</button>
      </div>
    </section>
    <h2>Popular categories</h2>
    <div class="cats">${state.categories.map((c) => `<div class="cat"><span>${c.icon}</span>${esc(c.name)}</div>`).join('')}</div>
    <h2>Top-rated taskers</h2>
    <div class="grid" id="taskers"><p class="meta">Loading…</p></div>
    <h2>How it works</h2>
    <div class="grid">
      <div class="card"><h3>1. Post your task</h3><p class="meta">Describe what you need, where and your budget.</p></div>
      <div class="card"><h3>2. Pick an offer</h3><p class="meta">Compare prices, ratings and completed jobs. Payment is held safely.</p></div>
      <div class="card"><h3>3. Confirm &amp; rate</h3><p class="meta">Once the job is done, confirm and the tasker gets paid.</p></div>
    </div>`;
  const { data } = await api('/taskers');
  $('#taskers').innerHTML = data.map((t) => `
    <article class="card">
      <h3>${esc(t.fullName)}</h3>
      <div class="meta">${esc(t.city)} · ${t.jobsCompleted} jobs</div>
      <div>${stars(t.rating)}</div>
      <p class="meta">${esc(t.bio || '')}</p>
      <div class="meta">${t.categories.map((c) => `${c.icon} ${esc(c.name)}`).join(' · ')}</div>
    </article>`).join('');
}

// ---------------- Customer ----------------
async function renderCustomer() {
  const app = $('#app');
  app.innerHTML = `
    <section class="hero"><h1>Hi ${esc(state.user.fullName.split(' ')[0])}, what do you need done?</h1></section>
    <div class="panel">
      <form id="taskForm" novalidate>
        <div class="form-grid">
          <label>What do you need? <input name="title" required maxlength="120" placeholder="e.g. Fix my generator"></label>
          <label>Category <select name="categoryId">${state.categories.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></label>
          <label>Budget (₦, min 2,000) <input name="budget" type="number" min="2000" step="500" required value="5000"></label>
          <label>City <input name="city" required value="${esc(state.user.city)}"></label>
          <label>Area <input name="area" required placeholder="e.g. Wuse 2"></label>
          <label>Address (only shared with your chosen tasker) <input name="address" required></label>
        </div>
        <label>Details <textarea name="description" required maxlength="1000" placeholder="Describe the task clearly"></textarea></label>
        <div class="row">
          <label class="radio"><input type="checkbox" name="isUrgent"> ⚡ Urgent (today)</label>
          <button class="primary" type="submit">Post task</button>
        </div>
        <p class="form-error" data-error></p>
      </form>
    </div>
    <h2>My tasks</h2>
    <div id="myTasks"></div>`;
  await loadCustomerTasks();
}

async function loadCustomerTasks() {
  const { data } = await api('/tasks/mine');
  const box = $('#myTasks');
  if (!data.length) { box.innerHTML = '<p class="empty">No tasks yet. Post your first one above.</p>'; return; }
  const details = await Promise.all(data.filter((t) => t.status === 'open' && t.offerCount).map((t) => api(`/tasks/${t.id}`)));
  const offersById = Object.fromEntries(details.map((d) => [d.data.id, d.data.offers]));
  box.innerHTML = `<div class="grid">${data.map((t) => customerTaskCard(t, offersById[t.id])).join('')}</div>`;
}

function customerTaskCard(t, offers) {
  let body = '';
  if (t.status === 'open') {
    body = offers && offers.length
      ? offers.filter((o) => o.status === 'pending').map((o) => `
          <div class="offer">
            <div><b>${naira(o.price)}</b> · ${esc(o.tasker.name)}<div class="meta">${stars(o.tasker.rating)} · ${o.tasker.jobsCompleted} jobs</div>
            <div class="meta">“${esc(o.message)}”</div></div>
            <button class="primary small" data-accept="${t.id}:${o.id}">Accept</button>
          </div>`).join('')
      : '<p class="meta">Waiting for offers…</p>';
    body += `<button class="ghost small danger" data-cancel="${t.id}">Cancel task</button>`;
  } else if (t.status === 'assigned') {
    body = `<p class="meta">Assigned to <b>${esc(t.tasker.name)}</b> (${esc(t.tasker.phone)}) for ${naira(t.agreedPrice)}. Payment is held until you confirm.</p>
            <button class="ghost small danger" data-cancel="${t.id}">Cancel &amp; refund</button>`;
  } else if (t.status === 'completed') {
    body = `<p class="meta"><b>${esc(t.tasker.name)}</b> marked this done. Confirm to release ${naira(t.agreedPrice)}.</p>
      <form class="confirm-form" data-confirm="${t.id}">
        <label>Rating <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} ${n}</option>`).join('')}</select></label>
        <label>Comment <input name="comment" maxlength="500" placeholder="Optional"></label>
        <button class="primary small" type="submit">Confirm &amp; pay</button>
      </form>`;
  } else if (t.status === 'confirmed') {
    body = `<p class="meta">Paid ${naira(t.agreedPrice)} to ${esc(t.tasker.name)}. Thank you!</p>`;
  }
  return `
    <article class="card">
      <div class="row"><span>${t.category.icon} ${pill(t.status)} ${t.isUrgent ? '<span class="pill urgent">urgent</span>' : ''}</span><span class="price">${naira(t.budget)}</span></div>
      <h3>${esc(t.title)}</h3>
      <div class="meta">${esc(t.area)}, ${esc(t.city)} · ${ago(t.createdAt)}</div>
      ${body}
    </article>`;
}

// ---------------- Tasker ----------------
async function renderTasker(tab = state.view || 'find') {
  state.view = tab;
  const app = $('#app');
  const { data: earnings } = await api('/earnings');
  const me = state.user;
  app.innerHTML = `
    <section class="hero"><h1>Welcome back, ${esc(me.fullName.split(' ')[0])}</h1>
      <p>${stars(me.rating)} · ${me.jobsCompleted} jobs completed · ${me.categories.map((c) => c.icon).join(' ')}</p></section>
    <div class="tiles">
      <div class="tile"><b>${naira(earnings.paidOut)}</b><span>Paid out</span></div>
      <div class="tile"><b>${naira(earnings.inEscrow)}</b><span>Held for active jobs</span></div>
      <div class="tile"><b>${earnings.paidJobs}</b><span>Paid jobs on Urgent2k</span></div>
    </div>
    <div class="tabs" role="tablist">
      ${[['find', 'Find tasks'], ['jobs', 'My jobs'], ['offers', 'My offers']].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    <div id="tabBody"></div>`;
  if (tab === 'find') await renderFind();
  if (tab === 'jobs') await renderJobs();
  if (tab === 'offers') await renderOffers();
}

async function renderFind(category = '', city = state.user.city) {
  const body = $('#tabBody');
  const mine = state.user.categories;
  body.innerHTML = `
    <div class="filters">
      <select id="fCat"><option value="">All my skills</option>${mine.map((c) => `<option value="${c.slug}" ${c.slug === category ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>
      <input id="fCity" value="${esc(city)}" placeholder="City">
      <button class="ghost small" data-action="filter">Search</button>
    </div>
    <div id="openTasks"><p class="meta">Loading…</p></div>`;
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (city) q.set('city', city);
  const { data } = await api(`/tasks?${q}`);
  const slugs = mine.map((c) => c.slug);
  const tasks = category ? data : data.filter((t) => slugs.includes(t.category.slug));
  $('#openTasks').innerHTML = tasks.length ? `<div class="grid">${tasks.map((t) => `
    <article class="card">
      <div class="row"><span>${t.category.icon} ${t.isUrgent ? '<span class="pill urgent">urgent</span>' : ''}</span><span class="price">${naira(t.budget)}</span></div>
      <h3>${esc(t.title)}</h3>
      <div class="meta">${esc(t.area)}, ${esc(t.city)} · ${ago(t.createdAt)} · ${t.offerCount} offer${t.offerCount === 1 ? '' : 's'}</div>
      <p class="meta">${esc(t.description)}</p>
      <form class="offer-form" data-offer="${t.id}" novalidate>
        <input name="price" type="number" min="2000" step="500" value="${t.budget}" aria-label="Your price">
        <input name="message" placeholder="Message to the customer" maxlength="500" aria-label="Message">
        <button class="primary small" type="submit">Offer</button>
      </form>
    </article>`).join('')}</div>` : '<p class="empty">No open tasks match your skills here right now.</p>';
}

async function renderJobs() {
  const { data } = await api('/jobs/mine');
  $('#tabBody').innerHTML = data.length ? `<div class="grid">${data.map((t) => `
    <article class="card">
      <div class="row"><span>${t.category.icon} ${pill(t.status)}</span><span class="price">${naira(t.yourPayout)}</span></div>
      <h3>${esc(t.title)}</h3>
      <div class="meta">📍 ${esc(t.address)}, ${esc(t.area)}, ${esc(t.city)}</div>
      <div class="meta">👤 ${esc(t.customer.name)} · ${esc(t.customer.phone)}</div>
      <div class="meta">Agreed ${naira(t.agreedPrice)} · you receive ${naira(t.yourPayout)} after the 10% fee</div>
      ${t.status === 'assigned' ? `<button class="primary small" data-complete="${t.id}">Mark as done</button>` : ''}
      ${t.status === 'completed' ? '<p class="meta">Waiting for the customer to confirm.</p>' : ''}
    </article>`).join('')}</div>` : '<p class="empty">No jobs yet. Make offers in “Find tasks”.</p>';
}

async function renderOffers() {
  const { data } = await api('/offers/mine');
  $('#tabBody').innerHTML = data.length ? `<div class="grid">${data.map((o) => `
    <article class="card">
      <div class="row">${pill(o.status)}<span class="price">${naira(o.price)}</span></div>
      <h3>${esc(o.task.title)}</h3>
      <div class="meta">${esc(o.task.area)}, ${esc(o.task.city)}</div>
      <p class="meta">“${esc(o.message)}”</p>
      ${o.status === 'pending' ? `<button class="ghost small" data-withdraw="${o.id}">Withdraw</button>` : ''}
    </article>`).join('')}</div>` : '<p class="empty">You haven’t made any offers yet.</p>';
}

// ---------------- Router ----------------
async function render() {
  renderNav();
  try {
    if (!state.user) await renderLanding();
    else if (state.user.role === 'customer') await renderCustomer();
    else await renderTasker();
  } catch (err) { toast(err.message); }
}

// ---------------- Events ----------------
function openAuth(tab = 'login', role = 'customer') {
  const d = $('#authDialog');
  d.querySelectorAll('[data-error]').forEach((e) => { e.textContent = ''; });
  switchAuthTab(tab);
  const radio = $(`#registerForm input[name=role][value=${role}]`);
  if (radio) radio.checked = true;
  $('#taskerFields').hidden = role !== 'tasker';
  d.showModal();
}
function switchAuthTab(tab) {
  $('#loginForm').hidden = tab !== 'login';
  $('#registerForm').hidden = tab !== 'register';
  document.querySelectorAll('[data-auth-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.authTab === tab)));
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.openAuth) openAuth(b.dataset.openAuth, b.dataset.role);
    else if (b.dataset.authTab) switchAuthTab(b.dataset.authTab);
    else if (b.dataset.closeDialog) $(`#${b.dataset.closeDialog}`).close();
    else if (b.dataset.action === 'logout') logout();
    else if (b.dataset.tab) await renderTasker(b.dataset.tab);
    else if (b.dataset.action === 'filter') await renderFind($('#fCat').value, $('#fCity').value.trim());
    else if (b.dataset.accept) {
      const [taskId, offerId] = b.dataset.accept.split(':');
      await api(`/tasks/${taskId}/offers/${offerId}/accept`, { method: 'POST' });
      toast('Offer accepted. Payment is held safely.');
      await loadCustomerTasks();
    } else if (b.dataset.cancel) {
      if (!window.confirm('Cancel this task?')) return;
      await api(`/tasks/${b.dataset.cancel}/cancel`, { method: 'POST' });
      toast('Task cancelled');
      await loadCustomerTasks();
    } else if (b.dataset.complete) {
      await api(`/tasks/${b.dataset.complete}/complete`, { method: 'POST' });
      toast('Marked as done. The customer will confirm.');
      await renderTasker('jobs');
    } else if (b.dataset.withdraw) {
      await api(`/offers/${b.dataset.withdraw}/withdraw`, { method: 'POST' });
      toast('Offer withdrawn');
      await renderTasker('offers');
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'role') $('#taskerFields').hidden = e.target.value !== 'tasker';
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  const err = form.querySelector('[data-error]');
  if (err) err.textContent = '';
  try {
    if (form.id === 'loginForm') {
      const { token, user } = await api('/auth/login', { method: 'POST', body: fd });
      saveSession(token, user);
      $('#authDialog').close();
      form.reset();
      await render();
    } else if (form.id === 'registerForm') {
      const body = { ...fd };
      if (body.role === 'tasker') body.categoryIds = [...form.querySelectorAll('input[name=cat]:checked')].map((c) => Number(c.value));
      delete body.cat;
      const { token, user } = await api('/auth/register', { method: 'POST', body });
      saveSession(token, user);
      $('#authDialog').close();
      form.reset();
      toast('Welcome to Urgent2k!');
      await render();
    } else if (form.id === 'taskForm') {
      await api('/tasks', { method: 'POST', body: { ...fd, isUrgent: Boolean(fd.isUrgent), categoryId: Number(fd.categoryId), budget: Number(fd.budget) } });
      form.reset();
      form.city.value = state.user.city;
      toast('Task posted! Offers will appear below.');
      await loadCustomerTasks();
    } else if (form.dataset.offer) {
      await api(`/tasks/${form.dataset.offer}/offers`, { method: 'POST', body: { price: Number(fd.price), message: fd.message } });
      toast('Offer sent');
      form.querySelector('button').disabled = true;
      form.querySelector('button').textContent = 'Sent';
    } else if (form.dataset.confirm) {
      await api(`/tasks/${form.dataset.confirm}/confirm`, { method: 'POST', body: { rating: Number(fd.rating), comment: fd.comment } });
      toast('Confirmed. The tasker has been paid.');
      await loadCustomerTasks();
    }
  } catch (ex) {
    if (err) err.textContent = ex.message; else toast(ex.message);
  }
});

// ---------------- Start ----------------
(async function init() {
  const { data } = await api('/categories');
  state.categories = data;
  $('#skillChecks').innerHTML = data.map((c) => `<label><input type="checkbox" name="cat" value="${c.id}"> ${c.icon} ${esc(c.name)}</label>`).join('');
  let saved = null;
  try { saved = localStorage.getItem('u2k_token'); } catch { /* ignore */ }
  if (saved) {
    state.token = saved;
    try { state.user = (await api('/me')).user; } catch { state.token = null; }
  }
  await render();
}());
