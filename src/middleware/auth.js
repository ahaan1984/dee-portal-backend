const jwt = require('jsonwebtoken');

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) return res.status(403).json({ error: 'No token provided' });

  const bearerToken = token.split(' ')[1];

  jwt.verify(bearerToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Unauthorized: invalid token');
      return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
    req.user = decoded; // Attach decoded token to request
    next();
  });
};

// Middleware to check authorization based on roles
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      console.error(`Access denied for role: ${req.user.role}`);
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

// Predefined roles for clarity
const Roles = {
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
  VIEWER: 'viewer',
};

module.exports = { verifyToken, authorizeRole, Roles };
