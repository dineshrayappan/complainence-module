const bcrypt = require('bcryptjs');
const { isMongoConnected, connectDB } = require('../config/db');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const ComplianceTask = require('../models/ComplianceTask');
const Audit = require('../models/Audit');
const mockStore = require('../config/mockStore');
const {
  getUserModel,
  getComplaintModel,
  getTaskModel,
  getAuditModel,
  getCanonicalUnitId,
  getCanonicalUnitName,
} = require('../models/unitModels');
const {
  getDailyAttendanceMap,
  evaluateUserDailyAttendance,
  getTodayISTString,
} = require('../utils/attendanceHelper');
const { logEvent } = require('../utils/eventLogger');

const formatUser = (u, attendanceMap, dateString = getTodayISTString()) => {
  if (!u) return null;
  const att = evaluateUserDailyAttendance(u, attendanceMap, dateString);
  const isPresent = att.isPresent;

  const canonicalUnit = getCanonicalUnitId(u.unitId || 'UNIT-1');
  const canonicalUnitName = getCanonicalUnitName(canonicalUnit);

  return {
    _id: u._id ? u._id.toString() : u.id,
    id: u._id ? u._id.toString() : u.id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
    department: u.department,
    unitId: canonicalUnit,
    unitName: u.unitName || canonicalUnitName,
    assignedUnits: Array.isArray(u.assignedUnits) && u.assignedUnits.length > 0 ? u.assignedUnits : [canonicalUnit],
    designation: u.designation,
    mobileNumber: u.mobileNumber,
    isActive: typeof u.isActive !== 'undefined' ? u.isActive : true,
    isDeleted: Boolean(u.isDeleted),
    deletedAt: u.deletedAt || null,
    deletedBy: u.deletedBy || null,
    isPresent,
    attendance: isPresent ? 'Present' : 'Absent',
    attendanceStatus: isPresent ? 'Present' : 'Absent',
    attendanceDate: att.date,
    loginTimestamp: att.loginTimestamp || u.lastLoginAt || null,
    lastLoginAt: u.lastLoginAt || null,
    lastLogoutAt: u.lastLogoutAt || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
};

// Helper: resolve active unit strictly to UNIT-1 or UNIT-2
const resolveUserRequestUnit = (req, explicitUnit) => {
  const candidate = explicitUnit || req.query?.unitId || req.body?.unitId || req.activeUnitId || req.user?.unitId || 'UNIT-1';
  return getCanonicalUnitId(candidate);
};

// Helper to find a user document across unit collections (prefers targetUnit)
const findUserInUnitOrAny = async (userId, preferredUnit = 'UNIT-1') => {
  const normPref = getCanonicalUnitId(preferredUnit);
  const otherUnit = normPref === 'UNIT-1' ? 'UNIT-2' : 'UNIT-1';
  const unitsToTry = [normPref, otherUnit];

  const query = {
    $or: [{ employeeId: userId }, { email: userId }],
  };
  if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
    query.$or.unshift({ _id: userId });
  }

  for (const u of unitsToTry) {
    try {
      const Model = getUserModel(u);
      const user = await Model.findOne(query);
      if (user) {
        return { userDoc: user, UserModel: Model, unitId: u };
      }
    } catch (e) {}
  }
  return { userDoc: null, UserModel: getUserModel(normPref), unitId: normPref };
};

// Helper to find lean user document across unit collections
const findUserLeanInUnitOrAny = async (userId, preferredUnit = 'UNIT-1') => {
  const normPref = getCanonicalUnitId(preferredUnit);
  const otherUnit = normPref === 'UNIT-1' ? 'UNIT-2' : 'UNIT-1';
  const unitsToTry = [normPref, otherUnit];

  const query = {
    $or: [{ employeeId: userId }, { email: userId }],
  };
  if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
    query.$or.unshift({ _id: userId });
  }

  for (const u of unitsToTry) {
    try {
      const Model = getUserModel(u);
      const user = await Model.findOne(query).lean();
      if (user) {
        return { userDoc: user, UserModel: Model, unitId: u };
      }
    } catch (e) {}
  }
  return { userDoc: null, UserModel: getUserModel(normPref), unitId: normPref };
};

