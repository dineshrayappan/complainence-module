import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useUnit } from './context/UnitContext';
import { complaintService } from './services/api';
import Header from './components/Header';
import SidebarNavigation from './components/SidebarNavigation';
import NewComplaintModal from './components/NewComplaintModal';
import ActionTakenModal from './components/ActionTakenModal';
import ComplaintDetailModal from './components/ComplaintDetailModal';
import LoginPage from './components/LoginPage';
import PublicRaiseComplaintPage from './pages/PublicRaiseComplaintPage';

// Routed Pages
import ProtectedRoute from './pages/ProtectedRoute';
import RoleBasedIndexRedirect from './pages/RoleBasedIndexRedirect';
import DashboardPage from './pages/DashboardPage';
import NcCapPage from './pages/NcCapPage';
import WorkOperationsPage from './pages/WorkOperationsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import RequirementsPage from './pages/RequirementsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { useCompany } from './context/CompanyContext';
import CompanyWorkspaceRoute from './components/CompanyWorkspaceRoute';

// Safe storage caching helper namespaced by user to prevent QuotaExceededError and cross-account data leaks
const getCacheKey = (user) => `garment_qms_cached_complaints_${user?.employeeId || user?.id || user?._id || 'guest'}`;

const safePersistCache = (items, user) => {
  if (!user || !Array.isArray(items)) return;
  try {
    const key = getCacheKey(user);
    // Strip all heavy photos, attachments, proof images, and large binary fields
    // to strictly preserve storage quota and completely prevent QuotaExceededError
    const lean = items.slice(0, 20).map((item) => ({
      _id: item._id || item.id,
      id: item.id || item._id,
      complaintId: item.complaintId,
      department: item.department,
      status: item.status,
      severity: item.severity || item.riskSeverity,
      priority: item.priority,
      title: item.title,
      description: item.description ? String(item.description).substring(0, 120) : '',
      stage: item.stage,
      createdAt: item.createdAt,
      unitId: item.unitId || 'UNIT-1',
    }));

    try {
      sessionStorage.setItem(key, JSON.stringify(lean));
    } catch (_) {}

    // Clean up bloated legacy localStorage entries to immediately free browser quota
    try {
      localStorage.removeItem(key);
      localStorage.removeItem('garment_qms_cached_complaints');
    } catch (_) {}
  } catch (_) {
    // Silently suppress quota warnings
  }
};

/**
 * Main Application Shell Layout
 * Houses Header, SidebarNavigation, User Banner, Notification Toasts,
 * Shared Modals, and the routed content via <Outlet />.
 */
