const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { isMongoConnected } = require('../config/db');
const User = require('../models/User');
const mockStore = require('../config/mockStore');

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

    // 1. If MongoDB is connected, attempt authentication from MongoDB
    if (isMongoConnected()) {
      try {
        const user = await User.findOne({
          $or: [
            { email: { $regex: new RegExp(`^${queryIdentifier}$`, 'i') } },
            { employeeId: { $regex: new RegExp(`^${queryIdentifier}$`, 'i') } },
          ],
        });

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

          const token = generateToken(user._id.toString());
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
    const user = mockStore.findUserByIdentifier(queryIdentifier);
    if (!user) {
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

    const token = generateToken(user._id || user.id);
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

module.exports = {
  login,
  register,
  getMe,
};
