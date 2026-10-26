import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  KeyRound,
  ShieldCheck,
  Wrench,
  UserCog,
  Search,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  RefreshCw,
  Mail,
  Phone,
  Building2,
  Eye,
  EyeOff,
  Edit3,
  AlertTriangle,
  X,
  ArrowRight,
  Trash2,
  AlertOctagon,
  Layers,
  Activity,
  Clock,
  History,
  LogIn,
  Archive,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Calendar,
  CheckSquare,
} from 'lucide-react';
import { userService, departmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
import UserLoginTrackerPanel from './UserLoginTrackerPanel';
import LogHistoryPanel from './LogHistoryPanel';
import { UnitManagementPanel } from './UnitManagementPanel';

const FACTORY_DEPARTMENTS = [
  'Production',
  'Quality',
  'Maintenance',
  'Store',
  'EHS',
  'EDP',
  'HR',
];

export const AdminUserManagement = () => {
  const { isOwner } = useAuth();
  const { units, activeUnitId } = useUnit();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab =
    urlTab === 'units' || urlTab === 'unit-management'
      ? 'UNITS'
      : urlTab === 'logins' || urlTab === 'login-times' || urlTab === 'login-tracker'
      ? 'LOGIN_TRACKER'
      : urlTab === 'logs' || urlTab === 'history' || urlTab === 'audit-logs'
      ? 'LOG_HISTORY'
      : urlTab === 'departments'
      ? 'DEPARTMENTS'
      : 'PERSONNEL';

  const [adminTab, setAdminTab] = useState(initialTab);
  const [selectedLoginUser, setSelectedLoginUser] = useState(null);

  const handleTabChange = (newTab) => {
    setAdminTab(newTab);
    const tabParam =
      newTab === 'UNITS'
        ? 'units'
        : newTab === 'LOGIN_TRACKER'
        ? 'login-times'
        : newTab === 'LOG_HISTORY'
        ? 'history'
        : newTab === 'DEPARTMENTS'
        ? 'departments'
        : 'personnel';
    setSearchParams({ tab: tabParam }, { replace: true });
  };

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL', 'AUDITOR', 'SUPERVISOR', 'DEPARTMENTS', 'ADMIN', 'INACTIVE', 'ARCHIVED'
  const [toastMessage, setToastMessage] = useState(null);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // NC History Modal State
  const [isNcHistoryModalOpen, setIsNcHistoryModalOpen] = useState(false);
  const [ncHistoryUser, setNcHistoryUser] = useState(null);
  const [ncHistoryRecords, setNcHistoryRecords] = useState([]);
  const [ncHistoryLoading, setNcHistoryLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'USER' | 'DEPARTMENT', item }
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [dependencyData, setDependencyData] = useState(null);
  const [dependencyLoading, setDependencyLoading] = useState(false);

  // Add Department Modal State
  const [isCreateDeptModalOpen, setIsCreateDeptModalOpen] = useState(false);
  const [createDeptForm, setCreateDeptForm] = useState({
    name: '',
    code: '',
    manager: '',
    headcount: 20,
  });
  const [createDeptLoading, setCreateDeptLoading] = useState(false);
  const [createDeptError, setCreateDeptError] = useState('');

  // Create User Form State
  const [createForm, setCreateForm] = useState({
    role: 'AUDITOR', // 'AUDITOR' or 'SUPERVISOR' or 'ADMIN'
    name: '',
    employeeId: '',
    email: '',
    password: '',
    department: 'Quality',
    designation: 'QA Quality Auditor',
    mobileNumber: '',
    unitId: 'UNIT-1',
    unitName: 'Unit 1',
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  // Reset Password Form State
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  // Edit User Form State
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    department: '',
    designation: '',
    mobileNumber: '',
    role: '',
    unitId: '',
    unitName: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await userService.getAllUsers();
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      setDepartmentsLoading(true);
      const res = await departmentService.getDepartments();
      if (res.data?.success && Array.isArray(res.data.departments)) {
        setDepartmentsList(res.data.departments);
      }
    } catch (err) {
      console.warn('Failed to load departments:', err);
    } finally {
      setDepartmentsLoading(false);
    }
  };

  const loadArchivedUsers = async () => {
    try {
      setArchivedLoading(true);
      const res = await userService.getArchivedUsers();
      if (res.data?.success && Array.isArray(res.data.users)) {
        setArchivedUsers(res.data.users);
      }
    } catch (err) {
      console.warn('Failed to load archived users:', err);
    } finally {
      setArchivedLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadDepartments();
    loadArchivedUsers();
  }, [activeUnitId]);

  const handleOpenNcHistory = async (user) => {
    setNcHistoryUser(user);
    setNcHistoryRecords([]);
    setNcHistoryLoading(true);
    setIsNcHistoryModalOpen(true);
    try {
      const res = await userService.getUserNcHistory(user._id || user.id || user.employeeId);
      if (res.data?.success && Array.isArray(res.data.records)) {
        setNcHistoryRecords(res.data.records);
      }
    } catch (err) {
      console.error('Failed to load NC history:', err);
      showToast('Failed to retrieve NC history records for this user.');
    } finally {
      setNcHistoryLoading(false);
    }
  };

  const handleRestoreUser = async (user) => {
    if (
      !window.confirm(
        `Restore account for ${user.name} (${user.employeeId})?\n\nThis will restore login privileges and return the account to the active Personnel Directory.`
      )
    ) {
      return;
    }
    try {
      const res = await userService.restoreUser(user._id || user.id || user.employeeId);
      if (res.data?.success) {
        showToast(res.data.message || `Account for ${user.name} restored successfully.`);
        loadUsers();
        loadArchivedUsers();
        loadDepartments();
      }
    } catch (err) {
      console.error('Failed to restore user:', err);
      showToast(err.response?.data?.message || 'Failed to restore user account.');
    }
  };

  const availableDepartmentNames = departmentsList.length > 0
    ? departmentsList.map((d) => d.name)
    : FACTORY_DEPARTMENTS;

  // Open Delete Confirmation Modal with automated dependency inspection
  const handleOpenDeleteModal = async (type, item) => {
    if (type === 'USER' && (item.role === 'OWNER' || item.isOwner)) {
      showToast('The Owner account is permanent and cannot be deleted.');
      return;
    }
    setDeleteTarget({ type, item });
    setDeleteError('');
    setDependencyData(null);
    setIsDeleteModalOpen(true);
    setDependencyLoading(true);

    try {
      if (type === 'USER') {
        const res = await userService.checkUserDependencies(item._id || item.id || item.employeeId);
        if (res.data?.success) {
          setDependencyData(res.data.dependencies);
        }
      } else {
        const res = await departmentService.checkDepartmentDependencies(item.id || item.name);
        if (res.data?.success) {
          setDependencyData(res.data.dependencies);
        }
      }
    } catch (err) {
      console.warn('Dependency inspection notice:', err);
      if (err.response?.data?.dependencies) {
        setDependencyData(err.response.data.dependencies);
      }
    } finally {
      setDependencyLoading(false);
    }
  };

  // Submit Deletion / Archival
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');

    try {
      if (deleteTarget.type === 'USER') {
        const u = deleteTarget.item;
        const res = await userService.deleteUser(u._id || u.id || u.employeeId);
        if (res.data?.success) {
          showToast(res.data.message || `Account for ${u.name} archived successfully. Records preserved.`);
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
          loadUsers();
          loadArchivedUsers();
          loadDepartments();
        }
      } else {
        const d = deleteTarget.item;
        const res = await departmentService.deleteDepartment(d.id || d.name);
        if (res.data?.success) {
          showToast(res.data.message || `Department '${d.name}' deleted successfully.`);
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
          loadDepartments();
          loadUsers();
          loadArchivedUsers();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete. Please verify requirements.';
      setDeleteError(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Submit Create Department
  const handleCreateDeptSubmit = async (e) => {
    e.preventDefault();
    setCreateDeptError('');
    setCreateDeptLoading(true);

    try {
      const res = await departmentService.createDepartment(createDeptForm);
      if (res.data?.success) {
        showToast(res.data.message || `Department '${createDeptForm.name}' created!`);
        setIsCreateDeptModalOpen(false);
        setCreateDeptForm({ name: '', code: '', manager: '', headcount: 20 });
        loadDepartments();
      }
    } catch (err) {
      setCreateDeptError(
        err.response?.data?.message || 'Failed to create department. Please check code or name uniqueness.'
      );
    } finally {
      setCreateDeptLoading(false);
    }
  };

  // Compute metrics
  const totalUsers = users.length;
  const auditorCount = users.filter((u) => u.role === 'AUDITOR').length;
  const supervisorCount = users.filter(
    (u) => u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR'
  ).length;
  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;
  const presentCount = users.filter((u) => u.isPresent).length;
  const absentCount = users.filter((u) => !u.isPresent).length;

  // Filtered users list
  const filteredUsers = users.filter((u) => {
    // Hide Owner account from non-owner viewers
    if (!isOwner && (u.role === 'OWNER' || u.isOwner)) return false;

    // Role filter
    if (roleFilter === 'AUDITOR' && u.role !== 'AUDITOR') return false;
    if (
      roleFilter === 'SUPERVISOR' &&
      u.role !== 'ACTION_PERSON' &&
      u.role !== 'SUPERVISOR'
    )
      return false;
    if (roleFilter === 'ADMIN' && u.role !== 'ADMIN') return false;
    if (roleFilter === 'INACTIVE' && u.isActive) return false;
    if (roleFilter === 'PRESENT' && !u.isPresent) return false;
    if (roleFilter === 'ABSENT' && u.isPresent) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name?.toLowerCase().includes(q);
      const matchEmp = u.employeeId?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      const matchDept = u.department?.toLowerCase().includes(q);
      const matchDesig = u.designation?.toLowerCase().includes(q);
      if (!matchName && !matchEmp && !matchEmail && !matchDept && !matchDesig) {
        return false;
      }
    }

    return true;
  });

  // Filtered archived users list
  const filteredArchivedUsers = archivedUsers.filter((u) => {
    if (!isOwner && (u.role === 'OWNER' || u.isOwner)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q) ||
      u.designation?.toLowerCase().includes(q)
    );
  });

  // Filtered departments list
  const filteredDepartments = departmentsList.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.code?.toLowerCase().includes(q) ||
      d.manager?.toLowerCase().includes(q)
    );
  });

  // Open Create Modal & reset form (supports Auditor, Supervisor, and Administrator)
  const handleOpenCreateModal = (defaultRole = 'AUDITOR') => {
    const nextAuditorId = `AUD-00${auditorCount + 1}`;
    const nextSupervisorId = `SUP-10${supervisorCount + 1}`;
    const nextAdminId = `ADM-00${adminCount + 1}`;

    const isAud = defaultRole === 'AUDITOR';
    const isSup = defaultRole === 'SUPERVISOR';
    const defaultDept = isAud
      ? (availableDepartmentNames.includes('Quality') ? 'Quality' : availableDepartmentNames[0] || 'Quality')
      : isSup
      ? (availableDepartmentNames.includes('Production') ? 'Production' : availableDepartmentNames[0] || 'Production')
      : (availableDepartmentNames.includes('EDP') ? 'EDP' : availableDepartmentNames[0] || 'EDP');

    const defaultUnitId = activeUnitId && activeUnitId !== 'ALL' ? activeUnitId : (units[0]?.unitId || 'UNIT-1');
    const matchedUnit = units.find((u) => u.unitId === defaultUnitId);
    const defaultUnitName = defaultRole === 'ADMIN' && activeUnitId === 'ALL' ? 'All Units' : (matchedUnit ? matchedUnit.name : 'Unit 1');

    setCreateForm({
      role: defaultRole,
      name: '',
      employeeId: isAud ? nextAuditorId : isSup ? nextSupervisorId : nextAdminId,
      email: '',
      password: '',
      department: defaultDept,
      designation: isAud ? 'QA Quality Auditor' : isSup ? 'Production Supervisor' : 'System Administrator',
      mobileNumber: '+91 ',
      unitId: defaultRole === 'ADMIN' && activeUnitId === 'ALL' ? 'ALL' : defaultUnitId,
      unitName: defaultUnitName,
    });
    setCreatedCredentials(null);
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  // Switch role inside create form
  const handleRoleChangeInCreate = (newRole) => {
    const isAud = newRole === 'AUDITOR';
    const isSup = newRole === 'SUPERVISOR';
    setCreateForm((prev) => ({
      ...prev,
      role: newRole,
      employeeId: isAud
        ? `AUD-00${auditorCount + 1}`
        : isSup
        ? `SUP-10${supervisorCount + 1}`
        : `ADM-00${adminCount + 1}`,
      department: isAud
        ? (availableDepartmentNames.includes('Quality') ? 'Quality' : prev.department)
        : isSup
        ? (availableDepartmentNames.includes('Production') ? 'Production' : prev.department)
        : (availableDepartmentNames.includes('EDP') ? 'EDP' : prev.department),
      designation: isAud
        ? 'QA Quality Auditor'
        : isSup
        ? 'Production Supervisor'
        : 'System Administrator',
    }));
  };

  // Submit Create User
  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);

    try {
      const res = await userService.createUser(createForm);
      if (res.data.success) {
        setCreatedCredentials({
          name: createForm.name,
          employeeId: createForm.employeeId,
          email: createForm.email,
          password: createForm.password,
          role: createForm.role,
          department: createForm.department,
        });
        loadUsers();
        showToast(`User ${createForm.name} onboarded successfully!`);
      }
    } catch (err) {
      setCreateError(
        err.response?.data?.message || 'Failed to create user account. Please verify input.'
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenResetPassword = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setResetSuccess(false);
    setResetError('');
    setIsResetPasswordModalOpen(true);
  };

  // Submit Password Reset
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    try {
      const res = await userService.resetPassword(selectedUser._id, newPassword);
      if (res.data.success) {
        setResetSuccess(true);
        showToast(`Password updated for ${selectedUser.name}!`);
      }
    } catch (err) {
      setResetError(
        err.response?.data?.message || 'Failed to reset password. Please try again.'
      );
    } finally {
      setResetLoading(false);
    }
  };

  // Open Edit User Modal
  const handleOpenEditUser = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      department: user.department || '',
      designation: user.designation || '',
      mobileNumber: user.mobileNumber || '',
      role: user.role === 'ACTION_PERSON' ? 'SUPERVISOR' : user.role,
      unitId: user.unitId || '',
      unitName: user.unitName || '',
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  // Submit Edit User
  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);

    try {
      const res = await userService.updateUser(selectedUser._id, editForm);
      if (res.data.success) {
        setIsEditModalOpen(false);
        loadUsers();
        showToast(`Profile updated for ${editForm.name}!`);
      }
    } catch (err) {
      setEditError(
        err.response?.data?.message || 'Failed to update user profile.'
      );
    } finally {
      setEditLoading(false);
    }
  };

  // Toggle User Active/Inactive
  const handleToggleStatus = async (user) => {
    const actionName = user.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${actionName} account for ${user.name} (${user.employeeId})?`)) {
      return;
    }

    try {
      const res = await userService.toggleUserStatus(user._id);
      if (res.data.success) {
        showToast(`Account for ${user.name} is now ${res.data.isActive ? 'Active' : 'Deactivated'}`);
        loadUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to change account status.');
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white dark:bg-emerald-600 dark:text-white font-bold text-xs shadow-xl animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Title */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-500/20 backdrop-blur-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Personnel & Credentials
            </h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Onboard new <strong>Administrators</strong>, <strong>Internal Auditors</strong>, and <strong>Line Supervisors</strong>, manage credentials, reset passwords, and control department assignments.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => handleOpenCreateModal('ADMIN')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all hover:scale-102 cursor-pointer whitespace-nowrap"
          >
            <UserCog className="w-4 h-4" />
            <span>+ Add Admin</span>
          </button>

          <button
            onClick={() => handleOpenCreateModal('AUDITOR')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all hover:scale-102 cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>+ Add Auditor</span>
          </button>

          <button
            onClick={() => handleOpenCreateModal('SUPERVISOR')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all hover:scale-102 cursor-pointer whitespace-nowrap"
          >
            <Wrench className="w-4 h-4" />
            <span>+ Add Supervisor</span>
          </button>

          <button
            onClick={() => {
              setCreateDeptForm({ name: '', code: '', manager: '', headcount: 20 });
              setCreateDeptError('');
              setIsCreateDeptModalOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all hover:scale-102 cursor-pointer whitespace-nowrap"
          >
            <Building2 className="w-4 h-4" />
            <span>+ Add Department</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <span>Total Personnel</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {totalUsers}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
              ● {presentCount} Present
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              ○ {absentCount} Absent
            </span>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-500/20 shadow-xs">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 text-xs font-semibold mb-1">
            <span>Auditors</span>
            <ShieldCheck className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300">
            {auditorCount}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Quality assurance
          </span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
            <span>Supervisors</span>
            <Wrench className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">
            {supervisorCount}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Line in-charges
          </span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-blue-500/20 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-semibold mb-1">
            <span>Departments</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300">
            {departmentsList.length}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Active plant divisions
          </span>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/20 shadow-xs col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold mb-1">
            <span>Admins</span>
            <UserCog className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300">
            {adminCount}
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate block">
            Executive oversight
          </span>
        </div>
      </div>

      {/* Primary Admin Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 w-full overflow-x-auto no-scrollbar">
        <button
          onClick={() => handleTabChange('PERSONNEL')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'PERSONNEL'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-indigo-500" />
          <span>Personnel Directory</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
            {totalUsers}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('DEPARTMENTS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'DEPARTMENTS'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-blue-500" />
          <span>Departments</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
            {departmentsList.length}
          </span>
        </button>

        <button
          onClick={() => {
            setSelectedLoginUser(null);
            handleTabChange('LOGIN_TRACKER');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'LOGIN_TRACKER'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-500" />
          <span>Login Tracker</span>
        </button>

        <button
          onClick={() => handleTabChange('LOG_HISTORY')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'LOG_HISTORY'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5 text-purple-500" />
          <span>Past Records & Logs</span>
        </button>

        <button
          onClick={() => handleTabChange('UNITS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'UNITS'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-amber-500" />
          <span>Plant Units & Migration</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
            {units.length || 2}
          </span>
        </button>
      </div>

      {/* Render Active View Based on Selected Admin Tab */}
      {adminTab === 'UNITS' ? (
        <UnitManagementPanel
          showToast={showToast}
          onMigrateSuccess={() => {
            loadUsers();
            loadDepartments();
          }}
        />
      ) : adminTab === 'LOGIN_TRACKER' ? (
        <UserLoginTrackerPanel initialFilterUserId={selectedLoginUser} />
      ) : adminTab === 'LOG_HISTORY' ? (
        <LogHistoryPanel />
      ) : adminTab === 'DEPARTMENTS' ? (
        departmentsLoading && departmentsList.length === 0 ? (
          <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-3" />
            <span>Scanning Factory Departments Directory...</span>
          </div>
        ) : filteredDepartments.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-xs">
            No departments found matching the query.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDepartments.map((dept) => (
              <div
                key={dept.id || dept.name}
                className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-blue-500/20 hover:border-blue-500/50 hover:shadow-md transition-all relative flex flex-col justify-between"
              >
                <div>
                  {/* Top Row: Department Info */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center font-black text-sm text-white shadow-xs">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                          {dept.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            CODE: {dept.code}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                            {dept.manager || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                      Department
                    </span>
                  </div>

                  {/* Details Card */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 mb-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>Personnel Assigned:</span>
                      </span>
                      <strong className="font-semibold text-slate-800 dark:text-slate-100 font-mono">
                        {dept.personnelCount || 0} active
                      </strong>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" />
                        <span>Active Tasks:</span>
                      </span>
                      <span className={`font-mono font-semibold ${dept.activeTasks > 0 ? 'text-indigo-600 dark:text-cyan-400' : 'text-slate-500'}`}>
                        {dept.activeTasks || 0} in progress
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Open NCs:</span>
                      </span>
                      <span className={`font-mono font-semibold ${dept.openNCs > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {dept.openNCs || 0} open
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-400 text-[10px]">Headcount Capacity:</span>
                      <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                        {dept.headcount || 20} staff
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleOpenDeleteModal('DEPARTMENT', dept)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-bold text-xs transition-colors cursor-pointer"
                    title={`Delete department ${dept.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Department</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* Search & Filter Controls with smooth horizontal swipe */}
          <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-md w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, Employee ID, department..."
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Filter Pills with Horizontal Scroll on Mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto py-0.5">
              <button
                onClick={() => setRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Personnel ({users.length})
              </button>
              <button
                onClick={() => setRoleFilter('AUDITOR')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'AUDITOR'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
                }`}
              >
                Auditors ({auditorCount})
              </button>
              <button
                onClick={() => setRoleFilter('SUPERVISOR')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'SUPERVISOR'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                }`}
              >
                Supervisors ({supervisorCount})
              </button>
              <button
                onClick={() => handleTabChange('DEPARTMENTS')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
              >
                🏢 Departments ({departmentsList.length})
              </button>
              <button
                onClick={() => setRoleFilter('ADMIN')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'ADMIN'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                Admins ({adminCount})
              </button>
              {inactiveCount > 0 && (
                <button
                  onClick={() => setRoleFilter('INACTIVE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                    roleFilter === 'INACTIVE'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                  }`}
                >
                  Inactive ({inactiveCount})
                </button>
              )}
              <button
                onClick={() => setRoleFilter('PRESENT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'PRESENT'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                }`}
              >
                🟢 Present ({presentCount})
              </button>
              <button
                onClick={() => setRoleFilter('ABSENT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  roleFilter === 'ABSENT'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                ⚪ Absent ({absentCount})
              </button>

              <button
                onClick={() => setRoleFilter('ARCHIVED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  roleFilter === 'ARCHIVED'
                    ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-xs ring-2 ring-slate-400/50'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                <Archive className="w-3.5 h-3.5 text-slate-500" />
                <span>Archived / Deleted ({archivedUsers.length})</span>
              </button>

              <button
                onClick={() => {
                  loadUsers();
                  loadDepartments();
                  loadArchivedUsers();
                }}
                title="Refresh Personnel & Departments"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading || departmentsLoading || archivedLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Archived Users Grid or Active Personnel Directory View */}
          {roleFilter === 'ARCHIVED' ? (
            archivedLoading && archivedUsers.length === 0 ? (
              <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-slate-500 border-t-transparent animate-spin mb-3" />
                <span>Loading Archived & Deleted Users Directory...</span>
              </div>
            ) : filteredArchivedUsers.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-xs space-y-2">
                <Archive className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <p>No archived or soft-deleted user accounts found.</p>
                <p className="text-[11px] text-slate-500">
                  When personnel accounts are removed, they will appear here with full NC/CAP record history preserved.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-slate-500" />
                    <span>
                      Showing <strong>{filteredArchivedUsers.length}</strong> archived account(s). All associated NC/CAP records, attachments, evidence photos, and audit logs are permanently preserved.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredArchivedUsers.map((u) => {
                    const isAud = u.role === 'AUDITOR';
                    return (
                      <div
                        key={u._id || u.id}
                        className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs relative flex flex-col justify-between"
                      >
                        <div>
                          {/* Top Row: Avatar & Badges */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center font-black text-sm text-white shadow-xs relative">
                                {u.name?.charAt(0).toUpperCase()}
                                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-500 border-2 border-white dark:border-slate-900" title="Archived Account" />
                              </div>

                              <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                  {u.name}
                                </h3>
                                <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                                  <span className="font-bold text-slate-600 dark:text-slate-400">
                                    {u.employeeId}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                                    {u.designation || (isAud ? 'Internal Auditor' : 'Line Supervisor')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center gap-1">
                              <Archive className="w-3 h-3" />
                              <span>{isAud ? 'Auditor' : 'Supervisor'}</span>
                            </span>
                          </div>

                          {/* Deletion & Preservation Notice */}
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-[11px] space-y-1 mb-3">
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Archived Date:</span>
                              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                {u.deletedAt ? new Date(u.deletedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recorded'}
                              </span>
                            </div>
                            {u.deletedBy?.name && (
                              <div className="flex items-center justify-between text-slate-500">
                                <span>Archived By:</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                                  {u.deletedBy.name}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Department:</span>
                              <strong className="text-slate-700 dark:text-slate-200">{u.department}</strong>
                            </div>
                          </div>

                          {/* Preserved NC Records Statistics Bar */}
                          <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 mb-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[11px] flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                                <FileText className="w-3.5 h-3.5" />
                                <span>Preserved NC Records:</span>
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono font-bold text-xs">
                                {u.totalNcCount || 0}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono pt-1 border-t border-indigo-200/50 dark:border-indigo-900/50">
                              <span>Created: {u.createdNcCount || 0}</span>
                              <span>•</span>
                              <span>Assigned: {u.assignedNcCount || 0}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={() => handleOpenNcHistory(u)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                            title="View all preserved NC/CAP records, attachments, and photos"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View NC History</span>
                          </button>

                          <button
                            onClick={() => handleRestoreUser(u)}
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
                            title="Restore this user account"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : loading && users.length === 0 ? (
        <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mb-3" />
          <span>Scanning Factory Personnel Directory...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-xs">
          No personnel found matching the query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const isAud = u.role === 'AUDITOR';
            const isAdm = u.role === 'ADMIN';
            const isSup = u.role === 'ACTION_PERSON' || u.role === 'SUPERVISOR';

            return (
              <div
                key={u._id}
                className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  !u.isActive
                    ? 'bg-slate-50/60 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800 opacity-75'
                    : isAdm
                    ? 'bg-white dark:bg-slate-900 border-amber-500/30 hover:shadow-md hover:border-amber-500/60'
                    : isAud
                    ? 'bg-white dark:bg-slate-900 border-purple-500/20 hover:shadow-md hover:border-purple-500/50'
                    : 'bg-white dark:bg-slate-900 border-emerald-500/20 hover:shadow-md hover:border-emerald-500/50'
                }`}
              >
                <div>
                  {/* Top Row: Initial Avatar & Badges */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs relative ${
                          isAdm
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                            : isAud
                            ? 'bg-gradient-to-br from-purple-600 to-indigo-600'
                            : 'bg-gradient-to-br from-emerald-600 to-teal-600'
                        }`}
                      >
                        {u.name?.charAt(0).toUpperCase()}
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                            u.isPresent
                              ? 'bg-emerald-500 ring-2 ring-emerald-400/50'
                              : u.isActive
                              ? 'bg-slate-400'
                              : 'bg-rose-500'
                          }`}
                          title={u.isPresent ? 'Present (Daily Attendance: Present)' : 'Absent (Daily Attendance: Absent)'}
                        />
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                          {u.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                          <span
                            className={`font-bold ${
                              isAdm
                                ? 'text-amber-600 dark:text-amber-400'
                                : isAud
                                ? 'text-purple-600 dark:text-purple-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {u.employeeId}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {u.designation}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        isAdm
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                          : isAud
                          ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                    >
                      {isAdm ? 'Admin' : isAud ? 'Auditor' : 'Supervisor'}
                    </span>
                  </div>

                  {/* Details Card */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 mb-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-500" />
                        <span>Plant Unit:</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                          u.unitId === 'UNIT-1'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                            : u.unitId === 'UNIT-2'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            : u.unitId === 'ALL' || isAdm || u.role === 'OWNER'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {u.unitName
                          ? `${u.unitName} (${u.unitId})`
                          : u.unitId
                          ? u.unitId
                          : isAdm || u.role === 'OWNER'
                          ? 'All Units (Company Wide)'
                          : 'Unassigned (Legacy)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Department:</span>
                      </span>
                      <strong className="font-semibold text-slate-800 dark:text-slate-100 text-right truncate">
                        {u.department}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 truncate">
                          {u.email}
                        </span>
                        <button
                          onClick={() => copyToClipboard(u.email, `email-${u._id}`)}
                          title="Copy Email"
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {copiedField === `email-${u._id}` ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Mobile:</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">
                        {u.mobileNumber || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-400 text-[10px]">Access Status:</span>
                      <span
                        className={`text-[10px] font-bold ${
                          u.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {u.isActive ? 'Active • Can Sign In' : 'Deactivated • Login Disabled'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 text-[10px]">Daily Attendance:</span>
                      <span
                        className={`text-[10px] font-bold inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                          u.isPresent
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${u.isPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span>{u.isPresent ? 'Present' : 'Absent'}</span>
                        {u.loginTimestamp && (
                          <span className="text-[9px] font-normal opacity-80">
                            • {new Date(u.loginTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleOpenResetPassword(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[11px] transition-colors cursor-pointer"
                    title="Change or reset this user's password"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Password</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedLoginUser(u.employeeId);
                      handleTabChange('LOGIN_TRACKER');
                    }}
                    className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                    title="Track this user's login times and sessions"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleOpenEditUser(u)}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                    title="Edit profile and department"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {!isAdm && (
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                        u.isActive
                          ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600'
                          : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-600'
                      }`}
                      title={u.isActive ? 'Deactivate account' : 'Reactivate account'}
                    >
                      {u.isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  {!isAdm && (
                    <button
                      onClick={() => handleOpenDeleteModal('USER', u)}
                      className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                      title={`Delete ${isAud ? 'Auditor' : 'Supervisor'} Account`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* ================= MODAL 1: ONBOARD NEW USER ================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-transparent shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Onboard Factory Personnel
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Create credentials for newly joined Administrator, Auditor, or Supervisor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If user was just created, show credential copy card */}
            {createdCredentials ? (
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-bold text-sm mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <span>Account Created Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Share the login credentials below with <strong>{createdCredentials.name}</strong>:
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Employee ID:</span>
                    <strong className="text-slate-900 dark:text-white">{createdCredentials.employeeId}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email:</span>
                    <strong className="text-slate-900 dark:text-white truncate max-w-[200px]">{createdCredentials.email}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Initial Password:</span>
                    <span className="bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded text-amber-900 dark:text-amber-200 font-bold">
                      {createdCredentials.password}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Role:</span>
                    <span className="font-bold text-indigo-600 dark:text-cyan-400">{createdCredentials.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Department:</span>
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{createdCredentials.department}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const loginUrl = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:5173';
                      const text = `TEXTILE QMS LOGIN CREDENTIALS\nName: ${createdCredentials.name}\nRole: ${createdCredentials.role}\nEmployee ID: ${createdCredentials.employeeId}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nLogin at: ${loginUrl}`;
                      copyToClipboard(text, 'all-creds');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    {copiedField === 'all-creds' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy All Credentials</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUserSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
                {createError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                {/* Role Selector Tabs (Auditor, Supervisor, Administrator) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Select Role & Authority Level *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRoleChangeInCreate('AUDITOR')}
                      className={`flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        createForm.role === 'AUDITOR'
                          ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Auditor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRoleChangeInCreate('SUPERVISOR')}
                      className={`flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        createForm.role === 'SUPERVISOR'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <Wrench className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Supervisor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRoleChangeInCreate('ADMIN')}
                      className={`flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        createForm.role === 'ADMIN'
                          ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <UserCog className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Administrator</span>
                    </button>
                  </div>
                </div>

                {/* Name & Employee ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kavita Sen"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Employee ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AUD-002 or SUP-105"
                      value={createForm.employeeId}
                      onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none uppercase"
                    />
                  </div>
                </div>

                {/* Email & Initial Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <span>Email Address (Login ID) *</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1.5">
                        (Duplicate emails permitted)
                      </span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. kavita@factory.com"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showCreatePassword ? 'text' : 'password'}
                        name="account_secret_password"
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                        required
                        minLength={6}
                        placeholder="Enter password (min 6 characters)"
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                        className="w-full pl-3 pr-8 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCreatePassword(!showCreatePassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        title={showCreatePassword ? 'Hide password' : 'Show password'}
                      >
                        {showCreatePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Department & Designation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Department / Production Line *
                    </label>
                    <select
                      value={createForm.department}
                      onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      {availableDepartmentNames.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Designation *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Line In-Charge"
                      value={createForm.designation}
                      onChange={(e) => setCreateForm({ ...createForm, designation: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Assigned Plant Unit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Assigned Plant Unit *
                  </label>
                  <select
                    value={createForm.unitId || ''}
                    onChange={(e) => {
                      const uId = e.target.value;
                      const matched = units.find((u) => u.unitId === uId);
                      setCreateForm({
                        ...createForm,
                        unitId: uId,
                        unitName: matched ? matched.name : (uId === 'ALL' ? 'All Units' : ''),
                      });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    {createForm.role === 'ADMIN' && (
                      <option value="ALL">🏢 All Units (Company-Wide Administrator)</option>
                    )}
                    {units.map((u) => (
                      <option key={u.unitId} value={u.unitId}>
                        📍 {u.name} ({u.unitId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Number (For Escalation Alerts) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 43210"
                    value={createForm.mobileNumber}
                    onChange={(e) => setCreateForm({ ...createForm, mobileNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {createLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Save & Issue Credentials</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL 2: RESET PASSWORD ================= */}
      {isResetPasswordModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-500/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Reset Password
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Set a new password for {selectedUser.name} ({selectedUser.employeeId})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-bold text-sm mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Password Successfully Reset!</span>
                  </div>
                  <p className="text-xs">
                    The password has been encrypted and updated. Inform <strong>{selectedUser.name}</strong> of their new login credentials:
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs flex items-center justify-between">
                  <span className="text-slate-500">New Password:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{newPassword}</span>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(`Your new QMS password: ${newPassword}`, 'reset-pwd')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs cursor-pointer"
                >
                  {copiedField === 'reset-pwd' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy New Password</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
                {resetError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    {resetError}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Employee:</span>
                    <strong className="text-slate-900 dark:text-white">{selectedUser.name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{selectedUser.email}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Enter New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      name="admin_reset_user_password"
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      required
                      minLength={6}
                      placeholder="Enter new password (min 6 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsResetPasswordModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {resetLoading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL 3: EDIT USER PROFILE ================= */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-100/50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Edit Personnel Profile
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Update line assignment or contact info for {selectedUser.employeeId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span>Email Address</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1.5">
                    (Duplicate emails permitted)
                  </span>
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Role / Access Authority Level
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  disabled={selectedUser.role === 'OWNER' || selectedUser.isOwner}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 cursor-pointer"
                >
                  <option value="ADMIN">Administrator (Full Admin Access & Oversight)</option>
                  <option value="AUDITOR">Internal Auditor (Defect Audit & Verification)</option>
                  <option value="SUPERVISOR">Line Supervisor (Task Action & CAP Execution)</option>
                  {(selectedUser.role === 'OWNER' || selectedUser.isOwner) && (
                    <option value="OWNER">Owner (Protected Master Account)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Department / Line
                </label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {availableDepartmentNames.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  required
                  value={editForm.designation}
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assigned Plant Unit
                </label>
                <select
                  value={editForm.unitId || ''}
                  onChange={(e) => {
                    const uId = e.target.value;
                    const matched = units.find((u) => u.unitId === uId);
                    setEditForm({
                      ...editForm,
                      unitId: uId,
                      unitName: matched ? matched.name : (uId === 'ALL' ? 'All Units' : ''),
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">(Unassigned / Legacy)</option>
                  {(editForm.role === 'ADMIN' || selectedUser.role === 'OWNER') && (
                    <option value="ALL">🏢 All Units (Company-Wide Administrator)</option>
                  )}
                  {units.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      📍 {u.name} ({u.unitId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  required
                  value={editForm.mobileNumber}
                  onChange={(e) => setEditForm({ ...editForm, mobileNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  {editLoading ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: DELETE CONFIRMATION DIALOG ================= */}
      {isDeleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {deleteTarget.type === 'DEPARTMENT'
                      ? 'Delete Factory Department'
                      : deleteTarget.item.role === 'AUDITOR'
                      ? 'Delete Auditor Account'
                      : 'Delete Personnel Account'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Confirm deletion with safe data integrity verification
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-4 text-xs">
              {/* Target Details Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 shrink-0">
                  {deleteTarget.type === 'DEPARTMENT' ? (
                    <Building2 className="w-5 h-5 text-blue-500" />
                  ) : (
                    deleteTarget.item.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {deleteTarget.item.name}
                  </h3>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5 font-mono">
                    {deleteTarget.type === 'DEPARTMENT' ? (
                      <>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          CODE: {deleteTarget.item.code}
                        </span>
                        <span>•</span>
                        <span>Lead: {deleteTarget.item.manager || 'Unassigned'}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          {deleteTarget.item.employeeId}
                        </span>
                        <span>•</span>
                        <span>{deleteTarget.item.department}</span>
                        <span>•</span>
                        <span className="capitalize">{deleteTarget.item.role?.toLowerCase()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Dependency Inspection Box */}
              {dependencyLoading ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center py-6 text-slate-500 font-mono text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-500 mb-2" />
                  <span>Verifying active tasks, NCs, and record archives...</span>
                </div>
              ) : deleteTarget.type === 'USER' ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-700 dark:text-amber-400">
                      <Archive className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Safe Soft-Delete & Record Preservation</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                      Deleting this account performs a <strong>safe soft-delete</strong>. The user's login access will be revoked and they will not receive new assignments.
                    </p>
                    <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40 p-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800/60">
                      ✅ <strong>100% Data Preservation Guaranteed:</strong>
                      <ul className="list-disc list-inside mt-1 font-normal text-[10px] space-y-0.5">
                        <li>All NC findings, defect descriptions, and before/after photos remain permanently intact.</li>
                        <li>Complete CAP submissions, root cause analyses, and action plans are preserved.</li>
                        <li>Historical audit reports, exports, and dashboards will continue displaying {deleteTarget.item.name}'s original name and department.</li>
                        <li>This account will move to the <strong>Archived / Deleted</strong> tab and can be restored anytime by Admin.</li>
                      </ul>
                    </div>
                  </div>

                  {dependencyData && (dependencyData.openNCs > 0 || dependencyData.activeTasks > 0) && (
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                        <Activity className="w-3.5 h-3.5 text-amber-500" />
                        <span>Associated Work Orders:</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400">
                        {dependencyData.openNCs > 0 && `• ${dependencyData.openNCs} Open NC(s)`}
                        {dependencyData.activeTasks > 0 && ` • ${dependencyData.activeTasks} Active Task(s)`}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        These records will remain assigned and preserved in the NC register.
                      </p>
                    </div>
                  )}
                </div>
              ) : dependencyData ? (
                dependencyData.hasActiveDependencies ? (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-700 dark:text-rose-300">
                      <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Deletion Blocked: Active Operational Records Found</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-800/90 dark:text-rose-300/90">
                      This department currently has active work assigned:
                    </p>
                    <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-rose-800 dark:text-rose-300 pl-1">
                      {dependencyData.openNCs > 0 && (
                        <li><strong>{dependencyData.openNCs}</strong> Open Non-Conformance(s)</li>
                      )}
                      {dependencyData.activeTasks > 0 && (
                        <li><strong>{dependencyData.activeTasks}</strong> Active Compliance Task(s)</li>
                      )}
                      {dependencyData.scheduledAudits > 0 && (
                        <li><strong>{dependencyData.scheduledAudits}</strong> Scheduled Audit(s)</li>
                      )}
                      {dependencyData.activePersonnel > 0 && (
                        <li><strong>{dependencyData.activePersonnel}</strong> Assigned Plant Personnel</li>
                      )}
                    </ul>
                    <div className="text-[10px] bg-rose-100/70 dark:bg-rose-900/50 p-2 rounded-xl text-rose-800 dark:text-rose-200 font-sans mt-2">
                      ⚠️ To ensure QMS workflow stability and avoid orphaned work orders, please reassign personnel and close open records before deleting.
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Zero Active Dependencies: Safe to Delete</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-800/90 dark:text-emerald-300/90">
                      No active open tasks or unresolved non-conformances are assigned to this department.
                    </p>
                    <div className="text-[10px] bg-emerald-100/60 dark:bg-emerald-900/40 p-2 rounded-xl text-emerald-800 dark:text-emerald-300">
                      🔒 <strong>Historical Data Integrity:</strong> All historical closed NCs, verified CAPs, and audit trail logs will be permanently retained in the compliance database.
                    </div>
                  </div>
                )
              ) : null}

              {/* Error message if delete failed */}
              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmDelete}
                disabled={
                  deleteLoading ||
                  dependencyLoading ||
                  (deleteTarget.type === 'DEPARTMENT' && dependencyData?.hasActiveDependencies)
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                {deleteLoading ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {deleteTarget.type === 'DEPARTMENT'
                    ? 'Confirm Delete Department'
                    : deleteTarget.item.role === 'AUDITOR'
                    ? 'Confirm Archive Auditor'
                    : 'Confirm Archive Account'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 5: ONBOARD NEW DEPARTMENT ================= */}
      {isCreateDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Add Factory Department
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Register a new plant division in master registry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateDeptModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateDeptSubmit} className="p-4 sm:p-5 space-y-4">
              {createDeptError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{createDeptError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finishing & Packaging, Dyeing Unit"
                  value={createDeptForm.name}
                  onChange={(e) => setCreateDeptForm({ ...createDeptForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Department Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FIN, DYE"
                    value={createDeptForm.code}
                    onChange={(e) => setCreateDeptForm({ ...createDeptForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Headcount Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="25"
                    value={createDeptForm.headcount}
                    onChange={(e) => setCreateDeptForm({ ...createDeptForm, headcount: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lead Manager / Supervisor
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anand Verma"
                  value={createDeptForm.manager}
                  onChange={(e) => setCreateDeptForm({ ...createDeptForm, manager: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDeptModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDeptLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50 transition-all cursor-pointer shadow-md shadow-blue-600/20"
                >
                  {createDeptLoading ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Building2 className="w-3.5 h-3.5" />
                  )}
                  <span>Create Department</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 6: PRESERVED NC/CAP RECORD HISTORY ================= */}
      {isNcHistoryModalOpen && ncHistoryUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                      Preserved NC / CAP Records History
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                      {ncHistoryRecords.length} Records
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    User: <strong className="text-slate-900 dark:text-white">{ncHistoryUser.name}</strong> ({ncHistoryUser.employeeId}) • {ncHistoryUser.role} • {ncHistoryUser.department}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsNcHistoryModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Banner: Reassurance */}
            <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Full Data Integrity:</strong> All finding descriptions, requirements, root causes, corrective/preventive actions, assignees, and before/after evidence photos are permanently preserved in the compliance register.
                </span>
              </div>
            </div>

            {/* Modal Body: Records List */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {ncHistoryLoading ? (
                <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                  <span>Loading preserved non-conformance records and attachments...</span>
                </div>
              ) : ncHistoryRecords.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-500 font-mono text-xs">
                  No Non-Conformance or CAP records were logged by or assigned to this user.
                </div>
              ) : (
                ncHistoryRecords.map((rec) => (
                  <div
                    key={rec.complaintId || rec.id || rec._id}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs space-y-3"
                  >
                    {/* Top Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">
                          {rec.complaintId}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                            ['Closed', 'Verified'].includes(rec.status)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : ['CAP Submitted', 'Under Verification', 'Under Review'].includes(rec.status)
                              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {rec.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {rec.userRelationship || 'Related Record'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Logged: {new Date(rec.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>

                    {/* Defect Finding & Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-400 block font-semibold mb-0.5">Finding Description</span>
                        <p className="text-slate-800 dark:text-slate-200 font-medium">
                          {rec.description || 'No detailed description provided.'}
                        </p>
                        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                          <span><strong>Category:</strong> {rec.category}</span>
                          <span>•</span>
                          <span><strong>Dept:</strong> {rec.department}</span>
                          <span>•</span>
                          <span><strong>Severity:</strong> {rec.riskSeverity || rec.priority || 'Major'}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block font-semibold mb-0.5">Personnel Involved</span>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Created / Reported By:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {rec.createdBy?.name || rec.creatorName || 'Auditor'} ({rec.createdBy?.department || rec.department})
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Assigned To:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {rec.assignedTo?.name || rec.assignedToName || 'Supervisor'} ({rec.assignedTo?.department || rec.department})
                            </span>
                          </div>
                          {rec.actualCompletedAt && (
                            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                              <span>Completed / Verified:</span>
                              <span className="font-mono">{new Date(rec.actualCompletedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CAP Details (if available) */}
                    {rec.cap && (rec.cap.rootCause || rec.cap.correctiveAction) && (
                      <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/50 text-xs space-y-1.5">
                        <div className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5 text-[11px]">
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>Corrective & Preventive Action Plan (CAP)</span>
                        </div>
                        {rec.cap.rootCause && (
                          <div className="text-[11px]">
                            <strong className="text-slate-700 dark:text-slate-300">Root Cause: </strong>
                            <span className="text-slate-600 dark:text-slate-400">{rec.cap.rootCause}</span>
                          </div>
                        )}
                        {rec.cap.correctiveAction && (
                          <div className="text-[11px]">
                            <strong className="text-slate-700 dark:text-slate-300">Corrective Action: </strong>
                            <span className="text-slate-600 dark:text-slate-400">{rec.cap.correctiveAction}</span>
                          </div>
                        )}
                        {rec.cap.preventiveAction && (
                          <div className="text-[11px]">
                            <strong className="text-slate-700 dark:text-slate-300">Preventive Action: </strong>
                            <span className="text-slate-600 dark:text-slate-400">{rec.cap.preventiveAction}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Evidence Photos */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <span className="text-slate-400 font-semibold flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Evidence Photos:</span>
                      </span>

                      {rec.beforePhoto ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto({ url: rec.beforePhoto, label: `Before Photo: ${rec.complaintId}` })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors font-medium"
                        >
                          <img src={rec.beforePhoto} alt="Before" className="w-5 h-5 rounded object-cover border" />
                          <span>View Before Photo</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">No Before Photo</span>
                      )}

                      {rec.afterPhoto ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto({ url: rec.afterPhoto, label: `After Photo: ${rec.complaintId}` })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer transition-colors font-medium border border-emerald-200 dark:border-emerald-800"
                        >
                          <img src={rec.afterPhoto} alt="After" className="w-5 h-5 rounded object-cover border" />
                          <span>View After Photo</span>
                        </button>
                      ) : null}

                      {rec.cap?.evidence ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto({ url: rec.cap.evidence, label: `CAP Evidence: ${rec.complaintId}` })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 hover:bg-purple-100 cursor-pointer transition-colors font-medium border border-purple-200 dark:border-purple-800"
                        >
                          <img src={rec.cap.evidence} alt="CAP Evidence" className="w-5 h-5 rounded object-cover border" />
                          <span>View CAP Evidence</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
              <span className="text-xs text-slate-500">
                Preserved NC/CAP Records Archive • Read-Only Integrity Mode
              </span>
              <button
                onClick={() => setIsNcHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs cursor-pointer shadow-xs"
              >
                Close Archive View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 7: EVIDENCE PHOTO LIGHTBOX ================= */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="max-w-3xl w-full max-h-[90vh] flex flex-col items-center justify-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full text-white text-xs font-bold px-2">
              <span>{previewPhoto.label}</span>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-lg bg-white/20 hover:bg-white/30 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewPhoto.url}
              alt={previewPhoto.label}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
