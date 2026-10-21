const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { isMongoConnected, connectDB } = require('../config/db');
const User = require('../models/User');
const mockStore = require('../config/mockStore');
const {
  recordDailyLoginAttendance,
  getDailyAttendanceMap,
  evaluateUserDailyAttendance,
  getTodayISTString,
} = require('../utils/attendanceHelper');
const { logEvent } = require('../utils/eventLogger');

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'garment_qms_super_secret_jwt_key_2026_sewing_audit',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// Formats a user row for consistent API response
const formatUserResponse = (user, expectedRole) => {
  if (!user) return null;
  const isUniversal =
    user.employeeId === 'ALL-001' ||
    user.email === 'all@factory.com' ||
    user.role === 'SUPERADMIN' ||
    user.isUniversal ||
    user.hasAllRoles;

  let activeRole = user.role === 'SUPERVISOR' ? 'ACTION_PERSON' : user.role;
  if (isUniversal && expectedRole) {
    activeRole =
      expectedRole === 'SUPERVISOR' || expectedRole === 'ACTION_PERSON'
        ? 'ACTION_PERSON'
        : expectedRole;
  }

  const isPresent = typeof user.isPresent !== 'undefined' ? Boolean(user.isPresent) : false;

  return {
    _id: user._id ? user._id.toString() : user.id,
    id: user._id ? user._id.toString() : user.id,
    employeeId: user.employeeId,
    name: user.name,
    email: user.email,
    role: activeRole,
    department: user.department,
    designation: user.designation,
    mobileNumber: user.mobileNumber,
    isActive: typeof user.isActive !== 'undefined' ? user.isActive : true,
    isPresent,
    attendance: isPresent ? 'Present' : 'Absent',
    attendanceStatus: isPresent ? 'Present' : 'Absent',
    attendanceDate: user.attendanceDate || null,
    loginTimestamp: user.loginTimestamp || user.lastLoginAt || null,
    lastLoginAt: user.lastLoginAt || null,
    lastLogoutAt: user.lastLogoutAt || null,
    isUniversal: !!isUniversal,
    hasAllRoles: !!isUniversal,
  };
};

// @desc    Sign in user with email or employeeId & password
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { identifier, email, employeeId, password, expectedRole } = req.body;
    const queryIdentifier = (identifier || email || employeeId || '').trim();

    if (!queryIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both an Email/Employee ID and password.',
      });
    }

    // 1. If MongoDB is connected (or can be connected), attempt authentication from MongoDB
    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const searchTerms = [queryIdentifier];
        const qLower = queryIdentifier.toLowerCase();
        if (qLower === 'admin' || qLower === 'adm-001') {
          searchTerms.push('admin@factory.com', 'admin@admin.com', 'ADMIN', 'ADM-001');
        }

        const orFilters = searchTerms.flatMap((term) => [
          { email: { $regex: new RegExp(`^${term}$`, 'i') } },
          { employeeId: { $regex: new RegExp(`^${term}$`, 'i') } },
        ]);

        const user = await User.findOne({ $or: orFilters });

        if (user) {
          const isMatch = await user.matchPassword(password);
          if (!isMatch) {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials. Incorrect password.',
            });
          }

          if (user.isActive === false) {
            return res.status(403).json({
              success: false,
              message: 'This account has been deactivated.',
            });
          }

          const now = new Date();
          user.isPresent = true;
          user.lastLoginAt = now;
          user.attendanceDate = getTodayISTString(now);
          user.attendanceStatus = 'Present';
          user.loginTimestamp = now;

          // Record daily attendance in database
          try {
            await recordDailyLoginAttendance(user, now);
          } catch (attErr) {
            console.warn('[AuthController:login] Attendance record notice:', attErr.message);
          }

          const token = generateToken(user._id.toString());

          // Event log
          logEvent({
            req,
            action: 'AUTH_LOGIN_SUCCESS',
            actionLabel: 'User Signed In',
            category: 'AUTH',
            severity: 'SUCCESS',
            entityType: 'USER',
            entityId: user.employeeId,
            entityName: user.name,
            details: `User ${user.name} (${user.employeeId}) signed in as ${user.role}.`,
            payload: { role: user.role, department: user.department },
          });

          return res.status(200).json({
            success: true,
            token,
            user: formatUserResponse(user, expectedRole),
          });
        }
      } catch (dbErr) {
        console.warn('[AuthController:login] MongoDB lookup error, trying fallback:', dbErr.message);
      }
    }

    // 2. Fallback to mockStore
    if (!user) {
      logEvent({
        req,
        action: 'AUTH_LOGIN_FAILED',
        actionLabel: 'Failed Login: User Not Found',
        category: 'SECURITY',
        severity: 'WARNING',
        entityType: 'AUTH',
        entityId: queryIdentifier,
        details: `Login attempt failed: account '${queryIdentifier}' not found.`,
      });
      return res.status(401).json({
        success: false,
        message: `Account '${queryIdentifier}' not found. Please check your credentials.`,
      });
    }

    let isMatch = false;
    if (user.password) {
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, user.password);
      } else {
        isMatch = user.password === password;
      }
    }

    if (!isMatch) {
      logEvent({
        req,
        action: 'AUTH_LOGIN_FAILED',
        actionLabel: 'Failed Login: Bad Password',
        category: 'SECURITY',
        severity: 'WARNING',
        entityType: 'AUTH',
        entityId: queryIdentifier,
        details: `Invalid password attempt for account '${queryIdentifier}'.`,
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.',
      });
    }

    const now = new Date();
    user.isPresent = true;
    user.lastLoginAt = now;
    user.attendanceDate = getTodayISTString(now);
    user.attendanceStatus = 'Present';
    user.loginTimestamp = now;

    try {
      await recordDailyLoginAttendance(user, now);
    } catch (attErr) {
      console.warn('[AuthController:login:fallback] Attendance record notice:', attErr.message);
    }

    const token = generateToken(user._id || user.id);

    // Event log
    logEvent({
      req,
      action: 'AUTH_LOGIN_SUCCESS',
      actionLabel: 'User Signed In',
      category: 'AUTH',
      severity: 'SUCCESS',
      entityType: 'USER',
      entityId: user.employeeId,
      entityName: user.name,
      details: `User ${user.name} (${user.employeeId}) signed in as ${user.role}.`,
      payload: { role: user.role, department: user.department },
    });

    return res.status(200).json({
      success: true,
      token,
      user: formatUserResponse(user, expectedRole),
    });
  } catch (error) {
    console.error('[AuthController:login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during sign in.',
      error: error.message,
    });
  }
};