export const AppLayout = () => {
  const { user, isAdmin, isAuditor } = useAuth();
  const { units, activeUnitId, activeUnit, switchUnit, refreshUnits, isCompanyAdmin, unassignedCounts } = useUnit();
  const { basePath, companyName } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();

  // Data State with user-scoped hydration
  const [complaints, setComplaints] = useState(() => {
    try {
      if (typeof window !== 'undefined' && user) {
        const key = getCacheKey(user);
        const cached = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) { }
    return [];
  });
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Modal States
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [ncPrefillData, setNcPrefillData] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const initialLoadedRef = useRef(false);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Fetch complaints and metrics
  const loadData = useCallback(async (showSpinner = false, isManual = false) => {
    if (!user) return;
    try {
      if (showSpinner && !initialLoadedRef.current) {
        setLoading(true);
      } else if (isManual) {
        setIsRefreshing(true);
      }

      const [complaintsRes, metricsRes] = await Promise.all([
        complaintService.getComplaints({ includeDeleted: 'true' }),
        complaintService.getKpiStats(),
      ]);

      if (complaintsRes.data?.success) {
        const incoming = complaintsRes.data.complaints || [];
        setComplaints((prev) => {
          const incomingIds = new Set(
            incoming.map((c) => String(c._id || c.id || c.complaintId))
          );
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
  }, [user, activeUnitId]);

  useEffect(() => {
    loadData(!initialLoadedRef.current, false);
  }, [loadData]);

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
        if (
          selectedComplaint &&
          ((selectedComplaint._id || selectedComplaint.id) === (complaint._id || complaint.id) ||
            selectedComplaint.complaintId === complaint.complaintId)
        ) {
          setSelectedComplaint(updatedTicket);
        }
        loadData(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleOpenActionModal = (complaint) => {
    setSelectedComplaint(complaint);
    setIsActionModalOpen(true);
  };

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

  const handleNewComplaintSuccess = (newTicket) => {
    showToast(`Non-Conformance (NC ${newTicket?.complaintId || ''}) logged and saved successfully!`);

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

    loadData(false);
  };

  const handleDeleteComplaint = async (complaint) => {
    if (!complaint) return;
    const cid = complaint.complaintId || complaint._id || complaint.id;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete non-conformance [${cid}]? The record will be archived and permanently preserved in compliance audit reports.`
    );
    if (!confirmDelete) return;

    try {
      const targetId = complaint._id || complaint.id || complaint.complaintId;
      const res = await complaintService.deleteComplaint(targetId);
      if (res.data?.success) {
        showToast(`NC ${cid} archived successfully. Record preserved in Reports.`);
        setComplaints((prev) => {
          const updated = prev.map((c) => {
            if (
              (c._id || c.id) === targetId ||
              c.complaintId === cid ||
              c.complaintId === complaint.complaintId
            ) {
              return {
                ...c,
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                deletedBy: {
                  name: user?.name || 'Administrator',
                  employeeId: user?.employeeId || 'ADMIN',
                  role: user?.role || 'ADMIN',
                },
              };
            }
            return c;
          });
          safePersistCache(updated, user);
          return updated;
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

  const handleActionSuccess = (updatedTicket) => {
    showToast(`Proof for NC ${updatedTicket?.complaintId || ''} submitted for Verification!`);
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

  const handleOpenNewComplaintWithPrefill = (prefill) => {
    setNcPrefillData(prefill || null);
    setIsNewModalOpen(true);
  };

  // Derived real-time counts from complaints (Active tickets only for workflow badges)
  const derivedCounts = useMemo(() => {
    const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR';
    const userEmpId = (user?.employeeId || '').toUpperCase();
    const userId = String(user?.id || user?._id || '');

    const activeList = complaints.filter((c) => !c.isDeleted);
    const userComplaints = isSupervisor
      ? activeList.filter((c) => {
        const cEmp = (c.assignedTo?.employeeId || '').toUpperCase();
        const cUser = String(c.assignedTo?.userId || '');
        return (cEmp && cEmp === userEmpId) || (cUser && cUser === userId);
      })
      : activeList;

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

  const isAtDashboard =
    location.pathname === `${basePath}/dashboard` ||
    location.pathname === basePath ||
    location.pathname === `${basePath}/` ||
    location.pathname === '/compliance/dashboard' ||
    location.pathname === '/compliance' ||
    location.pathname === '/compliance/';

  // Outlet context payload shared with all routed pages
  const outletContextValue = {
    complaints,
    metrics,
    loading,
    isRefreshing,
    loadData,
    derivedCounts,
    handleOpenDetailModal,
    handleOpenActionModal,
    handleStartProgress,
    handleDeleteComplaint,
    handleOpenNewComplaintWithPrefill,
    setIsNewModalOpen,
    showToast,
    // Multi-Unit Architecture Context
    units,
    activeUnitId,
    activeUnit,
    switchUnit,
    refreshUnits,
    isCompanyAdmin,
    unassignedCounts,
  };

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
        onSelectOverdue={() => navigate(`${basePath}/nc-cap?deadline=Overdue`)}
      />

      {/* Two-Column App Shell Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Left Sidebar Navigation */}
        <SidebarNavigation
          counts={{
            openNC: derivedCounts.open ?? 0,
            overdueNC: derivedCounts.overdueCount ?? 0,
            tasks: complaints.filter((c) => ['Open', 'Assigned', 'In Progress', 'Rejected / Rework'].includes(c.status)).length,
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
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-xs" />
              <span className="text-slate-600 dark:text-slate-300 truncate">
                Active Persona:{' '}
                <strong className="text-slate-900 dark:text-white font-bold">{user?.name}</strong>{' '}
                <span className="text-indigo-600 dark:text-cyan-400 font-mono font-semibold">({user?.employeeId}</span> •{' '}
                <span className="text-slate-500 dark:text-slate-400">{user?.department})</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>{activeUnit ? activeUnit.name : 'Unit 1'}</span>
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
              {!isAtDashboard && (isAdmin || isAuditor) && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => navigate(`${basePath}/dashboard`)}
                    className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase transition-colors bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800/60 cursor-pointer"
                  >
                    ← Factory Overview
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Routed Page Content */}
          <Outlet context={outletContextValue} />
        </main>
      </div>

      {/* Global Modals */}
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

/**
 * Root Router Configuration
 * Common base path for all application routes: /compliance
 */
export const App = () => {
  return (
    <Routes>
      {/* Root redirect to default active workspace */}
      <Route path="/" element={<Navigate to="/esstee" replace />} />

      {/* Legacy /compliance direct redirects to /esstee */}
      <Route path="/compliance" element={<Navigate to="/esstee" replace />} />
      <Route path="/compliance/login" element={<Navigate to="/esstee/login" replace />} />
      <Route path="/compliance/dashboard" element={<Navigate to="/esstee/dashboard" replace />} />
      <Route path="/compliance/admin" element={<Navigate to="/esstee/admin" replace />} />
      <Route path="/compliance/settings" element={<Navigate to="/esstee/admin" replace />} />
      <Route path="/compliance/department" element={<Navigate to="/esstee/department" replace />} />
      <Route path="/compliance/departments" element={<Navigate to="/esstee/department" replace />} />
      <Route path="/compliance/reports" element={<Navigate to="/esstee/reports" replace />} />
      <Route path="/compliance/nc-cap" element={<Navigate to="/esstee/nc-cap" replace />} />
      <Route path="/compliance/nc" element={<Navigate to="/esstee/nc-cap" replace />} />
      <Route path="/compliance/cap" element={<Navigate to="/esstee/nc-cap?tab=cap-submitted" replace />} />
      <Route path="/compliance/tasks" element={<Navigate to="/esstee/nc-cap?tab=open" replace />} />
      <Route path="/compliance/complaints" element={<Navigate to="/esstee/nc-cap" replace />} />
      <Route path="/compliance/work-operations" element={<Navigate to="/esstee/work-operations" replace />} />
      <Route path="/compliance/requirements" element={<Navigate to="/esstee/requirements" replace />} />
      <Route path="/compliance/*" element={<Navigate to="/esstee" replace />} />

      {/* Top-level aliases redirected to default workspace */}
      <Route path="/login" element={<Navigate to="/esstee/login" replace />} />
      <Route path="/admin" element={<Navigate to="/esstee/admin" replace />} />
      <Route path="/dashboard" element={<Navigate to="/esstee/dashboard" replace />} />
      <Route path="/nc-cap" element={<Navigate to="/esstee/nc-cap" replace />} />
      <Route path="/work-operations" element={<Navigate to="/esstee/work-operations" replace />} />
      <Route path="/department" element={<Navigate to="/esstee/department" replace />} />
      <Route path="/reports" element={<Navigate to="/esstee/reports" replace />} />
      <Route path="/raise" element={<Navigate to="/esstee/raise" replace />} />
      <Route path="/report" element={<Navigate to="/esstee/raise" replace />} />
      <Route path="/public-raise" element={<Navigate to="/esstee/raise" replace />} />

      {/* Company Workspace Routes: /:companySlug/... */}
      <Route path="/:companySlug" element={<CompanyWorkspaceRoute />}>
        {/* Workspace Login */}
        <Route path="login" element={<LoginPage />} />

        {/* Public QR Compliance Raising Page - Anyone can raise NC without login */}
        <Route path="raise" element={<PublicRaiseComplaintPage />} />
        <Route path="report" element={<PublicRaiseComplaintPage />} />
        <Route path="public-raise" element={<PublicRaiseComplaintPage />} />

        {/* Protected Application Routes under Active Company Workspace */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Dynamic landing redirect based on persona */}
          <Route index element={<RoleBasedIndexRedirect />} />

          {/* Dashboard (Executive / Plant Oversight) */}
          <Route
            path="dashboard"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'AUDITOR']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Route: /:companySlug/admin */}
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="settings" element={<Navigate to="admin" replace />} />
          <Route path="admin/users" element={<Navigate to="admin" replace />} />
          <Route path="auditor" element={<Navigate to="dashboard" replace />} />

          {/* Department Route */}
          <Route
            path="department"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'AUDITOR']}>
                <DepartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route path="departments" element={<Navigate to="department" replace />} />

          {/* Reports Route */}
          <Route path="reports" element={<ReportsPage />} />

          {/* NC / CAP Defect Register */}
          <Route path="nc-cap" element={<NcCapPage />} />
          <Route path="nc" element={<Navigate to="nc-cap" replace />} />
          <Route path="cap" element={<Navigate to="nc-cap?tab=cap-submitted" replace />} />
          <Route path="tasks" element={<Navigate to="nc-cap?tab=open" replace />} />
          <Route path="complaints" element={<Navigate to="nc-cap" replace />} />

          {/* Work Operations */}
          <Route path="work-operations" element={<WorkOperationsPage />} />

          {/* Requirements Compliance Matrix */}
          <Route
            path="requirements"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'AUDITOR']}>
                <RequirementsPage />
              </ProtectedRoute>
            }
          />

          {/* 404 inside workspace */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      {/* Global Fallback Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
