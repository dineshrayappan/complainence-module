const { supabase, isSupabaseConfigured } = require('../config/supabase');
const mockStore = require('../config/mockStore');

// Helper to normalize department name
const normalizeDeptName = (name) => (name || '').trim();

// @desc    Get all factory departments with real-time stats
// @route   GET /api/departments
// @access  Private (Authenticated users)
const getDepartments = async (req, res) => {
  try {
    let departments = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbDepts, error } = await supabase
          .from('departments')
          .select('*')
          .order('name', { ascending: true });

        if (!error && Array.isArray(dbDepts) && dbDepts.length > 0) {
          departments = dbDepts;
        }
      } catch (err) {
        console.warn('[getDepartments] Supabase query notice:', err.message);
      }
    }

    if (departments.length === 0) {
      departments = mockStore.getDepartments();
    }

    // Augment with live counts: personnel, open NCs, and active tasks
    let usersList = [];
    let complaintsList = [];
    let tasksList = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const [uRes, cRes, tRes] = await Promise.all([
          supabase.from('users').select('id, department, isActive'),
          supabase.from('complaints').select('id, department, status'),
          supabase.from('compliance_tasks').select('id, department, status'),
        ]);
        if (Array.isArray(uRes.data)) usersList = uRes.data;
        if (Array.isArray(cRes.data)) complaintsList = cRes.data;
        if (Array.isArray(tRes.data)) tasksList = tRes.data;
      } catch (e) {}
    } else {
      usersList = mockStore.getUsers();
      complaintsList = mockStore.getComplaints({});
      tasksList = mockStore.getTasks();
    }

    const enriched = departments.map((d) => {
      const deptNameLower = (d.name || '').trim().toLowerCase();

      const personnelCount = usersList.filter(
        (u) => (u.department || '').trim().toLowerCase() === deptNameLower && u.isActive !== false
      ).length;

      const openNCs = complaintsList.filter((c) => {
        const matches = (c.department || '').trim().toLowerCase() === deptNameLower;
        return matches && c.status !== 'Closed' && c.status !== 'Verified';
      }).length;

      const activeTasks = tasksList.filter((t) => {
        const matches = (t.department || '').trim().toLowerCase() === deptNameLower;
        return matches && t.status !== 'Completed';
      }).length;

      return {
        id: d.id,
        _id: d.id,
        name: d.name,
        code: d.code,
        manager: d.manager || 'Unassigned',
        headcount: d.headcount || 20,
        createdAt: d.createdAt,
        personnelCount,
        openNCs,
        activeTasks,
      };
    });

    return res.status(200).json({
      success: true,
      count: enriched.length,
      departments: enriched,
    });
  } catch (error) {
    console.error('[DepartmentController] getDepartments error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch departments directory.',
    });
  }
};

