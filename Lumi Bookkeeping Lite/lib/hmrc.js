// HMRC Making Tax Digital integration — OAuth 2.0 + API client.
// Talks to the Sandbox by default (test-api.service.hmrc.gov.uk); flip env to
// 'production' once recognised. Developer-app credentials live in the local store
// (fine for sandbox dev); for production they should move to a secrets manager.
const crypto = require('crypto');
const store = require('./store');

const BASES = {
  sandbox: 'https://test-api.service.hmrc.gov.uk',
  production: 'https://api.service.hmrc.gov.uk',
};
const ACCEPT = 'application/vnd.hmrc.1.0+json';
// HMRC API versions (each API versions independently). Easy to bump if a call 404/406s.
const V = { vat: '1.0', businessDetails: '2.0', obligations: '3.0', selfEmployment: '5.0', calculations: '8.0' };

function config() { return store.all('hmrcApp')[0] || null; }
function isConfigured() { const c = config(); return !!(c && c.clientId && c.clientSecret && c.redirectUri); }
function base() { const c = config(); return BASES[(c && c.env) || 'sandbox']; }

function saveConfig({ clientId, clientSecret, env, redirectUri, scopes }) {
  const existing = config();
  const row = {
    clientId: (clientId || '').trim(),
    clientSecret: (clientSecret || (existing && existing.clientSecret) || '').trim(), // keep old secret if blank
    env: env === 'production' ? 'production' : 'sandbox',
    redirectUri: (redirectUri || '').trim(),
    scopes: (scopes || 'hello').trim(),
  };
  if (existing) return store.update('hmrcApp', existing.id, row);
  return store.insert('hmrcApp', row);
}
// What's safe to send to the browser (never the secret).
function publicConfig() {
  const c = config();
  if (!c) return { configured: false };
  return { configured: isConfigured(), env: c.env, redirectUri: c.redirectUri, scopes: c.scopes, clientId: c.clientId || '', secretSet: !!c.clientSecret };
}

function authorizeUrl(state) {
  const c = config();
  const p = new URLSearchParams({ response_type: 'code', client_id: c.clientId, scope: c.scopes || 'hello', state, redirect_uri: c.redirectUri });
  return `${base()}/oauth/authorize?${p.toString()}`;
}

