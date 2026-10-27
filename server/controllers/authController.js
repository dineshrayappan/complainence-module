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

const {
  getUserModel,
  getCanonicalUnitId,
  getCanonicalUnitName,
  normalizeUnit,
} = require('../models/unitModels');

const generateToken = (id, unitId = 'UNIT-1', companySlug = 'esstee') => {
  return jwt.sign(
    { id, unitId: getCanonicalUnitId(unitId), companySlug },
    process.env.JWT_SECRET || 'garment_qms_super_secret_jwt_key_2026_sewing_audit',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// Formats a user row for consistent API response
const formatUserResponse = (user, expectedRole) => {
  if (!user) return null;
  const isOwner = user.role === 'OWNER' || user.isOwner;
  const isUniversal =
    isOwner ||
    user.employeeId === 'ALL-001' ||
    user.email === 'all@factory.com' ||
    user.role === 'SUPERADMIN' ||
    user.isUniversal ||
    user.hasAllRoles;

  let activeRole = isOwner ? 'OWNER' : user.role === 'SUPERVISOR' ? 'ACTION_PERSON' : user.role;
  if (isUniversal && expectedRole && !isOwner) {
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
    isOwner: !!isOwner,
    department: user.department,
    designation: user.designation,
    mobileNumber: user.mobileNumber,
    unitId: getCanonicalUnitId(user.unitId),
    unitName: getCanonicalUnitName(user.unitId),
    assignedUnits: [getCanonicalUnitId(user.unitId)],
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

const selectMatchingUser = async (candidateUsers, password, expectedRole) => {
  if (!candidateUsers || candidateUsers.length === 0) return null;
  const sorted = [...candidateUsers].sort((a, b) => {
    if (expectedRole) {
      const aMatch = a.role === expectedRole || (expectedRole === 'SUPERVISOR' && a.role === 'ACTION_PERSON');
      const bMatch = b.role === expectedRole || (expectedRole === 'SUPERVISOR' && b.role === 'ACTION_PERSON');
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
    }
    if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return 0;
  });

  for (const cand of sorted) {
    if (cand.isDeleted) continue;
    const isMatch = await cand.matchPassword(password);
    if (isMatch) return cand;
  }
  return sorted[0];
};

// @desc    Sign in user with email or employeeId & password
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { identifier, email, employeeId, password, expectedRole, unitId } = req.body;
    const queryIdentifier = (identifier || email || employeeId || '').trim();

    if (!queryIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both an Email/Employee ID and password.',
      });
    }

    const requestedUnit = unitId ? getCanonicalUnitId(unitId) : null;

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

        let user = null;
        let targetUnit = requestedUnit || 'UNIT-1';

        if (requestedUnit) {
          const UserModel = getUserModel(requestedUnit);
          const candidateUsers = await UserModel.find({ $or: orFilters });
          if (candidateUsers && candidateUsers.length > 0) {
            user = await selectMatchingUser(candidateUsers, password, expectedRole);
          } else {
            // Check other unit to prevent cross-unit confusion
            const otherUnit = requestedUnit === 'UNIT-2' ? 'UNIT-1' : 'UNIT-2';
            const OtherUserModel = getUserModel(otherUnit);
            const otherCandidates = await OtherUserModel.find({ $or: orFilters });
            if (otherCandidates && otherCandidates.length > 0) {
              const otherUser = await selectMatchingUser(otherCandidates, password, expectedRole);
              if (otherUser) {
                return res.status(403).json({
                  success: false,
                  message: `This account is assigned to ${getCanonicalUnitName(otherUnit)}. Please select ${getCanonicalUnitName(otherUnit)} workspace on the sign in page.`,
                });
              }
            }
          }
        } else {
          // If no unit explicitly passed, search unit1_users first, then unit2_users
          const User1 = getUserModel('UNIT-1');
          const cand1 = await User1.find({ $or: orFilters });
          user = await selectMatchingUser(cand1, password, expectedRole);
          targetUnit = 'UNIT-1';
          if (!user) {
            const User2 = getUserModel('UNIT-2');
            const cand2 = await User2.find({ $or: orFilters });
            user = await selectMatchingUser(cand2, password, expectedRole);
            if (user) targetUnit = 'UNIT-2';
          }
        }

        // Resilient fallback to User master collection if document not yet migrated
        if (!user) {
          const fallbackCand = await User.find({ $or: orFilters });
          user = await selectMatchingUser(fallbackCand, password, expectedRole);
          if (user) targetUnit = user.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1';
        }

        if (user) {
          const isMatch = await user.matchPassword(password);
          if (!isMatch) {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials. Incorrect password.',
            });
          }

          if (user.isDeleted) {
            return res.status(403).json({
              success: false,
              message: 'This account has been deleted / archived. Access is disabled.',
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

          // Track user login time in audit log history
          await logEvent({
            req,
            userId: user.employeeId || user._id,
            userName: user.name,
            userRole: user.role,
            action: 'AUTH_LOGIN_SUCCESS',
            actionLabel: 'User Sign In',
            category: 'AUTH',
            severity: 'SUCCESS',
            entityType: 'USER',
            entityId: user.employeeId || String(user._id),
            entityName: user.name,
            details: `${user.name} (${user.employeeId} • ${user.designation}) signed in successfully from ${req.ip || 'Web Console'}.`,
            payload: {
              department: user.department,
              designation: user.designation,
              loginTimestamp: now.toISOString(),
            },
          });

          user.unitId = targetUnit;
          user.unitName = getCanonicalUnitName(targetUnit);

          const currentCompanySlug = req.company?.slug || 'esstee';
          const token = generateToken(user._id.toString(), targetUnit, currentCompanySlug);
          return res.status(200).json({
            success: true,
            token,
            user: formatUserResponse(user, expectedRole),
            company: req.company ? {
              id: req.company.id,
              name: req.company.name,
              slug: req.company.slug,
            } : null,
          });
        }
      } catch (dbErr) {
        console.warn('[AuthController:login] MongoDB lookup error, trying fallback:', dbErr.message);
      }
    }

    // 2. Fallback to mockStore (supporting candidate lookup for duplicate emails)
    const candidateMockUsers = mockStore.findUsersByIdentifier
      ? mockStore.findUsersByIdentifier(queryIdentifier)
      : [mockStore.findUserByIdentifier(queryIdentifier)].filter(Boolean);

    if (!candidateMockUsers || candidateMockUsers.length === 0) {
      return res.status(401).json({
        success: false,
        message: `Account '${queryIdentifier}' not found. Please check your credentials.`,
      });
    }

    let user = null;
    for (const cand of candidateMockUsers) {
      if (cand.isDeleted) continue;
      let isMatch = false;
      if (cand.password) {
        if (cand.password.startsWith('$2a$') || cand.password.startsWith('$2b$')) {
          isMatch = await bcrypt.compare(password, cand.password);
        } else {
          isMatch = cand.password === password;
        }
      }
      if (isMatch) {
        user = cand;
        break;
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.',
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted / archived. Access is disabled.',
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

    // Track user login time in fallback audit log history
    await logEvent({
      req,
      userId: user.employeeId || user._id || user.id,
      userName: user.name,
      userRole: user.role,
      action: 'AUTH_LOGIN_SUCCESS',
      actionLabel: 'User Sign In',
      category: 'AUTH',
      severity: 'SUCCESS',
      entityType: 'USER',
      entityId: user.employeeId || String(user._id || user.id),
      entityName: user.name,
      details: `${user.name} (${user.employeeId} • ${user.designation}) signed in successfully from ${req.ip || 'Web Console'}.`,
      payload: {
        department: user.department,
        designation: user.designation,
        loginTimestamp: now.toISOString(),
      },
    });

    const currentCompanySlug = req.company?.slug || 'esstee';
    const token = generateToken(user._id || user.id, 'UNIT-1', currentCompanySlug);
    return res.status(200).json({
      success: true,
      token,
      user: formatUserResponse(user, expectedRole),
      company: req.company ? {
        id: req.company.id,
        name: req.company.name,
        slug: req.company.slug,
      } : null,
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
          employeeId: employeeId.trim().toUpperCase(),
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'An account with this Employee ID already exists.',
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
        const activeUnit = req.user?.unitId || req.activeUnitId || 'UNIT-1';
        const UserModel = getUserModel(activeUnit);
        let data = await UserModel.findOne(query).select('-password').lean();
        if (!data) {
          const OtherUser = getUserModel(activeUnit === 'UNIT-2' ? 'UNIT-1' : 'UNIT-2');
          data = await OtherUser.findOne(query).select('-password').lean();
        }
        if (!data) {
          data = await User.findOne(query).select('-password').lean();
        }

        if (data) {
          const att = evaluateUserDailyAttendance(data, attendanceMap, todayDate);
          data.isPresent = att.isPresent;
          data.attendanceStatus = att.attendanceStatus;
          data.loginTimestamp = att.loginTimestamp;
          data.attendanceDate = att.date;

          return res.status(200).json({
            success: true,
            user: formatUserResponse(data),
            company: req.company ? {
              id: req.company.id,
              name: req.company.name,
              slug: req.company.slug,
            } : null,
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
      company: req.company ? {
        id: req.company.id,
        name: req.company.name,
        slug: req.company.slug,
      } : null,
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
    const userId = req.user?._id || req.user?.id || req.body?.userId || req.body?.employeeId;
    const now = new Date();
    let targetUser = null;

    if (isMongoConnected() && userId) {
      try {
        const query = { $or: [{ employeeId: userId }, { email: userId }] };
        if (typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }
        await User.updateOne(query, { $set: { lastLogoutAt: now } });
        targetUser = await User.findOne(query).lean();
      } catch (e) {
        console.warn('[AuthController:logout] MongoDB logout update error:', e.message);
      }
    }

    if (!targetUser && userId) {
      targetUser = mockStore.getUser(userId.toString());
      if (targetUser) {
        mockStore.updateUser(userId.toString(), {
          lastLogoutAt: now,
        });
      }
    }

    const userName = targetUser?.name || req.body?.userName || req.user?.name || 'User';
    const userEmpId = targetUser?.employeeId || req.body?.employeeId || req.user?.employeeId || userId || 'USER';
    const userRole = targetUser?.role || req.body?.userRole || req.user?.role || 'USER';
    const loginTime = targetUser?.lastLoginAt || targetUser?.loginTimestamp;

    let durationText = '';
    if (loginTime) {
      const diffMs = Math.max(0, now.getTime() - new Date(loginTime).getTime());
      const diffMins = Math.floor(diffMs / 60000);
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      durationText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }

    const loginIST = loginTime
      ? new Date(loginTime).toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : null;

    const logoutIST = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const logoutDateIST = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const details = loginIST
      ? `User ${userName} (${userEmpId}) signed out at ${logoutIST} on ${logoutDateIST}. (Login Time: ${loginIST} • Logout Time: ${logoutIST} • Session Duration: ${durationText || '< 1m'}).`
      : `User ${userName} (${userEmpId}) signed out at ${logoutIST} on ${logoutDateIST}.`;

    await logEvent({
      req,
      userId: userEmpId,
      userName,
      userRole,
      action: 'AUTH_LOGOUT',
      actionLabel: 'User Sign Out',
      category: 'AUTH',
      severity: 'INFO',
      entityType: 'USER',
      entityId: String(userEmpId),
      details,
      payload: {
        loginTimestamp: loginTime ? new Date(loginTime).toISOString() : null,
        logoutTimestamp: now.toISOString(),
        loginTimeIST: loginIST,
        logoutTimeIST: logoutIST,
        sessionDuration: durationText || '< 1m',
        department: targetUser?.department,
        designation: targetUser?.designation,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User signed out. Daily attendance status remains Present for today.',
      sessionDuration: durationText,
      logoutTimestamp: now.toISOString(),
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

// @desc    Private: Owner updates their own password securely
// @route   PATCH /api/auth/owner/password
// @access  Private (Owner Only)
const updateOwnerPassword = async (req, res) => {
  try {
    const ownerId = req.user?._id || req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    if (isMongoConnected() && ownerId) {
      const user = await User.findById(ownerId);
      if (!user || (!user.isOwner && user.role !== 'OWNER')) {
        return res.status(403).json({
          success: false,
          message: 'Access restricted: Executive Owner account required.',
        });
      }

      if (currentPassword) {
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Current password does not match.',
          });
        }
      }

      user.password = newPassword;
      await user.save();
      mockStore.updateUser(ownerId.toString(), { password: user.password });
      return res.status(200).json({
        success: true,
        message: 'Owner password has been updated successfully.',
      });
    }

    const fallbackUser = mockStore.findUserById(ownerId);
    if (!fallbackUser || (!fallbackUser.isOwner && fallbackUser.role !== 'OWNER')) {
      return res.status(403).json({
        success: false,
        message: 'Access restricted: Executive Owner account required.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    mockStore.updateUser(ownerId, { password: hashedPassword });

    return res.status(200).json({
      success: true,
      message: 'Owner password has been updated successfully.',
    });
  } catch (error) {
    console.error('[AuthController:updateOwnerPassword] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update owner password.',
      error: error.message,
    });
  }
};

module.exports = {
  login,
  register,
  getMe,
  logout,
  updateOwnerPassword,
};