// @desc    Admin: Check active/historical dependencies before department deletion
// @route   GET /api/departments/:id/dependencies
// @access  Private (Admin Only)
const checkDepartmentDependencies = async (req, res) => {
  try {
    const deptId = req.params.id;
    let targetDept = null;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .or(`id.eq.${deptId},name.ilike.${deptId}`)
          .maybeSingle();
        targetDept = dbDept;
      } catch (e) {}
    }

    if (!targetDept) {
      targetDept = mockStore.findDepartmentById(deptId);
    }

    if (!targetDept) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    const deptNameLower = (targetDept.name || '').trim().toLowerCase();

    let activePersonnel = 0;
    let openNCs = 0;
    let historicalNCs = 0;
    let activeTasks = 0;
    let completedTasks = 0;
    let scheduledAudits = 0;

    if (isSupabaseConfigured && supabase) {
      try {
        const [uRes, cRes, tRes, aRes] = await Promise.all([
          supabase.from('users').select('id, name, employeeId, department, isActive'),
          supabase.from('complaints').select('id, department, status'),
          supabase.from('compliance_tasks').select('id, department, status'),
          supabase.from('audits').select('id, department, status'),
        ]);

        if (Array.isArray(uRes.data)) {
          activePersonnel = uRes.data.filter(
            (u) => (u.department || '').trim().toLowerCase() === deptNameLower && u.isActive !== false
          ).length;
        }

        if (Array.isArray(cRes.data)) {
          cRes.data.forEach((c) => {
            if ((c.department || '').trim().toLowerCase() === deptNameLower) {
              if (c.status === 'Closed' || c.status === 'Verified') historicalNCs++;
              else openNCs++;
            }
          });
        }

        if (Array.isArray(tRes.data)) {
          tRes.data.forEach((t) => {
            if ((t.department || '').trim().toLowerCase() === deptNameLower) {
              if (t.status === 'Completed') completedTasks++;
              else activeTasks++;
            }
          });
        }

        if (Array.isArray(aRes.data)) {
          aRes.data.forEach((a) => {
            if ((a.department || '').trim().toLowerCase() === deptNameLower && a.status !== 'Completed') {
              scheduledAudits++;
            }
          });
        }
      } catch (err) {
        console.warn('[checkDepartmentDependencies] Supabase inspection notice:', err.message);
      }
    } else {
      activePersonnel = mockStore.getUsers().filter(
        (u) => (u.department || '').trim().toLowerCase() === deptNameLower && u.isActive !== false
      ).length;

      mockStore.getComplaints({}).forEach((c) => {
        if ((c.department || '').trim().toLowerCase() === deptNameLower) {
          if (c.status === 'Closed' || c.status === 'Verified') historicalNCs++;
          else openNCs++;
        }
      });

      mockStore.getTasks().forEach((t) => {
        if ((t.department || '').trim().toLowerCase() === deptNameLower) {
          if (t.status === 'Completed') completedTasks++;
          else activeTasks++;
        }
      });

      mockStore.getAudits().forEach((a) => {
        if ((a.department || '').trim().toLowerCase() === deptNameLower && a.status !== 'Completed') {
          scheduledAudits++;
        }
      });
    }

    const hasActiveDependencies = activePersonnel > 0 || openNCs > 0 || activeTasks > 0 || scheduledAudits > 0;

    return res.status(200).json({
      success: true,
      department: targetDept,
      dependencies: {
        activePersonnel,
        openNCs,
        historicalNCs,
        activeTasks,
        completedTasks,
        scheduledAudits,
        hasActiveDependencies,
      },
    });
  } catch (error) {
    console.error('[DepartmentController] checkDepartmentDependencies error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to inspect department dependencies.',
    });
  }
};