// @desc    Get Master Contact List of Line In-Charges for assignment
// @route   GET /api/users/line-supervisors
// @access  Private (Auditor or Authenticated)
const getLineSupervisors = async (req, res) => {
  try {
    const todayDate = req.query?.date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const activeUnit = resolveUserRequestUnit(req);
        const UserModel = getUserModel(activeUnit);

        const supervisorFilter = {
          role: { $in: ['ACTION_PERSON', 'SUPERVISOR'] },
          isActive: true,
          isDeleted: { $ne: true },
        };

        const data = await UserModel.find(supervisorFilter)
          .sort({ department: 1, name: 1 })
          .lean();

        if (data) {
          const supervisors = data.map((u) => formatUser(u, attendanceMap, todayDate));
          return res.status(200).json({
            success: true,
            count: supervisors.length,
            unitId: activeUnit,
            unitName: getCanonicalUnitName(activeUnit),
            supervisors,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getLineSupervisors] MongoDB query notice:', dbErr.message);
      }
    }

    const supervisors = mockStore
      .getUsers(false)
      .filter((u) => (u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR') && u.isActive && !u.isDeleted)
      .map((u) => formatUser(u, attendanceMap, todayDate));

    res.status(200).json({
      success: true,
      count: supervisors.length,
      supervisors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve line supervisors.',
      error: error.message,
    });
  }
};

// @desc    Get all users (with optional filtering)
// @route   GET /api/users
// @access  Private (Admin or Authenticated)
const getAllUsers = async (req, res) => {
  try {
    const { role, department, search, isActive, date, includeDeleted, archived, unitId } = req.query;
    const todayDate = date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const targetUnit = resolveUserRequestUnit(req, unitId);
        const UserModel = getUserModel(targetUnit);

        const query = {};
        const isRequestingOwner = req.user?.role === 'OWNER' || req.user?.isOwner;
        if (!isRequestingOwner) {
          query.role = query.role ? query.role : { $ne: 'OWNER' };
          query.isOwner = { $ne: true };
        }

        if (archived === 'true' || role === 'ARCHIVED') {
          query.isDeleted = true;
        } else if (includeDeleted !== 'true') {
          query.isDeleted = { $ne: true };
        }

        if (role && role !== 'PRESENT' && role !== 'ABSENT' && role !== 'ARCHIVED') {
          if (role === 'SUPERVISOR') {
            query.role = { $in: ['ACTION_PERSON', 'SUPERVISOR'] };
          } else {
            query.role = role;
          }
        }

        if (department) {
          query.department = department;
        }

        if (typeof isActive !== 'undefined') {
          query.isActive = isActive === 'true';
        }

        if (search) {
          const regex = new RegExp(search, 'i');
          query.$or = [
            { name: regex },
            { employeeId: regex },
            { email: regex },
            { department: regex },
            { designation: regex },
          ];
        }

        const data = await UserModel.find(query).sort({ role: 1, name: 1 }).lean();

        if (data) {
          let users = data.map((u) => formatUser(u, attendanceMap, todayDate));

          if (role === 'PRESENT') {
            users = users.filter((u) => u.isPresent);
          } else if (role === 'ABSENT') {
            users = users.filter((u) => !u.isPresent);
          }

          return res.status(200).json({
            success: true,
            count: users.length,
            unitId: targetUnit,
            unitName: getCanonicalUnitName(targetUnit),
            date: todayDate,
            users,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getAllUsers] MongoDB notice:', dbErr.message);
      }
    }

    // Fallback store filtering
    const shouldIncludeDeleted = archived === 'true' || role === 'ARCHIVED' || includeDeleted === 'true';
    let users = mockStore.getUsers(shouldIncludeDeleted);
    const isRequestingOwner = req.user?.role === 'OWNER' || req.user?.isOwner;
    if (!isRequestingOwner) {
      users = users.filter((u) => u.role !== 'OWNER' && !u.isOwner);
    }
    if (archived === 'true' || role === 'ARCHIVED') {
      users = users.filter((u) => u.isDeleted);
    } else if (includeDeleted !== 'true') {
      users = users.filter((u) => !u.isDeleted);
    }

    if (role && role !== 'PRESENT' && role !== 'ABSENT' && role !== 'ARCHIVED') {
      if (role === 'SUPERVISOR') {
        users = users.filter((u) => u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR');
      } else {
        users = users.filter((u) => u.role === role);
      }
    }
    if (department) {
      users = users.filter((u) => u.department === department);
    }
    if (typeof isActive !== 'undefined') {
      users = users.filter((u) => Boolean(u.isActive) === (isActive === 'true'));
    }
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.employeeId?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q)
      );
    }
    let formattedUsers = users.map((u) => formatUser(u, attendanceMap, todayDate));
    if (role === 'PRESENT') {
      formattedUsers = formattedUsers.filter((u) => u.isPresent);
    } else if (role === 'ABSENT') {
      formattedUsers = formattedUsers.filter((u) => !u.isPresent);
    }

    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      date: todayDate,
      users: formattedUsers,
    });
  } catch (error) {
    const todayDate = getTodayISTString();
    const users = mockStore.getUsers().map((u) => formatUser(u, null, todayDate));
    res.status(200).json({
      success: true,
      count: users.length,
      date: todayDate,
      users,
    });
  }
};

