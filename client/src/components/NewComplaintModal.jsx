import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Clock,
  AlertTriangle,
  User,
  MapPin,
  CheckCircle2,
  Phone,
  Building2,
  Check,
  Search,
  Users,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Layers,
  Sparkles,
  Calendar,
  ListChecks,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import { userService, complaintService } from '../services/api';
import { compressImage, formatFileSize } from '../utils/imageCompressor';

// Backward compatibility export
export const DUMMY_SUPERVISORS = [];

// 7 Specific Industrial Factory Departments & Roles
const AUDIT_DEPARTMENTS = [
  {
    id: 'Production',
    name: 'Production',
    group: 'Manufacturing',
    code: 'PRD',
    desc: 'Sewing, Stitching Lines, Cutting, Finishing & Assembly Operations',
    focus: 'Stitching defects, needle deflection, line balance & workmanship',
    defaultLocation: 'Production Floor - Sewing Section',
  },
  {
    id: 'Quality',
    name: 'Quality',
    group: 'QA / QC & AQL',
    code: 'QA',
    desc: 'Quality Assurance, In-Line QC, End-Line & Pre-Shipment AQL Audits',
    focus: 'AQL 1.5 standards, measurement tolerance & visual inspection',
    defaultLocation: 'QA Inspection Table - AQL Room',
  },
  {
    id: 'Maintenance',
    name: 'Maintenance',
    group: 'Engineering',
    code: 'MNT',
    desc: 'Sewing Machines, Looper Calibration, Motors, Compressors & Electrical',
    focus: 'Needle bar oil leaks, mechanical timing, pneumatic pressure & wiring',
    defaultLocation: 'Maintenance Workshop & Line Machinery',
  },
  {
    id: 'Store',
    name: 'Store',
    group: 'Materials & Inventory',
    code: 'STR',
    desc: 'Raw Material Store, Fabric Rolls (4-Point), Trims, Zippers & Thread Store',
    focus: 'Fabric roll shading, yarn flaws, inventory storage & trim defects',
    defaultLocation: 'Fabric & Raw Materials Store Bay',
  },
  {
    id: 'EHS',
    name: 'EHS',
    group: 'Environment & Safety',
    code: 'EHS',
    desc: 'Environment, Health & Safety, PPE Protocols, Fire Safety & Chemical Handling',
    focus: 'Eye shields, needle guards, aisle clear paths, MSDS & chemical safety',
    defaultLocation: 'EHS Station & Chemical Storage Area',
  },
  {
    id: 'EDP',
    name: 'EDP',
    group: 'IT & Data Processing',
    code: 'EDP',
    desc: 'Electronic Data Processing, ERP Terminals, Barcode Printers & Network',
    focus: 'Barcode scannability, ERP sync, RFID readers & line tablets',
    defaultLocation: 'EDP Server Room & Line Data Terminals',
  },
  {
    id: 'HR',
    name: 'HR',
    group: 'Human Resources',
    code: 'HR',
    desc: 'Human Resources, Labor Compliance, Operator Training & Working Hours',
    focus: 'Operator skill matrices, attendance compliance & social audit standards',
    defaultLocation: 'HR Department & Training Center',
  },
];

// Standard garment quality audit requirements & clauses
const AUDIT_REQUIREMENTS = [
  {
    id: 'AQL 1.5 Workmanship Standard',
    title: 'AQL 1.5 Workmanship Standard',
    standard: 'AQL Level II (Major 1.5 / Minor 4.0)',
    desc: 'Garment appearance, sewing tolerance, and buyer visual acceptance threshold.',
  },
  {
    id: 'ISO 9001:2015 Clause 8.5',
    title: 'ISO 9001:2015 Clause 8.5',
    standard: 'Production & Service Provision',
    desc: 'Controlled conditions, validation of stitching processes, and traceability.',
  },
  {
    id: 'ISO 9001:2015 Clause 8.7',
    title: 'ISO 9001:2015 Clause 8.7',
    standard: 'Control of Nonconforming Outputs',
    desc: 'Identification, segregation, and disposition of non-conforming garment units.',
  },
  {
    id: 'Buyer Technical Audit Standard',
    title: 'Buyer Technical Audit Standard',
    standard: 'Brand SOP & Tech Pack Tolerance',
    desc: 'Measurement chart variance, seam allowance, and technical construction rules.',
  },
  {
    id: 'Needle Policy & Metal Detection Procedure',
    title: 'Needle Policy & Metal Detection',
    standard: 'Safety & Metal Contamination Free',
    desc: '9-point calibration, daily log, and broken needle retrieval record.',
  },
  {
    id: 'Seam Strength & SPI Standard',
    title: 'Seam Strength & SPI Standard',
    standard: 'Stitches Per Inch & Seam Elasticity',
    desc: 'Minimum 10–12 SPI compliance and cross-seam burst strength testing.',
  },
  {
    id: 'Fabric 4-Point System Standard',
    title: 'Fabric 4-Point System Standard',
    standard: 'ASTM D5430 Visual Flaw Scoring',
    desc: 'Yarn flaws, holes, barre, and color shading within 4-point penalty limit.',
  },
  {
    id: 'Safety & Factory Floor Compliance',
    title: 'Safety & Factory Floor Compliance',
    standard: 'PPE, Eye Shield & Needle Guards',
    desc: 'Machine safety guards, eye protection, clean floor aisles, and ergonomics.',
  },
  {
    id: 'None of Other',
    title: 'None of Other',
    standard: 'Other / Custom Standard',
    desc: 'Standard or clause not listed above. Manually specify custom requirement.',
  },
  {
    id: 'Custom Audit Requirement',
    title: 'Custom Audit Requirement',
    standard: 'Specific Contract or Buyer SOP',
    desc: 'Custom audit clause specified manually by the internal auditor.',
  },
];

