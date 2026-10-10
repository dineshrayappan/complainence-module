const bcrypt = require('bcryptjs');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const mockStore = require('../config/mockStore');

const formatUser = (u) => {
  if (!u) return null;
  return {
    _id: u.id || u._id,
    id: u.id || u._id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role === 'SUPERVISOR' ? 'ACTION_PERSON' : u.role,
    department: u.department,
    designation: u.designation,
    mobileNumber: u.mobileNumber,
    isActive: typeof u.isActive !== 'undefined' ? u.isActive : true,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
};

// @desc    Get Master Contact List of Line In-Charges for assignment
// @route   GET /api/users/line-supervisors
// @access  Private (Auditor or Authenticated)
const getLineSupervisors = async (req, res) => {
  try {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, employeeId, department, designation, mobileNumber, email, role, isActive')
          .or('role.eq.ACTION_PERSON,role.eq.SUPERVISOR')
          .eq('isActive', true)
          .order('department', { ascending: true })
          .order('name', { ascending: true });

        if (!error && data) {
          const supervisors = data.map(formatUser);
          return res.status(200).json({
            success: true,
            count: supervisors.length,
            supervisors,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getLineSupervisors] Supabase query notice:', dbErr.message);
      }
    }

    const supervisors = mockStore
      .getUsers()
      .filter((u) => (u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR') && u.isActive)
      .map(formatUser);

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
    const { role, department, search, isActive } = req.query;

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('users').select('*');

        if (role) {
          if (role === 'SUPERVISOR') {
            query = query.in('role', ['ACTION_PERSON', 'SUPERVISOR']);
          } else {
            query = query.eq('role', role);
          }
        }

        if (department) {
          query = query.eq('department', department);
        }

        if (typeof isActive !== 'undefined') {
          query = query.eq('isActive', isActive === 'true');
        }

        if (search) {
          const s = `%${search}%`;
          query = query.or(`name.ilike.${s},employeeId.ilike.${s},email.ilike.${s},department.ilike.${s},designation.ilike.${s}`);
        }

        const { data, error } = await query.order('role', { ascending: true }).order('name', { ascending: true });

        if (!error && data) {
          const users = data.map(formatUser);
          return res.status(200).json({
            success: true,
            count: users.length,
            users,
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:getAllUsers] Supabase notice:', dbErr.message);
      }
    }

    // Fallback store filtering
    let users = mockStore.getUsers();
    if (role) {
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
    return res.status(200).json({
      success: true,
      count: users.length,
      users: users.map(formatUser),
    });
  } catch (error) {
    const users = mockStore.getUsers().map(formatUser);
    res.status(200).json({
      success: true,
      count: users.length,
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
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (isSupabaseConfigured && supabase) {
      try {
        // Check duplicate employeeId
        const { data: existingEmp } = await supabase
          .from('users')
          .select('id, employeeId, name')
          .ilike('employeeId', employeeId.trim())
          .limit(1);

        if (existingEmp && existingEmp.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Employee ID '${employeeId.toUpperCase()}' is already registered to ${existingEmp[0].name}.`,
          });
        }

        // Check duplicate email
        const { data: existingEmail } = await supabase
          .from('users')
          .select('id, email')
          .ilike('email', email.trim())
          .limit(1);

        if (existingEmail && existingEmail.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Email address '${email.toLowerCase()}' is already registered in the system.`,
          });
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('users')
          .insert([
            {
              employeeId: employeeId.trim().toUpperCase(),
              name: name.trim(),
              email: email.trim().toLowerCase(),
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
          throw insertErr;
        }

        return res.status(201).json({
          success: true,
          message: `User '${inserted.name}' (${inserted.employeeId}) created successfully.`,
          user: formatUser(inserted),
        });
      } catch (dbErr) {
        console.error('[UserController:createUser] Supabase insert error:', dbErr.message);
        return res.status(400).json({
          success: false,
          message: `Database error saving user: ${dbErr.message}`,
        });
      }
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

    res.status(201).json({
      success: true,
      message: `User '${newUser.name}' (${newUser.employeeId}) created successfully.`,
      user: formatUser(newUser),
    });
  } catch (error) {
    console.error('[UserController] Create user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating user account.',
    });
  }
};

// @desc    Admin: Update user details
// @route   PUT /api/users/:id
// @access  Private (Admin Only)
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      name,
      email,
      department,
      designation,
      mobileNumber,
      role,
      isActive,
    } = req.body;

    if (isSupabaseConfigured && supabase) {
      try {
        const updatePayload = {
          updatedAt: new Date().toISOString(),
        };

        if (name) updatePayload.name = name.trim();
        if (department) updatePayload.department = department.trim();
        if (designation) updatePayload.designation = designation.trim();
        if (mobileNumber) updatePayload.mobileNumber = mobileNumber.trim();
        if (typeof isActive !== 'undefined') updatePayload.isActive = Boolean(isActive);
        if (role) updatePayload.role = role === 'SUPERVISOR' ? 'ACTION_PERSON' : role;

        if (email) {
          // Check email conflict
          const { data: conflict } = await supabase
            .from('users')
            .select('id')
            .ilike('email', email.trim())
            .neq('id', userId)
            .limit(1);

          if (conflict && conflict.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Email '${email}' is already in use by another account.`,
            });
          }
          updatePayload.email = email.trim().toLowerCase();
        }

        const { data: updated, error } = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', userId)
          .select()
          .maybeSingle();

        if (!error && updated) {
          return res.status(200).json({
            success: true,
            message: `User '${updated.name}' updated successfully.`,
            user: formatUser(updated),
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:updateUser] Supabase notice:', dbErr.message);
      }
    }

    const updated = mockStore.updateUser(userId, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: formatUser(updated),
    });
  } catch (error) {
    console.error('[UserController] Update user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user account.',
    });
  }
};

// @desc    Admin: Reset or update user password
// @route   PATCH /api/users/:id/reset-password
// @access  Private (Admin Only)
const resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters in length.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: updated, error } = await supabase
          .from('users')
          .update({
            password: hashedPassword,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id, employeeId, name, email, role')
          .maybeSingle();

        if (!error && updated) {
          return res.status(200).json({
            success: true,
            message: `Password for '${updated.name}' (${updated.employeeId}) has been successfully updated.`,
            user: formatUser(updated),
          });
        }
      } catch (dbErr) {
        console.warn('[UserController:resetPassword] Supabase notice:', dbErr.message);
      }
    }

    const updated = mockStore.updateUser(userId, { password: newPassword });
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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: current } = await supabase
          .from('users')
          .select('id, name, isActive')
          .eq('id', userId)
          .maybeSingle();

        if (current) {
          const nextState = !current.isActive;
          const { data: updated, error } = await supabase
            .from('users')
            .update({
              isActive: nextState,
              updatedAt: new Date().toISOString(),
            })
            .eq('id', userId)
            .select()
            .maybeSingle();

          if (!error && updated) {
            return res.status(200).json({
              success: true,
              message: `User '${updated.name}' has been ${updated.isActive ? 'activated' : 'deactivated'}.`,
              isActive: updated.isActive,
              user: formatUser(updated),
            });
          }
        }
      } catch (dbErr) {
        console.warn('[UserController:toggleStatus] Supabase notice:', dbErr.message);
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

module.exports = {
  getLineSupervisors,
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserStatus,
};