// @desc    Admin: Create new user (Auditor, Supervisor, Admin) - Mandatory Unit 1 or Unit 2
// @route   POST /api/users
// @access  Private (Admin Only)
const createUser = async (req, res) => {
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
      unitId,
      unitName,
    } = req.body;

    if (!employeeId || !name || !email || !password || !role || !department || !designation || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'All fields are mandatory: employeeId, name, email, password, role, department, designation, and mobileNumber.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // Mandatory Unit 1 or Unit 2 validation
    const candidateUnit = (unitId || req.body.unit || req.activeUnitId || '').toString().trim().toUpperCase();
    if (!candidateUnit || (candidateUnit !== 'UNIT-1' && candidateUnit !== 'UNIT-2' && candidateUnit !== 'UNIT 1' && candidateUnit !== 'UNIT 2')) {
      return res.status(400).json({
        success: false,
        message: 'Mandatory unit assignment required: Please select either Unit 1 or Unit 2.',
      });
    }

    const cleanUnitId = getCanonicalUnitId(candidateUnit);
    const cleanUnitName = getCanonicalUnitName(cleanUnitId);
    const normalizedRole = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const TargetUserModel = getUserModel(cleanUnitId);

        // Check if employeeId or email already exists in target unit
        const existingEmp = await TargetUserModel.findOne({
          $or: [
            { employeeId: new RegExp(`^${employeeId.trim()}$`, 'i') },
            { email: email.trim().toLowerCase() },
          ],
        });
        if (existingEmp) {
          return res.status(400).json({
            success: false,
            message: `Employee ID '${employeeId.toUpperCase()}' or email '${email}' is already registered in ${cleanUnitName}.`,
          });
        }

        const inserted = await TargetUserModel.create({
          employeeId: employeeId.trim().toUpperCase(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: normalizedRole,
          department: department.trim(),
          designation: designation.trim(),
          mobileNumber: mobileNumber.trim(),
          unitId: cleanUnitId,
          unitName: cleanUnitName,
          assignedUnits: [cleanUnitId],
          isActive: true,
        });

        // Sync to mockStore with the securely hashed password
        mockStore.createUser({
          _id: inserted._id.toString(),
          employeeId: inserted.employeeId,
          name: inserted.name,
          email: inserted.email,
          password: inserted.password,
          role: normalizedRole,
          department: inserted.department,
          designation: inserted.designation,
          mobileNumber: inserted.mobileNumber,
          unitId: cleanUnitId,
          unitName: cleanUnitName,
          assignedUnits: [cleanUnitId],
        });

        // Record audit event
        await logEvent({
          req,
          action: 'USER_CREATED',
          actionLabel: 'Personnel Onboarded',
          category: 'USER_MGMT',
          severity: 'SUCCESS',
          entityType: 'USER',
          entityId: inserted.employeeId,
          entityName: inserted.name,
          details: `Administrator created ${inserted.role} account for ${inserted.name} (${inserted.employeeId} • ${inserted.department} • ${cleanUnitName}).`,
          payload: { role: inserted.role, department: inserted.department, designation: inserted.designation, unitId: cleanUnitId },
        });

        return res.status(201).json({
          success: true,
          message: `User '${inserted.name}' (${inserted.employeeId}) created successfully in ${cleanUnitName}.`,
          user: formatUser(inserted),
        });
      } catch (dbErr) {
        console.error('[UserController:createUser] MongoDB error:', dbErr.message);
        return res.status(400).json({
          success: false,
          message: dbErr.message || 'Database error creating user account.',
        });
      }
    }

    // Fallback in-memory
    const existing = mockStore.getUsers().find(
      (u) => u.employeeId.toUpperCase() === employeeId.trim().toUpperCase()
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A user with Employee ID '${employeeId.toUpperCase()}' already exists.`,
      });
    }

    const newUser = mockStore.createUser({
      employeeId: employeeId.trim().toUpperCase(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: normalizedRole,
      department: department.trim(),
      designation: designation.trim(),
      mobileNumber: mobileNumber.trim(),
      unitId: cleanUnitId,
      unitName: cleanUnitName,
      assignedUnits: [cleanUnitId],
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: `User '${newUser.name}' created successfully in ${cleanUnitName}.`,
      user: formatUser(newUser),
    });
  } catch (error) {
    console.error('[UserController:createUser] General Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create user account.',
    });
  }
};

// @desc    Admin: Update user details (name, email, department, designation, mobile, unit)
// @route   PUT /api/users/:id
// @access  Private (Admin Only)
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, department, designation, mobileNumber, role, unitId, unitName } = req.body;

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const activeUnit = resolveUserRequestUnit(req);
        const { userDoc, UserModel, unitId: currentUnitId } = await findUserInUnitOrAny(userId, activeUnit);

        if (userDoc) {
          if ((userDoc.role === 'OWNER' || userDoc.isOwner) && req.user?.role !== 'OWNER') {
            return res.status(403).json({
              success: false,
              message: 'Security Violation: The Owner account is private and cannot be altered by general administrators.',
            });
          }

          const updateData = {};
          if (name) updateData.name = name.trim();
          if (email) updateData.email = email.trim().toLowerCase();
          if (department) updateData.department = department.trim();
          if (designation) updateData.designation = designation.trim();
          if (typeof mobileNumber !== 'undefined') updateData.mobileNumber = mobileNumber.trim();
          if (role) updateData.role = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;

          let targetUnitChange = null;
          if (typeof unitId !== 'undefined' && unitId) {
            const requestedUnit = getCanonicalUnitId(unitId);
            if (requestedUnit && (requestedUnit === 'UNIT-1' || requestedUnit === 'UNIT-2')) {
              targetUnitChange = requestedUnit;
              updateData.unitId = requestedUnit;
              updateData.unitName = getCanonicalUnitName(requestedUnit);
              updateData.assignedUnits = [requestedUnit];
            }
          }

          let updated = null;
          // If unit has changed between UNIT-1 and UNIT-2, move document between collections
          if (targetUnitChange && targetUnitChange !== currentUnitId) {
            const TargetModel = getUserModel(targetUnitChange);
            const rawUser = userDoc.toObject();
            delete rawUser.__v;
            Object.assign(rawUser, updateData);

            await UserModel.findByIdAndDelete(userDoc._id);
            updated = await TargetModel.create(rawUser);
          } else {
            Object.assign(userDoc, updateData);
            updated = await userDoc.save();
          }

          if (updated) {
            mockStore.updateUser(userId, updateData);
            await logEvent({
              req,
              action: 'USER_UPDATED',
              actionLabel: 'User Profile Updated',
              category: 'USER_MGMT',
              severity: 'INFO',
              entityType: 'USER',
              entityId: updated.employeeId || userId,
              entityName: updated.name,
              details: `Profile details updated for ${updated.name} (${updated.employeeId} • ${updated.unitName || updated.unitId}).`,
              payload: updateData,
            });

            return res.status(200).json({
              success: true,
              message: `User '${updated.name}' updated successfully.`,
              user: formatUser(updated),
            });
          }
        }
      } catch (dbErr) {
        console.warn('[UserController:updateUser] MongoDB notice:', dbErr.message);
      }
    }

    const user = mockStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (department) updates.department = department.trim();
    if (designation) updates.designation = designation.trim();
    if (typeof mobileNumber !== 'undefined') updates.mobileNumber = mobileNumber.trim();
    if (role) updates.role = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;
    if (typeof unitId !== 'undefined' && unitId) {
      const cleanUnitId = getCanonicalUnitId(unitId);
      updates.unitId = cleanUnitId;
      updates.unitName = getCanonicalUnitName(cleanUnitId);
      updates.assignedUnits = [cleanUnitId];
    }

    const updated = mockStore.updateUser(userId, updates);
    res.status(200).json({
      success: true,
      message: `User '${updated.name}' updated successfully.`,
      user: formatUser(updated),
    });
  } catch (error) {
    console.error('[UserController] Update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user profile.',
    });
  }
};

// @desc    Admin: Reset a user's password
// @route   PATCH /api/users/:id/reset-password
// @access  Private (Admin Only)
const resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    if (isMongoConnected()) {
      try {
        const activeUnit = resolveUserRequestUnit(req);
        const { userDoc: user } = await findUserInUnitOrAny(userId, activeUnit);

        if (user) {
          if ((user.role === 'OWNER' || user.isOwner) && req.user?.role !== 'OWNER') {
            return res.status(403).json({
              success: false,
              message: 'Security Violation: The Owner account password cannot be reset by general administrators.',
            });
          }
          user.password = newPassword;
          await user.save();
          // user.password is now the freshly hashed bcrypt string from pre('save') hook
          mockStore.updateUser(userId, { password: user.password });
          mockStore.updateUser(user.employeeId, { password: user.password });
          if (user._id) {
            mockStore.updateUser(user._id.toString(), { password: user.password });
          }
          await logEvent({
            req,
            action: 'USER_PASSWORD_RESET',
            actionLabel: 'Password Reset',
            category: 'SECURITY',
            severity: 'WARNING',
            entityType: 'USER',
            entityId: user.employeeId,
            entityName: user.name,
            details: `Password reset executed for ${user.name} (${user.employeeId}) by Administrator.`,
          });

          return res.status(200).json({
            success: true,
            message: `Password for '${user.name}' (${user.employeeId}) has been successfully updated.`,
            user: formatUser(user),
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:resetPassword] MongoDB notice:', dbErr.message);
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    const updated = mockStore.updateUser(userId, { password: hashedPassword });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: `Password for '${updated.name}' updated successfully.`,
      user: formatUser(updated),
    });
  } catch (error) {
    console.error('[UserController] Reset password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reset user password.',
    });
  }
};

// @desc    Admin: Toggle user active/inactive status
// @route   PATCH /api/users/:id/toggle-status
// @access  Private (Admin Only)
const toggleUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.user && (req.user.id === userId || req.user._id === userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own administrative account.',
      });
    }

    if (isMongoConnected()) {
      try {
        const activeUnit = resolveUserRequestUnit(req);
        const { userDoc: current } = await findUserInUnitOrAny(userId, activeUnit);

        if (current) {
          if (current.role === 'OWNER' || current.isOwner) {
            return res.status(403).json({
              success: false,
              message: 'Security Violation: The Owner account is permanent and cannot be deactivated.',
            });
          }
          current.isActive = !current.isActive;
          await current.save();
          mockStore.updateUser(userId, { isActive: current.isActive });
          await logEvent({
            req,
            action: 'USER_STATUS_TOGGLED',
            actionLabel: 'User Status Toggled',
            category: 'USER_MGMT',
            severity: 'WARNING',
            entityType: 'USER',
            entityId: current.employeeId,
            entityName: current.name,
            details: `User ${current.name} (${current.employeeId}) account was ${current.isActive ? 'activated' : 'deactivated'}.`,
          });

          return res.status(200).json({
            success: true,
            message: `User '${current.name}' has been ${current.isActive ? 'activated' : 'deactivated'}.`,
            isActive: current.isActive,
            user: formatUser(current),
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:toggleStatus] MongoDB notice:', dbErr.message);
      }
    }

    const user = mockStore.findUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const updated = mockStore.updateUser(userId, { isActive: !user.isActive });
    res.status(200).json({
      success: true,
      message: `User '${updated.name}' status updated.`,
      isActive: updated.isActive,
      user: formatUser(updated),
    });
  } catch (error) {
    console.error('[UserController] Toggle status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle user status.',
    });
  }
};

// @desc    Admin: Check active/historical dependencies for a user before deletion
// @route   GET /api/users/:id/dependencies
// @access  Private (Admin Only)
const checkUserDependencies = async (req, res) => {
  try {
    const userId = req.params.id;
    const activeUnit = resolveUserRequestUnit(req);

    let targetUser = null;
    let foundUnit = activeUnit;

    if (isMongoConnected()) {
      try {
        const found = await findUserLeanInUnitOrAny(userId, activeUnit);
        if (found.userDoc) {
          targetUser = found.userDoc;
          foundUnit = found.unitId;
        }
      } catch (e) {}
    }

    if (!targetUser) {
      targetUser = mockStore.findUserById(userId);
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    if ((targetUser.role === 'OWNER' || targetUser.isOwner) && req.user?.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted: Owner dependencies are private.',
      });
    }

    let activeTasks = 0;
    let completedTasks = 0;
    let openNCs = 0;
    let historicalNCs = 0;
    let scheduledAudits = 0;

    const uId = String(targetUser._id || targetUser.id || '');
    const uEmp = String(targetUser.employeeId || '').toUpperCase();

    if (isMongoConnected()) {
      try {
        const TaskModel = getTaskModel(foundUnit);
        const ComplaintModel = getComplaintModel(foundUnit);
        const AuditModel = getAuditModel(foundUnit);

        // Compliance Tasks in user's unit
        const tasks = await TaskModel.find({
          $or: [
            { 'assignedTo.userId': uId },
            { 'assignedTo.employeeId': uEmp },
          ],
        }).lean();
        tasks.forEach((t) => {
          if (t.status === 'Completed') completedTasks++;
          else activeTasks++;
        });

        // Complaints / NCs in user's unit
        const complaints = await ComplaintModel.find({
          $or: [
            { 'createdBy.userId': uId },
            { 'createdBy.employeeId': uEmp },
            { 'assignedTo.userId': uId },
            { 'assignedTo.employeeId': uEmp },
          ],
          isDeleted: { $ne: true },
        }).lean();
        complaints.forEach((c) => {
          if (['Closed', 'Verified'].includes(c.status)) historicalNCs++;
          else openNCs++;
        });

        // Audits in user's unit
        scheduledAudits = await AuditModel.countDocuments({
          $or: [
            { 'auditor.userId': uId },
            { 'auditor.employeeId': uEmp },
          ],
          status: { $ne: 'Completed' },
        });
      } catch (err) {
        console.warn('[checkUserDependencies] MongoDB inspection notice:', err.message);
      }
    } else {
      const mockTasks = mockStore.getTasks ? mockStore.getTasks() : [];
      mockTasks.forEach((t) => {
        const a = t.assignedTo || {};
        const isAssigned = (a.userId && String(a.userId) === uId) ||
                           (a.employeeId && String(a.employeeId).toUpperCase() === uEmp);
        if (isAssigned) {
          if (t.status === 'Completed') completedTasks++;
          else activeTasks++;
        }
      });

      const mockComplaints = mockStore.getComplaints({});
      mockComplaints.forEach((c) => {
        const cr = c.createdBy || {};
        const as = c.assignedTo || {};
        const isCreator = (cr.userId && String(cr.userId) === uId) ||
                          (cr.employeeId && String(cr.employeeId).toUpperCase() === uEmp);
        const isAssignee = (as.userId && String(as.userId) === uId) ||
                           (as.employeeId && String(as.employeeId).toUpperCase() === uEmp);
        if (isCreator || isAssignee) {
          if (c.status === 'Closed' || c.status === 'Verified') historicalNCs++;
          else openNCs++;
        }
      });

      const mockAudits = mockStore.getAudits ? mockStore.getAudits() : [];
      mockAudits.forEach((a) => {
        const aud = a.auditor || {};
        const isAud = (aud.userId && String(aud.userId) === uId) ||
                      (aud.employeeId && String(aud.employeeId).toUpperCase() === uEmp);
        if (isAud && a.status !== 'Completed') {
          scheduledAudits++;
        }
      });
    }

    const canDelete = true;

    return res.status(200).json({
      success: true,
      user: {
        id: targetUser._id ? targetUser._id.toString() : targetUser.id,
        employeeId: targetUser.employeeId,
        name: targetUser.name,
        role: targetUser.role,
        department: targetUser.department,
        unitId: foundUnit,
        unitName: getCanonicalUnitName(foundUnit),
      },
      dependencies: {
        activeTasks,
        completedTasks,
        openNCs,
        historicalNCs,
        scheduledAudits,
      },
      canDelete,
      reason: 'Account will be safely archived (soft-deleted). All NC details, CAP submissions, evidence photos, and audit logs remain permanently preserved.',
    });
  } catch (error) {
    console.error('[checkUserDependencies] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to inspect user dependencies.',
      error: error.message,
    });
  }
};

// @desc    Admin: Soft-delete / archive existing user account (Auditor, Supervisor, etc.)
// @route   DELETE /api/users/:id
// @access  Private (Admin Only)
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.user && (req.user.id === userId || req.user._id === userId)) {
      return res.status(400).json({
        success: false,
        message: 'Security Violation: Administrators cannot delete their own active account.',
      });
    }

    const activeUnit = resolveUserRequestUnit(req);
    let targetUser = null;
    let foundUnit = activeUnit;

    if (isMongoConnected()) {
      try {
        const found = await findUserLeanInUnitOrAny(userId, activeUnit);
        if (found.userDoc) {
          targetUser = found.userDoc;
          foundUnit = found.unitId;
        }
      } catch (e) {}
    }

    if (!targetUser) {
      targetUser = mockStore.findUserById(userId);
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    if (targetUser.role === 'OWNER' || targetUser.isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Security Violation: The Owner account is private and cannot be deleted or archived.',
      });
    }

    if (targetUser.employeeId === 'ADM-001' || targetUser.employeeId === 'ADMIN' || targetUser.email === 'admin@factory.com') {
      return res.status(403).json({
        success: false,
        message: 'Root administrator account is protected and cannot be deleted.',
      });
    }

    const actorName = req.user?.name || 'Administrator';
    const actorEmpId = req.user?.employeeId || 'ADMIN';
    const actorRole = req.user?.role || 'ADMIN';

    const deletedInfo = {
      deletedBy: { name: actorName, employeeId: actorEmpId, role: actorRole },
      deletedAt: new Date(),
      isDeleted: true,
      isActive: false,
    };

    // Soft delete from MongoDB in target unit's collection
    if (isMongoConnected()) {
      const TargetUserModel = getUserModel(foundUnit);
      const query = {
        $or: [{ employeeId: userId }, { email: userId }],
      };
      if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
        query.$or.unshift({ _id: userId });
      }
      await TargetUserModel.updateOne(query, {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: deletedInfo.deletedAt,
          deletedBy: deletedInfo.deletedBy,
        },
      });
    }

    // Soft delete from mockStore
    mockStore.deleteUser(userId, deletedInfo);

    await logEvent({
      req,
      userId: actorEmpId,
      userName: actorName,
      userRole: actorRole,
      action: 'USER_DELETED',
      actionLabel: 'User Account Soft-Deleted / Archived',
      category: 'USER_MGMT',
      severity: 'CRITICAL',
      entityType: 'USER',
      entityId: targetUser.employeeId,
      entityName: targetUser.name,
      details: `User account '${targetUser.name}' (${targetUser.employeeId} • ${targetUser.role} • ${targetUser.department} • ${getCanonicalUnitName(foundUnit)}) was soft-deleted and archived by ${actorName} (${actorEmpId} • ${actorRole}). All historical NCs, CAP submissions, evidence photos, and audit logs remain permanently preserved.`,
      payload: {
        deletedBy: deletedInfo.deletedBy,
        deletedUser: {
          name: targetUser.name,
          employeeId: targetUser.employeeId,
          role: targetUser.role,
          department: targetUser.department,
          designation: targetUser.designation,
          email: targetUser.email,
          unitId: foundUnit,
        },
        deletedAt: deletedInfo.deletedAt.toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Account '${targetUser.name}' (${targetUser.employeeId}) has been safely archived. All existing NCs, CAP records, evidence photos, and audit history remain permanently preserved.`,
      deletedUser: {
        id: targetUser._id ? targetUser._id.toString() : targetUser.id,
        employeeId: targetUser.employeeId,
        name: targetUser.name,
        role: targetUser.role,
        department: targetUser.department,
        unitId: foundUnit,
        unitName: getCanonicalUnitName(foundUnit),
        isDeleted: true,
        deletedAt: deletedInfo.deletedAt,
      },
    });
  } catch (error) {
    console.error('[deleteUser] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user account.',
      error: error.message,
    });
  }
};