// Predefined Defect Findings for Describe Finding selection
const PREDEFINED_FINDINGS = [
  'Skipped stitches on collar seam',
  'Lubricant drip stain on cuff',
  'SPI below Tech Pack spec',
  'Mismatched plaid grain line',
  'Seam puckering along hemline',
  'Needle holes / fabric cut along seam',
  'Color shading between front and back panels',
  'Measurement deviation exceeding tolerance',
  'Broken stitch / loose thread ends',
  'Raw edges / exposed fraying seam',
  'Button / snap attachment loose or misaligned',
  'None of Others',
];

// Defect Categories
const DEFECT_CATEGORIES = [
  'Stitching Fault',
  'Fabric Flaw',
  'Measurement / Dimension',
  'Oil & Soil Contamination',
  'Finishing & Pressing',
  'Label & Trim Error',
  'Cutting Defect',
  'Packaging & Carton',
];

// Risk / Severity Levels
const RISK_LEVELS = [
  {
    level: 'CRITICAL',
    label: 'Critical Risk (AQL 0.0)',
    badgeColor: 'bg-rose-600 text-white',
    borderColor: 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30',
    description: 'Zero tolerance defect. Poses consumer injury (metal fragment/needle), mold, or immediate buyer shipment embargo.',
  },
  {
    level: 'MAJOR',
    label: 'Major Non-Conformance (AQL 1.5)',
    badgeColor: 'bg-amber-600 text-white',
    borderColor: 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30',
    description: 'Obvious functional failure, measurement out of tolerance, or noticeable flaw impacting garment wearability or sales.',
  },
  {
    level: 'MINOR',
    label: 'Minor Non-Conformance (AQL 4.0)',
    badgeColor: 'bg-blue-600 text-white',
    borderColor: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30',
    description: 'Slight aesthetic imperfection or loose thread not impairing garment performance, durability, or marketability.',
  },
  {
    level: 'OBSERVATION',
    label: 'Audit Observation / Advisory',
    badgeColor: 'bg-purple-600 text-white',
    borderColor: 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30',
    description: 'Process drift, machine parameter drift, or potential risk noted during audit that could lead to non-conformance.',
  },
];

// Auditor Verification Methods
const VERIFICATION_METHODS = [
  {
    id: 'Physical Floor Re-inspection',
    title: 'Physical Floor Re-inspection',
    desc: 'Auditor conducts on-site 100% floor audit at the designated workstation.',
  },
  {
    id: 'High-Res Photo & Video Proof Review',
    title: 'High-Res Photo & Video Proof Review',
    desc: 'Digital verification of supervisor after-rectification photos and machine settings.',
  },
  {
    id: 'Statistical AQL 1.5 Re-sampling',
    title: 'Statistical AQL 1.5 Re-sampling',
    desc: 'Auditor randomly pulls a fresh sample batch (50–125 pcs) from finished output.',
  },
  {
    id: 'Seam Tension & Dimension Gauge Check',
    title: 'Seam Tension & Dimension Gauge Check',
    desc: 'Caliper, SPI glass, and tensile gauge physical verification of rectifications.',
  },
];



// Workflow Stage Definitions matching the requested flow
const WORKFLOW_STEPS = [
  { id: 1, label: 'Department', short: 'Dept' },
  { id: 2, label: 'Requirement', short: 'Standard' },
  { id: 3, label: 'Describe Finding', short: 'Finding' },
  { id: 4, label: 'Risk / Severity', short: 'Severity' },
  { id: 5, label: 'Responsible Person', short: 'Assignee' },
  { id: 6, label: 'Set Due Date', short: 'Due Date' },
  { id: 7, label: 'CAP Required', short: 'CAPA' },
  { id: 8, label: 'Evidence', short: 'Proof' },
  { id: 9, label: 'Verification', short: 'Verify' },
  { id: 10, label: 'Close NC Protocol', short: 'Issue NC' },
];

