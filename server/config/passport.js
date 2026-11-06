const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');

const setupPassport = () => {
  // 1. Local Strategy for Login (Supports Email, Admin ID, Teacher ID, or USN)
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'identifier', // can be email, adminId, teacherId, or usn
        passwordField: 'password',
        passReqToCallback: true
      },
      async (req, identifier, password, done) => {
        try {
          const trimmed = identifier ? identifier.trim() : '';
          const role = req.body.role; // optional role hint

          // Build query to find by email OR specific actor ID
          const orConditions = [
            { email: trimmed.toLowerCase() },
            { adminId: trimmed },
            { teacherId: trimmed },
            { usn: trimmed.toUpperCase() }
          ];

          let query = { $or: orConditions };
          if (role) {
            query.role = role;
          }

          const user = await User.findOne(query);

          if (!user) {
            return done(null, false, { message: 'Invalid credentials or user not found' });
          }

          if (!user.isActive) {
            return done(null, false, { message: 'Account is deactivated. Contact Admin.' });
          }

          const isMatch = await user.comparePassword(password);
          if (!isMatch) {
            return done(null, false, { message: 'Invalid password' });
          }

          return done(null, user);
        } catch (err) {
          return done(err, false);
        }
      }
    )
  );

  // 2. JWT Strategy for Token-based Route Protection
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'metricsedu_smart_classroom_jwt_secret_token_2026'
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
      try {
        const user = await User.findById(jwtPayload.id);
        if (user && user.isActive) {
          return done(null, user);
        }
        return done(null, false);
      } catch (err) {
        return done(err, false);
      }
    })
  );
};

module.exports = setupPassport;
