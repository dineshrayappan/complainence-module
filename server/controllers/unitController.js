const Unit = require('../models/Unit');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const ComplianceTask = require('../models/ComplianceTask');
const { isMongoConnected, connectDB } = require('../config/db');
const { logEvent } = require('../utils/eventLogger');

// Default initial company units (Unit 1 & Unit 2)
const DEFAULT_UNITS = [
  {
    unitId: 'UNIT-1',
    name: 'Unit 1',
    code: 'U1',
    description: 'Primary Manufacturing / Plant 1',
    isActive: true,
  },
  {
    unitId: 'UNIT-2',
    name: 'Unit 2',
    code: 'U2',
    description: 'Secondary Plant / Facility 2',
    isActive: true,
  },
];

// Helper: Ensure default units exist in DB
const ensureDefaultUnits = async () => {
  if (!isMongoConnected()) {
    await connectDB();
  }
  if (isMongoConnected()) {
    const count = await Unit.countDocuments();
    if (count === 0) {
      await Unit.insertMany(DEFAULT_UNITS);
      console.log('⚡ [UnitController] Seeded default Unit 1 and Unit 2.');
    }
  }
};

// @desc    Get all units with summary stats and unassigned record counts
// @route   GET /api/units
// @access  Authenticated
const getUnits = async (req, res) => {
  try {
    await ensureDefaultUnits();

    let units = [];
    if (isMongoConnected()) {
      units = await Unit.find({}).sort({ unitId: 1 }).lean();
    } else {
      units = DEFAULT_UNITS.map((u, i) => ({ ...u, _id: `unit_${i + 1}`, id: `unit_${i + 1}` }));
    }

    // Attach real-time counts per unit
    let unassignedNCsCount = 0;
    let unassignedUsersCount = 0;
    let unassignedTasksCount = 0;

    if (isMongoConnected()) {
      unassignedNCsCount = await Complaint.countDocuments({
        $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
      });
      unassignedUsersCount = await User.countDocuments({
        $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
        isDeleted: { $ne: true },
      });
      unassignedTasksCount = await ComplianceTask.countDocuments({
        $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
      });

      // Calculate counts for each unit
      units = await Promise.all(
        units.map(async (unit) => {
          const ncCount = await Complaint.countDocuments({ unitId: unit.unitId });
          const userCount = await User.countDocuments({ unitId: unit.unitId, isDeleted: { $ne: true } });
          const taskCount = await ComplianceTask.countDocuments({ unitId: unit.unitId });
          return {
            ...unit,
            id: unit._id ? unit._id.toString() : unit.unitId,
            stats: {
              ncCount,
              userCount,
              taskCount,
            },
          };
        })
      );
    }

    res.status(200).json({
      success: true,
      data: units,
      unassigned: {
        ncCount: unassignedNCsCount,
        userCount: unassignedUsersCount,
        taskCount: unassignedTasksCount,
      },
    });
  } catch (error) {
    console.error('[UnitController] Error in getUnits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch units',
      error: error.message,
    });
  }
};

