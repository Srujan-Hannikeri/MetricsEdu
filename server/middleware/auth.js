const passport = require('passport');

// Middleware to authenticate using Passport JWT
const requireAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info && info.message ? info.message : 'Unauthorized: Valid authentication token required.'
      });
    }
    req.user = user;
    next();
  })(req, res, next);
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
