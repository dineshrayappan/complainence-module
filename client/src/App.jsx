import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LayoutGrid,
  List,
  PlusCircle,
  CheckCircle2,
  Factory,
  CheckCheck,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { complaintService, taskService } from './services/api';
import { supabase } from './services/supabase';
import Header from './components/Header';
import KpiMetrics from './components/KpiMetrics';
import ComplaintFilters from './components/ComplaintFilters';
import ComplaintCard from './components/ComplaintCard';
import ComplaintTable from './components/ComplaintTable';
import NewComplaintModal from './components/NewComplaintModal';
import ActionTakenModal from './components/ActionTakenModal';
import ComplaintDetailModal from './components/ComplaintDetailModal';
import LoginPage from './components/LoginPage';
import AdminOversightDashboard from './components/AdminOversightDashboard';
import AdminUserManagement from './components/AdminUserManagement';
import DepartmentComplianceDashboard from './components/DepartmentComplianceDashboard';
import SidebarNavigation from './components/SidebarNavigation';
import FactoryComplianceHome from './components/FactoryComplianceHome';
import RequirementsComplianceView from './components/RequirementsComplianceView';
import ReportsView from './components/ReportsView';
import AuditManagementDashboard from './components/AuditManagementDashboard';
import MyTasksPanel from './components/MyTasksPanel';
import { Crown, BarChart3, Users, Building2, Flame, CheckSquare, Search, Filter } from 'lucide-react';

// Safe localStorage caching helper namespaced by user to prevent QuotaExceededError and cross-account data leaks
const getCacheKey = (user) => `garment_qms_cached_complaints_${user?.employeeId || user?.id || user?._id || 'guest'}`;

const safePersistCache = (items, user) => {
  if (!user) return;
  try {
    const key = getCacheKey(user);
    const list = (items || []).slice(0, 30);
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (quotaErr) {
      // If quota exceeded, retain records without heavy base64 strings (never corrupt with broken prefixes)
      const lean = list.slice(0, 20).map((item) => {
        const isBeforeBase64 = item.beforePhoto?.startsWith('data:image/');
        const isAfterBase64 = item.afterPhoto?.startsWith('data:image/');
        return {
          ...item,
          beforePhoto: isBeforeBase64 ? null : item.beforePhoto,
          afterPhoto: isAfterBase64 ? null : item.afterPhoto,
        };
      });
      localStorage.setItem(key, JSON.stringify(lean));
    }
  } catch (err) {
    console.warn('Could not persist complaints cache:', err);
  }
};

