import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  Clock,
  User,
  Camera,
  CheckCircle2,
  Building2,
  ShieldAlert,
  Calendar,
  FileText,
  AlertCircle,
  UploadCloud,
  Check,
} from 'lucide-react';
import { userService, complaintService, taskService, departmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
import { compressImage } from '../utils/imageCompressor';

// Exact and fuzzy department matching helper ensuring department isolation
const isDeptMatch = (userDept, targetDept) => {
  if (!userDept || !targetDept) return false;
  const u = userDept.trim().toLowerCase();
  const t = targetDept.trim().toLowerCase();
  if (u === t) return true;

  const uClean = u.replace(/[^a-z0-9]/g, '');
  const tClean = t.replace(/[^a-z0-9]/g, '');
  if (uClean && tClean && uClean === tClean) return true;

  if (t === 'quality' || t === 'qa' || t.includes('quality')) {
    return u.includes('quality') || u === 'qa' || u === 'cqa';
  }
  if (t === 'production' || t === 'prd' || t.includes('production')) {
    return u.includes('production') || u === 'prd';
  }
  if (t.includes('maintenance') || t === 'mnt') {
    return u.includes('maintenance') || u.includes('mnt') || u === t;
  }
  if (t.includes('store') || t === 'str') {
    return u.includes('store') || u === 'str' || u.startsWith('store');
  }
  if (t === 'ehs' || t.includes('safety')) {
    return u.includes('ehs') || u.includes('safety');
  }
  if (t === 'edp' || t === 'it') {
    return u.includes('edp') || u.includes('it');
  }
  if (t === 'hr' || t.includes('human')) {
    return u.includes('hr') || u.includes('human');
  }
  if (t.includes('compliance')) {
    return u.includes('compliance');
  }

  return u.includes(t) || t.includes(u);
};



// Risk / Severity Levels
const RISK_LEVELS = [
  { level: 'CRITICAL', label: 'Critical Risk (AQL 0.0 - Embargo / Safety)' },
  { level: 'MAJOR', label: 'Major Non-Conformance (AQL 1.5 - Functional Defect)' },
  { level: 'MINOR', label: 'Minor Non-Conformance (AQL 4.0 - Workmanship Flaw)' },
  { level: 'OBSERVATION', label: 'Audit Observation / Advisory (Process Drift)' },
];

// Quick Predefined Finding Phrases
const PREDEFINED_FINDINGS = [
  'Skipped stitches on collar seam',
  'Oil / stain contamination on front panel',
  'Needle holes / fabric cut along seam',
  'Measurement deviation exceeding tolerance',
  'Broken stitch / loose thread ends',
  'Raw edges / exposed fraying seam',
  'Button / snap attachment loose or misaligned',
];

// Helper to format Date to datetime-local input string (YYYY-MM-DDTHH:mm)
const toDatetimeLocal = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Generate fallback SVG snapshot if auditor does not upload photo
const generateDefaultAuditPhoto = (dept, prio, desc) => {
  const safeDept = (dept || 'Production').replace(/[<>&"]/g, '');
  const safePrio = (prio || 'HIGH').replace(/[<>&"]/g, '');
  const safeDesc = (desc || 'Audit Non-Conformance Finding').slice(0, 45).replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#0f172a"/>
    <rect x="20" y="20" width="560" height="360" rx="16" fill="#1e293b" stroke="#6366f1" stroke-width="2"/>
    <text x="300" y="130" fill="#ffffff" font-size="22" font-family="sans-serif" font-weight="bold" text-anchor="middle">NC DEFECT RECORD</text>
    <text x="300" y="180" fill="#a5b4fc" font-size="16" font-family="sans-serif" text-anchor="middle">Department: ${safeDept}</text>
    <text x="300" y="220" fill="#f43f5e" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">Risk: ${safePrio}</text>
    <text x="300" y="270" fill="#cbd5e1" font-size="13" font-family="sans-serif" text-anchor="middle">${safeDesc}</text>
    <text x="300" y="320" fill="#64748b" font-size="11" font-family="sans-serif" text-anchor="middle">${new Date().toLocaleString()}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const NewComplaintModal = ({ isOpen, onClose, onSuccess, prefillData = null }) => {
  const { user } = useAuth();
  const { units, activeUnitId, isCompanyAdmin } = useUnit();

  const getDefaultUnitId = () => {
    if (user?.unitId === 'UNIT-2' || activeUnitId === 'UNIT-2') return 'UNIT-2';
    return 'UNIT-1';
  };

  const [selectedUnitId, setSelectedUnitId] = useState(getDefaultUnitId);

  useEffect(() => {
    if (isOpen) {
      setSelectedUnitId(getDefaultUnitId());
    }
  }, [isOpen, activeUnitId, user]);

  const fileInputRef = useRef(null);

  // Form State - Left Column
  const [department, setDepartment] = useState('Production');
  const [priority, setPriority] = useState('HIGH');
  const [dueDate, setDueDate] = useState(() => toDatetimeLocal(Date.now() + 16 * 60 * 60 * 1000));
  const [deadlineHours, setDeadlineHours] = useState(16);

  // Form State - Right Column
  const [description, setDescription] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [capRequired, setCapRequired] = useState(true);
  const [immediateContainment, setImmediateContainment] = useState('');
  const [capDirective, setCapDirective] = useState('');

  // Location (Internal floor sync)
  const [location, setLocation] = useState('Production Floor - Sewing Section');

  // Evidence Photo
  const [beforeFile, setBeforeFile] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressing, setCompressing] = useState(false);

  // Supervisors & Employees
  const [supervisors, setSupervisors] = useState([]);
  const [liveEmployees, setLiveEmployees] = useState([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fetch live departments on mount so they are instantly available when modal opens
  useEffect(() => {
    let isMounted = true;
    const fetchAvailableDepts = async () => {
      try {
        setLoadingDepartments(true);
        const deptRes = await departmentService.getDepartments();
        if (isMounted && deptRes.data?.success && Array.isArray(deptRes.data.departments) && deptRes.data.departments.length > 0) {
          const formatted = deptRes.data.departments
            .filter((d) => d && d.name)
            .map((d) => ({
              id: d.id || d._id || d.name,
              name: d.name.trim(),
              code: d.code || '',
              defaultLocation: d.location || `${d.name.trim()} Floor Section`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setAvailableDepartments(formatted);
        }
      } catch (err) {
        console.warn('Could not prefetch departments:', err.message);
      } finally {
        if (isMounted) setLoadingDepartments(false);
      }
    };
    fetchAvailableDepts();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load available departments, supervisors & employees from database
  useEffect(() => {
    if (isOpen) {
      setError(null);
      const loadInitialData = async () => {
        setLoadingSupervisors(true);
        setLoadingDepartments(true);
        try {
          // 1. Fetch live departments from database
          let deptList = availableDepartments;
          try {
            const deptRes = await departmentService.getDepartments();
            if (deptRes.data?.success && Array.isArray(deptRes.data.departments) && deptRes.data.departments.length > 0) {
              const formatted = deptRes.data.departments
                .filter((d) => d && d.name)
                .map((d) => ({
                  id: d.id || d._id || d.name,
                  name: d.name.trim(),
                  code: d.code || '',
                  defaultLocation: d.location || `${d.name.trim()} Floor Section`,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
              deptList = formatted;
              setAvailableDepartments(formatted);
            }
          } catch (deptErr) {
            console.warn('Could not load departments from API:', deptErr.message);
          }

          // 2. Fetch supervisors / all active users
          let list = [];
          try {
            const allRes = await userService.getAllUsers();
            if (allRes.data?.success && Array.isArray(allRes.data.users)) {
              list = allRes.data.users.filter((u) => u.isActive !== false);
            }
          } catch (e) {
            console.warn('userService.getAllUsers failed, trying getLineSupervisors:', e.message);
          }
          if (list.length === 0) {
            const res = await userService.getLineSupervisors();
            if (res.data?.success && Array.isArray(res.data.supervisors)) {
              list = res.data.supervisors;
            }
          }
          setSupervisors(list);

          // 3. Fetch live employee status
          try {
            const liveRes = await taskService.getLiveStatus();
            if (liveRes.data?.success && Array.isArray(liveRes.data.employees)) {
              setLiveEmployees(liveRes.data.employees);
            }
          } catch (e) {
            console.warn('Could not load live employee statuses:', e.message);
          }

          // Initial selected department and matching supervisor
          const targetDept = prefillData?.department || (deptList.some((d) => d.name === department) ? department : deptList[0]?.name || 'Production');
          setDepartment(targetDept);

          const matchedDeptObj = deptList.find((d) => d.name === targetDept || d.id === targetDept);
          if (matchedDeptObj?.defaultLocation) {
            setLocation(matchedDeptObj.defaultLocation);
          } else {
            setLocation(`${targetDept} - Floor Section`);
          }

          const deptMatches = list.filter((s) => isDeptMatch(s.department, targetDept));
          if (deptMatches.length > 0) {
            setAssignedToUserId(deptMatches[0]._id || deptMatches[0].id);
          } else if (list.length > 0) {
            setAssignedToUserId(list[0]._id || list[0].id);
          } else {
            setAssignedToUserId('');
          }
        } catch (err) {
          console.warn('Failed to load line supervisors:', err.message);
        } finally {
          setLoadingSupervisors(false);
          setLoadingDepartments(false);
        }
      };
      loadInitialData();
    }
  }, [isOpen]);

  // Apply prefill data if opened from an audit item
  useEffect(() => {
    if (isOpen && prefillData) {
      if (prefillData.department) {
        handleDepartmentChange(prefillData.department);
      }
      if (prefillData.description) {
        setDescription(prefillData.description);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefillData]);

  // Handle department change: updates default location and dynamically filters Responsible Person
  const handleDepartmentChange = (deptId) => {
    setDepartment(deptId);
    const targetDept = availableDepartments.find((d) => d.name === deptId || d.id === deptId);
    if (targetDept?.defaultLocation) {
      setLocation(targetDept.defaultLocation);
    } else {
      setLocation(`${deptId} - Floor Section`);
    }

    // Auto-select first matching supervisor for this department
    if (supervisors && supervisors.length > 0) {
      const match = supervisors.find((s) => isDeptMatch(s.department, deptId));
      if (match) {
        setAssignedToUserId(match._id || match.id);
      } else {
        setAssignedToUserId(supervisors[0]?._id || supervisors[0]?.id || '');
      }
    }
  };

  // Handle Quick Due Date SLA Presets
  const handlePresetDeadline = (hours) => {
    setDeadlineHours(hours);
    const target = new Date(Date.now() + hours * 60 * 60 * 1000);
    setDueDate(toDatetimeLocal(target));
  };

  // Handle photo capture / compression
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      setError(null);
      const result = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82,
      });

      setBeforeFile(result.file || file);
      setPreviewUrl(result.previewUrl);
      setPhotoBase64(result.dataUrl);
    } catch (err) {
      console.warn('Compression error fallback:', err);
      setBeforeFile(file);
      try {
        setPreviewUrl(URL.createObjectURL(file));
      } catch (e) {}
      const reader = new FileReader();
      reader.onloadend = () => setPhotoBase64(reader.result);
      reader.readAsDataURL(file);
    } finally {
      setCompressing(false);
    }
  };

  // Remove photo
  const handleRemovePhoto = () => {
    setBeforeFile(null);
    setPreviewUrl(null);
    setPhotoBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  // Filter employees strictly belonging to the currently selected department and selected unit
  const unitFilteredSupervisors = (supervisors || []).filter((s) => {
    const sUnit = s.unitId === 'UNIT-2' ? 'UNIT-2' : 'UNIT-1';
    return sUnit === selectedUnitId;
  });

  const departmentEmployees = unitFilteredSupervisors.filter((s) => isDeptMatch(s.department, department));
  const otherEmployees = unitFilteredSupervisors.filter((s) => !isDeptMatch(s.department, department));

  const effectiveAssignedId =
    assignedToUserId && unitFilteredSupervisors.some((s) => (s._id || s.id) === assignedToUserId)
      ? assignedToUserId
      : departmentEmployees[0]?._id || departmentEmployees[0]?.id || unitFilteredSupervisors[0]?._id || unitFilteredSupervisors[0]?.id || '';

  const selectedSupervisor =
    unitFilteredSupervisors.find((s) => (s._id || s.id) === effectiveAssignedId) ||
    departmentEmployees[0] ||
    unitFilteredSupervisors[0] ||
    null;

  // Form Submission
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    // Validation
    if (!department) {
      setError('Department is required. Please select a department.');
      return;
    }

    if (!description.trim()) {
      setError('Findings description is required. Please describe the observed issue.');
      return;
    }

    const assignedId = effectiveAssignedId || assignedToUserId || selectedSupervisor?._id || selectedSupervisor?.id || '';

    try {
      setSubmitting(true);
      const formData = new FormData();

      // Associate NC with selected Unit
      const matchedUnit = units.find((u) => u.unitId === selectedUnitId);
      const finalUnitId = selectedUnitId || 'UNIT-1';
      const finalUnitName = matchedUnit?.name || (finalUnitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1');
      formData.append('unitId', finalUnitId);
      formData.append('unitName', finalUnitName);

      formData.append('department', department);
      formData.append('category', 'Stitching Fault');
      formData.append('location', location.trim() || `${department} Floor`);
      formData.append('priority', priority || 'HIGH');
      formData.append('riskSeverity', priority || 'HIGH');
      formData.append('description', description.trim());
      formData.append('findingDescription', description.trim());
      formData.append('isDraft', 'false');
      formData.append('capRequired', capRequired ? 'true' : 'false');

      if (capRequired) {
        formData.append('immediateCorrection', immediateContainment.trim());
        formData.append('correctiveAction', capDirective.trim());
      }

      formData.append('assignedToUserId', assignedId);
      formData.append('assignedToId', assignedId);
      formData.append('deadlineHours', deadlineHours.toString());

      if (dueDate) {
        try {
          const parsed = new Date(dueDate);
          if (!isNaN(parsed.getTime())) {
            formData.append('dueDate', parsed.toISOString());
          }
        } catch (dErr) {
          console.warn('Invalid dueDate format:', dueDate, dErr);
        }
      }

      // Attach photo evidence strictly encoded as Base64 Data URL or fallback SVG
      let effectiveBase64 = photoBase64;
      if (!effectiveBase64 && beforeFile) {
        try {
          effectiveBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(beforeFile);
          });
        } catch (e) {}
      }

      if (!effectiveBase64) {
        effectiveBase64 = generateDefaultAuditPhoto(department, priority, description);
      }

      if (effectiveBase64) {
        formData.append('beforePhotoBase64', effectiveBase64);
        formData.append('beforePhoto', effectiveBase64);
      }
      if (beforeFile) {
        formData.append('beforePhotoFile', beforeFile);
      }

      const res = await complaintService.createComplaint(formData);
      if (res.data?.success) {
        onSuccess(res.data.complaint);
        onClose();
      } else {
        setError(res.data?.message || res.data?.error || 'Failed to create NC defect.');
      }
    } catch (err) {
      console.error('Error creating NC:', err);
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        (typeof err.response?.data === 'string' && !err.response.data.includes('<!DOCTYPE') ? err.response.data : null) ||
        err.message;
      setError(serverMsg || 'Failed to submit NC. Please verify required fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col transition-colors">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Log NC / Create Non-Conformance
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Single-page auditor defect entry and corrective action assignment
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SINGLE-PAGE FORM BODY */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs sm:text-sm">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-center gap-2 text-xs font-medium animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* TWO-COLUMN GRID (STACKS ON MOBILE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            
            {/* ================= LEFT COLUMN ================= */}
            <div className="space-y-4">

              {/* 0. FACTORY PLANT UNIT SELECTION */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-900 dark:text-white text-xs">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      <span>Factory Plant Unit <strong className="text-rose-500">*</strong></span>
                    </span>
                  </label>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300">
                    {isCompanyAdmin ? 'Admin Configurable' : 'Assigned Unit'}
                  </span>
                </div>

                {isCompanyAdmin ? (
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value);
                      setAssignedToUserId('');
                    }}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {units.filter((u) => u.unitId === 'UNIT-1' || u.unitId === 'UNIT-2').map((u) => (
                      <option key={u.unitId} value={u.unitId}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>{units.find((u) => u.unitId === selectedUnitId)?.name || (selectedUnitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1')}</span>
                    <span className="text-[10px] text-slate-400 font-mono">🔒 Locked to your assigned unit</span>
                  </div>
                )}
              </div>
              
              {/* 1. DEPARTMENT DROPDOWN */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block font-bold text-slate-900 dark:text-white text-xs">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                    <span>Department <strong className="text-rose-500">*</strong></span>
                  </span>
                </label>
                <select
                  value={department}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {availableDepartments.length === 0 ? (
                    <option value="">{loadingDepartments ? 'Loading departments...' : 'No departments available'}</option>
                  ) : (
                    availableDepartments.map((d) => (
                      <option key={d.id || d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))
                  )}
                </select>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-0.5">
                  <span>Selected zone: <strong className="text-indigo-600 dark:text-cyan-400">{department}</strong></span>
                  <span className="font-mono text-slate-400">{location}</span>
                </div>
              </div>

              {/* 2. RISK / SEVERITY DROPDOWN */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block font-bold text-slate-900 dark:text-white text-xs">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Risk / Severity Level <strong className="text-rose-500">*</strong></span>
                  </span>
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r.level} value={r.level}>
                      {r.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2 pt-0.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    priority === 'CRITICAL'
                      ? 'bg-rose-600 text-white'
                      : priority === 'MAJOR'
                      ? 'bg-amber-600 text-white'
                      : priority === 'MINOR'
                      ? 'bg-blue-600 text-white'
                      : 'bg-purple-600 text-white'
                  }`}>
                    {priority}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {priority === 'CRITICAL' ? 'Zero tolerance defect (AQL 0.0)' : priority === 'MAJOR' ? 'Major flaw impacting garment' : 'Standard audit observation'}
                  </span>
                </div>
              </div>

              {/* 3. DUE DATE PICKER */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-900 dark:text-white text-xs">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      <span>Rectification Due Date & Time <strong className="text-rose-500">*</strong></span>
                    </span>
                  </label>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                    {deadlineHours}h Target
                  </span>
                </div>

                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (e.target.value) {
                      const diff = Math.max(1, Math.round((new Date(e.target.value).getTime() - Date.now()) / (1000 * 60 * 60)));
                      setDeadlineHours(diff);
                    }
                  }}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500"
                />

                {/* Quick SLA Duration Buttons */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Quick SLA:</span>
                  {[
                    { h: 12, label: '12h' },
                    { h: 16, label: '16h (Shift)' },
                    { h: 24, label: '24h (Standard)' },
                    { h: 48, label: '48h (Rework)' },
                  ].map((preset) => (
                    <button
                      key={preset.h}
                      type="button"
                      onClick={() => handlePresetDeadline(preset.h)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        deadlineHours === preset.h
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-amber-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PHOTO EVIDENCE ATTACHMENT */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-900 dark:text-white text-xs">
                    <span className="flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      <span>Photo Evidence</span>
                    </span>
                  </label>
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-emerald-300 dark:border-emerald-600 bg-slate-900 h-28 flex items-center justify-center">
                    <img src={previewUrl} alt="Defect Snapshot" className="h-full w-full object-cover" />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-600 text-white">
                      Photo Attached
                    </span>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <UploadCloud className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {compressing ? 'Compressing photo...' : 'Click or tap to attach defect photo'}
                    </span>
                  </div>
                )}
              </div>

            </div>

            {/* ================= RIGHT COLUMN ================= */}
            <div className="space-y-4">
              
              {/* 1. FINDINGS TEXTAREA */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block font-bold text-slate-900 dark:text-white text-xs">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                    <span>Findings / Observation <strong className="text-rose-500">*</strong></span>
                  </span>
                </label>

                <textarea
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the identified defect finding and non-conformance observation..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-sans"
                />

                {/* Quick Predefined Observation Tags */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Insert:</span>
                  {PREDEFINED_FINDINGS.slice(0, 4).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDescription((prev) => (prev ? `${prev}. ${f}` : f))}
                      className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer"
                    >
                      + {f.slice(0, 22)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. RESPONSIBLE PERSON (FILTERED STRICTLY BY SELECTED DEPARTMENT) */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-900 dark:text-white text-xs">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      <span>Responsible Person <strong className="text-rose-500">*</strong></span>
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    Dept: <strong className="text-slate-700 dark:text-slate-300">{department}</strong>
                  </span>
                </div>

                <select
                  value={effectiveAssignedId}
                  onChange={(e) => setAssignedToUserId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {departmentEmployees.length > 0 && (
                    <optgroup label={`⭐ ${department} Personnel (${departmentEmployees.length})`}>
                      {departmentEmployees.map((emp) => {
                        const empId = (emp.employeeId || '').toUpperCase();
                        const sId = String(emp._id || emp.id || '');
                        const live = liveEmployees.find(
                          (e) => (e.employeeId && e.employeeId.toUpperCase() === empId) || (e.userId && String(e.userId) === sId)
                        );
                        const isBusy = live?.status === 'In Progress / Busy';

                        return (
                          <option key={emp._id || emp.id} value={emp._id || emp.id}>
                            {emp.name} ({emp.employeeId || 'ID'}) — {emp.designation || emp.role || 'Supervisor'} {isBusy ? '🔴 (Busy)' : '🟢 (Available)'}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}

                  {otherEmployees.length > 0 && (
                    <optgroup label={departmentEmployees.length > 0 ? "Other Line Supervisors & Personnel" : "All Available Factory Personnel"}>
                      {otherEmployees.map((emp) => {
                        const empId = (emp.employeeId || '').toUpperCase();
                        const sId = String(emp._id || emp.id || '');
                        const live = liveEmployees.find(
                          (e) => (e.employeeId && e.employeeId.toUpperCase() === empId) || (e.userId && String(e.userId) === sId)
                        );
                        const isBusy = live?.status === 'In Progress / Busy';

                        return (
                          <option key={emp._id || emp.id} value={emp._id || emp.id}>
                            {emp.name} ({emp.department || 'General'}) — {emp.designation || emp.role || 'Supervisor'} {isBusy ? '🔴 (Busy)' : '🟢 (Available)'}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}

                  {supervisors.length === 0 && (
                    <option value="">{loadingSupervisors ? 'Loading factory personnel...' : 'No personnel found'}</option>
                  )}
                </select>

                {/* Selected Assignee Card Badge */}
                {selectedSupervisor && (
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {selectedSupervisor.name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-xs">
                          {selectedSupervisor.name}{' '}
                          <span className="font-mono text-[10px] text-indigo-600 dark:text-cyan-400">
                            ({selectedSupervisor.employeeId})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {selectedSupervisor.designation || 'In-Charge'} • {selectedSupervisor.department}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Line In-Charge
                    </span>
                  </div>
                )}
              </div>

              {/* 3. CAP (CORRECTIVE & PREVENTIVE ACTION) */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                    <span>CAP (Corrective & Preventive Action)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={capRequired}
                      onChange={(e) => setCapRequired(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span>CAP Mandatory</span>
                  </label>
                </div>

                {capRequired ? (
                  <div className="space-y-2.5 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        1. Immediate Containment Action
                      </label>
                      <input
                        type="text"
                        value={immediateContainment}
                        onChange={(e) => setImmediateContainment(e.target.value)}
                        placeholder="e.g. Quarantine defective bundle / halt operation"
                        className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        2. Corrective &amp; Preventive Action Directive
                      </label>
                      <input
                        type="text"
                        value={capDirective}
                        onChange={(e) => setCapDirective(e.target.value)}
                        placeholder="e.g. Conduct recalibration and weekly line inspection"
                        className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[10px] text-slate-400 mr-1 self-center">Presets:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImmediateContainment('Quarantine defective bundle and re-stitch seam.');
                          setCapDirective('Recalibrate looper clearance and train operator on seam tension.');
                        }}
                        className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Sewing / Stitches
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImmediateContainment('Spot clean cuffs and wipe needle bar.');
                          setCapDirective('Replace oil felt seal and add to weekly preventive maintenance.');
                        }}
                        className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Oil / Stain
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Direct floor rework only. Formal root cause analysis not required.</span>
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* MODAL FOOTER BUTTONS */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Creating NC...' : 'Create NC'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default NewComplaintModal;
