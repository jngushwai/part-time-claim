const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dit-claims-secret-2024';
const SUPER_ADMIN_EMAIL = 'admin@dit.ac.tz';

function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN' || (user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
}

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    decoded.role = isSuperAdmin(decoded) ? 'SUPER_ADMIN' : (decoded.role || 'TEACHER');
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Super Admin privileges required' });
  }
  next();
};

auth.isSuperAdmin = isSuperAdmin;
auth.requireSuperAdmin = requireSuperAdmin;
auth.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;

module.exports = auth;
