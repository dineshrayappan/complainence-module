const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userId: {
      type: String,
      trim: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    department: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    role: {
      type: String,
      trim: true,
      default: 'ACTION_PERSON',
    },
    date: {
      type: String, // 'YYYY-MM-DD' formatted in Asia/Kolkata (IST)
      required: [true, 'Attendance date is required'],
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent'],
      default: 'Present',
    },
    loginTimestamp: {
      type: Date,
      default: Date.now,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: 'LOGIN',
    },
  },
  {
    timestamps: true,
  }
);

// Enforce strictly one attendance record per employee per day
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, department: 1 });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
