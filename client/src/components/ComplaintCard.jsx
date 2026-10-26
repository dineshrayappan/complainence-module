import React from 'react';
import {
  MapPin,
  Phone,
  Eye,
  Camera,
  Play,
  CheckCheck,
  User,
  Trash2,
  Layers,
} from 'lucide-react';
import CountdownBadge from './CountdownBadge';
import { useAuth } from '../context/AuthContext';

const FALLBACK_BEFORE_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' fill='%23fee2e2'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' font-weight='bold' fill='%23b91c1c'%3EBefore Photo%3C/text%3E%3C/svg%3E";
const FALLBACK_AFTER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' fill='%23dcfce7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' font-weight='bold' fill='%2315803d'%3EAfter Photo%3C/text%3E%3C/svg%3E";

export const ComplaintCard = ({
  complaint,
  onViewDetails,
  onStartProgress,
  onSubmitAction,
  onDeleteComplaint,
}) => {
  const { isAuditor, isActionPerson, isAdmin, user } = useAuth();

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800';
      case 'HIGH':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
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
        return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800 animate-pulse font-semibold';
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

  const assignedUserId =
    typeof complaint.assignedTo?.userId === 'object'
      ? complaint.assignedTo?.userId?._id?.toString()
      : complaint.assignedTo?.userId?.toString();
  const currentUserId = user?._id?.toString();
  const assignedEmpId = (complaint.assignedTo?.employeeId || '').toUpperCase();
  const userEmpId = (user?.employeeId || '').toUpperCase();
  const compDept = (complaint.department || '').trim().toLowerCase();
  const userDept = (user?.department || '').trim().toLowerCase();

  // Strict assignment check: Only the specifically assigned supervisor can start/stop floor work.
  // Admins and Auditors audit, oversee, and verify; they do NOT have Start Work or Stop Work buttons.
  const isPrivilegedAuditorOrAdmin = isAuditor || isAdmin || user?.role === 'ADMIN' || user?.role === 'AUDITOR';
  const isAssignedSupervisor = !isPrivilegedAuditorOrAdmin && isActionPerson && (
    (userEmpId && assignedEmpId && userEmpId === assignedEmpId) ||
    (currentUserId && assignedUserId && currentUserId === assignedUserId) ||
    (compDept && userDept && compDept === userDept)
  );
  const canActionPersonAct = isAssignedSupervisor;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between group">
      <div>
        {/* Card Top Row: CMP ID, Priority & Countdown */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-2.5 sm:mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-cyan-400 border border-slate-200 dark:border-slate-800">
              NC: {complaint.complaintId}
            </span>
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getPriorityBadge(
                complaint.priority
              )}`}
            >
              {complaint.priority}
            </span>
            {complaint.capRequired && (
              <span
                title="Structured Corrective & Preventive Action (CAP) Required"
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/80 dark:text-cyan-300 dark:border-indigo-800 flex items-center gap-1"
              >
                <Layers className="w-2.5 h-2.5 text-indigo-600 dark:text-cyan-400" />
                CAP
              </span>
            )}
          </div>

          <CountdownBadge
            deadlineTimestamp={complaint.deadlineTimestamp}
            status={complaint.status}
          />
        </div>

        {/* Defect Category & Status */}
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-sans group-hover:text-indigo-600 dark:group-hover:text-blue-400 transition-colors truncate pr-2">
            {complaint.category}
          </h3>
          <span
            className={`text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full border shrink-0 ${getStatusBadge(
              complaint.status
            )}`}
          >
            {complaint.status}
          </span>
        </div>

        {/* Machine Location & Department */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium mb-2.5 sm:mb-3 truncate">
          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate">{complaint.location}</span>
          <span>•</span>
          <span className="truncate">{complaint.department}</span>
        </div>

        {/* Description Snippet */}
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3 sm:mb-4 leading-relaxed bg-slate-50/80 dark:bg-slate-950/60 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
          {complaint.findingDescription || complaint.description}
        </p>

        {/* Solution Details & Proof (Visible once submitted, reviewed, verified, or closed) */}
        {(complaint.afterPhoto ||
          complaint.actionNotes ||
          complaint.feedbackRemarks ||
          complaint.capPlan?.immediateCorrection ||
          complaint.capPlan?.correctiveAction ||
          ['CAP Submitted', 'Under Review', 'Verified', 'Closed', 'Under Verification'].includes(complaint.status)) && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs">
            <div className="flex items-center justify-between font-bold text-emerald-800 dark:text-emerald-300 text-[11px] mb-1">
              <span className="flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Solution & CAP Details:
              </span>
              {complaint.actualCompletedAt && (
                <span className="text-[10px] font-mono text-emerald-700/80 dark:text-emerald-400/80">
                  {new Date(complaint.actualCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {complaint.actionNotes && (
              <p className="text-slate-800 dark:text-slate-100 text-[11px] line-clamp-2 leading-relaxed">
                <strong className="text-slate-900 dark:text-white font-semibold">Action Taken: </strong>
                {complaint.actionNotes}
              </p>
            )}
            {complaint.capPlan?.immediateCorrection && (
              <p className="text-slate-700 dark:text-slate-200 text-[11px] line-clamp-1 mt-0.5">
                <strong className="font-semibold text-slate-800 dark:text-white">Correction: </strong>
                {complaint.capPlan.immediateCorrection}
              </p>
            )}
            {complaint.feedbackRemarks && (
              <p className="text-slate-600 dark:text-slate-300 text-[10px] mt-1 line-clamp-1 italic">
                <strong className="not-italic font-semibold text-slate-700 dark:text-slate-200">Root Cause: </strong>
                {complaint.feedbackRemarks}
              </p>
            )}
          </div>
        )}

        {/* Proof Images preview row */}
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          {/* Before Photo */}
          <div
            onClick={() => onViewDetails(complaint)}
            className="relative cursor-pointer group/img shrink-0"
          >
            <img
              src={complaint.beforePhoto}
              alt="Before Defect Proof"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = FALLBACK_BEFORE_IMG;
              }}
              className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700 group-hover/img:border-indigo-500 transition-all shadow-xs"
            />
            <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-slate-900/90 text-[8px] font-bold text-rose-300 rounded">
              BEFORE
            </span>
          </div>

          {/* After Photo (or Placeholder) */}
          {complaint.afterPhoto ? (
            <div
              onClick={() => onViewDetails(complaint)}
              className="relative cursor-pointer group/img shrink-0"
            >
              <img
                src={complaint.afterPhoto}
                alt="After Resolution Proof"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = FALLBACK_AFTER_IMG;
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-xl border border-emerald-300 dark:border-emerald-600 group-hover/img:border-emerald-500 transition-all shadow-xs"
              />
              <span className="absolute bottom-1 left-1 px-1 py-0.2 bg-slate-900/90 text-[8px] font-bold text-emerald-300 rounded">
                AFTER
              </span>
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 text-[9px] sm:text-[10px] text-center p-1 shrink-0">
              <Camera className="w-3.5 h-3.5 mb-0.5" />
              <span>Pending</span>
            </div>
          )}

          {/* Line Supervisor Avatar & Info */}
          <div className="ml-auto text-right text-xs min-w-0">
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">
              Responsible Person
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px] sm:max-w-[140px]">
              {complaint.assignedTo?.name}
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-[11px] font-mono flex items-center justify-end gap-1 mt-0.5 truncate">
              <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span className="truncate">{complaint.assignedTo?.mobileNumber}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions Bar */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
        <button
          onClick={() => onViewDetails(complaint)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
        >
          <Eye className="w-3.5 h-3.5 text-slate-500" />
          <span>Inspect NC</span>
        </button>

        {/* Action Button for Supervisor: Start Work when Open/Assigned, Stop Work when In Progress */}
        {canActionPersonAct &&
          ['Open', 'Assigned', 'Draft', 'Rejected / Rework', 'Rejected / Sent Back'].includes(
            complaint.status
          ) && (
            <button
              onClick={() => (onStartProgress ? onStartProgress(complaint) : onSubmitAction(complaint))}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Start Work (Reflects to Live Work Operations as Busy in Progress)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Work</span>
            </button>
          )}

        {canActionPersonAct && complaint.status === 'In Progress' && (
          <button
            onClick={() => onSubmitAction(complaint)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 animate-pulse cursor-pointer"
            title="Stop Work (Submit Proof & Complete NC)"
          >
            <span className="w-2.5 h-2.5 bg-white rounded-xs" />
            <span>Stop Work</span>
          </button>
        )}

        {/* Verification / Review Action for Auditor or Admin */}
        {(isAuditor || isAdmin) &&
          ['CAP Submitted', 'Under Review', 'Under Verification'].includes(complaint.status) && (
            <button
              onClick={() => onViewDetails(complaint)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-all animate-pulse active:scale-95"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Review / Verify</span>
            </button>
          )}

        {/* Final Closure Action for Auditor or Admin */}
        {(isAuditor || isAdmin) && complaint.status === 'Verified' && (
          <button
            onClick={() => onViewDetails(complaint)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Close NC</span>
          </button>
        )}

        {/* Delete Action for Auditor or Admin */}
        {(isAuditor || isAdmin) && onDeleteComplaint && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteComplaint(complaint);
            }}
            title="Delete NC Record"
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 transition-colors shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ComplaintCard;
