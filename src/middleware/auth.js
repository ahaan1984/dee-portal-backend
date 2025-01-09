const { decodeToken, isRoleAuthorized } = require('./authUtils');
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'No token provided' });

  const bearerToken = token.split(' ')[1];
  try {
    req.user = decodeToken(bearerToken); // Attach decoded token to request
    next();
  } catch (error) {
    console.error(error.message);
    res.status(401).json({ error: error.message });
  }
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    try {
      isRoleAuthorized(req.user, roles);
      next();
    } catch (error) {
      console.error(error.message);
      res.status(403).json({ error: error.message });
    }
  };
};

const Roles = {
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
  VIEWER: 'viewer',
};

module.exports = { verifyToken, authorizeRole, Roles };