// @desc    Register a new user account
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      email,
      password,
      role,
      department,
      designation,
      mobileNumber,
    } = req.body;

    if (!employeeId || !name || !email || !password || !department || !designation) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required for account registration.',
      });
    }

    let normalizedRole = 'ACTION_PERSON';
    if (role === 'ADMIN') {
      normalizedRole = 'ADMIN';
    } else if (role === 'AUDITOR') {
      normalizedRole = 'AUDITOR';
    }

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const existing = await User.findOne({
          $or: [
            { email: email.trim().toLowerCase() },
            { employeeId: employeeId.trim().toUpperCase() },
          ],
        });

        if (existing) {
          const isEmailMatch = existing.email.toLowerCase() === email.trim().toLowerCase();
          return res.status(400).json({
            success: false,
            message: isEmailMatch
              ? 'An account with this email address already exists.'
              : 'An account with this Employee ID already exists.',
          });
        }

        const newUser = await User.create({
          employeeId: employeeId.toUpperCase().trim(),
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
          role: normalizedRole,
          department: department.trim(),
          designation: designation.trim(),
          mobileNumber: (mobileNumber || '').trim(),
          isActive: true,
        });

        const token = generateToken(newUser._id.toString());
        return res.status(201).json({
          success: true,
          message: `Account registered successfully as ${normalizedRole === 'AUDITOR' ? 'Quality Auditor' : 'Line Supervisor'}.`,
          token,
          user: formatUserResponse(newUser),
        });
      } catch (dbErr) {
        console.warn('[AuthController:register] DB error, using fallback:', dbErr.message);
      }
    }

    // Fallback store
    const newUser = mockStore.createUser({
      employeeId: employeeId.toUpperCase().trim(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: normalizedRole,
      department: department.trim(),
      designation: designation.trim(),
      mobileNumber: (mobileNumber || '').trim(),
    });

    const token = generateToken(newUser._id);
    return res.status(201).json({
      success: true,
      message: `Account registered successfully as ${normalizedRole === 'AUDITOR' ? 'Quality Auditor' : 'Line Supervisor'}.`,
      token,
      user: formatUserResponse(newUser),
    });
  } catch (error) {
    console.error('[AuthController:register] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user registration.',
      error: error.message,
    });
  }
};

// @desc    Get currently authenticated user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const todayDate = getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected() && userId) {
      try {
        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }
        const data = await User.findOne(query).select('-password').lean();

        if (data) {
          const att = evaluateUserDailyAttendance(data, attendanceMap, todayDate);
          data.isPresent = att.isPresent;
          data.attendanceStatus = att.attendanceStatus;
          data.loginTimestamp = att.loginTimestamp;
          data.attendanceDate = att.date;

          return res.status(200).json({
            success: true,
            user: formatUserResponse(data),
          });
        }
      } catch (e) {
        // continue to fallback
      }
    }

    const fallbackUser = mockStore.findUserById(userId) || req.user;
    if (fallbackUser) {
      const att = evaluateUserDailyAttendance(fallbackUser, attendanceMap, todayDate);
      fallbackUser.isPresent = att.isPresent;
      fallbackUser.attendanceStatus = att.attendanceStatus;
      fallbackUser.loginTimestamp = att.loginTimestamp;
      fallbackUser.attendanceDate = att.date;
    }
    res.status(200).json({
      success: true,
      user: formatUserResponse(fallbackUser),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile.',
      error: error.message,
    });
  }
};

// @desc    Sign out user (daily attendance status is PRESERVED as Present for the current business day)
// @route   POST /api/auth/logout
// @access  Public / Private
const logout = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.body?.userId;
    const now = new Date();

    if (isMongoConnected() && userId) {
      try {
        const query = { $or: [{ employeeId: userId }, { email: userId }] };
        if (typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }
        // Record logout timestamp only. DO NOT reset attendance status to Absent;
        // Daily attendance remains "Present" for the entire day.
        await User.updateMany(query, {
          lastLogoutAt: now,
        });
      } catch (e) {
        console.warn('[AuthController:logout] MongoDB logout update error:', e.message);
      }
    }

    if (userId) {
      mockStore.updateUser(userId.toString(), {
        lastLogoutAt: now,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'User signed out. Daily attendance status remains Present for today.',
    });
  } catch (error) {
    console.error('[AuthController:logout] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error during logout.',
      error: error.message,
    });
  }
};

module.exports = {
  login,
  register,
  getMe,
  logout,
};
