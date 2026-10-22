const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'AUDITOR', 'ACTION_PERSON', 'SUPERVISOR'],
      required: [true, 'User role is required'],
      default: 'ACTION_PERSON',
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      trim: true,
      default: '',
    },
    isOwner: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isPresent: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastLogoutAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function () {
  if (this.role === 'OWNER') {
    this.isOwner = true;
  }
  if (this.role === 'SUPERVISOR') {
    this.role = 'ACTION_PERSON';
  }
  if (!this.isModified('password')) {
    return;
  }
  if (typeof this.password === 'string' && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$'))) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || !enteredPassword) return false;
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return await bcrypt.compare(enteredPassword, this.password);
  }
  // If legacy plain-text password exists in document, upgrade immediately to bcrypt
  if (this.password === enteredPassword) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(enteredPassword, salt);
    await this.save();
    return true;
  }
  return false;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