async function tokenRequest(params) {
  const r = await fetch(`${base()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.error || `Token request failed (${r.status})`);
  return data;
}
async function exchangeCode(code) {
  const c = config();
  return tokenRequest({ grant_type: 'authorization_code', client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, code });
}
async function refreshToken(refresh) {
  const c = config();
  return tokenRequest({ grant_type: 'refresh_token', client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refresh });
}

function saveTokens(businessId, data) {
  const row = {
    businessId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    scope: data.scope || '',
    expiresAt: Date.now() + (Number(data.expires_in || 14400) * 1000),
    obtainedAt: new Date().toISOString(),
  };
  const existing = store.find('hmrcTokens', (t) => t.businessId === businessId);
  if (existing) return store.update('hmrcTokens', existing.id, row);
  return store.insert('hmrcTokens', row);
}
function tokenRow(businessId) { return store.find('hmrcTokens', (t) => t.businessId === businessId) || null; }
function isConnected(businessId) { const t = tokenRow(businessId); return !!(t && t.accessToken); }
function disconnect(businessId) { store.remove('hmrcTokens', (t) => t.businessId === businessId); }

// Return a valid access token, refreshing if it's expired / about to expire.
async function accessTokenFor(businessId) {
  const t = tokenRow(businessId);
  if (!t) throw new Error('Not connected to HMRC for this business.');
  if (t.expiresAt - Date.now() > 60000) return t.accessToken;
  if (!t.refreshToken) throw new Error('HMRC session has expired — please reconnect.');
  const data = await refreshToken(t.refreshToken);
  const saved = saveTokens(businessId, data);
  return saved.accessToken;
}

// Build HMRC fraud-prevention headers for connection method WEB_APP_VIA_SERVER.
// Some values come from the browser (clientData), some the server derives (public IP).
// HMRC's validator tells us what's missing/malformed so we can refine.
function buildFraudHeaders({ clientData = {}, publicIp, publicPort, userId, now = new Date() } = {}) {
  const ts = now.toISOString();
  const h = {
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Vendor-Product-Name': encodeURIComponent('Lumi Bookkeeping Lite'),
    'Gov-Vendor-Version': 'lumi-bookkeeping-lite=1.0.0',
    'Gov-Client-Multi-Factor': '',
    'Gov-Vendor-License-IDs': clientData.deviceId ? `lumi-bookkeeping-lite=${encodeURIComponent(clientData.deviceId)}` : '',
  };
  const set = (k, v) => { if (v !== undefined && v !== null && v !== '') h[k] = v; };
  set('Gov-Client-Device-ID', clientData.deviceId);
  set('Gov-Client-User-IDs', userId ? `lumi=${encodeURIComponent(userId)}` : undefined);
  set('Gov-Client-Timezone', clientData.timezone);
  set('Gov-Client-Browser-JS-User-Agent', clientData.userAgent);
  set('Gov-Client-Browser-Do-Not-Track', clientData.dnt);
  set('Gov-Client-Browser-Plugins', clientData.plugins);
  set('Gov-Client-Screens', clientData.screens);
  set('Gov-Client-Window-Size', clientData.windowSize);
  set('Gov-Client-Local-IPs', clientData.localIps);
  set('Gov-Client-Local-IPs-Timestamp', clientData.localIps ? ts : undefined);
  set('Gov-Client-Public-IP', publicIp);
  set('Gov-Client-Public-IP-Timestamp', publicIp ? ts : undefined);
  set('Gov-Client-Public-Port', publicPort ? String(publicPort) : undefined);
  set('Gov-Vendor-Public-IP', publicIp);
  set('Gov-Vendor-Forwarded', publicIp ? `by=${publicIp}&for=${publicIp}` : undefined);
  return h;
}

// ---- VAT (MTD) ----
async function vatObligations(businessId, vrn, { from, to, status }, fraud) {
  const q = new URLSearchParams();
  if (status) q.set('status', status); if (from) q.set('from', from); if (to) q.set('to', to);
  return call(businessId, 'GET', `/organisations/vat/${vrn}/obligations?${q.toString()}`, { extraHeaders: fraud });
}
async function vatSubmitReturn(businessId, vrn, payload, fraud) {
  return call(businessId, 'POST', `/organisations/vat/${vrn}/returns`, { body: payload, extraHeaders: fraud });
}
async function vatLiabilities(businessId, vrn, { from, to }, fraud) {
  return call(businessId, 'GET', `/organisations/vat/${vrn}/liabilities?from=${from}&to=${to}`, { extraHeaders: fraud });
}
// Validate the fraud-prevention headers on this very request.
async function validateFraudHeaders(businessId, fraud) {
  return call(businessId, 'GET', '/test/fraud-prevention-headers/validate', { extraHeaders: fraud });
}

// ---- Income Tax (MTD ITSA) ----
function itsaTaxYear(start) { return `${start}-${String((start + 1) % 100).padStart(2, '0')}`; } // 2026 -> "2026-27"
// List the taxpayer's businesses (we want the self-employment income source IDs).
async function itsaBusinesses(bid, nino, fraud) {
  return call(bid, 'GET', `/individuals/business/details/${nino}/list`, { extraHeaders: fraud, version: V.businessDetails });
}
// Quarterly income & expenditure obligations.
async function itsaObligations(bid, nino, { from, to, status, typeOfBusiness, incomeSourceId }, fraud) {
  const q = new URLSearchParams();
  if (from) q.set('fromDate', from); if (to) q.set('toDate', to); if (status) q.set('status', status);
  if (typeOfBusiness) q.set('typeOfBusiness', typeOfBusiness); if (incomeSourceId) q.set('incomeSourceId', incomeSourceId);
  const qs = q.toString();
  return call(bid, 'GET', `/obligations/details/${nino}/income-and-expenditure${qs ? '?' + qs : ''}`, { extraHeaders: fraud, version: V.obligations });
}
// Create/amend the cumulative self-employment period summary (year-to-date figures).
async function itsaSubmitCumulative(bid, nino, seBusinessId, taxYear, body, fraud) {
  return call(bid, 'PUT', `/individuals/business/self-employment/${nino}/${seBusinessId}/cumulative/${taxYear}`, { body, extraHeaders: fraud, version: V.selfEmployment });
}
// Trigger and retrieve HMRC's tax calculation (the source-of-truth figure).
// The trigger endpoint's version/shape has changed across releases; try the likely
// combinations and use whichever HMRC accepts (returns the one that worked in `tried`).
async function itsaTriggerCalc(bid, nino, taxYear, fraud) {
  const candidates = [
    { v: '8.0', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}?calculationType=in-year` },
    { v: '8.0', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}` },
    { v: '7.0', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}?calculationType=in-year` },
    { v: '7.0', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}` },
    { v: '6.0', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}` },
    { v: '5.0', path: `/individuals/calculations/${nino}/self-assessment?taxYear=${taxYear}` },
  ];
  let last; const attempts = [];
  for (const c of candidates) {
    const r = await call(bid, 'POST', c.path, { extraHeaders: fraud, version: c.v });
    attempts.push({ v: c.v, status: r.status });
    last = { ...r, tried: c, attempts };
    if (r.status !== 404 && r.status !== 406) return last;
  }
  return last;
}
async function itsaGetCalc(bid, nino, taxYear, calcId, fraud, version) {
  return call(bid, 'GET', `/individuals/calculations/${nino}/self-assessment/${taxYear}/${calcId}`, { extraHeaders: fraud, version: version || V.calculations });
}

