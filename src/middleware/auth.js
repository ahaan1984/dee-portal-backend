const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  console.log('Incoming token:', token); // Log the token

  if (!token) return res.status(403).json({ error: 'No token provided' });

  const bearerToken = token.split(' ')[1];

  jwt.verify(bearerToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Unauthorized: invalid token');
      return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
    console.log('Decoded token:', decoded); // Log decoded token
    req.user = decoded;
    next();
  });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      console.log('Forbidden: Insufficient permissions');
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRole };