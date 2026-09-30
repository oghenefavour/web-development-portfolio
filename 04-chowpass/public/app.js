// ChowPass front end: plain JavaScript single-page app with four dashboards.
const state = { token: null, user: null, packages: [], lastSecret: null, lastRedeem: null };

const $ = (s, r = document) => r.querySelector(s);
const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeOf = (utc) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const dateTime = (utc) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
const ROLE = { staff: 'Staff', hr: 'HR', restaurant: 'Restaurant', admin: 'ChowPass ops' };

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) logout();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function saveSession(token, user) { state.token = token; state.user = user; try { localStorage.setItem('cp_token', token); } catch { /* ignore */ } }
function logout() { state.token = null; state.user = null; try { localStorage.removeItem('cp_token'); } catch { /* ignore */ } render(); }

// ---------------- Landing ----------------
function renderLanding() {
  $('#app').innerHTML = `
    <section class="hero">
      <h1>Free staff lunches, <em>handled</em> like an HMO.</h1>
      <p>Companies pay one fixed monthly plan per staff member. Staff show a one-time meal code at any partner restaurant. Restaurants get paid for every meal they serve, with no cash, receipts or spreadsheets.</p>
      <div class="cta"><button class="primary" data-open-auth="company">Enrol your company</button><button class="ghost" data-open-auth="restaurant">Become a partner restaurant</button></div>
    </section>
    <h2>Plans</h2>
    <div class="grid">${state.packages.map((p) => `
      <div class="card ${p.code === 'standard' ? 'featured' : ''}">
        <div>${p.includesDinner ? '<span class="pill gold">Lunch + dinner</span>' : '<span class="pill">Lunch</span>'}</div>
        <h3>${esc(p.name)}</h3>
        <div class="price">${naira(p.monthlyPremium)} <small>per staff / month</small></div>
        <p class="meta">${esc(p.description)}. Meal value ${naira(p.mealValue)}.</p>
      </div>`).join('')}</div>
    <h2>How it works</h2>
    <div class="grid">
      <div class="card"><h3>🏢 HR</h3><p class="meta">Choose a plan, add staff and see headcount, meals eaten and your monthly invoice in one place.</p></div>
      <div class="card"><h3>🙋 Staff</h3><p class="meta">At lunchtime (11am–4pm), or dinner if your plan covers it, tap to get a 6-character meal code.</p></div>
      <div class="card"><h3>🍲 Restaurant</h3><p class="meta">Type the code in, serve the meal, and watch what you're owed add up for monthly settlement.</p></div>
    </div>`;
}

// ---------------- Staff ----------------
async function renderStaff() {
  const { data: d } = await api('/staff/today');
  const meals = d.meals.map((m) => {
    let right = '';
    if (m.status === 'redeemed') right = `<span>✅ Enjoyed at ${esc(m.restaurant)}</span>`;
    else if (m.status === 'code_active') right = '<span>Code ready ↓</span>';
    else if (d.openMeal === m.type) right = `<button class="primary gold small" data-action="code">Get my ${m.type} code</button>`;
    else right = `<span class="meta">${esc(m.window)}</span>`;
    return `<div class="meal"><div><b>${m.type}</b><div class="meta">${esc(m.window)}</div></div>${right}</div>`;
  }).join('');
  const active = d.meals.find((m) => m.status === 'code_active');
  $('#app').innerHTML = `
    <section class="hero"><h1>Hi ${esc(state.user.fullName.split(' ')[0])} 👋</h1><p>${esc(d.company)} · ${esc(d.package)} · meals worth up to ${naira(d.mealValue)}</p></section>
    <div class="pass">
      <div class="meta">ChowPass · ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      ${meals}
      ${active ? `<div class="code" aria-label="Meal code">${esc(active.code)}</div>
        <div class="meta">Show this code to the restaurant. Valid until ${timeOf(active.expiresAt) === '00:00' ? 'midnight' : timeOf(active.expiresAt)} for one ${active.type}.</div>` : ''}
      ${d.demoMode ? '<div class="meta">Demo mode: meal times are relaxed so you can try it now.</div>' : ''}
    </div>
    <div class="tiles" style="margin-top:16px;max-width:480px">
      <div class="tile"><b>${d.mealsThisMonth}</b><span>Meals this month</span></div>
    </div>`;
}