export const App = () => {
  const { user, isAdmin, isAuditor, isActionPerson } = useAuth();

  // Data State with user-scoped hydration to keep supervisor tasks & photos visible across logins
  const [complaints, setComplaints] = useState(() => {
    try {
      // Clear legacy non-namespaced cache to prevent cross-account pollution
      localStorage.removeItem('garment_qms_cached_complaints');
      if (user) {
        const cached = localStorage.getItem(getCacheKey(user));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) { }
    return [];
  });
  const [metrics, setMetrics] = useState(null);
  const [taskCounts, setTaskCounts] = useState({ overdue: 0, dueToday: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Navigation & Sidebar States
  const [currentNavSection, setCurrentNavSection] = useState('dashboard'); // 'dashboard', 'tasks', 'audits', 'nc', 'cap', 'departments', 'requirements', 'reports', 'settings'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Filter States
  const [activeTab, setActiveTab] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState(''); // '' (all), 'Overdue', 'Due Soon', 'Open', 'Closed'
  const [adminActiveTab, setAdminActiveTab] = useState('departments'); // 'departments', 'oversight', 'users', 'register'
  const [showDeptCompliance, setShowDeptCompliance] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'

  // Modal States
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [ncPrefillData, setNcPrefillData] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Prevent jarring full-screen loading spinner on background updates / tab changes
  const initialLoadedRef = useRef(false);

  // Load complaints and metrics with silent background refresh capability (avoids UI glitch/flicker)
  const loadData = useCallback(async (showSpinner = false, isManual = false) => {
    if (!user) return;
    const isExplicitSpinner = showSpinner === true;
    try {
      if (isExplicitSpinner && !initialLoadedRef.current) {
        setLoading(true);
      } else if (isManual) {
        setIsRefreshing(true);
      }

      const params = {
        deadlineCondition: deadlineFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        search: searchTerm || undefined,
      };

      const [complaintsRes, metricsRes] = await Promise.all([
        complaintService.getComplaints(params),
        complaintService.getKpiStats(),
      ]);

      if (complaintsRes.data?.success) {
        const incoming = complaintsRes.data.complaints || [];
        setComplaints((prev) => {
          const incomingIds = new Set(
            incoming.map((c) => String(c._id || c.id || c.complaintId))
          );
          // Protect any recently created optimistic ticket that might still be propagating to database
          const optimisticPending = prev.filter(
            (c) => c._isOptimistic && !incomingIds.has(String(c._id || c.id || c.complaintId))
          );
          const combined = [...optimisticPending, ...incoming];
          safePersistCache(combined, user);
          return combined;
        });
      }

      if (metricsRes.data?.success) {
        setMetrics(metricsRes.data.metrics);
      }
    } catch (err) {
      console.error('Error fetching complaints data:', err);
    } finally {
      initialLoadedRef.current = true;
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [user, deadlineFilter, categoryFilter, priorityFilter, searchTerm]);

  // Load records on initial component mount or page refresh
  useEffect(() => {
    loadData(!initialLoadedRef.current, false);
  }, [loadData]);

  // Sidebar badge for My Tasks. Deliberately separate from loadData so that
  // changing complaint filters does not re-issue the task request.
  useEffect(() => {
    if (!user) return;
    let active = true;
    taskService
      .getTasks()
      .then((res) => {
        if (active && res.data?.success && res.data.counts) {
          setTaskCounts(res.data.counts);
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [user]);

  // Handle Start Progress (Line Supervisor)
  const handleStartProgress = async (complaint) => {
    try {
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.markInProgress(targetId);
      if (res.data?.success) {
        showToast(`NC ${complaint.complaintId} marked In Progress`);
        const updatedTicket = res.data.complaint || { ...complaint, status: 'In Progress' };
        setComplaints((prev) =>
          prev.map((c) =>
            (c._id || c.id) === (complaint._id || complaint.id) || c.complaintId === complaint.complaintId
              ? updatedTicket
              : c
          )
        );
        loadData(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  // Open Action modal
  const handleOpenActionModal = (complaint) => {
    setSelectedComplaint(complaint);
    setIsActionModalOpen(true);
  };

  // Open Detail modal: Display immediately for fast UX, and fetch fresh details in background
  const handleOpenDetailModal = async (complaintOrId) => {
    if (!complaintOrId) return;

    let targetId = '';
    let initialObj = null;

    if (typeof complaintOrId === 'object') {
      targetId = complaintOrId._id || complaintOrId.id || complaintOrId.complaintId;
      initialObj = complaintOrId;
    } else {
      targetId = complaintOrId;
      initialObj = complaints.find(
        (c) => (c._id || c.id) === targetId || c.complaintId === targetId
      );
    }

    if (initialObj) {
      setSelectedComplaint(initialObj);
      setIsDetailModalOpen(true);
    }

    // Always fetch latest authoritative data (timeline remarks, reworked photos, actions) from backend
    if (targetId) {
      try {
        const res = await complaintService.getComplaintById(targetId);
        if (res.data?.success && res.data.complaint) {
          const fresh = res.data.complaint;
          setSelectedComplaint(fresh);
          if (!initialObj) {
            setIsDetailModalOpen(true);
          }
          setComplaints((prev) =>
            prev.map((c) =>
              (c._id || c.id) === (fresh._id || fresh.id) || c.complaintId === fresh.complaintId
                ? fresh
                : c
            )
          );
        }
      } catch (err) {
        console.warn('Could not fetch background fresh complaint details:', err);
      }
    }
  };

  // On ticket created: Optimistic instant display + reset filters
  const handleNewComplaintSuccess = (newTicket) => {
    showToast(`Audit Defect (NC ${newTicket?.complaintId || ''}) logged and saved successfully!`);

    // Reset filters so the new ticket is immediately visible
    setCategoryFilter('');
    setPriorityFilter('');
    setSearchTerm('');
    setActiveTab('all');

    if (newTicket) {
      const ticketId = newTicket._id || newTicket.id;
      const optimisticTicket = { ...newTicket, _isOptimistic: true };
      setComplaints((prev) => {
        const withoutCurrent = prev.filter(
          (c) => (c._id || c.id) !== ticketId && c.complaintId !== newTicket.complaintId
        );
        const nextList = [optimisticTicket, ...withoutCurrent];
        safePersistCache(nextList, user);
        return nextList;
      });
    }

    // Refresh KPI metrics and fetch fresh complaints from server immediately
    loadData(false);
  };

  // Delete defect log (Auditor & Admin)
  const handleDeleteComplaint = async (complaint) => {
    if (!complaint) return;
    const cid = complaint.complaintId || complaint._id || complaint.id;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete defect log [${cid}]? This will remove all associated rework photos and records.`
    );
    if (!confirmDelete) return;

    try {
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.deleteComplaint(targetId);
      if (res.data?.success) {
        showToast(`NC ${cid} deleted successfully.`);
        setComplaints((prev) => {
          const filtered = prev.filter(
            (c) =>
              (c._id || c.id) !== targetId &&
              c.complaintId !== cid &&
              c.complaintId !== complaint.complaintId
          );
          safePersistCache(filtered, user);
          return filtered;
        });

        if (
          selectedComplaint &&
          ((selectedComplaint._id || selectedComplaint.id) === targetId ||
            selectedComplaint.complaintId === cid)
        ) {
          setIsDetailModalOpen(false);
          setSelectedComplaint(null);
        }

        loadData(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete NC record.');
    }
  };

  // On action submitted: Optimistic update + silent refresh
  const handleActionSuccess = (updatedTicket) => {
    showToast(`Proof for NC ${updatedTicket?.complaintId || ''} submitted for Audit Verification!`);
    setActiveTab('all');
    if (updatedTicket) {
      const ticketId = updatedTicket._id || updatedTicket.id;
      setComplaints((prev) =>
        prev.map((c) =>
          (c._id || c.id) === ticketId || c.complaintId === updatedTicket.complaintId
            ? { ...c, ...updatedTicket }
            : c
        )
      );
      if (
        selectedComplaint &&
        ((selectedComplaint._id || selectedComplaint.id) === ticketId ||
          selectedComplaint.complaintId === updatedTicket.complaintId)
      ) {
        setSelectedComplaint(updatedTicket);
      }
    }
    loadData(false);
  };

  // On ticket update from detail modal
  const handleComplaintUpdated = (updatedTicket) => {
    if (updatedTicket) {
      const ticketId = updatedTicket._id || updatedTicket.id;
      setSelectedComplaint(updatedTicket);
      setComplaints((prev) =>
        prev.map((c) =>
          (c._id || c.id) === ticketId || c.complaintId === updatedTicket.complaintId
            ? { ...c, ...updatedTicket }
            : c
        )
      );
      showToast(`NC ${updatedTicket.complaintId} updated successfully.`);
    }
    loadData(false);
  };

  // Open NC modal with optional prefill data (called from AuditManagementDashboard checklist)
  const handleOpenNewComplaintWithPrefill = (prefill) => {
    setNcPrefillData(prefill || null);
    setIsNewModalOpen(true);
  };

  // Quick drill-down from Department Compliance Dashboard directly into filtered Defect Register
  const handleDrilldownDepartment = (deptName) => {
    setSearchTerm(deptName);
    setActiveTab('all');
    setDeadlineFilter('');
    setCategoryFilter('');
    setPriorityFilter('');
    setCurrentNavSection('nc');
    if (isAdmin) {
      setAdminActiveTab('register');
    } else {
      setShowDeptCompliance(false);
    }
    showToast(`Filtered NC register for ${deptName} department.`);
  };

  // Derived real-time counts from loaded complaints (always 100% accurate, no flickering)
  const derivedCounts = useMemo(() => {
    const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR';
    const userEmpId = (user?.employeeId || '').toUpperCase();
    const userId = String(user?.id || user?._id || '');

    const userComplaints = isSupervisor
      ? complaints.filter((c) => {
        const cEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const cUser = String(c.assignedTo?.userId || '');
        return (cEmp && cEmp === userEmpId) || (cUser && cUser === userId);
      })
      : complaints;

    const now = Date.now();
    return {
      total: userComplaints.length,
      open: userComplaints.filter((c) => ['Open', 'Assigned', 'In Progress'].includes(c.status)).length,
      capSubmitted: userComplaints.filter((c) => c.status === 'CAP Submitted').length,
      underReview: userComplaints.filter((c) => ['Under Review', 'Under Verification'].includes(c.status)).length,
      rejectedRework: userComplaints.filter((c) => ['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)).length,
      verified: userComplaints.filter((c) => c.status === 'Verified').length,
      closed: userComplaints.filter((c) => c.status === 'Closed').length,
      draft: userComplaints.filter((c) => c.status === 'Draft').length,
      overdueCount: userComplaints.filter((c) => c.status !== 'Closed' && c.status !== 'Verified' && new Date(c.deadlineTimestamp).getTime() < now).length,
      dueSoonCount: userComplaints.filter((c) => {
        if (c.status === 'Closed' || c.status === 'Verified') return false;
        const diff = new Date(c.deadlineTimestamp).getTime() - now;
        return diff >= 0 && diff <= 4 * 3600 * 1000;
      }).length,
      openDeadlineCount: userComplaints.filter((c) => {
        if (c.status === 'Closed' || c.status === 'Verified') return false;
        const diff = new Date(c.deadlineTimestamp).getTime() - now;
        return diff > 4 * 3600 * 1000;
      }).length,
      closedDeadlineCount: userComplaints.filter((c) => c.status === 'Closed' || c.status === 'Verified').length,
    };
  }, [complaints, user]);

  // Instant client-side filtering for smooth tab switches and deadline filtering
  const displayedComplaints = useMemo(() => {
    const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR';
    const userEmpId = (user?.employeeId || '').toUpperCase();
    const userId = String(user?.id || user?._id || '');

    return complaints.filter((c) => {
      // 0. Strict Personal Assignment Isolation for Supervisor
      if (isSupervisor) {
        const cEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const cUser = String(c.assignedTo?.userId || '');
        if ((!cEmp || cEmp !== userEmpId) && (!cUser || cUser !== userId)) {
          return false;
        }
      }

      // 1. Tab workflow status filter
      if (activeTab === 'draft' && c.status !== 'Draft') return false;
      if (activeTab === 'open' && !['Open', 'Assigned', 'In Progress'].includes(c.status)) return false;
      if (activeTab === 'cap-submitted' && c.status !== 'CAP Submitted') return false;
      if (activeTab === 'under-review' && !['Under Review', 'Under Verification'].includes(c.status)) return false;
      if (activeTab === 'rejected-rework' && !['Rejected / Rework', 'Rejected / Sent Back'].includes(c.status)) return false;
      if (activeTab === 'verified' && !['Verified', 'Under Verification'].includes(c.status)) return false;
      if (activeTab === 'closed' && c.status !== 'Closed') return false;

      // 2. Separate Deadline Condition filter
      if (deadlineFilter) {
        const cond =
          c.deadlineCondition ||
          (c.status === 'Closed'
            ? 'Closed'
            : Date.now() > new Date(c.deadlineTimestamp).getTime()
              ? 'Overdue'
              : 'Open');
        if (deadlineFilter === 'Due Soon') {
          const diffMs = new Date(c.deadlineTimestamp).getTime() - Date.now();
          const isDueSoon = diffMs > 0 && diffMs <= 4 * 60 * 60 * 1000 && c.status !== 'Closed';
          if (!isDueSoon) return false;
        } else if (cond.toLowerCase() !== deadlineFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [complaints, activeTab, deadlineFilter, user]);

  // Render dedicated Login Page when not authenticated
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white dark:bg-emerald-600 dark:text-white font-bold text-xs shadow-xl animate-bounce">
          <CheckCheck className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <Header
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onOpenNewComplaint={() => setIsNewModalOpen(true)}
        onRefresh={() => loadData(false, true)}
        isRefreshing={isRefreshing}
        overdueCount={derivedCounts.overdueCount ?? 0}
        onSelectOverdue={() => {
          setCurrentNavSection('nc');
          setDeadlineFilter('Overdue');
        }}
      />

      {/* Two-Column App Shell Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Left Sidebar Navigation */}
        <SidebarNavigation
          currentSection={currentNavSection}
          onSelectSection={(sec) => {
            setCurrentNavSection(sec);
            if (sec === 'tasks') {
              setActiveTab('open');
            } else if (sec === 'cap') {
              setActiveTab('cap-submitted');
            } else if (sec === 'nc') {
              setActiveTab('all');
            }
          }}
          counts={{
            openNC: derivedCounts.open ?? 0,
            overdueNC: derivedCounts.overdueCount ?? 0,
            audits: metrics?.totalAudits ?? 0,
            tasks: complaints.filter((c) => ['Open', 'Assigned', 'In Progress', 'Rejected / Rework'].includes(c.status)).length,
            myTasks: (taskCounts.overdue + taskCounts.dueToday) || 0,
            cap: (derivedCounts.capSubmitted || 0) + (derivedCounts.underReview || 0),
            deptCount: (metrics?.departments || []).length || 0,
          }}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
          {/* Active Persona Banner */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs mb-4 shadow-xs transition-colors">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-xs" />
              <span className="text-slate-600 dark:text-slate-300 truncate">
                Active Persona:{' '}
                <strong className="text-slate-900 dark:text-white font-bold">{user?.name}</strong>{' '}
                <span className="text-indigo-600 dark:text-cyan-400 font-mono font-semibold">({user?.employeeId}</span> •{' '}
                <span className="text-slate-500 dark:text-slate-400">{user?.department})</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
              <span>
                Scope:{' '}
                <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                  {isAdmin
                    ? 'Executive Oversight'
                    : isAuditor
                      ? 'All 4 Plant Lines'
                      : user?.department}
                </strong>
              </span>
              <span>•</span>
              <span>12–24h SLA</span>
              {currentNavSection !== 'dashboard' && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setCurrentNavSection('dashboard')}
                    className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase transition-colors bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800/60 cursor-pointer"
                  >
                    ← Factory Overview
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Main View Switcher driven by Sidebar */}
          {currentNavSection === 'dashboard' ? (
            <FactoryComplianceHome
              onNavigateSection={(sec) => setCurrentNavSection(sec)}
              onDrilldownDepartment={handleDrilldownDepartment}
              onOpenNewComplaint={() => setIsNewModalOpen(true)}
            />
          ) : currentNavSection === 'my-tasks' ? (
            <MyTasksPanel />
          ) : currentNavSection === 'departments' ? (
            <DepartmentComplianceDashboard
              onSelectDepartment={handleDrilldownDepartment}
              onClose={() => setCurrentNavSection('dashboard')}
            />
          ) : currentNavSection === 'requirements' ? (
            <RequirementsComplianceView
              onSelectRequirement={(clause) => {
                setSearchTerm(clause);
                setCurrentNavSection('nc');
              }}
            />
          ) : currentNavSection === 'reports' ? (
            <ReportsView complaints={complaints} />
          ) : currentNavSection === 'settings' ? (
            isAdmin ? (
              <AdminUserManagement />
            ) : null
          ) : currentNavSection === 'audits' ? (
            <AuditManagementDashboard
              onOpenNewComplaint={handleOpenNewComplaintWithPrefill}
              onSelectNCFilter={(filter) => {
                setActiveTab(filter);
                setCurrentNavSection('nc');
              }}
            />
          ) : (
            /* NC Register / Tasks / Audits / CAP */
            <>
              {/* Optional Section Guidance Banner */}
              {currentNavSection === 'tasks' && (
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                    <span className="font-bold text-indigo-950 dark:text-indigo-200">
                      My Line Tasks & Assigned Corrective Actions
                    </span>
                  </div>
                  <span className="text-slate-500 font-mono text-[11px]">
                    Displaying active defects needing floor rectification
                  </span>
                </div>
              )}

              {currentNavSection === 'audits' && (
                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-bold text-purple-950 dark:text-purple-200">
                      Audit Inspection Findings & Defect Rounds
                    </span>
                  </div>
                  {isAuditor && (
                    <button
                      type="button"
                      onClick={() => setIsNewModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 cursor-pointer"
                    >
                      + Log New Audit NC
                    </button>
                  )}
                </div>
              )}

              {currentNavSection === 'cap' && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="font-bold text-emerald-950 dark:text-emerald-200 block">
                        Closed-Loop Corrective & Preventive Action (CAP) Management
                      </span>
                      <span className="text-[11px] text-slate-500">
                        8-Part Standard: Immediate Correction • Root Cause • Corrective Action • Preventive Action • Evidence • Verification
                      </span>
                    </div>
                  </div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                    100% Floor Verification Required
                  </span>
                </div>
              )}

              {/* KPI Metric Cards */}
              <KpiMetrics metrics={metrics} onSelectTab={(tab) => setActiveTab(tab)} />

              {/* Filters & Search Navigation */}
              <ComplaintFilters
                activeTab={activeTab}
                onTabChange={setActiveTab}
                deadlineFilter={deadlineFilter}
                onDeadlineFilterChange={setDeadlineFilter}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                onRefresh={() => loadData(false, true)}
                loading={isRefreshing}
                counts={derivedCounts}
              />

              {/* View Mode Bar */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Showing{' '}
                  <span className="text-slate-900 dark:text-white font-bold">{displayedComplaints.length}</span>{' '}
                  NC Defects
                </div>

                <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <button
                    onClick={() => setViewMode('cards')}
                    title="Card Grid View"
                    className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${viewMode === 'cards'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    title="Dense Table View"
                    className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${viewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Complaints Presentation */}
              {loading ? (
                <div className="p-16 text-center text-slate-400 dark:text-slate-500 font-mono text-xs flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-3" />
                  <span>Scanning Factory Floor for NC Defects...</span>
                </div>
              ) : displayedComplaints.length === 0 ? (
                <div className="p-16 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 text-center flex flex-col items-center justify-center my-6 shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    Zero Active NC Defects Found
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-5 leading-relaxed">
                    No Non-Conformance (NC) tickets match the current filter. All production lines are operating within AQL 1.5 quality standards.
                  </p>
                  {isAuditor && (
                    <button
                      onClick={() => setIsNewModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Log Audit Defect (NC)</span>
                    </button>
                  )}
                </div>
              ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedComplaints.map((c) => (
                    <ComplaintCard
                      key={c._id || c.id || c.complaintId}
                      complaint={c}
                      onViewDetails={handleOpenDetailModal}
                      onStartProgress={handleStartProgress}
                      onSubmitAction={handleOpenActionModal}
                      onDeleteComplaint={handleDeleteComplaint}
                    />
                  ))}
                </div>
              ) : (
                <ComplaintTable
                  complaints={displayedComplaints}
                  onViewDetails={handleOpenDetailModal}
                  onStartProgress={handleStartProgress}
                  onSubmitAction={handleOpenActionModal}
                  onDeleteComplaint={handleDeleteComplaint}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <NewComplaintModal
        isOpen={isNewModalOpen}
        onClose={() => { setIsNewModalOpen(false); setNcPrefillData(null); }}
        onSuccess={handleNewComplaintSuccess}
        prefillData={ncPrefillData}
      />

      <ActionTakenModal
        complaint={selectedComplaint}
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        onSuccess={handleActionSuccess}
      />

      <ComplaintDetailModal
        complaint={selectedComplaint}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateComplaint={handleComplaintUpdated}
        onStartProgress={handleStartProgress}
        onSubmitAction={handleOpenActionModal}
        onDeleteComplaint={handleDeleteComplaint}
      />
    </div>
  );
};

export default App;
