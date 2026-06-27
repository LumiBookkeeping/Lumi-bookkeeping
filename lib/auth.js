// Authentication & authorisation helpers.
const bcrypt = require('bcryptjs');
const store = require('./store');

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function checkPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function getUser(req) {
  if (!req.session || !req.session.userId) return null;
  return store.find('users', (u) => u.id === req.session.userId) || null;
}

// Orgs (client businesses) this user may access.
function userOrgs(user) {
  if (!user) return [];
  if (user.role === 'bookkeeper') {
    // Practice staff see every org they have a membership for.
    const mine = new Set(
      store.filter('memberships', (m) => m.userId === user.id).map((m) => m.orgId)
    );
    return store.filter('organizations', (o) => mine.has(o.id));
  }
  const mine = new Set(
    store.filter('memberships', (m) => m.userId === user.id).map((m) => m.orgId)
  );
  return store.filter('organizations', (o) => mine.has(o.id));
}

function canAccessOrg(user, orgId) {
  if (!user) return false;
  return store.find('memberships', (m) => m.userId === user.id && m.orgId === orgId) != null;
}

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  req.user = user;
  next();
}

// Middleware factory: ensures req.params.orgId (or body.orgId) is accessible.
function requireOrg(req, res, next) {
  const orgId = req.params.orgId || req.body.orgId || req.query.orgId;
  if (!orgId) return res.status(400).json({ error: 'Missing organization.' });
  if (!canAccessOrg(req.user, orgId)) {
    return res.status(403).json({ error: 'You do not have access to this organization.' });
  }
  req.orgId = orgId;
  next();
}

module.exports = {
  hashPassword,
  checkPassword,
  getUser,
  userOrgs,
  canAccessOrg,
  requireAuth,
  requireOrg,
};