export const NewComplaintModal = ({ isOpen, onClose, onSuccess, prefillData = null }) => {
  const fileInputRef = useRef(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [viewMode, setViewMode] = useState('wizard'); // 'wizard' (step-by-step) or 'all' (complete audit sheet)

  // Supervisors from server
  const [supervisors, setSupervisors] = useState([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form State corresponding to the 10 workflow stages
  // Stage 1: Select Department & Location
  const [department, setDepartment] = useState('Production');
  const [location, setLocation] = useState('Production Floor - Sewing Section');

  // Stage 2: Select Requirement
  const [requirement, setRequirement] = useState('AQL 1.5 Workmanship Standard');
  const [customRequirement, setCustomRequirement] = useState('');
  const [isManualRequirement, setIsManualRequirement] = useState(false);

  // Stage 3: Describe Finding & Category
  const [category, setCategory] = useState('Stitching Fault');
  const [description, setDescription] = useState('');
  const [selectedFinding, setSelectedFinding] = useState('');
  const [isManualFinding, setIsManualFinding] = useState(false);

  // Stage 4: Risk / Severity
  const [priority, setPriority] = useState('HIGH');

  // Stage 5: Assign Responsible Person
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [filterDeptOnly, setFilterDeptOnly] = useState(false);

  // Stage 6: Set Due Date & SLA
  const [deadlineHours, setDeadlineHours] = useState(16);
  const [customDueDate, setCustomDueDate] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);

  // Stage 7: CAP Required
  const [capRequired, setCapRequired] = useState(true);
  const [immediateContainment, setImmediateContainment] = useState('');
  const [capDirective, setCapDirective] = useState('');

  // Stage 8: Evidence Photo
  const [beforeFile, setBeforeFile] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);
  const [compressing, setCompressing] = useState(false);

  // Stage 9: Verification Method
  const [verificationMethod, setVerificationMethod] = useState('Physical Floor Re-inspection');
  const [verificationCriteria, setVerificationCriteria] = useState(
    'Line supervisor must present 20 consecutive defect-free garments with verified tension balance.'
  );

  // Load supervisors on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setError(null);
      const loadSupervisors = async () => {
        setLoadingSupervisors(true);
        try {
          const res = await userService.getLineSupervisors();
          if (res.data?.success && Array.isArray(res.data.supervisors)) {
            const list = res.data.supervisors;
            setSupervisors(list);
            if (list.length > 0) {
              setAssignedToUserId((prev) => {
                const found = list.some((s) => (s._id || s.id) === prev);
                return found ? prev : list[0]._id || list[0].id;
              });
            }
          }
        } catch (err) {
          console.warn('Failed to load line supervisors:', err.message);
        } finally {
          setLoadingSupervisors(false);
        }
      };
      loadSupervisors();
    }
  }, [isOpen]);

  // Apply prefill data from audit checklist (department, requirement, description)
  useEffect(() => {
    if (isOpen && prefillData) {
      if (prefillData.department) {
        handleDepartmentChange(prefillData.department);
      }
      if (prefillData.requirement) {
        const reqVal = prefillData.requirement;
        setRequirement(reqVal);
        if (!AUDIT_REQUIREMENTS.some((r) => r.id === reqVal)) {
          setCustomRequirement(reqVal);
          setIsManualRequirement(true);
        }
      }
      if (prefillData.description) {
        setDescription(prefillData.description);
        if (PREDEFINED_FINDINGS.includes(prefillData.description)) {
          setSelectedFinding(prefillData.description);
        } else {
          setSelectedFinding('None of Others');
          setIsManualFinding(true);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefillData]);

  // When department changes, sync location suggestion & auto-suggest matching supervisor
  const handleDepartmentChange = (deptId) => {
    setDepartment(deptId);
    const targetDept = AUDIT_DEPARTMENTS.find((d) => d.id === deptId);
    if (targetDept?.defaultLocation) {
      setLocation(targetDept.defaultLocation);
    } else {
      setLocation(`${deptId} - Section Area`);
    }

    // Auto-match supervisor for this department if available
    if (supervisors && supervisors.length > 0) {
      const match = supervisors.find((s) => (s.department || '').toLowerCase().includes(deptId.toLowerCase()));
      if (match) {
        setAssignedToUserId(match._id || match.id);
      }
    }
  };

  // Quick photo capture with client-side canvas WebP compression
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
      setImageMeta({
        originalSize: result.originalSize || file.size,
        compressedSize: result.compressedSize || file.size,
      });
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



  if (!isOpen) return null;

  // Selected supervisor lookup
  const effectiveAssignedId = assignedToUserId || supervisors[0]?._id || supervisors[0]?.id || '';
  const selectedSupervisor = supervisors.find((s) => (s._id || s.id) === effectiveAssignedId) || supervisors[0] || null;

  // Filter supervisors for contact directory
  const filteredSupervisors = supervisors.filter((s) => {
    if (filterDeptOnly && department) {
      const d = (s.department || '').toLowerCase();
      if (!d.includes(department.toLowerCase().split(' ')[0])) {
        return false;
      }
    }
    if (!contactSearch.trim()) return true;
    const term = contactSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(term) ||
      s.employeeId?.toLowerCase().includes(term) ||
      s.department?.toLowerCase().includes(term) ||
      s.designation?.toLowerCase().includes(term) ||
      s.mobileNumber?.toLowerCase().includes(term)
    );
  });

  // Calculate SLA due date timestamp
  const targetTime = useCustomDate && customDueDate
    ? new Date(customDueDate)
    : new Date(Date.now() + deadlineHours * 60 * 60 * 1000);

  const formattedTargetDeadline = targetTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Step validation before advancing in wizard mode
  const validateStep = (step) => {
    setError(null);
    if (step === 1 && !department) {
      setError('Please select a department.');
      return false;
    }
    if (step === 2 && requirement === 'Custom Audit Requirement' && !customRequirement.trim()) {
      setError('Please enter your custom audit requirement standard.');
      return false;
    }
    if (step === 3 && !description.trim()) {
      setError('Please provide a description of the defect finding.');
      return false;
    }
    if (step === 8 && !previewUrl && !beforeFile) {
      setError('Mandatory Before Photo proof is required to document this audit defect.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(10, prev + 1));
    }
  };

  const handlePrev = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // Submit NC Defect to Backend (supports Draft or Open)
  const handleSubmit = async (eOrDraft, maybeDraft) => {
    let isDraft = false;
    if (typeof eOrDraft === 'boolean') {
      isDraft = eOrDraft;
    } else if (typeof maybeDraft === 'boolean') {
      isDraft = maybeDraft;
    }
    if (eOrDraft && typeof eOrDraft.preventDefault === 'function') {
      eOrDraft.preventDefault();
    }
    setError(null);

    // Final checks
    if (!previewUrl && !beforeFile) {
      setCurrentStep(8);
      setError('Mandatory Before Photo proof is required to document this audit defect.');
      return;
    }

    if (!description.trim()) {
      setCurrentStep(3);
      setError('Please provide a description of the defect finding.');
      return;
    }

    const effectiveReq = (requirement === 'Custom Audit Requirement' || requirement === 'None of Other' || isManualRequirement)
      ? (customRequirement.trim() || requirement)
      : requirement;

    const assignedId = assignedToUserId || selectedSupervisor?._id || selectedSupervisor?.id;

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('category', category || 'Stitching Fault');
      formData.append('department', department || 'Production');
      formData.append('location', location.trim() || `${department} - Production Floor`);
      formData.append('priority', priority || 'HIGH');
      formData.append('riskSeverity', priority || 'HIGH');
      formData.append('description', description.trim());
      formData.append('findingDescription', description.trim());
      formData.append('requirement', effectiveReq);
      formData.append('isDraft', isDraft ? 'true' : 'false');
      formData.append('capRequired', capRequired ? 'true' : 'false');
      if (capRequired) {
        formData.append('immediateCorrection', immediateContainment.trim());
        formData.append('correctiveAction', capDirective.trim());
      }
      formData.append('verificationMethod', verificationMethod);
      formData.append('verificationCriteria', verificationCriteria);
      formData.append('assignedToUserId', assignedId);
      formData.append('assignedToId', assignedId);
      formData.append('deadlineHours', deadlineHours.toString());
      if (useCustomDate && customDueDate) {
        formData.append('dueDate', new Date(customDueDate).toISOString());
      }

      if (photoBase64) {
        formData.append('beforePhotoBase64', photoBase64);
      } else if (previewUrl && previewUrl.startsWith('data:')) {
        formData.append('beforePhotoBase64', previewUrl);
      } else if (beforeFile) {
        formData.append('beforePhoto', beforeFile);
      }

      const res = await complaintService.createComplaint(formData);
      if (res.data.success) {
        onSuccess(res.data.complaint);
        onClose();
      }
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || 'Failed to submit NC Defect. Please check required fields.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col transition-colors">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Create NC (Non-Conformance Defect)
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  Auditor Flow
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                10-Stage Closed-Loop Garment Audit Rectification Workflow
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle view mode between step wizard and full audit sheet */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'wizard' ? 'all' : 'wizard')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Switch between Guided Step Wizard and All-in-One Audit Sheet"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
              <span>{viewMode === 'wizard' ? 'Full Audit Sheet' : 'Step Wizard'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKFLOW STEPPER BAR (Horizontal Scrollable Tabs showing the user-requested flow) */}
        <div className="bg-slate-100/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1 min-w-max">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = currentStep === step.id;
              const isPast = currentStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (validateStep(currentStep) || step.id < currentStep) {
                        setCurrentStep(step.id);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isPast
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : isPast
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isPast ? <Check className="w-2.5 h-2.5" /> : step.id}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                    <span className="md:hidden">{step.short}</span>
                  </button>
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-700 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* MODAL BODY */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 text-xs sm:text-sm">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-center gap-2 text-xs font-medium animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* ---------------- STAGE 1: SELECT DEPARTMENT ---------------- */}
          {(viewMode === 'all' || currentStep === 1) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                      Select Department
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Production zone or processing section where non-conformance was identified.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {department}
                </span>
              </div>

              {/* Department Cards Grid - 7 Factory Departments */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-2">
                {AUDIT_DEPARTMENTS.map((dept) => {
                  const isSelected = department === dept.id;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => handleDepartmentChange(dept.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/70 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/25 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {dept.code}
                        </span>
                        {isSelected ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-cyan-400">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            {dept.group}
                          </span>
                        )}
                      </div>
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white">{dept.name}</div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-snug">
                        {dept.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Workstation / Specific Machine Location */}
              <div className="pt-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Specific Machine / Workstation Location
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Sewing Line 1 - Machine #14 (Collar Seam) or Table 3"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </section>
          )}

          {/* ---------------- STAGE 2: SELECT REQUIREMENT ---------------- */}
          {(viewMode === 'all' || currentStep === 2) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                      Select Requirement
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Standard quality clause, buyer SOP, or ISO compliance requirement breached.
                    </p>
                  </div>
                </div>
              </div>

              {/* Requirement Dropdown / Select List */}
              <div className="pt-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                  Requirement Standard (Select from dropdown or choose "None of Other" / Manual Entry)
                </label>
                <select
                  value={requirement}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRequirement(val);
                    if (val === 'None of Other' || val === 'Custom Audit Requirement') {
                      setIsManualRequirement(true);
                    } else {
                      setIsManualRequirement(false);
                    }
                  }}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  {AUDIT_REQUIREMENTS.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.title} {req.standard ? `— ${req.standard}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {AUDIT_REQUIREMENTS.map((req) => {
                  const isSelected = requirement === req.id;
                  return (
                    <div
                      key={req.id}
                      onClick={() => {
                        setRequirement(req.id);
                        if (req.id === 'None of Other' || req.id === 'Custom Audit Requirement') {
                          setIsManualRequirement(true);
                        } else {
                          setIsManualRequirement(false);
                        }
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/70 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-cyan-400">
                            {req.standard}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />}
                        </div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">
                          {req.title}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {req.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Manual Entry field when None of Other, Custom Audit Requirement, or custom value */}
              {(requirement === 'None of Other' || requirement === 'Custom Audit Requirement' || isManualRequirement) ? (
                <div className="pt-2 animate-fadeIn">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs">
                      {requirement === 'None of Other'
                        ? 'Specify Custom Requirement Standard / Clause (Manual Entry)'
                        : 'Custom Audit Standard / Contract Clause Details'}
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      Manual Input Enabled
                    </span>
                  </div>
                  <input
                    type="text"
                    value={customRequirement}
                    onChange={(e) => setCustomRequirement(e.target.value)}
                    placeholder="e.g. Buyer Specific Tolerance Manual Rev 4.2 - Seam Integrity Sec 3 or None of Other"
                    className="w-full p-2.5 text-xs rounded-xl border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {requirement === 'None of Other'
                      ? 'Type custom standard above to save in database, or leave blank to save as "None of Other".'
                      : 'Enter the custom clause/standard to be saved in the database.'}
                  </p>
                </div>
              ) : (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRequirement('None of Other');
                      setIsManualRequirement(true);
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    + Option not listed? Select "None of Other" to enter custom requirement manually
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ---------------- STAGE 3: DESCRIBE FINDING ---------------- */}
          {(viewMode === 'all' || currentStep === 3) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Describe Finding
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Defect category and objective description of observed non-conformance.
                  </p>
                </div>
              </div>

              {/* Defect Category Pills */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                  Defect Category / Classification
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFECT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        category === cat
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Predefined Finding Dropdown / Select List */}
              <div className="pt-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1.5">
                  Finding Observation (Select Option or Choose "None of Others" for Manual Entry)
                </label>
                <select
                  value={selectedFinding}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedFinding(val);
                    if (val === 'None of Others') {
                      setIsManualFinding(true);
                      if (!description.trim() || PREDEFINED_FINDINGS.includes(description)) {
                        setDescription('None of Others');
                      }
                    } else if (val) {
                      setIsManualFinding(false);
                      setDescription(val);
                    }
                  }}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Select from predefined findings list --</option>
                  {PREDEFINED_FINDINGS.map((finding) => (
                    <option key={finding} value={finding}>
                      {finding}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFinding === 'None of Others' && (
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs">
                  <div className="font-bold text-indigo-900 dark:text-indigo-200">
                    Option: None of Others Selected
                  </div>
                  <div className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                    Option not available in the predefined list. You can manually enter or edit your finding observation below.
                  </div>
                </div>
              )}

              {/* Text Description / Manual Entry Area */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                    Objective Audit Finding Details & Rectification Directives {selectedFinding === 'None of Others' ? '(Manual Entry)' : ''}
                  </label>
                  <span className="text-[10px] text-slate-400">Mandatory audit observation</span>
                </div>
                <textarea
                  rows="3"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (!PREDEFINED_FINDINGS.includes(e.target.value)) {
                      if (selectedFinding !== 'None of Others' && selectedFinding !== '') {
                        setSelectedFinding('None of Others');
                      }
                    }
                  }}
                  placeholder="e.g. Machine #14 observed with 8 skipped stitches per 10cm along the collar joint seam. Thread tension disc is clogged with lint. Immediate re-stitching and looper recalibration required."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-xs leading-relaxed font-sans"
                />

                {/* Quick Observation Preset Tags including None of Others */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
                  <span className="text-slate-400 text-[10px] font-semibold">Quick insert:</span>
                  {[
                    'Skipped stitches on collar seam',
                    'Lubricant drip stain on cuff',
                    'SPI below Tech Pack spec',
                    'Mismatched plaid grain line',
                    'None of Others',
                  ].map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => {
                        setSelectedFinding(phrase);
                        if (phrase === 'None of Others') {
                          setIsManualFinding(true);
                          if (!description.trim() || PREDEFINED_FINDINGS.includes(description)) {
                            setDescription('None of Others');
                          }
                        } else {
                          setDescription((prev) => (prev ? `${prev} ${phrase}.` : `${phrase}.`));
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md transition-colors text-[10px] ${
                        selectedFinding === phrase
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-950 hover:text-indigo-600'
                      }`}
                    >
                      + {phrase}
                    </button>
                  ))}
                </div>

                {selectedFinding !== 'None of Others' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFinding('None of Others');
                        setIsManualFinding(true);
                        if (!description.trim() || PREDEFINED_FINDINGS.includes(description)) {
                          setDescription('None of Others');
                        }
                      }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      + Option not listed? Select "None of Others" to enter custom finding manually
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ---------------- STAGE 4: RISK / SEVERITY ---------------- */}
          {(viewMode === 'all' || currentStep === 4) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  4
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Risk / Severity Level
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Determine consumer risk level, AQL threshold, and urgency of rectification.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {RISK_LEVELS.map((risk) => {
                  const isSelected = priority === risk.level;
                  return (
                    <div
                      key={risk.level}
                      onClick={() => setPriority(risk.level)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? `${risk.borderColor} ring-2 ring-indigo-500/30 shadow-xs`
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${risk.badgeColor}`}>
                          {risk.label}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {risk.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---------------- STAGE 5: ASSIGN RESPONSIBLE PERSON ---------------- */}
          {(viewMode === 'all' || currentStep === 5) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    5
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                      Assign Responsible Person
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Line supervisor or department in-charge held accountable for root cause and rectification.
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected Assignee Banner */}
              {selectedSupervisor && (
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      {selectedSupervisor.name?.charAt(0) || 'S'}
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                        <span>{selectedSupervisor.name}</span>
                        <span className="font-mono text-[10px] text-indigo-700 dark:text-indigo-300">
                          ({selectedSupervisor.employeeId})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedSupervisor.department} • {selectedSupervisor.designation} • {selectedSupervisor.mobileNumber}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Accountable In-Charge
                  </span>
                </div>
              )}

              {/* Supervisor Directory Search & List */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Search supervisor by name, employee ID, line, or mobile..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterDeptOnly(!filterDeptOnly)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                      filterDeptOnly
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {filterDeptOnly ? `Only ${department}` : 'All Lines'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {filteredSupervisors.map((s) => {
                    const isSelected = (s._id || s.id) === effectiveAssignedId;
                    return (
                      <div
                        key={s._id || s.employeeId}
                        onClick={() => setAssignedToUserId(s._id || s.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-xs ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {s.name} <span className="font-mono text-[10px] text-slate-400">({s.employeeId})</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {s.department} • {s.designation}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-400">{s.mobileNumber}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ---------------- STAGE 6: SET DUE DATE ---------------- */}
          {(viewMode === 'all' || currentStep === 6) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  6
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Set Due Date & SLA
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Resolution timeline within which supervisor must rectify defect and submit photo proof.
                  </p>
                </div>
              </div>

              {/* Due Date Indicator Banner */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-extrabold text-amber-900 dark:text-amber-200 text-xs">
                      Target Due Date: {formattedTargetDeadline}
                    </div>
                    <div className="text-[10px] text-amber-700 dark:text-amber-300">
                      Countdown clock activates immediately upon issuance. Overdue penalty triggers at expiry.
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                  {deadlineHours}h SLA
                </span>
              </div>

              {/* Quick SLA Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { hours: 12, label: '12 Hours', desc: 'Urgent Same-Day Line Fix' },
                  { hours: 16, label: '16 Hours (Standard)', desc: 'Next Shift Handoff' },
                  { hours: 24, label: '24 Hours', desc: 'Full Production Cycle' },
                  { hours: 48, label: '48 Hours', desc: 'Fabric / Trim Rework' },
                ].map((preset) => (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => {
                      setDeadlineHours(preset.hours);
                      setUseCustomDate(false);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      !useCustomDate && deadlineHours === preset.hours
                        ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/60 ring-2 ring-amber-500/20 font-bold'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{preset.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</div>
                  </button>
                ))}
              </div>

              {/* Custom Date / Time Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={useCustomDate}
                    onChange={(e) => setUseCustomDate(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Set Custom Calendar Due Date & Time</span>
                </label>

                {useCustomDate && (
                  <div className="mt-2 animate-fadeIn">
                    <input
                      type="datetime-local"
                      value={customDueDate}
                      onChange={(e) => setCustomDueDate(e.target.value)}
                      className="p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ---------------- STAGE 7: CAP REQUIRED ---------------- */}
          {(viewMode === 'all' || currentStep === 7) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  7
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    CAP (Corrective & Preventive Action) Required
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mandate whether supervisor must submit formal root cause analysis to avoid recurrence.
                  </p>
                </div>
              </div>

              {/* Two Option Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div
                  onClick={() => setCapRequired(true)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    capRequired
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                        YES — Mandatory CAP Required
                      </span>
                    </div>
                    {capRequired && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Supervisor must submit 5-Why Root Cause Analysis and preventive measures across the batch before closure is granted.
                  </p>
                </div>

                <div
                  onClick={() => setCapRequired(false)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    !capRequired
                      ? 'border-slate-800 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80 ring-2 ring-slate-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                        NO — Direct Rectification Only
                      </span>
                    </div>
                    {!capRequired && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    One-time rework or spot cleaning sufficient. Formal root cause documentation is not required for closure.
                  </p>
                </div>
              </div>

              {capRequired && (
                <div className="pt-3 space-y-3 animate-fadeIn">
                  {/* Visual CAP Tree Guide */}
                  <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-[11px] text-slate-700 dark:text-slate-300">
                    <span className="font-mono font-bold text-indigo-700 dark:text-cyan-400 block mb-0.5">
                      CAP Structure Activated (ISO 9001 Clause 10.2):
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-600 dark:text-slate-400">
                      NC ──► Immediate Correction ──► Root Cause ──► Corrective Action ──► Preventive Action ──► Responsible Person ──► Target Date ──► Evidence ──► Verification
                    </span>
                  </div>

                  {/* Immediate Correction Directive */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1 flex items-center justify-between">
                      <span>1. Immediate Correction Directive (Containment Action)</span>
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono font-semibold">Immediate Containment</span>
                    </label>
                    <input
                      type="text"
                      value={immediateContainment}
                      onChange={(e) => setImmediateContainment(e.target.value)}
                      placeholder="e.g. Remove cartons immediately / Quarantine defective bundle #14B / Stop cutting table 2"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Root Cause & Corrective Guidance */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1 flex items-center justify-between">
                      <span>2. Auditor Root Cause &amp; Preventive Action Directives</span>
                      <span className="text-[10px] text-indigo-600 dark:text-cyan-400 font-mono font-semibold">5-Why / Recurrence</span>
                    </label>
                    <input
                      type="text"
                      value={capDirective}
                      onChange={(e) => setCapDirective(e.target.value)}
                      placeholder="e.g. Revise floor storage marking, replace needle with ballpoint, adjust felt wick oiler, conduct weekly inspection."
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Quick Preset Directive Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-slate-400 self-center mr-1">Autofill:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setImmediateContainment('Remove cartons from emergency exit immediately and clear entire egress aisle.');
                        setCapDirective('Revise storage location, repaint reflective yellow floor markings, and add weekly emergency exit inspection.');
                      }}
                      className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Emergency Exit (EHS)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImmediateContainment('Quarantine defective bundle #14B and re-stitch skipped seams.');
                        setCapDirective('Switch to Groz-Beckert 75/11 Ballpoint, recalibrate looper clearance to 0.05mm, and train operator on collar seams.');
                      }}
                      className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Skipped Stitches (Production)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImmediateContainment('Spot clean soiled cuffs and wipe needle bar dry.');
                        setCapDirective('Replace felt wick oiler, replace worn rubber seal, and add weekly wick check to preventive maintenance.');
                      }}
                      className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Needle Oil Leak (Maintenance)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImmediateContainment('Segregate roll #F-4412 and halt spreading on cutting table.');
                        setCapDirective('Perform 100% 4-point inspection, group shade bands, and mandate Delta-E spectrophotometer check prior to binning.');
                      }}
                      className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Fabric Shading (Store)
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ---------------- STAGE 8: EVIDENCE ---------------- */}
          {(viewMode === 'all' || currentStep === 8) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    8
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                      Evidence (Mandatory Before Photo Proof)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      High-resolution visual evidence of non-conformance before rectification begins.
                    </p>
                  </div>
                </div>

                {imageMeta && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                    Compressed: {formatFileSize(imageMeta.compressedSize)}
                  </span>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
                id="camera-before-photo"
              />

              {previewUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-emerald-300 dark:border-emerald-600 bg-slate-900 shadow-md">
                  <img
                    src={previewUrl}
                    alt="Defect Evidence"
                    className="w-full h-56 sm:h-64 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3.5">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow">
                      Audit Evidence Captured
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-white border border-slate-300 shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      Retake Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-44 sm:h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl bg-white dark:bg-slate-900 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40 group"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/80 group-hover:scale-105 flex items-center justify-center mb-2 transition-transform border border-indigo-200 dark:border-indigo-800">
                    <Camera className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                    {compressing ? 'Compressing WebP Photo...' : 'Tap to Open Camera / Upload Evidence Photo'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    Direct Rear Camera on Mobile • Auto-Compress WebP
                  </span>
                </div>
              )}


            </section>
          )}

          {/* ---------------- STAGE 9: VERIFICATION ---------------- */}
          {(viewMode === 'all' || currentStep === 9) && (
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  9
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Auditor Verification Protocol
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Define how you (the Auditor) will inspect and verify rectification before final closure.
                  </p>
                </div>
              </div>

              {/* Verification Method Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {VERIFICATION_METHODS.map((method) => {
                  const isSelected = verificationMethod === method.id;
                  return (
                    <div
                      key={method.id}
                      onClick={() => setVerificationMethod(method.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {method.title}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {method.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Auditor Sign-off Criteria / Verification Notes */}
              <div className="pt-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
                  Auditor Verification Sign-off Criteria
                </label>
                <input
                  type="text"
                  value={verificationCriteria}
                  onChange={(e) => setVerificationCriteria(e.target.value)}
                  placeholder="e.g. Line supervisor must present 20 consecutive defect-free garments with verified tension balance."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </section>
          )}

          {/* ---------------- STAGE 10: CLOSE NC PROTOCOL ---------------- */}
          {(viewMode === 'all' || currentStep === 10) && (
            <section className="space-y-4 p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  10
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Close NC Protocol & Review Summary
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Review all 10 stages of the Non-Conformance defect ticket prior to issuing.
                  </p>
                </div>
              </div>

              {/* Comprehensive NC Summary Review Card */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-indigo-600 dark:text-cyan-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                      NC: NEW DEFECT
                    </span>
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {department}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    priority === 'CRITICAL' ? 'bg-rose-600 text-white' : priority === 'MAJOR' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
                  }`}>
                    {priority}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Requirement Standard
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {(requirement === 'Custom Audit Requirement' || requirement === 'None of Other' || isManualRequirement)
                        ? customRequirement || requirement
                        : requirement}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Assigned Line In-Charge
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedSupervisor ? `${selectedSupervisor.name} (${selectedSupervisor.employeeId})` : 'Unassigned'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Target SLA Due Date
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {formattedTargetDeadline} ({deadlineHours}h)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      CAP & Verification Method
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {capRequired ? 'CAP Mandatory' : 'Direct Rework'} • {verificationMethod}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Finding Observation
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {description || 'No defect description entered.'}
                  </p>
                </div>
              </div>

              {/* Strict Auditor Closure Notice */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    Closed-Loop NC Verification & Closure Protocol
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Issuing this NC moves its status to <span className="font-bold text-indigo-600 dark:text-indigo-400">Assigned</span> and initiates the SLA timer. The line in-charge must complete rectification and submit After Photo proof. <strong className="text-slate-900 dark:text-white">This NC defect can ONLY be officially closed after you (the Auditor) approve verification.</strong>
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* WIZARD NAVIGATION FOOTER */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div>
              {viewMode === 'wizard' && currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {viewMode === 'wizard' && currentStep < 10 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  <span>Continue to {WORKFLOW_STEPS[currentStep]?.short || 'Next'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSubmit(true)}
                    disabled={submitting || compressing}
                    className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <span>Save as Draft</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={submitting || compressing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{submitting ? 'Publishing NC...' : 'Publish & Issue NC (Open)'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewComplaintModal;
