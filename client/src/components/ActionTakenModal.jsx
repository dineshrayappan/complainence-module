import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Clock,
  ShieldCheck,
  UserCheck,
  Calendar,
  Sparkles,
  Layers,
  ArrowRight,
  ZoomIn,
} from 'lucide-react';
import { complaintService } from '../services/api';
import { compressImage, formatFileSize } from '../utils/imageCompressor';
import CountdownBadge from './CountdownBadge';

const FALLBACK_BEFORE_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' fill='%23fee2e2'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' font-weight='bold' fill='%23b91c1c'%3EBefore Photo%3C/text%3E%3C/svg%3E";



export const ActionTakenModal = ({ complaint, isOpen, onClose, onSuccess }) => {
  const fileInputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Structured 8-Part CAP Form State
  const [immediateCorrection, setImmediateCorrection] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [responsibleDept, setResponsibleDept] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [verificationReadinessNotes, setVerificationReadinessNotes] = useState('');

  // After Photo (Evidence) State
  const [afterFile, setAfterFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [photoBase64, setPhotoBase64] = useState('');
  const [imageMeta, setImageMeta] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [showBeforeZoom, setShowBeforeZoom] = useState(false);

  // Initialize or populate from existing complaint
  useEffect(() => {
    if (complaint && isOpen) {
      const cap = complaint.cap || {};
      setImmediateCorrection(cap.immediateCorrection || complaint.actionNotes || '');
      setRootCause(cap.rootCause || complaint.feedbackRemarks || '');
      setCorrectiveAction(cap.correctiveAction || complaint.actionNotes || '');
      setPreventiveAction(cap.preventiveAction || (complaint.feedbackRemarks !== cap.rootCause ? complaint.feedbackRemarks : '') || '');

      const resp = cap.responsiblePerson || complaint.assignedTo || {};
      setResponsibleName(resp.name || 'Assigned Supervisor');
      setResponsibleDept(resp.department || complaint.department || 'Production');

      if (cap.targetDate) {
        setTargetDate(new Date(cap.targetDate).toISOString().split('T')[0]);
      } else if (complaint.deadlineTimestamp) {
        setTargetDate(new Date(complaint.deadlineTimestamp).toISOString().split('T')[0]);
      } else {
        setTargetDate(new Date().toISOString().split('T')[0]);
      }

      setVerificationReadinessNotes(cap.verificationReadinessNotes || '');
      setPreviewUrl(complaint.afterPhoto || null);
      setPhotoBase64(complaint.afterPhoto || '');
      setError(null);
    }
  }, [complaint, isOpen]);

  if (!isOpen || !complaint) return null;



  // Handle Rear Camera / Photo Selection with Client Canvas Compression
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

      setAfterFile(result.file || file);
      setPreviewUrl(result.previewUrl || result.dataUrl);
      setPhotoBase64(result.dataUrl || '');
      setImageMeta({
        originalSize: result.originalSize || file.size,
        compressedSize: result.compressedSize || file.size,
      });
    } catch (err) {
      console.warn('Compression error, using raw file:', err);
      setAfterFile(file);
      const fallbackUrl = URL.createObjectURL(file);
      setPreviewUrl(fallbackUrl);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoBase64(reader.result);
      reader.readAsDataURL(file);
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!afterFile && !photoBase64) {
      setError('Evidence Proof Required: Please capture or upload a mandatory After Photo.');
      return;
    }

    if (!immediateCorrection.trim()) {
      setError('Immediate Correction is mandatory: Specify what immediate containment action was taken.');
      return;
    }

    if (!rootCause.trim()) {
      setError('Root Cause Analysis is mandatory: Detail the underlying cause of this non-conformance.');
      return;
    }

    if (!correctiveAction.trim()) {
      setError('Corrective Action is mandatory: Detail what permanent fix eliminates the root cause.');
      return;
    }

    if (!preventiveAction.trim()) {
      setError('Preventive Action is mandatory: Detail how recurrence is prevented across the factory.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();

      // Send structured CAP fields
      formData.append('immediateCorrection', immediateCorrection.trim());
      formData.append('rootCause', rootCause.trim());
      formData.append('correctiveAction', correctiveAction.trim());
      formData.append('preventiveAction', preventiveAction.trim());
      formData.append('targetDate', targetDate);
      formData.append('verificationReadinessNotes', verificationReadinessNotes.trim());

      formData.append(
        'responsiblePerson',
        JSON.stringify({
          name: responsibleName.trim(),
          department: responsibleDept.trim(),
          employeeId: complaint.assignedTo?.employeeId || 'SUP-001',
          designation: complaint.assignedTo?.designation || 'In-Charge',
        })
      );

      // Synthesize combined strings for backward compatibility
      const actionNotes = `[Immediate Correction]: ${immediateCorrection.trim()}\n\n[Corrective Action]: ${correctiveAction.trim()}`;
      const feedbackRemarks = `[Root Cause]: ${rootCause.trim()}\n\n[Preventive Action]: ${preventiveAction.trim()}`;
      formData.append('actionNotes', actionNotes);
      formData.append('feedbackRemarks', feedbackRemarks);

      let effectiveBase64 = photoBase64;
      if (!effectiveBase64 && afterFile) {
        try {
          effectiveBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(afterFile);
          });
        } catch (e) {}
      }

      if (effectiveBase64) {
        formData.append('afterPhotoBase64', effectiveBase64);
        formData.append('afterPhoto', effectiveBase64);
      }
      if (afterFile) {
        formData.append('afterPhotoFile', afterFile);
      }

      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.submitAction(targetId, formData);
      if (res.data.success) {
        onSuccess(res.data.complaint);
        onClose();
      }
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || 'Failed to submit CAP resolution. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col transition-colors">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-cyan-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800/80 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  CAP Resolution Management
                </h2>
                <span className="font-mono text-xs font-bold text-indigo-700 dark:text-cyan-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {complaint.complaintId}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                8-Stage Industrial QMS Protocol • Corrective & Preventive Action Plan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm overflow-y-auto flex-1">
          {error && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* NC Visual Root Banner & Quick Defect Snapshot */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative group cursor-pointer" onClick={() => setShowBeforeZoom(!showBeforeZoom)}>
                <img
                  src={complaint.beforePhoto}
                  alt="NC Defect Before"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_BEFORE_IMG;
                  }}
                  className="w-16 h-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs group-hover:opacity-90"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl transition-opacity">
                  <ZoomIn className="w-4 h-4 text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-black text-rose-600 dark:text-rose-400 tracking-wider">
                    NON-CONFORMANCE (NC)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">•</span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    Dept: {complaint.department}
                  </span>
                </div>
                <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                  {complaint.category} • {complaint.location}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">
                  {complaint.description}
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <CountdownBadge
                deadlineTimestamp={complaint.deadlineTimestamp}
                status={complaint.status}
              />
            </div>
          </div>



          {/* CAP Visual Hierarchy Diagram */}
          <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <span className="font-mono font-bold text-indigo-700 dark:text-cyan-400 text-xs block">
              CAP Hierarchy: NC ──► Immediate Correction ──► Root Cause ──► Corrective Action ──► Preventive Action ──► Evidence ──► Verification
            </span>
            <p className="text-slate-500 dark:text-slate-400 leading-snug">
              ISO 9001 / IATF 16949 compliant structure ensuring non-conformances are contained immediately, root causes eradicated, and recurrences prevented across the plant.
            </p>
          </div>

          {/* ================= 8 STRUCTURED CAP NODES ================= */}
          <div className="space-y-3.5 pt-1">
            
            {/* NODE 1: Immediate Correction */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-mono text-[11px] font-black flex items-center justify-center">
                    1
                  </span>
                  <span>Immediate Correction (Containment Action) *</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase">
                  Immediate Containment
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Action taken right away to stop the defect and isolate non-conforming items (e.g. Remove cartons from exit, quarantine lot, spot clean).
              </p>
              <textarea
                rows="2"
                required
                value={immediateCorrection}
                onChange={(e) => setImmediateCorrection(e.target.value)}
                placeholder="e.g. Remove cartons from emergency exit immediately and clear entire egress aisle."
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
              />
            </div>

            {/* NODE 2: Root Cause Analysis */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-mono text-[11px] font-black flex items-center justify-center">
                    2
                  </span>
                  <span>Root Cause Analysis (5-Why / 6M Cause) *</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase">
                  Why It Occurred
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                The underlying failure mechanism that allowed the breach (e.g. Storage layout not controlled, needle deflection due to bulky interlining).
              </p>
              <textarea
                rows="2"
                required
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="e.g. Storage layout not controlled and temporary stacking exceeding designated yellow line."
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
              />
            </div>

            {/* NODE 3: Corrective Action */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[11px] font-black flex items-center justify-center">
                    3
                  </span>
                  <span>Corrective Action (Permanent Fix) *</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase">
                  Eliminate Root Cause
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Action taken to permanently remove the root cause for this line or process (e.g. Revise storage location and painted floor markings).
              </p>
              <textarea
                rows="2"
                required
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                placeholder="e.g. Revise storage location, repaint reflective yellow floor perimeter markings, and install physical barrier."
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
              />
            </div>

            {/* NODE 4: Preventive Action */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[11px] font-black flex items-center justify-center">
                    4
                  </span>
                  <span>Preventive Action (Recurrence Prevention) *</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                  Prevent Recurrence
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Systemic or process change applied across similar lines/areas (e.g. Add weekly emergency-exit inspection, standardized needle replacement SOP).
              </p>
              <textarea
                rows="2"
                required
                value={preventiveAction}
                onChange={(e) => setPreventiveAction(e.target.value)}
                placeholder="e.g. Add weekly emergency-exit inspection checklist and train store handlers on egress compliance."
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
              />
            </div>

            {/* NODE 5 & 6: Responsible Person & Target Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* NODE 5: Responsible Person */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-mono text-[11px] font-black flex items-center justify-center">
                    5
                  </span>
                  <span>Responsible Person *</span>
                </label>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <input
                    type="text"
                    required
                    value={responsibleName}
                    onChange={(e) => setResponsibleName(e.target.value)}
                    placeholder="Supervisor Name"
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <input
                    type="text"
                    required
                    value={responsibleDept}
                    onChange={(e) => setResponsibleDept(e.target.value)}
                    placeholder="Department"
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  />
                </div>
              </div>

              {/* NODE 6: Target Date */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-cyan-300 font-mono text-[11px] font-black flex items-center justify-center">
                    6
                  </span>
                  <span>Target Date / Implementation SLA *</span>
                </label>
                <div className="relative pt-0.5">
                  <input
                    type="date"
                    required
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* NODE 7: Evidence (Mandatory After Photo Proof) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[11px] font-black flex items-center justify-center">
                    7
                  </span>
                  <span>Evidence (Mandatory After Photo Proof) *</span>
                </label>
                {imageMeta && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                    Compressed: {formatFileSize(imageMeta.compressedSize)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Visual proof confirming the immediate correction and corrective action have been completed.
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                onClick={(e) => {
                  e.target.value = null;
                }}
                onChange={handlePhotoCapture}
                className="hidden"
                id="camera-after-photo"
              />

              {previewUrl ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Before Photo Comparison */}
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                    <img
                      src={complaint.beforePhoto}
                      alt="Before"
                      className="w-full h-44 object-cover"
                    />
                    <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow">
                      Before Defect
                    </span>
                  </div>

                  {/* After Photo Proof */}
                  <div className="relative rounded-2xl overflow-hidden border border-emerald-400 dark:border-emerald-600/80 bg-slate-100 dark:bg-slate-900">
                    <img
                      src={previewUrl}
                      alt="After Resolution"
                      className="w-full h-44 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow">
                        After Proof Ready
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5"
                      >
                        <Camera className="w-3 h-3 text-emerald-600" />
                        Retake
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-emerald-300 dark:border-emerald-700/60 hover:border-emerald-500 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 group"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-emerald-900/40 group-hover:bg-emerald-100 flex items-center justify-center mb-1.5 transition-colors border border-emerald-200 dark:border-emerald-700 shadow-xs">
                    <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                    {compressing
                      ? 'Compressing Photo...'
                      : 'Tap to Open Camera / Upload Evidence Proof'}
                  </span>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400/80 mt-0.5 font-mono">
                    Mandatory Visual Proof of Correction
                  </span>
                </div>
              )}
            </div>

            {/* NODE 8: Verification Readiness */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 font-mono text-[11px] font-black flex items-center justify-center">
                    8
                  </span>
                  <span>Verification Readiness (Notes for Auditor)</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  Method: {complaint.verificationMethod || 'Physical Floor Re-inspection'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Provide instructions or pass-criteria for the auditor to verify the effectiveness of this CAP.
              </p>
              <textarea
                rows="2"
                value={verificationReadinessNotes}
                onChange={(e) => setVerificationReadinessNotes(e.target.value)}
                placeholder="e.g. Ready for floor inspection at Station 4. Markings repainted and inspected by line supervisor."
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
              />
            </div>
          </div>

          {/* Audit Verification Gateway Notice */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Audit Verification Gateway:
              </span>{' '}
              Submitting this 8-point CAP shifts ticket status to{' '}
              <span className="text-amber-700 dark:text-amber-300 font-mono font-bold">
                Under Verification
              </span>
              . Only an authorized Internal Auditor can verify each CAP node and formally close this NC.
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || compressing}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Submitting CAP...' : 'Submit Full CAP for Audit Verification'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ActionTakenModal;
