(function () {
  'use strict';
  const el = document.getElementById('app');
  const state = { user: null, businesses: [], businessId: null, business: null, categories: null, view: 'home' };

  // ---- helpers ----
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => '£' + Math.round(Number(n) || 0).toLocaleString('en-GB');
  const today = () => new Date().toISOString().slice(0, 10);
  // Tax-year start (calendar year) that a date falls in (UK 6 April boundary).
  const tyStartOf = (dateStr) => { const [Y, M, D] = String(dateStr).split('-').map(Number); return (M > 4 || (M === 4 && D >= 6)) ? Y : Y - 1; };
  // Browser-side data for HMRC fraud-prevention headers.
  function deviceId() { let id = localStorage.getItem('lumi_device_id'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : 'lumi-' + Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('lumi_device_id', id); } return id; }
  function tzHeader() { const off = -new Date().getTimezoneOffset(); const s = off >= 0 ? '+' : '-'; const a = Math.abs(off); return `UTC${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; }
  function gatherClientData() {
    const sc = window.screen || {};
    return {
      deviceId: deviceId(), userAgent: navigator.userAgent, timezone: tzHeader(),
      screens: `width=${sc.width || 0}&height=${sc.height || 0}&scaling-factor=${window.devicePixelRatio || 1}&colour-depth=${sc.colorDepth || 24}`,
      windowSize: `width=${window.innerWidth}&height=${window.innerHeight}`,
      dnt: navigator.doNotTrack === '1' ? 'true' : 'false',
      plugins: Array.from(navigator.plugins || []).map((p) => encodeURIComponent(p.name)).join(','),
    };
  }
  const initials = (name) => String(name || '').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'L';
  let flashT;
  const flash = (msg, bad) => { document.querySelectorAll('.flash').forEach((f) => f.remove()); const f = h(`<div class="flash ${bad ? 'bad' : ''}">${esc(msg)}</div>`); document.body.appendChild(f); clearTimeout(flashT); flashT = setTimeout(() => f.remove(), 3200); };
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  function modal(title, body, foot) {
    const bg = h('<div class="modal-bg"></div>');
    const m = h(`<div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="x">×</button></div></div>`);
    const b = h('<div class="modal-body"></div>'); b.appendChild(body); m.appendChild(b);
    if (foot) { const f = h('<div class="modal-foot"></div>'); f.appendChild(foot); m.appendChild(f); }
    bg.appendChild(m); document.body.appendChild(bg);
    const close = () => bg.remove();
    m.querySelector('.x').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    return { close, bg };
  }
  function openMenu(anchor, items) {
    document.querySelectorAll('.lite-menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const menu = h('<div class="lite-menu"></div>');
    menu.style.top = `${r.bottom + 6}px`; menu.style.left = `${Math.max(8, r.right - 190)}px`;
    items.forEach(([label, fn, danger]) => { const it = h(`<div class="lm-item"${danger ? ' style="color:var(--danger)"' : ''}>${esc(label)}</div>`); it.addEventListener('click', () => { menu.remove(); fn(); }); menu.appendChild(it); });
    document.body.appendChild(menu);
    setTimeout(() => { const cl = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', cl); } }; document.addEventListener('click', cl); }, 0);
  }
  const biz = () => state.business || {};
  const readFileDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

  // ---- printable invoice + statement documents ----
  function invoiceDocHTML(inv) {
    const b = biz();
    const rows = inv.lines.map((l) => `<tr><td>${esc(l.description || '')}</td><td class="r">${money(l.amount)}</td><td class="r">${l.vatRate ? money(l.vat) : '—'}</td><td class="r">${money(l.amount + (l.vat || 0))}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet">
      <style>:root{--gold:#B8922A;--ink:#1A1A18;--mid:#6B6860;--line:#E4DFD4}*{box-sizing:border-box}
      body{font-family:'DM Sans',sans-serif;color:var(--ink);margin:0;padding:48px;font-size:13.5px;line-height:1.55}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--gold);padding-bottom:20px;margin-bottom:24px}
      .brand{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700}.muted{color:var(--mid)}.r{text-align:right}
      h1{font-size:20px;letter-spacing:3px;margin:0 0 6px;color:var(--gold)}.meta{text-align:right}
      .parties{display:flex;justify-content:space-between;margin:22px 0}.label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:4px;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:12px}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mid);text-align:left;border-bottom:2px solid var(--ink);padding:8px 10px}th.r{text-align:right}td{padding:10px;border-bottom:1px solid var(--line)}
      .totals{margin-left:auto;width:260px;margin-top:16px}.totals .row{display:flex;justify-content:space-between;padding:6px 10px}.totals .grand{border-top:2px solid var(--ink);font-weight:700;font-size:16px}
      .foot{margin-top:36px;border-top:1px solid var(--line);padding-top:14px;color:var(--mid);font-size:12px}@media print{body{padding:24px}}</style></head><body>
      <div class="top"><div><div class="brand">${esc(b.name || '')}</div><div class="muted">${esc(b.tradeType || '')}</div>${b.vatRegistered && b.vatNumber ? `<div class="muted">VAT ${esc(b.vatNumber)}</div>` : ''}<div class="muted">${esc(state.user.email || '')}</div></div>
        <div class="meta"><h1>INVOICE</h1><div><b>${esc(inv.number)}</b></div><div class="muted">Issued ${esc(inv.issueDate)}</div><div class="muted">Due ${esc(inv.dueDate)}</div></div></div>
      <div class="parties"><div><div class="label">Bill to</div><div><b>${esc(inv.customerName)}</b></div><div class="muted">${esc(inv.customerEmail || '')}</div></div></div>
      <table><thead><tr><th>Description</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="row"><span class="muted">Subtotal</span><span>${money(inv.net)}</span></div><div class="row"><span class="muted">VAT</span><span>${money(inv.vat)}</span></div><div class="row grand"><span>Total to pay</span><span>${money(inv.total)}</span></div></div>
      <div class="foot">${inv.status === 'paid' ? 'Paid' + (inv.paidDate ? ' on ' + esc(inv.paidDate) : '') + ' — thank you.' : 'Please pay by ' + esc(inv.dueDate) + '. Thank you for your business.'}</div></body></html>`;
  }
  function statementDocHTML(customerName, invs) {
    const b = biz();
    const outstanding = invs.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0);
    const rows = invs.map((i) => `<tr><td>${esc(i.number)}</td><td>${esc(i.issueDate)}</td><td>${esc(i.dueDate)}</td><td>${i.status === 'paid' ? 'Paid' : i.dueDate < today() ? 'Overdue' : 'Awaiting payment'}</td><td class="r">${money(i.total)}</td><td class="r">${i.status === 'paid' ? '—' : money(i.total)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(customerName)}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet">
      <style>:root{--gold:#B8922A;--ink:#1A1A18;--mid:#6B6860;--line:#E4DFD4}*{box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:var(--ink);margin:0;padding:48px;font-size:13.5px}
      .top{display:flex;justify-content:space-between;border-bottom:3px solid var(--gold);padding-bottom:20px;margin-bottom:24px}.brand{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700}.muted{color:var(--mid)}.r{text-align:right}h1{font-size:20px;letter-spacing:3px;margin:0;color:var(--gold)}
      table{width:100%;border-collapse:collapse;margin-top:12px}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mid);text-align:left;border-bottom:2px solid var(--ink);padding:8px 10px}th.r{text-align:right}td{padding:10px;border-bottom:1px solid var(--line)}
      .due{margin-top:18px;text-align:right;font-size:18px;font-weight:700}@media print{body{padding:24px}}</style></head><body>
      <div class="top"><div><div class="brand">${esc(b.name || '')}</div><div class="muted">Statement of account</div></div><div style="text-align:right"><h1>STATEMENT</h1><div class="muted">${esc(today())}</div></div></div>
      <div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">For</div><b>${esc(customerName)}</b></div>
      <table><thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th class="r">Total</th><th class="r">Outstanding</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="due">Total outstanding: ${money(outstanding)}</div></body></html>`;
  }
  function openDoc(html) { const w = window.open('', '_blank'); if (!w) { flash('Allow pop-ups to open the document', true); return; } w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) {} }, 400); }

  // ---- boot ----
  async function init() {
    try {
      const me = await api('/api/me');
      state.user = me.user; state.businesses = me.businesses;
      if (!state.businesses.length) return renderOnboarding();
      state.businessId = state.businessId || state.businesses[0].id;
      await loadBusiness();
      renderApp();
    } catch (e) { renderAuth(); }
  }
  async function loadBusiness() {
    const r = await api(`/api/businesses/${state.businessId}`);
    state.business = r.business; state.categories = r.categories;
  }

  // ===================== AUTH =====================
  function renderAuth(mode) {
    mode = mode || 'login';
    el.innerHTML = '';
    const isReg = mode === 'register';
    const card = h(`<div class="auth-wrap"><div class="auth-card">
      <div class="brand-row"><div class="logo-dot">L</div><div class="brand-name">Lumi <span>Lite</span></div></div>
      <div class="auth-sub">${isReg ? 'Create your free account — bookkeeping made simple for sole traders.' : 'Welcome back. Sign in to your books.'}</div>
      <form id="f">
        ${isReg ? '<label>Your name</label><input name="name" placeholder="e.g. Sam Taylor" required />' : ''}
        <label>Email</label><input name="email" type="email" placeholder="you@email.com" required />
        <label>Password</label><input name="password" type="password" placeholder="${isReg ? 'At least 6 characters' : '••••••••'}" required />
        <div class="err" id="err"></div>
        <button class="btn full big" type="submit" style="margin-top:16px">${isReg ? 'Create my account' : 'Sign in'}</button>
      </form>
      <div class="auth-switch">${isReg ? 'Already have an account? <a id="to-login">Sign in</a>' : "New to Lumi Lite? <a id='to-reg'>Create an account</a>"}</div>
      ${isReg ? '' : '<div class="demo-hint"><b>Try the demo</b><br/>Email: <code>sam@demo.app</code> · Password: <code>demo1234</code></div>'}
    </div></div>`);
    el.appendChild(card);
    const sw = card.querySelector(isReg ? '#to-login' : '#to-reg');
    if (sw) sw.addEventListener('click', () => renderAuth(isReg ? 'login' : 'register'));
    card.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(isReg ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') }) });
        await init();
      } catch (err) { card.querySelector('#err').textContent = err.message; }
    });
  }

  // ===================== ONBOARDING =====================
  function renderOnboarding() {
    el.innerHTML = '';
    const data = { name: '', tradeType: '', basis: 'cash', vatRegistered: false, vatNumber: '', vatScheme: 'standard' };
    let step = 0;
    const wrap = h(`<div class="auth-wrap"><div class="auth-card" style="max-width:520px">
      <div class="brand-row"><div class="logo-dot">L</div><div class="brand-name">Lumi <span>Lite</span></div></div>
      <div class="step-dots"><i class="on"></i><i></i><i></i></div>
      <div id="body"></div>
      <div class="err" id="err"></div>
      <div style="display:flex;gap:10px;margin-top:18px"><button class="btn ghost" id="back" style="display:none">Back</button><button class="btn big full" id="next">Continue</button></div>
    </div></div>`);
    el.appendChild(wrap);
    const body = wrap.querySelector('#body'), dots = wrap.querySelectorAll('.step-dots i');
    const render = () => {
      dots.forEach((d, i) => d.classList.toggle('on', i <= step));
      wrap.querySelector('#back').style.display = step ? 'inline-flex' : 'none';
      wrap.querySelector('#err').textContent = '';
      if (step === 0) {
        body.innerHTML = `<h2 style="font-family:var(--font-serif);margin:0 0 4px">Let's set up your business</h2>
          <p class="muted-inline">Just a few simple questions. You can change any of this later.</p>
          <label>What's your business called?</label><input id="bn" value="${esc(data.name)}" placeholder="e.g. Sam's Plumbing" />
          <label>What do you do? (optional)</label><input id="tt" value="${esc(data.tradeType)}" placeholder="e.g. Plumber" />`;
      } else if (step === 1) {
        body.innerHTML = `<h2 style="font-family:var(--font-serif);margin:0 0 4px">How do you want to record things?</h2>
          <p class="muted-inline">Most sole traders use <b>cash basis</b> — you record money when it actually lands in or leaves your account. Simplest by far.</p>
          <div class="choice-grid" style="margin-top:12px">
            <div class="choice ${data.basis === 'cash' ? 'selected' : ''}" data-b="cash"><h3>Cash basis</h3><p>Record money when it moves. Recommended.</p></div>
            <div class="choice ${data.basis === 'accruals' ? 'selected' : ''}" data-b="accruals"><h3>Traditional</h3><p>Record when invoiced or billed.</p></div>
          </div>`;
        body.querySelectorAll('.choice').forEach((c) => c.addEventListener('click', () => { data.basis = c.getAttribute('data-b'); render(); }));
      } else {
        body.innerHTML = `<h2 style="font-family:var(--font-serif);margin:0 0 4px">Are you VAT registered?</h2>
          <p class="muted-inline">You must register if your sales pass £90,000 in a 12-month period. If you're not sure, choose No — you can switch this on later.</p>
          <div class="choice-grid" style="margin-top:12px">
            <div class="choice ${!data.vatRegistered ? 'selected' : ''}" data-v="0"><h3>No</h3><p>I'm not VAT registered.</p></div>
            <div class="choice ${data.vatRegistered ? 'selected' : ''}" data-v="1"><h3>Yes</h3><p>I charge and reclaim VAT.</p></div>
          </div>
          <div id="vatx" style="${data.vatRegistered ? '' : 'display:none'}"><label>VAT number (optional)</label><input id="vn" value="${esc(data.vatNumber)}" placeholder="GB 123 4567 89" /></div>`;
        body.querySelectorAll('.choice').forEach((c) => c.addEventListener('click', () => { data.vatRegistered = c.getAttribute('data-v') === '1'; render(); }));
      }
    };
    render();
    wrap.querySelector('#back').addEventListener('click', () => { if (step) step--; render(); });
    wrap.querySelector('#next').addEventListener('click', async () => {
      if (step === 0) { data.name = body.querySelector('#bn').value.trim(); data.tradeType = body.querySelector('#tt').value.trim(); if (!data.name) { wrap.querySelector('#err').textContent = 'What do you call your business?'; return; } }
      if (step === 2 && data.vatRegistered) data.vatNumber = body.querySelector('#vn').value.trim();
      if (step < 2) { step++; render(); return; }
      try { const r = await api('/api/businesses', { method: 'POST', body: JSON.stringify(data) }); state.businessId = r.business.id; await api('/api/me').then((m) => { state.businesses = m.businesses; }); await loadBusiness(); renderApp(); flash('All set — welcome to Lumi Lite!'); }
      catch (e) { wrap.querySelector('#err').textContent = e.message; }
    });
  }

  // ===================== APP SHELL =====================
  const NAV = [
    ['home', '⌂', 'Home'],
    ['money', '⇅', 'Money in & out'],
    ['invoices', '£', 'Invoices'],
    ['reconcile', '⇄', 'Reconcile'],
    ['mileage', '⛽', 'Mileage'],
    ['vat', '％', 'VAT'],
    ['mtd', '✓', 'Income Tax'],
    ['import', '⤓', 'Import data'],
    ['activity', '◷', 'Activity'],
    ['settings', '⚙', 'Settings'],
  ];
  const TITLES = { home: 'Home', money: 'Money in & out', invoices: 'Invoices', reconcile: 'Reconcile payments', mileage: 'Mileage', vat: 'VAT returns', mtd: 'Income Tax (Making Tax Digital)', import: 'Import from other software', activity: 'Activity log', settings: 'Settings' };

  function renderApp() {
    el.innerHTML = '';
    const b = biz();
    const nav = NAV.filter((n) => n[0] !== 'vat' || b.vatRegistered);
    const shell = h(`<div class="shell">
      <aside class="sidebar">
        <div class="brand-row"><div class="logo-dot">L</div><div class="brand-name">Lumi <span>Lite</span></div></div>
        <nav id="nav"></nav>
        <div class="sidebar-foot">
          <div class="nav-item" id="addBiz"><span class="nav-ic">＋</span> Add a business</div>
          <div class="nav-item" id="logout"><span class="nav-ic">⎋</span> Sign out</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <h1 id="title"></h1>
          <div class="biz-switch">
            <button class="btn small gold" id="quickIn">＋ Money in</button>
            <button class="btn small" id="quickOut" style="background:#b9692f;border-color:#b9692f;color:#fff">＋ Money out</button>
            <select id="bizSel">${state.businesses.map((x) => `<option value="${x.id}" ${x.id === state.businessId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
            <div class="avatar" title="${esc(state.user.name)}">${esc(initials(state.user.name))}</div>
          </div>
        </header>
        <div class="content" id="content"></div>
      </div></div>`);
    el.appendChild(shell);
    const navEl = shell.querySelector('#nav');
    nav.forEach(([key, ic, label]) => {
      const it = h(`<div class="nav-item ${state.view === key ? 'active' : ''}"><span class="nav-ic">${ic}</span> ${label}</div>`);
      it.addEventListener('click', () => { state.view = key; renderApp(); });
      navEl.appendChild(it);
    });
    shell.querySelector('#bizSel').addEventListener('change', async (e) => { state.businessId = e.target.value; await loadBusiness(); state.view = 'home'; renderApp(); });
    shell.querySelector('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; state.business = null; renderAuth(); });
    shell.querySelector('#addBiz').addEventListener('click', renderOnboardingExtra);
    shell.querySelector('#quickIn').addEventListener('click', () => openEntry('in'));
    shell.querySelector('#quickOut').addEventListener('click', () => openEntry('out'));
    shell.querySelector('#title').textContent = TITLES[state.view] || '';
    const c = shell.querySelector('#content');
    ({ home: renderHome, money: renderMoney, invoices: renderInvoices, reconcile: renderReconcile, mileage: renderMileage, vat: renderVat, mtd: renderMtd, import: renderImport, activity: renderActivity, settings: renderSettings }[state.view] || renderHome)(c);
  }
  function renderOnboardingExtra() { state.businessId = null; renderOnboarding(); }

  // ===================== HOME =====================
  async function renderHome(c) {
    c.innerHTML = '<div class="empty">Loading…</div>';
    const s = await api(`/api/businesses/${state.businessId}/summary`);
    c.innerHTML = '';
    c.appendChild(h(`<p class="muted-inline" style="margin-top:0">Here's how <b>${esc(biz().name)}</b> is doing this tax year (${esc(s.taxYear)}, 6 Apr–5 Apr). You're on <b>${s.basis === 'cash' ? 'cash basis' : 'traditional'}</b>.</p>`));
    if (s.reconcileReady > 0) {
      const nudge = h(`<div class="card" style="border-left:4px solid var(--gold);background:var(--gold-bg)"><div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 20px">
        <span style="font-size:18px">⇄</span><span style="flex:1"><b>${s.reconcileReady} payment${s.reconcileReady === 1 ? '' : 's'} ready to reconcile</b> — match ${s.reconcileReady === 1 ? 'it' : 'them'} to your invoices in one click.</span>
        <button class="btn small" id="goRec">Reconcile now</button></div></div>`);
      c.appendChild(nudge);
      nudge.querySelector('#goRec').addEventListener('click', () => { state.view = 'reconcile'; renderApp(); });
    }
    c.appendChild(h(`<div class="stat-cards" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="label">Money in</div><div class="value pos">${money(s.moneyIn)}</div><div class="sub">your sales so far</div></div>
      <div class="stat"><div class="label">Money out</div><div class="value">${money(s.moneyOut)}</div><div class="sub">allowable business costs</div></div>
      <div class="stat"><div class="label">Profit so far</div><div class="value ${s.profit < 0 ? 'neg' : 'pos'}">${money(s.profit)}</div><div class="sub">what you've earned</div></div>
    </div>`));

    // Tax to set aside
    const est = s.estimate;
    const setAside = h(`<div class="card"><div class="card-head"><h2>Put aside for tax</h2><div class="spacer"></div><span class="pill warn">estimate</span></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
          <div><div class="muted-inline">Based on this year's profit, set aside roughly</div><div class="big-num" style="color:var(--brand-dark)">${money(est.totalDue)}</div>
            <div class="muted-inline">that's about <b>${est.setAsidePct}%</b> of what you earn</div></div>
          <div style="flex:1;min-width:220px">
            <div class="boxes">
              <div class="box"><div class="bl">Income Tax</div><div class="bv">${money(est.incomeTax)}</div></div>
              <div class="box"><div class="bl">National Insurance (Class 4)</div><div class="bv">${money(est.class4)}</div></div>
            </div>
          </div>
        </div>
        <div class="note grey" style="margin-top:14px">A rough guide for ${esc(s.taxYear)} using your profit so far — not a final tax bill. Your personal allowance is ${money0(est.personalAllowance)}.</div>
      </div></div>`);
    c.appendChild(setAside);

    // VAT + thresholds
    if (s.vatRegistered && s.vat) {
      c.appendChild(h(`<div class="card"><div class="card-head"><h2>VAT this quarter</h2><div class="spacer"></div><button class="btn small secondary" id="goVat">Open VAT</button></div>
        <div class="card-body"><div class="muted-inline">From ${esc(s.vat.from)} to today</div><div class="big-num">${money(s.vat.due)}</div><div class="muted-inline">${s.vat.due >= 0 ? 'roughly what you owe HMRC so far' : 'roughly what HMRC owes you so far'}</div></div></div>`));
      c.querySelector('#goVat').addEventListener('click', () => { state.view = 'vat'; renderApp(); });
    }
    // threshold watch
    const pctVat = Math.min(100, Math.round((s.rolling12mSales / s.vatThreshold) * 100));
    if (!s.vatRegistered && s.rolling12mSales > s.vatThreshold * 0.75) {
      c.appendChild(h(`<div class="card"><div class="card-body"><div class="note">Heads up: your sales over the last 12 months are ${money0(s.rolling12mSales)} — that's ${pctVat}% of the £90,000 VAT registration point. <div class="progress" style="margin-top:8px"><span style="width:${pctVat}%"></span></div></div></div></div>`));
    }

    // Upcoming filing deadlines
    if (s.deadlines && s.deadlines.length) {
      const card = h(`<div class="card"><div class="card-head"><h2>Coming up</h2><div class="spacer"></div><span class="pill warn">deadlines</span></div>
        <div class="card-body flush"><table><tbody id="dl"></tbody></table></div></div>`);
      const tb = card.querySelector('#dl');
      s.deadlines.forEach((d) => {
        const overdue = d.daysAway < 0, soon = d.daysAway >= 0 && d.daysAway <= 14;
        const when = overdue ? `<span style="color:var(--danger);font-weight:600">${Math.abs(d.daysAway)} day${Math.abs(d.daysAway) === 1 ? '' : 's'} overdue</span>` : `in ${d.daysAway} day${d.daysAway === 1 ? '' : 's'}`;
        tb.appendChild(h(`<tr>
          <td><b>${esc(d.type)}</b><br><span class="muted-inline">${esc(d.label)}</span></td>
          <td class="num"><span class="pill ${overdue ? 'bad' : soon ? 'warn' : 'ok'}">${esc(d.date)}</span><br><span class="muted-inline" style="font-size:12px">${when}</span></td></tr>`));
      });
      c.appendChild(card);
    }
    // Owed to you (outstanding invoices)
    if (s.outstandingInvoices > 0) {
      const oc = h(`<div class="card"><div class="card-head"><h2>Owed to you</h2><div class="spacer"></div><button class="btn small secondary" id="goInv">Track invoices</button></div>
        <div class="card-body"><div class="big-num">${money(s.outstandingInvoices)}</div>
        <div class="muted-inline">${s.outstandingCount} invoice${s.outstandingCount === 1 ? '' : 's'} awaiting payment${s.overdueInvoices > 0 ? ` · <span style="color:var(--danger)">${money(s.overdueInvoices)} overdue</span>` : ''}</div></div></div>`);
      c.appendChild(oc);
      oc.querySelector('#goInv').addEventListener('click', () => { state.view = 'invoices'; renderApp(); });
    }
    // quick actions
    const qa = h(`<div class="card"><div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn in" id="qi">＋ Add money in</button>
      <button class="btn out" id="qo">＋ Add money out</button>
      <button class="btn secondary" id="qmtd">See my Income Tax updates</button>
    </div></div>`);
    c.appendChild(qa);
    qa.querySelector('#qi').addEventListener('click', () => openEntry('in'));
    qa.querySelector('#qo').addEventListener('click', () => openEntry('out'));
    qa.querySelector('#qmtd').addEventListener('click', () => { state.view = 'mtd'; renderApp(); });
  }

  // ===================== MONEY IN / OUT =====================
  function catOptions(direction, sel) {
    const list = state.categories[direction === 'in' ? 'income' : 'expense'];
    return list.map((cat) => `<option value="${cat.key}" ${cat.key === sel ? 'selected' : ''}>${esc(cat.label)}</option>`).join('');
  }
  function openEntry(direction, existing) {
    const b = biz();
    const editing = !!existing;
    const body = h(`<div>
      <div class="choice-grid" style="margin-bottom:6px">
        <div class="choice ${direction === 'in' ? 'selected' : ''}" data-d="in"><h3 style="color:var(--ok)">Money in</h3><p>A sale or income</p></div>
        <div class="choice ${direction === 'out' ? 'selected' : ''}" data-d="out"><h3 style="color:#b9692f">Money out</h3><p>A business cost</p></div>
      </div>
      <div class="inline-row">
        <div><label>Amount (£)</label><input id="gross" type="number" step="0.01" min="0" value="${editing ? existing.gross : ''}" placeholder="0.00" /></div>
        <div><label>Date</label><input id="date" type="date" value="${editing ? existing.date : today()}" /></div>
      </div>
      <label>What was it for?</label><select id="cat">${catOptions(direction, editing ? existing.category : '')}</select>
      ${b.vatRegistered ? `<label>VAT</label><select id="vat"><option value="20">Standard 20%</option><option value="5">Reduced 5%</option><option value="0">No VAT / Zero</option></select>` : ''}
      <label>Note (optional)</label><input id="desc" value="${editing ? esc(existing.description) : ''}" placeholder="e.g. Materials from Wickes" />
      <label>Receipt (optional — photo or PDF)</label><input id="receipt" type="file" accept="image/*,application/pdf" />
      ${editing && existing.attachmentId ? `<div class="muted-inline" style="margin-top:4px">📎 Receipt attached — <a href="/api/businesses/${state.businessId}/attachments/${existing.attachmentId}" target="_blank">view</a> · <a id="rmReceipt" style="cursor:pointer;color:var(--danger)">remove</a></div>` : ''}
      <div class="err" id="err"></div></div>`);
    let dir = direction;
    body.querySelectorAll('.choice').forEach((ch) => ch.addEventListener('click', () => {
      dir = ch.getAttribute('data-d');
      body.querySelectorAll('.choice').forEach((x) => x.classList.toggle('selected', x === ch));
      body.querySelector('#cat').innerHTML = catOptions(dir, '');
    }));
    if (editing && b.vatRegistered) body.querySelector('#vat').value = String(existing.vatRate || 0);
    const rm = body.querySelector('#rmReceipt');
    if (rm) rm.addEventListener('click', async () => { await api(`/api/businesses/${state.businessId}/entries/${existing.id}/receipt`, { method: 'DELETE' }); flash('Receipt removed'); close(); renderApp(); });
    const save = h(`<button class="btn">${editing ? 'Save' : 'Add it'}</button>`);
    const { close } = modal(editing ? 'Edit entry' : 'Add an entry', body, save);
    save.addEventListener('click', async () => {
      const payload = { date: body.querySelector('#date').value, direction: dir, category: body.querySelector('#cat').value, description: body.querySelector('#desc').value, gross: Number(body.querySelector('#gross').value), vatRate: b.vatRegistered ? Number(body.querySelector('#vat').value) : 0 };
      try {
        let entryId = editing ? existing.id : null;
        if (editing) await api(`/api/businesses/${state.businessId}/entries/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else { const r = await api(`/api/businesses/${state.businessId}/entries`, { method: 'POST', body: JSON.stringify(payload) }); entryId = r.entry.id; }
        const f = body.querySelector('#receipt').files[0];
        if (f) {
          if (f.size > 10 * 1024 * 1024) { body.querySelector('#err').textContent = 'Entry saved, but the receipt is too big (max 10MB).'; renderApp(); return; }
          const dataUrl = await readFileDataUrl(f);
          await api(`/api/businesses/${state.businessId}/entries/${entryId}/receipt`, { method: 'POST', body: JSON.stringify({ dataUrl, originalName: f.name }) });
        }
        close(); flash(editing ? 'Saved' : (dir === 'in' ? 'Money in added' : 'Money out added')); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }
  async function renderMoney(c) {
    const { entries } = await api(`/api/businesses/${state.businessId}/entries`);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="muted-inline" style="flex:1">Every sale and cost you record here feeds your profit, VAT and Income Tax updates automatically.</span>
      <button class="btn in small" id="ai">＋ Money in</button><button class="btn out small" id="ao">＋ Money out</button></div></div>`));
    c.querySelector('#ai').addEventListener('click', () => openEntry('in'));
    c.querySelector('#ao').addEventListener('click', () => openEntry('out'));
    const filters = [['all', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['unmatched', 'Unmatched income']];
    const card = h(`<div class="card"><div class="card-head"><h2>Your entries</h2><div class="spacer"></div>
      <div class="seg" id="filters">${filters.map(([f, l], i) => `<button data-f="${f}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="card-body flush"><table><thead><tr><th>Date</th><th>What</th><th>Type</th><th class="num">Amount</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    let filter = 'all';
    const matches = (e) => filter === 'all' ? true : filter === 'unmatched' ? (e.direction === 'in' && !e.invoiceId) : e.direction === filter;
    const drawRows = () => {
      tb.innerHTML = '';
      const list = entries.filter(matches);
      if (!list.length) { tb.appendChild(h(`<tr><td colspan="5" class="empty">${filter === 'unmatched' ? 'No unmatched income — every payment is matched to an invoice.' : 'Nothing here yet.'}</td></tr>`)); return; }
      list.forEach((e) => {
        const link = e.invoiceId ? `<br><span class="pill warn invlink" style="cursor:pointer" title="Matched to a sales invoice — click to view">↔ ${esc(e.invoiceNumber || 'invoice')}${e.customerName ? ' · ' + esc(e.customerName) : ''}</span>` : (e.direction === 'in' ? '<br><span class="pill" style="background:var(--cream-2);color:var(--mid)">unmatched</span>' : '');
        const actions = e.locked
          ? '<span class="pill" style="background:var(--cream-2);color:var(--mid)" title="In a period already filed to HMRC">🔒 filed</span>'
          : '<button class="btn ghost small ed">Edit</button> <button class="btn ghost small del" style="color:var(--danger)">✕</button>';
        const row = h(`<tr>
          <td>${esc(e.date)}</td>
          <td><b>${esc(e.categoryLabel)}</b>${e.attachmentId ? ` <a href="/api/businesses/${state.businessId}/attachments/${e.attachmentId}" target="_blank" title="View receipt" style="text-decoration:none">📎</a>` : ''}${e.description ? `<br><span class="muted-inline" style="font-size:12.5px">${esc(e.description)}</span>` : ''}${link}</td>
          <td><span class="pill ${e.direction}">${e.direction === 'in' ? 'in' : 'out'}</span></td>
          <td class="num">${money(e.gross)}${e.vat ? `<br><span class="muted-inline" style="font-size:11px">inc. ${money(e.vat)} VAT</span>` : ''}</td>
          <td class="num" style="white-space:nowrap">${actions}</td></tr>`);
        const lk = row.querySelector('.invlink'); if (lk) lk.addEventListener('click', () => { state.view = 'invoices'; renderApp(); });
        const ed = row.querySelector('.ed'); if (ed) ed.addEventListener('click', () => openEntry(e.direction, e));
        const del = row.querySelector('.del'); if (del) del.addEventListener('click', async () => { if (confirm('Delete this entry?')) { await api(`/api/businesses/${state.businessId}/entries/${e.id}`, { method: 'DELETE' }); renderApp(); } });
        tb.appendChild(row);
      });
    };
    card.querySelectorAll('#filters button').forEach((b) => b.addEventListener('click', () => { filter = b.getAttribute('data-f'); card.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x === b)); drawRows(); }));
    drawRows();
    c.appendChild(card);
  }

  // ===================== INVOICES =====================
  async function setStatus(inv, status, msg) { try { await api(`/api/businesses/${state.businessId}/invoices/${inv.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); flash(msg); renderApp(); } catch (e) { flash(e.message, true); } }
  function openMatch(inv, entries) {
    const candidates = entries.filter((e) => e.direction === 'in' && !e.invoiceId).sort((a, b) => (a.date < b.date ? 1 : -1));
    const body = h(`<div><p class="muted-inline" style="margin-top:0">Match <b>${esc(inv.number)}</b> (${money(inv.total)}) to the money that came in for it. This marks the invoice paid without adding a duplicate.</p><div id="list"></div></div>`);
    const list = body.querySelector('#list');
    if (!candidates.length) list.appendChild(h('<div class="empty">No unmatched money-in entries yet. Record the payment under “Money in”, or use “Mark paid” to add it.</div>'));
    candidates.forEach((e) => {
      const near = Math.abs(e.gross - inv.total) < 0.01;
      const row = h(`<div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--cream-2)">
        <div style="flex:1"><b>${money(e.gross)}</b> ${near ? '<span class="pill ok">exact match</span>' : ''}<br><span class="muted-inline">${esc(e.date)} · ${esc(e.description || e.categoryLabel)}</span></div>
        <button class="btn small">Match</button></div>`);
      row.querySelector('button').addEventListener('click', async () => { try { await api(`/api/businesses/${state.businessId}/invoices/${inv.id}/reconcile`, { method: 'POST', body: JSON.stringify({ entryId: e.id }) }); close(); flash('Matched — invoice marked paid'); renderApp(); } catch (err) { flash(err.message, true); } });
      list.appendChild(row);
    });
    const { close } = modal('Match a payment', body);
  }
  function openEmailInvoice(inv) {
    const subject = `Invoice ${inv.number} from ${biz().name}`;
    const bodyText = `Hi ${inv.customerName},\n\nPlease find the details of invoice ${inv.number} for ${money(inv.total)}, due ${inv.dueDate}.\n\n${inv.lines.map((l) => `- ${l.description || 'Item'}: ${money(l.amount + (l.vat || 0))}`).join('\n')}\n\nTotal to pay: ${money(inv.total)}\n\nMany thanks,\n${biz().name}`;
    const body = h(`<div>
      <p class="muted-inline" style="margin-top:0">This opens your email app with the message ready to send. Open the printable invoice first if you'd like to save a PDF and attach it.</p>
      <label>To</label><input id="to" value="${esc(inv.customerEmail || '')}" placeholder="customer@email.com" />
      <label>Subject</label><input id="subj" value="${esc(subject)}" />
      <label>Message</label><textarea id="msg" rows="7">${esc(bodyText)}</textarea>
      <div class="err" id="err"></div></div>`);
    const printBtn = h('<button class="btn secondary">Open printable invoice</button>');
    const sendBtn = h('<button class="btn">Open email</button>');
    const foot = document.createElement('div'); foot.style.display = 'contents'; foot.append(printBtn, sendBtn);
    const { close } = modal(`Email ${inv.number}`, body, foot);
    printBtn.addEventListener('click', () => openDoc(invoiceDocHTML(inv)));
    sendBtn.addEventListener('click', async () => {
      const tov = body.querySelector('#to').value.trim();
      window.open(`mailto:${encodeURIComponent(tov)}?subject=${encodeURIComponent(body.querySelector('#subj').value)}&body=${encodeURIComponent(body.querySelector('#msg').value)}`, '_blank');
      if (inv.status === 'draft') { try { await api(`/api/businesses/${state.businessId}/invoices/${inv.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'sent' }) }); } catch (e) {} }
      close(); flash('Email opened'); renderApp();
    });
  }
  function openStatements(invoices) {
    const byCust = {};
    invoices.forEach((i) => { (byCust[i.customerName] = byCust[i.customerName] || []).push(i); });
    const names = Object.keys(byCust).sort();
    const body = h('<div><p class="muted-inline" style="margin-top:0">A statement lists everything a customer owes you. Open one to print or save as a PDF to send them.</p><div id="list"></div></div>');
    const list = body.querySelector('#list');
    if (!names.length) list.appendChild(h('<div class="empty">No customers yet.</div>'));
    names.forEach((n) => {
      const invs = byCust[n];
      const outstanding = invs.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0);
      const row = h(`<div style="display:flex;align-items:center;gap:12px;padding:11px 8px;border-bottom:1px solid var(--cream-2)">
        <div style="flex:1"><b>${esc(n)}</b><br><span class="muted-inline">${invs.length} invoice${invs.length === 1 ? '' : 's'} · ${money(outstanding)} outstanding</span></div>
        <button class="btn small secondary">View statement</button></div>`);
      row.querySelector('button').addEventListener('click', () => openDoc(statementDocHTML(n, invs)));
      list.appendChild(row);
    });
    modal('Customer statements', body);
  }
  async function renderInvoices(c) {
    const [{ invoices }, { entries }] = await Promise.all([api(`/api/businesses/${state.businessId}/invoices`), api(`/api/businesses/${state.businessId}/entries`)]);
    c.innerHTML = '';
    const sent = invoices.filter((i) => i.status === 'sent');
    const outstanding = sent.reduce((s, i) => s + i.total, 0);
    const overdue = sent.filter((i) => i.dueDate < today()).reduce((s, i) => s + i.total, 0);
    c.appendChild(h(`<div class="stat-cards" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="label">Outstanding</div><div class="value">${money(outstanding)}</div><div class="sub">${sent.length} invoice${sent.length === 1 ? '' : 's'} awaiting payment</div></div>
      <div class="stat"><div class="label">Overdue</div><div class="value ${overdue > 0 ? 'neg' : ''}">${money(overdue)}</div><div class="sub">past the due date</div></div>
      <div class="stat"><div class="label">Paid this list</div><div class="value pos">${money(invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0))}</div><div class="sub">already settled</div></div>
    </div>`));
    const head = h(`<div class="card"><div class="card-head"><h2>Invoices</h2><div class="spacer"></div><button class="btn small secondary" id="stmts">Statements</button> <button class="btn small" id="new">＋ New invoice</button></div>
      <div class="card-body flush"><table><thead><tr><th>Number</th><th>Customer</th><th>Due</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = head.querySelector('#rows');
    if (!invoices.length) tb.appendChild(h('<tr><td colspan="6" class="empty">No invoices yet. Raise one to send to a customer.</td></tr>'));
    invoices.forEach((inv) => {
      const isOverdue = inv.status === 'sent' && inv.dueDate < today();
      const statusPill = inv.status === 'paid' ? '<span class="pill ok">paid</span>' : isOverdue ? '<span class="pill bad">overdue</span>' : inv.status === 'sent' ? '<span class="pill warn">awaiting payment</span>' : '<span class="pill">draft</span>';
      const paidEntry = inv.entryId ? entries.find((e) => e.id === inv.entryId) : null;
      const paidBy = inv.status === 'paid' ? `<br><span class="muted-inline" style="font-size:12px">Paid by ${money(paidEntry ? paidEntry.gross : inv.total)} on ${esc(inv.paidDate || (paidEntry ? paidEntry.date : ''))}</span>` : '';
      const row = h(`<tr><td><b>${esc(inv.number)}</b></td><td>${esc(inv.customerName)}${paidBy}</td><td>${esc(inv.dueDate)}</td>
        <td class="num">${money(inv.total)}</td><td>${statusPill}</td><td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const del = async () => { if (confirm('Delete invoice?')) { await api(`/api/businesses/${state.businessId}/invoices/${inv.id}`, { method: 'DELETE' }); renderApp(); } };
      const email = () => openEmailInvoice(inv), print = () => openDoc(invoiceDocHTML(inv));
      const primary = h('<button class="btn small"></button>');
      let menuItems;
      if (inv.status === 'draft') { primary.textContent = 'Send'; primary.addEventListener('click', () => setStatus(inv, 'sent', 'Marked as sent')); menuItems = [['Edit', () => openInvoice(inv)], ['Email customer', email], ['Print / save PDF', print], ['Delete', del, true]]; }
      else if (inv.status === 'sent') { primary.textContent = 'Match payment'; primary.classList.add('secondary'); primary.addEventListener('click', () => openMatch(inv, entries)); menuItems = [['Mark paid (add money in)', () => setStatus(inv, 'paid', 'Marked paid & added to money in')], ['Edit', () => openInvoice(inv)], ['Email customer', email], ['Print / save PDF', print], ['Delete', del, true]]; }
      else { primary.textContent = 'Print / PDF'; primary.classList.add('secondary'); primary.addEventListener('click', print); menuItems = [['Mark unpaid', () => setStatus(inv, 'sent', 'Marked unpaid')], ['Email customer', email], ['Delete', del, true]]; }
      const more = h('<button class="btn ghost small" aria-label="More actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems); });
      act.append(primary, document.createTextNode(' '), more);
      tb.appendChild(row);
    });
    c.appendChild(head);
    head.querySelector('#new').addEventListener('click', () => openInvoice());
    head.querySelector('#stmts').addEventListener('click', () => openStatements(invoices));
  }
  function openInvoice(existing) {
    const b = biz();
    const editing = !!existing;
    const body = h(`<div>
      <div class="inline-row"><div><label>Customer name</label><input id="cn" value="${editing ? esc(existing.customerName) : ''}" placeholder="Who is it for?" /></div><div><label>Email (optional)</label><input id="ce" type="email" value="${editing ? esc(existing.customerEmail || '') : ''}" /></div></div>
      <div class="inline-row"><div><label>Issue date</label><input id="iss" type="date" value="${editing ? esc(existing.issueDate) : today()}" /></div><div><label>Due date</label><input id="due" type="date" value="${editing ? esc(existing.dueDate) : today()}" /></div></div>
      <label style="margin-top:14px">What are you charging for?</label><div id="lines"></div>
      <button class="btn ghost small" id="add" type="button">＋ Add line</button>
      <div class="muted-inline" id="tot" style="margin-top:8px"></div>
      <div class="err" id="err"></div></div>`);
    const lines = body.querySelector('#lines');
    const recompute = () => { let n = 0, v = 0; lines.querySelectorAll('.ln').forEach((r) => { const a = Number(r.querySelector('.amt').value || 0); n += a; v += a * (Number(r.querySelector('.vr') ? r.querySelector('.vr').value : 0) || 0) / 100; }); body.querySelector('#tot').innerHTML = `Total <b>${money(n + v)}</b>${b.vatRegistered ? ` (inc. ${money(v)} VAT)` : ''}`; };
    const addLine = (preset) => {
      const r = h(`<div class="ln" style="display:grid;grid-template-columns:2fr 1fr ${b.vatRegistered ? '1fr' : ''} auto;gap:8px;margin-bottom:8px;align-items:center">
        <input class="desc" placeholder="Description" /><input class="amt num" type="number" step="0.01" placeholder="£0.00" />
        ${b.vatRegistered ? '<select class="vr"><option value="20">20%</option><option value="0">0%</option><option value="5">5%</option></select>' : ''}
        <button class="btn ghost small rm" type="button">✕</button></div>`);
      r.querySelector('.rm').addEventListener('click', () => { r.remove(); recompute(); });
      r.querySelector('.amt').addEventListener('input', recompute);
      if (r.querySelector('.vr')) r.querySelector('.vr').addEventListener('change', recompute);
      if (preset) { r.querySelector('.desc').value = preset.description || ''; r.querySelector('.amt').value = preset.amount || ''; if (r.querySelector('.vr')) r.querySelector('.vr').value = String(preset.vatRate || 0); }
      lines.appendChild(r);
    };
    if (editing && existing.lines && existing.lines.length) existing.lines.forEach((l) => addLine(l)); else addLine();
    recompute();
    body.querySelector('#add').addEventListener('click', () => addLine());
    const save = h(`<button class="btn">${editing ? 'Save changes' : 'Create invoice'}</button>`);
    const { close } = modal(editing ? `Edit ${existing.number}` : 'New invoice', body, save);
    save.addEventListener('click', async () => {
      const ls = [...lines.querySelectorAll('.ln')].map((r) => ({ description: r.querySelector('.desc').value, amount: Number(r.querySelector('.amt').value || 0), vatRate: r.querySelector('.vr') ? Number(r.querySelector('.vr').value) : 0 })).filter((l) => l.amount > 0);
      const payload = { customerName: body.querySelector('#cn').value, customerEmail: body.querySelector('#ce').value, issueDate: body.querySelector('#iss').value, dueDate: body.querySelector('#due').value, lines: ls };
      try {
        if (editing) await api(`/api/businesses/${state.businessId}/invoices/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api(`/api/businesses/${state.businessId}/invoices`, { method: 'POST', body: JSON.stringify(payload) });
        close(); flash(editing ? 'Invoice updated' : 'Invoice created'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ===================== RECONCILE =====================
  async function reconcileMatch(invId, entryId) { return api(`/api/businesses/${state.businessId}/invoices/${invId}/reconcile`, { method: 'POST', body: JSON.stringify({ entryId }) }); }
  function openMatchToInvoice(entry, invoices) {
    const open = invoices.filter((i) => i.status !== 'paid');
    const body = h(`<div><p class="muted-inline" style="margin-top:0">Match this payment of <b>${money(entry.gross)}</b> (${esc(entry.date)}) to one of your invoices.</p><div id="list"></div></div>`);
    const list = body.querySelector('#list');
    if (!open.length) list.appendChild(h('<div class="empty">No open invoices to match to.</div>'));
    open.sort((a, b) => Math.abs(a.total - entry.gross) - Math.abs(b.total - entry.gross)).forEach((inv) => {
      const near = Math.abs(inv.total - entry.gross) < 0.01;
      const row = h(`<div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--cream-2)">
        <div style="flex:1"><b>${esc(inv.number)}</b> · ${esc(inv.customerName)} ${near ? '<span class="pill ok">exact match</span>' : ''}<br><span class="muted-inline">${money(inv.total)} · due ${esc(inv.dueDate)}</span></div>
        <button class="btn small">Match</button></div>`);
      row.querySelector('button').addEventListener('click', async () => { try { await reconcileMatch(inv.id, entry.id); close(); flash('Matched'); renderApp(); } catch (e) { flash(e.message, true); } });
      list.appendChild(row);
    });
    const { close } = modal('Match to an invoice', body);
  }
  async function renderReconcile(c) {
    const [{ invoices }, { entries }] = await Promise.all([api(`/api/businesses/${state.businessId}/invoices`), api(`/api/businesses/${state.businessId}/entries`)]);
    c.innerHTML = '';
    const unpaid = invoices.filter((i) => i.status === 'sent');
    const unmatched = entries.filter((e) => e.direction === 'in' && !e.invoiceId);
    // Build suggestions (exact amount and/or customer name appearing in the payment note).
    const suggestions = [];
    unpaid.forEach((inv) => unmatched.forEach((e) => {
      const amountMatch = Math.abs(e.gross - inv.total) < 0.01;
      const nameMatch = inv.customerName && (e.description || '').toLowerCase().includes(inv.customerName.toLowerCase());
      if (amountMatch || nameMatch) suggestions.push({ inv, entry: e, score: (amountMatch ? 2 : 0) + (nameMatch ? 1 : 0), amountMatch, nameMatch });
    }));
    suggestions.sort((a, b) => b.score - a.score);
    // Greedy one-to-one set for "match all" (exact-amount only, each side used once).
    const usedInv = new Set(), usedEntry = new Set(), autoPairs = [];
    suggestions.filter((s) => s.amountMatch).forEach((s) => { if (!usedInv.has(s.inv.id) && !usedEntry.has(s.entry.id)) { usedInv.add(s.inv.id); usedEntry.add(s.entry.id); autoPairs.push(s); } });

    c.appendChild(h(`<div class="stat-cards" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="label">Invoices awaiting payment</div><div class="value">${unpaid.length}</div><div class="sub">${money(unpaid.reduce((s, i) => s + i.total, 0))} outstanding</div></div>
      <div class="stat"><div class="label">Unmatched money in</div><div class="value">${unmatched.length}</div><div class="sub">${money(unmatched.reduce((s, e) => s + e.gross, 0))} received</div></div>
      <div class="stat"><div class="label">Suggested matches</div><div class="value pos">${autoPairs.length}</div><div class="sub">ready to clear in one click</div></div>
    </div>`));

    // Suggested matches
    if (autoPairs.length || suggestions.length) {
      const card = h(`<div class="card"><div class="card-head"><h2>Suggested matches</h2><div class="spacer"></div>${autoPairs.length ? `<button class="btn small" id="all">Match all ${autoPairs.length} exact</button>` : ''}</div>
        <div class="card-body flush"><table><thead><tr><th>Invoice</th><th>Payment received</th><th>Why</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
      const tb = card.querySelector('#rows');
      const shown = suggestions.slice(0, 30);
      shown.forEach((s) => {
        const why = s.amountMatch && s.nameMatch ? '<span class="pill ok">amount + name</span>' : s.amountMatch ? '<span class="pill ok">same amount</span>' : '<span class="pill warn">name match</span>';
        const row = h(`<tr>
          <td><b>${esc(s.inv.number)}</b> · ${esc(s.inv.customerName)}<br><span class="muted-inline">${money(s.inv.total)} · due ${esc(s.inv.dueDate)}</span></td>
          <td>${money(s.entry.gross)}<br><span class="muted-inline">${esc(s.entry.date)} · ${esc(s.entry.description || s.entry.categoryLabel)}</span></td>
          <td>${why}</td>
          <td class="num"><button class="btn small">Match</button></td></tr>`);
        row.querySelector('button').addEventListener('click', async () => { try { await reconcileMatch(s.inv.id, s.entry.id); flash('Matched'); renderApp(); } catch (e) { flash(e.message, true); } });
        tb.appendChild(row);
      });
      c.appendChild(card);
      const allBtn = card.querySelector('#all');
      if (allBtn) allBtn.addEventListener('click', async () => {
        allBtn.disabled = true; let n = 0;
        for (const p of autoPairs) { try { await reconcileMatch(p.inv.id, p.entry.id); n++; } catch (e) {} }
        flash(`Matched ${n} payment${n === 1 ? '' : 's'}`); renderApp();
      });
    }

    // Remaining lists, side by side
    const grid = h('<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"></div>');
    const invCard = h(`<div class="card"><div class="card-head"><h2>Unpaid invoices</h2></div><div class="card-body flush"><table><tbody id="iv"></tbody></table></div></div>`);
    const ivb = invCard.querySelector('#iv');
    if (!unpaid.length) ivb.appendChild(h('<tr><td class="empty">All invoices are paid 🎉</td></tr>'));
    unpaid.forEach((inv) => {
      const od = inv.dueDate < today();
      const row = h(`<tr><td><b>${esc(inv.number)}</b> · ${esc(inv.customerName)}<br><span class="muted-inline">${money(inv.total)} · due ${esc(inv.dueDate)} ${od ? '<span class="pill bad">overdue</span>' : ''}</span></td><td class="num"><button class="btn ghost small">Match payment</button></td></tr>`);
      row.querySelector('button').addEventListener('click', () => openMatch(inv, entries));
      ivb.appendChild(row);
    });
    const payCard = h(`<div class="card"><div class="card-head"><h2>Unmatched money in</h2></div><div class="card-body flush"><table><tbody id="pe"></tbody></table></div></div>`);
    const peb = payCard.querySelector('#pe');
    if (!unmatched.length) peb.appendChild(h('<tr><td class="empty">Every payment is matched 🎉</td></tr>'));
    unmatched.forEach((e) => {
      const row = h(`<tr><td><b>${money(e.gross)}</b><br><span class="muted-inline">${esc(e.date)} · ${esc(e.description || e.categoryLabel)}</span></td><td class="num"><button class="btn ghost small">Match to invoice</button></td></tr>`);
      row.querySelector('button').addEventListener('click', () => openMatchToInvoice(e, invoices));
      peb.appendChild(row);
    });
    grid.append(invCard, payCard);
    c.appendChild(grid);
  }

  // ===================== MILEAGE =====================
  function openMileageModal(existing) {
    const editing = !!existing;
    const body = h(`<div><div class="inline-row"><div><label>Date</label><input id="d" type="date" value="${editing ? esc(existing.date) : today()}" /></div><div><label>Miles</label><input id="mi" type="number" step="1" min="0" value="${editing ? existing.miles : ''}" /></div></div>
      <div class="inline-row"><div><label>From</label><input id="from" value="${editing ? esc(existing.from || '') : ''}" placeholder="e.g. Home" /></div><div><label>To</label><input id="to" value="${editing ? esc(existing.to || '') : ''}" placeholder="e.g. Winchester" /></div></div>
      <label>Vehicle</label><select id="v">
        <option value="car" ${editing && existing.vehicle === 'car' ? 'selected' : ''}>Car</option>
        <option value="van" ${editing && existing.vehicle === 'van' ? 'selected' : ''}>Van</option>
        <option value="motorcycle" ${editing && existing.vehicle === 'motorcycle' ? 'selected' : ''}>Motorcycle</option></select>
      <label>Purpose (optional)</label><input id="p" value="${editing ? esc(existing.purpose || '') : ''}" placeholder="e.g. Emergency callout" />
      <div class="err" id="err"></div></div>`);
    const save = h(`<button class="btn">${editing ? 'Save trip' : 'Add trip'}</button>`);
    const { close } = modal(editing ? 'Edit trip' : 'Add a trip', body, save);
    save.addEventListener('click', async () => {
      const payload = { date: body.querySelector('#d').value, miles: Number(body.querySelector('#mi').value), vehicle: body.querySelector('#v').value, purpose: body.querySelector('#p').value, from: body.querySelector('#from').value, to: body.querySelector('#to').value };
      try {
        if (editing) await api(`/api/businesses/${state.businessId}/mileage/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api(`/api/businesses/${state.businessId}/mileage`, { method: 'POST', body: JSON.stringify(payload) });
        close(); flash(editing ? 'Trip saved' : 'Trip added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }
  async function renderMileage(c) {
    const { mileage, rates } = await api(`/api/businesses/${state.businessId}/mileage`);
    const first = Math.round((rates.first || 0.55) * 100), after = Math.round((rates.after || 0.25) * 100);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body"><div class="note grey">Instead of working out actual car costs, you can claim a flat rate per business mile: <b>${first}p per mile</b> for the first 10,000 miles in a tax year, then <b>${after}p per mile</b> after that (cars and vans). Log your business trips here and we'll add the claim to your costs automatically.</div></div></div>`));
    const card = h(`<div class="card"><div class="card-head"><h2>Mileage log</h2><div class="spacer"></div><button class="btn small" id="new">＋ Add a trip</button></div>
      <div class="card-body flush"><table><thead><tr><th>Date</th><th>Miles</th><th>Vehicle</th><th>Journey</th><th class="num">Claim</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!mileage.length) tb.appendChild(h('<tr><td colspan="6" class="empty">No trips logged yet.</td></tr>'));
    mileage.forEach((m) => {
      const journey = m.from && m.to ? `${esc(m.from)} → ${esc(m.to)}` : esc(m.from || m.to || '—');
      const row = h(`<tr><td>${esc(m.date)}</td><td>${m.miles}</td><td>${esc(m.vehicle)}</td><td>${journey}${m.purpose ? `<br><span class="muted-inline" style="font-size:12.5px">${esc(m.purpose)}</span>` : ''}</td><td class="num">${money(m.amount)}</td>
        <td class="num" style="white-space:nowrap"><button class="btn ghost small ed">Edit</button> <button class="btn ghost small del" style="color:var(--danger)">✕</button></td></tr>`);
      row.querySelector('.ed').addEventListener('click', () => openMileageModal(m));
      row.querySelector('.del').addEventListener('click', async () => { if (confirm('Delete this trip?')) { await api(`/api/businesses/${state.businessId}/mileage/${m.id}`, { method: 'DELETE' }); renderApp(); } });
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openMileageModal());
  }

  // ===================== VAT =====================
  async function renderFiled(slot, kind) {
    let data; try { data = await api(`/api/businesses/${state.businessId}/hmrc/submissions`); } catch (e) { return; }
    const list = kind === 'vat' ? data.vat : data.itsa;
    if (!list || !list.length) return;
    const card = h(`<div class="card"><div class="card-head"><h2>Filed with HMRC</h2></div>
      <div class="card-body flush"><table><thead><tr><th>Period</th><th>Submitted</th><th>HMRC response</th><th class="num">Liability</th></tr></thead><tbody id="f"></tbody></table></div></div>`);
    const tb = card.querySelector('#f');
    list.forEach((r) => {
      const period = kind === 'vat' ? `${esc(r.from)} → ${esc(r.to)}` : `${r.taxYear}/${String((r.taxYear + 1) % 100).padStart(2, '0')} · to ${esc(r.to)}`;
      const when = (r.submittedAt || '').slice(0, 16).replace('T', ' ');
      const resp = `HMRC ${r.httpStatus}${r.reference ? ` · ${esc(r.reference)}` : ''}`;
      const liab = r.liability != null ? money(r.liability) : '<span class="subtle">run calculation</span>';
      tb.appendChild(h(`<tr><td><b>${period}</b></td><td class="subtle">${esc(when)}</td><td class="subtle" style="font-size:12.5px">${resp}</td><td class="num">${liab}</td></tr>`));
    });
    slot.innerHTML = ''; slot.appendChild(card);
  }
  function renderVatHmrc(c) {
    const savedVrn = localStorage.getItem('lumi_vrn_' + state.businessId) || (biz().vatNumber || '').replace(/\D/g, '');
    const panel = h(`<div class="card"><div class="card-head"><h2>File with HMRC · sandbox</h2><div class="spacer"></div><span class="pill ok">connected</span></div>
      <div class="card-body">
        <div class="note grey">Submitting to HMRC's sandbox with your connected test user. Enter your VAT test user's VRN, check the fraud-prevention headers pass, then pull obligations and submit. Use a VAT-enrolled test <b>organisation</b> user.</div>
        <label>VAT number (VRN) of your test user</label><input id="vrn" value="${esc(savedVrn)}" placeholder="9 digits" />
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn secondary" id="hdr">Check fraud headers</button>
          <button class="btn" id="obl">Get obligations from HMRC</button>
        </div>
        <div id="hout" style="margin-top:12px"></div>
        <div id="obls" style="margin-top:8px"></div>
      </div></div>`);
    c.appendChild(panel);
    const vFiled = h('<div></div>'); c.appendChild(vFiled); renderFiled(vFiled, 'vat');
    const vrnEl = panel.querySelector('#vrn');
    vrnEl.addEventListener('change', () => localStorage.setItem('lumi_vrn_' + state.businessId, vrnEl.value));
    panel.querySelector('#hdr').addEventListener('click', async () => {
      const out = panel.querySelector('#hout'); out.innerHTML = '<span class="muted-inline">Checking headers with HMRC…</span>';
      try { const r = await api(`/api/businesses/${state.businessId}/hmrc/validate-headers`, { method: 'POST', body: JSON.stringify({ clientData: gatherClientData() }) });
        const code = r.code || (r.data && r.data.code); const msg = JSON.stringify(r).slice(0, 500);
        out.innerHTML = `<div class="note ${/* heuristic */ msg.includes('"code"') && !/valid/i.test(msg) ? 'grey' : ''}">${esc(msg)}</div>`;
      } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
    panel.querySelector('#obl').addEventListener('click', async () => {
      const out = panel.querySelector('#obls'); out.innerHTML = '<span class="muted-inline">Fetching obligations…</span>';
      try {
        const r = await api(`/api/businesses/${state.businessId}/hmrc/vat/obligations`, { method: 'POST', body: JSON.stringify({ vrn: vrnEl.value, status: 'O', clientData: gatherClientData() }) });
        if (!r.ok) { out.innerHTML = `<div class="err">HMRC ${r.status}: ${esc(JSON.stringify(r.data).slice(0, 400))}</div>`; return; }
        const obs = (r.data && r.data.obligations) || [];
        if (!obs.length) { out.innerHTML = '<div class="note grey">No open VAT obligations for this VRN in the sandbox.</div>'; return; }
        out.innerHTML = '<div class="muted-inline" style="margin:6px 0">Open obligations from HMRC:</div>';
        obs.forEach((o) => {
          const row = h(`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--cream-2)">
            <div style="flex:1"><b>${esc(o.start)} → ${esc(o.end)}</b><br><span class="muted-inline">period key <code>${esc(o.periodKey)}</code> · due ${esc(o.due)}</span></div>
            <button class="btn small">Submit to HMRC</button></div>`);
          const vbtn = row.querySelector('button');
          vbtn.addEventListener('click', async () => {
            if (!confirm(`Submit the VAT return for ${o.start} → ${o.end} to the HMRC sandbox? This is treated as a final submission.`)) return;
            vbtn.disabled = true;
            try {
              const sr = await api(`/api/businesses/${state.businessId}/hmrc/vat/submit`, { method: 'POST', body: JSON.stringify({ vrn: vrnEl.value, periodKey: o.periodKey, from: o.start, to: o.end, clientData: gatherClientData() }) });
              if (sr.ok) { flash('Submitted to HMRC sandbox ✓'); out.insertBefore(h(`<div class="note">✓ Submitted period <code>${esc(o.periodKey)}</code> — HMRC ${sr.status}. ${esc(JSON.stringify(sr.data).slice(0, 200))}</div>`), out.firstChild); renderFiled(vFiled, 'vat'); }
              else { flash('HMRC rejected it — see details', true); vbtn.disabled = false; out.insertBefore(h(`<div class="err">HMRC ${sr.status}: ${esc(JSON.stringify(sr.data).slice(0, 400))}</div>`), out.firstChild); }
            } catch (e) { flash(e.message, true); vbtn.disabled = false; }
          });
          out.appendChild(row);
        });
      } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
  }
  async function renderVat(c) {
    const [r, hstatus] = await Promise.all([api(`/api/businesses/${state.businessId}/vat/periods`), api(`/api/businesses/${state.businessId}/hmrc/status`).catch(() => ({}))]);
    c.innerHTML = '';
    if (!r.vatRegistered) { c.appendChild(h('<div class="card"><div class="card-body empty">You\'re not VAT registered, so there\'s nothing to file here. You can switch this on in Settings if you register.</div></div>')); return; }
    c.appendChild(h(`<div class="card"><div class="card-body"><div class="note grey">Your VAT return adds up the VAT on your sales (what you owe) and the VAT on your costs (what you can reclaim). Periods are shown once they've finished.${hstatus.connected ? '' : ' Connect to HMRC in Settings to file for real against the sandbox.'}</div></div></div>`));
    if (hstatus.connected) renderVatHmrc(c);
    r.periods.forEach((p) => {
      const b = p.boxes;
      const card = h(`<div class="card"><div class="card-head"><h2>${esc(p.from)} → ${esc(p.to)}</h2><div class="spacer"></div>
        <span class="pill ${p.status === 'submitted' ? 'ok' : p.status === 'ready' ? 'warn' : 'grey'}">${p.status === 'submitted' ? 'filed' : p.status === 'ready' ? 'ready to file' : 'in progress'}</span></div>
        <div class="card-body">
          <div class="boxes" style="grid-template-columns:repeat(3,1fr)">
            <div class="box"><div class="bl">VAT on sales (Box 1)</div><div class="bv">${money(b.box1)}</div></div>
            <div class="box"><div class="bl">VAT reclaimed (Box 4)</div><div class="bv">${money(b.box4)}</div></div>
            <div class="box"><div class="bl">${b.box5 >= 0 ? 'Owed to HMRC' : 'Refund due'} (Box 5)</div><div class="bv">${money(Math.abs(b.box5))}</div></div>
          </div>
          <div class="muted-inline" style="margin-top:10px">Sales excl. VAT ${money0(b.box6)} · Purchases excl. VAT ${money0(b.box7)} · Due by ${esc(p.dueDate)}</div>
          <div id="act" style="margin-top:12px"></div>
        </div></div>`);
      const act = card.querySelector('#act');
      if (p.status === 'submitted') act.appendChild(h(`<div class="note">Filed in Lumi · reference ${esc(p.reference)}</div>`));
      else if (p.status === 'ready') { const btn = h('<button class="btn">File this return</button>'); btn.addEventListener('click', async () => { try { const res = await api(`/api/businesses/${state.businessId}/vat/submit`, { method: 'POST', body: JSON.stringify({ from: p.from, to: p.to }) }); flash('VAT return filed in Lumi'); alert(res.note); renderApp(); } catch (e) { flash(e.message, true); } }); act.appendChild(btn); }
      else act.appendChild(h('<div class="muted-inline">This period is still running — you can file it once it ends.</div>'));
      c.appendChild(card);
    });
  }

  // ===================== MTD INCOME TAX =====================
  let mtdYear = null;
  function renderMtdHmrc(c, taxYearStart) {
    const savedNino = localStorage.getItem('lumi_nino_' + state.businessId) || (biz().nino || '');
    const savedSeb = localStorage.getItem('lumi_seb_' + state.businessId) || '';
    const panel = h(`<div class="card"><div class="card-head"><h2>File with HMRC · sandbox</h2><div class="spacer"></div><span class="pill ok">connected</span></div>
      <div class="card-body">
        <div class="note grey">Submitting Income Tax updates to HMRC's sandbox with your connected test user. Use a test <b>individual</b> enrolled for MTD Income Tax. Enter their National Insurance number, fetch your business ID, then your obligations.</div>
        <div class="inline-row">
          <div><label>National Insurance number (NINO)</label><input id="nino" value="${esc(savedNino)}" placeholder="e.g. AA123456A" /></div>
          <div><label>Self-employment business ID</label><input id="seb" value="${esc(savedSeb)}" placeholder="fetch below, or paste" /></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn secondary" id="ibiz">Get my businesses</button>
          <button class="btn" id="iobl">Get obligations</button>
          <button class="btn secondary" id="icalc">Trigger tax calculation</button>
        </div>
        <div style="margin-top:14px;padding:12px;border:1px dashed var(--cream-3);border-radius:10px;background:#fbfaf7">
          <div class="muted-inline" style="margin-bottom:8px">Submit a supported-year update directly (the cumulative API needs 2025/26 or later):</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="mty" style="width:auto"><option value="2025">2025/26</option><option value="2026">2026/27</option></select>
            <select id="mq" style="width:auto"><option value="1">Up to Q1 (5 Jul)</option><option value="2">Up to Q2 (5 Oct)</option><option value="3">Up to Q3 (5 Jan)</option><option value="4">Up to Q4 (5 Apr)</option></select>
            <button class="btn small" id="msub">Submit cumulative update</button>
          </div>
        </div>
        <div id="iout" style="margin-top:12px"></div>
      </div></div>`);
    c.appendChild(panel);
    const iFiled = h('<div></div>'); c.appendChild(iFiled); renderFiled(iFiled, 'itsa');
    const ninoEl = panel.querySelector('#nino'), sebEl = panel.querySelector('#seb'), out = panel.querySelector('#iout');
    ninoEl.addEventListener('change', () => localStorage.setItem('lumi_nino_' + state.businessId, ninoEl.value));
    sebEl.addEventListener('change', () => localStorage.setItem('lumi_seb_' + state.businessId, sebEl.value));
    const post = (path, extra) => api(`/api/businesses/${state.businessId}/hmrc/itsa/${path}`, { method: 'POST', body: JSON.stringify({ nino: ninoEl.value, clientData: gatherClientData(), ...extra }) });
    panel.querySelector('#ibiz').addEventListener('click', async () => {
      out.innerHTML = '<span class="muted-inline">Fetching businesses…</span>';
      try { const r = await post('businesses');
        if (!r.ok) { out.innerHTML = `<div class="err">HMRC ${r.status}: ${esc(JSON.stringify(r.data).slice(0, 400))}</div>`; return; }
        const list = (r.data && (r.data.listOfBusinesses || r.data.businesses)) || [];
        const se = list.filter((b) => (b.typeOfBusiness || '').includes('self-employment'));
        out.innerHTML = se.length ? '<div class="muted-inline" style="margin-bottom:6px">Your self-employment businesses:</div>' : '<div class="note grey">No self-employment businesses on this NINO.</div>';
        se.forEach((b) => { const row = h(`<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--cream-2)"><div style="flex:1"><b>${esc(b.businessId)}</b> ${b.tradingName ? '· ' + esc(b.tradingName) : ''}</div><button class="btn small">Use this</button></div>`); row.querySelector('button').addEventListener('click', () => { sebEl.value = b.businessId; localStorage.setItem('lumi_seb_' + state.businessId, b.businessId); flash('Business ID set'); }); out.appendChild(row); });
      } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
    panel.querySelector('#iobl').addEventListener('click', async () => {
      out.innerHTML = '<span class="muted-inline">Fetching obligations…</span>';
      try { const r = await post('obligations', { from: `${taxYearStart}-04-06`, to: `${taxYearStart + 1}-04-05` });
        if (!r.ok) { out.innerHTML = `<div class="err">HMRC ${r.status}: ${esc(JSON.stringify(r.data).slice(0, 400))}</div>`; return; }
        const groups = (r.data && r.data.obligations) || [];
        const allRows = [];
        groups.forEach((g) => (g.obligationDetails || g.details || []).forEach((o) => allRows.push({ ...o, biz: g.businessId || g.incomeSourceId })));
        const rows = allRows.filter((o) => tyStartOf(o.periodStartDate) >= 2025);
        const hidden = allRows.length - rows.length;
        if (!rows.length) { out.innerHTML = `<div class="note grey">No 2025/26-or-later obligations returned${hidden ? ` (${hidden} earlier ${hidden === 1 ? 'period' : 'periods'} hidden — HMRC's cumulative API doesn't accept those)` : ''}. Use the "Submit a supported-year update directly" box above.</div>`; return; }
        out.innerHTML = `<div class="muted-inline" style="margin:6px 0">Quarterly obligations${hidden ? ` (${hidden} pre-2025/26 hidden)` : ''}:</div>`;
        rows.forEach((o) => {
          const st = o.status === 'Open' || o.status === 'O' ? '<span class="pill warn">open</span>' : o.status ? `<span class="pill ok">${esc(o.status)}</span>` : '';
          const row = h(`<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--cream-2)">
            <div style="flex:1"><b>${esc(o.periodStartDate)} → ${esc(o.periodEndDate)}</b> ${st}<br><span class="muted-inline">due ${esc(o.dueDate || o.due || '')}</span></div>
            <button class="btn small">Submit cumulative update</button></div>`);
          const subBtn = row.querySelector('button');
          if (subBtn) subBtn.addEventListener('click', async () => {
            if (!sebEl.value) { flash('Set your business ID first (Get my businesses)', true); return; }
            if (!confirm(`Send the cumulative Income Tax update up to ${o.periodEndDate} to HMRC sandbox?`)) return;
            subBtn.disabled = true;
            try { const sr = await post('submit', { seBusinessId: sebEl.value, periodStartDate: o.periodStartDate, periodEndDate: o.periodEndDate });
              if (sr.ok) { flash('Income Tax update sent ✓'); out.insertBefore(h(`<div class="note">✓ Sent update to ${esc(o.periodEndDate)} (${esc(sr.taxYear || '')}) — HMRC ${sr.status}. Turnover ${money(sr.body.periodIncome.turnover)}.</div>`), out.firstChild); renderFiled(iFiled, 'itsa'); }
              else { flash('HMRC rejected it', true); subBtn.disabled = false; out.insertBefore(h(`<div class="err">HMRC ${sr.status}: ${esc(JSON.stringify(sr.data))}</div>`), out.firstChild); }
            } catch (e) { flash(e.message, true); subBtn.disabled = false; }
          });
          out.appendChild(row);
        });
      } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
    panel.querySelector('#msub').addEventListener('click', async (ev) => {
      if (!sebEl.value) { flash('Set your business ID first (Get my businesses)', true); return; }
      const Y = Number(panel.querySelector('#mty').value), q = panel.querySelector('#mq').value;
      const ends = { 1: `${Y}-07-05`, 2: `${Y}-10-05`, 3: `${Y + 1}-01-05`, 4: `${Y + 1}-04-05` };
      const periodStartDate = `${Y}-04-06`, periodEndDate = ends[q];
      if (!confirm(`Send a ${Y}/${String((Y + 1) % 100)} cumulative Income Tax update up to ${periodEndDate} to HMRC sandbox?`)) return;
      const btn = ev.currentTarget; btn.disabled = true;
      try { const sr = await post('submit', { seBusinessId: sebEl.value, periodStartDate, periodEndDate });
        if (sr.ok) { flash('Income Tax update sent ✓'); out.insertBefore(h(`<div class="note">✓ Sent ${Y}/${String((Y + 1) % 100)} update to ${periodEndDate} — HMRC ${sr.status}. Turnover ${money(sr.body.periodIncome.turnover)}.</div>`), out.firstChild); renderFiled(iFiled, 'itsa'); }
        else { flash('HMRC rejected it', true); out.insertBefore(h(`<div class="err">HMRC ${sr.status}: ${esc(JSON.stringify(sr.data))}</div>`), out.firstChild); }
      } catch (e) { flash(e.message, true); } finally { btn.disabled = false; }
    });
    panel.querySelector('#icalc').addEventListener('click', async () => {
      out.innerHTML = '<span class="muted-inline">Asking HMRC to calculate…</span>';
      try { const r = await post('calc', { taxYearStart: panel.querySelector('#mty').value });
        const att = r.trigger && r.trigger.attempts ? ' · tried ' + r.trigger.attempts.map((a) => `v${a.v}=${a.status}`).join(', ') : '';
        out.innerHTML = `<div class="note">${r.calculationId ? 'Calculation ' + esc(r.calculationId) : 'No calculation created'} · trigger HTTP ${r.trigger ? r.trigger.status : '?'}${r.result ? ' · retrieve HTTP ' + r.result.status : ''}${r.liability != null ? ` · <b>liability ${money(r.liability)}</b>` : ''}${att}</div>`;
        renderFiled(iFiled, 'itsa');
      } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
  }
  async function renderMtd(c) {
    const [r, hstatus] = await Promise.all([api(`/api/businesses/${state.businessId}/mtd${mtdYear ? '?year=' + mtdYear : ''}`), api(`/api/businesses/${state.businessId}/hmrc/status`).catch(() => ({}))]);
    if (mtdYear == null) mtdYear = r.taxYearStart;
    c.innerHTML = '';
    const years = [r.taxYearStart, r.taxYearStart - 1, r.taxYearStart - 2];
    const picker = h(`<div class="card"><div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="muted-inline" style="flex:1">Making Tax Digital for Income Tax means sending HMRC a short summary every 3 months, then a final figure after the year ends. Lumi keeps the totals ready. Real submission needs an HMRC-recognised connection, set up when the app is hosted.</span>
      <label style="margin:0">Tax year</label><select id="ty" style="width:auto">${years.map((y) => `<option value="${y}" ${y === mtdYear ? 'selected' : ''}>${y}/${String((y + 1) % 100).padStart(2, '0')}</option>`).join('')}</select></div></div>`);
    c.appendChild(picker);
    picker.querySelector('#ty').addEventListener('change', (e) => { mtdYear = Number(e.target.value); renderApp(); });
    if (hstatus.connected) renderMtdHmrc(c, r.taxYearStart);

    const est = r.estimate;
    c.appendChild(h(`<div class="card"><div class="card-head"><h2>Estimated tax for ${esc(r.taxYear)}</h2><div class="spacer"></div><span class="pill warn">estimate</span></div>
      <div class="card-body"><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
        <div><div class="muted-inline">Profit so far</div><div class="big-num">${money(est.profit)}</div></div>
        <div class="boxes" style="flex:1;min-width:260px">
          <div class="box"><div class="bl">Income Tax</div><div class="bv">${money(est.incomeTax)}</div></div>
          <div class="box"><div class="bl">National Insurance</div><div class="bv">${money(est.class4)}</div></div>
          <div class="box"><div class="bl">Total to set aside</div><div class="bv" style="color:var(--brand-dark)">${money(est.totalDue)}</div></div>
          <div class="box"><div class="bl">Tax-free allowance used</div><div class="bv">${money0(est.personalAllowance)}</div></div>
        </div>
      </div>
      <div class="muted-inline" style="margin-top:10px">Final declaration due by <b>${esc(r.finalDeclarationDeadline)}</b>.</div></div></div>`));

    r.quarters.forEach((q) => {
      const card = h(`<div class="card"><div class="card-head"><h2>Quarter ${q.quarter}</h2><div class="spacer"></div>
        <span class="muted-inline">${esc(q.from)} → ${esc(q.to)}</span>
        <span class="pill ${q.status === 'submitted' ? 'ok' : q.status === 'ready' ? 'warn' : 'grey'}">${q.status === 'submitted' ? 'sent' : q.status === 'ready' ? 'ready' : 'in progress'}</span></div>
        <div class="card-body">
          <div class="boxes" style="grid-template-columns:repeat(3,1fr)">
            <div class="box"><div class="bl">Income</div><div class="bv">${money(q.incomeTotal)}</div></div>
            <div class="box"><div class="bl">Costs</div><div class="bv">${money(q.expenseTotal)}</div></div>
            <div class="box"><div class="bl">Profit</div><div class="bv">${money(q.profit)}</div></div>
          </div>
          <div class="muted-inline" style="margin-top:10px">Send to HMRC by <b>${esc(q.deadline)}</b></div>
          <div id="act" style="margin-top:12px"></div>
        </div></div>`);
      const act = card.querySelector('#act');
      if (q.status === 'submitted') act.appendChild(h(`<div class="note">Sent in Lumi · reference ${esc(q.reference)}</div>`));
      else if (q.status === 'ready') { const btn = h('<button class="btn">Send this update</button>'); btn.addEventListener('click', async () => { try { const res = await api(`/api/businesses/${state.businessId}/mtd/submit`, { method: 'POST', body: JSON.stringify({ year: r.taxYearStart, quarter: q.quarter, from: q.from, to: q.to }) }); flash('Quarterly update sent in Lumi'); alert(res.note); renderApp(); } catch (e) { flash(e.message, true); } }); act.appendChild(btn); }
      else act.appendChild(h('<div class="muted-inline">This quarter is still running — you can send it once it ends.</div>'));
      c.appendChild(card);
    });
  }

  // ===================== IMPORT FROM OTHER SOFTWARE =====================
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch; }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  const PROVIDERS = {
    xero: { name: 'Xero', tip: 'In Xero: Accounting → Reports → Account Transactions (or Bank Statements) → Export → CSV.' },
    quickbooks: { name: 'QuickBooks', tip: 'In QuickBooks: Reports → Transaction List by Date → Export → CSV.' },
    sage: { name: 'Sage', tip: 'In Sage: Banking (or Transactions) → select the account → Export → CSV.' },
    other: { name: 'Other CSV', tip: 'Any CSV with a date, an amount and a description will work.' },
  };
  function renderImport(c) {
    const b = biz();
    c.innerHTML = '';
    let provider = 'other', headers = [], dataRows = [];
    const card = h(`<div class="card"><div class="card-head"><h2>Bring your data across</h2></div>
      <div class="card-body">
        <p class="muted-inline" style="margin-top:0">Switching from Xero, QuickBooks or Sage? Export your transactions as a CSV and import them here as money in &amp; out — so you keep your history and your VAT/Income Tax figures stay complete.</p>
        <div class="choice-grid" style="grid-template-columns:repeat(4,1fr)" id="prov">
          ${['xero', 'quickbooks', 'sage', 'other'].map((p) => `<div class="choice ${p === 'other' ? 'selected' : ''}" data-p="${p}"><h3>${PROVIDERS[p].name}</h3></div>`).join('')}
        </div>
        <div class="note grey" id="tip" style="margin-top:12px">${PROVIDERS.other.tip}</div>
        <label style="margin-top:14px">Upload your CSV file</label><input type="file" id="file" accept=".csv,text/csv" />
        <div id="mapwrap"></div>
        <div class="err" id="err"></div>
      </div></div>`);
    c.appendChild(card);
    card.querySelectorAll('#prov .choice').forEach((ch) => ch.addEventListener('click', () => { provider = ch.getAttribute('data-p'); card.querySelectorAll('#prov .choice').forEach((x) => x.classList.toggle('selected', x === ch)); card.querySelector('#tip').textContent = PROVIDERS[provider].tip; }));
    card.querySelector('#file').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { const rows = parseCSV(rd.result); if (rows.length < 2) { card.querySelector('#err').textContent = 'That file looks empty.'; return; } card.querySelector('#err').textContent = ''; headers = rows[0].map((x) => x.trim()); dataRows = rows.slice(1); buildMapping(); } catch (err) { card.querySelector('#err').textContent = 'Could not read that file.'; } };
      rd.readAsText(f);
    });
    const guess = (rx) => headers.findIndex((h2) => rx.test(h2));
    function buildMapping() {
      const wrap = card.querySelector('#mapwrap');
      const opts = (sel) => headers.map((h2, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h2 || ('Column ' + (i + 1)))}</option>`).join('');
      const dateI = guess(/date/i), descI = guess(/descr|payee|memo|narrative|details|name|reference|particular/i), amtI = guess(/amount|total|value|gross/i);
      const inI = guess(/received|money in|paid in|credit|deposit|sales|income/i), outI = guess(/spent|money out|paid out|debit|withdraw|payment/i);
      const hasInOut = inI > -1 && outI > -1;
      wrap.innerHTML = `<div class="note" style="margin-top:14px">Found <b>${dataRows.length}</b> rows. Check the columns, then preview.</div>
        <div class="inline-row"><div><label>Date column</label><select id="mDate">${opts(dateI > -1 ? dateI : 0)}</select></div><div><label>Description column</label><select id="mDesc">${opts(descI > -1 ? descI : 0)}</select></div></div>
        <label style="margin-top:12px">How are amounts shown?</label>
        <select id="mMode"><option value="signed" ${!hasInOut ? 'selected' : ''}>One amount column (− means money out)</option><option value="inout" ${hasInOut ? 'selected' : ''}>Separate money-in and money-out columns</option></select>
        <div id="amtSigned" class="inline-row" style="margin-top:8px"><div><label>Amount column</label><select id="mAmt">${opts(amtI > -1 ? amtI : 0)}</select></div><div><label>Positive amounts are…</label><select id="mSign"><option value="in">Money in</option><option value="out">Money out</option></select></div></div>
        <div id="amtInOut" class="inline-row" style="margin-top:8px;display:none"><div><label>Money-in column</label><select id="mIn">${opts(inI > -1 ? inI : 0)}</select></div><div><label>Money-out column</label><select id="mOut">${opts(outI > -1 ? outI : 0)}</select></div></div>
        <div class="inline-row" style="margin-top:8px"><div><label>Date format</label><select id="mFmt"><option value="dmy">Day/Month/Year (UK)</option><option value="mdy">Month/Day/Year (US)</option><option value="ymd">Year-Month-Day</option></select></div>${b.vatRegistered ? '<div><label>VAT on these amounts</label><select id="mVat"><option value="0">No VAT</option><option value="20">Standard 20%</option><option value="5">Reduced 5%</option></select></div>' : '<div></div>'}</div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn secondary" id="prev">Preview</button><button class="btn" id="imp">Import</button></div>
        <div id="preview" style="margin-top:12px"></div>`;
      const modeSel = wrap.querySelector('#mMode');
      const sync = () => { const m = modeSel.value; wrap.querySelector('#amtSigned').style.display = m === 'signed' ? 'flex' : 'none'; wrap.querySelector('#amtInOut').style.display = m === 'inout' ? 'flex' : 'none'; };
      modeSel.addEventListener('change', sync); sync();
      wrap.querySelector('#prev').addEventListener('click', () => showPreview(false));
      wrap.querySelector('#imp').addEventListener('click', () => showPreview(true));
    }
    function parseDate(s, fmt) {
      s = String(s || '').trim(); if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const m = s.match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/); if (!m) return null;
      let Y, M, D; if (fmt === 'ymd') { Y = m[1]; M = m[2]; D = m[3]; } else if (fmt === 'mdy') { M = m[1]; D = m[2]; Y = m[3]; } else { D = m[1]; M = m[2]; Y = m[3]; }
      if (String(Y).length < 4) Y = (Number(Y) > 50 ? '19' : '20') + String(Y).padStart(2, '0');
      return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
    }
    const num = (s) => { const n = Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
    function buildEntries() {
      const dI = +card.querySelector('#mDate').value, deI = +card.querySelector('#mDesc').value, fmt = card.querySelector('#mFmt').value;
      const mode = card.querySelector('#mMode').value, vatRate = card.querySelector('#mVat') ? +card.querySelector('#mVat').value : 0;
      const out = [];
      dataRows.forEach((r) => {
        const date = parseDate(r[dI], fmt); if (!date) return;
        const description = (r[deI] || '').trim();
        let direction, gross;
        if (mode === 'signed') { const v = num(r[+card.querySelector('#mAmt').value]); if (v === 0) return; const posIs = card.querySelector('#mSign').value; direction = v >= 0 ? posIs : (posIs === 'in' ? 'out' : 'in'); gross = Math.abs(v); }
        else { const inV = num(r[+card.querySelector('#mIn').value]), outV = num(r[+card.querySelector('#mOut').value]); if (inV > 0) { direction = 'in'; gross = inV; } else if (outV > 0) { direction = 'out'; gross = outV; } else return; }
        out.push({ date, direction, gross: Math.round(gross * 100) / 100, description, vatRate, category: direction === 'in' ? 'sales' : 'other_expense' });
      });
      return out;
    }
    async function showPreview(doImport) {
      const entries = buildEntries(), pv = card.querySelector('#preview');
      if (!entries.length) { pv.innerHTML = '<div class="err">Couldn\'t read any rows with that mapping — check the columns above.</div>'; return; }
      if (!doImport) {
        const sample = entries.slice(0, 8);
        pv.innerHTML = `<div class="muted-inline" style="margin-bottom:6px">${entries.length} rows ready. Preview of the first ${sample.length}:</div>
          <table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th class="num">Amount</th></tr></thead><tbody>${sample.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.description)}</td><td><span class="pill ${e.direction}">${e.direction}</span></td><td class="num">${money(e.gross)}</td></tr>`).join('')}</tbody></table>`;
        return;
      }
      if (!confirm(`Import ${entries.length} entries into ${biz().name}?`)) return;
      try { const r = await api(`/api/businesses/${state.businessId}/import/entries`, { method: 'POST', body: JSON.stringify({ entries }) });
        flash(`Imported ${r.added} entries`);
        pv.innerHTML = `<div class="note">✓ Imported <b>${r.added}</b> entries${r.skipped ? `, skipped ${r.skipped} (couldn't read date/amount)` : ''}. They're now in Money in &amp; out and feed your VAT and Income Tax figures.</div>`;
      } catch (e) { pv.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    }
  }

  // ===================== ACTIVITY LOG =====================
  async function renderActivity(c) {
    const { log } = await api(`/api/businesses/${state.businessId}/audit`);
    c.innerHTML = '';
    c.appendChild(h('<div class="card"><div class="card-body"><div class="note grey">A record of everything that\'s happened in your books — entries added or changed, imports, and what\'s been filed to HMRC. Useful for you and your accountant, and an audit trail HMRC expects.</div></div></div>'));
    const card = h(`<div class="card"><div class="card-head"><h2>Activity</h2></div>
      <div class="card-body flush"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!log.length) tb.appendChild(h('<tr><td colspan="3" class="empty">Nothing recorded yet.</td></tr>'));
    const ACTION_LABEL = { 'entry.create': 'Added entry', 'entry.edit': 'Edited entry', 'entry.delete': 'Deleted entry', 'vat.submit': 'Filed VAT return', 'itsa.submit': 'Filed Income Tax update', 'import': 'Imported data', 'invoice.status': 'Invoice status', 'settings.update': 'Settings', 'hmrc.connect': 'Connected HMRC', 'hmrc.disconnect': 'Disconnected HMRC' };
    log.forEach((a) => {
      const when = (a.at || '').slice(0, 16).replace('T', ' ');
      const isFile = a.action && a.action.indexOf('submit') > -1;
      tb.appendChild(h(`<tr><td class="subtle" style="white-space:nowrap">${esc(when)}</td><td>${esc(a.userName || '')}</td><td>${isFile ? '<b>' : ''}${esc(ACTION_LABEL[a.action] || a.action)}${isFile ? '</b>' : ''}${a.detail ? ` <span class="muted-inline">— ${esc(a.detail)}</span>` : ''}</td></tr>`));
    });
    c.appendChild(card);
  }

  // ===================== SETTINGS =====================
  async function renderSettings(c) {
    const b = biz();
    c.innerHTML = '';
    const body = h(`<div class="card"><div class="card-head"><h2>Your business</h2></div>
      <div class="card-body">
        <div class="inline-row"><div><label>Business name</label><input id="name" value="${esc(b.name)}" /></div><div><label>What you do</label><input id="trade" value="${esc(b.tradeType || '')}" /></div></div>
        <label>How you record things</label><select id="basis"><option value="cash" ${b.basis === 'cash' ? 'selected' : ''}>Cash basis (when money moves)</option><option value="accruals" ${b.basis === 'accruals' ? 'selected' : ''}>Traditional (when invoiced/billed)</option></select>
        <label style="display:flex;align-items:center;gap:10px;margin-top:16px"><input type="checkbox" id="vatreg" ${b.vatRegistered ? 'checked' : ''} /> I'm VAT registered</label>
        <div id="vatx" style="${b.vatRegistered ? '' : 'display:none'}">
          <div class="inline-row"><div><label>VAT number</label><input id="vatno" value="${esc(b.vatNumber || '')}" placeholder="GB 123 4567 89" /></div>
          <div><label>VAT scheme</label><select id="scheme"><option value="standard" ${b.vatScheme === 'standard' ? 'selected' : ''}>Standard</option><option value="cash" ${b.vatScheme === 'cash' ? 'selected' : ''}>Cash accounting</option><option value="flat" ${b.vatScheme === 'flat' ? 'selected' : ''}>Flat rate</option></select></div></div>
        </div>
        <div class="inline-row">
          <div><label>National Insurance number (for Income Tax)</label><input id="nino" value="${esc(b.nino || '')}" placeholder="e.g. AA123456A" /></div>
          <div><label>UTR (tax reference, optional)</label><input id="utr" value="${esc(b.utr || '')}" placeholder="10-digit number from HMRC" /></div>
        </div>
        <div class="muted-inline" style="margin-top:6px">Your VAT number and NI number are saved here once, then used automatically for both VAT returns and Income Tax updates — no need to re-enter them.</div>
        <div class="err" id="err"></div>
        <div style="margin-top:16px"><button class="btn" id="save">Save changes</button></div>
      </div></div>`);
    c.appendChild(body);
    body.querySelector('#vatreg').addEventListener('change', (e) => { body.querySelector('#vatx').style.display = e.target.checked ? '' : 'none'; });
    body.querySelector('#save').addEventListener('click', async () => {
      try {
        await api(`/api/businesses/${state.businessId}`, { method: 'PUT', body: JSON.stringify({ name: body.querySelector('#name').value, tradeType: body.querySelector('#trade').value, basis: body.querySelector('#basis').value, vatRegistered: body.querySelector('#vatreg').checked, vatNumber: body.querySelector('#vatno') ? body.querySelector('#vatno').value : '', vatScheme: body.querySelector('#scheme') ? body.querySelector('#scheme').value : 'standard', utr: body.querySelector('#utr').value, nino: body.querySelector('#nino').value }) });
        await loadBusiness(); flash('Saved'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
    await renderHmrcCard(c);
  }
  async function renderHmrcCard(c) {
    const [cfg, status] = await Promise.all([api('/api/hmrc/config'), api(`/api/businesses/${state.businessId}/hmrc/status`)]);
    const defaultRedirect = location.origin + '/api/hmrc/callback';
    const pill = !cfg.configured ? '<span class="pill">not set up</span>' : status.connected ? '<span class="pill ok">connected</span>' : '<span class="pill warn">not connected</span>';
    const scopesValue = cfg.scopes && cfg.scopes !== 'hello' ? cfg.scopes : 'read:vat write:vat read:self-assessment write:self-assessment';
    const card = h(`<div class="card"><div class="card-head"><h2>HMRC connection · Making Tax Digital</h2><div class="spacer"></div>${pill}</div>
      <div class="card-body">
        <div class="note grey">You sign in on <b>HMRC's own page</b> — Lumi never sees or stores your HMRC password. One connection covers <b>both VAT and Income Tax</b> and stays active in the background, so you don't keep logging in.</div>
        ${cfg.configured ? '' : '<div class="note" style="margin-top:10px">First-time setup needs your developer Client ID &amp; Secret below (one-off).</div>'}
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap" id="hactions"></div>
        <div id="hresult" style="margin-top:12px"></div>
        <details style="margin-top:18px" ${cfg.configured ? '' : 'open'}>
          <summary style="cursor:pointer;font-weight:600;color:var(--mid)">Developer setup (advanced — one-off)</summary>
          <div style="margin-top:12px">
            <div class="note grey">Environment: <b>${cfg.env === 'production' ? 'production' : 'sandbox'}</b>. The Client Secret is stored locally on this machine. The redirect URL below must be added to your application on the HMRC Developer Hub <b>exactly</b> as shown.</div>
            <label>Client ID</label><input id="cid" value="${esc(cfg.clientId || '')}" placeholder="from the Developer Hub" />
            <label>Client Secret</label><input id="csec" type="password" placeholder="${cfg.secretSet ? '•••••• saved — leave blank to keep' : 'from the Developer Hub'}" />
            <div class="inline-row">
              <div><label>Environment</label><select id="cenv"><option value="sandbox" ${cfg.env !== 'production' ? 'selected' : ''}>Sandbox</option><option value="production" ${cfg.env === 'production' ? 'selected' : ''}>Production</option></select></div>
              <div><label>Scopes</label><input id="cscope" value="${esc(scopesValue)}" /></div>
            </div>
            <label>Redirect URL (add this exact value on the Developer Hub)</label><input id="credir" value="${esc(cfg.redirectUri || defaultRedirect)}" />
            <div class="muted-inline" style="margin-top:6px">Quick set: <a id="scopeVat" style="cursor:pointer;font-weight:600">VAT only</a> · <a id="scopeBoth" style="cursor:pointer;font-weight:600">VAT + Income Tax</a></div>
            <div class="err" id="herr"></div>
            <div style="margin-top:12px"><button class="btn" id="hsave">Save credentials</button></div>
          </div>
        </details>
      </div></div>`);
    c.appendChild(card);
    const actions = card.querySelector('#hactions');
    if (cfg.configured && !status.connected) { const b = h('<button class="btn gold">Connect to HMRC</button>'); b.addEventListener('click', () => { window.location = `/api/hmrc/connect/${state.businessId}`; }); actions.appendChild(b); }
    if (cfg.configured && status.connected) {
      const t = h('<button class="btn secondary">Test connection</button>');
      t.addEventListener('click', async () => {
        const out = card.querySelector('#hresult'); out.innerHTML = '<span class="muted-inline">Testing…</span>';
        try { const r = await api(`/api/businesses/${state.businessId}/hmrc/test`, { method: 'POST' });
          const w = r.world, u = r.user;
          out.innerHTML = `<div class="note ${w.ok && (!u || u.ok) ? '' : 'grey'}">Hello World: <b>${w.status}</b> ${w.ok ? '✓' : ''}${u ? ` · Hello User (your token): <b>${u.status}</b> ${u.ok ? '✓' : ''}` : ''}<br><span class="muted-inline">${esc(JSON.stringify((u && u.data) || w.data).slice(0, 160))}</span></div>`;
        } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      });
      const d = h('<button class="btn ghost" style="color:var(--danger)">Disconnect</button>');
      d.addEventListener('click', async () => { await api(`/api/businesses/${state.businessId}/hmrc/disconnect`, { method: 'POST' }); flash('Disconnected from HMRC'); renderApp(); });
      actions.append(t, d);
    }
    card.querySelector('#scopeVat').addEventListener('click', () => { card.querySelector('#cscope').value = 'read:vat write:vat'; });
    card.querySelector('#scopeBoth').addEventListener('click', () => { card.querySelector('#cscope').value = 'read:vat write:vat read:self-assessment write:self-assessment'; });
    card.querySelector('#hsave').addEventListener('click', async () => {
      const herr = card.querySelector('#herr'); herr.textContent = '';
      try {
        await api('/api/hmrc/config', { method: 'POST', body: JSON.stringify({ clientId: card.querySelector('#cid').value, clientSecret: card.querySelector('#csec').value, env: card.querySelector('#cenv').value, redirectUri: card.querySelector('#credir').value, scopes: card.querySelector('#cscope').value }) });
        flash('HMRC credentials saved'); renderApp();
      } catch (e) { herr.textContent = e.message; }
    });
  }

  init();
})();