// Authenticated request against an HMRC API for a business. `version` sets the
// Accept header (HMRC versions each API separately).
async function call(businessId, method, path, { body, extraHeaders, version } = {}) {
  const token = await accessTokenFor(businessId);
  const r = await fetch(`${base()}${path}`, {
    method,
    headers: { Accept: `application/vnd.hmrc.${version || '1.0'}+json`, Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}

// Connectivity tests.
async function helloWorld() {
  const r = await fetch(`${base()}/hello/world`, { headers: { Accept: ACCEPT } });
  return { status: r.status, ok: r.ok, data: await r.json().catch(() => ({})) };
}
async function helloUser(businessId) { return call(businessId, 'GET', '/hello/user'); }

function newState() { return crypto.randomBytes(16).toString('hex'); }

// Public IP handling — on localhost the request IP is 127.0.0.1, which HMRC rejects,
// so we look up the machine's real outbound IP (cached for the process).
function isPrivateIp(ip) {
  return !ip || ip === '127.0.0.1' || ip === '::1' || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip) || /^fe80:/i.test(ip) || /^::1$/.test(ip);
}
let cachedPublicIp = null;
async function publicIp(reqIp) {
  if (reqIp && !isPrivateIp(reqIp)) return reqIp; // hosted: the request IP is already public
  if (cachedPublicIp) return cachedPublicIp;
  for (const url of ['https://api.ipify.org?format=json', 'https://api64.ipify.org?format=json']) {
    try { const r = await fetch(url); const d = await r.json(); if (d && d.ip) { cachedPublicIp = d.ip; return cachedPublicIp; } } catch (e) { /* try next */ }
  }
  return reqIp || '';
}

module.exports = {
  BASES, config, isConfigured, base, saveConfig, publicConfig, authorizeUrl,
  exchangeCode, refreshToken, saveTokens, tokenRow, isConnected, disconnect,
  accessTokenFor, buildFraudHeaders, call, helloWorld, helloUser, newState,
  vatObligations, vatSubmitReturn, vatLiabilities, validateFraudHeaders,
  isPrivateIp, publicIp,
  itsaTaxYear, itsaBusinesses, itsaObligations, itsaSubmitCumulative, itsaTriggerCalc, itsaGetCalc,
};
