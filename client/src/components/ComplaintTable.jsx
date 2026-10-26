import { Eye, Camera, CheckCheck, Play, Phone, Trash2 } from 'lucide-react';
import CountdownBadge from './CountdownBadge';
import { useAuth } from '../context/AuthContext';

const FALLBACK_BEFORE_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23fee2e2'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' font-weight='bold' fill='%23b91c1c'%3EBefore%3C/text%3E%3C/svg%3E";
const FALLBACK_AFTER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23dcfce7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' font-weight='bold' fill='%2315803d'%3EAfter%3C/text%3E%3C/svg%3E";

export const ComplaintTable = ({
  complaints,
  onViewDetails,
  onStartProgress,
  onSubmitAction,
  onDeleteComplaint,
}) => {
  const { isAuditor, isActionPerson, isAdmin, user } = useAuth();

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'text-rose-600 dark:text-rose-400 font-bold';
      case 'HIGH':
        return 'text-amber-600 dark:text-amber-400 font-semibold';
      case 'MEDIUM':
        return 'text-blue-600 dark:text-blue-400 font-medium';
      default:
        return 'text-slate-500 dark:text-slate-400';
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

  return (
    <div className="overflow-x-auto no-scrollbar sm:overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <table className="w-full min-w-[680px] text-left text-xs border-collapse">
        <thead className="bg-slate-50/90 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px] sm:text-[11px] border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">NC / CMP ID</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">Priority</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">Department & Location</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">Responsible Person</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">Deadline Condition</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold">NC Status</th>
            <th className="py-3 px-3.5 sm:py-3.5 sm:px-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
          {complaints.map((c) => {
            const assignedUserId =
              typeof c.assignedTo?.userId === 'object'
                ? c.assignedTo?.userId?._id?.toString()
                : c.assignedTo?.userId?.toString();
            const currentUserId = user?._id?.toString();
            const assignedEmpId = (c.assignedTo?.employeeId || '').toUpperCase();
            const userEmpId = (user?.employeeId || '').toUpperCase();
            const isPrivilegedAuditorOrAdmin = isAuditor || isAdmin || user?.role === 'ADMIN' || user?.role === 'AUDITOR';
            const isAssignedSupervisor = !isPrivilegedAuditorOrAdmin && isActionPerson && (
              (userEmpId && assignedEmpId && userEmpId === assignedEmpId) ||
              (currentUserId && assignedUserId && currentUserId === assignedUserId) ||
              (c.department && user?.department && c.department.toLowerCase() === user.department.toLowerCase())
            );
            const canFloorAct = isAssignedSupervisor;

            return (
              <tr
                key={c._id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                onClick={() => onViewDetails(c)}
              >
                {/* ID */}
                <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-cyan-400 whitespace-nowrap">
                  {c.complaintId}
                </td>

                {/* Priority */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className={getPriorityStyle(c.priority)}>
                    {c.priority}
                  </span>
                </td>

                {/* Category & Location */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {c.afterPhoto ? (
                      <img
                        src={c.afterPhoto}
                        alt="Solution Proof"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = FALLBACK_AFTER_IMG;
                        }}
                        className="w-8 h-8 rounded-lg object-cover border border-emerald-400 shrink-0"
                        title="Solution Photo Attached"
                      />
                    ) : c.beforePhoto ? (
                      <img
                        src={c.beforePhoto}
                        alt="Defect"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = FALLBACK_BEFORE_IMG;
                        }}
                        className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : null}
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>{c.department}</span>
                        {c.afterPhoto && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Proof
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.location}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Responsible Person */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {c.assignedTo?.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5 text-slate-400" />
                    {c.assignedTo?.mobileNumber}
                  </div>
                </td>

                {/* Live SLA Countdown */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <CountdownBadge
                    deadlineTimestamp={c.deadlineTimestamp}
                    status={c.status}
                    compact={true}
                  />
                </td>

                {/* Status */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(
                      c.status
                    )}`}
                  >
                    {c.status}
                  </span>
                </td>

                {/* Actions */}
                <td
                  className="py-3 px-4 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-2">
                    {/* Action Button for Supervisor: Start when Open/Assigned, Stop when In Progress */}
                    {canFloorAct &&
                      ['Open', 'Assigned', 'Draft', 'Rejected / Rework', 'Rejected / Sent Back'].includes(c.status) && (
                        <button
                          onClick={() => (onStartProgress ? onStartProgress(c) : onSubmitAction(c))}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Start Work (Reflects to Live Work Operations as Busy in Progress)"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Start</span>
                        </button>
                      )}

                    {canFloorAct && c.status === 'In Progress' && (
                      <button
                        onClick={() => onSubmitAction(c)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs animate-pulse transition-all active:scale-95 cursor-pointer"
                        title="Stop Work (Submit Proof & Complete NC)"
                      >
                        <span className="w-2 h-2 bg-white rounded-xs" />
                        <span>Stop</span>
                      </button>
                    )}

                    {/* Verification / Review Action for Auditor or Admin */}
                    {(isAuditor || isAdmin) &&
                      ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status) && (
                        <button
                          onClick={() => onViewDetails(c)}
                          className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1 shadow-xs animate-pulse"
                          title="Review / Verify CAP"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Review</span>
                        </button>
                      )}

                    {/* Close Action for Auditor or Admin */}
                    {(isAuditor || isAdmin) && c.status === 'Verified' && (
                      <button
                        onClick={() => onViewDetails(c)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shadow-xs"
                        title="Close NC"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Close</span>
                      </button>
                    )}

                    <button
                      onClick={() => onViewDetails(c)}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                      title="Inspect Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {(isAuditor || isAdmin) && onDeleteComplaint && (
                      <button
                        onClick={() => onDeleteComplaint(c)}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50"
                        title="Delete NC Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ComplaintTable;