// @desc    Admin: Get list of soft-deleted / archived users with NC stats
// @route   GET /api/users/archived
// @access  Private (Admin Only)
const getArchivedUsers = async (req, res) => {
  try {
    let archivedUsers = [];
    const targetUnit = resolveUserRequestUnit(req);

    if (!isMongoConnected()) {
      await connectDB();
    }

    if (isMongoConnected()) {
      try {
        const UserModel = getUserModel(targetUnit);
        const data = await UserModel.find({ isDeleted: true }).sort({ deletedAt: -1 }).lean();
        if (data) {
          archivedUsers = data;
        }
      } catch (dbErr) {
        console.warn('[UserController:getArchivedUsers] Mongo query notice:', dbErr.message);
      }
    }

    if (!isMongoConnected() && (!archivedUsers || archivedUsers.length === 0)) {
      archivedUsers = mockStore.getUsers(true).filter((u) => u.isDeleted);
    }

    const ComplaintModel = getComplaintModel(targetUnit);

    // Attach NC summary counts for each archived user
    const usersWithNcStats = await Promise.all(
      archivedUsers.map(async (u) => {
        const uId = String(u._id || u.id || '');
        const uEmp = String(u.employeeId || '').toUpperCase();
        let totalNcCount = 0;
        let createdNcCount = 0;
        let assignedNcCount = 0;

        if (isMongoConnected()) {
          try {
            createdNcCount = await ComplaintModel.countDocuments({
              $or: [{ 'createdBy.userId': uId }, { 'createdBy.employeeId': uEmp }],
            });
            assignedNcCount = await ComplaintModel.countDocuments({
              $or: [{ 'assignedTo.userId': uId }, { 'assignedTo.employeeId': uEmp }],
            });
            totalNcCount = await ComplaintModel.countDocuments({
              $or: [
                { 'createdBy.userId': uId },
                { 'createdBy.employeeId': uEmp },
                { 'assignedTo.userId': uId },
                { 'assignedTo.employeeId': uEmp },
              ],
            });
          } catch (e) {}
        } else {
          const complaints = mockStore.getComplaints({});
          complaints.forEach((c) => {
            const isCr = (c.createdBy?.userId && String(c.createdBy.userId) === uId) ||
                         (c.createdBy?.employeeId && String(c.createdBy.employeeId).toUpperCase() === uEmp);
            const isAs = (c.assignedTo?.userId && String(c.assignedTo.userId) === uId) ||
                         (c.assignedTo?.employeeId && String(c.assignedTo.employeeId).toUpperCase() === uEmp);
            if (isCr) createdNcCount++;
            if (isAs) assignedNcCount++;
            if (isCr || isAs) totalNcCount++;
          });
        }

        return {
          ...formatUser(u),
          totalNcCount,
          createdNcCount,
          assignedNcCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: usersWithNcStats.length,
      unitId: targetUnit,
      unitName: getCanonicalUnitName(targetUnit),
      users: usersWithNcStats,
    });
  } catch (error) {
    console.error('[getArchivedUsers] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve archived users.',
      error: error.message,
    });
  }
};

// @desc    Admin: Get all preserved NC/CAP records associated with a user (as creator or assignee)
// @route   GET /api/users/:id/nc-history
// @access  Private (Admin Only)
const getUserNcHistory = async (req, res) => {
  try {
    const userId = req.params.id;
    const activeUnit = resolveUserRequestUnit(req);

    let targetUser = null;
    let foundUnit = activeUnit;

    if (isMongoConnected()) {
      try {
        const found = await findUserLeanInUnitOrAny(userId, activeUnit);
        if (found.userDoc) {
          targetUser = found.userDoc;
          foundUnit = found.unitId;
        }
      } catch (e) {}
    }

    if (!targetUser) {
      targetUser = mockStore.findUserById(userId);
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    const uId = String(targetUser._id || targetUser.id || '');
    const uEmp = String(targetUser.employeeId || '').toUpperCase();

    let complaints = [];
    if (isMongoConnected()) {
      try {
        const ComplaintModel = getComplaintModel(foundUnit);
        complaints = await ComplaintModel.find({
          $or: [
            { 'createdBy.userId': uId },
            { 'createdBy.employeeId': uEmp },
            { 'assignedTo.userId': uId },
            { 'assignedTo.employeeId': uEmp },
          ],
        })
          .sort({ createdAt: -1 })
          .lean();
      } catch (dbErr) {
        console.warn('[getUserNcHistory] Mongo query notice:', dbErr.message);
      }
    }

    if (!complaints || complaints.length === 0) {
      const allComplaints = mockStore.getComplaints({});
      complaints = allComplaints.filter((c) => {
        const isCr = (c.createdBy?.userId && String(c.createdBy.userId) === uId) ||
                     (c.createdBy?.employeeId && String(c.createdBy.employeeId).toUpperCase() === uEmp);
        const isAs = (c.assignedTo?.userId && String(c.assignedTo.userId) === uId) ||
                     (c.assignedTo?.employeeId && String(c.assignedTo.employeeId).toUpperCase() === uEmp);
        return isCr || isAs;
      });
    }

    const { formatComplaintOutput } = require('./complaintController');

    const formattedRecords = complaints.map((c) => {
      const isCreator = (c.createdBy?.userId && String(c.createdBy.userId) === uId) ||
                        (c.createdBy?.employeeId && String(c.createdBy.employeeId).toUpperCase() === uEmp);
      const isAssignee = (c.assignedTo?.userId && String(c.assignedTo.userId) === uId) ||
                         (c.assignedTo?.employeeId && String(c.assignedTo.employeeId).toUpperCase() === uEmp);

      const base = formatComplaintOutput ? formatComplaintOutput(c) : c;
      return {
        ...base,
        userRelationship: isCreator && isAssignee ? 'Creator & Assignee' : isCreator ? 'Created By User' : 'Assigned To User',
      };
    });

    return res.status(200).json({
      success: true,
      user: formatUser(targetUser),
      unitId: foundUnit,
      unitName: getCanonicalUnitName(foundUnit),
      count: formattedRecords.length,
      records: formattedRecords,
    });
  } catch (error) {
    console.error('[getUserNcHistory] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user NC/CAP history.',
      error: error.message,
    });
  }
};

// @desc    Admin: Restore a soft-deleted / archived user account
// @route   PATCH /api/users/:id/restore
// @access  Private (Admin Only)
const restoreUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const activeUnit = resolveUserRequestUnit(req);

    let targetUser = null;
    let foundUnit = activeUnit;

    if (isMongoConnected()) {
      try {
        const found = await findUserInUnitOrAny(userId, activeUnit);
        if (found.userDoc) {
          targetUser = found.userDoc;
          foundUnit = found.unitId;
          targetUser.isDeleted = false;
          targetUser.isActive = true;
          targetUser.deletedAt = null;
          targetUser.deletedBy = null;
          await targetUser.save();
        }
      } catch (e) {}
    }

    const restoredMock = mockStore.restoreUser(userId);
    if (!targetUser && !restoredMock) {
      return res.status(404).json({
        success: false,
        message: 'Archived user not found.',
      });
    }

    const actorName = req.user?.name || 'Administrator';
    const actorEmpId = req.user?.employeeId || 'ADMIN';
    const actorRole = req.user?.role || 'ADMIN';
    const restored = targetUser || restoredMock;

    await logEvent({
      req,
      userId: actorEmpId,
      userName: actorName,
      userRole: actorRole,
      action: 'USER_RESTORED',
      actionLabel: 'User Account Restored',
      category: 'USER_MGMT',
      severity: 'SUCCESS',
      entityType: 'USER',
      entityId: restored.employeeId,
      entityName: restored.name,
      details: `User account '${restored.name}' (${restored.employeeId} • ${getCanonicalUnitName(foundUnit)}) was restored from archive by ${actorName}.`,
    });

    return res.status(200).json({
      success: true,
      message: `Account '${restored.name}' (${restored.employeeId}) has been successfully restored.`,
      user: formatUser(restored),
    });
  } catch (error) {
    console.error('[restoreUser] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore user account.',
      error: error.message,
    });
  }
};

