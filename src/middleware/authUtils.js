const jwt = require('jsonwebtoken');

const decodeToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Unauthorized: invalid token');
  }
};

// Check if a user's role is authorized
const isRoleAuthorized = (user, roles) => {
  if (!roles.includes(user.role)) {
    throw new Error(`Forbidden: Insufficient permissions for role ${user.role}`);
  }
};

module.exports = { decodeToken, isRoleAuthorized };
