const jwt = require('jsonwebtoken');
const { isMongoConnected, connectDB } = require('../config/db');
const User = require('../models/User');
const mockStore = require('../config/mockStore');
const { getUserModel, getCanonicalUnitId } = require('../models/unitModels');

const isCompanyAdmin = (user) => {
  if (!user) return false;
  return Boolean(
    user.role === 'ADMIN' ||
    user.role === 'OWNER' ||
    user.role === 'SUPERADMIN' ||
    user.isOwner ||
    user.employeeId === 'ALL-001' ||
    user.employeeId === 'OWNER-001' ||
    user.employeeId === 'ADM-001' ||
    user.email === 'all@factory.com' ||
    user.isUniversal ||
    user.hasAllRoles
  );
};

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
        req.isCompanyAdmin = isCompanyAdmin(mockUser);
        req.activeUnitId = 'UNIT-1';
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

      // Try MongoDB lookup from unit1_users, unit2_users, or fallback User
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

          const User1 = getUserModel('UNIT-1');
          const User2 = getUserModel('UNIT-2');
          let found = null;
          if (decoded.unitId === 'UNIT-2') {
            found = await User2.findOne(query).select('-password').lean();
            if (!found) found = await User1.findOne(query).select('-password').lean();
          } else {
            found = await User1.findOne(query).select('-password').lean();
            if (!found) found = await User2.findOne(query).select('-password').lean();
          }
          if (!found) {
            found = await User.findOne(query).select('-password').lean();
          }

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

      // Ensure unit assignment is strictly Unit 1 or Unit 2
      user.unitId = user.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1';
      user.unitName = user.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1';

      req.user = user;
      req.isCompanyAdmin = isCompanyAdmin(user);

      // Extract requested unit from header or query param
      const rawHeaderUnit = req.headers['x-unit-id'] || req.headers['unit-id'];
      const rawQueryUnit = req.query?.unitId;
      const requestedUnit = ((rawHeaderUnit || rawQueryUnit || '').toString()).trim().toUpperCase();

      if (req.isCompanyAdmin) {
        // Company Admin can toggle strictly between Unit 1 and Unit 2 (No 'ALL')
        req.activeUnitId = requestedUnit === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1';
      } else {
        // Unit-level member is strictly locked to their assigned unit
        const userUnit = user.unitId;
        req.activeUnitId = userUnit;

        // Block unauthorized cross-unit requests
        if (requestedUnit && requestedUnit !== userUnit) {
          return res.status(403).json({
            success: false,
            message: `Access denied. You are assigned to ${user.unitName} and cannot access data for ${requestedUnit === 'UNIT-2' ? 'Unit 2' : 'Unit 1'}.`,
          });
        }
      }

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

// Enforce that a record matches the user's unit (or user is company admin)
const enforceUnitMatch = (recordUnitId, req, res) => {
  if (req.isCompanyAdmin) return true;
  // If record has no assigned unit yet (legacy unassigned), allow access to avoid breaking workflows
  if (!recordUnitId || recordUnitId === 'UNASSIGNED') return true;

  const userUnit = (req.user?.unitId || '').toString().trim().toUpperCase();
  const targetUnit = (recordUnitId || '').toString().trim().toUpperCase();

  if (userUnit && targetUnit && userUnit !== targetUnit) {
    res.status(403).json({
      success: false,
      message: `Access denied. Record belongs to ${targetUnit}, but your account is assigned to ${userUnit}.`,
    });
    return false;
  }
  return true;
};

module.exports = { verifyToken, requireRole, requireOwner, isCompanyAdmin, enforceUnitMatch };

