const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
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
    _id: user.id || user._id,
    id: user.id || user._id,
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

    // 1. If Supabase is configured, attempt authentication from PostgreSQL
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: users, error } = await supabase
          .from('users')
          .select('*')
          .or(
            `email.ilike.${queryIdentifier},employeeId.ilike.${queryIdentifier}`
          )
          .limit(1);

        if (!error && users && users.length > 0) {
          const user = users[0];

          // Check password: bcrypt compare or direct comparison
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

          // Role portal validation
          const isUniversalUser =
            user.employeeId === 'ALL-001' ||
            user.email === 'all@factory.com' ||
            user.role === 'SUPERADMIN' ||
            user.isUniversal ||
            user.hasAllRoles;

          if (expectedRole && !isUniversalUser) {
            const isAdminPortal = expectedRole === 'ADMIN';
            const isAuditorPortal = expectedRole === 'AUDITOR';
            const isSupervisorPortal = expectedRole === 'SUPERVISOR' || expectedRole === 'ACTION_PERSON';

            if (isAdminPortal && user.role !== 'ADMIN') {
              return res.status(400).json({
                success: false,
                message: `This account (${user.name}) does not have Executive Administrator privileges. Please switch to the ${user.role === 'AUDITOR' ? 'Auditor' : 'Supervisor'} Login portal.`,
              });
            }

            if (isAuditorPortal && user.role !== 'AUDITOR') {
              return res.status(400).json({
                success: false,
                message: `This account (${user.name}) is registered as a ${user.role === 'ADMIN' ? 'System Administrator' : 'Line Supervisor'}. Please switch to the corresponding login tab.`,
              });
            }

            if (isSupervisorPortal && user.role !== 'ACTION_PERSON' && user.role !== 'SUPERVISOR') {
              return res.status(400).json({
                success: false,
                message: `This account (${user.name}) is registered as a ${user.role === 'ADMIN' ? 'System Administrator' : 'Internal Auditor'}. Please switch to the corresponding login tab.`,
              });
            }
          }

          const token = generateToken(user.id);
          return res.status(200).json({
            success: true,
            token,
            user: formatUserResponse(user, expectedRole),
          });
        }
      } catch (dbErr) {
        console.warn('[AuthController:login] Supabase lookup error, trying fallback:', dbErr.message);
      }
    }

    // 2. Resilient In-Memory Fallback
    const fallbackUser = mockStore.findUserByIdentifier(queryIdentifier);

    let isFallbackMatch = false;
    if (fallbackUser && fallbackUser.password) {
      if (fallbackUser.password.startsWith('$2a$') || fallbackUser.password.startsWith('$2b$')) {
        isFallbackMatch = await bcrypt.compare(password, fallbackUser.password);
      } else {
        isFallbackMatch = fallbackUser.password === password;
      }
    }

    if (!fallbackUser || !isFallbackMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found or incorrect password.',
      });
    }

    // Role portal validation for fallback authentication
    const isFallbackUniversal =
      fallbackUser.employeeId === 'ALL-001' ||
      fallbackUser.email === 'all@factory.com' ||
      fallbackUser.role === 'SUPERADMIN' ||
      fallbackUser.isUniversal ||
      fallbackUser.hasAllRoles;

    if (expectedRole && !isFallbackUniversal) {
      const isAdminPortal = expectedRole === 'ADMIN';
      const isAuditorPortal = expectedRole === 'AUDITOR';
      const isSupervisorPortal = expectedRole === 'SUPERVISOR' || expectedRole === 'ACTION_PERSON';

      if (isAdminPortal && fallbackUser.role !== 'ADMIN') {
        return res.status(400).json({
          success: false,
          message: `Access Denied: Account (${fallbackUser.name}) is registered as ${fallbackUser.role === 'AUDITOR' ? 'Internal Auditor' : 'Line Supervisor'}. You cannot log in through the Administrator portal. Please switch to the ${fallbackUser.role === 'AUDITOR' ? 'Auditor' : 'Supervisor'} Login tab.`,
        });
      }

      if (isAuditorPortal && fallbackUser.role !== 'AUDITOR') {
        return res.status(400).json({
          success: false,
          message: `Access Denied: Account (${fallbackUser.name}) is registered as ${fallbackUser.role === 'ADMIN' ? 'System Administrator' : 'Line Supervisor'}. You cannot log in through the Auditor portal. Please switch to the corresponding login tab.`,
        });
      }

      if (isSupervisorPortal && fallbackUser.role !== 'ACTION_PERSON' && fallbackUser.role !== 'SUPERVISOR') {
        return res.status(400).json({
          success: false,
          message: `Access Denied: Account (${fallbackUser.name}) is registered as ${fallbackUser.role === 'ADMIN' ? 'System Administrator' : 'Internal Auditor'}. You cannot log in through the Supervisor portal. Please switch to the corresponding login tab.`,
        });
      }
    }

    const token = generateToken(fallbackUser._id);
    return res.status(200).json({
      success: true,
      token,
      user: formatUserResponse(fallbackUser, expectedRole),
    });
  } catch (error) {
    console.error('[AuthController:login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
      error: error.message,
    });
  }
};

// @desc    Register a new user (Auditor or Line Supervisor)
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      email,
      password,
      role = 'ACTION_PERSON',
      department,
      designation,
      mobileNumber,
    } = req.body;

    if (!employeeId || !name || !email || !password || !department || !designation || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'All fields (Employee ID, Full Name, Email, Password, Department, Designation, Mobile Number) are mandatory.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    let normalizedRole = 'ACTION_PERSON';
    if (role === 'ADMIN') {
      normalizedRole = 'ADMIN';
    } else if (role === 'AUDITOR') {
      normalizedRole = 'AUDITOR';
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (isSupabaseConfigured && supabase) {
      try {
        // Check for existing employeeId or email
        const { data: existing } = await supabase
          .from('users')
          .select('id, employeeId, email')
          .or(`email.ilike.${email.trim()},employeeId.ilike.${employeeId.trim()}`)
          .limit(1);

        if (existing && existing.length > 0) {
          const isEmailMatch = existing[0].email.toLowerCase() === email.trim().toLowerCase();
          return res.status(400).json({
            success: false,
            message: isEmailMatch
              ? 'An account with this email address already exists.'
              : 'An account with this Employee ID already exists.',
          });
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('users')
          .insert([
            {
              employeeId: employeeId.toUpperCase().trim(),
              name: name.trim(),
              email: email.toLowerCase().trim(),
              password: hashedPassword,
              role: normalizedRole,
              department: department.trim(),
              designation: designation.trim(),
              mobileNumber: mobileNumber.trim(),
              isActive: true,
            },
          ])
          .select()
          .single();

        if (insertErr) {
          console.warn('[AuthController:register] Supabase insert failed:', insertErr.message);
        } else if (inserted) {
          const token = generateToken(inserted.id);
          return res.status(201).json({
            success: true,
            message: `Account registered successfully as ${normalizedRole === 'AUDITOR' ? 'Quality Auditor' : 'Line Supervisor'}.`,
            token,
            user: formatUserResponse(inserted),
          });
        }
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
      mobileNumber: mobileNumber.trim(),
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

    if (isSupabaseConfigured && supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, employeeId, name, email, role, department, designation, mobileNumber, isActive')
          .eq('id', userId)
          .maybeSingle();

        if (!error && data) {
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
