import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldAlert,
  Building2,
  AlertCircle,
  FileText,
  Camera,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  User,
  ShieldCheck,
  Check,
  Lock,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { publicComplaintService } from '../services/api';
import { useCompany } from '../context/CompanyContext';
import { compressImage } from '../utils/imageCompressor';

// Quick Predefined Finding Phrases for Factory Floor
const PREDEFINED_FINDINGS = [
  'Skipped stitches on seam',
  'Oil / stain contamination on panel',
  'Needle holes / cut along seam',
  'Machine safety guard missing or loose',
  'Loose thread ends / raw edge fraying',
  'Broken needle detected - needle log missing',
  'Emergency exit route obstructed by bundles',
];

const RISK_LEVELS = [
  { level: 'CRITICAL', label: 'Critical Risk (Immediate Hazard / Embargo)' },
  { level: 'MAJOR', label: 'Major Defect (Functional Flaw / Quality Drift)' },
  { level: 'MINOR', label: 'Minor Defect (Workmanship / Cosmetic Flaw)' },
  { level: 'OBSERVATION', label: 'Audit Observation (Process Improvement)' },
];

export const PublicRaiseComplaintPage = () => {
  const { companyName, companySlug, basePath } = useCompany();
  const fileInputRef = useRef(null);

  // Form States
  const [selectedUnitId, setSelectedUnitId] = useState('UNIT-1');
  const [units, setUnits] = useState([
    { unitId: 'UNIT-1', name: 'Unit 1' },
    { unitId: 'UNIT-2', name: 'Unit 2' },
  ]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('MAJOR');
  const [description, setDescription] = useState('');

  // Photo
  const [beforeFile, setBeforeFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressing, setCompressing] = useState(false);

  // Reporter Info
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // UI States
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedNC, setSubmittedNC] = useState(null);

  // Fetch live departments and units from database on mount
  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      try {
        setLoadingDepts(true);
        const [deptRes, unitRes] = await Promise.allSettled([
          publicComplaintService.getDepartments(),
          publicComplaintService.getUnits(),
        ]);

        if (isMounted && deptRes.status === 'fulfilled' && deptRes.value.data?.success) {
          const list = deptRes.value.data.departments || [];
          setDepartments(list);
          if (list.length > 0) {
            setDepartment(list[0].name || list[0].id);
            setLocation(list[0].defaultLocation || `${list[0].name} Floor`);
          }
        }

        if (isMounted && unitRes.status === 'fulfilled' && unitRes.value.data?.success) {
          const uList = unitRes.value.data.units || [];
          if (uList.length > 0) {
            setUnits(uList);
          }
        }
      } catch (err) {
        console.warn('Could not load public metadata:', err);
      } finally {
        if (isMounted) setLoadingDepts(false);
      }
    };

    fetchMetadata();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleDepartmentChange = (deptName) => {
    setDepartment(deptName);
    const matched = departments.find((d) => d.name === deptName || d.id === deptName);
    if (matched?.defaultLocation) {
      setLocation(matched.defaultLocation);
    } else {
      setLocation(`${deptName} Floor Section`);
    }
  };

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
    } catch (err) {
      console.warn('Image compression fallback:', err);
      setBeforeFile(file);
      try {
        setPreviewUrl(URL.createObjectURL(file));
      } catch (_) {}
    } finally {
      setCompressing(false);
    }
  };

  const handleRemovePhoto = () => {
    setBeforeFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!department) {
      setError('Please select the affected factory department.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description of the defect or observation.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('department', department);
      formData.append('location', location.trim() || `${department} Floor Section`);
      formData.append('priority', priority || 'MAJOR');
      formData.append('riskSeverity', priority || 'MAJOR');
      formData.append('description', description.trim());
      formData.append('findingDescription', description.trim());
      formData.append('unitId', selectedUnitId || 'UNIT-1');
      formData.append('isAnonymous', isAnonymous ? 'true' : 'false');
      formData.append('reporterName', isAnonymous ? 'Anonymous' : (reporterName.trim() || 'Floor Operator'));
      formData.append('reporterContact', isAnonymous ? '' : reporterContact.trim());

      if (beforeFile) {
        formData.append('beforePhotoFile', beforeFile);
        formData.append('beforePhoto', beforeFile);
      }

      const res = await publicComplaintService.raisePublicComplaint(formData);
      if (res.data?.success) {
        setSubmittedNC(res.data.complaint);
      } else {
        setError(res.data?.message || 'Failed to submit compliance issue. Please try again.');
      }
    } catch (err) {
      console.error('Error submitting public NC:', err);
      const msg = err.response?.data?.message || err.message || 'Network error submitting report.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSubmittedNC(null);
    setDescription('');
    setBeforeFile(null);
    setPreviewUrl(null);
    setReporterName('');
    setReporterContact('');
    setIsAnonymous(false);
    setError(null);
  };

  // SUCCESS SCREEN
  if (submittedNC) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl backdrop-blur-md animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              NC Logged Successfully
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Defect Recorded
            </h2>
            <p className="text-xs text-slate-400">
              Your observation has been registered into the plant Quality & Compliance Register.
            </p>
          </div>

          {/* Reference Badge */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-left space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Reference Number</span>
              <span className="font-mono font-bold text-indigo-400 text-sm">
                {submittedNC.complaintId || 'NC-REGISTERED'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Department</span>
              <span className="font-bold text-white">{submittedNC.department}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Factory Unit</span>
              <span className="font-bold text-white">{submittedNC.unitName || selectedUnitId}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Resolution SLA</span>
              <span className="font-mono text-amber-400 font-bold">16 Hours Floor SLA</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            The assigned floor supervisor and QA auditor have been notified for physical floor containment and corrective action review.
          </p>

          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
            >
              Raise Another Compliance Issue
            </button>

            <Link
              to={`${basePath}/login`}
              className="text-xs text-slate-400 hover:text-white transition-colors py-1 font-semibold"
            >
              Staff &amp; Auditor Login →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6">
      
      {/* HEADER BAR */}
      <header className="max-w-2xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>{companyName}</span>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
                QMS Portal
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Open Floor Compliance &amp; Non-Conformance Raising Form
            </p>
          </div>
        </div>

        <Link
          to={`${basePath}/login`}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 transition-colors"
        >
          <span>Staff Login</span>
        </Link>
      </header>

      {/* MAIN FORM CONTAINER */}
      <main className="max-w-2xl mx-auto w-full my-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
        
        {/* Intro Banner */}
        <div className="mb-5 p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300">
            <strong className="text-white">Floor Non-Conformance Portal:</strong> Any factory employee, operator, technician, or visitor can report an observed defect or hazard. No account or password required.
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 flex items-center gap-2 text-xs font-medium animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* 1. FACTORY UNIT SELECTION */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <label className="block font-bold text-white text-xs flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Factory Plant Unit <strong className="text-rose-400">*</strong></span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {units.map((u) => (
                <button
                  key={u.unitId}
                  type="button"
                  onClick={() => setSelectedUnitId(u.unitId)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    selectedUnitId === u.unitId
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {u.name || (u.unitId === 'UNIT-2' ? 'Unit 2' : 'Unit 1')}
                </button>
              ))}
            </div>
          </div>

          {/* 2. DEPARTMENT & LOCATION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label className="block font-bold text-white text-xs">
                Department <strong className="text-rose-400">*</strong>
              </label>
              <select
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-800 bg-slate-900 text-white font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {loadingDepts ? (
                  <option value="">Loading factory departments...</option>
                ) : departments.length === 0 ? (
                  <>
                    <option value="Production">Production</option>
                    <option value="Quality">Quality / QA</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Store">Store</option>
                    <option value="EHS">EHS / Safety</option>
                  </>
                ) : (
                  departments.map((d) => (
                    <option key={d.id || d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <label className="block font-bold text-white text-xs">
                Floor Section / Line
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Line 3, Table 4, Sewing Section"
                className="w-full p-2.5 text-xs rounded-xl border border-slate-800 bg-slate-900 text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 3. RISK / SEVERITY LEVEL */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <label className="block font-bold text-white text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Risk / Severity Level <strong className="text-rose-400">*</strong></span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RISK_LEVELS.map((r) => (
                <button
                  key={r.level}
                  type="button"
                  onClick={() => setPriority(r.level)}
                  className={`p-2 rounded-xl text-center font-bold text-xs border transition-all cursor-pointer ${
                    priority === r.level
                      ? r.level === 'CRITICAL'
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : r.level === 'MAJOR'
                        ? 'bg-amber-600 border-amber-500 text-white'
                        : r.level === 'MINOR'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {r.level}
                </button>
              ))}
            </div>
          </div>

          {/* 4. DEFECT FINDINGS & OBSERVATIONS */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <label className="block font-bold text-white text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Describe the Non-Conformance Finding <strong className="text-rose-400">*</strong></span>
            </label>

            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain clearly what defect or non-conformance was observed..."
              className="w-full p-3 text-xs rounded-xl border border-slate-800 bg-slate-900 text-white focus:ring-2 focus:ring-indigo-500 leading-relaxed"
            />

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-slate-400 font-semibold mr-1">Quick Tags:</span>
              {PREDEFINED_FINDINGS.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() =>
                    setDescription((prev) => (prev ? `${prev}. ${phrase}` : phrase))
                  }
                  className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-900 border border-slate-800 hover:border-indigo-500 text-slate-300 transition-colors cursor-pointer"
                >
                  + {phrase}
                </button>
              ))}
            </div>
          </div>

          {/* 5. PHOTO EVIDENCE (MOBILE CAMERA FRIENDLY) */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-white text-xs flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                <span>Photo Evidence</span>
              </label>
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                >
                  Remove Photo
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
              <div className="relative rounded-xl overflow-hidden border border-emerald-500/50 bg-slate-900 h-36 flex items-center justify-center">
                <img src={previewUrl} alt="Defect Snapshot" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-600 text-white">
                  Photo Attached
                </span>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-xl bg-slate-900/60 flex items-center justify-center gap-2.5 cursor-pointer transition-colors"
              >
                <UploadCloud className="w-5 h-5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-300">
                  {compressing ? 'Compressing photo...' : 'Tap to take camera photo or upload evidence'}
                </span>
              </div>
            )}
          </div>

          {/* 6. REPORTER DETAILS & ANONYMITY */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>Reporter Details (Optional)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Submit Anonymously</span>
              </label>
            </div>

            {!isAnonymous && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-fadeIn">
                <input
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Your Name (e.g. John Operator)"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-800 bg-slate-900 text-white focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                  placeholder="Phone or Employee ID (Optional)"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-800 bg-slate-900 text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          {/* DESCRIPTION BAR AT END OF COMPLIANCE RAISING FORM */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/50 via-slate-900 to-indigo-950/50 border border-indigo-800/60 space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <h4 className="text-xs font-bold text-white">
                Official Plant Quality &amp; Confidentiality Guarantee
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every raised non-conformance is entered into the official factory audit register. Containment actions are directly assigned to the Department Floor Supervisor under our 12-16 hour SLA. Your submission is protected and strictly treated with professional confidentiality.
            </p>
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-indigo-600/30 transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{submitting ? 'Submitting Defect...' : 'Submit Compliance Issue'}</span>
          </button>

        </form>

      </main>

      {/* FOOTER */}
      <footer className="max-w-2xl mx-auto w-full text-center text-xs text-slate-500 py-3">
        © {new Date().getFullYear()} {companyName} • Garment Manufacturing Quality Management System
      </footer>

    </div>
  );
};

export default PublicRaiseComplaintPage;
