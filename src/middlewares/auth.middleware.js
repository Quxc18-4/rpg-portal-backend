const jwt = require('jsonwebtoken');
const ApiResponse = require('../utils/apiResponse.util');

const ROLE_LEVELS = {
  GUEST: 0,
  USER: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

const GUEST_USER = {
  uuid: null,
  username: 'Guest',
  role: 'GUEST',
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'UNAUTHORIZED', 401);
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { ...decoded, role: decoded.role || 'USER' };
    next();
  } catch (error) {
    const messageKey = error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return ApiResponse.error(res, messageKey, 401);
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { ...decoded, role: decoded.role || 'USER' };
      return next();
    } catch (_) {
      req.user = { ...GUEST_USER };
      return next();
    }
  }
  req.user = { ...GUEST_USER };
  next();
};

const requireMinRole = (minRole) => (req, res, next) => {
  const currentRole = req.user?.role || 'GUEST';
  const currentLevel = ROLE_LEVELS[currentRole] ?? 0;
  const requiredLevel = ROLE_LEVELS[minRole] ?? 0;

  if (currentLevel < requiredLevel) {
    return ApiResponse.error(res, 'FORBIDDEN', 403);
  }
  next();
};

module.exports = {
  ROLE_LEVELS,
  requireAuth,
  optionalAuth,
  requireMinRole,
};