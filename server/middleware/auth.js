const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Valid authentication token required.'
    });
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error('JWT_SECRET is required to authenticate requests.'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive account.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
    }
    return next(error);
  }
};

// Role-based authorization middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access denied for role '${req.user.role}'. Required: ${roles.join(', ')}`
      });
    }
    next();
  };
};

module.exports = {
  requireAuth,
  authorizeRoles,
  isAdmin: authorizeRoles('admin'),
  isTeacher: authorizeRoles('teacher', 'admin'),
  isStudent: authorizeRoles('student')
};
