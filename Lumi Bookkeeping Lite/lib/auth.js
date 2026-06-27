// Cookie-session auth + access guards for Lumi Bookkeeping Lite.
const crypto = require('crypto');
const store = require('./store');

const sessions = new Map(); // token -> userId

function newSession(userId) { const token = crypto.randomBytes(24).toString('base64url'); sessions.set(token, userId); return token; }
function endSession(token) { sessions.delete(token); }

function parseCookies(req) {
  const out = {}; const raw = req.headers.cookie || '';
  raw.split(';').forEach((p) => { const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

function requireAuth(req, res, next) {
  const token = parseCookies(req).lumi_lite;
  const userId = token && sessions.get(token);
  if (!userId) return res.status(401).json({ error: 'Please sign in.' });
  const user = store.byId('users', userId);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = user; req.token = token; next();
}

// Confirms the signed-in user can access the business in :businessId.
function requireBusiness(req, res, next) {
  const businessId = req.params.businessId;
  const m = store.find('memberships', (x) => x.userId === req.user.id && x.businessId === businessId);
  if (!m) return res.status(403).json({ error: 'You do not have access to this business.' });
  req.businessId = businessId; req.membership = m; next();
}

module.exports = { sessions, newSession, endSession, parseCookies, requireAuth, requireBusiness };
