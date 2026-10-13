import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Clock,
  MapPin,
  User,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Send,
  ShieldCheck,
  Check,
  RotateCcw,
  ZoomIn,
  UserPlus,
  Search,
  UserCheck,
  Play,
  Camera,
  Trash2,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  CheckCheck,
} from 'lucide-react';
import CountdownBadge from './CountdownBadge';
import { formatAbsoluteTime } from '../utils/timer';
import { complaintService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';

const FALLBACK_BEFORE_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23fee2e2'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' font-weight='bold' fill='%23b91c1c'%3EBefore Defect Photo%3C/text%3E%3C/svg%3E";
const FALLBACK_AFTER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23dcfce7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' font-weight='bold' fill='%2315803d'%3EAfter Resolution Photo%3C/text%3E%3C/svg%3E";

export const ComplaintDetailModal = ({
  complaint,
  isOpen,
  onClose,
  onUpdateComplaint,
  onStartProgress,
  onSubmitAction,
  onDeleteComplaint,
}) => {
  const { user, isAuditor, isAdmin } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Verification state
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const [error, setError] = useState(null);

  // Reassignment state
  const [showReassignBox, setShowReassignBox] = useState(false);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [reassignNotes, setReassignNotes] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reassignSearch, setReassignSearch] = useState('');

  const canReassign = (isAuditor || isAdmin) && complaint?.status !== 'Closed';

  // Live work operations state
  const [startingWork, setStartingWork] = useState(false);
  const [pausingWork, setPausingWork] = useState(false);
  const [workFeedback, setWorkFeedback] = useState(null);

  const handleStartWork = async () => {
    try {
      setStartingWork(true);
      setError(null);
      setWorkFeedback(null);
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.markInProgress(targetId);
      if (res.data?.success) {
        const updated = res.data.complaint || { ...complaint, status: 'In Progress' };
        if (onUpdateComplaint) onUpdateComplaint(updated);
        if (onStartProgress) onStartProgress(updated);
        setWorkFeedback('⚡ Work initiated! Your status is now "Busy in Progress" on Live Work Operations.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start floor containment.');
    } finally {
      setStartingWork(false);
    }
  };

  const handlePauseWork = async () => {
    try {
      setPausingWork(true);
      setError(null);
      setWorkFeedback(null);
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.stopWork(targetId, 'Supervisor paused floor containment.');
      if (res.data?.success) {
        const updated = res.data.complaint || { ...complaint, status: 'Open', startedAt: null };
        if (onUpdateComplaint) onUpdateComplaint(updated);
        setWorkFeedback('Floor work paused. Your live work status has returned to "Available".');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to pause work.');
    } finally {
      setPausingWork(false);
    }
  };

  // Master Contact List of Supervisors from database
  const [supervisorsList, setSupervisorsList] = useState([]);

  useEffect(() => {
    if (isOpen) {
      userService.getLineSupervisors().then((res) => {
        if (res.data?.success && Array.isArray(res.data.supervisors)) {
          setSupervisorsList(res.data.supervisors);
        }
      }).catch((err) => {
        console.warn('Failed to load line supervisors for modal:', err.message);
      });
    }
  }, [isOpen]);

  const filteredSupervisors = supervisorsList.filter((s) => {
    if (!reassignSearch.trim()) return true;
    const term = reassignSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(term) ||
      s.employeeId?.toLowerCase().includes(term) ||
      s.department?.toLowerCase().includes(term) ||
      s.designation?.toLowerCase().includes(term) ||
      s.mobileNumber?.toLowerCase().includes(term)
    );
  });

  const handleReassign = async (e) => {
    e.preventDefault();
    if (!selectedSupervisorId) {
      setError('Please select a Line In-Charge to assign this task to.');
      return;
    }

    try {
      setReassigning(true);
      setError(null);
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.reassignComplaint(
        targetId,
        selectedSupervisorId,
        reassignNotes.trim()
      );
      if (res.data?.success) {
        onUpdateComplaint(res.data.complaint);
        setShowReassignBox(false);
        setReassignNotes('');
        setSelectedSupervisorId('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reassign defect task.');
    } finally {
      setReassigning(false);
    }
  };

  if (!isOpen || !complaint) return null;

  // Safe parse for timeline, cap, and assignedTo whether they are objects, arrays, or JSON strings
  const timelineList = Array.isArray(complaint.timeline)
    ? complaint.timeline
    : typeof complaint.timeline === 'string'
    ? (() => { try { const p = JSON.parse(complaint.timeline); return Array.isArray(p) ? p : []; } catch(e) { return []; } })()
    : [];

  const capData = (typeof complaint.cap === 'object' && complaint.cap !== null)
    ? complaint.cap
    : typeof complaint.cap === 'string'
    ? (() => { try { return JSON.parse(complaint.cap) || {}; } catch(e) { return {}; } })()
    : {};

  const assignedToData = (typeof complaint.assignedTo === 'object' && complaint.assignedTo !== null)
    ? complaint.assignedTo
    : typeof complaint.assignedTo === 'string'
    ? (() => { try { return JSON.parse(complaint.assignedTo) || {}; } catch(e) { return {}; } })()
    : {};

  const uEmp = (user?.employeeId || '').toUpperCase();
  const uId = String(user?.id || user?._id || '');
  const assignedEmp = (assignedToData?.employeeId || complaint.assignedTo?.employeeId || '').toUpperCase();
  const assignedId = String(assignedToData?.userId || complaint.assignedTo?.userId || '');
  const isDirectlyAssigned = (uEmp && assignedEmp === uEmp) || (uId && assignedId === uId);
  const isSameDeptSupervisor = (user?.role === 'SUPERVISOR' || user?.role === 'ACTION_PERSON') &&
    (user?.department || '').trim().toLowerCase() === (complaint?.department || '').trim().toLowerCase();
  // Live Work Floor Operations (Start / Stop work) are strictly for floor supervisors / assignees.
  // Never show Start / Stop work buttons to Admins or Auditors on admin/auditor views or in modal.
  const isPrivilegedAuditorOrAdmin = isAuditor || isAdmin || user?.role === 'ADMIN' || user?.role === 'AUDITOR';
  const canActOnNC = !isPrivilegedAuditorOrAdmin && (isDirectlyAssigned || isSameDeptSupervisor);

  // Handle direct timeline remark
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setSubmittingComment(true);
      setError(null);
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.addTimelineComment(
        targetId,
        commentText.trim()
      );
      if (res.data.success) {
        if (res.data.complaint) {
          onUpdateComplaint(res.data.complaint);
        } else {
          onUpdateComplaint({
            ...complaint,
            timeline: res.data.timeline || [
              ...(complaint.timeline || []),
              {
                action: 'COMMENT_ADDED',
                performedBy: { name: 'Me' },
                notes: commentText.trim(),
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
        setCommentText('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post remark.');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Handle Auditor Verification (Start Review, Verify, Approve, or Reject)
  const handleVerify = async (decision, customNotes = '') => {
    if (decision === 'REJECT' && !rejectionReason.trim()) {
      setError('A rejection reason is mandatory when returning an NC defect to the line.');
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.verifyComplaint(targetId, {
        decision,
        rejectionReason: rejectionReason.trim(),
        verificationNotes: customNotes,
      });

      if (res.data.success) {
        onUpdateComplaint(res.data.complaint);
        setShowRejectBox(false);
        setRejectionReason('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Draft':
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      case 'Open':
      case 'Assigned':
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800';
      case 'CAP Submitted':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800 font-semibold';
      case 'Under Review':
      case 'Under Verification':
        return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700 animate-pulse font-semibold';
      case 'Rejected / Rework':
      case 'Rejected / Sent Back':
        return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800 font-semibold';
      case 'Verified':
        return 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800 font-semibold';
      case 'Closed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const getTimelineEventBadge = (action) => {
    switch (action) {
      case 'CREATED':
      case 'OPENED':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/40';
      case 'IN_PROGRESS':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40';
      case 'ACTION_SUBMITTED':
      case 'CAP_SUBMITTED':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/40';
      case 'REVIEW_STARTED':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40';
      case 'VERIFIED':
        return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/20 dark:text-teal-400 dark:border-teal-500/40';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/40';
      case 'REASSIGNED':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/40';
      case 'CLOSED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="font-mono text-xs sm:text-base font-extrabold text-slate-900 dark:text-cyan-400 bg-slate-200/80 dark:bg-slate-950 px-2 sm:px-3 py-0.5 sm:py-1 rounded-xl border border-slate-300 dark:border-slate-800 shrink-0">
              NC: {complaint.complaintId}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  {complaint.category}
                </h2>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                  {complaint.priority}
                </span>
                <span
                  title="NC Lifecycle Status"
                  className={`text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full border shrink-0 ${getStatusBadge(
                    complaint.status
                  )}`}
                >
                  {complaint.status}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                <span className="truncate">{complaint.location} • {complaint.department}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden xs:block">
              <CountdownBadge
                deadlineTimestamp={complaint.deadlineTimestamp}
                status={complaint.status}
              />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Container - Scrollable on Mobile & Tablet */}
        <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Visible CountdownBadge for narrow phones */}
          <div className="xs:hidden flex justify-end">
            <CountdownBadge
              deadlineTimestamp={complaint.deadlineTimestamp}
              status={complaint.status}
            />
          </div>

          {/* Section 1: Side-by-Side Before Photo vs After Photo Comparison */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 sm:mb-3 flex items-center gap-1.5">
              <span>Photo Evidence Verification</span>
              <span>•</span>
              <span className="text-indigo-600 dark:text-blue-400">Tap to Zoom</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Before Photo */}
              <div
                onClick={() => setActiveZoomImage(complaint.beforePhoto)}
                className="relative rounded-2xl overflow-hidden border border-rose-200 dark:border-rose-900/60 bg-slate-50 dark:bg-slate-950 group cursor-pointer shadow-xs hover:shadow-md transition-shadow"
              >
                <img
                  src={complaint.beforePhoto}
                  alt="Defect Before"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_BEFORE_IMG;
                  }}
                  className="w-full h-44 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3">
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-rose-600 text-white shadow">
                    BEFORE RECTIFICATION
                  </span>
                  <div className="p-1 sm:p-1.5 rounded-lg bg-slate-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
              </div>

              {/* After Photo */}
              {complaint.afterPhoto ? (
                <div
                  onClick={() => setActiveZoomImage(complaint.afterPhoto)}
                  className="relative rounded-2xl overflow-hidden border border-emerald-300 dark:border-emerald-900/60 bg-slate-50 dark:bg-slate-950 group cursor-pointer shadow-xs hover:shadow-md transition-shadow"
                >
                  <img
                    src={complaint.afterPhoto}
                    alt="Defect After"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = FALLBACK_AFTER_IMG;
                    }}
                    className="w-full h-52 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3.5">
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow">
                      AFTER PROOF (RESOLVED)
                    </span>
                    <div className="p-1.5 rounded-lg bg-slate-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex flex-col items-center justify-center p-6 text-center h-52 sm:h-56 text-slate-500">
                  <Clock className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2 animate-pulse" />
                  <span className="font-bold text-slate-700 dark:text-slate-400 text-sm">
                    Awaiting After Photo Proof
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-600 mt-1 max-w-xs">
                    Assigned Line In-Charge will capture proof from the shop floor once correction is completed.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: NC Audit Governance & CAP Status */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs shadow-2xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
                Defect Category
              </span>
              <span className="font-extrabold text-slate-900 dark:text-white truncate block mt-0.5">
                {complaint.category || 'Quality'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
                CAP Status
              </span>
              <span className={`inline-flex items-center gap-1 font-bold mt-0.5 ${
                complaint.capRequired ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'
              }`}>
                {complaint.capRequired ? 'Mandatory CAP (Root Cause Required)' : 'Direct Rectification'}
              </span>
            </div>
          </div>

          {/* Section 3: Defect Details & Personnel Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Defect Description */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Defect Description & Instructions
              </span>
              <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
                {complaint.findingDescription || complaint.description}
              </p>
              <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-200 dark:border-slate-900">
                <span>Logged by: {complaint.createdBy?.name} ({complaint.createdBy?.role})</span>
                <span className="font-mono">{formatAbsoluteTime(complaint.createdAt)}</span>
              </div>
            </div>

            {/* SLA & Line In-Charge Snapshot */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  Assignment & SLA Window
                </span>
                {canReassign && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowReassignBox(!showReassignBox);
                      setSelectedSupervisorId(
                        complaint.assignedTo?.userId || complaint.assignedTo?.employeeId || ''
                      );
                    }}
                    className="text-[11px] font-bold text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>{showReassignBox ? 'Cancel Reassign' : 'Reassign In-Charge'}</span>
                  </button>
                )}
              </div>

              {showReassignBox && (
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                      Select New Line In-Charge
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      10 Contacts Available
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={reassignSearch}
                      onChange={(e) => setReassignSearch(e.target.value)}
                      placeholder="Search supervisor by name, line, or ID..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                    {filteredSupervisors.map((s) => {
                      const isSelected =
                        selectedSupervisorId === s._id || selectedSupervisorId === s.employeeId;
                      return (
                        <div
                          key={s.employeeId || s._id}
                          onClick={() => setSelectedSupervisorId(s._id || s.employeeId)}
                          className={`p-2 rounded-lg border text-[11px] cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-400 dark:border-cyan-500 text-slate-900 dark:text-white font-medium'
                              : 'bg-slate-50/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold truncate flex items-center gap-1.5">
                              <span>{s.name}</span>
                              <span className="text-[10px] font-mono font-normal text-slate-400">
                                ({s.employeeId})
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {s.department} • {s.designation}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400">
                              {s.mobileNumber}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={reassignNotes}
                    onChange={(e) => setReassignNotes(e.target.value)}
                    placeholder="Optional reassignment handover reason..."
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200"
                  />

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowReassignBox(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={reassigning || !selectedSupervisorId}
                      onClick={handleReassign}
                      className="px-3.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
                    >
                      {reassigning ? 'Reassigning...' : 'Confirm Reassign'}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-200 text-sm">
                    {complaint.assignedTo?.name}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {complaint.assignedTo?.designation} • {complaint.assignedTo?.department}
                  </div>
                </div>
                <div className="font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {complaint.assignedTo?.mobileNumber}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-900 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>SLA Duration:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {complaint.deadlineHours} Hours
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Target Deadline:</span>
                  <span className="font-mono text-indigo-700 dark:text-cyan-300 font-semibold">
                    {formatAbsoluteTime(complaint.deadlineTimestamp)}
                  </span>
                </div>
                {complaint.actualCompletedAt && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span>Approved & Closed At:</span>
                    <span className="font-mono">
                      {formatAbsoluteTime(complaint.actualCompletedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Structured CAP Management Tree (ISO 9001 / IATF 16949 QMS) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            {/* CAP Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-cyan-400 flex items-center justify-center font-bold border border-indigo-200 dark:border-indigo-800/60 shadow-xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      CAP Management Hierarchy
                    </h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      complaint.status === 'Closed' || complaint.cap?.status === 'VERIFIED_EFFECTIVE'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : complaint.status === 'Under Verification'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 border border-indigo-300 dark:border-indigo-800'
                    }`}>
                      {complaint.status === 'Closed' ? 'Verified Effective' : complaint.cap?.status || (complaint.capRequired ? 'CAP In Progress' : 'Direct Correction')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Non-Conformance (NC) ──► Immediate Correction ──► Root Cause ──► Corrective Action ──► Preventive Action ──► Evidence ──► Final Sign-off
                  </p>
                </div>
              </div>

              {complaint.actualCompletedAt && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 self-start sm:self-auto">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Closed &amp; Verified</span>
                </div>
              )}
            </div>

            {/* Tree Container with Vertical Branch Line */}
            <div className="relative pl-6 sm:pl-7 space-y-3.5 before:absolute before:left-2.5 sm:before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200 dark:before:bg-indigo-900/60">
              
              {/* TREE ROOT: Non-Conformance (NC) */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-rose-600 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-950/80 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      NC: Non-Conformance Breached
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300">
                      {complaint.category} • {complaint.department}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {complaint.location}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                    {complaint.findingDescription || complaint.description}
                  </p>
                </div>
              </div>

              {/* BRANCH 1: Immediate Correction */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center font-black text-[10px]">
                        1
                      </span>
                      Immediate Correction (Containment)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Immediate Containment
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                    {complaint.cap?.immediateCorrection || complaint.actionNotes || 'Pending containment action from assigned supervisor.'}
                  </p>
                </div>
              </div>

              {/* BRANCH 2: Root Cause Analysis */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center font-black text-[10px]">
                        2
                      </span>
                      Root Cause (5-Why / 6M Analysis)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Failure Mechanism
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                    {complaint.cap?.rootCause || complaint.feedbackRemarks || 'Pending 5-Why root cause analysis from assigned supervisor.'}
                  </p>
                </div>
              </div>

              {/* BRANCH 3: Corrective Action */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-black text-[10px]">
                        3
                      </span>
                      Corrective Action (Permanent Fix)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Eradicate Cause
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                    {complaint.cap?.correctiveAction || complaint.actionNotes || 'Pending corrective action execution on the shop floor.'}
                  </p>
                </div>
              </div>

              {/* BRANCH 4: Preventive Action */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black text-[10px]">
                        4
                      </span>
                      Preventive Action (Systemic Prevention)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Prevent Recurrence
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                    {complaint.cap?.preventiveAction || 'Pending establishment of systemic inspection or standard operating procedure change.'}
                  </p>
                </div>
              </div>

              {/* BRANCH 5: Responsible Person & Target Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Responsible Person */}
                <div className="relative group">
                  <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-purple-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                    <span className="text-[10px] font-mono font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-black text-[10px]">
                        5
                      </span>
                      Responsible Person
                    </span>
                    <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                      {complaint.cap?.responsiblePerson?.name || complaint.assignedTo?.name || 'Line Supervisor'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {complaint.cap?.responsiblePerson?.department || complaint.department} • {complaint.cap?.responsiblePerson?.designation || complaint.assignedTo?.designation || 'In-Charge'} ({complaint.cap?.responsiblePerson?.employeeId || complaint.assignedTo?.employeeId})
                    </div>
                  </div>
                </div>

                {/* Target Date */}
                <div className="relative group">
                  <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                    <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-cyan-300 flex items-center justify-center font-black text-[10px]">
                        6
                      </span>
                      Target Date / SLA
                    </span>
                    <div className="font-mono font-bold text-xs text-indigo-950 dark:text-cyan-200">
                      {formatAbsoluteTime(complaint.cap?.targetDate || complaint.deadlineTimestamp)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Standard SLA: {complaint.deadlineHours} Hours
                    </div>
                  </div>
                </div>
              </div>

              {/* BRANCH 7: Evidence (Before vs After Photos) */}
              <div className="relative group">
                <div className="absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-xs" />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black text-[10px]">
                        7
                      </span>
                      Evidence Proof (Visual Comparison)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {complaint.afterPhoto ? 'Evidence Submitted' : 'Awaiting Proof'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Before Evidence Thumbnail */}
                    <div
                      onClick={() => setActiveZoomImage(complaint.beforePhoto)}
                      className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 cursor-pointer group"
                    >
                      <img
                        src={complaint.beforePhoto}
                        alt="Before Evidence"
                        className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                      />
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow">
                        Before Proof
                      </span>
                    </div>

                    {/* After Evidence Thumbnail */}
                    {complaint.afterPhoto ? (
                      <div
                        onClick={() => setActiveZoomImage(complaint.afterPhoto)}
                        className="relative rounded-xl overflow-hidden border border-emerald-300 dark:border-emerald-800 bg-slate-100 dark:bg-slate-950 cursor-pointer group"
                      >
                        <img
                          src={complaint.afterPhoto}
                          alt="After Evidence"
                          className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow">
                          After Proof (Rectified)
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-center p-2 text-slate-400">
                        <Clock className="w-5 h-5 mb-1 animate-pulse" />
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          After Photo Pending
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BRANCH 8: Effectiveness Audit & Sign-off */}
              <div className="relative group">
                <div className={`absolute -left-6 sm:-left-7 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs ${
                  complaint.status === 'Closed' ? 'bg-emerald-600' : 'bg-cyan-500'
                }`} />
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-cyan-700 dark:text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 flex items-center justify-center font-black text-[10px]">
                        8
                      </span>
                      Final Review &amp; Effectiveness Sign-off
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      complaint.status === 'Closed'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : complaint.status === 'Under Verification' || complaint.status === 'Under Review'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {complaint.status === 'Closed' ? 'Reviewed & Closed' : complaint.status}
                    </span>
                  </div>
                  {complaint.status === 'Closed' && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 pt-1 flex items-center gap-1 font-semibold border-t border-slate-100 dark:border-slate-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Audit Sign-off: Rectification approved by QA Auditor. Closure granted.</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Rejection notice if status is Rejected / Rework */}
          {['Rejected / Rework', 'Rejected / Sent Back'].includes(complaint.status) && complaint.rejectionReason && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4" />
                Audit Rejection Notice: Returned for Rework
              </div>
              <p className="text-rose-900 dark:text-rose-100">{complaint.rejectionReason}</p>
            </div>
          )}

          {/* Supervisor Live Non-Conformance Work Operation Box: Start Work & Stop Work */}
          {canActOnNC && (
            <div className="space-y-3">
              {/* Feedback notice if just started / paused */}
              {workFeedback && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{workFeedback}</span>
                </div>
              )}

              {/* 1. START WORK: When complaint is Open, Assigned, Draft, or Rejected/Rework */}
              {['Open', 'Assigned', 'Draft', 'Rejected / Rework', 'Rejected / Sent Back'].includes(complaint.status) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-indigo-50/80 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-indigo-950/40 border-2 border-emerald-400 dark:border-emerald-600 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
                        <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-current" />
                        <span>Shop Floor Containment & Rectification</span>
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                        Ready to Start
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 max-w-xl">
                      Assignable Person:{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {complaint.assignedTo?.name || user?.name}
                      </strong>{' '}
                      ({complaint.assignedTo?.employeeId || user?.employeeId}). Click{' '}
                      <strong className="text-emerald-700 dark:text-emerald-300">Start Work</strong> to begin containment. Your live status will immediately reflect as{' '}
                      <strong className="text-amber-700 dark:text-amber-400">Busy in Progress</strong> on Live Work Operations.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleStartWork}
                      disabled={startingWork}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{startingWork ? 'Starting Floor Work...' : '▶ Start Work'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. STOP WORK: When complaint is In Progress */}
              {complaint.status === 'In Progress' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
                        ⚡ Live Work Operation: Busy in Progress
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                        Floor Containment Active
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      Shop floor work is in progress. When containment is done, click <strong className="text-rose-700 dark:text-rose-300">Stop Work</strong> to upload mandatory After Photo proof and complete this NC. Your live status will update back to Available.
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 flex-wrap pt-0.5">
                      <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                      {complaint.startedAt ? (
                        <span>
                          Started at {new Date(complaint.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span>Work active on floor</span>
                      )}
                      {(complaint.startedBy?.name || complaint.assignedTo?.name) && (
                        <span>by {complaint.startedBy?.name || complaint.assignedTo?.name}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handlePauseWork}
                      disabled={pausingWork}
                      title="Pause floor containment and return to Open status"
                      className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer"
                    >
                      {pausingWork ? 'Pausing...' : 'Pause Work'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onSubmitAction) onSubmitAction(complaint);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-rose-600/30 active:scale-95 transition-all cursor-pointer animate-pulse"
                    >
                      <span className="w-2.5 h-2.5 bg-white rounded-xs" />
                      <span>⏹ Stop Work (Complete NC)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auditor Verification Gateway Action Box */}
          {(isAuditor || isAdmin) &&
            ['CAP Submitted', 'Under Review', 'Verified', 'Under Verification'].includes(complaint.status) && (
              <div className="p-5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border-2 border-purple-200 dark:border-purple-600 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-cyan-400" />
                      Auditor Sign-Off & Verification Gateway
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {complaint.status === 'CAP Submitted' &&
                        'CAP Plan and containment submitted. Inspect root cause, actions, and evidence before starting formal review or verifying.'}
                      {complaint.status === 'Under Review' &&
                        'NC is currently under formal audit review. Inspect floor execution, verify effectiveness, or close.'}
                      {complaint.status === 'Verified' &&
                        'Non-conformance has been verified effective by QA Auditor. Grant official final closure.'}
                      {complaint.status === 'Under Verification' &&
                        'Inspect the Before vs. After photos above. Verify AQL standards are satisfied.'}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40">
                    Stage: {complaint.status}
                  </span>
                </div>

                {showRejectBox ? (
                  <div className="space-y-3 pt-2">
                    <label className="block text-xs font-bold text-rose-700 dark:text-rose-300">
                      Mandatory Rejection / Rework Reason:
                    </label>
                    <textarea
                      rows="2"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Specify why the CAP or rectification was rejected (e.g., root cause not fully addressed, evidence photo blurred, recurrence risk)..."
                      className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 rounded-xl border border-rose-300 dark:border-rose-800 text-xs focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRejectBox(false)}
                        className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => handleVerify('REJECT')}
                        className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer"
                      >
                        {verifying ? 'Rejecting...' : 'Confirm Rejection & Return for Rework'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2.5 pt-2 flex-wrap">
                    {/* Always allow returning for rework */}
                    <button
                      type="button"
                      onClick={() => setShowRejectBox(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-700 dark:hover:text-rose-300 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-300 dark:border-slate-700 transition-all active:scale-95 shadow-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                      <span>Reject / Rework</span>
                    </button>

                    {/* Stage: CAP Submitted -> Start Review */}
                    {complaint.status === 'CAP Submitted' && (
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => handleVerify('START_REVIEW')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{verifying ? 'Updating...' : 'Start Review'}</span>
                      </button>
                    )}

                    {/* Stage: CAP Submitted, Under Review, or Under Verification -> Verify Effective */}
                    {['CAP Submitted', 'Under Review', 'Under Verification'].includes(complaint.status) && (
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => handleVerify('VERIFY')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>{verifying ? 'Verifying...' : 'Verify Effective'}</span>
                      </button>
                    )}

                    {/* Stage: Under Review, Verified, or Under Verification -> Approve & Close */}
                    {['Under Review', 'Verified', 'Under Verification'].includes(complaint.status) && (
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => handleVerify('APPROVE')}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{verifying ? 'Closing...' : 'Approve & Close NC'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Section 4: In-Ticket Chronological Audit Timeline Log */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Closed-Loop NC Audit Trail & Remark Log</span>
              <span className="font-mono text-slate-500">
                {timelineList.length} Events Recorded
              </span>
            </h3>

            {/* Timeline Stream */}
            <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {timelineList.map((item, idx) => (
                <div key={idx} className="relative group">
                  {/* Dot Node */}
                  <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 dark:border-blue-500 shadow-xs" />

                  <div className="bg-slate-50/80 dark:bg-slate-950/70 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${getTimelineEventBadge(
                            item.action
                          )}`}
                        >
                          {item.action}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-slate-200">
                          {item.performedBy?.name}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                          ({item.performedBy?.role})
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {formatAbsoluteTime(item.timestamp)}
                      </span>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300 text-xs mt-1 leading-relaxed">
                      {item.notes}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Remark Form */}
            <form onSubmit={handleAddComment} className="pt-2 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Post direct auditor-supervisor remark into audit log..."
                className="flex-1 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 font-sans"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Post Remark</span>
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <div className="font-mono text-[11px]">
              Garment QMS Ref: {complaint.complaintId}
            </div>
            {(isAuditor || isAdmin) && onDeleteComplaint && (
              <button
                type="button"
                onClick={() => onDeleteComplaint(complaint)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-semibold text-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Log</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>

      {/* Full-Screen Zoom Lightbox Modal */}
      {activeZoomImage && (
        <div
          onClick={() => setActiveZoomImage(null)}
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={activeZoomImage}
            alt="Zoomed Inspection Proof"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border border-slate-700"
          />
          <button
            onClick={() => setActiveZoomImage(null)}
            className="absolute top-6 right-6 p-3 rounded-full bg-slate-900/80 text-white hover:bg-slate-800"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ComplaintDetailModal;