// @desc    Create a new unit
// @route   POST /api/units
// @access  Company Admin only
const createUnit = async (req, res) => {
  try {
    const { unitId, name, code, description, address } = req.body;

    if (!unitId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Unit ID and Unit Name are required',
      });
    }

    const cleanUnitId = unitId.trim().toUpperCase();

    if (isMongoConnected()) {
      const existing = await Unit.findOne({ unitId: cleanUnitId });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Unit with ID '${cleanUnitId}' already exists.`,
        });
      }

      const newUnit = await Unit.create({
        unitId: cleanUnitId,
        name: name.trim(),
        code: code ? code.trim().toUpperCase() : '',
        description: description ? description.trim() : '',
        address: address ? address.trim() : '',
        isActive: true,
      });

      await logEvent({
        action: 'UNIT_CREATED',
        performedBy: req.user?.employeeId || req.user?.email || 'ADMIN',
        role: req.user?.role || 'ADMIN',
        targetId: cleanUnitId,
        details: `Created new unit: ${name} (${cleanUnitId})`,
      });

      return res.status(201).json({
        success: true,
        message: `Unit '${name}' created successfully.`,
        data: newUnit,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Database connection required to create unit.',
    });
  } catch (error) {
    console.error('[UnitController] Error in createUnit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create unit',
      error: error.message,
    });
  }
};

// @desc    Update unit
// @route   PUT /api/units/:id
// @access  Company Admin only
const updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, address, isActive } = req.body;

    if (isMongoConnected()) {
      const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { unitId: id.toUpperCase() };
      const unit = await Unit.findOne(query);

      if (!unit) {
        return res.status(404).json({
          success: false,
          message: 'Unit not found',
        });
      }

      if (name) unit.name = name.trim();
      if (typeof code !== 'undefined') unit.code = code.trim().toUpperCase();
      if (typeof description !== 'undefined') unit.description = description.trim();
      if (typeof address !== 'undefined') unit.address = address.trim();
      if (typeof isActive !== 'undefined') unit.isActive = Boolean(isActive);

      await unit.save();

      // If unit name changed, update unitName in denormalized users, complaints, and tasks
      if (name) {
        await Complaint.updateMany({ unitId: unit.unitId }, { $set: { unitName: unit.name } });
        await User.updateMany({ unitId: unit.unitId }, { $set: { unitName: unit.name } });
        await ComplianceTask.updateMany({ unitId: unit.unitId }, { $set: { unitName: unit.name } });
      }

      await logEvent({
        action: 'UNIT_UPDATED',
        performedBy: req.user?.employeeId || req.user?.email || 'ADMIN',
        role: req.user?.role || 'ADMIN',
        targetId: unit.unitId,
        details: `Updated unit: ${unit.name} (${unit.unitId})`,
      });

      return res.status(200).json({
        success: true,
        message: 'Unit updated successfully',
        data: unit,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Database connection required to update unit.',
    });
  } catch (error) {
    console.error('[UnitController] Error in updateUnit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update unit',
      error: error.message,
    });
  }
};

// @desc    Get unassigned records (NCs, users, tasks) for review and mapping
// @route   GET /api/units/unassigned
// @access  Company Admin only
const getUnassignedRecords = async (req, res) => {
  try {
    if (!isMongoConnected()) {
      await connectDB();
    }

    const unassignedNCs = await Complaint.find({
      $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
    })
      .select('complaintId title department severity status createdAt')
      .lean();

    const unassignedUsers = await User.find({
      $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
      isDeleted: { $ne: true },
    })
      .select('employeeId name email role department')
      .lean();

    const unassignedTasks = await ComplianceTask.find({
      $or: [{ unitId: null }, { unitId: '' }, { unitId: 'UNASSIGNED' }, { unitId: { $exists: false } }],
    })
      .select('title department priority status dueDate')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        complaints: unassignedNCs,
        users: unassignedUsers,
        tasks: unassignedTasks,
      },
      counts: {
        complaints: unassignedNCs.length,
        users: unassignedUsers.length,
        tasks: unassignedTasks.length,
      },
    });
  } catch (error) {
    console.error('[UnitController] Error in getUnassignedRecords:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned records',
      error: error.message,
    });
  }
};

// @desc    Assign unassigned records to a specific unit
// @route   POST /api/units/assign-records
// @access  Company Admin only
const assignRecords = async (req, res) => {
  try {
    const { targetUnitId, complaintIds, userIds, taskIds } = req.body;

    if (!targetUnitId) {
      return res.status(400).json({
        success: false,
        message: 'targetUnitId is required',
      });
    }

    if (!isMongoConnected()) {
      await connectDB();
    }

    const unit = await Unit.findOne({ unitId: targetUnitId.toUpperCase() });
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: `Unit '${targetUnitId}' not found.`,
      });
    }

    const targetUnitName = unit.name;
    const cleanUnitId = unit.unitId;

    let complaintsUpdated = 0;
    let usersUpdated = 0;
    let tasksUpdated = 0;

    if (Array.isArray(complaintIds) && complaintIds.length > 0) {
      const cRes = await Complaint.updateMany(
        {
          $or: [
            { _id: { $in: complaintIds } },
            { complaintId: { $in: complaintIds } },
          ],
        },
        { $set: { unitId: cleanUnitId, unitName: targetUnitName } }
      );
      complaintsUpdated = cRes.modifiedCount || 0;
    }

    if (Array.isArray(userIds) && userIds.length > 0) {
      const uRes = await User.updateMany(
        {
          $or: [
            { _id: { $in: userIds } },
            { employeeId: { $in: userIds } },
            { email: { $in: userIds } },
          ],
        },
        {
          $set: {
            unitId: cleanUnitId,
            unitName: targetUnitName,
            assignedUnits: [cleanUnitId],
          },
        }
      );
      usersUpdated = uRes.modifiedCount || 0;
    }

    if (Array.isArray(taskIds) && taskIds.length > 0) {
      const tRes = await ComplianceTask.updateMany(
        { _id: { $in: taskIds } },
        { $set: { unitId: cleanUnitId, unitName: targetUnitName } }
      );
      tasksUpdated = tRes.modifiedCount || 0;
    }

    await logEvent({
      action: 'RECORDS_ASSIGNED_TO_UNIT',
      performedBy: req.user?.employeeId || req.user?.email || 'ADMIN',
      role: req.user?.role || 'ADMIN',
      targetId: cleanUnitId,
      details: `Assigned ${complaintsUpdated} NCs, ${usersUpdated} users, ${tasksUpdated} tasks to ${targetUnitName} (${cleanUnitId})`,
    });

    res.status(200).json({
      success: true,
      message: `Records successfully mapped to ${targetUnitName} (${cleanUnitId})`,
      updatedCounts: {
        complaints: complaintsUpdated,
        users: usersUpdated,
        tasks: tasksUpdated,
      },
    });
  } catch (error) {
    console.error('[UnitController] Error in assignRecords:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign records',
      error: error.message,
    });
  }
};

module.exports = {
  getUnits,
  createUnit,
  updateUnit,
  getUnassignedRecords,
  assignRecords,
  ensureDefaultUnits,
};
