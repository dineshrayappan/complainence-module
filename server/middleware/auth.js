const jwt = require('jsonwebtoken');
const { isMongoConnected, connectDB } = require('../config/db');
const User = require('../models/User');
const mockStore = require('../config/mockStore');

const verifyToken = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // 1. Support client-side mock tokens (used in offline/demo fallback mode)
      if (token.startsWith('mock-token-')) {
        const parts = token.split('-');
        const role = parts[2] || 'AUDITOR';
        let mockUser = mockStore.getUsers().find((u) => u.role === role);
        if (!mockUser) {
          mockUser = mockStore.getUsers()[0];
        }
        req.user = mockUser;
        return next();
      }

      // 2. Verify JWT token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'garment_qms_super_secret_jwt_key_2026_sewing_audit'
      );

      let user = null;

      // Ensure MongoDB connection is active in serverless execution
      if (!isMongoConnected()) {
        try {
          await connectDB();
        } catch (dbErr) {
          console.warn('[AuthMiddleware] DB connection retry notice:', dbErr.message);
        }
      }

      // Try MongoDB lookup if connected
      if (isMongoConnected()) {
        try {
          const query = {
            $or: [
              { employeeId: decoded.id },
              { email: decoded.id },
            ],
          };
          if (decoded.id && decoded.id.match(/^[0-9a-fA-F]{24}$/)) {
            query.$or.unshift({ _id: decoded.id });
          }

          const found = await User.findOne(query).select('-password').lean();
          if (found) {
            user = { ...found, id: found._id.toString() };
          }
        } catch (dbErr) {
          console.warn('[AuthMiddleware] MongoDB query notice:', dbErr.message);
        }
      }

      // Fallback to mockStore
      if (!user) {
        user =
          mockStore.findUserById(decoded.id) ||
          mockStore.getUsers().find(
            (u) =>
              u.employeeId === decoded.id ||
              u._id === decoded.id ||
              u.id === decoded.id ||
              u.email === decoded.id
          );
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User account associated with this token no longer exists.',
        });
      }

      if (user.isDeleted) {
        return res.status(401).json({
          success: false,
          message: 'Account has been deleted / archived. Session revoked.',
        });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'This user account is currently deactivated.',
        });
      }

      req.user = user;
      next();
    } catch (err) {
      console.error('[AuthMiddleware] Token verification failed:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token. Please sign in again.',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token missing. Please sign in to access this resource.',
    });
  }
};

// Role-based Access Control Middleware
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before role check.',
      });
    }

    const isOwner = req.user.role === 'OWNER' || req.user.isOwner;
    const isUniversal =
      isOwner ||
      req.user.employeeId === 'ALL-001' ||
      req.user.email === 'all@factory.com' ||
      req.user.role === 'SUPERADMIN' ||
      req.user.isUniversal ||
      req.user.hasAllRoles;

    if (!isUniversal && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${req.user.role}' is not authorized to perform this operation. Allowed: [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
};

// Executive Owner Only Middleware
const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required before Owner authorization check.',
    });
  }

  const isOwner = req.user.role === 'OWNER' || req.user.isOwner;
  if (!isOwner) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Private Executive Owner authorization required.',
    });
  }

  next();
};

module.exports = { verifyToken, requireRole, requireOwner };