// ---------------- Restaurant ----------------
async function renderRestaurant() {
  const { data: d } = await api('/restaurant/overview');
  const r = state.lastRedeem;
  $('#app').innerHTML = `
    <section class="hero"><h1>${esc(state.user.restaurant.name)}</h1><p>Enter a ChowPass meal code to serve a covered staff member.</p></section>
    <form class="redeem" id="redeemForm" novalidate>
      <input name="code" maxlength="7" placeholder="A1B2C3" autocomplete="off" aria-label="Meal code" required>
      <button class="primary" type="submit">Redeem</button>
    </form>
    ${r ? `<div class="result ${r.ok ? 'ok' : 'bad'}">${esc(r.text)}</div>` : ''}
    <div class="tiles" style="margin-top:18px">
      <div class="tile"><b>${d.today.meals}</b><span>Meals served today</span></div>
      <div class="tile"><b>${naira(d.today.amount)}</b><span>Earned today</span></div>
      <div class="tile"><b>${d.thisMonth.meals}</b><span>Meals this month</span></div>
      <div class="tile"><b>${naira(d.thisMonth.amountOwed)}</b><span>Owed to you this month</span></div>
    </div>
    <h2>By company</h2>
    ${d.byCompany.length ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th class="num">Meals</th><th class="num">Amount</th></tr></thead><tbody>
      ${d.byCompany.map((c) => `<tr><td>${esc(c.company)}</td><td class="num">${c.meals}</td><td class="num">${naira(c.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No meals yet this month.</p>'}
    <h2>Recent meals</h2>
    ${d.recent.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Staff</th><th>Company</th><th>Meal</th><th class="num">Amount</th></tr></thead><tbody>
      ${d.recent.map((m) => `<tr><td>${dateTime(m.at)}</td><td>${esc(m.staff)}</td><td>${esc(m.company)}</td><td>${esc(m.mealType)}</td><td class="num">${naira(m.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No meals yet.</p>'}`;
  $('#redeemForm input').focus();
}

// ---------------- HR ----------------
async function renderHr() {
  const [{ data: o }, { data: staff }] = await Promise.all([api('/hr/overview'), api('/hr/staff')]);
  const secret = state.lastSecret;
  $('#app').innerHTML = `
    <section class="hero"><h1>${esc(o.company.name)}</h1><p>${esc(o.package.name)} · ${naira(o.package.monthlyPremiumPerStaff)} per staff per month · meal value ${naira(o.package.mealValue)}</p></section>
    <div class="tiles">
      <div class="tile"><b>${o.staff.active}</b><span>Active staff</span></div>
      <div class="tile"><b>${naira(o.invoice.total)}</b><span>Invoice for ${o.month}</span></div>
      <div class="tile"><b>${o.usage.mealsServed}</b><span>Meals served this month</span></div>
      <div class="tile"><b>${o.usage.utilisationPercent}%</b><span>Of ${o.usage.mealAllowance} meal allowance used</span></div>
    </div>
    <h2>Add staff</h2>
    <form class="panel inline-form" id="addStaffForm" novalidate>
      <label>Full name <input name="fullName" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Phone <input name="phone" required placeholder="0803 123 4567"></label>
      <button class="primary" type="submit">Add to plan</button>
    </form>
    <p class="form-error" id="staffError"></p>
    ${secret ? `<div class="secret">✅ <b>${esc(secret.fullName)}</b> can log in with <b>${esc(secret.email)}</b> and temporary password <b>${esc(secret.tempPassword)}</b>. Share it privately; it won't be shown again.</div>` : ''}
    <h2>Staff (${staff.length})</h2>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th class="num">Meals this month</th><th>Status</th><th></th></tr></thead><tbody>
      ${staff.map((s) => `<tr><td>${esc(s.fullName)}</td><td>${esc(s.email)}</td><td class="num">${s.mealsThisMonth}</td>
        <td>${s.isActive ? '<span class="pill">Active</span>' : '<span class="pill off">Paused</span>'}</td>
        <td><button class="ghost small" data-toggle-staff="${s.id}" data-active="${!s.isActive}">${s.isActive ? 'Pause' : 'Reactivate'}</button></td></tr>`).join('')}
    </tbody></table></div>
    <h2>Plan</h2>
    <div class="panel inline-form">
      <label>Change package <select id="pkgChange">${state.packages.map((p) => `<option value="${p.code}" ${p.code === o.package.code ? 'selected' : ''}>${esc(p.name)}: ${naira(p.monthlyPremium)}/staff</option>`).join('')}</select></label>
      <button class="ghost" data-action="change-package">Update plan</button>
    </div>`;
}

// ---------------- Platform admin ----------------
async function renderAdmin() {
  const { data: d } = await api('/admin/overview');
  $('#app').innerHTML = `
    <section class="hero"><h1>Settlement: ${esc(d.month)}</h1><p>Premiums due from companies versus what we owe partner restaurants for meals served.</p></section>
    <div class="tiles">
      <div class="tile"><b>${naira(d.totals.premiumsReceivable)}</b><span>Premiums receivable</span></div>
      <div class="tile"><b>${naira(d.totals.restaurantPayable)}</b><span>Payable to restaurants</span></div>
      <div class="tile"><b>${naira(d.totals.margin)}</b><span>Margin</span></div>
      <div class="tile"><b>${d.totals.mealsServed}</b><span>Meals served</span></div>
    </div>
    <h2>Companies (receivable)</h2>
    <div class="table-wrap"><table><thead><tr><th>Company</th><th>Package</th><th class="num">Active staff</th><th class="num">Meals</th><th class="num">Meal cost</th><th class="num">Invoice</th></tr></thead><tbody>
      ${d.companies.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.package)}</td><td class="num">${c.activeStaff}</td><td class="num">${c.meals}</td><td class="num">${naira(c.mealCost)}</td><td class="num"><b>${naira(c.invoice)}</b></td></tr>`).join('')}
    </tbody></table></div>
    <h2>Restaurants (payable)</h2>
    <div class="table-wrap"><table><thead><tr><th>Restaurant</th><th>City</th><th class="num">Meals</th><th class="num">Owed</th></tr></thead><tbody>
      ${d.restaurants.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.city)}</td><td class="num">${r.meals}</td><td class="num"><b>${naira(r.owed)}</b></td></tr>`).join('')}
    </tbody></table></div>`;
}

// ---------------- Router & events ----------------
function renderNav() {
  $('#nav').innerHTML = state.user
    ? `<span class="who">${esc(state.user.fullName)} · ${ROLE[state.user.role]}</span><button class="ghost small" data-action="logout">Log out</button>`
    : '<button class="ghost small" data-open-auth="login">Log in</button><button class="primary small" data-open-auth="company">Get started</button>';
}
async function render() {
  renderNav();
  try {
    if (!state.user) renderLanding();
    else await ({ staff: renderStaff, restaurant: renderRestaurant, hr: renderHr, admin: renderAdmin })[state.user.role]();
  } catch (e) { toast(e.message); }
}
function switchAuthTab(tab) {
  ['login', 'company', 'restaurant'].forEach((t) => { $(`#${t}Form`).hidden = t !== tab; });
  document.querySelectorAll('[data-auth-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.authTab === tab)));
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.openAuth) {
      document.querySelectorAll('[data-error]').forEach((x) => { x.textContent = ''; });
      switchAuthTab(b.dataset.openAuth); $('#authDialog').showModal();
    } else if (b.dataset.authTab) switchAuthTab(b.dataset.authTab);
    else if (b.dataset.closeDialog) $(`#${b.dataset.closeDialog}`).close();
    else if (b.dataset.action === 'logout') logout();
    else if (b.dataset.action === 'code') { await api('/staff/code', { method: 'POST' }); await renderStaff(); }
    else if (b.dataset.toggleStaff) {
      await api(`/hr/staff/${b.dataset.toggleStaff}`, { method: 'PATCH', body: { isActive: b.dataset.active === 'true' } });
      state.lastSecret = null; await renderHr();
    } else if (b.dataset.action === 'change-package') {
      await api('/hr/package', { method: 'PATCH', body: { packageCode: $('#pkgChange').value } });
      toast('Plan updated'); state.lastSecret = null; await renderHr();
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = Object.fromEntries(new FormData(form));
  const err = form.querySelector('[data-error]');
  if (err) err.textContent = '';
  try {
    if (['loginForm', 'companyForm', 'restaurantForm'].includes(form.id)) {
      const path = { loginForm: '/auth/login', companyForm: '/auth/register-company', restaurantForm: '/auth/register-restaurant' }[form.id];
      const { token, user } = await api(path, { method: 'POST', body: fd });
      saveSession(token, user); $('#authDialog').close(); form.reset(); await render();
    } else if (form.id === 'redeemForm') {
      try {
        const { data } = await api('/restaurant/redeem', { method: 'POST', body: { code: fd.code } });
        state.lastRedeem = { ok: true, text: `✅ ${data.message} (${data.company})` };
      } catch (ex) { state.lastRedeem = { ok: false, text: `✖ ${ex.message}` }; }
      await renderRestaurant();
    } else if (form.id === 'addStaffForm') {
      $('#staffError').textContent = '';
      try {
        state.lastSecret = (await api('/hr/staff', { method: 'POST', body: fd })).data;
        await renderHr();
      } catch (ex) { $('#staffError').textContent = ex.message; }
    }
  } catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message); }
});

(async function init() {
  state.packages = (await api('/packages')).data;
  $('#packageSelect').innerHTML = state.packages.map((p) => `<option value="${p.code}">${esc(p.name)}: ${naira(p.monthlyPremium)}/staff/month</option>`).join('');
  let saved = null;
  try { saved = localStorage.getItem('cp_token'); } catch { /* ignore */ }
  if (saved) { state.token = saved; try { state.user = (await api('/me')).user; } catch { state.token = null; } }
  await render();
}());
