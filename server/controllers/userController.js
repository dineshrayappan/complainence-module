const bcrypt = require('bcryptjs');
const { isMongoConnected, connectDB } = require('../config/db');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const ComplianceTask = require('../models/ComplianceTask');
const Audit = require('../models/Audit');
const mockStore = require('../config/mockStore');
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

  return {
    _id: u._id ? u._id.toString() : u.id,
    id: u._id ? u._id.toString() : u.id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
    department: u.department,
    designation: u.designation,
    mobileNumber: u.mobileNumber,
    isActive: typeof u.isActive !== 'undefined' ? u.isActive : true,
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
        const data = await User.find({
          role: { $in: ['ACTION_PERSON', 'SUPERVISOR'] },
          isActive: true,
        })
          .sort({ department: 1, name: 1 })
          .lean();

        if (data && data.length > 0) {
          const supervisors = data.map((u) => formatUser(u, attendanceMap, todayDate));
          return res.status(200).json({
            success: true,
            count: supervisors.length,
            supervisors,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getLineSupervisors] MongoDB query notice:', dbErr.message);
      }
    }

    const supervisors = mockStore
      .getUsers()
      .filter((u) => (u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR') && u.isActive)
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
    const { role, department, search, isActive, date } = req.query;
    const todayDate = date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const query = {};

        if (role && role !== 'PRESENT' && role !== 'ABSENT') {
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

        const data = await User.find(query).sort({ role: 1, name: 1 }).lean();

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
            date: todayDate,
            users,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getAllUsers] MongoDB notice:', dbErr.message);
      }
    }

    // Fallback store filtering
    let users = mockStore.getUsers();
    if (role && role !== 'PRESENT' && role !== 'ABSENT') {
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

// @desc    Admin: Create new user (Auditor, Supervisor, Admin)
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

    const normalizedRole = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const existingEmp = await User.findOne({
          employeeId: new RegExp(`^${employeeId.trim()}$`, 'i'),
        });
        if (existingEmp) {
          return res.status(400).json({
            success: false,
            message: `Employee ID '${employeeId.toUpperCase()}' is already registered to ${existingEmp.name}.`,
          });
        }

        const existingEmail = await User.findOne({
          email: new RegExp(`^${email.trim()}$`, 'i'),
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: `Email address '${email.toLowerCase()}' is already registered in the system.`,
          });
        }

        const inserted = await User.create({
          employeeId: employeeId.trim().toUpperCase(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: normalizedRole,
          department: department.trim(),
          designation: designation.trim(),
          mobileNumber: mobileNumber.trim(),
          isActive: true,
        });

        // Also sync to mockStore
        mockStore.createUser({
          _id: inserted._id.toString(),
          employeeId: inserted.employeeId,
          name: inserted.name,
          email: inserted.email,
          password,
          role: normalizedRole,
          department: inserted.department,
          designation: inserted.designation,
          mobileNumber: inserted.mobileNumber,
        });

        logEvent({
          req,
          action: 'USER_CREATED',
          actionLabel: 'Personnel Onboarded',
          category: 'USER_MGMT',
          severity: 'SUCCESS',
          entityType: 'USER',
          entityId: inserted.employeeId,
          entityName: inserted.name,
          details: `Created ${inserted.role} account for ${inserted.name} (${inserted.employeeId}) in ${inserted.department}.`,
          payload: { role: inserted.role, department: inserted.department, designation: inserted.designation },
        });

        return res.status(201).json({
          success: true,
          message: `User '${inserted.name}' (${inserted.employeeId}) created successfully.`,
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
      (u) =>
        u.employeeId.toUpperCase() === employeeId.trim().toUpperCase() ||
        u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A user with this Employee ID or Email already exists.',
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
      isActive: true,
    });

    logEvent({
      req,
      action: 'USER_CREATED',
      actionLabel: 'Personnel Onboarded',
      category: 'USER_MGMT',
      severity: 'SUCCESS',
      entityType: 'USER',
      entityId: newUser.employeeId,
      entityName: newUser.name,
      details: `Created ${newUser.role} account for ${newUser.name} (${newUser.employeeId}) in ${newUser.department}.`,
      payload: { role: newUser.role, department: newUser.department, designation: newUser.designation },
    });

    res.status(201).json({
      success: true,
      message: `User '${newUser.name}' created successfully.`,
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

// @desc    Admin: Update user details (name, email, department, designation, mobile)
// @route   PUT /api/users/:id
// @access  Private (Admin Only)
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, department, designation, mobileNumber, role } = req.body;

    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const updateData = {};
        if (name) updateData.name = name.trim();
        if (email) updateData.email = email.trim().toLowerCase();
        if (department) updateData.department = department.trim();
        if (designation) updateData.designation = designation.trim();
        if (typeof mobileNumber !== 'undefined') updateData.mobileNumber = mobileNumber.trim();
        if (role) updateData.role = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;

        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }

        const updated = await User.findOneAndUpdate(query, updateData, { new: true });
        if (updated) {
          mockStore.updateUser(userId, updateData);
          return res.status(200).json({
            success: true,
            message: `User '${updated.name}' updated successfully.`,
            user: formatUser(updated),
          });
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
        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }

        const user = await User.findOne(query);
        if (user) {
          user.password = newPassword;
          await user.save();
          logEvent({
            req,
            action: 'USER_PASSWORD_RESET',
            actionLabel: 'Password Reset',
            category: 'SECURITY',
            severity: 'WARNING',
            entityType: 'USER',
            entityId: user.employeeId,
            entityName: user.name,
            details: `Administrative password reset for ${user.name} (${user.employeeId}).`,
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

    const updated = mockStore.updateUser(userId, { password: newPassword });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    logEvent({
      req,
      action: 'USER_PASSWORD_RESET',
      actionLabel: 'Password Reset',
      category: 'SECURITY',
      severity: 'WARNING',
      entityType: 'USER',
      entityId: updated.employeeId,
      entityName: updated.name,
      details: `Administrative password reset for ${updated.name} (${updated.employeeId}).`,
    });

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
        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }

        const current = await User.findOne(query);
        if (current) {
          current.isActive = !current.isActive;
          await current.save();
          mockStore.updateUser(userId, { isActive: current.isActive });
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

    logEvent({
      req,
      action: 'USER_STATUS_TOGGLED',
      actionLabel: 'Account Status Toggled',
      category: 'USER_MGMT',
      severity: updated.isActive ? 'SUCCESS' : 'WARNING',
      entityType: 'USER',
      entityId: updated.employeeId,
      entityName: updated.name,
      details: `Account ${updated.name} (${updated.employeeId}) is now ${updated.isActive ? 'Active' : 'Deactivated'}.`,
    });

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

    let targetUser = null;
    if (isMongoConnected()) {
      try {
        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }
        targetUser = await User.findOne(query).lean();
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

    let activeTasks = 0;
    let completedTasks = 0;
    let openNCs = 0;
    let historicalNCs = 0;
    let scheduledAudits = 0;

    const uId = String(targetUser._id || targetUser.id || '');
    const uEmp = String(targetUser.employeeId || '').toUpperCase();

    if (isMongoConnected()) {
      try {
        // Compliance Tasks
        const tasks = await ComplianceTask.find({
          $or: [
            { 'assignedTo.userId': uId },
            { 'assignedTo.employeeId': uEmp },
          ],
        }).lean();
        tasks.forEach((t) => {
          if (t.status === 'Completed') completedTasks++;
          else activeTasks++;
        });

        // Complaints / NCs
        const complaints = await Complaint.find({
          $or: [
            { 'createdBy.userId': uId },
            { 'createdBy.employeeId': uEmp },
            { 'assignedTo.userId': uId },
            { 'assignedTo.employeeId': uEmp },
          ],
        }).lean();
        complaints.forEach((c) => {
          if (['Closed', 'Verified'].includes(c.status)) historicalNCs++;
          else openNCs++;
        });

        // Audits
        scheduledAudits = await Audit.countDocuments({
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

    const canDelete = activeTasks === 0 && openNCs === 0 && scheduledAudits === 0;

    return res.status(200).json({
      success: true,
      user: {
        id: targetUser._id ? targetUser._id.toString() : targetUser.id,
        employeeId: targetUser.employeeId,
        name: targetUser.name,
        role: targetUser.role,
        department: targetUser.department,
      },
      dependencies: {
        activeTasks,
        completedTasks,
        openNCs,
        historicalNCs,
        scheduledAudits,
      },
      canDelete,
      reason: canDelete
        ? 'Account has no active blockers. Safe to delete.'
        : `Cannot delete: Account has ${openNCs > 0 ? `${openNCs} open NC(s)` : ''} ${activeTasks > 0 ? `${activeTasks} active task(s)` : ''} ${scheduledAudits > 0 ? `${scheduledAudits} scheduled audit(s)` : ''} assigned.`,
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

// @desc    Admin: Delete existing user account (Auditor, Supervisor, etc.)
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

    let targetUser = null;
    if (isMongoConnected()) {
      try {
        const query = {
          $or: [{ employeeId: userId }, { email: userId }],
        };
        if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: userId });
        }
        targetUser = await User.findOne(query).lean();
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

    if (targetUser.employeeId === 'ADM-001' || targetUser.employeeId === 'ADMIN' || targetUser.email === 'admin@factory.com') {
      return res.status(403).json({
        success: false,
        message: 'Root administrator account is protected and cannot be deleted.',
      });
    }

    const uId = String(targetUser._id || targetUser.id || '');
    const uEmp = String(targetUser.employeeId || '').toUpperCase();

    // Check active open NCs
    if (isMongoConnected()) {
      const openNcCount = await Complaint.countDocuments({
        $or: [
          { 'assignedTo.userId': uId, status: { $nin: ['Closed', 'Verified'] } },
          { 'assignedTo.employeeId': uEmp, status: { $nin: ['Closed', 'Verified'] } },
        ],
      });
      if (openNcCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete ${targetUser.name}: This account has ${openNcCount} active open Non-Conformance(s) currently assigned. Please reassign or close them first.`,
        });
      }
    }

    // Check active compliance tasks
    if (isMongoConnected()) {
      const activeTaskCount = await ComplianceTask.countDocuments({
        $or: [
          { 'assignedTo.userId': uId, status: { $ne: 'Completed' } },
          { 'assignedTo.employeeId': uEmp, status: { $ne: 'Completed' } },
        ],
      });
      if (activeTaskCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete ${targetUser.name}: This account has ${activeTaskCount} active pending compliance task(s). Please reassign or complete them first.`,
        });
      }
    }

    // Delete from MongoDB
    if (isMongoConnected()) {
      const query = {
        $or: [{ employeeId: userId }, { email: userId }],
      };
      if (userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/)) {
        query.$or.unshift({ _id: userId });
      }
      await User.findOneAndDelete(query);
    }

    // Delete from mockStore
    mockStore.deleteUser(userId);

    logEvent({
      req,
      action: 'USER_DELETED',
      actionLabel: 'Personnel Account Removed',
      category: 'USER_MGMT',
      severity: 'CRITICAL',
      entityType: 'USER',
      entityId: targetUser.employeeId,
      entityName: targetUser.name,
      details: `Administrator deleted ${targetUser.role} account '${targetUser.name}' (${targetUser.employeeId}) from ${targetUser.department}.`,
    });

    return res.status(200).json({
      success: true,
      message: `Account '${targetUser.name}' (${targetUser.employeeId}) has been successfully deleted. Historical audit records and closed defect archives remain preserved.`,
      deletedUser: {
        id: targetUser._id ? targetUser._id.toString() : targetUser.id,
        employeeId: targetUser.employeeId,
        name: targetUser.name,
        role: targetUser.role,
        department: targetUser.department,
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

// @desc    Get daily attendance summary & details across all department users
// @route   GET /api/users/attendance/today
// @access  Private (Admin, Auditor & Authenticated)
const getTodayAttendance = async (req, res) => {
  try {
    const todayDate = req.query.date || getTodayISTString();
    const attendanceMap = await getDailyAttendanceMap(todayDate);

    let users = [];
    if (!isMongoConnected()) {
      await connectDB();
    }
    if (isMongoConnected()) {
      try {
        const dbUsers = await User.find({ isActive: true }).sort({ department: 1, name: 1 }).lean();
        if (dbUsers) users = dbUsers;
      } catch (e) {
        console.warn('[UserController:getTodayAttendance] MongoDB query notice:', e.message);
      }
    }
    if (!users || users.length === 0) {
      users = mockStore.getUsers().filter((u) => u.isActive !== false);
    }

    const formattedUsers = users.map((u) => formatUser(u, attendanceMap, todayDate));
    const presentUsers = formattedUsers.filter((u) => u.isPresent);
    const absentUsers = formattedUsers.filter((u) => !u.isPresent);

    res.status(200).json({
      success: true,
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
};