// @desc    Get daily attendance summary & details across all department users
// @route   GET /api/users/attendance/today
// @access  Private (Admin, Auditor & Authenticated)
const getTodayAttendance = async (req, res) => {
  try {
    const todayDate = req.query.date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);
    const targetUnit = resolveUserRequestUnit(req);

    let users = [];
    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const UserModel = getUserModel(targetUnit);
        const dbUsers = await UserModel.find({ isActive: true, isDeleted: { $ne: true } })
          .sort({ department: 1, name: 1 })
          .lean();
        if (dbUsers) users = dbUsers;
      } catch (e) {
        console.warn('[UserController:getTodayAttendance] MongoDB query notice:', e.message);
      }
    }
    if (!users || users.length === 0) {
      users = mockStore.getUsers(false).filter((u) => u.isActive !== false && !u.isDeleted);
    }

    const formattedUsers = users.map((u) => formatUser(u, attendanceMap, todayDate));
    const presentUsers = formattedUsers.filter((u) => u.isPresent);
    const absentUsers = formattedUsers.filter((u) => !u.isPresent);

    res.status(200).json({
      success: true,
      unitId: targetUnit,
      unitName: getCanonicalUnitName(targetUnit),
      date: todayDate,
      timezone: 'Asia/Kolkata',
      summary: {
        total: formattedUsers.length,
        present: presentUsers.length,
        absent: absentUsers.length,
      },
      presentUsers,
      absentUsers,
      allUsers: formattedUsers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve daily attendance.',
      error: err.message,
    });
  }
};

module.exports = {
  getLineSupervisors,
  getAllUsers,
  getTodayAttendance,
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
  checkUserDependencies,
  deleteUser,
  getArchivedUsers,
  getUserNcHistory,
  restoreUser,
};
