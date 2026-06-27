// Lumi Bookkeeping — single-page frontend (vanilla JS, no build step).
const App = (() => {
  const state = { user: null, orgs: [], orgId: null, view: 'dashboard' };
  const el = document.getElementById('app');

  // ---------- helpers ----------
  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opts,
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };
  const money = (n) =>
    (n < 0 ? '-£' : '£') +
    Math.abs(Number(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, days) => { const d = new Date(iso); d.setDate(d.getDate() + (Number(days) || 0)); return d.toISOString().slice(0, 10); };
  const initials = (name) => (String(name || '?').replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?');

  // Cohesive line-icon set (Feather-style) used across the UI.
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    monthend: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    ai: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    sales: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    bills: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    recurring: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    contacts: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    queries: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    transactions: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    import: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    reconcile: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    rules: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    cashflow: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    budget: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    'profit-loss': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    'balance-sheet': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    'trial-balance': '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    ledger: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    vat: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    accounts: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    yearend: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    audit: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    payroll: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    quotes: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    items: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    po: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
    expenses: '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
  };
  ICONS.search = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
  ICONS.invoices = ICONS.sales;
  ICONS.aged = ICONS.audit;
  ICONS.tracking = ICONS.budget;
  ICONS.clock = ICONS.audit;
  const icon = (name, size = 18) => `<svg class="ic-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const iconInline = (name, size = 13) => `<span class="ic-inline">${icon(name, size)}</span>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  // Inline sparkline SVG from a series of values.
  let sparkSeq = 0;
  function sparkline(vals, opts = {}) {
    if (!vals || vals.length < 2) return '';
    const w = opts.w || 160, hh = opts.h || 38, pad = 3;
    const min = Math.min(...vals, 0), max = Math.max(...vals, 0), span = (max - min) || 1;
    const x = (i) => pad + i * (w - pad * 2) / (vals.length - 1);
    const y = (v) => hh - pad - ((v - min) / span) * (hh - pad * 2);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = `M${pts.join(' L')}`;
    const area = `M${x(0).toFixed(1)},${hh} L${pts.join(' L')} L${x(vals.length - 1).toFixed(1)},${hh} Z`;
    const col = opts.color || 'var(--gold)';
    const gid = `spk${++sparkSeq}`;
    const last = vals[vals.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" width="100%" height="${hh}" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".2"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(vals.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2.8" fill="${col}"/></svg>`;
  }
  // A band of headline figures for the top of a report. items: [{label, value(html), sub, tone}]
  function reportSummary(items) {
    const row = h('<div class="report-summary"></div>');
    items.forEach((it) => row.appendChild(h(`<div class="rs-item"><div class="rs-label">${esc(it.label)}</div><div class="rs-value ${it.tone || ''}">${it.value}</div>${it.sub ? `<div class="rs-sub">${it.sub}</div>` : ''}</div>`)));
    return row;
  }
  // A proportional stacked bar with legend. segments: [{label, value, color}]
  function compositionBar(segments) {
    const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
    const bar = segments.filter((s) => s.value > 0).map((s) => `<span style="width:${(s.value / total * 100).toFixed(1)}%;background:${s.color}" title="${esc(s.label)}: ${money(s.value)}"></span>`).join('');
    const legend = segments.map((s) => `<span class="cb-leg"><i style="background:${s.color}"></i>${esc(s.label)} · <b>${money(s.value)}</b></span>`).join('');
    return h(`<div class="comp-wrap"><div class="comp-bar">${bar}</div><div class="comp-legend">${legend}</div></div>`);
  }
  // Percentage-change pill comparing the latest value to the previous.
  function deltaPill(series) {
    if (!series || series.length < 2) return '';
    const prev = series[series.length - 2], cur = series[series.length - 1];
    if (prev === 0 && cur === 0) return '';
    const pct = prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100;
    const up = pct >= 0;
    const cls = up ? 'up' : 'down';
    const arrow = up ? '▲' : '▼';
    return `<span class="delta ${cls}">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
  }
  let flashTimer;
  const flash = (msg, bad) => {
    document.querySelectorAll('.flash').forEach((f) => f.remove());
    const f = h(`<div class="flash ${bad ? 'bad' : ''}">${esc(msg)}</div>`);
    document.body.appendChild(f);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => f.remove(), 3200);
  };

  // Minimal CSV parser (handles quoted fields and commas/newlines within quotes).
  function parseCSV(text) {
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function downloadCSV(filename, matrix) {
    const csv = matrix.map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  // Append CSV + Print(PDF) buttons to a report card header.
  function addReportExports(card, name, matrix) {
    const ph = h(`<div class="print-only print-header">${currentOrg().hasLogo ? `<img class="ph-logo" src="/api/orgs/${state.orgId}/logo" alt="" />` : ''}<div class="ph-co">${esc(currentOrg().name || '')}</div><div class="ph-meta">${esc(name)} · generated ${today()}</div></div>`);
    card.insertBefore(ph, card.firstChild);
    const head = card.querySelector('.card-head');
    const wrap = h('<span class="no-print" style="display:inline-flex;gap:8px;margin-left:8px"></span>');
    const csv = h('<button class="btn secondary small">Export CSV</button>');
    csv.addEventListener('click', () => downloadCSV(name.replace(/\s+/g, '_') + '.csv', matrix));
    const pdf = h('<button class="btn secondary small">Print / PDF</button>');
    pdf.addEventListener('click', () => window.print());
    wrap.append(csv, pdf); head.appendChild(wrap);
  }

  // ---------- boot ----------
  async function init() {
    try {
      const me = await api('/api/me');
      state.user = me.user;
      state.orgs = me.orgs;
      state.orgId = me.orgs[0]?.id || null;
      renderApp();
    } catch {
      renderLogin();
    }
  }

  // ---------- login ----------
  function renderLogin(error) {
    el.innerHTML = '';
    const card = h(`
      <div class="login-wrap"><div class="login-card">
        <img class="login-logo" src="/lumi-logo.png" alt="Lumi Accountancy" />
        <div class="login-eyebrow">Bookkeeping</div>
        <div class="login-sub">Sign in to your books</div>
        <form id="loginForm">
          <label>Email</label>
          <input name="email" type="email" placeholder="you@business.com" required />
          <label>Password</label>
          <input name="password" type="password" placeholder="••••••••" required />
          <div class="err">${error ? esc(error) : ''}</div>
          <button class="btn full" type="submit">Sign in</button>
        </form>
        <div class="demo-hint">
          <b>Demo logins</b><br/>
          Bookkeeper: <code>bookkeeper@lumi.app</code> / <code>demo1234</code><br/>
          Client: <code>client@lumi.app</code> / <code>demo1234</code>
        </div>
      </div></div>`);
    el.appendChild(card);
    card.querySelector('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
        await init();
      } catch (err) {
        renderLogin(err.message);
      }
    });
  }

  // ---------- app shell ----------
  // Navigation grouped into labelled sections for a clearer, more professional menu.
  function navGroups() {
    const groups = [
      ['Overview', [['dashboard', '▦', 'Dashboard'], ['monthend', '☑', 'Month-end'], ['ai', '✦', 'Little Lumi Assist']]],
      ['Sales & purchases', [['invoices', '£', 'Sales'], ['quotes', '◳', 'Quotes'], ['bills', '▽', 'Bills'], ['po', '▢', 'Purchase orders'], ['recurring', '↻', 'Recurring'], ['items', '▣', 'Products'], ['contacts', '◎', 'Contacts'], ['queries', '✉', 'Queries']]],
      ['Banking', [['transactions', '⇄', 'Transactions'], ['import', '⬆', 'Import statement'], ['reconcile', '✓', 'Reconcile'], ['rules', '⚏', 'Rules'], ['inbox', '❏', 'Documents']]],
      ['Reports', [['cashflow', '〰', 'Cashflow'], ['budget', '◫', 'Budgets'], ['aged', '◷', 'Aged debt'], ['tracking', '◔', 'Tracking'], ['profit-loss', '↗', 'Profit & Loss'], ['balance-sheet', '⚖', 'Balance Sheet'], ['trial-balance', '∑', 'Trial Balance'], ['ledger', '▤', 'General Ledger'], ['vat', '％', 'VAT Return']]],
      ['People', [['payroll', '⚑', 'Payroll'], ['expenses', '▤', 'Expense claims']]],
      ['Setup', [['accounts', '☰', 'Chart of Accounts'], ['yearend', '⚑', 'Year-end & setup'], ['audit', '◷', 'Activity log']]],
    ];
    if (state.user && state.user.role === 'client') {
      const allowed = new Set(['dashboard', 'invoices', 'quotes', 'bills', 'items', 'expenses', 'inbox', 'queries', 'cashflow', 'budget', 'aged', 'profit-loss', 'balance-sheet']);
      return groups.map(([label, items]) => [label, items.filter(([key]) => allowed.has(key))]).filter(([, items]) => items.length);
    }
    return groups;
  }

  function renderApp() {
    if (!state.orgId) return renderNoOrg();
    el.innerHTML = '';
    const orgName = state.orgs.find((o) => o.id === state.orgId)?.name || '';
    const isBk = state.user.role === 'bookkeeper';
    const shell = h(`
      <div class="shell">
        <aside class="sidebar">
          <div class="sidebar-brand"><img class="side-logo" src="/lumi-logo-white.png" alt="Lumi Accountancy" /><span class="side-product">Bookkeeping</span></div>
          <nav id="nav"></nav>
          <div class="sidebar-foot">
            ${isBk ? `<div class="nav-item" id="addClient"><span class="ic">${icon('user-plus')}</span> Add client</div>` : ''}
            <div class="nav-item" id="glossary"><span class="ic">${icon('help')}</span> Help &amp; glossary</div>
            <div class="nav-item" id="account"><span class="ic">${icon('settings')}</span> Account settings</div>
            <div class="nav-item" id="logout"><span class="ic">${icon('logout')}</span> Sign out</div>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
            <h1 id="viewTitle"></h1>
            <div class="global-search"><input id="globalSearch" placeholder="Search contacts, invoices, transactions…" autocomplete="off" /><kbd class="cmdk-hint" title="Command palette">⌘K</kbd><div class="gs-results" id="gsResults"></div></div>
            <div class="org-switch">
              <button class="btn small" id="quickNew">${icon('plus', 14)} New</button>
              ${currentOrg().hasLogo ? `<img class="org-logo" src="/api/orgs/${state.orgId}/logo" alt="" />` : ''}
              <span class="subtle">Client</span>
              <select id="orgSelect">${state.orgs.map((o) => `<option value="${o.id}" ${o.id === state.orgId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
              <div class="avatar" title="${esc(state.user.name)} · ${esc(state.user.role === 'bookkeeper' ? 'Practice' : 'Client')}">${esc(initials(state.user.name))}</div>
            </div>
          </header>
          <div class="content" id="content"></div>
        </div>
        <div class="nav-overlay" id="navOverlay"></div>
      </div>`);
    el.appendChild(shell);

    const nav = shell.querySelector('#nav');
    navGroups().forEach(([label, items]) => {
      nav.appendChild(h(`<div class="nav-group-label">${esc(label)}</div>`));
      items.forEach(([key, ic, lbl]) => {
        const it = h(`<div class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}" role="button" tabindex="0" aria-label="${esc(lbl)}"><span class="ic">${icon(key)}</span> ${lbl}</div>`);
        const go = () => { state.view = key; renderApp(); };
        it.addEventListener('click', go);
        it.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        nav.appendChild(it);
      });
    });
    shell.querySelector('#orgSelect').addEventListener('change', (e) => { state.orgId = e.target.value; renderApp(); });
    shell.querySelector('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; renderLogin(); });
    const addBtn = shell.querySelector('#addClient');
    if (addBtn) addBtn.addEventListener('click', openAddClient);
    shell.querySelector('#account').addEventListener('click', openProfileModal);
    shell.querySelector('#glossary').addEventListener('click', openGlossary);
    shell.querySelector('#quickNew').addEventListener('click', (e) => { e.stopPropagation(); openQuickMenu(e.currentTarget); });
    // Mobile nav drawer
    const navToggle = shell.querySelector('#navToggle');
    const navOverlay = shell.querySelector('#navOverlay');
    if (navToggle) navToggle.addEventListener('click', () => {
      const open = shell.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (navOverlay) navOverlay.addEventListener('click', () => { shell.classList.remove('nav-open'); if (navToggle) navToggle.setAttribute('aria-expanded', 'false'); });
    wireGlobalSearch(shell);
    wireCommandPalette();

    renderView(shell.querySelector('#content'), shell.querySelector('#viewTitle'));
  }

  function renderNoOrg() {
    el.innerHTML = '';
    const isBk = state.user.role === 'bookkeeper';
    el.appendChild(h(`
      <div class="shell"><aside class="sidebar">
        <div class="sidebar-brand"><img class="side-logo" src="/lumi-logo-white.png" alt="Lumi Accountancy" /><span class="side-product">Bookkeeping</span></div>
        <div class="sidebar-foot"><div class="nav-item" id="logout2"><span class="ic">${icon('logout')}</span> Sign out</div></div>
      </aside><div class="main"><div class="content">
        <div class="card"><div class="card-body empty">
          <h2>No clients yet</h2>
          <p>${isBk ? 'Add your first client business to start keeping their books.' : 'Your bookkeeper has not linked you to a business yet.'}</p>
          ${isBk ? '<button class="btn" id="firstClient">+ Add a client</button>' : ''}
        </div></div>
      </div></div></div>`));
    el.querySelector('#logout2').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; renderLogin(); });
    const fc = el.querySelector('#firstClient');
    if (fc) fc.addEventListener('click', openAddClient);
  }

  // Generic popup menu anchored to an element. items: [label, fn, danger?]
  function openMenu(anchor, items, alignRight) {
    document.querySelectorAll('.quick-menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const menu = h('<div class="quick-menu"></div>');
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${alignRight ? Math.max(8, r.right - 200) : r.left}px`;
    items.forEach(([label, fn, danger]) => { const it = h(`<div class="qm-item"${danger ? ' style="color:var(--danger)"' : ''}>${esc(label)}</div>`); it.addEventListener('click', () => { menu.remove(); fn(); }); menu.appendChild(it); });
    document.body.appendChild(menu);
    setTimeout(() => { const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } }; document.addEventListener('click', close); }, 0);
  }

  function wireGlobalSearch(shell) {
    const input = shell.querySelector('#globalSearch');
    const box = shell.querySelector('#gsResults');
    let timer;
    const hide = () => { box.style.display = 'none'; box.innerHTML = ''; };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      timer = setTimeout(async () => {
        try {
          const { results } = await api(`/api/orgs/${state.orgId}/search?q=${encodeURIComponent(q)}`);
          box.innerHTML = '';
          if (!results.length) { box.innerHTML = '<div class="gs-empty">No matches</div>'; box.style.display = 'block'; return; }
          let lastGroup = '';
          results.forEach((r) => {
            if (r.group !== lastGroup) { box.appendChild(h(`<div class="gs-group">${esc(r.group)}</div>`)); lastGroup = r.group; }
            const it = h(`<div class="gs-item"><span>${esc(r.label)}</span><span class="subtle">${esc(r.sub || '')}</span></div>`);
            it.addEventListener('click', () => { if (r.search) state.pendingTxnSearch = r.search; state.view = r.view; input.value = ''; hide(); renderApp(); });
            box.appendChild(it);
          });
          box.style.display = 'block';
        } catch (e) { hide(); }
      }, 200);
    });
    input.addEventListener('blur', () => setTimeout(hide, 180));
  }

  function openQuickMenu(anchor) {
    const bk = isBookkeeper();
    openMenu(anchor, [
      ['Record sale', () => openGuided('sale')],
      ['Record expense', () => openGuided('expense')],
      ['Sales invoice', () => openInvoiceModal('invoice')],
      ['Quote / estimate', () => openInvoiceModal('quote')],
      ...(bk ? [['Supplier bill', () => openInvoiceModal('bill')], ['Manual journal', () => openTransactionModal()], ['Contact', () => openContactModal()]] : []),
    ]);
  }

  // ---- Command palette (Cmd/Ctrl+K) ----
  let paletteWired = false;
  function wireCommandPalette() {
    if (paletteWired) return; paletteWired = true;
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (state.user && state.orgId) openCommandPalette();
      }
      if (e.key === 'Escape') document.querySelector('.cmdk-bg')?.remove();
    });
  }
  function paletteCommands() {
    const cmds = [];
    navGroups().forEach(([group, items]) => items.forEach(([key, , lbl]) => {
      cmds.push({ label: lbl, sub: group, icon: key, run: () => { state.view = key; renderApp(); } });
    }));
    const bk = isBookkeeper();
    const actions = [
      ['Record a sale', 'sales', () => openGuided('sale')],
      ['Record an expense', 'expenses', () => openGuided('expense')],
      ['New sales invoice', 'invoices', () => openInvoiceModal('invoice')],
      ['New quote', 'quotes', () => openInvoiceModal('quote')],
      ...(bk ? [['New supplier bill', 'bills', () => openInvoiceModal('bill')], ['New manual journal', 'transactions', () => openTransactionModal()], ['New contact', 'contacts', () => openContactModal()]] : []),
      ['Account settings', 'settings', () => openProfileModal()],
      ['Help & glossary', 'help', () => openGlossary()],
    ];
    actions.forEach(([label, ic, run]) => cmds.push({ label, sub: 'Action', icon: ic, run, action: true }));
    return cmds;
  }
  function openCommandPalette() {
    document.querySelector('.cmdk-bg')?.remove();
    const all = paletteCommands();
    const bg = h('<div class="cmdk-bg"></div>');
    const box = h(`<div class="cmdk" role="dialog" aria-label="Command palette">
      <div class="cmdk-input"><span class="cmdk-ic">${icon('search', 16)}</span><input id="cmdkInput" placeholder="Jump to a page or run an action…" autocomplete="off" /><kbd>esc</kbd></div>
      <div class="cmdk-list" id="cmdkList"></div></div>`);
    bg.appendChild(box); document.body.appendChild(bg);
    const input = box.querySelector('#cmdkInput');
    const list = box.querySelector('#cmdkList');
    let sel = 0, shown = all;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      shown = q ? all.filter((c) => (c.label + ' ' + c.sub).toLowerCase().includes(q)) : all;
      if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
      list.innerHTML = '';
      if (!shown.length) { list.appendChild(h('<div class="cmdk-empty">No matches</div>')); return; }
      shown.forEach((c, i) => {
        const it = h(`<div class="cmdk-item ${i === sel ? 'sel' : ''}"><span class="cmdk-iic">${icon(c.icon)}</span><span class="cmdk-lbl">${esc(c.label)}</span><span class="cmdk-sub">${esc(c.sub)}</span></div>`);
        it.addEventListener('mousemove', () => { if (sel !== i) { sel = i; render(); } });
        it.addEventListener('click', () => { bg.remove(); c.run(); });
        list.appendChild(it);
      });
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); const c = shown[sel]; if (c) { bg.remove(); c.run(); } }
    });
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
    render(); input.focus();
  }

  const TITLES = {
    dashboard: 'Dashboard', monthend: 'Month-end Checklist', ai: 'Little Lumi Assist', invoices: 'Sales Invoices', quotes: 'Quotes & Estimates', bills: 'Bills', po: 'Purchase Orders', recurring: 'Recurring Invoices', items: 'Products & Services', contacts: 'Contacts', rules: 'Categorisation Rules',
    queries: 'Queries', inbox: 'Document Inbox', transactions: 'Transactions', import: 'Import Bank Statement', reconcile: 'Bank Reconciliation', accounts: 'Chart of Accounts',
    ledger: 'General Ledger', cashflow: 'Cashflow Forecast', budget: 'Budget vs Actual', aged: 'Aged Debtors & Creditors', tracking: 'Tracking Categories', 'trial-balance': 'Trial Balance', 'profit-loss': 'Profit & Loss', 'balance-sheet': 'Balance Sheet',
    vat: 'VAT Return', payroll: 'Payroll', expenses: 'Expense Claims', yearend: 'Year-end & Setup', audit: 'Activity Log',
  };
  const currentOrg = () => state.orgs.find((o) => o.id === state.orgId) || {};
  const isBookkeeper = () => state.user.role === 'bookkeeper';

  async function renderView(content, titleEl) {
    titleEl.textContent = TITLES[state.view] || '';
    content.innerHTML = '<div class="loading"><span class="spinner"></span> Loading…</div>';
    try {
      if (state.view === 'dashboard') return renderDashboard(content);
      if (state.view === 'monthend') return renderMonthEnd(content);
      if (state.view === 'ai') return renderAI(content);
      if (state.view === 'invoices') return renderDocuments(content, 'invoice');
      if (state.view === 'quotes') return renderQuotes(content);
      if (state.view === 'bills') return renderDocuments(content, 'bill');
      if (state.view === 'po') return renderPurchaseOrders(content);
      if (state.view === 'recurring') return renderRecurring(content);
      if (state.view === 'items') return renderItems(content);
      if (state.view === 'contacts') return renderContacts(content);
      if (state.view === 'rules') return renderRules(content);
      if (state.view === 'inbox') return renderInbox(content);
      if (state.view === 'queries') return renderQueries(content);
      if (state.view === 'cashflow') return renderCashflow(content);
      if (state.view === 'budget') return renderBudget(content);
      if (state.view === 'aged') return renderAged(content);
      if (state.view === 'tracking') return renderTracking(content);
      if (state.view === 'vat') return renderVat(content);
      if (state.view === 'payroll') return renderPayroll(content);
      if (state.view === 'expenses') return renderExpenseClaims(content);
      if (state.view === 'yearend') return renderYearEnd(content);
      if (state.view === 'transactions') return renderTransactions(content);
      if (state.view === 'import') return renderImport(content);
      if (state.view === 'reconcile') return renderReconcile(content);
      if (state.view === 'accounts') return renderAccounts(content);
      if (state.view === 'audit') return renderAudit(content);
      if (state.view === 'ledger') return renderLedger(content);
      if (state.view === 'trial-balance') return renderTrialBalance(content);
      if (state.view === 'profit-loss') return renderProfitLoss(content);
      if (state.view === 'balance-sheet') return renderBalanceSheet(content);
    } catch (err) {
      content.innerHTML = `<div class="card"><div class="card-body err">${esc(err.message)}</div></div>`;
    }
  }

  // ---------- dashboard ----------
  async function renderDashboard(c) {
    const orgId = state.orgId;
    const [bs, txns, ar, ap, dash] = await Promise.all([
      api(`/api/orgs/${orgId}/reports/balance-sheet?asOf=${today()}`),
      api(`/api/orgs/${orgId}/transactions`),
      api(`/api/orgs/${orgId}/reports/aging?type=receivable&asOf=${today()}`),
      api(`/api/orgs/${orgId}/reports/aging?type=payable&asOf=${today()}`),
      api(`/api/orgs/${orgId}/dashboard`),
    ]);
    const recent = txns.transactions.filter((t) => t.status !== 'void').slice(0, 6);
    const arOverdue = ar.buckets.d30 + ar.buckets.d60 + ar.buckets.d90;
    const apOverdue = ap.buckets.d30 + ap.buckets.d60 + ap.buckets.d90;
    const vatLabel = dash.vat.refund > 0 ? 'VAT refund due' : 'VAT owed (position)';
    const vatVal = dash.vat.refund > 0 ? dash.vat.refund : dash.vat.owed;
    c.innerHTML = '';
    c.appendChild(h(`
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px">
        <div><h2 style="margin:0;font-size:16px">Welcome back, ${esc(state.user.name.split(' ')[0])}</h2>
        <div class="subtle">${esc(currentOrg().name || '')}${currentOrg().lockDate ? ' · ' + iconInline('lock', 12) + ' Locked to ' + esc(currentOrg().lockDate) : ''}</div></div>
        <div class="spacer" style="margin-left:auto"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn small" id="qSale">+ Record sale</button>
          <button class="btn secondary small" id="qExpense">+ Record expense</button>
          <button class="btn secondary small" id="qInvoice">+ Invoice</button>
        </div>
      </div>`));
    // Bank data freshness banner
    const bf = dash.bankFreshness || [];
    const stale = bf.filter((b) => b.daysSince != null).sort((a, b) => b.daysSince - a.daysSince)[0];
    if (stale) {
      const d = stale.daysSince;
      const level = d >= 7 ? 'red' : d >= 3 ? 'amber' : 'ok';
      const colour = level === 'red' ? 'var(--danger)' : level === 'amber' ? 'var(--warn)' : 'var(--brand-dark)';
      const bgc = level === 'ok' ? '#e8f1ea' : level === 'amber' ? 'rgba(184,146,42,.1)' : '#f6e9e9';
      const msg = d >= 7
        ? `<b>${esc(stale.name)}</b> hasn't been updated in <b>${d} days</b>. Please import the latest bank statement.`
        : d >= 3
        ? `<b>${esc(stale.name)}</b> was last updated ${d} days ago.`
        : `Bank data is up to date — <b>${esc(stale.name)}</b> updated ${d === 0 ? 'today' : d + ' day' + (d > 1 ? 's' : '') + ' ago'}.`;
      const banner = h(`<div class="card" style="border-left:4px solid ${colour};background:${bgc}">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 20px">
          <span style="font-size:18px">${level === 'ok' ? iconInline('check', 18) : iconInline('clock', 18)}</span>
          <span style="flex:1">${msg}</span>
          ${level !== 'ok' ? '<button class="btn small" id="importNow">Import statement</button>' : ''}
        </div></div>`);
      c.appendChild(banner);
      const inb = banner.querySelector('#importNow');
      if (inb) inb.addEventListener('click', () => { state.view = 'import'; renderApp(); });
    }
    const trend = dash.trend || [];
    const netSeries = trend.map((m) => Math.round((m.income - m.expense) * 100) / 100);
    const incSeries = trend.map((m) => m.income);
    const expSeries = trend.map((m) => m.expense);
    const stats = h(`
      <div class="stat-cards">
        <div class="stat kpi clickable" data-go="profit-loss">
          <div class="kpi-head"><span class="label">Net profit · this year</span>${deltaPill(netSeries)}</div>
          <div class="value ${dash.netProfitYtd >= 0 ? 'pos' : 'neg'}">${money(dash.netProfitYtd)}</div>
          ${sparkline(netSeries, { color: 'var(--gold)' })}
        </div>
        <div class="stat kpi">
          <div class="kpi-head"><span class="label">Income · last 6 months</span>${deltaPill(incSeries)}</div>
          <div class="value">${money(incSeries.reduce((a, b) => a + b, 0))}</div>
          ${sparkline(incSeries, { color: 'var(--brand-dark)' })}
        </div>
        <div class="stat kpi">
          <div class="kpi-head"><span class="label">Expenses · last 6 months</span>${deltaPill(expSeries)}</div>
          <div class="value">${money(expSeries.reduce((a, b) => a + b, 0))}</div>
          ${sparkline(expSeries, { color: '#b9692f' })}
        </div>
        <div class="stat clickable" data-go="invoices"><div class="label">Owed to you (debtors) ›</div><div class="value">${money(ar.total)}</div>${arOverdue ? `<div class="subtle" style="color:var(--danger)">${money(arOverdue)} overdue</div>` : '<div class="subtle">Nothing overdue</div>'}</div>
        <div class="stat clickable" data-go="bills"><div class="label">You owe (creditors) ›</div><div class="value">${money(ap.total)}</div>${apOverdue ? `<div class="subtle" style="color:var(--danger)">${money(apOverdue)} overdue</div>` : '<div class="subtle">Nothing overdue</div>'}</div>
        <div class="stat clickable" data-go="vat"><div class="label">${vatLabel} ›</div><div class="value">${money(vatVal)}</div><div class="subtle">Cash &amp; assets ${money(bs.totalAssets)} · CT est. ${money(dash.corporationTax.tax)}</div></div>
      </div>`);
    stats.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { state.view = el.getAttribute('data-go'); renderApp(); }));
    c.appendChild(stats);
    c.querySelector('#qSale').addEventListener('click', () => openGuided('sale'));
    c.querySelector('#qExpense').addEventListener('click', () => openGuided('expense'));
    c.querySelector('#qInvoice').addEventListener('click', () => openInvoiceModal('invoice'));

    // Income vs expense trend (last 6 months)
    if (dash.trend && dash.trend.length) {
      const tr = dash.trend;
      const maxV = Math.max(1, ...tr.map((m) => Math.max(m.income, m.expense)));
      const W = 760, H = 150, pad = 24, gap = 18;
      const groupW = (W - pad * 2) / tr.length;
      const barW = (groupW - gap) / 2;
      const yOf = (v) => H - pad - (v / maxV) * (H - pad * 2);
      const bars = tr.map((m, i) => {
        const gx = pad + i * groupW + gap / 2;
        return `<rect x="${gx}" y="${yOf(m.income)}" width="${barW}" height="${H - pad - yOf(m.income)}" rx="3" fill="var(--gold)"/>
          <rect x="${gx + barW}" y="${yOf(m.expense)}" width="${barW}" height="${H - pad - yOf(m.expense)}" rx="3" fill="#cdbfa0"/>
          <text x="${gx + barW}" y="${H - 6}" font-size="11" fill="var(--mid)" text-anchor="middle">${esc(m.label)}</text>`;
      }).join('');
      const trendCard = h(`<div class="card"><div class="card-head"><h2>Income vs expenses</h2><div class="spacer"></div>
        <span class="muted-inline"><span style="color:var(--gold)">■</span> Income &nbsp; <span style="color:#cdbfa0">■</span> Expenses · last 6 months</span></div>
        <div class="card-body"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
          <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--cream-3)"/>${bars}
        </svg></div></div>`);
      c.appendChild(trendCard);
    }

    // Action list (computed items + custom tasks)
    const actions = h(`
      <div class="card">
        <div class="card-head"><h2>Your action list</h2><div class="spacer"></div>
          <button class="btn ghost small" id="addTask">+ Add a to-do</button></div>
        <div class="card-body flush"><div id="actionList"></div></div>
      </div>`);
    const list = actions.querySelector('#actionList');
    const rowStyle = 'display:flex;align-items:center;gap:10px;padding:12px 22px;border-bottom:1px solid var(--line)';
    if (!dash.actions.length && !dash.tasks.length) {
      list.appendChild(h(`<div class="empty">All clear — nothing needs your attention.</div>`));
    }
    dash.actions.forEach((a) => {
      const row = h(`<div style="${rowStyle}"><span style="color:var(--gold);font-size:18px">●</span>
        <span style="flex:1">${esc(a.text)}</span>
        <button class="btn secondary small">Go →</button></div>`);
      row.querySelector('button').addEventListener('click', () => { state.view = a.view; renderApp(); });
      list.appendChild(row);
    });
    dash.tasks.forEach((t) => {
      const row = h(`<div style="${rowStyle}">
        <input type="checkbox" ${t.done ? 'checked' : ''} style="width:auto" />
        <span style="flex:1;${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.text)}</span>
        <button class="btn ghost small" style="color:var(--danger)">✕</button></div>`);
      row.querySelector('input').addEventListener('change', async (e) => {
        await api(`/api/orgs/${orgId}/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: e.target.checked }) }); renderApp();
      });
      row.querySelector('button').addEventListener('click', async () => {
        await api(`/api/orgs/${orgId}/tasks/${t.id}`, { method: 'DELETE' }); renderApp();
      });
      list.appendChild(row);
    });
    c.appendChild(actions);
    actions.querySelector('#addTask').addEventListener('click', () => {
      const body = h(`<div><label>To-do for this client</label><input id="t" placeholder="e.g. Send Q2 receipts" /><div class="err" id="err"></div></div>`);
      const save = h('<button class="btn">Add to-do</button>');
      const { close } = modal('Add a to-do', body, save);
      save.addEventListener('click', async () => {
        try { await api(`/api/orgs/${orgId}/tasks`, { method: 'POST', body: JSON.stringify({ text: body.querySelector('#t').value }) }); close(); renderApp(); }
        catch (e) { body.querySelector('#err').textContent = e.message; }
      });
    });

    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Recent transactions</h2><div class="spacer"></div>
          <button class="btn small" id="newTxn">+ New transaction</button></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Date</th><th>Description</th><th>Reference</th><th class="num">Amount</th><th>Docs</th>
        </tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    if (!recent.length) tb.appendChild(h('<tr><td colspan="5" class="empty">No transactions yet.</td></tr>'));
    recent.forEach((t) => tb.appendChild(h(`<tr>
      <td>${esc(t.date)}</td><td>${esc(t.description)}</td><td class="subtle">${esc(t.reference || '—')}</td>
      <td class="num">${money(t.total)}</td>
      <td>${t.attachments.length ? `${iconInline('paperclip', 13)} ${t.attachments.length}` : '<span class="subtle">—</span>'}</td></tr>`)));
    c.appendChild(card);
    card.querySelector('#newTxn').addEventListener('click', () => openTransactionModal());
  }

  // ---------- transactions ----------
  const isLocked = (date) => { const l = currentOrg().lockDate; return l && date <= l; };

  async function renderTransactions(c) {
    const orgId = state.orgId;
    const { transactions } = await api(`/api/orgs/${orgId}/transactions`);
    c.innerHTML = '';
    const lock = currentOrg().lockDate;
    if (isBookkeeper() || lock) {
      const banner = h(`<div class="card"><div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 20px">
        <span>${lock ? `${iconInline('lock', 13)} Books locked up to <b>${esc(lock)}</b>` : 'Period not locked'}</span>
        <div class="spacer" style="margin-left:auto"></div>
        ${isBookkeeper() ? '<button class="btn secondary small" id="lockBtn">Manage lock date</button>' : ''}
      </div></div>`);
      c.appendChild(banner);
      const lb = banner.querySelector('#lockBtn');
      if (lb) lb.addEventListener('click', openLockModal);
    }
    const card = h(`
      <div class="card">
        <div class="card-head report-toolbar"><h2>Transactions</h2>
          <input id="q" placeholder="Search description or reference…" value="${esc(state.pendingTxnSearch || '')}" style="width:auto;min-width:240px" />
          <label>From</label><input type="date" id="from" style="width:auto" />
          <label>To</label><input type="date" id="to" style="width:auto" />
          <div class="spacer"></div>
          <span class="subtle" id="count" style="white-space:nowrap"></span>
          <button class="btn secondary small" id="expTxn">Export CSV</button>
          <button class="btn small" id="newTxn">+ New</button></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Date</th><th>Description</th><th>Reference</th><th>Lines</th><th class="num">Amount</th><th>Documents</th><th></th>
        </tr></thead><tbody id="rows"></tbody></table></div>
        <div class="card-body" id="more" style="text-align:center;display:none"><button class="btn secondary small" id="moreBtn">Show more</button></div>
      </div>`);
    const tb = card.querySelector('#rows');

    const buildRow = (t) => {
      const voided = t.status === 'void';
      const lineSummary = t.lines.map((l) => `${esc(l.accountCode)} ${l.debit ? 'Dr' : 'Cr'} ${money(l.debit || l.credit)}`).join(' · ');
      const docs = t.attachments.map((a) => `<a class="attach-link" href="/api/orgs/${orgId}/attachments/${a.id}" target="_blank">${iconInline('paperclip', 12)} ${esc(a.originalName)}</a>`).join('<br/>') || '<span class="subtle">—</span>';
      const srcTag = t.source && t.source !== 'manual' ? ` <span class="pill income" title="auto-posted">${esc(t.source)}</span>` : '';
      const editable = (!t.source || t.source === 'manual') && !voided && !isLocked(t.date);
      const row = h(`<tr style="${voided ? 'opacity:.5' : ''}">
        <td>${esc(t.date)}</td>
        <td>${esc(t.description)}${voided ? ' <span class="pill bad">void</span>' : ''}${srcTag}</td>
        <td class="subtle">${esc(t.reference || '—')}</td>
        <td class="subtle" style="max-width:220px">${lineSummary}</td>
        <td class="num">${money(t.total)}</td>
        <td>${docs}</td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const actions = row.querySelector('td:last-child');
      const menuItems = [];
      if (!voided) menuItems.push(['Attach document', () => openUpload(t)]);
      if (isBookkeeper() && !voided) menuItems.push(['Ask the client', () => openNewQuery(t)]);
      if (editable) {
        const e = h('<button class="btn ghost small">Edit</button>');
        e.addEventListener('click', () => openTransactionModal(t));
        actions.append(e);
        menuItems.push(['Void transaction', () => voidTxn(t), true]);
      } else if (voided) { actions.append(h('<span class="subtle" style="margin-right:6px">void</span>')); }
      else { actions.append(h('<span class="subtle" style="margin-right:6px">locked</span>')); }
      if (menuItems.length) {
        const more = h('<button class="btn ghost small" aria-label="More actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
        more.addEventListener('click', (ev) => { ev.stopPropagation(); openMenu(ev.currentTarget, menuItems, true); });
        actions.append(more);
      }
      return row;
    };

    let limit = 50;
    const filtered = () => {
      const q = card.querySelector('#q').value.trim().toLowerCase();
      const from = card.querySelector('#from').value, to = card.querySelector('#to').value;
      return transactions.filter((t) => {
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        if (q && !((t.description || '').toLowerCase().includes(q) || (t.reference || '').toLowerCase().includes(q))) return false;
        return true;
      });
    };
    const redraw = () => {
      const list = filtered();
      tb.innerHTML = '';
      if (!list.length) tb.appendChild(h('<tr><td colspan="7" class="empty">No matching transactions.</td></tr>'));
      list.slice(0, limit).forEach((t) => tb.appendChild(buildRow(t)));
      card.querySelector('#count').textContent = `${Math.min(limit, list.length)} of ${list.length}`;
      card.querySelector('#more').style.display = list.length > limit ? 'block' : 'none';
    };
    ['q', 'from', 'to'].forEach((id) => card.querySelector('#' + id).addEventListener('input', () => { limit = 50; redraw(); }));
    card.querySelector('#moreBtn').addEventListener('click', () => { limit += 100; redraw(); });
    redraw();
    state.pendingTxnSearch = null;
    c.appendChild(card);
    card.querySelector('#newTxn').addEventListener('click', () => openTransactionModal());
    card.querySelector('#expTxn').addEventListener('click', () => {
      const list = filtered();
      downloadCSV(`transactions_${today()}.csv`, [['Date', 'Description', 'Reference', 'Amount', 'Status', 'Lines'],
        ...list.map((t) => [t.date, t.description, t.reference || '', t.total, t.status, t.lines.map((l) => `${l.accountCode} ${l.debit ? 'Dr' : 'Cr'} ${l.debit || l.credit}`).join(' | ')])]);
    });
  }

  async function voidTxn(t) {
    if (!confirm(`Void "${t.description}"? It will be removed from reports but kept for audit.`)) return;
    try { await api(`/api/orgs/${state.orgId}/transactions/${t.id}/void`, { method: 'POST' }); flash('Transaction voided'); renderApp(); }
    catch (e) { flash(e.message, true); }
  }

  function openLockModal() {
    const cur = currentOrg().lockDate || '';
    const body = h(`<div>
      <p class="muted-inline">Lock the books up to and including a date so nothing on or before it can be changed. Useful after a period is reviewed or filed.</p>
      <label>Lock date</label><input type="date" id="lockDate" value="${cur}" />
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Save lock</button>');
    const clear = h('<button class="btn secondary">Clear lock</button>');
    const { close } = modal('Lock period', body, (() => { const f = document.createElement('div'); f.style.display='contents'; f.append(clear, save); return f; })());
    const apply = async (lockDate) => {
      try {
        const r = await api(`/api/orgs/${state.orgId}/lock`, { method: 'PUT', body: JSON.stringify({ lockDate }) });
        currentOrg().lockDate = r.lockDate;
        const me = await api('/api/me'); state.orgs = me.orgs;
        close(); flash(lockDate ? `Locked to ${lockDate}` : 'Lock cleared'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    };
    save.addEventListener('click', () => apply(body.querySelector('#lockDate').value));
    clear.addEventListener('click', () => apply(null));
  }

  // ---------- invoices & bills ----------
  const STATUS_PILL = { draft: 'expense', awaiting_payment: 'liability', paid: 'ok' };
  const STATUS_LABEL = { draft: 'Draft', awaiting_payment: 'Awaiting payment', paid: 'Paid' };

  async function renderDocuments(c, type) {
    const orgId = state.orgId;
    const agingType = type === 'invoice' ? 'receivable' : 'payable';
    const [{ invoices }, aging] = await Promise.all([
      api(`/api/orgs/${orgId}/invoices?type=${type}`),
      api(`/api/orgs/${orgId}/reports/aging?type=${agingType}`),
    ]);
    const noun = type === 'invoice' ? 'invoice' : 'bill';
    c.innerHTML = '';
    c.appendChild(h(`
      <div class="stat-cards">
        <div class="stat"><div class="label">Outstanding</div><div class="value">${money(aging.total)}</div></div>
        <div class="stat"><div class="label">Not due</div><div class="value">${money(aging.buckets.current)}</div></div>
        <div class="stat"><div class="label">1–30 days</div><div class="value">${money(aging.buckets.d30)}</div></div>
        <div class="stat"><div class="label">31–60 days</div><div class="value">${money(aging.buckets.d60)}</div></div>
        <div class="stat"><div class="label">60+ days</div><div class="value ${aging.buckets.d90 ? 'neg' : ''}">${money(aging.buckets.d90)}</div></div>
      </div>`));
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>${type === 'invoice' ? 'Sales invoices' : 'Supplier bills'}</h2><div class="spacer"></div>
          <button class="btn small" id="new">+ New ${noun}</button></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Number</th><th>${type === 'invoice' ? 'Customer' : 'Supplier'}</th><th>Issued</th><th>Due</th>
          <th class="num">Amount</th><th>Status</th><th></th>
        </tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    if (!invoices.length) tb.appendChild(h(`<tr><td colspan="7" class="empty">No ${noun}s yet.</td></tr>`));
    invoices.forEach((inv) => {
      const row = h(`<tr>
        <td><b>${esc(inv.number)}</b></td><td>${esc(inv.contactName)}</td>
        <td>${esc(inv.issueDate)}</td><td>${esc(inv.dueDate)}</td>
        <td class="num">${money(inv.total)}${inv.amountPaid && inv.status === 'awaiting_payment' ? `<br><span class="subtle" style="font-size:12px">${money(inv.total - inv.amountPaid)} left</span>` : ''}</td>
        <td><span class="pill ${STATUS_PILL[inv.status]}">${inv.amountPaid && inv.status === 'awaiting_payment' ? 'Part paid' : STATUS_LABEL[inv.status]}</span></td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const menuItems = [['View / PDF', () => openInvoiceDoc(inv.id)]];
      if (type === 'invoice') menuItems.push(['Send to customer', () => openSendInvoice(inv)]);
      menuItems.push(['Duplicate', async () => { try { const r = await api(`/api/orgs/${orgId}/invoices/${inv.id}/duplicate`, { method: 'POST' }); flash(`Copied to ${r.invoice.number}`); renderApp(); } catch (e) { flash(e.message, true); } }]);
      let primary = null;
      if (inv.status === 'draft') {
        menuItems.unshift(['Edit', () => openInvoiceModal(type, inv)]);
        menuItems.push(['Delete draft', async () => { if (confirm('Delete this draft?')) { try { await api(`/api/orgs/${orgId}/invoices/${inv.id}`, { method: 'DELETE' }); flash('Deleted'); renderApp(); } catch (e) { flash(e.message, true); } } }, true]);
        primary = h('<button class="btn small">Approve</button>');
        primary.addEventListener('click', () => doInvoice(`${inv.id}/approve`, 'Approved & posted'));
      } else if (inv.status === 'awaiting_payment') {
        if (type === 'invoice' && inv.dueDate < today()) menuItems.push(['Send reminder', () => openSendInvoice(inv, { reminder: true })]);
        primary = h('<button class="btn small">Record payment</button>');
        primary.addEventListener('click', () => openPayModal(inv));
      }
      if (primary) act.append(primary);
      const more = h('<button class="btn ghost small" aria-label="More actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems, true); });
      act.append(more);
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openInvoiceModal(type));
  }

  // ---------- quotes / estimates ----------
  const QUOTE_PILL = { draft: 'expense', sent: 'liability', accepted: 'ok', declined: 'bad', converted: 'income' };
  const QUOTE_LABEL = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', converted: 'Converted' };

  async function renderQuotes(c) {
    const orgId = state.orgId;
    const { invoices } = await api(`/api/orgs/${orgId}/invoices?type=quote`);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px">
      <span class="muted-inline">Quotes don't affect your accounts. Send one to a customer, mark it accepted, then convert it to a draft invoice with one click.</span></div></div>`));
    const card = h(`<div class="card">
      <div class="card-head"><h2>Quotes &amp; estimates</h2><div class="spacer"></div>
        <button class="btn small" id="new">${icon('plus', 14)} New quote</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Number</th><th>Customer</th><th>Issued</th><th>Valid to</th><th class="num">Total</th><th>Status</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!invoices.length) tb.appendChild(h('<tr><td colspan="7" class="empty">No quotes yet.</td></tr>'));
    invoices.forEach((q) => {
      const row = h(`<tr>
        <td><b>${esc(q.number)}</b></td><td>${esc(q.contactName)}</td>
        <td>${esc(q.issueDate)}</td><td>${esc(q.dueDate)}</td>
        <td class="num">${money(q.total)}</td>
        <td><span class="pill ${QUOTE_PILL[q.status] || 'expense'}">${QUOTE_LABEL[q.status] || q.status}</span></td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const setStatus = async (status) => { try { await api(`/api/orgs/${orgId}/invoices/${q.id}/quote-status`, { method: 'POST', body: JSON.stringify({ status }) }); flash('Quote updated'); renderApp(); } catch (e) { flash(e.message, true); } };
      const menuItems = [['View / PDF', () => openInvoiceDoc(q.id)], ['Send to customer', () => openSendInvoice(q)]];
      if (q.status === 'draft') menuItems.unshift(['Edit', () => openInvoiceModal('quote', q)]);
      if (q.status === 'draft' || q.status === 'sent') { menuItems.push(['Mark accepted', () => setStatus('accepted')]); menuItems.push(['Mark declined', () => setStatus('declined'), true]); }
      let primary = null;
      if (q.status !== 'converted' && q.status !== 'declined') {
        primary = h('<button class="btn small">Convert</button>');
        primary.addEventListener('click', async () => {
          if (!confirm('Convert this quote into a draft sales invoice?')) return;
          try { const r = await api(`/api/orgs/${orgId}/invoices/${q.id}/convert`, { method: 'POST' }); flash(`Created ${r.invoice.number}`); state.view = 'invoices'; renderApp(); } catch (e) { flash(e.message, true); }
        });
      } else if (q.convertedToId) {
        act.append(h('<span class="subtle" style="margin-right:8px">→ invoice</span>'));
      }
      if (primary) act.append(primary);
      const more = h('<button class="btn ghost small" aria-label="More actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems, true); });
      act.append(more);
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openInvoiceModal('quote'));
  }

  // ---------- purchase orders ----------
  async function renderPurchaseOrders(c) {
    const orgId = state.orgId;
    const { invoices } = await api(`/api/orgs/${orgId}/invoices?type=po`);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px">
      <span class="muted-inline">Raise purchase orders to send to suppliers. They don't affect your accounts until you convert one to a bill when the goods arrive.</span></div></div>`));
    const card = h(`<div class="card">
      <div class="card-head"><h2>Purchase orders</h2><div class="spacer"></div>
        <button class="btn small" id="new">${icon('plus', 14)} New PO</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Number</th><th>Supplier</th><th>Issued</th><th>Delivery</th><th class="num">Total</th><th>Status</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!invoices.length) tb.appendChild(h('<tr><td colspan="7" class="empty">No purchase orders yet.</td></tr>'));
    invoices.forEach((p) => {
      const pill = { draft: 'expense', sent: 'liability', converted: 'income' }[p.status] || 'expense';
      const label = { draft: 'Draft', sent: 'Sent', converted: 'Billed' }[p.status] || p.status;
      const row = h(`<tr>
        <td><b>${esc(p.number)}</b></td><td>${esc(p.contactName)}</td>
        <td>${esc(p.issueDate)}</td><td>${esc(p.dueDate)}</td>
        <td class="num">${money(p.total)}</td>
        <td><span class="pill ${pill}">${label}</span></td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const menuItems = [['View / PDF', () => openInvoiceDoc(p.id)], ['Send to supplier', () => openSendInvoice(p)]];
      if (p.status === 'draft') menuItems.unshift(['Edit', () => openInvoiceModal('po', p)]);
      let primary = null;
      if (p.status !== 'converted') {
        primary = h('<button class="btn small">Convert to bill</button>');
        primary.addEventListener('click', async () => {
          if (!confirm('Convert this purchase order into a draft bill?')) return;
          try { const r = await api(`/api/orgs/${orgId}/invoices/${p.id}/convert`, { method: 'POST' }); flash(`Created ${r.invoice.number}`); state.view = 'bills'; renderApp(); } catch (e) { flash(e.message, true); }
        });
      } else if (p.convertedToId) act.append(h('<span class="subtle" style="margin-right:8px">→ bill</span>'));
      if (primary) act.append(primary);
      const more = h('<button class="btn ghost small" aria-label="More actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems, true); });
      act.append(more);
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openInvoiceModal('po'));
  }

  function invoiceDocHTML(d) {
    const inv = d.invoice, co = d.company, ct = d.contact;
    const isBill = inv.type === 'bill';
    const isQuote = inv.type === 'quote';
    const isPO = inv.type === 'po';
    const title = isPO ? 'PURCHASE ORDER' : isBill ? 'BILL' : isQuote ? 'QUOTE' : 'INVOICE';
    const showPay = !isQuote && !isPO;
    const paid = inv.amountPaid || 0;
    const balance = Math.round(((inv.total || 0) - paid) * 100) / 100;
    const todayStr = new Date().toISOString().slice(0, 10);
    let chip = '';
    if (inv.status === 'void') chip = '<span class="chip muted">Void</span>';
    else if (inv.status === 'converted') chip = '<span class="chip muted">Converted</span>';
    else if (showPay && (inv.total || 0) > 0 && (inv.status === 'paid' || balance <= 0)) chip = '<span class="chip ok">Paid</span>';
    else if (showPay && paid > 0) chip = '<span class="chip warn">Part-paid</span>';
    else if (showPay && inv.dueDate && inv.dueDate < todayStr) chip = '<span class="chip bad">Overdue</span>';
    else if (inv.status === 'draft') chip = '<span class="chip muted">Draft</span>';
    else if (isQuote && inv.status === 'accepted') chip = '<span class="chip ok">Accepted</span>';
    else if (isQuote && inv.status === 'declined') chip = '<span class="chip bad">Declined</span>';
    const rows = inv.lines.map((l) => `<tr>
      <td>${esc(l.description || l.accountName || '')}</td>
      <td class="r">${money(l.amount)}</td>
      <td class="r">${l.taxRateId ? money(l.tax) : '—'}</td>
      <td class="r">${money((l.amount || 0) + (l.tax || 0))}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600&display=swap">
    <style>
      :root{--gold:#B8922A;--charcoal:#1A1A18;--mid:#6B6860;--line:#E4DFD4;--cream:#FAF8F4}
      *{box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:var(--charcoal);background:#fff;margin:0;padding:48px;font-size:13.5px;line-height:1.55}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--gold);padding-bottom:22px;margin-bottom:26px}
      .brand{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600}
      .muted{color:var(--mid)}.r{text-align:right}
      h1{font-size:20px;letter-spacing:3px;margin:0 0 6px;color:var(--gold)}
      .meta{ text-align:right;font-size:12.5px}
      .parties{display:flex;justify-content:space-between;gap:40px;margin:24px 0}
      .label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:4px;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mid);text-align:left;border-bottom:2px solid var(--charcoal);padding:8px 10px}
      th.r{text-align:right}td{padding:10px;border-bottom:1px solid var(--line)}
      .chip{display:inline-block;margin-top:9px;padding:3px 11px;border-radius:100px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
      .chip.ok{background:#e8f1ea;color:#3a7a52}.chip.warn{background:rgba(184,146,42,.16);color:#8a6c1d}
      .chip.bad{background:#f6e9e9;color:#b23a3a}.chip.muted{background:#efece6;color:#6B6860}
      .totals{margin-left:auto;width:300px;margin-top:24px;background:var(--cream);border:1px solid var(--line);border-radius:12px;padding:10px 8px}
      .totals .row{display:flex;justify-content:space-between;padding:6px 14px}
      .totals .grand{border-top:2px solid var(--gold);font-weight:700;font-size:16px;margin-top:4px;padding-top:11px}
      .totals .due{font-weight:700}
      .paybox{margin-top:30px;background:var(--cream);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:14px 18px;font-size:12.5px;white-space:pre-line}
      .paybox .label{margin-bottom:5px}
      .foot{margin-top:26px;border-top:1px solid var(--line);padding-top:16px;color:var(--mid);font-size:12px}
      @media print{body{padding:24px}}
    </style></head><body>
      <div class="top">
        <div>${co.logoUrl ? `<img src="${co.logoUrl}" alt="${esc(co.name)}" style="max-height:64px;max-width:240px;margin-bottom:12px;display:block"/>` : ''}<div class="brand">${esc(co.name)}</div>
          <div class="muted" style="margin-top:6px;white-space:pre-line">${esc(co.address)}</div>
          <div class="muted">${co.vatNo ? 'VAT ' + esc(co.vatNo) : ''}${co.regNo ? ' · Co. ' + esc(co.regNo) : ''}</div>
          <div class="muted">${esc(co.email)}${co.phone ? ' · ' + esc(co.phone) : ''}</div></div>
        <div class="meta"><h1>${title}</h1>
          <div><b>${esc(inv.number)}</b></div>
          <div class="muted">Issued ${esc(inv.issueDate)}</div>
          <div class="muted">${isQuote ? 'Valid until' : isPO ? 'Required by' : 'Due'} ${esc(inv.dueDate)}</div>
          ${chip}</div>
      </div>
      <div class="parties">
        <div><div class="label">${isPO ? 'Supplier' : isBill ? 'From' : isQuote ? 'Quote for' : 'Bill to'}</div><div><b>${esc(ct ? ct.name : '')}</b></div><div class="muted">${esc(ct && ct.email ? ct.email : '')}</div></div>
      </div>
      <table><thead><tr><th>Description</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="totals">
        <div class="row"><span class="muted">Subtotal</span><span>${money(inv.subtotal)}</span></div>
        <div class="row"><span class="muted">VAT</span><span>${money(inv.taxTotal)}</span></div>
        <div class="row grand"><span>Total${isQuote || isPO ? '' : isBill ? ' due' : ' to pay'}</span><span>${money(inv.total)}</span></div>
        ${showPay && paid > 0 ? `<div class="row"><span class="muted">Amount paid</span><span>−${money(paid)}</span></div>
        <div class="row due"><span>Balance due</span><span>${money(balance)}</span></div>` : ''}
      </div>
      ${!isBill && !isPO && co.bankDetails ? `<div class="paybox"><div class="label">How to pay</div>${esc(co.bankDetails)}</div>` : ''}
      ${inv.notes ? `<div class="foot" style="white-space:pre-line">${esc(inv.notes)}</div>` : ''}
      <div class="foot">${isPO ? 'Please supply the above and invoice quoting this PO number.' : isQuote ? 'This quote is valid for 30 days from the issue date. We look forward to working with you.' : isBill ? 'Entered for your records.' : 'Thank you for your business.'}</div>
    </body></html>`;
  }

  async function openInvoiceDoc(invoiceId) {
    const d = await api(`/api/orgs/${state.orgId}/invoices/${invoiceId}`);
    const w = window.open('', '_blank');
    if (!w) { flash('Allow pop-ups to view the PDF', true); return; }
    w.document.write(invoiceDocHTML(d));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
  }

  async function openSendInvoice(inv, opts) {
    opts = opts || {};
    const d = await api(`/api/orgs/${state.orgId}/invoices/${inv.id}`);
    const to = d.contact && d.contact.email ? d.contact.email : '';
    const remaining = Math.round((inv.total - (inv.amountPaid || 0)) * 100) / 100;
    const subject = opts.reminder ? `Reminder: invoice ${inv.number} now due` : `Invoice ${inv.number} from ${d.company.name}`;
    const bodyText = opts.reminder
      ? `Hi ${d.contact ? d.contact.name : ''},\n\nA friendly reminder that invoice ${inv.number} for ${money(remaining)} was due on ${inv.dueDate} and appears to be outstanding.\n\n${d.company.bankDetails ? 'Payment details: ' + d.company.bankDetails + '\n\n' : ''}If you've already paid, please ignore this. Many thanks,\n${d.company.name}`
      : `Hi ${d.contact ? d.contact.name : ''},\n\nPlease find attached invoice ${inv.number} for ${money(inv.total)}, due ${inv.dueDate}.\n\n${d.company.bankDetails ? 'Payment details: ' + d.company.bankDetails + '\n\n' : ''}Many thanks,\n${d.company.name}`;
    const body = h(`<div>
      <p class="muted-inline">Generate the PDF and send it to your customer. ${inv.sentAt ? `<br>Last sent ${esc(inv.sentAt.slice(0, 10))}.` : ''}</p>
      <label>To</label><input id="to" value="${esc(to)}" placeholder="customer@email.com" />
      <label>Subject</label><input id="subj" value="${esc(subject)}" />
      <label>Message</label><textarea id="msg" rows="6" style="width:100%">${esc(bodyText)}</textarea>
      <div class="err" id="err"></div>
      <div class="muted-inline" style="margin-top:8px">This opens your email app with the message ready. Automatic sending needs an email service connected (a hosting step).</div>
    </div>`);
    const pdfBtn = h(`<button class="btn secondary">${icon('sales', 15)} Open PDF</button>`);
    const sendBtn = h(`<button class="btn">${icon('import', 15)} Open email</button>`);
    const foot = document.createElement('div'); foot.style.display = 'contents'; foot.append(pdfBtn, sendBtn);
    const { close } = modal(`${opts.reminder ? 'Reminder' : 'Send'} ${inv.number}`, body, foot);
    pdfBtn.addEventListener('click', () => openInvoiceDoc(inv.id));
    sendBtn.addEventListener('click', async () => {
      const tov = body.querySelector('#to').value.trim();
      const link = `mailto:${encodeURIComponent(tov)}?subject=${encodeURIComponent(body.querySelector('#subj').value)}&body=${encodeURIComponent(body.querySelector('#msg').value)}`;
      window.open(link, '_blank');
      try { await api(`/api/orgs/${state.orgId}/invoices/${inv.id}/sent`, { method: 'POST', body: JSON.stringify({ to: tov }) }); } catch (e) {}
      close(); flash('Email opened — marked as sent');
    });
  }

  async function doInvoice(suffix, msg) {
    try { await api(`/api/orgs/${state.orgId}/invoices/${suffix}`, { method: 'POST' }); flash(msg); renderApp(); }
    catch (e) { flash(e.message, true); }
  }

  async function openInvoiceModal(type, existing) {
    if (existing) type = existing.type;
    const orgId = state.orgId;
    const [{ accounts }, { contacts }, { taxRates }, itemsRes] = await Promise.all([
      api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/contacts`), api(`/api/orgs/${orgId}/tax-rates`), api(`/api/orgs/${orgId}/items`),
    ]);
    const items = itemsRes.items || [];
    const sales = type === 'invoice' || type === 'quote'; // sales side uses income accounts & a customer; bill/po are purchases
    const lineAccounts = accounts.filter((a) => (sales ? a.type === 'income' : a.type === 'expense'))
      .concat(accounts.filter((a) => (sales ? a.type !== 'income' : a.type !== 'expense')));
    const accOpts = lineAccounts.map((a) => `<option value="${a.id}">${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const contactOpts = contacts.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    const rateById = new Map(taxRates.map((t) => [t.id, t.rate]));
    const taxOpts = `<option value="">No tax</option>` + taxRates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    const noun = type === 'invoice' ? 'invoice' : type === 'bill' ? 'bill' : type === 'po' ? 'purchase order' : 'quote';
    const body = h(`<div>
      <div class="inline-row">
        <div><label>${sales ? 'Customer' : 'Supplier'}</label>
          <select id="contact"><option value="">${contacts.length ? '— choose —' : '— none yet —'}</option>${contactOpts}<option value="__new">+ New ${sales ? 'customer' : 'supplier'}…</option></select>
          <div id="newContact" style="display:none;margin-top:8px;padding:11px 12px;border:1px dashed var(--cream-3);border-radius:10px;background:var(--cream-1, #fbfaf7)">
            <div class="inline-row">
              <div><input id="ncName" placeholder="${sales ? 'Customer' : 'Supplier'} name" /></div>
              <div><input id="ncEmail" type="email" placeholder="Email (optional)" /></div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn small" id="ncAdd">Add ${sales ? 'customer' : 'supplier'}</button><button type="button" class="btn ghost small" id="ncCancel">Cancel</button></div>
            <div class="err" id="ncErr" style="margin-top:6px"></div>
          </div></div>
        <div><label>Number (optional)</label><input id="number" placeholder="auto" /></div>
      </div>
      <div class="inline-row">
        <div><label>Issue date</label><input type="date" id="issue" value="${today()}" /></div>
        <div><label>${sales && type === 'quote' ? 'Valid until' : 'Due date'}</label><input type="date" id="due" value="${addDays(today(), currentOrg().paymentTermsDays || 30)}" /></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:18px">
        <label style="margin:0">Line items</label>
        ${sales && items.length ? `<select id="itemPick" style="width:auto;margin-left:auto"><option value="">+ Add a product / service…</option>${items.map((i) => `<option value="${i.id}">${esc(i.name)}${i.salePrice ? ' · ' + money(i.salePrice) : ''}</option>`).join('')}</select>` : ''}
      </div>
      <div class="line-row" style="grid-template-columns:1.3fr 1.3fr 1fr 1.1fr 30px"><span class="head">Account</span><span class="head">Description</span><span class="head num">Net amount</span><span class="head">Tax</span><span></span></div>
      <div id="lines"></div>
      <button class="btn ghost small" id="addLine" type="button">+ Add line</button>
      <div class="balance-note" id="tot"></div>
      <label style="margin-top:16px">Notes / terms (optional)</label>
      <textarea id="notes" rows="2" placeholder="${sales && type === 'quote' ? 'e.g. Quote valid for 30 days. 50% deposit required.' : 'e.g. Payment due within 30 days. Thank you.'}"></textarea>
      <div class="err" id="err"></div>
    </div>`);
    const linesWrap = body.querySelector('#lines');
    const recompute = () => {
      let sub = 0, tax = 0;
      linesWrap.querySelectorAll('.line-row').forEach((r) => {
        const amt = Number(r.querySelector('.amt').value || 0);
        const rate = rateById.get(r.querySelector('.tax').value) || 0;
        sub += amt; tax += amt * rate / 100;
      });
      body.querySelector('#tot').innerHTML = `Subtotal ${money(sub)} &nbsp;·&nbsp; VAT ${money(tax)} &nbsp;·&nbsp; <b>Total ${money(sub + tax)}</b>`;
      body.querySelector('#tot').style.color = 'var(--ink)';
    };
    const addLine = (preset) => {
      const row = h(`<div class="line-row" style="grid-template-columns:1.3fr 1.3fr 1fr 1.1fr 30px">
        <select class="acc">${accOpts}</select>
        <input class="desc" placeholder="Description" />
        <input class="amt num" type="number" step="0.01" min="0" placeholder="0.00" />
        <select class="tax">${taxOpts}</select>
        <button class="rm" type="button">×</button></div>`);
      row.querySelector('.rm').addEventListener('click', () => { row.remove(); recompute(); });
      row.querySelector('.amt').addEventListener('input', recompute);
      row.querySelector('.tax').addEventListener('change', recompute);
      if (preset) {
        row.querySelector('.acc').value = preset.accountId;
        row.querySelector('.desc').value = preset.description || '';
        row.querySelector('.amt').value = preset.amount || '';
        row.querySelector('.tax').value = preset.taxRateId || '';
      }
      linesWrap.appendChild(row);
    };
    if (existing) {
      body.querySelector('#contact').value = existing.contactId;
      body.querySelector('#number').value = existing.number || '';
      body.querySelector('#issue').value = existing.issueDate;
      body.querySelector('#due').value = existing.dueDate;
      body.querySelector('#notes').value = existing.notes || '';
      existing.lines.forEach((l) => addLine(l));
    } else { addLine(); }
    recompute();
    body.querySelector('#addLine').addEventListener('click', () => addLine());
    const itemPick = body.querySelector('#itemPick');
    if (itemPick) itemPick.addEventListener('change', (e) => {
      const it = items.find((x) => x.id === e.target.value);
      if (it) { addLine({ accountId: it.saleAccountId, description: it.description || it.name, amount: it.salePrice, taxRateId: it.taxRateId }); recompute(); }
      e.target.value = '';
    });

    // Inline create a new customer/supplier without leaving the modal
    const contactSel = body.querySelector('#contact');
    const newCpanel = body.querySelector('#newContact');
    contactSel.addEventListener('change', () => {
      if (contactSel.value === '__new') { newCpanel.style.display = 'block'; body.querySelector('#ncName').focus(); }
      else newCpanel.style.display = 'none';
    });
    body.querySelector('#ncCancel').addEventListener('click', () => { newCpanel.style.display = 'none'; contactSel.value = ''; });
    body.querySelector('#ncAdd').addEventListener('click', async () => {
      const nm = body.querySelector('#ncName').value.trim();
      const ncErr = body.querySelector('#ncErr'); ncErr.textContent = '';
      if (!nm) { ncErr.textContent = 'Enter a name.'; return; }
      try {
        const { contact } = await api(`/api/orgs/${orgId}/contacts`, { method: 'POST', body: JSON.stringify({ name: nm, kind: sales ? 'customer' : 'supplier', email: body.querySelector('#ncEmail').value.trim() }) });
        contacts.push(contact);
        const opt = h(`<option value="${contact.id}">${esc(contact.name)}</option>`);
        contactSel.insertBefore(opt, contactSel.querySelector('option[value="__new"]'));
        contactSel.value = contact.id;
        newCpanel.style.display = 'none';
        flash(`${sales ? 'Customer' : 'Supplier'} added`);
      } catch (e) { ncErr.textContent = e.message; }
    });

    const save = h(`<button class="btn">${existing ? 'Save changes' : 'Create ' + noun}</button>`);
    const { close } = modal(`${existing ? 'Edit ' + noun + ' ' + existing.number : 'New ' + noun}`, body, save);
    save.addEventListener('click', async () => {
      const err = body.querySelector('#err'); err.textContent = '';
      const contactId = body.querySelector('#contact').value;
      if (!contactId || contactId === '__new') { err.textContent = `Choose or add a ${sales ? 'customer' : 'supplier'}.`; return; }
      const lines = [...linesWrap.querySelectorAll('.line-row')].map((r) => ({
        accountId: r.querySelector('.acc').value, description: r.querySelector('.desc').value,
        amount: Number(r.querySelector('.amt').value || 0), taxRateId: r.querySelector('.tax').value || null,
      })).filter((l) => l.amount > 0);
      const payload = { type, contactId, number: body.querySelector('#number').value,
        issueDate: body.querySelector('#issue').value, dueDate: body.querySelector('#due').value, lines, notes: body.querySelector('#notes').value };
      try {
        if (existing) await api(`/api/orgs/${orgId}/invoices/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api(`/api/orgs/${orgId}/invoices`, { method: 'POST', body: JSON.stringify(payload) });
        close(); flash(existing ? 'Saved' : `${noun[0].toUpperCase() + noun.slice(1)} created`); renderApp();
      } catch (e) { err.textContent = e.message; }
    });
  }

  async function openPayModal(inv) {
    const { accounts } = await api(`/api/orgs/${state.orgId}/accounts`);
    const banks = accounts.filter((a) => a.type === 'asset');
    const remaining = Math.round((inv.total - (inv.amountPaid || 0)) * 100) / 100;
    const body = h(`<div>
      <p class="muted-inline">Settle <b>${esc(inv.number)}</b> — outstanding <b>${money(remaining)}</b>${inv.amountPaid ? ` (of ${money(inv.total)})` : ''}.</p>
      <div class="inline-row">
        <div><label>Amount</label><input id="amount" type="number" step="0.01" min="0" max="${remaining}" value="${remaining}" /></div>
        <div><label>Date</label><input type="date" id="date" value="${today()}" /></div>
      </div>
      <label>Paid ${inv.type === 'invoice' ? 'into' : 'from'} account</label>
      <select id="bank">${banks.map((b) => `<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join('')}</select>
      <div class="muted-inline" style="margin-top:8px">Enter a smaller amount to record a part-payment.</div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Record payment</button>');
    const { close } = modal('Record payment', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/invoices/${inv.id}/pay`, { method: 'POST', body: JSON.stringify({
          paymentAccountId: body.querySelector('#bank').value, date: body.querySelector('#date').value, amount: Number(body.querySelector('#amount').value) }) });
        close(); flash('Payment recorded'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- recurring invoices ----------
  async function renderRecurring(c) {
    const orgId = state.orgId;
    const [{ recurring, dueCount }, { contacts }, { accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/recurring`), api(`/api/orgs/${orgId}/contacts`), api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="display:flex;align-items:center;gap:12px;padding:16px 22px">
      <span class="muted-inline" style="flex:1">Set up invoices or bills that repeat. When they're due, generate them as drafts to review and approve. ${dueCount ? `<b>${dueCount} due now.</b>` : ''}</span>
      ${dueCount ? '<button class="btn small" id="gen">Generate due now</button>' : ''}</div></div>`));
    const genBtn = c.querySelector('#gen');
    if (genBtn) genBtn.addEventListener('click', async () => {
      try { const r = await api(`/api/orgs/${orgId}/recurring/generate`, { method: 'POST' }); flash(`Generated ${r.generated} draft${r.generated === 1 ? '' : 's'}`); renderApp(); }
      catch (e) { flash(e.message, true); }
    });
    const card = h(`<div class="card"><div class="card-head"><h2>Recurring templates</h2><div class="spacer"></div>
      <button class="btn small" id="new">+ New template</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Contact</th><th>Type</th><th>Description</th><th class="num">Amount</th><th>Frequency</th><th>Next</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!recurring.length) tb.appendChild(h('<tr><td colspan="7" class="empty">No recurring templates yet.</td></tr>'));
    recurring.forEach((r) => {
      const row = h(`<tr>
        <td>${esc(r.contactName)}</td><td><span class="pill ${r.type === 'invoice' ? 'income' : 'expense'}">${r.type}</span></td>
        <td class="subtle">${esc(r.description || r.accountName)}</td><td class="num">${money(r.amount)}</td>
        <td>${esc(r.frequency)}</td><td>${esc(r.nextDate)} ${r.due ? '<span class="pill liability">due</span>' : ''}</td>
        <td class="num"><button class="btn ghost small" style="color:var(--danger)">Delete</button></td></tr>`);
      row.querySelector('button').addEventListener('click', async () => { if (confirm('Delete this template?')) { await api(`/api/orgs/${orgId}/recurring/${r.id}`, { method: 'DELETE' }); renderApp(); } });
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openRecurringModal(contacts, accounts, taxRates));
  }

  function openRecurringModal(contacts, accounts, taxRates) {
    const orgId = state.orgId;
    const body = h(`<div>
      <div class="inline-row">
        <div><label>Type</label><select id="type"><option value="invoice">Sales invoice</option><option value="bill">Supplier bill</option></select></div>
        <div><label>Contact</label><select id="contact">${contacts.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      </div>
      <label>Description</label><input id="desc" placeholder="e.g. Monthly retainer" />
      <div class="inline-row">
        <div><label>Account</label><select id="acc">${accounts.filter((a) => a.type === 'income' || a.type === 'expense').map((a) => `<option value="${a.id}">${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select></div>
        <div><label>Amount (net £)</label><input id="amount" type="number" step="0.01" min="0" /></div>
      </div>
      <div class="inline-row">
        <div><label>VAT</label><select id="tax"><option value="">No VAT</option>${taxRates.filter((t) => t.rate > 0).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
        <div><label>Frequency</label><select id="freq"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly" selected>Monthly</option><option value="quarterly">Quarterly</option></select></div>
      </div>
      <label>First / next date</label><input id="next" type="date" value="${today()}" />
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Save template</button>');
    const { close } = modal('New recurring template', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${orgId}/recurring`, { method: 'POST', body: JSON.stringify({
          type: body.querySelector('#type').value, contactId: body.querySelector('#contact').value, description: body.querySelector('#desc').value,
          accountId: body.querySelector('#acc').value, amount: Number(body.querySelector('#amount').value), taxRateId: body.querySelector('#tax').value || null,
          frequency: body.querySelector('#freq').value, nextDate: body.querySelector('#next').value }) });
        close(); flash('Template saved'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- products & services ----------
  async function renderItems(c) {
    const orgId = state.orgId;
    const [itemsRes, { accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/items`), api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    const items = itemsRes.items, method = itemsRes.method, stockTotal = itemsRes.stockTotal;
    c.innerHTML = '';
    const tracked = items.filter((i) => i.trackQty).length;
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span class="muted-inline" style="flex:1">Save the products and services you sell, then add them to invoices and quotes in one click.</span>
      ${tracked ? `<span class="pill liability">Stock valued ${method === 'fifo' ? 'FIFO' : 'AVCO'}</span><span><b>${money(stockTotal)}</b> <span class="subtle">stock value</span></span>` : ''}</div></div>`));
    const card = h(`<div class="card"><div class="card-head"><h2>Products &amp; services</h2><div class="spacer"></div>
      <button class="btn small" id="new">${icon('plus', 14)} New item</button></div>
      <div class="card-body flush"><table><thead><tr><th>Code</th><th>Name</th><th>Account</th><th>Tax</th><th class="num">Price</th><th class="num">Stock</th><th class="num">Value</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    const rateName = (id) => taxRates.find((t) => t.id === id)?.name || '—';
    if (!items.length) tb.appendChild(h('<tr><td colspan="8" class="empty">No products or services yet.</td></tr>'));
    items.forEach((i) => {
      const low = i.trackQty && i.qtyOnHand <= (i.reorderLevel || 0);
      const stock = i.trackQty ? `${i.qtyOnHand}${low ? ' <span class="pill bad">low</span>' : ''}` : '<span class="subtle">—</span>';
      const val = i.trackQty ? `${money(i.stockValue || 0)}<br><span class="subtle" style="font-size:11px">@ ${money(i.avgCost || 0)}</span>` : '<span class="subtle">—</span>';
      const row = h(`<tr><td>${esc(i.code || '—')}</td><td><b>${esc(i.name)}</b>${i.description ? `<br><span class="subtle" style="font-size:12px">${esc(i.description)}</span>` : ''}</td>
        <td class="subtle">${esc(i.accountName || '—')}</td><td class="subtle">${esc(rateName(i.taxRateId))}</td><td class="num">${money(i.salePrice)}</td>
        <td class="num">${stock}</td><td class="num">${val}</td><td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const menuItems = [['Edit', () => openItemModal(accounts, taxRates, i)]];
      if (i.trackQty) menuItems.push(['Adjust stock', () => openStockAdjust(i)]);
      menuItems.push(['Delete', async () => { if (confirm(`Delete ${i.name}?`)) { await api(`/api/orgs/${orgId}/items/${i.id}`, { method: 'DELETE' }); renderApp(); } }, true]);
      const more = h('<button class="btn ghost small" aria-label="Actions" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems, true); });
      act.append(more);
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openItemModal(accounts, taxRates, null));
  }

  function openItemModal(accounts, taxRates, item) {
    const orgId = state.orgId;
    const editing = !!item;
    const incomeFirst = accounts.filter((a) => a.type === 'income').concat(accounts.filter((a) => a.type !== 'income'));
    const accOpts = `<option value="">— choose —</option>` + incomeFirst.map((a) => `<option value="${a.id}" ${editing && a.id === item.saleAccountId ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const taxOpts = `<option value="">No tax</option>` + taxRates.map((t) => `<option value="${t.id}" ${editing && t.id === item.taxRateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const body = h(`<div>
      <div class="inline-row"><div><label>Code (optional)</label><input id="code" value="${editing ? esc(item.code) : ''}" /></div>
        <div><label>Name</label><input id="name" value="${editing ? esc(item.name) : ''}" placeholder="e.g. Flat white" /></div></div>
      <label>Description (optional)</label><input id="desc" value="${editing ? esc(item.description) : ''}" />
      <div class="inline-row"><div><label>Sale price (£)</label><input id="price" type="number" step="0.01" min="0" value="${editing ? item.salePrice : ''}" /></div>
        <div><label>VAT rate</label><select id="tax">${taxOpts}</select></div></div>
      <label>Sales category</label><select id="acc">${accOpts}<option value="__newcat">+ New category…</option></select>
      <div id="newCat" style="display:none;margin-top:8px;padding:11px 12px;border:1px dashed var(--cream-3);border-radius:10px;background:#fbfaf7">
        <input id="ncatName" placeholder="Category name, e.g. Hot drinks" />
        <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn small" id="ncatAdd">Add category</button><button type="button" class="btn ghost small" id="ncatCancel">Cancel</button></div>
        <div class="err" id="ncatErr" style="margin-top:6px"></div>
      </div>
      <div class="muted-inline" style="margin-top:6px">The VAT rate and category set here are applied automatically whenever you add this to an invoice or quote.</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;font-weight:600"><input type="checkbox" id="track" ${editing && item.trackQty ? 'checked' : ''} style="width:auto" /> Track stock quantity</label>
      <div class="inline-row" id="stockRow" style="${editing && item.trackQty ? '' : 'display:none'}">
        <div><label>Quantity on hand</label><input id="qty" type="number" step="1" value="${editing ? (item.qtyOnHand || 0) : 0}" ${editing ? 'disabled title="Adjust via stock movements"' : ''} /></div>
        <div><label>Unit cost (£)</label><input id="cost" type="number" step="0.01" value="${editing ? (item.costPrice || 0) : 0}" /></div>
        <div><label>Reorder level</label><input id="reorder" type="number" step="1" value="${editing ? (item.reorderLevel || 0) : 0}" /></div>
      </div>
      <div class="err" id="err"></div></div>`);
    body.querySelector('#track').addEventListener('change', (e) => { body.querySelector('#stockRow').style.display = e.target.checked ? 'flex' : 'none'; });

    // Inline create a sales category (an income account) without leaving the modal
    const accSel = body.querySelector('#acc');
    const newCat = body.querySelector('#newCat');
    let prevAcc = accSel.value;
    accSel.addEventListener('change', () => {
      if (accSel.value === '__newcat') { newCat.style.display = 'block'; body.querySelector('#ncatName').focus(); }
      else { newCat.style.display = 'none'; prevAcc = accSel.value; }
    });
    body.querySelector('#ncatCancel').addEventListener('click', () => { newCat.style.display = 'none'; accSel.value = prevAcc; });
    body.querySelector('#ncatAdd').addEventListener('click', async () => {
      const nm = body.querySelector('#ncatName').value.trim();
      const cErr = body.querySelector('#ncatErr'); cErr.textContent = '';
      if (!nm) { cErr.textContent = 'Enter a category name.'; return; }
      // Reuse an existing income account with the same name (case-insensitive)
      const existingAcc = accounts.find((a) => a.type === 'income' && a.name.toLowerCase() === nm.toLowerCase());
      try {
        let account = existingAcc;
        if (!account) {
          const used = new Set(accounts.map((a) => String(a.code)));
          const incs = accounts.filter((a) => a.type === 'income').map((a) => parseInt(a.code, 10)).filter((n) => !isNaN(n));
          let n = incs.length ? Math.max(...incs) + 1 : 4000;
          while (used.has(String(n))) n++;
          ({ account } = await api(`/api/orgs/${orgId}/accounts`, { method: 'POST', body: JSON.stringify({ code: String(n), name: nm, type: 'income' }) }));
          accounts.push(account);
          accSel.insertBefore(h(`<option value="${account.id}">${esc(account.code)} · ${esc(account.name)}</option>`), accSel.querySelector('option[value="__newcat"]'));
        }
        accSel.value = account.id; prevAcc = account.id;
        newCat.style.display = 'none';
        flash('Category added');
      } catch (e) { cErr.textContent = e.message; }
    });

    const save = h(`<button class="btn">${editing ? 'Save' : 'Add item'}</button>`);
    const { close } = modal(editing ? 'Edit item' : 'New product / service', body, save);
    save.addEventListener('click', async () => {
      const payload = { code: body.querySelector('#code').value, name: body.querySelector('#name').value, description: body.querySelector('#desc').value,
        salePrice: Number(body.querySelector('#price').value), saleAccountId: body.querySelector('#acc').value || null, taxRateId: body.querySelector('#tax').value || null,
        trackQty: body.querySelector('#track').checked, qtyOnHand: Number(body.querySelector('#qty').value || 0), reorderLevel: Number(body.querySelector('#reorder').value || 0), costPrice: Number(body.querySelector('#cost').value || 0) };
      try {
        await api(`/api/orgs/${orgId}/items${editing ? '/' + item.id : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        close(); flash(editing ? 'Item saved' : 'Item added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function openStockAdjust(item) {
    const body = h(`<div><p class="muted-inline">Adjust stock for <b>${esc(item.name)}</b>. Currently on hand: <b>${item.qtyOnHand}</b>.</p>
      <div class="inline-row">
        <div><label>Add (+) or remove (−) quantity</label><input id="delta" type="number" step="1" placeholder="e.g. 20 or -5" /></div>
        <div><label>Unit cost (£, for stock in)</label><input id="cost" type="number" step="0.01" value="${item.costPrice || 0}" /></div>
      </div>
      <div class="muted-inline">Stock coming in uses the unit cost above. Stock going out is valued automatically by your ${'' /* method */}chosen method.</div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Adjust stock</button>');
    const { close } = modal('Adjust stock', body, save);
    save.addEventListener('click', async () => {
      try { await api(`/api/orgs/${state.orgId}/items/${item.id}/adjust`, { method: 'POST', body: JSON.stringify({ delta: Number(body.querySelector('#delta').value), unitCost: Number(body.querySelector('#cost').value || 0) }) }); close(); flash('Stock adjusted'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- contacts ----------
  async function renderContacts(c) {
    const orgId = state.orgId;
    const { contacts } = await api(`/api/orgs/${orgId}/contacts`);
    c.innerHTML = '';
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Customers &amp; suppliers</h2><div class="spacer"></div>
          <button class="btn small" id="new">+ New contact</button></div>
        <div class="card-body flush"><table><thead><tr><th>Name</th><th>Type</th><th>Email</th></tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    if (!contacts.length) tb.appendChild(h('<tr><td colspan="3" class="empty">No contacts yet.</td></tr>'));
    contacts.forEach((x) => {
      const row = h(`<tr class="drill" title="View statement"><td>${esc(x.name)}</td>
        <td><span class="pill ${x.kind === 'supplier' ? 'expense' : 'income'}">${esc(x.kind)}</span></td>
        <td class="subtle">${esc(x.email || '—')}</td></tr>`);
      row.addEventListener('click', () => openContactStatement(x.id));
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', openContactModal);
  }

  function statementDocHTML(r, co) {
    const rows = r.docs.map((d) => `<tr><td>${esc(d.number)}</td><td>${esc(d.issueDate)}</td><td>${esc(d.dueDate)}</td><td>${d.status === 'paid' ? 'Paid' : d.status === 'awaiting_payment' ? 'Outstanding' : 'Draft'}</td><td class="r">${money(d.total)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Statement ${esc(r.contact.name)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600&display=swap">
    <style>*{box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:#1A1A18;margin:0;padding:48px;font-size:13.5px}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #B8922A;padding-bottom:20px;margin-bottom:24px}
    .brand{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600}h1{font-size:18px;letter-spacing:2px;color:#B8922A;margin:0}
    .muted{color:#6B6860}.r{text-align:right}table{width:100%;border-collapse:collapse;margin-top:14px}
    th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#6B6860;text-align:left;border-bottom:2px solid #1A1A18;padding:8px 10px}th.r{text-align:right}
    td{padding:9px 10px;border-bottom:1px solid #E4DFD4}.tot{margin-top:16px;text-align:right;font-size:16px;font-weight:700}</style></head><body>
    <div class="top"><div>${co.logoUrl ? `<img src="${co.logoUrl}" style="max-height:56px;margin-bottom:10px;display:block"/>` : ''}<div class="brand">${esc(co.name)}</div><div class="muted" style="white-space:pre-line">${esc(co.address)}</div></div>
      <div class="r"><h1>STATEMENT</h1><div class="muted">${today()}</div></div></div>
    <div class="muted" style="margin-bottom:6px">Account:</div><div style="font-weight:700;font-size:15px">${esc(r.contact.name)}</div>
    <table><thead><tr><th>Document</th><th>Issued</th><th>Due</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">Outstanding balance: ${money(r.outstanding)}</div></body></html>`;
  }

  async function openContactStatement(contactId) {
    const [r, { company }] = await Promise.all([
      api(`/api/orgs/${state.orgId}/contacts/${contactId}/statement`),
      api(`/api/orgs/${state.orgId}/company`),
    ]);
    company.logoUrl = currentOrg().hasLogo ? `/api/orgs/${state.orgId}/logo` : '';
    const statusPill = { draft: 'expense', awaiting_payment: 'liability', paid: 'ok' };
    const statusLabel = { draft: 'Draft', awaiting_payment: 'Outstanding', paid: 'Paid' };
    const body = h(`<div>
      <div style="display:flex;gap:24px;margin-bottom:14px">
        <div><div class="subtle">Total billed</div><div style="font-family:var(--font-serif);font-size:20px">${money(r.billed)}</div></div>
        <div><div class="subtle">Paid</div><div style="font-family:var(--font-serif);font-size:20px">${money(r.paid)}</div></div>
        <div><div class="subtle">Outstanding</div><div style="font-family:var(--font-serif);font-size:20px;color:${r.outstanding > 0 ? 'var(--danger)' : 'var(--brand-dark)'}">${money(r.outstanding)}</div></div>
      </div>
      <div style="border:1px solid var(--cream-3);border-radius:12px;overflow:hidden">
        <table><thead><tr><th>Number</th><th>Issued</th><th>Due</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody id="dr"></tbody></table>
      </div></div>`);
    const tb = body.querySelector('#dr');
    if (!r.docs.length) tb.appendChild(h('<tr><td colspan="5" class="empty">No invoices or bills yet.</td></tr>'));
    r.docs.forEach((d) => tb.appendChild(h(`<tr><td><b>${esc(d.number)}</b> <span class="subtle">${d.type}</span></td>
      <td>${esc(d.issueDate)}</td><td>${esc(d.dueDate)}</td><td class="num">${money(d.total)}</td>
      <td><span class="pill ${statusPill[d.status]}">${statusLabel[d.status]}</span></td></tr>`)));
    const pdfBtn = h(`<button class="btn">${icon('sales', 15)} Download statement</button>`);
    modal(`${r.contact.name} — statement`, body, pdfBtn);
    body.closest('.modal').style.maxWidth = '720px';
    pdfBtn.addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) { flash('Allow pop-ups to view the PDF', true); return; }
      w.document.write(statementDocHTML(r, company)); w.document.close(); w.focus();
      setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
    });
  }

  function openContactModal() {
    const body = h(`<div>
      <label>Name</label><input id="name" placeholder="Business or person" />
      <div class="inline-row">
        <div><label>Type</label><select id="kind"><option value="customer">Customer</option><option value="supplier">Supplier</option></select></div>
        <div><label>Email (optional)</label><input id="email" type="email" /></div>
      </div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Add contact</button>');
    const { close } = modal('New contact', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/contacts`, { method: 'POST', body: JSON.stringify({
          name: body.querySelector('#name').value, kind: body.querySelector('#kind').value, email: body.querySelector('#email').value }) });
        close(); flash('Contact added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- month-end checklist ----------
  async function renderMonthEnd(c) {
    const orgId = state.orgId;
    const dash = await api(`/api/orgs/${orgId}/dashboard`);
    const ck = dash.checks;
    const items = [
      { ok: ck.unreconciled === 0, label: 'Bank reconciled', detail: ck.unreconciled ? `${ck.unreconciled} unreconciled line${ck.unreconciled > 1 ? 's' : ''}` : 'All movements reconciled', view: 'reconcile' },
      { ok: ck.draftInvoices === 0, label: 'Sales invoices finalised', detail: ck.draftInvoices ? `${ck.draftInvoices} draft invoice${ck.draftInvoices > 1 ? 's' : ''} to approve` : 'No drafts waiting', view: 'invoices' },
      { ok: ck.draftBills === 0, label: 'Supplier bills finalised', detail: ck.draftBills ? `${ck.draftBills} draft bill${ck.draftBills > 1 ? 's' : ''} to approve` : 'No drafts waiting', view: 'bills' },
      { ok: ck.overdueInvoices === 0, label: 'Overdue invoices chased', detail: ck.overdueInvoices ? `${ck.overdueInvoices} overdue` : 'Nothing overdue', view: 'invoices' },
      { ok: ck.overdueBills === 0, label: 'Overdue bills paid', detail: ck.overdueBills ? `${ck.overdueBills} overdue` : 'Nothing overdue', view: 'bills' },
      { ok: ck.openQueries === 0, label: 'Client queries resolved', detail: ck.openQueries ? `${ck.openQueries} awaiting reply` : 'No open queries', view: 'queries' },
      { ok: ck.recurringDue === 0, label: 'Recurring invoices generated', detail: ck.recurringDue ? `${ck.recurringDue} due to generate` : 'Up to date', view: 'recurring' },
      { ok: true, label: 'VAT position reviewed', detail: dash.vat.refund > 0 ? `Refund position ${money(dash.vat.refund)}` : `Owed position ${money(dash.vat.owed)}`, view: 'vat' },
    ];
    const done = items.filter((i) => i.ok).length;
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:18px 24px;display:flex;align-items:center;gap:16px">
      <div style="font-family:var(--font-serif);font-size:30px;color:${done === items.length ? 'var(--brand-dark)' : 'var(--gold)'}">${done}/${items.length}</div>
      <div><div style="font-weight:600">Month-end checklist</div><div class="muted-inline">${done === items.length ? 'Everything looks ready to close the period.' : 'A few things still need attention before closing.'}</div></div></div></div>`));
    const card = h('<div class="card"><div class="card-body flush"><div id="list"></div></div></div>');
    const list = card.querySelector('#list');
    items.forEach((it) => {
      const row = h(`<div style="display:flex;align-items:center;gap:14px;padding:14px 24px;border-bottom:1px solid var(--line)">
        <span style="font-size:20px;color:${it.ok ? 'var(--brand-dark)' : 'var(--warn)'}">${it.ok ? '✓' : '○'}</span>
        <div style="flex:1"><div style="font-weight:600">${esc(it.label)}</div><div class="muted-inline">${esc(it.detail)}</div></div>
        ${it.ok ? '' : '<button class="btn secondary small">Go →</button>'}</div>`);
      const btn = row.querySelector('button');
      if (btn) btn.addEventListener('click', () => { state.view = it.view; renderApp(); });
      list.appendChild(row);
    });
    c.appendChild(card);
  }

  // ---------- AI assistant ----------
  async function renderAI(c) {
    const orgId = state.orgId;
    const [{ suggestions }, { accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/ai/suggestions`), api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:18px 24px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px;color:var(--gold)">✦</span>
        <div><div style="font-family:var(--font-serif);font-size:20px">Little Lumi's transaction review</div>
        <div class="muted-inline">Little Lumi looks for repeating descriptions in your ledger and proposes a categorisation rule for each. Nothing is applied until you approve it.</div></div>
      </div></div></div>`));

    if (!suggestions.length) {
      c.appendChild(h(`<div class="card"><div class="card-body empty">Nothing to suggest right now — every recurring transaction already has a rule, or there isn't enough history yet.</div></div>`));
      return;
    }

    const accOpts = (sel) => accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const taxOpts = (sel) => `<option value="">No tax</option>` + taxRates.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    suggestions.forEach((s) => {
      const vatNote = s.taxSource === 'history' ? 'based on past entries' : 'UK VAT default — please confirm';
      const card = h(`
        <div class="card">
          <div class="card-body">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span style="font-size:18px;color:var(--gold);margin-top:2px">✦</span>
              <div style="flex:1">
                <div style="font-size:15px;margin-bottom:4px">Found <b>${s.count}</b> transaction${s.count > 1 ? 's' : ''} matching “<b>${esc(s.match)}</b>”.</div>
                <div class="muted-inline">Examples: ${s.samples.map((x) => esc(x)).join(' · ')}</div>
                <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span class="pill ${s.accountType}">${s.accountType}</span>
                  <span>Category:</span>
                  <select class="aiAcc" style="width:auto;min-width:220px">${accOpts(s.accountId)}</select>
                  <span class="pill ok">${s.confidence}% confident</span>
                </div>
                <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span>VAT rate:</span>
                  <select class="aiTax" style="width:auto;min-width:160px">${taxOpts(s.taxRateId)}</select>
                  <span class="pill ${s.taxSource === 'history' ? 'ok' : 'liability'}">${esc(vatNote)}</span>
                </div>
                <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-weight:500">
                  <input type="checkbox" class="aiRecat" checked style="width:auto" />
                  Also recategorise the ${s.count} existing transaction${s.count > 1 ? 's' : ''}
                </label>
              </div>
            </div>
          </div>
          <div class="modal-foot" style="border-top:1px solid var(--line)">
            <button class="btn secondary aiDismiss">Dismiss</button>
            <button class="btn aiApprove">Approve &amp; create rule</button>
          </div>
        </div>`);
      card.querySelector('.aiApprove').addEventListener('click', async () => {
        try {
          const r = await api(`/api/orgs/${orgId}/ai/apply`, { method: 'POST', body: JSON.stringify({
            match: s.match, accountId: card.querySelector('.aiAcc').value, kind: s.kind,
            taxRateId: card.querySelector('.aiTax').value || null,
            recategorize: card.querySelector('.aiRecat').checked }) });
          flash(`Rule created${r.recategorized ? ` · ${r.recategorized} recategorised` : ''}`);
          renderApp();
        } catch (e) { flash(e.message, true); }
      });
      card.querySelector('.aiDismiss').addEventListener('click', async () => {
        await api(`/api/orgs/${orgId}/ai/dismiss`, { method: 'POST', body: JSON.stringify({ match: s.match }) });
        flash('Dismissed'); renderApp();
      });
      c.appendChild(card);
    });
  }

  // ---------- categorisation rules ----------
  async function renderRules(c) {
    const orgId = state.orgId;
    const [{ rules }, { accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/rules`), api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px">
      <span class="muted-inline">Rules auto-assign an account (and tax) when an imported bank line's description contains the matching text — e.g. a supplier or customer name. They're applied automatically in <b>Import bank CSV</b>.</span></div></div>`));
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Rules</h2><div class="spacer"></div><button class="btn small" id="new">+ New rule</button></div>
        <div class="card-body flush"><table><thead><tr>
          <th>When description contains</th><th>Applies to</th><th>Account</th><th>Tax</th><th></th>
        </tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    const rateName = (id) => taxRates.find((t) => t.id === id)?.name || '—';
    if (!rules.length) tb.appendChild(h('<tr><td colspan="5" class="empty">No rules yet.</td></tr>'));
    rules.forEach((r) => {
      const row = h(`<tr><td><b>${esc(r.match)}</b></td><td class="subtle">${esc(r.kind)}</td>
        <td>${esc(r.accountCode || '')} ${esc(r.accountName || '')}</td><td class="subtle">${esc(rateName(r.taxRateId))}</td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const edit = h('<button class="btn ghost small">Edit</button>');
      edit.addEventListener('click', () => openRuleModal(accounts, taxRates, r));
      const del = h('<button class="btn ghost small" style="color:var(--danger)">Delete</button>');
      del.addEventListener('click', async () => { if (confirm(`Delete rule "${r.match}"?`)) { await api(`/api/orgs/${orgId}/rules/${r.id}`, { method: 'DELETE' }); renderApp(); } });
      act.append(edit, del);
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openRuleModal(accounts, taxRates, null));
  }

  function openRuleModal(accounts, taxRates, rule) {
    const orgId = state.orgId;
    const editing = !!rule;
    const accOpts = accounts.map((a) => `<option value="${a.id}" ${editing && a.id === rule.accountId ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const taxOpts = `<option value="">No tax</option>` + taxRates.map((t) => `<option value="${t.id}" ${editing && t.id === rule.taxRateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const kindOpt = (v, l) => `<option value="${v}" ${editing && rule.kind === v ? 'selected' : ''}>${l}</option>`;
    const body = h(`<div>
      <label>When description contains</label><input id="match" placeholder="e.g. Green Beans" value="${editing ? esc(rule.match) : ''}" />
      <div class="inline-row">
        <div><label>Applies to</label><select id="kind">${kindOpt('any', 'Any')}${kindOpt('spend', 'Money out')}${kindOpt('receive', 'Money in')}</select></div>
        <div><label>Tax</label><select id="tax">${taxOpts}</select></div>
      </div>
      <label>Category account</label><select id="acc">${accOpts}</select>
      <div class="err" id="err"></div></div>`);
    const save = h(`<button class="btn">${editing ? 'Save changes' : 'Save rule'}</button>`);
    const { close } = modal(editing ? 'Edit rule' : 'New rule', body, save);
    save.addEventListener('click', async () => {
      const payload = { match: body.querySelector('#match').value, accountId: body.querySelector('#acc').value,
        taxRateId: body.querySelector('#tax').value || null, kind: body.querySelector('#kind').value };
      try {
        await api(`/api/orgs/${orgId}/rules${editing ? '/' + rule.id : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        close(); flash(editing ? 'Rule updated' : 'Rule saved'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- client queries ----------
  async function renderQueries(c) {
    const orgId = state.orgId;
    const { queries } = await api(`/api/orgs/${orgId}/queries`);
    const bk = isBookkeeper();
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px">
      <span class="muted-inline">${bk ? 'Ask your client about anything that needs explaining — they\'ll see it here and can reply (and attach a receipt in Documents). You can also raise a query from any transaction.' : 'Your bookkeeper has questions about a few items. A quick reply helps keep your books accurate — you can upload any receipts in Documents.'}</span></div></div>`));
    const card = h(`<div class="card">
      <div class="card-head"><h2>Queries</h2><div class="spacer"></div>${bk ? '<button class="btn small" id="new">+ New query</button>' : ''}</div>
      <div class="card-body flush"><div id="list"></div></div></div>`);
    const list = card.querySelector('#list');
    if (!queries.length) list.appendChild(h('<div class="empty">No queries — all clear.</div>'));
    queries.forEach((q) => {
      const row = h(`<div style="padding:16px 22px;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span class="pill ${q.status === 'open' ? 'liability' : 'ok'}">${q.status === 'open' ? 'Awaiting reply' : 'Answered'}</span>
          <div style="flex:1">
            <div style="font-weight:600">${esc(q.question)}</div>
            ${q.txn ? `<div class="muted-inline">Re: ${esc(q.txn.date)} · ${esc(q.txn.description)}</div>` : ''}
            <div class="muted-inline">Asked by ${esc(q.askedByName)}</div>
            ${q.answer ? `<div style="margin-top:8px;padding:10px 12px;background:var(--cream-2);border-radius:10px"><b>${esc(q.answeredByName)}:</b> ${esc(q.answer)}</div>` : ''}
          </div>
          <div class="actions"></div>
        </div></div>`);
      const act = row.querySelector('.actions');
      if (q.status === 'open') {
        const ans = h('<button class="btn small">Reply</button>');
        ans.addEventListener('click', () => openAnswer(q));
        act.appendChild(ans);
      }
      if (bk) {
        const del = h('<button class="btn ghost small" style="color:var(--danger);margin-left:6px">✕</button>');
        del.addEventListener('click', async () => { await api(`/api/orgs/${orgId}/queries/${q.id}`, { method: 'DELETE' }); renderApp(); });
        act.appendChild(del);
      }
      list.appendChild(row);
    });
    c.appendChild(card);
    const nb = card.querySelector('#new');
    if (nb) nb.addEventListener('click', () => openNewQuery(null));
  }

  function openAnswer(q) {
    const body = h(`<div><p class="muted-inline"><b>${esc(q.question)}</b></p>
      <label>Your reply</label><textarea id="a" rows="3" style="width:100%;padding:11px 14px;border:1px solid var(--cream-3);border-radius:12px;font-family:inherit;font-size:15px"></textarea>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Send reply</button>');
    const { close } = modal('Reply to query', body, save);
    save.addEventListener('click', async () => {
      try { await api(`/api/orgs/${state.orgId}/queries/${q.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: body.querySelector('#a').value }) }); close(); flash('Reply sent'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function openNewQuery(txn) {
    const body = h(`<div>
      ${txn ? `<p class="muted-inline">About: <b>${esc(txn.date)} · ${esc(txn.description)}</b></p>` : ''}
      <label>Question for the client</label><textarea id="q" rows="3" placeholder="e.g. What was the £240 payment to Adobe for?" style="width:100%;padding:11px 14px;border:1px solid var(--cream-3);border-radius:12px;font-family:inherit;font-size:15px"></textarea>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Send to client</button>');
    const { close } = modal('Ask the client', body, save);
    save.addEventListener('click', async () => {
      try { await api(`/api/orgs/${state.orgId}/queries`, { method: 'POST', body: JSON.stringify({ transactionId: txn ? txn.id : null, question: body.querySelector('#q').value }) }); close(); flash('Query sent'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- document inbox (upload portal) ----------
  async function renderInbox(c) {
    const orgId = state.orgId;
    const { inbox } = await api(`/api/orgs/${orgId}/inbox`);
    c.innerHTML = '';
    const drop = h(`
      <div class="card">
        <div class="card-head"><h2>Document inbox</h2><div class="spacer"></div></div>
        <div class="card-body">
          <p class="muted-inline">Drop in invoices, receipts or statements — they wait here until you file them against a transaction. A simple place to collect paperwork before it's matched.</p>
          <div id="dropzone" style="margin-top:14px;border:2px dashed var(--cream-3);border-radius:16px;padding:30px;text-align:center;background:var(--cream);cursor:pointer;transition:border-color .15s,background .15s">
            <div style="color:var(--gold);display:flex;justify-content:center">${icon('import', 34)}</div>
            <div style="font-weight:600;margin-top:8px">Click to choose files, or drag &amp; drop here</div>
            <div class="muted-inline">PDF, images, etc. You can upload several at once.</div>
            <input type="file" id="files" multiple style="display:none" />
          </div>
          <div class="err" id="err"></div>
        </div>
      </div>`);
    c.appendChild(drop);
    const dz = drop.querySelector('#dropzone');
    const input = drop.querySelector('#files');
    const doUpload = async (fileList) => {
      if (!fileList || !fileList.length) return;
      const fd = new FormData();
      [...fileList].forEach((f) => fd.append('documents', f));
      try {
        const res = await fetch(`/api/orgs/${orgId}/inbox`, { method: 'POST', body: fd, credentials: 'same-origin' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
        const j = await res.json(); flash(`Uploaded ${j.uploaded} document${j.uploaded === 1 ? '' : 's'}`); renderApp();
      } catch (e) { drop.querySelector('#err').textContent = e.message; }
    };
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => doUpload(input.files));
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--gold)'; dz.style.background = 'var(--gold-bg)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--cream-3)'; dz.style.background = 'var(--cream)'; });
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--cream-3)'; dz.style.background = 'var(--cream)'; doUpload(e.dataTransfer.files); });

    const grid = h(`<div class="card"><div class="card-head"><h2>Waiting to be filed (${inbox.length})</h2></div><div class="card-body"><div id="items" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px"></div></div></div>`);
    const items = grid.querySelector('#items');
    if (!inbox.length) items.appendChild(h('<div class="empty" style="grid-column:1/-1">Nothing waiting — your inbox is clear.</div>'));
    inbox.forEach((d) => {
      const isImg = (d.mimetype || '').startsWith('image/');
      const kb = Math.max(1, Math.round(d.size / 1024));
      const card = h(`<div style="border:1px solid var(--cream-3);border-radius:16px;overflow:hidden;background:#fff">
        <a href="/api/orgs/${orgId}/inbox/${d.id}/file" target="_blank" style="display:block;height:120px;background:var(--cream-2);display:flex;align-items:center;justify-content:center">
          ${isImg ? `<img src="/api/orgs/${orgId}/inbox/${d.id}/file" style="max-height:120px;max-width:100%;object-fit:cover"/>` : `<span style="color:var(--muted)">${icon('sales', 40)}</span>`}
        </a>
        <div style="padding:12px 14px">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.originalName)}">${esc(d.originalName)}</div>
          <div class="muted-inline">${kb} KB · ${esc(d.uploadedAt.slice(0, 10))}</div>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            <button class="btn small attach">File</button>
            <button class="btn secondary small newtx">New txn</button>
            <button class="btn ghost small remove" style="color:var(--danger)">✕</button>
          </div>
        </div></div>`);
      card.querySelector('.attach').addEventListener('click', () => openAttachModal(d));
      card.querySelector('.newtx').addEventListener('click', () => openTransactionModal(null, { attachInboxId: d.id }));
      card.querySelector('.remove').addEventListener('click', async () => { if (confirm('Remove this document?')) { await api(`/api/orgs/${orgId}/inbox/${d.id}`, { method: 'DELETE' }); renderApp(); } });
      items.appendChild(card);
    });
    c.appendChild(grid);
  }

  async function openAttachModal(doc) {
    const orgId = state.orgId;
    const { transactions } = await api(`/api/orgs/${orgId}/transactions`);
    const recent = transactions.filter((t) => t.status !== 'void').slice(0, 100);
    const body = h(`<div>
      <p class="muted-inline">Attach <b>${esc(doc.originalName)}</b> to an existing transaction.</p>
      <label>Transaction</label>
      <select id="txn">${recent.map((t) => `<option value="${t.id}">${esc(t.date)} · ${esc(t.description)} · ${money(t.total)}</option>`).join('')}</select>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Attach</button>');
    const { close } = modal('File document', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${orgId}/inbox/${doc.id}/attach`, { method: 'POST', body: JSON.stringify({ transactionId: body.querySelector('#txn').value }) });
        close(); flash('Document filed'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- cashflow forecast ----------
  async function renderCashflow(c) {
    const orgId = state.orgId;
    let unit = 'week', horizon = 12;
    const horizonOpts = () => unit === 'week'
      ? [[8, '8 weeks'], [12, '12 weeks'], [26, '26 weeks'], [52, '52 weeks']]
      : [[3, '3 months'], [6, '6 months'], [12, '12 months']];
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/cashflow?unit=${unit}&horizon=${horizon}`);
      c.innerHTML = '';
      const unitWord = unit === 'week' ? 'week' : 'month';
      // Balance line chart with a likely-range band, zero baseline and lowest-point marker.
      const vals = [r.openingCash, ...r.periods.map((p) => p.closing)];
      const lowVals = [r.openingCash, ...r.periods.map((p) => p.closingLow)];
      const highVals = [r.openingCash, ...r.periods.map((p) => p.closingHigh)];
      const allV = [...vals, ...lowVals, ...highVals, 0];
      const min = Math.min(...allV), max = Math.max(...allV, 1);
      const W = 760, H = 170, pad = 10;
      const x = (i) => pad + (i * (W - 2 * pad)) / (vals.length - 1 || 1);
      const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
      const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      const highPts = highVals.map((v, i) => `${x(i)},${y(v)}`);
      const lowPtsA = lowVals.map((v, i) => `${x(i)},${y(v)}`);
      const band = highPts.join(' ') + ' ' + lowPtsA.slice().reverse().join(' ');
      const lowNeg = r.lowest.balance < 0;

      // Headline cards
      c.appendChild(h(`<div class="stat-cards">
        <div class="stat"><div class="label">Cash today</div><div class="value">${money(r.openingCash)}</div></div>
        <div class="stat"><div class="label">Projected in ${horizon} ${unitWord}s</div><div class="value ${r.closingCash < 0 ? 'neg' : 'pos'}">${money(r.closingCash)}</div><div class="subtle">likely ${money(r.closingLow)} – ${money(r.closingHigh)}</div></div>
        <div class="stat"><div class="label">Lowest point</div><div class="value ${lowNeg ? 'neg' : ''}">${money(r.lowest.balance)}</div><div class="subtle">around ${esc(r.lowest.label)} · worst case ${money(r.lowestLow)}</div></div>
      </div>`));
      if (lowNeg) c.appendChild(h(`<div class="card" style="border-left:4px solid var(--danger);background:#f6e9e9"><div class="card-body" style="padding:14px 20px;display:flex;align-items:center;gap:10px"><span style="color:var(--danger);flex:0 0 auto">${iconInline('alert', 18)}</span><span>Cash is projected to go <b>negative</b> (${money(r.lowest.balance)}) around <b>${esc(r.lowest.label)}</b>. Consider chasing invoices or spreading payments.</span></div></div>`));

      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar"><h2>Cashflow forecast</h2><div class="spacer"></div>
            <label>View</label><select id="unit"><option value="week" ${unit === 'week' ? 'selected' : ''}>Weekly</option><option value="month" ${unit === 'month' ? 'selected' : ''}>Monthly</option></select>
            <label>Horizon</label><select id="hz">${horizonOpts().map(([v, l]) => `<option value="${v}" ${v === horizon ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="card-body">
            <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
              <polygon points="${band}" fill="var(--gold-bg)"/>
              <polyline points="${highPts.join(' ')}" fill="none" stroke="var(--gold-lt)" stroke-width="1" stroke-dasharray="3 3" opacity=".75"/>
              <polyline points="${lowPtsA.join(' ')}" fill="none" stroke="var(--gold-lt)" stroke-width="1" stroke-dasharray="3 3" opacity=".75"/>
              <line x1="${pad}" y1="${y(0)}" x2="${W - pad}" y2="${y(0)}" stroke="var(--cream-3)" stroke-dasharray="4 3"/>
              <polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="2.5"/>
              ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${v === r.lowest.balance ? 4.5 : 2.5}" fill="${v < 0 ? 'var(--danger)' : 'var(--gold)'}"/>`).join('')}
            </svg>
            <div class="muted-inline" style="margin-top:6px"><span style="display:inline-block;width:10px;height:10px;background:var(--gold-bg);border:1px solid var(--gold-lt);border-radius:2px;vertical-align:middle"></span> Shaded band = likely range (25th–75th percentile of your historical weekly variation${r.history.samples ? `, ${r.history.samples} weeks` : ''}).</div>
          </div>
          <div class="card-body flush"><table><thead><tr>
            <th>${unit === 'week' ? 'Week of' : 'Month'}</th><th class="num">Opening</th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Net change</th><th class="num">Closing balance</th><th class="num">Likely range</th>
          </tr></thead><tbody id="rows"></tbody></table></div>
        </div>`);
      const tb = card.querySelector('#rows');
      r.periods.forEach((p) => tb.appendChild(h(`<tr>
        <td><b>${esc(p.label)}</b></td>
        <td class="num subtle">${money(p.opening)}</td>
        <td class="num" style="color:var(--brand-dark)">${p.inflow ? money(p.inflow) : '—'}</td>
        <td class="num" style="color:var(--danger)">${p.outflow ? money(p.outflow) : '—'}</td>
        <td class="num" style="color:${p.net < 0 ? 'var(--danger)' : 'var(--brand-dark)'}">${p.net >= 0 ? '+' : ''}${money(p.net)}</td>
        <td class="num"><b style="color:${p.closing < 0 ? 'var(--danger)' : 'inherit'}">${money(p.closing)}</b></td>
        <td class="num subtle" style="font-size:12px;white-space:nowrap">${money(p.closingLow)} – ${money(p.closingHigh)}</td></tr>`)));
      c.appendChild(card);
      addReportExports(card, `Cashflow ${horizon}${unit[0]}`, [['Period', 'Opening', 'Money in', 'Money out', 'Net', 'Closing', 'Low', 'High'], ...r.periods.map((p) => [p.label, p.opening, p.inflow, p.outflow, p.net, p.closing, p.closingLow, p.closingHigh])]);

      // Methodology note — forecast is built from real history
      c.appendChild(h(`<p class="muted-inline" style="margin:-8px 2px 16px">Forecast basis: your average cash flow over the last ${r.history.windowDays} days (about ${money(r.history.perWeekIn)} in / ${money(r.history.perWeekOut)} out per week), plus specific unpaid invoices &amp; bills on their due dates, plus the scenarios below.</p>`));

      // ---- Plan ahead with Little Lumi (scenario adjustments) ----
      const scen = h(`<div class="card">
        <div class="card-head"><h2>Plan ahead with Little Lumi</h2><div class="spacer"></div><span class="pill liability">scenario planning</span></div>
        <div class="card-body">
          <p class="muted-inline" style="margin-top:0">Describe what's coming up in plain English — Little Lumi reads it and suggests forecast adjustments for you to review. e.g. <i>"Big event in 2 weeks bringing in £50k; buy £20k of supplies a week before; £10k deposits two weeks ahead."</i></p>
          <textarea id="note" rows="3" placeholder="Tell Little Lumi what's coming up…"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn small" id="readNote">✦ Read my note</button>
            <button class="btn secondary small" id="addManual">+ Add adjustment manually</button>
          </div>
          <div id="suggestions" style="margin-top:10px"></div>
          <div id="scenList" style="margin-top:10px"></div>
        </div></div>`);
      c.appendChild(scen);
      const suggBox = scen.querySelector('#suggestions');
      const scenList = scen.querySelector('#scenList');
      const adjustRow = (s) => {
        const conf = s.confidence ? `<span class="conf ${esc(s.confidence)}" title="Little Lumi's confidence in reading this from your note">${esc(s.confidence)}</span>` : '<span></span>';
        const row = h(`<div style="display:grid;grid-template-columns:auto 1.4fr 1fr 1.1fr 1.1fr auto;gap:8px;align-items:center;margin-bottom:8px;padding:8px 10px;border:1px dashed var(--cream-3);border-radius:10px;background:#fbfaf7">
          ${conf}
          <input class="sLabel" value="${esc(s.label || '')}" placeholder="Label" />
          <input class="sAmt" type="number" step="0.01" value="${s.amount != null ? s.amount : ''}" placeholder="Amount £" />
          <select class="sDir"><option value="in" ${s.direction !== 'out' ? 'selected' : ''}>Money in</option><option value="out" ${s.direction === 'out' ? 'selected' : ''}>Money out</option></select>
          <input class="sDate" type="date" value="${esc(s.date || today())}" />
          <button class="btn small sAdd" type="button">Add</button></div>`);
        row.querySelector('.sAdd').addEventListener('click', async () => {
          try {
            await api(`/api/orgs/${orgId}/reports/cashflow/scenarios`, { method: 'POST', body: JSON.stringify({
              label: row.querySelector('.sLabel').value, amount: Number(row.querySelector('.sAmt').value),
              direction: row.querySelector('.sDir').value, date: row.querySelector('.sDate').value }) });
            flash('Added to forecast'); draw();
          } catch (e) { flash(e.message, true); }
        });
        return row;
      };
      scen.querySelector('#addManual').addEventListener('click', () => suggBox.appendChild(adjustRow({ direction: 'in', date: today() })));
      scen.querySelector('#readNote').addEventListener('click', async () => {
        const text = scen.querySelector('#note').value.trim();
        if (!text) { flash('Type a note first', true); return; }
        try {
          const { suggestions } = await api(`/api/orgs/${orgId}/reports/cashflow/parse`, { method: 'POST', body: JSON.stringify({ text }) });
          suggBox.innerHTML = '';
          if (!suggestions.length) { suggBox.appendChild(h(`<p class="muted-inline">Little Lumi couldn't spot an amount and a date — try mentioning a £ figure and when it happens, or add one manually.</p>`)); return; }
          suggBox.appendChild(h(`<div class="muted-inline" style="margin-bottom:6px">Little Lumi suggests these — edit anything, then click Add:</div>`));
          suggestions.forEach((s) => suggBox.appendChild(adjustRow(s)));
        } catch (e) { flash(e.message, true); }
      });
      if (r.scenarios && r.scenarios.length) {
        scenList.appendChild(h(`<div class="muted-inline" style="margin:6px 0">Active adjustments in this forecast:</div>`));
        r.scenarios.forEach((s) => {
          const row = h(`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line)">
            <span style="flex:1"><b>${esc(s.label)}</b> <span class="subtle">· ${esc(s.date)}</span></span>
            <span class="num" style="color:${s.direction === 'out' ? 'var(--danger)' : 'var(--brand-dark)'}">${s.direction === 'out' ? '−' : '+'}${money(s.amount)}</span>
            <button class="btn ghost small" style="color:var(--danger)" aria-label="Remove">Remove</button></div>`);
          row.querySelector('button').addEventListener('click', async () => { await api(`/api/orgs/${orgId}/reports/cashflow/scenarios/${s.id}`, { method: 'DELETE' }); draw(); });
          scenList.appendChild(row);
        });
      }

      // What's driving it
      if (r.drivers.length) {
        const dr = h(`<div class="card"><div class="card-head"><h2>What's driving this</h2></div>
          <div class="card-body flush"><table><thead><tr><th>Recurring item</th><th class="num">Per ${unitWord}</th></tr></thead><tbody id="dr"></tbody></table></div>
          <div class="card-body"><span class="muted-inline">The strongest recurring patterns Little Lumi spotted in your recent history — these sit inside the 90-day averages above.</span></div></div>`);
        const db = dr.querySelector('#dr');
        r.drivers.slice(0, 12).forEach((d) => db.appendChild(h(`<tr><td>${esc(d.description)} <span class="pill ${d.direction === 'in' ? 'income' : 'expense'}">${d.direction === 'in' ? 'in' : 'out'}</span></td>
          <td class="num" style="color:${d.direction === 'in' ? 'var(--brand-dark)' : 'var(--danger)'}">${money(unit === 'week' ? d.perWeek : d.perMonth)}</td></tr>`)));
        c.appendChild(dr);
      }

      card.querySelector('#unit').addEventListener('change', (e) => { unit = e.target.value; horizon = unit === 'week' ? 12 : 6; draw(); });
      card.querySelector('#hz').addEventListener('change', (e) => { horizon = +e.target.value; draw(); });
    };
    await draw();
  }

  // ---------- budget vs actual ----------
  async function renderBudget(c) {
    const orgId = state.orgId;
    const year = today().slice(0, 4);
    let from = `${year}-01-01`, to = today();
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/budget?from=${from}&to=${to}`);
      c.innerHTML = '';
      const income = r.rows.filter((x) => x.type === 'income');
      const expense = r.rows.filter((x) => x.type === 'expense');
      const card = h(`<div class="card">
        <div class="card-head report-toolbar"><h2>Budget vs actual</h2><div class="spacer"></div>
          <label>From</label><input type="date" id="from" value="${from}" />
          <label>To</label><input type="date" id="to" value="${to}" />
          <span class="subtle">${r.months} month${r.months > 1 ? 's' : ''}</span></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Account</th><th class="num">Monthly budget</th><th class="num">Budget (period)</th><th class="num">Actual</th><th class="num">Variance</th>
        </tr></thead><tbody id="rows"></tbody></table></div>
        <div class="card-body" style="display:flex;gap:10px"><button class="btn small" id="save">Save budgets</button><span class="muted-inline" id="ok"></span></div></div>`);
      const tb = card.querySelector('#rows');
      const section = (label) => tb.appendChild(h(`<tr><td colspan="5" style="background:var(--cream-2);font-weight:700">${label}</td></tr>`));
      const addRow = (x) => {
        const favourable = x.variance >= 0;
        const tr = h(`<tr>
          <td>${esc(x.code)} · ${esc(x.name)}</td>
          <td class="num"><input class="bm num" data-acc="${x.accountId}" type="number" step="1" value="${x.monthly || ''}" placeholder="0" style="width:110px;padding:6px 8px" /></td>
          <td class="num subtle">${money(x.budget)}</td>
          <td class="num">${money(x.actual)}</td>
          <td class="num" style="color:${favourable ? 'var(--brand-dark)' : 'var(--danger)'}">${favourable ? '+' : ''}${money(x.variance)}</td></tr>`);
        tb.appendChild(tr);
      };
      if (income.length) { section('Income'); income.forEach(addRow); }
      if (expense.length) { section('Expenses'); expense.forEach(addRow); }
      if (!r.rows.length) tb.appendChild(h('<tr><td colspan="5" class="empty">Set a monthly budget against any account to start.</td></tr>'));
      // Always show all income/expense accounts even at zero, so budgets can be set:
      c.appendChild(card);
      addReportExports(card, `Budget vs Actual ${from} to ${to}`, [['Account', 'Monthly budget', 'Budget', 'Actual', 'Variance'],
        ...r.rows.map((x) => [`${x.code} ${x.name}`, x.monthly, x.budget, x.actual, x.variance])]);
      card.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; draw(); });
      card.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; draw(); });
      card.querySelector('#save').addEventListener('click', async () => {
        const budgets = [...card.querySelectorAll('.bm')].map((i) => ({ accountId: i.getAttribute('data-acc'), monthlyAmount: Number(i.value || 0) }));
        try { await api(`/api/orgs/${orgId}/budgets`, { method: 'PUT', body: JSON.stringify({ budgets }) }); flash('Budgets saved'); draw(); }
        catch (e) { flash(e.message, true); }
      });
    };
    await draw();
  }

  // ---------- aged debtors / creditors ----------
  async function renderAged(c) {
    const orgId = state.orgId;
    let kind = 'receivable';
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/aging?type=${kind}&asOf=${today()}`);
      c.innerHTML = '';
      const noun = kind === 'receivable' ? 'Debtors (owed to you)' : 'Creditors (you owe)';
      c.appendChild(h(`<div class="stat-cards">
        <div class="stat"><div class="label">Total outstanding</div><div class="value">${money(r.total)}</div></div>
        <div class="stat"><div class="label">Not yet due</div><div class="value">${money(r.buckets.current)}</div></div>
        <div class="stat"><div class="label">1–30 days</div><div class="value">${money(r.buckets.d30)}</div></div>
        <div class="stat"><div class="label">31–60 days</div><div class="value">${money(r.buckets.d60)}</div></div>
        <div class="stat"><div class="label">60+ days</div><div class="value ${r.buckets.d90 ? 'neg' : ''}">${money(r.buckets.d90)}</div></div>
      </div>`));
      const card = h(`<div class="card">
        <div class="card-head report-toolbar"><h2>${noun}</h2><div class="spacer"></div>
          <select id="kind"><option value="receivable" ${kind === 'receivable' ? 'selected' : ''}>Debtors</option><option value="payable" ${kind === 'payable' ? 'selected' : ''}>Creditors</option></select></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Document</th><th>${kind === 'receivable' ? 'Customer' : 'Supplier'}</th><th>Due</th><th class="num">Days overdue</th><th class="num">Amount</th>
        </tr></thead><tbody id="rows"></tbody></table></div></div>`);
      const tb = card.querySelector('#rows');
      if (!r.rows.length) tb.appendChild(h('<tr><td colspan="5" class="empty">Nothing outstanding.</td></tr>'));
      r.rows.forEach((x) => tb.appendChild(h(`<tr>
        <td><b>${esc(x.number)}</b></td><td>${esc(x.contactName)}</td><td>${esc(x.dueDate)}</td>
        <td class="num" style="color:${x.daysOverdue > 0 ? 'var(--danger)' : 'var(--mid)'}">${x.daysOverdue > 0 ? x.daysOverdue : '—'}</td>
        <td class="num"><b>${money(x.amount)}</b></td></tr>`)));
      c.appendChild(card);
      addReportExports(card, `Aged ${kind === 'receivable' ? 'Debtors' : 'Creditors'} ${today()}`, [['Document', 'Contact', 'Due', 'Days overdue', 'Amount'],
        ...r.rows.map((x) => [x.number, x.contactName, x.dueDate, x.daysOverdue, x.amount])]);
      card.querySelector('#kind').addEventListener('change', (e) => { kind = e.target.value; draw(); });
    };
    await draw();
  }

  // ---------- tracking categories report ----------
  async function renderTracking(c) {
    const orgId = state.orgId;
    const year = today().slice(0, 4);
    let from = `${year}-01-01`, to = today();
    const draw = async () => {
      const [{ rows }, { options }] = await Promise.all([
        api(`/api/orgs/${orgId}/reports/tracking?from=${from}&to=${to}`),
        api(`/api/orgs/${orgId}/tracking`),
      ]);
      c.innerHTML = '';
      if (!options.length) {
        c.appendChild(h(`<div class="card"><div class="card-body empty">No tracking categories yet. ${isBookkeeper() ? 'Add them in <b>Year-end &amp; setup</b>, then tag transactions to see income and profit by category here.' : 'Your bookkeeper can set these up.'}</div></div>`));
        return;
      }
      const card = h(`<div class="card">
        <div class="card-head report-toolbar"><h2>Tracking categories</h2><div class="spacer"></div>
          <label>From</label><input type="date" id="from" value="${from}" />
          <label>To</label><input type="date" id="to" value="${to}" /></div>
        <div class="card-body flush"><table><thead><tr><th>Category</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net profit</th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
      const tb = card.querySelector('#rows');
      if (!rows.length) tb.appendChild(h('<tr><td colspan="4" class="empty">No tagged transactions in this period.</td></tr>'));
      rows.forEach((r) => tb.appendChild(h(`<tr><td><b>${esc(r.name)}</b></td>
        <td class="num" style="color:var(--brand-dark)">${money(r.income)}</td><td class="num" style="color:var(--danger)">${money(r.expense)}</td>
        <td class="num"><b style="color:${r.net < 0 ? 'var(--danger)' : 'inherit'}">${money(r.net)}</b></td></tr>`)));
      c.appendChild(card);
      addReportExports(card, `Tracking ${from} to ${to}`, [['Category', 'Income', 'Expenses', 'Net'], ...rows.map((r) => [r.name, r.income, r.expense, r.net])]);
      card.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; draw(); });
      card.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; draw(); });
    };
    await draw();
  }

  // ---------- VAT return ----------
  async function renderVat(c) {
    const orgId = state.orgId;
    let from = '2026-01-01', to = today();
    let scheme = currentOrg().vatScheme || 'accrual';
    const flatRate = currentOrg().flatRate || 0;
    const schemeLabel = { accrual: 'Standard (accrual)', cash: 'Cash accounting', flat: `Flat rate ${flatRate}%` };
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/vat-return?from=${from}&to=${to}&scheme=${scheme}`);
      c.innerHTML = '';
      if (!r.hasAccount) { c.innerHTML = '<div class="card"><div class="card-body empty">No VAT account (2100) found for this client.</div></div>'; return; }
      const refund = r.box5 < 0;
      const box = (n, label, val, strong) => `<tr class="${strong ? 'total-row' : ''}"><td style="width:60px"><b>Box ${n}</b></td><td>${label}</td><td class="num">${money(val)}</td></tr>`;
      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar"><h2>VAT Return</h2><div class="spacer"></div>
            ${isBookkeeper() ? `<label>Scheme</label><select id="scheme">
              <option value="accrual" ${scheme === 'accrual' ? 'selected' : ''}>Standard (accrual)</option>
              <option value="cash" ${scheme === 'cash' ? 'selected' : ''}>Cash accounting</option>
              <option value="flat" ${scheme === 'flat' ? 'selected' : ''}>Flat rate</option></select>` : `<span class="pill liability">${esc(schemeLabel[scheme])}</span>`}
            <label>From</label><input type="date" id="from" value="${from}" />
            <label>To</label><input type="date" id="to" value="${to}" /></div>
          <div class="card-body flush"><table><tbody>
            ${box(1, 'VAT due on sales and other outputs', r.box1)}
            ${box(2, 'VAT due on acquisitions (NI/EU)', r.box2)}
            ${box(3, 'Total VAT due', r.box3, true)}
            ${box(4, 'VAT reclaimed on purchases', r.box4)}
            ${box(5, refund ? 'Net VAT to reclaim from HMRC' : 'Net VAT to pay HMRC', Math.abs(r.box5), true)}
            ${box(6, 'Total sales excluding VAT', r.box6)}
            ${box(7, 'Total purchases excluding VAT', r.box7)}
            ${box(8, 'Supplies excluding VAT (NI/EU)', r.box8)}
            ${box(9, 'Acquisitions excluding VAT (NI/EU)', r.box9)}
          </tbody></table></div>
          <div class="card-body"><span class="muted-inline">Scheme: <b>${esc(schemeLabel[scheme])}</b>. An estimate from your ledger — review before filing under Making Tax Digital. Flat-rate and cash figures are simplified.</span></div>
        </div>`);
      c.appendChild(card);
      addReportExports(card, `VAT Return ${from} to ${to}`, [['Box', 'Description', 'Amount'],
        [1, 'VAT due on sales', r.box1], [2, 'VAT due on acquisitions', r.box2], [3, 'Total VAT due', r.box3],
        [4, 'VAT reclaimed', r.box4], [5, 'Net VAT', r.box5], [6, 'Total sales ex VAT', r.box6],
        [7, 'Total purchases ex VAT', r.box7], [8, 'Supplies ex VAT', r.box8], [9, 'Acquisitions ex VAT', r.box9]]);
      card.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; draw(); });
      card.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; draw(); });
      const sc = card.querySelector('#scheme');
      if (sc) sc.addEventListener('change', async (e) => {
        scheme = e.target.value;
        await api(`/api/orgs/${orgId}/settings`, { method: 'PUT', body: JSON.stringify({ vatScheme: scheme }) });
        currentOrg().vatScheme = scheme;
        draw();
      });
      await drawPeriods();
    };
    const drawPeriods = async () => {
      const pr = await api(`/api/orgs/${orgId}/vat-periods?year=2026`);
      const card = h(`<div class="card">
        <div class="card-head"><h2>VAT periods</h2><div class="spacer"></div><span class="subtle">${pr.period} filing</span></div>
        <div class="card-body flush"><table><thead><tr><th>Period</th><th class="num">VAT due (Box 5)</th><th>Status / due</th><th></th></tr></thead><tbody id="pr"></tbody></table></div>
        <div class="card-body"><span class="muted-inline">Change quarterly/monthly filing in <b>Year-end &amp; setup</b>. Submissions are recorded in Lumi in Making Tax Digital format. <b>Live filing to HMRC</b> requires Lumi to be HMRC-recognised software and hosted online — not yet enabled.</span></div></div>`);
      const tb = card.querySelector('#pr');
      const dueText = (p) => {
        if (p.daysUntilDue < 0) return `<span style="color:var(--danger)">Overdue by ${-p.daysUntilDue} day${-p.daysUntilDue === 1 ? '' : 's'}</span>`;
        if (p.daysUntilDue === 0) return '<span style="color:var(--warn)">Due today</span>';
        return `Due ${esc(p.dueDate)} · in ${p.daysUntilDue} day${p.daysUntilDue === 1 ? '' : 's'}`;
      };
      pr.rows.forEach((p) => {
        let statusCell;
        if (p.status === 'submitted') statusCell = `<span class="pill ok">Submitted</span> <span class="subtle">${esc((p.submittedAt || '').slice(0, 10))}</span>`;
        else if (p.status === 'in_progress') statusCell = `<span class="pill liability">In progress</span> <span class="subtle">ends in ${p.daysUntilEnd} day${p.daysUntilEnd === 1 ? '' : 's'}</span>`;
        else statusCell = `<span class="pill ${p.daysUntilDue < 0 ? 'bad' : 'liability'}">Ready</span> <span class="subtle">${dueText(p)}</span>`;
        const row = h(`<tr><td>${esc(p.label)}</td><td class="num">${money(p.box5)}</td><td>${statusCell}</td><td class="num"></td></tr>`);
        const actCell = row.querySelector('td:last-child');
        if (isBookkeeper() && p.status === 'open') {
          const b = h('<button class="btn small">Generate &amp; submit</button>');
          b.addEventListener('click', async () => {
            if (!confirm(`Submit the VAT return for ${p.label}? (Recorded in Lumi — not filed to HMRC in this build.)`)) return;
            try { const r = await api(`/api/orgs/${orgId}/vat-returns`, { method: 'POST', body: JSON.stringify({ from: p.from, to: p.to }) }); flash(`Submitted · ref ${r.vatReturn.reference}`); draw(); }
            catch (e) { flash(e.message, true); }
          });
          actCell.appendChild(b);
        } else if (p.reference) {
          actCell.innerHTML = `<span class="subtle">ref ${esc(p.reference)}</span>`;
        }
        tb.appendChild(row);
      });
      c.appendChild(card);
    };
    await draw();
  }

  // ---------- bank statement import ----------
  async function renderImport(c) {
    const orgId = state.orgId;
    const [{ accounts }, { rules }, dash, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/rules`), api(`/api/orgs/${orgId}/dashboard`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    const taxOpts = (sel) => `<option value="">No tax</option>` + taxRates.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const matchRule = (desc, amount) => {
      const d = String(desc || '').toLowerCase();
      return rules.find((r) => d.includes(r.match.toLowerCase())
        && (r.kind === 'any' || (r.kind === 'spend' && amount < 0) || (r.kind === 'receive' && amount > 0)));
    };
    const banks = accounts.filter((a) => a.type === 'asset');
    const accOpts = (sel) => accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    c.innerHTML = '';
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Import a bank statement (CSV)</h2></div>
        <div class="card-body">
          ${(dash.bankFreshness || []).filter((b) => b.daysSince != null).map((b) => {
            const lvl = b.daysSince >= 7 ? 'bad' : b.daysSince >= 3 ? 'liability' : 'ok';
            return `<span class="pill ${lvl}" style="margin:0 8px 8px 0;display:inline-block">${esc(b.name)} · last update ${b.daysSince === 0 ? 'today' : b.daysSince + 'd ago'}</span>`;
          }).join('')}
          <p class="muted-inline">Upload a CSV exported from your bank. Pick which columns hold the date, description and amount, choose the bank account, then review and import. Positive amounts are treated as money in, negative as money out.</p>
          <div class="inline-row" style="margin-top:14px">
            <div><label>Bank account</label><select id="bank">${banks.map((b) => `<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join('')}</select></div>
            <div><label>CSV file</label><input type="file" id="file" accept=".csv,text/csv" /></div>
          </div>
          <div id="mapping"></div>
        </div>
      </div>`);
    c.appendChild(card);
    const mapping = card.querySelector('#mapping');

    card.querySelector('#file').addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const matrix = parseCSV(reader.result);
        if (matrix.length < 2) { mapping.innerHTML = '<div class="err">Could not read any rows from that file.</div>'; return; }
        const header = matrix[0]; const dataRows = matrix.slice(1);
        const guess = (re, fallback) => { const i = header.findIndex((hd) => re.test(hd)); return i >= 0 ? i : fallback; };
        let dateCol = guess(/date/i, 0), descCol = guess(/desc|detail|narr|memo|payee/i, 1), amtCol = guess(/amount|value|debit|credit/i, header.length - 1);
        const colOpts = (sel) => header.map((hd, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(hd || 'Column ' + (i + 1))}</option>`).join('');
        mapping.innerHTML = '';
        const map = h(`<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px">
          <div class="inline-row">
            <div><label>Date column</label><select id="dateCol">${colOpts(dateCol)}</select></div>
            <div><label>Description column</label><select id="descCol">${colOpts(descCol)}</select></div>
            <div><label>Amount column</label><select id="amtCol">${colOpts(amtCol)}</select></div>
          </div>
          <label>Default category for these rows</label><select id="defCat">${accOpts()}</select>
          <div class="card-body flush" style="margin-top:14px;border:1px solid var(--line);border-radius:8px;max-height:320px;overflow:auto">
            <table><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>VAT</th></tr></thead><tbody id="prev"></tbody></table>
          </div>
          <button class="btn" id="commit" style="margin-top:16px">Import <span id="cnt"></span> transactions</button>
          <div class="err" id="err"></div></div>`);
        mapping.appendChild(map);
        const norm = (s) => {
          // normalise common date formats to YYYY-MM-DD where possible
          s = String(s || '').trim();
          let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
          if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
          m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // assume DD/MM/YYYY
          return s;
        };
        const drawPrev = () => {
          const dC = +map.querySelector('#dateCol').value, sC = +map.querySelector('#descCol').value, aC = +map.querySelector('#amtCol').value;
          const def = map.querySelector('#defCat').value;
          const prev = map.querySelector('#prev'); prev.innerHTML = '';
          dataRows.forEach((r) => {
            const amt = Number(String(r[aC] || '').replace(/[^0-9.-]/g, ''));
            const rule = matchRule(r[sC], amt);
            const sel = rule ? rule.accountId : def;
            const taxSel = rule ? rule.taxRateId : null;
            const tr = h(`<tr>
              <td>${esc(norm(r[dC]))}</td><td>${esc(r[sC] || '')}${rule ? ' <span class="pill ok">rule</span>' : ''}</td>
              <td class="num" style="color:${amt < 0 ? 'var(--danger)' : 'var(--brand-dark)'}">${money(amt)}</td>
              <td><select class="rowCat">${accOpts(sel)}</select></td>
              <td><select class="rowTax">${taxOpts(taxSel)}</select></td></tr>`);
            prev.appendChild(tr);
          });
          map.querySelector('#cnt').textContent = dataRows.length;
        };
        ['dateCol', 'descCol', 'amtCol'].forEach((id) => map.querySelector('#' + id).addEventListener('change', drawPrev));
        map.querySelector('#defCat').addEventListener('change', drawPrev);
        drawPrev();
        map.querySelector('#commit').addEventListener('click', async () => {
          const dC = +map.querySelector('#dateCol').value, sC = +map.querySelector('#descCol').value, aC = +map.querySelector('#amtCol').value;
          const cats = [...map.querySelectorAll('.rowCat')];
          const taxes = [...map.querySelectorAll('.rowTax')];
          const rows = dataRows.map((r, i) => ({
            date: norm(r[dC]), description: r[sC] || '', amount: Number(String(r[aC] || '').replace(/[^0-9.-]/g, '')), categoryAccountId: cats[i].value, taxRateId: taxes[i].value || null,
          }));
          try {
            const res = await api(`/api/orgs/${orgId}/import-bank`, { method: 'POST', body: JSON.stringify({ bankAccountId: card.querySelector('#bank').value, rows }) });
            flash(`Imported ${res.imported} transaction${res.imported === 1 ? '' : 's'}`);
            if (res.errors && res.errors.length) map.querySelector('#err').innerHTML = res.errors.slice(0, 5).map(esc).join('<br/>');
            else { state.view = 'transactions'; renderApp(); }
          } catch (e) { map.querySelector('#err').textContent = e.message; }
        });
      };
      reader.readAsText(file);
    });
  }

  // ---------- bank reconciliation ----------
  async function renderReconcile(c) {
    const orgId = state.orgId;
    const { accounts } = await api(`/api/orgs/${orgId}/accounts`);
    const banks = accounts.filter((a) => a.type === 'asset');
    let accountId = banks[0]?.id;
    let statementBalance = '';
    if (!banks.length) { c.innerHTML = '<div class="card"><div class="card-body empty">Add an asset account (e.g. a bank account) to reconcile.</div></div>'; return; }

    const draw = async () => {
      const q = statementBalance !== '' ? `?statementBalance=${encodeURIComponent(statementBalance)}` : '';
      const r = await api(`/api/orgs/${orgId}/accounts/${accountId}/reconcile${q}`);
      c.innerHTML = '';
      const diffClass = r.difference === 0 ? 'ok' : 'bad';
      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar">
            <h2>Reconcile</h2>
            <select id="acc">${banks.map((b) => `<option value="${b.id}" ${b.id === accountId ? 'selected' : ''}>${esc(b.code)} · ${esc(b.name)}</option>`).join('')}</select>
            <button class="btn secondary small" id="allOn">Mark all ✓</button>
            <button class="btn ghost small" id="allOff">Clear all</button>
            <div class="spacer"></div>
            <label>Statement balance</label><input type="number" step="0.01" id="stmt" value="${statementBalance}" style="width:130px" placeholder="0.00" />
          </div>
          <div class="card-body" style="display:flex;gap:24px;flex-wrap:wrap;border-bottom:1px solid var(--line)">
            <div><div class="subtle">Cleared balance</div><div style="font-size:20px;font-weight:700">${money(r.clearedBalance)}</div></div>
            <div><div class="subtle">Ledger balance</div><div style="font-size:20px;font-weight:700">${money(r.ledgerBalance)}</div></div>
            ${r.difference != null ? `<div><div class="subtle">Difference vs statement</div><div style="font-size:20px;font-weight:700"><span class="pill ${diffClass}">${money(r.difference)}</span></div></div>` : ''}
          </div>
          <div class="card-body flush"><table><thead><tr>
            <th style="width:40px">✓</th><th>Date</th><th>Description</th><th>Ref</th><th class="num">Debit</th><th class="num">Credit</th>
          </tr></thead><tbody id="rows"></tbody></table></div>
        </div>`);
      const tb = card.querySelector('#rows');
      if (!r.rows.length) tb.appendChild(h('<tr><td colspan="6" class="empty">No movements on this account yet.</td></tr>'));
      r.rows.forEach((row) => {
        const tr = h(`<tr>
          <td><input type="checkbox" ${row.reconciled ? 'checked' : ''} style="width:auto" /></td>
          <td>${esc(row.date)}</td><td>${esc(row.description)}</td><td class="subtle">${esc(row.reference || '—')}</td>
          <td class="num">${row.debit ? money(row.debit) : ''}</td><td class="num">${row.credit ? money(row.credit) : ''}</td></tr>`);
        tr.querySelector('input').addEventListener('change', async (e) => {
          try { await api(`/api/orgs/${orgId}/lines/${row.lineId}/reconcile`, { method: 'POST', body: JSON.stringify({ reconciled: e.target.checked }) }); draw(); }
          catch (err) { flash(err.message, true); e.target.checked = !e.target.checked; }
        });
        tb.appendChild(tr);
      });
      c.appendChild(card);
      card.querySelector('#acc').addEventListener('change', (e) => { accountId = e.target.value; draw(); });
      const stmt = card.querySelector('#stmt');
      stmt.addEventListener('change', (e) => { statementBalance = e.target.value; draw(); });
      const bulk = async (val) => { try { await api(`/api/orgs/${orgId}/accounts/${accountId}/reconcile-all`, { method: 'POST', body: JSON.stringify({ reconciled: val }) }); flash(val ? 'All marked reconciled' : 'All cleared'); draw(); } catch (e) { flash(e.message, true); } };
      card.querySelector('#allOn').addEventListener('click', () => bulk(true));
      card.querySelector('#allOff').addEventListener('click', () => bulk(false));
    };
    await draw();
  }

  // ---------- general ledger & drill-down ----------
  function ledgerTable(r) {
    const wrap = h(`<div>
      <div style="display:flex;gap:28px;margin:4px 0 14px">
        <div><div class="subtle">Opening balance</div><div style="font-family:var(--font-serif);font-size:20px">${money(r.openingBalance)}</div></div>
        <div><div class="subtle">Closing balance</div><div style="font-family:var(--font-serif);font-size:20px">${money(r.closingBalance)}</div></div>
        <div><div class="subtle">Entries</div><div style="font-family:var(--font-serif);font-size:20px">${r.rows.length}</div></div>
      </div>
      <div style="border:1px solid var(--cream-3);border-radius:12px;overflow:hidden">
        <table><thead><tr><th>Date</th><th>Description</th><th>Ref</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody id="lr"></tbody></table>
      </div></div>`);
    const tb = wrap.querySelector('#lr');
    if (!r.rows.length) tb.appendChild(h('<tr><td colspan="6" class="empty">No entries in this period.</td></tr>'));
    r.rows.forEach((e) => {
      const tr = h(`<tr class="drill" title="Find this transaction">
        <td>${esc(e.date)}</td><td>${esc(e.description)}</td><td class="subtle">${esc(e.reference || '—')}</td>
        <td class="num">${e.debit ? money(e.debit) : ''}</td><td class="num">${e.credit ? money(e.credit) : ''}</td>
        <td class="num"><b>${money(e.balance)}</b></td></tr>`);
      tr.addEventListener('click', () => {
        document.querySelectorAll('.modal-bg').forEach((m) => m.remove());
        state.pendingTxnSearch = e.reference || e.description;
        state.view = 'transactions'; renderApp();
      });
      tb.appendChild(tr);
    });
    return wrap;
  }

  async function openAccountLedger(accountId) {
    const r = await api(`/api/orgs/${state.orgId}/accounts/${accountId}/ledger`);
    const body = h('<div></div>');
    body.appendChild(h(`<p class="muted-inline" style="margin-top:0">Every transaction posted to <b>${esc(r.account.code)} · ${esc(r.account.name)}</b>.</p>`));
    body.appendChild(ledgerTable(r));
    const m = modal(`${r.account.name}`, body);
    body.closest('.modal').style.maxWidth = '760px';
  }

  async function renderLedger(c) {
    const orgId = state.orgId;
    const { accounts } = await api(`/api/orgs/${orgId}/accounts`);
    let accountId = accounts[0]?.id;
    if (!accountId) { c.innerHTML = '<div class="card"><div class="card-body empty">No accounts yet.</div></div>'; return; }
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/accounts/${accountId}/ledger`);
      c.innerHTML = '';
      const card = h(`<div class="card">
        <div class="card-head report-toolbar"><h2>General ledger</h2><div class="spacer"></div>
          <label>Account</label><select id="acc">${accounts.map((a) => `<option value="${a.id}" ${a.id === accountId ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select></div>
        <div class="card-body" id="hold"></div></div>`);
      card.querySelector('#hold').appendChild(ledgerTable(r));
      c.appendChild(card);
      addReportExports(card, `Ledger ${r.account.code} ${r.account.name}`, [['Date', 'Description', 'Ref', 'Debit', 'Credit', 'Balance'],
        ...r.rows.map((e) => [e.date, e.description, e.reference, e.debit, e.credit, e.balance])]);
      card.querySelector('#acc').addEventListener('change', (e) => { accountId = e.target.value; draw(); });
    };
    await draw();
  }

  // ---------- payroll ----------
  async function renderPayroll(c) {
    const orgId = state.orgId;
    if (!isBookkeeper()) { c.innerHTML = '<div class="card"><div class="card-body empty">Payroll is managed by your bookkeeper.</div></div>'; return; }
    const [{ employees }, { payRuns }] = await Promise.all([
      api(`/api/orgs/${orgId}/employees`), api(`/api/orgs/${orgId}/pay-runs`),
    ]);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:14px 22px">
      <span class="muted-inline">PAYE and National Insurance are calculated on approximate current-year thresholds — an estimate to review. <b>RTI submission to HMRC</b> (FPS/EPS) requires Lumi to be registered with HMRC as recognised payroll software and hosted online; the submit button records it ready for that connection.</span></div></div>`));

    // Employees
    const emp = h(`<div class="card"><div class="card-head"><h2>Employees</h2><div class="spacer"></div>
      <button class="btn small" id="addEmp">${icon('plus', 14)} Add employee</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Name</th><th>Tax code</th><th>NI</th><th class="num">Salary</th><th class="num">Gross/mo</th><th class="num">Tax</th><th class="num">NI</th><th class="num">Net/mo</th><th></th>
      </tr></thead><tbody id="er"></tbody></table></div></div>`);
    const er = emp.querySelector('#er');
    if (!employees.length) er.appendChild(h('<tr><td colspan="9" class="empty">No employees yet.</td></tr>'));
    employees.forEach((e) => {
      const p = e.period;
      const row = h(`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.taxCode)}</td><td class="subtle">${esc(e.niCategory)}</td>
        <td class="num">${money(e.annualSalary)}</td><td class="num">${money(p.gross)}</td>
        <td class="num">${money(p.tax)}</td><td class="num">${money(p.employeeNI)}</td><td class="num"><b>${money(p.net)}</b></td>
        <td class="num"><button class="btn ghost small" style="color:var(--danger)">Remove</button></td></tr>`);
      row.querySelector('button').addEventListener('click', async () => { if (confirm(`Remove ${e.name}?`)) { await api(`/api/orgs/${orgId}/employees/${e.id}`, { method: 'DELETE' }); renderApp(); } });
      er.appendChild(row);
    });
    c.appendChild(emp);
    emp.querySelector('#addEmp').addEventListener('click', openAddEmployee);

    // Pay runs
    const runs = h(`<div class="card"><div class="card-head"><h2>Pay runs</h2><div class="spacer"></div>
      <button class="btn small" id="run" ${employees.length ? '' : 'disabled'}>Run payroll</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Period</th><th>Pay date</th><th class="num">Gross</th><th class="num">Tax + NI</th><th class="num">Net paid</th><th>Status</th><th></th>
      </tr></thead><tbody id="rr"></tbody></table></div></div>`);
    const rr = runs.querySelector('#rr');
    if (!payRuns.length) rr.appendChild(h('<tr><td colspan="7" class="empty">No pay runs yet.</td></tr>'));
    payRuns.forEach((r) => {
      const t = r.totals;
      const row = h(`<tr><td><b>${esc(r.periodLabel)}</b></td><td>${esc(r.payDate)}</td>
        <td class="num">${money(t.gross)}</td><td class="num">${money(t.tax + t.employeeNI + t.employerNI)}</td><td class="num">${money(t.net)}</td>
        <td>${r.submittedAt ? `<span class="pill ok">FPS submitted</span>` : '<span class="pill liability">Posted</span>'}</td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const view = h('<button class="btn ghost small">Payslips</button>');
      view.addEventListener('click', () => openPayslips(r));
      act.append(view);
      if (!r.submittedAt) {
        const sub = h('<button class="btn small">Submit FPS</button>');
        sub.addEventListener('click', async () => {
          if (!confirm('Submit this pay run to HMRC (RTI/FPS)? Recorded in Lumi — not transmitted to HMRC in this build.')) return;
          try { const x = await api(`/api/orgs/${orgId}/pay-runs/${r.id}/submit`, { method: 'POST' }); flash(`FPS recorded · ${x.payRun.fpsRef}`); renderApp(); } catch (e) { flash(e.message, true); }
        });
        act.append(sub);
      }
      rr.appendChild(row);
    });
    c.appendChild(runs);
    const runBtn = runs.querySelector('#run');
    if (runBtn && employees.length) runBtn.addEventListener('click', () => openRunPayroll());
  }

  function openAddEmployee() {
    const body = h(`<div>
      <div class="inline-row"><div><label>Name</label><input id="name" placeholder="Full name" /></div>
        <div><label>NI number</label><input id="ni" placeholder="QQ123456C" /></div></div>
      <div class="inline-row"><div><label>Annual salary (£)</label><input id="sal" type="number" step="100" min="0" /></div>
        <div><label>Pay frequency</label><select id="freq"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option></select></div></div>
      <div class="inline-row"><div><label>Tax code</label><input id="code" value="1257L" /></div>
        <div><label>NI category</label><input id="cat" value="A" /></div></div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Add employee</button>');
    const { close } = modal('New employee', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/employees`, { method: 'POST', body: JSON.stringify({
          name: body.querySelector('#name').value, niNumber: body.querySelector('#ni').value, annualSalary: Number(body.querySelector('#sal').value),
          payFrequency: body.querySelector('#freq').value, taxCode: body.querySelector('#code').value, niCategory: body.querySelector('#cat').value }) });
        close(); flash('Employee added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function openRunPayroll() {
    const d = new Date(); const label = d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
    const body = h(`<div>
      <p class="muted-inline">This calculates pay for all active employees, posts the wages journal, and creates payslips.</p>
      <div class="inline-row"><div><label>Period label</label><input id="label" value="${esc(label)}" /></div>
        <div><label>Pay date</label><input id="date" type="date" value="${today()}" /></div></div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Run payroll</button>');
    const { close } = modal('Run payroll', body, save);
    save.addEventListener('click', async () => {
      try { await api(`/api/orgs/${state.orgId}/pay-runs`, { method: 'POST', body: JSON.stringify({ periodLabel: body.querySelector('#label').value, payDate: body.querySelector('#date').value }) }); close(); flash('Payroll run & posted'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function payslipDocHTML(l, run, coName) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(l.name)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600&display=swap">
    <style>*{box-sizing:border-box}body{font-family:'DM Sans',sans-serif;color:#1A1A18;margin:0;padding:48px;font-size:13.5px}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #B8922A;padding-bottom:18px;margin-bottom:22px}
    .brand{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600}h1{font-size:17px;letter-spacing:2px;color:#B8922A;margin:0}
    .muted{color:#6B6860}.r{text-align:right}table{width:100%;border-collapse:collapse;margin-top:10px}
    td{padding:8px 10px;border-bottom:1px solid #E4DFD4}.sec{font-weight:700;background:#FAF8F4}
    .net{margin-top:18px;display:flex;justify-content:space-between;font-size:18px;font-weight:700;border-top:2px solid #1A1A18;padding-top:10px}</style></head><body>
    <div class="top"><div><div class="brand">${esc(coName)}</div><div class="muted">Payslip</div></div>
      <div class="r"><h1>PAYSLIP</h1><div class="muted">${esc(run.periodLabel)}</div><div class="muted">Pay date ${esc(run.payDate)}</div></div></div>
    <div style="font-weight:700;font-size:15px;margin-bottom:6px">${esc(l.name)}</div>
    <table>
      <tr class="sec"><td>Payments</td><td class="r"></td></tr>
      <tr><td>Gross pay</td><td class="r">${money(l.gross)}</td></tr>
      <tr class="sec"><td>Deductions</td><td class="r"></td></tr>
      <tr><td>PAYE income tax</td><td class="r">${money(l.tax)}</td></tr>
      <tr><td>Employee National Insurance</td><td class="r">${money(l.employeeNI)}</td></tr>
    </table>
    <div class="net"><span>Net pay</span><span>${money(l.net)}</span></div>
    <p class="muted" style="margin-top:18px;font-size:12px">Employer's NI this period: ${money(l.employerNI)}. Figures are an estimate on current-year thresholds.</p>
    </body></html>`;
  }

  function openPayslips(run) {
    const coName = currentOrg().name || '';
    const body = h(`<div>
      <div style="border:1px solid var(--cream-3);border-radius:12px;overflow:hidden">
      <table><thead><tr><th>Employee</th><th class="num">Gross</th><th class="num">Tax</th><th class="num">Empee NI</th><th class="num">Net</th><th></th></tr></thead>
      <tbody id="psrows"></tbody></table></div>
      ${run.fpsRef ? `<p class="muted-inline" style="margin-top:10px">FPS reference: <b>${esc(run.fpsRef)}</b></p>` : ''}</div>`);
    const tb = body.querySelector('#psrows');
    run.lines.forEach((l) => {
      const tr = h(`<tr><td>${esc(l.name)}</td><td class="num">${money(l.gross)}</td><td class="num">${money(l.tax)}</td><td class="num">${money(l.employeeNI)}</td><td class="num"><b>${money(l.net)}</b></td>
        <td class="num"><button class="btn ghost small">Payslip</button></td></tr>`);
      tr.querySelector('button').addEventListener('click', () => {
        const w = window.open('', '_blank'); if (!w) { flash('Allow pop-ups for the PDF', true); return; }
        w.document.write(payslipDocHTML(l, run, coName)); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
      });
      tb.appendChild(tr);
    });
    tb.appendChild(h(`<tr class="total-row"><td>Totals</td><td class="num">${money(run.totals.gross)}</td><td class="num">${money(run.totals.tax)}</td><td class="num">${money(run.totals.employeeNI)}</td><td class="num">${money(run.totals.net)}</td><td></td></tr>`));
    modal(`Payslips — ${run.periodLabel}`, body);
    body.closest('.modal').style.maxWidth = '760px';
  }

  // ---------- expense claims ----------
  const CLAIM_PILL = { submitted: 'liability', approved: 'asset', paid: 'ok', declined: 'bad' };
  const CLAIM_LABEL = { submitted: 'Submitted', approved: 'Approved', paid: 'Reimbursed', declined: 'Declined' };

  async function renderExpenseClaims(c) {
    const orgId = state.orgId;
    const bk = isBookkeeper();
    const [{ claims }, { accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/expense-claims`), api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    c.innerHTML = '';
    c.appendChild(h(`<div class="card"><div class="card-body" style="padding:16px 22px">
      <span class="muted-inline">${bk ? 'Out-of-pocket expenses submitted by the business. Approve them, then reimburse from a bank account — which posts the expense and VAT for you.' : 'Submit expenses you\'ve paid for personally. Once approved and reimbursed, the money comes back to you.'}</span></div></div>`));
    const card = h(`<div class="card"><div class="card-head"><h2>Expense claims</h2><div class="spacer"></div>
      <button class="btn small" id="new">${icon('plus', 14)} New claim</button></div>
      <div class="card-body flush"><table><thead><tr><th>Date</th><th>Claimant</th><th>Description</th><th>Category</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`);
    const tb = card.querySelector('#rows');
    if (!claims.length) tb.appendChild(h('<tr><td colspan="7" class="empty">No expense claims yet.</td></tr>'));
    claims.forEach((x) => {
      const row = h(`<tr><td>${esc(x.date)}</td><td>${esc(x.claimant)}</td><td>${esc(x.description)}</td>
        <td class="subtle">${esc(x.accountName || '')}</td><td class="num">${money(x.amount)}</td>
        <td><span class="pill ${CLAIM_PILL[x.status]}">${CLAIM_LABEL[x.status]}</span></td>
        <td class="num" style="white-space:nowrap"></td></tr>`);
      const act = row.querySelector('td:last-child');
      const menuItems = [];
      if (bk && x.status === 'submitted') { menuItems.push(['Decline', () => claimStatus(x, 'declined'), true]); }
      if (x.status !== 'paid') menuItems.push(['Delete', async () => { if (confirm('Delete this claim?')) { await api(`/api/orgs/${orgId}/expense-claims/${x.id}`, { method: 'DELETE' }); renderApp(); } }, true]);
      let primary = null;
      if (bk && x.status === 'submitted') { primary = h('<button class="btn small">Approve</button>'); primary.addEventListener('click', () => claimStatus(x, 'approved')); }
      else if (bk && x.status === 'approved') { primary = h('<button class="btn small">Reimburse</button>'); primary.addEventListener('click', () => openReimburse(x)); }
      if (primary) act.append(primary);
      if (menuItems.length) { const more = h('<button class="btn ghost small" aria-label="More" style="font-size:16px;line-height:1;padding:6px 10px">⋯</button>'); more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuItems, true); }); act.append(more); }
      tb.appendChild(row);
    });
    c.appendChild(card);
    card.querySelector('#new').addEventListener('click', () => openClaimModal(accounts, taxRates));
  }

  async function claimStatus(claim, status) {
    try { await api(`/api/orgs/${state.orgId}/expense-claims/${claim.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); flash(`Claim ${status}`); renderApp(); }
    catch (e) { flash(e.message, true); }
  }

  function openClaimModal(accounts, taxRates) {
    const exp = accounts.filter((a) => a.type === 'expense');
    const body = h(`<div>
      <div class="inline-row"><div><label>Claimant</label><input id="who" value="${esc(state.user.name)}" /></div>
        <div><label>Date</label><input type="date" id="date" value="${today()}" /></div></div>
      <label>What was it for?</label><input id="desc" placeholder="e.g. Taxi to client meeting" />
      <div class="inline-row"><div><label>Category</label><select id="acc">${exp.map((a) => `<option value="${a.id}">${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select></div>
        <div><label>Amount paid (£)</label><input id="amount" type="number" step="0.01" min="0" /></div></div>
      <label>VAT</label><select id="tax"><option value="">No VAT</option>${taxRates.filter((t) => t.rate > 0).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Submit claim</button>');
    const { close } = modal('New expense claim', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/expense-claims`, { method: 'POST', body: JSON.stringify({
          claimant: body.querySelector('#who').value, date: body.querySelector('#date').value, description: body.querySelector('#desc').value,
          accountId: body.querySelector('#acc').value, amount: Number(body.querySelector('#amount').value), taxRateId: body.querySelector('#tax').value || null }) });
        close(); flash('Claim submitted'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  async function openReimburse(claim) {
    const { accounts } = await api(`/api/orgs/${state.orgId}/accounts`);
    const banks = accounts.filter((a) => a.type === 'asset');
    const body = h(`<div><p class="muted-inline">Reimburse <b>${esc(claim.claimant)}</b> ${money(claim.amount)} for "${esc(claim.description)}".</p>
      <div class="inline-row"><div><label>From account</label><select id="bank">${banks.map((b) => `<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join('')}</select></div>
        <div><label>Date</label><input type="date" id="date" value="${today()}" /></div></div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Reimburse &amp; post</button>');
    const { close } = modal('Reimburse claim', body, save);
    save.addEventListener('click', async () => {
      try { await api(`/api/orgs/${state.orgId}/expense-claims/${claim.id}/reimburse`, { method: 'POST', body: JSON.stringify({ paymentAccountId: body.querySelector('#bank').value, date: body.querySelector('#date').value }) }); close(); flash('Reimbursed & posted'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- year-end & setup ----------
  async function renderYearEnd(c) {
    const orgId = state.orgId;
    if (!isBookkeeper()) { c.innerHTML = '<div class="card"><div class="card-body empty">These tools are managed by your bookkeeper.</div></div>'; return; }
    const [{ accounts }, { assets }, dash, { options: trackOptions }] = await Promise.all([
      api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/fixed-assets`), api(`/api/orgs/${orgId}/dashboard`), api(`/api/orgs/${orgId}/tracking`),
    ]);
    const assetAccts = accounts.filter((a) => a.type === 'asset');
    c.innerHTML = '';

    // VAT scheme
    const scheme = currentOrg().vatScheme || 'accrual';
    const flat = currentOrg().flatRate || 0;
    const vatPeriod = currentOrg().vatPeriod || 'quarterly';
    const vatCard = h(`<div class="card"><div class="card-head"><h2>VAT scheme &amp; filing</h2></div>
      <div class="card-body">
        <div class="inline-row">
          <div><label>Scheme</label><select id="scheme">
            <option value="accrual" ${scheme === 'accrual' ? 'selected' : ''}>Standard (accrual)</option>
            <option value="cash" ${scheme === 'cash' ? 'selected' : ''}>Cash accounting</option>
            <option value="flat" ${scheme === 'flat' ? 'selected' : ''}>Flat rate</option></select></div>
          <div><label>Filing frequency</label><select id="period">
            <option value="quarterly" ${vatPeriod === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            <option value="monthly" ${vatPeriod === 'monthly' ? 'selected' : ''}>Monthly</option></select></div>
          <div><label>Flat rate % (if flat scheme)</label><input id="flat" type="number" step="0.5" value="${flat}" /></div>
        </div>
        <button class="btn small" id="saveVat" style="margin-top:12px">Save VAT settings</button>
      </div></div>`);
    c.appendChild(vatCard);
    vatCard.querySelector('#saveVat').addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${orgId}/settings`, { method: 'PUT', body: JSON.stringify({ vatScheme: vatCard.querySelector('#scheme').value, flatRate: Number(vatCard.querySelector('#flat').value), vatPeriod: vatCard.querySelector('#period').value }) });
        const me = await api('/api/me'); state.orgs = me.orgs;
        flash('VAT settings saved');
      } catch (e) { flash(e.message, true); }
    });

    // Tracking categories
    const trkCard = h(`<div class="card"><div class="card-head"><h2>Tracking categories</h2><div class="spacer"></div>
      <input id="trkNew" placeholder="e.g. Kitchen" style="width:auto" /><button class="btn small" id="trkAdd">Add</button></div>
      <div class="card-body"><span class="muted-inline">Tag transactions with a category (department, location, project…) to see income and profit split by category in the <b>Tracking</b> report.</span>
        <div id="trkList" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"></div></div></div>`);
    const trkList = trkCard.querySelector('#trkList');
    if (!trackOptions.length) trkList.appendChild(h('<span class="muted-inline">No categories yet.</span>'));
    trackOptions.forEach((o) => {
      const chip = h(`<span class="pill liability" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px">${esc(o.name)} <span style="cursor:pointer;color:var(--danger);font-weight:700">×</span></span>`);
      chip.querySelector('span:last-child').addEventListener('click', async () => { await api(`/api/orgs/${orgId}/tracking/${o.id}`, { method: 'DELETE' }); renderApp(); });
      trkList.appendChild(chip);
    });
    c.appendChild(trkCard);
    const addTrk = async () => { const v = trkCard.querySelector('#trkNew').value.trim(); if (!v) return; try { await api(`/api/orgs/${orgId}/tracking`, { method: 'POST', body: JSON.stringify({ name: v }) }); renderApp(); } catch (e) { flash(e.message, true); } };
    trkCard.querySelector('#trkAdd').addEventListener('click', addTrk);

    // Opening balances
    const obCard = h(`<div class="card"><div class="card-head"><h2>Opening balances</h2><div class="spacer"></div>
      <button class="btn small" id="ob">Enter opening balances</button></div>
      <div class="card-body"><span class="muted-inline">Set each account's starting balance when moving onto Lumi mid-year. Anything that doesn't balance is parked in the Opening Balances Suspense account for you to resolve.</span></div></div>`);
    c.appendChild(obCard);
    obCard.querySelector('#ob').addEventListener('click', () => openOpeningBalances(accounts));

    // Fixed assets
    const faCard = h(`<div class="card"><div class="card-head"><h2>Fixed assets &amp; depreciation</h2><div class="spacer"></div>
      <button class="btn small" id="addAsset">+ Add asset</button></div>
      <div class="card-body flush"><table><thead><tr>
        <th>Asset</th><th>Account</th><th class="num">Cost</th><th class="num">Per month</th><th class="num">Accum.</th><th class="num">Net book value</th><th></th>
      </tr></thead><tbody id="ar"></tbody></table></div></div>`);
    const ar = faCard.querySelector('#ar');
    if (!assets.length) ar.appendChild(h('<tr><td colspan="7" class="empty">No fixed assets yet.</td></tr>'));
    assets.forEach((a) => {
      const row = h(`<tr><td><b>${esc(a.name)}</b></td><td class="subtle">${esc(a.accountName || '')}</td>
        <td class="num">${money(a.cost)}</td><td class="num">${money(a.monthly)}</td>
        <td class="num">${money(a.accumulated || 0)}</td><td class="num"><b>${money(a.netBookValue)}</b></td>
        <td class="num"><button class="btn ghost small dep">Depreciate</button></td></tr>`);
      row.querySelector('.dep').addEventListener('click', async () => {
        try { const r = await api(`/api/orgs/${orgId}/fixed-assets/${a.id}/depreciate`, { method: 'POST', body: JSON.stringify({ asOf: today() }) }); flash(`Posted ${money(r.charge)} depreciation`); renderApp(); }
        catch (e) { flash(e.message, true); }
      });
      ar.appendChild(row);
    });
    c.appendChild(faCard);
    faCard.querySelector('#addAsset').addEventListener('click', () => openAddAsset(assetAccts));

    // Year-end close
    const lock = currentOrg().lockDate;
    const yeCard = h(`<div class="card"><div class="card-head"><h2>Year-end close</h2></div>
      <div class="card-body">
        <p class="muted-inline">This year's profit so far is <b>${money(dash.netProfitYtd)}</b>, with an estimated corporation tax of <b>${money(dash.corporationTax.tax)}</b>. Closing the year locks everything up to the date you choose so it can't be changed after filing. ${lock ? `Currently locked to <b>${esc(lock)}</b>.` : ''}</p>
        <div class="inline-row" style="max-width:320px"><div><label>Year-end date</label><input type="date" id="yedate" value="2026-12-31" /></div></div>
        <button class="btn small" id="closeYear" style="margin-top:12px">Lock the year</button>
      </div></div>`);
    c.appendChild(yeCard);
    yeCard.querySelector('#closeYear').addEventListener('click', async () => {
      const d = yeCard.querySelector('#yedate').value;
      if (!confirm(`Lock all transactions up to ${d}? Entries on or before then can't be changed afterwards.`)) return;
      try { await api(`/api/orgs/${orgId}/lock`, { method: 'PUT', body: JSON.stringify({ lockDate: d }) }); currentOrg().lockDate = d; const me = await api('/api/me'); state.orgs = me.orgs; flash('Year locked'); renderApp(); }
      catch (e) { flash(e.message, true); }
    });
  }

  function openOpeningBalances(accounts) {
    const accOpts = accounts.map((a) => `<option value="${a.id}">${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const body = h(`<div>
      <div class="inline-row"><div><label>As at date</label><input type="date" id="date" value="2026-01-01" /></div><div></div></div>
      <label style="margin-top:14px">Balances</label>
      <div class="line-row"><span class="head">Account</span><span class="head num">Debit</span><span class="head num">Credit</span><span></span></div>
      <div id="lines"></div>
      <button class="btn ghost small" id="addLine" type="button">+ Add line</button>
      <div class="balance-note" id="bal"></div>
      <div class="err" id="err"></div></div>`);
    const wrap = body.querySelector('#lines');
    const recompute = () => {
      let d = 0, cr = 0;
      wrap.querySelectorAll('.line-row').forEach((r) => { d += Number(r.querySelector('.dr').value || 0); cr += Number(r.querySelector('.cr').value || 0); });
      const diff = Math.round((d - cr) * 100) / 100;
      body.querySelector('#bal').innerHTML = `Debits ${money(d)} · Credits ${money(cr)} · ${diff === 0 ? 'Balanced' : `${money(Math.abs(diff))} will go to Suspense`}`;
    };
    const addLine = () => {
      const row = h(`<div class="line-row"><select class="acc">${accOpts}</select>
        <input class="dr num" type="number" step="0.01" min="0" placeholder="0.00" />
        <input class="cr num" type="number" step="0.01" min="0" placeholder="0.00" />
        <button class="rm" type="button">×</button></div>`);
      row.querySelector('.rm').addEventListener('click', () => { row.remove(); recompute(); });
      row.querySelectorAll('input').forEach((i) => i.addEventListener('input', recompute));
      wrap.appendChild(row);
    };
    addLine(); addLine(); recompute();
    body.querySelector('#addLine').addEventListener('click', addLine);
    const save = h('<button class="btn">Post opening balances</button>');
    const { close } = modal('Opening balances', body, save);
    save.addEventListener('click', async () => {
      const entries = [...wrap.querySelectorAll('.line-row')].map((r) => ({ accountId: r.querySelector('.acc').value, debit: Number(r.querySelector('.dr').value || 0), credit: Number(r.querySelector('.cr').value || 0) }));
      try { await api(`/api/orgs/${state.orgId}/opening-balances`, { method: 'POST', body: JSON.stringify({ date: body.querySelector('#date').value, entries }) }); close(); flash('Opening balances posted'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function openAddAsset(assetAccts) {
    const body = h(`<div>
      <label>Asset name</label><input id="name" placeholder="e.g. Espresso machine" />
      <div class="inline-row">
        <div><label>Cost (£)</label><input id="cost" type="number" step="0.01" min="0" /></div>
        <div><label>Purchase date</label><input id="date" type="date" value="${today()}" /></div>
      </div>
      <div class="inline-row">
        <div><label>Useful life (years)</label><input id="life" type="number" step="1" min="1" value="5" /></div>
        <div><label>Asset account</label><select id="acc">${assetAccts.map((a) => `<option value="${a.id}" ${a.code === '1400' ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Add asset</button>');
    const { close } = modal('New fixed asset', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/fixed-assets`, { method: 'POST', body: JSON.stringify({
          name: body.querySelector('#name').value, cost: Number(body.querySelector('#cost').value),
          purchaseDate: body.querySelector('#date').value, usefulLifeYears: Number(body.querySelector('#life').value),
          assetAccountId: body.querySelector('#acc').value }) });
        close(); flash('Asset added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- audit / activity log ----------
  async function renderAudit(c) {
    const { entries } = await api(`/api/orgs/${state.orgId}/audit`);
    c.innerHTML = '';
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Activity log</h2><div class="spacer"></div>
          <span class="subtle">Every change, with who and when</span></div>
        <div class="card-body flush"><table><thead><tr>
          <th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Detail</th>
        </tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    if (!entries.length) tb.appendChild(h('<tr><td colspan="5" class="empty">No activity recorded yet.</td></tr>'));
    const when = (iso) => { const d = new Date(iso); return d.toLocaleString(); };
    entries.forEach((e) => tb.appendChild(h(`<tr>
      <td class="subtle" style="white-space:nowrap">${esc(when(e.at))}</td>
      <td>${esc(e.userName)}</td>
      <td><span class="pill ${e.action === 'delete' || e.action === 'void' ? 'bad' : 'ok'}">${esc(e.action)}</span></td>
      <td>${esc(e.entity)}</td>
      <td class="subtle">${esc(e.detail || '—')}</td></tr>`)));
    c.appendChild(card);
  }

  // ---------- chart of accounts ----------
  async function renderAccounts(c) {
    const orgId = state.orgId;
    const { accounts } = await api(`/api/orgs/${orgId}/accounts`);
    c.innerHTML = '';
    const card = h(`
      <div class="card">
        <div class="card-head"><h2>Chart of Accounts</h2><div class="spacer"></div>
          <button class="btn small" id="newAcc">+ New account</button></div>
        <div class="card-body flush"><table><thead><tr>
          <th>Code</th><th>Account name</th><th>Type</th>
        </tr></thead><tbody id="rows"></tbody></table></div>
      </div>`);
    const tb = card.querySelector('#rows');
    accounts.forEach((a) => tb.appendChild(h(`<tr>
      <td><b>${esc(a.code)}</b></td><td>${esc(a.name)}</td>
      <td><span class="pill ${a.type}">${a.type}</span></td></tr>`)));
    c.appendChild(card);
    card.querySelector('#newAcc').addEventListener('click', () => openNewAccount());
  }

  // ---------- reports ----------
  async function renderTrialBalance(c) {
    const orgId = state.orgId;
    let asOf = today();
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/trial-balance?asOf=${asOf}`);
      c.innerHTML = '';
      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar">
            <h2>Trial Balance</h2><div class="spacer"></div>
            <label>As at</label><input type="date" id="asOf" value="${asOf}" />
            <span class="pill ${r.balanced ? 'ok' : 'bad'}">${r.balanced ? '✓ Balanced' : '✗ Out of balance'}</span>
          </div>
          <div class="card-body flush"><table><thead><tr>
            <th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th>
          </tr></thead><tbody id="rows"></tbody></table></div>
        </div>`);
      const tb = card.querySelector('#rows');
      if (!r.rows.length) tb.appendChild(h('<tr><td colspan="4" class="empty">No postings yet.</td></tr>'));
      r.rows.forEach((row) => {
        const tr = h(`<tr class="drill" title="Click to see transactions"><td><b>${esc(row.code)}</b></td><td>${esc(row.name)}</td>
          <td class="num">${row.debit ? money(row.debit) : ''}</td>
          <td class="num">${row.credit ? money(row.credit) : ''}</td></tr>`);
        if (row.accountId) tr.addEventListener('click', () => openAccountLedger(row.accountId));
        tb.appendChild(tr);
      });
      tb.appendChild(h(`<tr class="total-row"><td></td><td>Totals</td>
        <td class="num">${money(r.totalDebit)}</td><td class="num">${money(r.totalCredit)}</td></tr>`));
      c.appendChild(card);
      addReportExports(card, `Trial Balance ${asOf}`, [['Code', 'Account', 'Type', 'Debit', 'Credit'],
        ...r.rows.map((x) => [x.code, x.name, x.type, x.debit, x.credit]), ['', 'Totals', '', r.totalDebit, r.totalCredit]]);
      card.querySelector('#asOf').addEventListener('change', (e) => { asOf = e.target.value; draw(); });
    };
    await draw();
  }

  async function renderProfitLoss(c) {
    const orgId = state.orgId;
    let from = '2026-01-01', to = today();
    let compare = false;
    const priorRange = () => {
      const f = new Date(from), t = new Date(to);
      const len = Math.round((t - f) / 86400000);
      const pt = new Date(f.getTime() - 86400000);
      const pf = new Date(pt.getTime() - len * 86400000);
      return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
    };
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/profit-loss?from=${from}&to=${to}`);
      let prior = null, pr = null;
      if (compare) { pr = priorRange(); prior = await api(`/api/orgs/${orgId}/reports/profit-loss?from=${pr.from}&to=${pr.to}`); }
      const priorMap = new Map();
      if (prior) [...prior.income, ...prior.expenses].forEach((x) => priorMap.set(x.code, x.amount));
      c.innerHTML = '';
      const cols = compare ? 4 : 2;
      const margin = r.totalIncome ? (r.netProfit / r.totalIncome * 100) : 0;
      const priorMargin = prior && prior.totalIncome ? (prior.netProfit / prior.totalIncome * 100) : null;
      const band = reportSummary([
        { label: 'Total income', value: money(r.totalIncome), tone: 'pos' },
        { label: 'Total expenses', value: money(r.totalExpense) },
        { label: 'Net profit', value: money(r.netProfit), tone: r.netProfit >= 0 ? 'pos' : 'neg', sub: `${margin.toFixed(1)}% net margin${priorMargin !== null ? ` · was ${priorMargin.toFixed(1)}%` : ''}` },
      ]);
      band.appendChild(compositionBar([
        { label: 'Income', value: r.totalIncome, color: 'var(--gold)' },
        { label: 'Expenses', value: r.totalExpense, color: '#cdbfa0' },
      ]));
      c.appendChild(band);
      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar">
            <h2>Profit &amp; Loss</h2><div class="spacer"></div>
            <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="cmp" ${compare ? 'checked' : ''} style="width:auto" /> Compare prior period</label>
            <label>From</label><input type="date" id="from" value="${from}" />
            <label>To</label><input type="date" id="to" value="${to}" />
          </div>
          <div class="card-body flush"><table>
          ${compare ? `<thead><tr><th>Account</th><th class="num">This period</th><th class="num">Prior period</th><th class="num">Change</th></tr></thead>` : ''}
          <tbody id="rows"></tbody></table></div>
        </div>`);
      const tb = card.querySelector('#rows');
      const section = (title) => tb.appendChild(h(`<tr><td colspan="${cols}" style="background:#fafbfc;font-weight:700">${title}</td></tr>`));
      const cmpCells = (code, amount) => {
        if (!compare) return `<td class="num">${money(amount)}</td>`;
        const p = priorMap.get(code) || 0; const chg = Math.round((amount - p) * 100) / 100;
        return `<td class="num">${money(amount)}</td><td class="num subtle">${money(p)}</td><td class="num" style="color:${chg >= 0 ? 'var(--brand-dark)' : 'var(--danger)'}">${chg >= 0 ? '+' : ''}${money(chg)}</td>`;
      };
      const drillRow = (i) => { const tr = h(`<tr class="drill" title="Click to see transactions"><td>${esc(i.code)} · ${esc(i.name)}</td>${cmpCells(i.code, i.amount)}</tr>`); if (i.accountId) tr.addEventListener('click', () => openAccountLedger(i.accountId)); return tr; };
      const totalRow = (label, amount, priorAmount, colour) => {
        let cells = `<td class="num"${colour ? ` style="color:${colour}"` : ''}>${money(amount)}</td>`;
        if (compare) { const chg = Math.round((amount - priorAmount) * 100) / 100; cells += `<td class="num subtle">${money(priorAmount)}</td><td class="num" style="color:${chg >= 0 ? 'var(--brand-dark)' : 'var(--danger)'}">${chg >= 0 ? '+' : ''}${money(chg)}</td>`; }
        return h(`<tr class="total-row"><td>${label}</td>${cells}</tr>`);
      };
      section('Income');
      r.income.length ? r.income.forEach((i) => tb.appendChild(drillRow(i))) : tb.appendChild(h(`<tr><td class="subtle">No income</td><td class="num">0.00</td>${compare ? '<td></td><td></td>' : ''}</tr>`));
      tb.appendChild(totalRow('Total income', r.totalIncome, prior ? prior.totalIncome : 0));
      section('Expenses');
      r.expenses.length ? r.expenses.forEach((i) => tb.appendChild(drillRow(i))) : tb.appendChild(h(`<tr><td class="subtle">No expenses</td><td class="num">0.00</td>${compare ? '<td></td><td></td>' : ''}</tr>`));
      tb.appendChild(totalRow('Total expenses', r.totalExpense, prior ? prior.totalExpense : 0));
      tb.appendChild(totalRow('Net profit', r.netProfit, prior ? prior.netProfit : 0, r.netProfit >= 0 ? 'var(--brand-dark)' : 'var(--danger)'));
      c.appendChild(card);
      addReportExports(card, `Profit and Loss ${from} to ${to}`, [['Section', 'Account', 'Amount'],
        ...r.income.map((i) => ['Income', `${i.code} ${i.name}`, i.amount]), ['', 'Total income', r.totalIncome],
        ...r.expenses.map((i) => ['Expense', `${i.code} ${i.name}`, i.amount]), ['', 'Total expenses', r.totalExpense],
        ['', 'Net profit', r.netProfit]]);
      card.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; draw(); });
      card.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; draw(); });
      card.querySelector('#cmp').addEventListener('change', (e) => { compare = e.target.checked; draw(); });
    };
    await draw();
  }

  async function renderBalanceSheet(c) {
    const orgId = state.orgId;
    let asOf = today();
    const draw = async () => {
      const r = await api(`/api/orgs/${orgId}/reports/balance-sheet?asOf=${asOf}`);
      c.innerHTML = '';
      const block = (title, rows, total, totalLabel) => `
        <tr><td colspan="2" style="background:#fafbfc;font-weight:700">${title}</td></tr>
        ${rows.length ? rows.map((x) => `<tr class="${x.accountId ? 'drill' : ''}" data-acc="${x.accountId || ''}" title="${x.accountId ? 'Click to see transactions' : ''}"><td>${esc(x.code)} · ${esc(x.name)}</td><td class="num">${money(x.amount)}</td></tr>`).join('')
          : '<tr><td class="subtle">None</td><td class="num">0.00</td></tr>'}
        <tr class="total-row"><td>${totalLabel}</td><td class="num">${money(total)}</td></tr>`;
      const band = reportSummary([
        { label: 'Total assets', value: money(r.totalAssets), tone: 'pos' },
        { label: 'Total liabilities', value: money(r.totalLiabilities) },
        { label: 'Net assets (equity)', value: money(r.totalEquity), tone: r.totalEquity >= 0 ? 'pos' : 'neg', sub: r.balanced ? 'Balance sheet balances' : 'Out of balance' },
      ]);
      band.appendChild(compositionBar([
        { label: 'Liabilities', value: r.totalLiabilities, color: '#cdbfa0' },
        { label: 'Equity', value: r.totalEquity, color: 'var(--gold)' },
      ]));
      c.appendChild(band);
      const card = h(`
        <div class="card">
          <div class="card-head report-toolbar">
            <h2>Balance Sheet</h2><div class="spacer"></div>
            <label>As at</label><input type="date" id="asOf" value="${asOf}" />
            <span class="pill ${r.balanced ? 'ok' : 'bad'}">${r.balanced ? '✓ Balanced' : '✗ Out of balance'}</span>
          </div>
          <div class="card-body flush"><table><tbody>
            ${block('Assets', r.assets, r.totalAssets, 'Total assets')}
            ${block('Liabilities', r.liabilities, r.totalLiabilities, 'Total liabilities')}
            ${block('Equity', r.equity, r.totalEquity, 'Total equity')}
            <tr class="total-row"><td>Liabilities + Equity</td><td class="num">${money(r.totalLiabilities + r.totalEquity)}</td></tr>
          </tbody></table></div>
        </div>`);
      c.appendChild(card);
      card.querySelectorAll('[data-acc]').forEach((tr) => { const id = tr.getAttribute('data-acc'); if (id) tr.addEventListener('click', () => openAccountLedger(id)); });
      addReportExports(card, `Balance Sheet ${asOf}`, [['Section', 'Account', 'Amount'],
        ...r.assets.map((x) => ['Asset', `${x.code} ${x.name}`, x.amount]), ['', 'Total assets', r.totalAssets],
        ...r.liabilities.map((x) => ['Liability', `${x.code} ${x.name}`, x.amount]), ['', 'Total liabilities', r.totalLiabilities],
        ...r.equity.map((x) => ['Equity', `${x.code} ${x.name}`, x.amount]), ['', 'Total equity', r.totalEquity]]);
      card.querySelector('#asOf').addEventListener('change', (e) => { asOf = e.target.value; draw(); });
    };
    await draw();
  }

  // ---------- modals ----------
  function modal(title, bodyNode, footNode) {
    const bg = h('<div class="modal-bg"></div>');
    const m = h(`<div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="x">×</button></div></div>`);
    const body = h('<div class="modal-body"></div>'); body.appendChild(bodyNode); m.appendChild(body);
    if (footNode) { const foot = h('<div class="modal-foot"></div>'); foot.appendChild(footNode); m.appendChild(foot); }
    bg.appendChild(m); document.body.appendChild(bg);
    const close = () => bg.remove();
    m.querySelector('.x').addEventListener('click', close);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    return { bg, close };
  }

  async function openTransactionModal(existing, opts) {
    const orgId = state.orgId;
    const editing = !!existing;
    opts = opts || {};
    const [{ accounts }, { options: tracking }] = await Promise.all([
      api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tracking`),
    ]);
    const opt = (sel) => accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
    const trackOpts = `<option value="">— none —</option>` + tracking.map((t) => `<option value="${t.id}" ${editing && existing.trackingId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const body = h(`<div>
      <div class="inline-row">
        <div><label>Date</label><input type="date" id="date" value="${editing ? esc(existing.date) : today()}" /></div>
        <div><label>Reference</label><input id="ref" placeholder="e.g. INV-204" value="${editing ? esc(existing.reference || '') : ''}" /></div>
      </div>
      <label>Description</label><input id="desc" placeholder="What was this for?" value="${editing ? esc(existing.description) : ''}" />
      ${tracking.length ? `<label>Tracking category</label><select id="tracking">${trackOpts}</select>` : ''}
      <label style="margin-top:18px">Journal lines</label>
      <div class="line-row"><span class="head">Account</span><span class="head num">Debit</span><span class="head num">Credit</span><span></span></div>
      <div id="lines"></div>
      <button class="btn ghost small" id="addLine" type="button">+ Add line</button>
      <div class="balance-note" id="bal"></div>
      ${editing ? '' : '<label style="margin-top:18px">Supporting document (optional)</label><input type="file" id="doc" />'}
      <div class="err" id="err"></div>
    </div>`);
    const linesWrap = body.querySelector('#lines');
    const addLine = (preset) => {
      const row = h(`<div class="line-row">
        <select class="acc">${opt(preset && preset.accountId)}</select>
        <input class="dr num" type="number" step="0.01" min="0" placeholder="0.00" value="${preset && preset.debit ? preset.debit : ''}" />
        <input class="cr num" type="number" step="0.01" min="0" placeholder="0.00" value="${preset && preset.credit ? preset.credit : ''}" />
        <button class="rm" type="button">×</button></div>`);
      row.querySelector('.rm').addEventListener('click', () => { row.remove(); recompute(); });
      row.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => {
        const dr = row.querySelector('.dr'), cr = row.querySelector('.cr');
        if (i.classList.contains('dr') && i.value) cr.value = '';
        if (i.classList.contains('cr') && i.value) dr.value = '';
        recompute();
      }));
      linesWrap.appendChild(row);
    };
    const recompute = () => {
      let d = 0, cr = 0;
      linesWrap.querySelectorAll('.line-row').forEach((r) => { d += Number(r.querySelector('.dr').value || 0); cr += Number(r.querySelector('.cr').value || 0); });
      const note = body.querySelector('#bal');
      const diff = Math.round((d - cr) * 100) / 100;
      note.textContent = `Debits ${money(d)}  ·  Credits ${money(cr)}  ·  ${diff === 0 ? 'Balanced ✓' : 'Difference ' + money(Math.abs(diff))}`;
      note.style.color = diff === 0 ? 'var(--brand-dark)' : 'var(--danger)';
    };
    if (editing) existing.lines.forEach((l) => addLine(l));
    else { addLine(); addLine(); }
    recompute();
    body.querySelector('#addLine').addEventListener('click', () => addLine());

    const save = h(`<button class="btn">${editing ? 'Save changes' : 'Post transaction'}</button>`);
    const foot = document.createElement('div'); foot.style.display = 'contents';
    if (editing) {
      const del = h('<button class="btn secondary" style="color:var(--danger)">Delete</button>');
      del.addEventListener('click', async () => {
        if (!confirm('Delete this transaction permanently?')) return;
        try { await api(`/api/orgs/${orgId}/transactions/${existing.id}`, { method: 'DELETE' }); close(); flash('Transaction deleted'); renderApp(); }
        catch (e) { body.querySelector('#err').textContent = e.message; }
      });
      foot.append(del);
    }
    foot.append(save);
    const { close } = modal(editing ? 'Edit transaction' : 'New transaction', body, foot);
    save.addEventListener('click', async () => {
      const err = body.querySelector('#err'); err.textContent = '';
      const lines = [...linesWrap.querySelectorAll('.line-row')].map((r) => ({
        accountId: r.querySelector('.acc').value,
        debit: Number(r.querySelector('.dr').value || 0),
        credit: Number(r.querySelector('.cr').value || 0),
      }));
      const payload = { date: body.querySelector('#date').value, description: body.querySelector('#desc').value, reference: body.querySelector('#ref').value, lines, trackingId: body.querySelector('#tracking') ? (body.querySelector('#tracking').value || null) : undefined };
      try {
        if (editing) {
          await api(`/api/orgs/${orgId}/transactions/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const { transaction } = await api(`/api/orgs/${orgId}/transactions`, { method: 'POST', body: JSON.stringify(payload) });
          const file = body.querySelector('#doc') && body.querySelector('#doc').files[0];
          if (file) await uploadDoc(orgId, transaction.id, file);
          if (opts.attachInboxId) await api(`/api/orgs/${orgId}/inbox/${opts.attachInboxId}/attach`, { method: 'POST', body: JSON.stringify({ transactionId: transaction.id }) });
        }
        close(); flash(editing ? 'Transaction updated' : 'Transaction posted'); renderApp();
      } catch (e) { err.textContent = e.message; }
    });
  }

  async function uploadDoc(orgId, txnId, file) {
    const fd = new FormData(); fd.append('document', file);
    const res = await fetch(`/api/orgs/${orgId}/transactions/${txnId}/attachments`, { method: 'POST', body: fd, credentials: 'same-origin' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
  }

  function openUpload(txn) {
    const body = h(`<div><p class="muted-inline">Attach a receipt, invoice, or statement to <b>${esc(txn.description)}</b>.</p>
      <label>Document</label><input type="file" id="doc" /><div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Upload</button>');
    const { close } = modal('Add supporting document', body, save);
    save.addEventListener('click', async () => {
      const file = body.querySelector('#doc').files[0];
      if (!file) { body.querySelector('#err').textContent = 'Choose a file first.'; return; }
      try { await uploadDoc(state.orgId, txn.id, file); close(); flash('Document uploaded'); renderApp(); }
      catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  function openNewAccount() {
    const body = h(`<div>
      <div class="inline-row">
        <div><label>Code</label><input id="code" placeholder="e.g. 6500" /></div>
        <div><label>Type</label><select id="type">
          <option value="asset">Asset</option><option value="liability">Liability</option>
          <option value="equity">Equity</option><option value="income">Income</option>
          <option value="expense">Expense</option></select></div>
      </div>
      <label>Account name</label><input id="name" placeholder="e.g. Marketing" />
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Add account</button>');
    const { close } = modal('New account', body, save);
    save.addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${state.orgId}/accounts`, { method: 'POST', body: JSON.stringify({
          code: body.querySelector('#code').value, name: body.querySelector('#name').value, type: body.querySelector('#type').value }) });
        close(); flash('Account added'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  // ---------- plain-English guided entry ----------
  async function openGuided(type) {
    // type: 'sale' (money in) or 'expense' (money out)
    const orgId = state.orgId;
    const isSale = type === 'sale';
    const [{ accounts }, { taxRates }] = await Promise.all([
      api(`/api/orgs/${orgId}/accounts`), api(`/api/orgs/${orgId}/tax-rates`),
    ]);
    const cats = accounts.filter((a) => (isSale ? a.type === 'income' : a.type === 'expense'));
    const banks = accounts.filter((a) => a.type === 'asset' && /^10\d\d$/.test(a.code));
    const vat = accounts.find((a) => a.code === '2100');
    const rateById = new Map(taxRates.map((t) => [t.id, t.rate]));
    const body = h(`<div>
      <p class="muted-inline">${isSale ? "Record money you've received. We'll handle the bookkeeping behind the scenes." : "Record money you've paid out. We'll handle the bookkeeping behind the scenes."}</p>
      <div class="inline-row" style="margin-top:8px">
        <div><label>Date</label><input type="date" id="date" value="${today()}" /></div>
        <div><label>${isSale ? 'Who paid you? (optional)' : 'Who did you pay? (optional)'}</label><input id="who" placeholder="${isSale ? 'Customer name' : 'Supplier name'}" /></div>
      </div>
      <label>What was it for?</label><input id="desc" placeholder="${isSale ? 'e.g. Catering for office party' : 'e.g. Coffee beans'}" />
      <div class="inline-row">
        <div><label>${isSale ? 'Type of income' : 'Type of expense'}</label><select id="cat">${cats.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div><label>Total amount (£)</label><input id="amount" type="number" step="0.01" min="0" placeholder="0.00" /></div>
      </div>
      <div class="inline-row">
        <div><label>VAT</label><select id="tax"><option value="">No VAT</option>${taxRates.filter((t) => t.rate > 0).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
        <div><label>${isSale ? 'Paid into' : 'Paid from'}</label><select id="bank">${banks.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      </div>
      <div class="balance-note" id="bd"></div>
      <div class="err" id="err"></div>
    </div>`);
    const bd = body.querySelector('#bd');
    const recompute = () => {
      const gross = Number(body.querySelector('#amount').value || 0);
      const rate = rateById.get(body.querySelector('#tax').value) || 0;
      const net = rate ? Math.round((gross / (1 + rate / 100)) * 100) / 100 : gross;
      const tax = Math.round((gross - net) * 100) / 100;
      bd.innerHTML = rate ? `Net ${money(net)} &nbsp;+&nbsp; VAT ${money(tax)} &nbsp;=&nbsp; <b>${money(gross)}</b>` : `Total ${money(gross)}`;
    };
    body.querySelector('#amount').addEventListener('input', recompute);
    body.querySelector('#tax').addEventListener('change', recompute);
    recompute();

    const save = h(`<button class="btn">${isSale ? 'Record sale' : 'Record expense'}</button>`);
    const { close } = modal(isSale ? 'Record a sale' : 'Record an expense', body, save);
    save.addEventListener('click', async () => {
      const err = body.querySelector('#err'); err.textContent = '';
      const gross = Math.round(Number(body.querySelector('#amount').value || 0) * 100) / 100;
      if (gross <= 0) { err.textContent = 'Enter an amount.'; return; }
      const rate = rateById.get(body.querySelector('#tax').value) || 0;
      const net = rate ? Math.round((gross / (1 + rate / 100)) * 100) / 100 : gross;
      const tax = Math.round((gross - net) * 100) / 100;
      const catId = body.querySelector('#cat').value, bankId = body.querySelector('#bank').value;
      const who = body.querySelector('#who').value.trim();
      const desc = body.querySelector('#desc').value.trim() || (isSale ? 'Sale' : 'Expense');
      const description = who ? `${desc} — ${who}` : desc;
      let lines;
      if (isSale) {
        lines = [{ accountId: bankId, debit: gross, credit: 0 }, { accountId: catId, debit: 0, credit: net }];
        if (tax > 0 && vat) lines.push({ accountId: vat.id, debit: 0, credit: tax });
      } else {
        lines = [{ accountId: catId, debit: net, credit: 0 }];
        if (tax > 0 && vat) lines.push({ accountId: vat.id, debit: tax, credit: 0 });
        lines.push({ accountId: bankId, debit: 0, credit: gross });
      }
      try {
        await api(`/api/orgs/${orgId}/transactions`, { method: 'POST', body: JSON.stringify({ date: body.querySelector('#date').value, description, lines }) });
        close(); flash(isSale ? 'Sale recorded' : 'Expense recorded'); renderApp();
      } catch (e) { err.textContent = e.message; }
    });
  }

  const GLOSSARY = [
    ['Debit & credit', 'The two sides of every bookkeeping entry. Every transaction has equal debits and credits — Lumi balances them for you, so you rarely need to think about it.'],
    ['Debtors (Accounts Receivable)', 'Money owed to you by customers — invoices you\'ve sent that haven\'t been paid yet.'],
    ['Creditors (Accounts Payable)', 'Money you owe to suppliers — bills you\'ve received that you haven\'t paid yet.'],
    ['Trial balance', 'A list of every account and its balance. Total debits should equal total credits — it\'s a quick check the books are in balance.'],
    ['Profit & Loss', 'Your income minus your expenses over a period — whether you made a profit or a loss.'],
    ['Balance sheet', 'A snapshot of what you own (assets), owe (liabilities) and the owner\'s stake (equity) on a given date.'],
    ['Reconciliation', 'Ticking off your records against your actual bank statement so the two agree.'],
    ['VAT (output / input)', 'Output tax is the VAT you charge customers; input tax is the VAT you\'re charged and can usually reclaim. You pay HMRC the difference.'],
    ['Net / gross', 'Net is the amount before VAT; gross is the amount including VAT.'],
    ['Chart of accounts', 'The list of categories you sort transactions into (sales, rent, wages, and so on).'],
  ];
  function openGlossary() {
    const body = h(`<div>${GLOSSARY.map(([t, d]) => `<div style="margin-bottom:14px"><div style="font-weight:700">${esc(t)}</div><div class="muted-inline">${esc(d)}</div></div>`).join('')}</div>`);
    modal('Plain-English glossary', body);
  }

  async function openProfileModal() {
    const org = currentOrg();
    const logoSrc = org.hasLogo ? `/api/orgs/${org.id}/logo?t=${Date.now()}` : '';
    const comp = (await api(`/api/orgs/${org.id}/company`)).company;
    const body = h(`<div>
      <label>Your name</label><input id="name" value="${esc(state.user.name)}" />
      <button class="btn small" id="saveName" style="margin-top:10px">Save name</button>
      <div style="border-top:1px solid var(--line);margin:22px 0 0;padding-top:18px">
        <h2 style="font-size:15px;margin:0 0 4px">Company details</h2>
        <p class="muted-inline">These appear on the invoices you generate.</p>
        <label>Business name</label><input id="cName" value="${esc(comp.name)}" />
        <label>Address</label><textarea id="cAddr" rows="2">${esc(comp.address)}</textarea>
        <div class="inline-row">
          <div><label>VAT number</label><input id="cVat" value="${esc(comp.vatNo)}" /></div>
          <div><label>Company reg. no.</label><input id="cReg" value="${esc(comp.regNo)}" /></div>
        </div>
        <div class="inline-row">
          <div><label>Email</label><input id="cEmail" value="${esc(comp.email)}" /></div>
          <div><label>Phone</label><input id="cPhone" value="${esc(comp.phone)}" /></div>
        </div>
        <div class="inline-row">
          <div><label>Bank / payment details</label><input id="cBank" value="${esc(comp.bankDetails)}" /></div>
          <div><label>Default payment terms (days)</label><input id="cTerms" type="number" min="0" step="1" value="${comp.paymentTermsDays}" /></div>
        </div>
        <div class="inline-row">
          <div><label>Stock valuation method</label><select id="cStock">
            <option value="avco" ${comp.stockMethod === 'avco' ? 'selected' : ''}>AVCO (weighted average)</option>
            <option value="fifo" ${comp.stockMethod === 'fifo' ? 'selected' : ''}>FIFO (first in, first out)</option></select></div>
          <div></div>
        </div>
        <label style="margin-top:6px">Document number prefixes</label>
        <div class="inline-row">
          <div><label class="subtle" style="font-weight:500">Invoices</label><input id="cInvP" value="${esc(comp.invoicePrefix)}" /></div>
          <div><label class="subtle" style="font-weight:500">Bills</label><input id="cBillP" value="${esc(comp.billPrefix)}" /></div>
          <div><label class="subtle" style="font-weight:500">Quotes</label><input id="cQuoP" value="${esc(comp.quotePrefix)}" /></div>
        </div>
        <button class="btn small" id="saveCompany" style="margin-top:12px">Save company details</button>
      </div>
      <div style="border-top:1px solid var(--line);margin:22px 0 0;padding-top:18px">
        <h2 style="font-size:15px;margin:0 0 4px">Company logo</h2>
        <p class="muted-inline">Shown on the invoices you generate for <b>${esc(org.name || '')}</b>.</p>
        <div style="display:flex;align-items:center;gap:16px;margin-top:12px">
          <div id="logoBox" style="width:130px;height:70px;border:1px solid var(--cream-3);border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--cream);overflow:hidden">
            <img id="logoImg" src="${logoSrc}" style="max-width:100%;max-height:100%;${logoSrc ? '' : 'display:none'}"/>
            <span id="logoNone" class="muted-inline" style="${logoSrc ? 'display:none' : ''}">No logo</span>
          </div>
          <div>
            <input type="file" id="logoFile" accept="image/*" style="max-width:230px" />
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn small" id="uploadLogo">Upload</button>
              <button class="btn ghost small" id="removeLogo" style="${logoSrc ? '' : 'display:none'}">Remove</button>
            </div>
          </div>
        </div>
      </div>
      <div style="border-top:1px solid var(--line);margin:22px 0 0;padding-top:18px">
        <h2 style="font-size:15px;margin:0 0 4px">Your data</h2>
        <p class="muted-inline">Download a full backup of this business's books (accounts, transactions, invoices, payroll and more) as a JSON file.</p>
        <button class="btn secondary small" id="backup" style="margin-top:10px">Download backup</button>
      </div>
      <div style="border-top:1px solid var(--line);margin:22px 0 0;padding-top:18px">
        <h2 style="font-size:15px;margin:0 0 4px">Change password</h2>
        <label>Current password</label><input id="cur" type="password" />
        <div class="inline-row">
          <div><label>New password</label><input id="new" type="password" /></div>
          <div><label>Confirm new</label><input id="conf" type="password" /></div>
        </div>
      </div>
      <div class="err" id="err"></div>
      <div style="color:var(--brand-dark);font-size:13px;font-weight:600;min-height:16px" id="ok"></div>
    </div>`);
    const savePw = h('<button class="btn">Update password</button>');
    const { close } = modal('Account settings', body, savePw);
    body.querySelector('#backup').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = `/api/orgs/${org.id}/export`; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
      flash('Backup downloading…');
    });
    body.querySelector('#saveCompany').addEventListener('click', async () => {
      try {
        const r = await api(`/api/orgs/${org.id}/company`, { method: 'PUT', body: JSON.stringify({
          name: body.querySelector('#cName').value, companyAddress: body.querySelector('#cAddr').value,
          companyVatNo: body.querySelector('#cVat').value, companyRegNo: body.querySelector('#cReg').value,
          companyEmail: body.querySelector('#cEmail').value, companyPhone: body.querySelector('#cPhone').value,
          bankDetails: body.querySelector('#cBank').value, paymentTermsDays: Number(body.querySelector('#cTerms').value),
          invoicePrefix: body.querySelector('#cInvP').value, billPrefix: body.querySelector('#cBillP').value, quotePrefix: body.querySelector('#cQuoP').value,
          stockMethod: body.querySelector('#cStock').value }) });
        const me = await api('/api/me'); state.orgs = me.orgs;
        flash('Company details saved');
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
    body.querySelector('#uploadLogo').addEventListener('click', async () => {
      const f = body.querySelector('#logoFile').files[0];
      if (!f) { body.querySelector('#err').textContent = 'Choose an image first.'; return; }
      const fd = new FormData(); fd.append('logo', f);
      try {
        const res = await fetch(`/api/orgs/${org.id}/logo`, { method: 'POST', body: fd, credentials: 'same-origin' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
        org.hasLogo = true;
        const img = body.querySelector('#logoImg'); img.src = `/api/orgs/${org.id}/logo?t=${Date.now()}`; img.style.display = '';
        body.querySelector('#logoNone').style.display = 'none';
        body.querySelector('#removeLogo').style.display = '';
        flash('Logo uploaded');
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
    body.querySelector('#removeLogo').addEventListener('click', async () => {
      try {
        await api(`/api/orgs/${org.id}/logo`, { method: 'DELETE' });
        org.hasLogo = false;
        body.querySelector('#logoImg').style.display = 'none';
        body.querySelector('#logoNone').style.display = '';
        body.querySelector('#removeLogo').style.display = 'none';
        flash('Logo removed');
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
    body.querySelector('#saveName').addEventListener('click', async () => {
      try {
        const r = await api('/api/me/profile', { method: 'PUT', body: JSON.stringify({ name: body.querySelector('#name').value }) });
        state.user = r.user; body.querySelector('#ok').textContent = 'Name updated'; flash('Name updated'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
    savePw.addEventListener('click', async () => {
      const err = body.querySelector('#err'); err.textContent = '';
      const np = body.querySelector('#new').value;
      if (np !== body.querySelector('#conf').value) { err.textContent = 'New passwords do not match.'; return; }
      try {
        await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: body.querySelector('#cur').value, newPassword: np }) });
        close(); flash('Password updated');
      } catch (e) { err.textContent = e.message; }
    });
  }

  function openAddClient() {
    const body = h(`<div>
      <label>Client business name</label><input id="name" placeholder="e.g. Bright Cafe Ltd" />
      <p class="muted-inline" style="margin-top:18px">Optionally create a login so your client can access their own books.</p>
      <div class="inline-row">
        <div><label>Client name</label><input id="cname" placeholder="Full name" /></div>
        <div><label>Client email</label><input id="cemail" type="email" placeholder="client@email.com" /></div>
      </div>
      <label>Temporary password</label><input id="cpass" type="text" placeholder="They can change it later" />
      <div class="err" id="err"></div></div>`);
    const save = h('<button class="btn">Create client</button>');
    const { close } = modal('Add a client', body, save);
    save.addEventListener('click', async () => {
      try {
        const { org } = await api('/api/orgs', { method: 'POST', body: JSON.stringify({
          name: body.querySelector('#name').value,
          clientName: body.querySelector('#cname').value,
          clientEmail: body.querySelector('#cemail').value,
          clientPassword: body.querySelector('#cpass').value,
        }) });
        const me = await api('/api/me'); state.orgs = me.orgs; state.orgId = org.id; state.view = 'dashboard';
        close(); flash('Client created'); renderApp();
      } catch (e) { body.querySelector('#err').textContent = e.message; }
    });
  }

  return { init };
})();

App.init();