// @desc    Admin: Create new factory department
// @route   POST /api/departments
// @access  Private (Admin Only)
const createDepartment = async (req, res) => {
  try {
    const { name, code, manager, headcount } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Department Name and Department Code are required.',
      });
    }

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    // Check duplicate in Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: existing } = await supabase
          .from('departments')
          .select('id, name, code')
          .or(`name.ilike.${cleanName},code.ilike.${cleanCode}`)
          .limit(1);

        if (existing && existing.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Department '${cleanName}' or Code '${cleanCode}' already exists in the system.`,
          });
        }

        const newId = `dept-${Date.now().toString(36)}`;
        const { data: inserted, error: insertErr } = await supabase
          .from('departments')
          .insert([
            {
              id: newId,
              name: cleanName,
              code: cleanCode,
              manager: manager ? manager.trim() : 'Unassigned',
              headcount: Number(headcount) || 20,
            },
          ])
          .select()
          .single();

        if (insertErr) throw insertErr;

        mockStore.createDepartment(inserted);

        return res.status(201).json({
          success: true,
          message: `Department '${inserted.name}' (${inserted.code}) created successfully.`,
          department: inserted,
        });
      } catch (dbErr) {
        console.error('[createDepartment] Supabase insert error:', dbErr.message);
        return res.status(400).json({
          success: false,
          message: `Database error creating department: ${dbErr.message}`,
        });
      }
    }

    // Mock store insert
    const existingMock = mockStore.getDepartments().find(
      (d) => d.name?.toLowerCase() === cleanName.toLowerCase() || d.code?.toUpperCase() === cleanCode
    );
    if (existingMock) {
      return res.status(400).json({
        success: false,
        message: `Department '${cleanName}' or Code '${cleanCode}' already exists.`,
      });
    }

    const newDept = mockStore.createDepartment({
      name: cleanName,
      code: cleanCode,
      manager: manager ? manager.trim() : 'Unassigned',
      headcount: Number(headcount) || 20,
    });

    return res.status(201).json({
      success: true,
      message: `Department '${newDept.name}' (${newDept.code}) created successfully.`,
      department: newDept,
    });
  } catch (error) {
    console.error('[DepartmentController] createDepartment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating department.',
    });
  }
};

// @desc    Admin: Safely delete existing department
// @route   DELETE /api/departments/:id
// @access  Private (Admin Only)
const deleteDepartment = async (req, res) => {
  try {
    const deptId = req.params.id;
    let targetDept = null;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .or(`id.eq.${deptId},name.ilike.${deptId}`)
          .maybeSingle();
        targetDept = dbDept;
      } catch (e) {}
    }

    if (!targetDept) {
      targetDept = mockStore.findDepartmentById(deptId);
    }

    if (!targetDept) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    const deptNameLower = (targetDept.name || '').trim().toLowerCase();

    // Check active dependencies
    let activePersonnel = 0;
    let openNCs = 0;
    let activeTasks = 0;
    let scheduledAudits = 0;

    if (isSupabaseConfigured && supabase) {
      try {
        const [uRes, cRes, tRes, aRes] = await Promise.all([
          supabase.from('users').select('id, department, isActive'),
          supabase.from('complaints').select('id, department, status'),
          supabase.from('compliance_tasks').select('id, department, status'),
          supabase.from('audits').select('id, department, status'),
        ]);

        if (Array.isArray(uRes.data)) {
          activePersonnel = uRes.data.filter(
            (u) => (u.department || '').trim().toLowerCase() === deptNameLower && u.isActive !== false
          ).length;
        }

        if (Array.isArray(cRes.data)) {
          openNCs = cRes.data.filter(
            (c) => (c.department || '').trim().toLowerCase() === deptNameLower && c.status !== 'Closed' && c.status !== 'Verified'
          ).length;
        }

        if (Array.isArray(tRes.data)) {
          activeTasks = tRes.data.filter(
            (t) => (t.department || '').trim().toLowerCase() === deptNameLower && t.status !== 'Completed'
          ).length;
        }

        if (Array.isArray(aRes.data)) {
          scheduledAudits = aRes.data.filter(
            (a) => (a.department || '').trim().toLowerCase() === deptNameLower && a.status !== 'Completed'
          ).length;
        }
      } catch (err) {
        console.warn('[deleteDepartment] Supabase dependency check notice:', err.message);
      }
    } else {
      activePersonnel = mockStore.getUsers().filter(
        (u) => (u.department || '').trim().toLowerCase() === deptNameLower && u.isActive !== false
      ).length;

      openNCs = mockStore.getComplaints({}).filter(
        (c) => (c.department || '').trim().toLowerCase() === deptNameLower && c.status !== 'Closed' && c.status !== 'Verified'
      ).length;

      activeTasks = mockStore.getTasks().filter(
        (t) => (t.department || '').trim().toLowerCase() === deptNameLower && t.status !== 'Completed'
      ).length;

      scheduledAudits = mockStore.getAudits().filter(
        (a) => (a.department || '').trim().toLowerCase() === deptNameLower && a.status !== 'Completed'
      ).length;
    }

    if (activePersonnel > 0 || openNCs > 0 || activeTasks > 0 || scheduledAudits > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department '${targetDept.name}': Active assignments detected (${activePersonnel} active personnel, ${openNCs} open NC(s), ${activeTasks} active task(s), ${scheduledAudits} scheduled audit(s)). Please reassign personnel and resolve open records before deleting.`,
        dependencies: {
          activePersonnel,
          openNCs,
          activeTasks,
          scheduledAudits,
          hasActiveDependencies: true,
        },
      });
    }

    // Safe Deletion: Removes department record from master table while keeping all historical audit records in database
    if (isSupabaseConfigured && supabase) {
      try {
        const { error: delErr } = await supabase
          .from('departments')
          .delete()
          .eq('id', targetDept.id);

        if (delErr) {
          throw delErr;
        }
      } catch (dbErr) {
        console.error('[DepartmentController:deleteDepartment] Supabase error:', dbErr.message);
        return res.status(500).json({
          success: false,
          message: `Failed to remove department from database: ${dbErr.message}`,
        });
      }
    }

    mockStore.deleteDepartment(targetDept.id || targetDept.name);

    return res.status(200).json({
      success: true,
      message: `Department '${targetDept.name}' (${targetDept.code}) has been deleted successfully. Historical compliance audit records remain preserved.`,
      deletedId: targetDept.id,
      deletedName: targetDept.name,
    });
  } catch (error) {
    console.error('[DepartmentController] deleteDepartment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while deleting department.',
    });
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  deleteDepartment,
  checkDepartmentDependencies,
};
