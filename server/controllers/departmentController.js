const { isMongoConnected } = require('../config/db');
const Department = require('../models/Department');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const ComplianceTask = require('../models/ComplianceTask');
const Audit = require('../models/Audit');
const mockStore = require('../config/mockStore');
const { logEvent } = require('../utils/eventLogger');

// Helper to normalize department name
const normalizeDeptName = (name) => (name || '').trim();

// @desc    Get all factory departments with real-time stats
// @route   GET /api/departments
// @access  Private (Authenticated users)
const getDepartments = async (req, res) => {
  try {
    let departments = [];

    if (isMongoConnected()) {
      try {
        const dbDepts = await Department.find().sort({ name: 1 }).lean();
        if (Array.isArray(dbDepts)) {
          departments = dbDepts.map((d) => ({
            ...d,
            id: d._id.toString(),
          }));
        }
      } catch (err) {
        console.warn('[getDepartments] MongoDB query notice:', err.message);
      }
    } else {
      departments = mockStore.getDepartments();
    }

    // Augment with live counts: personnel, open NCs, and active tasks
    let usersList = [];
    let complaintsList = [];
    let tasksList = [];

    const activeUnit = (req.query?.unitId || (req.isCompanyAdmin ? req.activeUnitId : req.user?.unitId) || '').toString().trim().toUpperCase();

    if (isMongoConnected()) {
      try {
        const uQuery = { isActive: true };
        const cQuery = { status: { $nin: ['Closed', 'Verified'] }, isDeleted: { $ne: true } };
        const tQuery = { status: { $ne: 'Completed' } };

        if (activeUnit && activeUnit !== 'ALL') {
          if (activeUnit === 'UNASSIGNED') {
            const unassigned = { $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }] };
            Object.assign(uQuery, unassigned);
            Object.assign(cQuery, unassigned);
            Object.assign(tQuery, unassigned);
          } else {
            uQuery.$or = [{ unitId: activeUnit }, { assignedUnits: activeUnit }];
            cQuery.unitId = activeUnit;
            tQuery.unitId = activeUnit;
          }
        }

        const [uRes, cRes, tRes] = await Promise.all([
          User.find(uQuery).select('department unitId').lean(),
          Complaint.find(cQuery).select('department status unitId').lean(),
          ComplianceTask.find(tQuery).select('department status unitId').lean(),
        ]);
        usersList = uRes || [];
        complaintsList = cRes || [];
        tasksList = tRes || [];
      } catch (e) {}
    } else {
      usersList = mockStore.getUsers();
      complaintsList = mockStore.getComplaints({});
      tasksList = mockStore.getTasks();
    }

    const enriched = departments.map((d) => {
      const deptNameLower = (d.name || '').trim().toLowerCase();

      const personnelCount = usersList.filter(
        (u) => (u.department || '').trim().toLowerCase() === deptNameLower
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
        id: d.id || d._id,
        _id: d.id || d._id,
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

    if (isMongoConnected()) {
      try {
        const query = {
          $or: [{ code: deptId.toUpperCase() }, { name: new RegExp(`^${deptId}$`, 'i') }],
        };
        if (deptId && typeof deptId === 'string' && deptId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: deptId });
        }
        targetDept = await Department.findOne(query).lean();
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

    if (isMongoConnected()) {
      try {
        activePersonnel = await User.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          isActive: true,
        });

        const complaints = await Complaint.find({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          isDeleted: { $ne: true },
        }).lean();
        complaints.forEach((c) => {
          if (c.status === 'Closed' || c.status === 'Verified') historicalNCs++;
          else openNCs++;
        });

        const tasks = await ComplianceTask.find({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
        }).lean();
        tasks.forEach((t) => {
          if (t.status === 'Completed') completedTasks++;
          else activeTasks++;
        });

        scheduledAudits = await Audit.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          status: { $ne: 'Completed' },
        });
      } catch (err) {
        console.warn('[checkDepartmentDependencies] MongoDB inspection notice:', err.message);
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

    // Check duplicate in MongoDB
    if (isMongoConnected()) {
      try {
        const existing = await Department.findOne({
          $or: [
            { name: new RegExp(`^${cleanName}$`, 'i') },
            { code: cleanCode },
          ],
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: `Department '${cleanName}' or Code '${cleanCode}' already exists in the system.`,
          });
        }

        const inserted = await Department.create({
          name: cleanName,
          code: cleanCode,
          manager: manager ? manager.trim() : 'Unassigned',
          headcount: Number(headcount) || 20,
        });

        mockStore.createDepartment({
          id: inserted._id.toString(),
          name: inserted.name,
          code: inserted.code,
          manager: inserted.manager,
          headcount: inserted.headcount,
        });

        return res.status(201).json({
          success: true,
          message: `Department '${inserted.name}' (${inserted.code}) created successfully.`,
          department: inserted,
        });
      } catch (dbErr) {
        console.error('[createDepartment] MongoDB insert error:', dbErr.message);
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

    if (isMongoConnected()) {
      try {
        const query = {
          $or: [{ code: deptId.toUpperCase() }, { name: new RegExp(`^${deptId}$`, 'i') }],
        };
        if (deptId && typeof deptId === 'string' && deptId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or.unshift({ _id: deptId });
        }
        targetDept = await Department.findOne(query).lean();
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

    if (isMongoConnected()) {
      try {
        activePersonnel = await User.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          isActive: true,
        });

        openNCs = await Complaint.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          status: { $nin: ['Closed', 'Verified'] },
        });

        activeTasks = await ComplianceTask.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          status: { $ne: 'Completed' },
        });

        scheduledAudits = await Audit.countDocuments({
          department: new RegExp(`^${targetDept.name.trim()}$`, 'i'),
          status: { $ne: 'Completed' },
        });
      } catch (err) {
        console.warn('[deleteDepartment] Dependency inspection notice:', err.message);
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

    // Safety guardrails
    if (activePersonnel > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department '${targetDept.name}': There are currently ${activePersonnel} active employees assigned to this department. Please reassign or update them first.`,
      });
    }

    if (openNCs > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department '${targetDept.name}': There are ${openNCs} active open Non-Conformance tickets in this department that require rectification.`,
      });
    }

    if (activeTasks > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department '${targetDept.name}': There are ${activeTasks} active compliance tasks scheduled.`,
      });
    }

    if (scheduledAudits > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department '${targetDept.name}': There are ${scheduledAudits} pending quality audits scheduled.`,
      });
    }

    // Perform deletion
    if (isMongoConnected()) {
      const query = {
        $or: [{ code: targetDept.code }, { name: targetDept.name }],
      };
      if (targetDept._id) {
        query.$or.unshift({ _id: targetDept._id });
      }
      await Department.findOneAndDelete(query);
    }

    // Delete in mockStore
    mockStore.deleteDepartment(targetDept.id || targetDept._id || targetDept.name);

    const actorName = req.user?.name || 'Administrator';
    const actorEmpId = req.user?.employeeId || 'ADMIN';
    const actorRole = req.user?.role || 'ADMIN';

    await logEvent({
      req,
      userId: actorEmpId,
      userName: actorName,
      userRole: actorRole,
      action: 'DEPARTMENT_DELETED',
      actionLabel: 'Department Deleted',
      category: 'DEPT_OPS',
      severity: 'CRITICAL',
      entityType: 'DEPARTMENT',
      entityId: targetDept.code || targetDept.name,
      entityName: targetDept.name,
      details: `Department '${targetDept.name}' (${targetDept.code}) was permanently deleted by ${actorName} (${actorEmpId} • ${actorRole}).`,
      payload: {
        deletedBy: { name: actorName, employeeId: actorEmpId, role: actorRole },
        deletedDepartment: {
          name: targetDept.name,
          code: targetDept.code,
          manager: targetDept.manager,
          headcount: targetDept.headcount,
        },
        deletedAt: new Date().toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Department '${targetDept.name}' (${targetDept.code}) has been deleted successfully by ${actorName}. Historical audit records remain preserved.`,
      deletedDepartment: targetDept,
    });
  } catch (error) {
    console.error('[DepartmentController] deleteDepartment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete department.',
    });
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  deleteDepartment,
  checkDepartmentDependencies,
};
