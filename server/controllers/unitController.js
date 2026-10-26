const Unit = require('../models/Unit');
const { isMongoConnected, connectDB } = require('../config/db');
const { logEvent } = require('../utils/eventLogger');
const {
  getComplaintModel,
  getUserModel,
  getTaskModel,
  getCanonicalUnitId,
  getCanonicalUnitName,
} = require('../models/unitModels');

// Strictly Unit 1 and Unit 2 only
const FIXED_UNITS = [
  {
    unitId: 'UNIT-1',
    name: 'Unit 1',
    code: 'U1',
    description: 'Primary Plant / Unit 1 Facility',
    isActive: true,
  },
  {
    unitId: 'UNIT-2',
    name: 'Unit 2',
    code: 'U2',
    description: 'Secondary Plant / Unit 2 Facility',
    isActive: true,
  },
];

// Helper: Ensure only default units exist in DB
const ensureDefaultUnits = async () => {
  if (!isMongoConnected()) {
    await connectDB();
  }
  if (isMongoConnected()) {
    for (const u of FIXED_UNITS) {
      await Unit.findOneAndUpdate(
        { unitId: u.unitId },
        { $set: u },
        { upsert: true, new: true }
      );
    }
  }
};

// @desc    Get all units (strictly Unit 1 and Unit 2) with real-time stats
// @route   GET /api/units
// @access  Authenticated
const getUnits = async (req, res) => {
  try {
    await ensureDefaultUnits();

    let units = FIXED_UNITS.map((u, i) => ({ ...u, _id: `unit_${i + 1}`, id: u.unitId }));

    if (isMongoConnected()) {
      try {
        const dbUnits = await Unit.find({ unitId: { $in: ['UNIT-1', 'UNIT-2'] } }).sort({ unitId: 1 }).lean();
        if (dbUnits && dbUnits.length > 0) {
          units = dbUnits;
        }
      } catch (e) {}

      // Calculate real counts from unit-specific collections
      units = await Promise.all(
        units.map(async (unit) => {
          const canonId = getCanonicalUnitId(unit.unitId);
          const ComplaintModel = getComplaintModel(canonId);
          const UserModel = getUserModel(canonId);
          const TaskModel = getTaskModel(canonId);

          const ncCount = await ComplaintModel.countDocuments({ isDeleted: { $ne: true } });
          const userCount = await UserModel.countDocuments({ isDeleted: { $ne: true } });
          const taskCount = await TaskModel.countDocuments({});

          return {
            ...unit,
            id: unit._id ? unit._id.toString() : unit.unitId,
            unitId: canonId,
            name: getCanonicalUnitName(canonId),
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
        ncCount: 0,
        userCount: 0,
        taskCount: 0,
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

// @desc    Create a new unit - Restricted: only Unit 1 and Unit 2 are supported
// @route   POST /api/units
// @access  Company Admin only
const createUnit = async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'System is strictly restricted to Unit 1 and Unit 2. Additional units cannot be created.',
  });
};

// @desc    Update unit
// @route   PUT /api/units/:id
// @access  Company Admin only
const updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, address, isActive } = req.body;
    const cleanId = getCanonicalUnitId(id);

    if (cleanId !== 'UNIT-1' && cleanId !== 'UNIT-2') {
      return res.status(400).json({
        success: false,
        message: 'Only Unit 1 and Unit 2 are configurable.',
      });
    }

    if (isMongoConnected()) {
      const unit = await Unit.findOne({ unitId: cleanId });
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

// @desc    Get unassigned records (all assigned to Unit 1 during migration)
// @route   GET /api/units/unassigned
// @access  Company Admin only
const getUnassignedRecords = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      complaints: [],
      users: [],
      tasks: [],
    },
    counts: {
      complaints: 0,
      users: 0,
      tasks: 0,
    },
  });
};

// @desc    Assign unassigned records to a specific unit
// @route   POST /api/units/assign-records
// @access  Company Admin only
const assignRecords = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'All records are already partitioned into Unit 1 and Unit 2.',
    updatedCounts: {
      complaints: 0,
      users: 0,
      tasks: 0,
    },
  });
};

module.exports = {
  getUnits,
  createUnit,
  updateUnit,
  getUnassignedRecords,
  assignRecords,
  ensureDefaultUnits,
};
