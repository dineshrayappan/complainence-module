import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutGrid,
  List,
  PlusCircle,
  CheckCircle2,
  Building2,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import KpiMetrics from '../components/KpiMetrics';
import ComplaintFilters from '../components/ComplaintFilters';
import ComplaintCard from '../components/ComplaintCard';
import ComplaintTable from '../components/ComplaintTable';

export const NcCapPage = () => {
  const { user, isAuditor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    complaints = [],
    metrics,
    loading,
    isRefreshing,
    loadData,
    derivedCounts = {},
    handleOpenDetailModal,
    handleOpenActionModal,
    handleStartProgress,
    handleDeleteComplaint,
    setIsNewModalOpen,
  } = useAppContext();

  // URL search parameter backed states
  const activeTab = searchParams.get('tab') || 'all';
  const deadlineFilter = searchParams.get('deadline') || '';
  const departmentFilter = searchParams.get('dept') || '';
  const categoryFilter = searchParams.get('cat') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [viewMode, setViewMode] = useState(searchParams.get('view') || 'cards');

  // Keep local search in sync if URL search param changes from outside (e.g. drilldown)
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== searchTerm) {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

  // Helper to update specific search param
  const updateQueryParam = (key, value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleTabChange = (newTab) => {
    updateQueryParam('tab', newTab);
  };

  const handleDeadlineChange = (newDeadline) => {
    updateQueryParam('deadline', newDeadline);
  };

  const handleDepartmentChange = (newDept) => {
    updateQueryParam('dept', newDept);
  };

  const handleCategoryChange = (newCat) => {
    updateQueryParam('cat', newCat);
  };

  const handlePriorityChange = (newPriority) => {
    updateQueryParam('priority', newPriority);
  };

  const handleSearchChange = (newSearch) => {
    setSearchTerm(newSearch);
    updateQueryParam('search', newSearch);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    updateQueryParam('view', mode);
  };

  // Instant client-side filtering matching existing business logic
  const displayedComplaints = useMemo(() => {
    const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR';
    const userEmpId = (user?.employeeId || '').toUpperCase();
    const userId = String(user?.id || user?._id || '');
    const cleanSearch = searchTerm.trim().toLowerCase();

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

      // 3. Department filter
      if (departmentFilter && c.department !== departmentFilter) {
        return false;
      }

      // 4. Category filter
      if (categoryFilter && c.defectType !== categoryFilter && c.category !== categoryFilter) {
        return false;
      }

      // 5. Priority filter
      if (priorityFilter && c.priority !== priorityFilter) {
        return false;
      }

      // 6. Search term filter
      if (cleanSearch) {
        const idMatch = (c.complaintId || '').toLowerCase().includes(cleanSearch);
        const titleMatch = (c.title || '').toLowerCase().includes(cleanSearch);
        const deptMatch = (c.department || '').toLowerCase().includes(cleanSearch);
        const lineMatch = (c.productionLine || '').toLowerCase().includes(cleanSearch);
        const descMatch = (c.description || '').toLowerCase().includes(cleanSearch);
        const buyerMatch = (c.buyer || '').toLowerCase().includes(cleanSearch);
        const orderMatch = (c.orderNumber || '').toLowerCase().includes(cleanSearch);
        const defectMatch = (c.defectType || '').toLowerCase().includes(cleanSearch);
        if (!idMatch && !titleMatch && !deptMatch && !lineMatch && !descMatch && !buyerMatch && !orderMatch && !defectMatch) {
          return false;
        }
      }

      return true;
    });
  }, [complaints, activeTab, deadlineFilter, departmentFilter, categoryFilter, priorityFilter, searchTerm, user]);

  return (
    <>
      {/* Optional Section Guidance Banner when filtering open line tasks */}
      {activeTab === 'open' && (
        <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
            <span className="font-bold text-indigo-950 dark:text-indigo-200">
              Active Floor Rectification &amp; Line Tasks
            </span>
          </div>
          <span className="text-slate-500 font-mono text-[11px]">
            Displaying active defects needing floor rectification
          </span>
        </div>
      )}

      {/* Main Integrated Management Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 mb-4 p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xl shadow-indigo-950/20 text-white">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-60 h-60 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-40 h-40 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-white text-sm tracking-tight">
                NC / CAP Integrated Management
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Closed-Loop Defect &amp; Rework Tracking
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Non-Conformance (NC) Logging • Root Cause Analysis • Corrective &amp; Preventive Action (CAP) • Floor Verification
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ✓ 100% Floor Verification Standard
          </span>
          {isAuditor && (
            <button
              type="button"
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Log NC</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <KpiMetrics metrics={metrics} onSelectTab={handleTabChange} />

      {/* Filters & Search Navigation */}
      <ComplaintFilters
        activeTab={activeTab}
        onTabChange={handleTabChange}
        deadlineFilter={deadlineFilter}
        onDeadlineChange={handleDeadlineChange}
        onDeadlineFilterChange={handleDeadlineChange}
        departmentFilter={departmentFilter}
        onDepartmentChange={handleDepartmentChange}
        departments={Array.from(new Set(complaints.map((c) => c.department).filter(Boolean))).sort()}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        categoryFilter={categoryFilter}
        onCategoryChange={handleCategoryChange}
        priorityFilter={priorityFilter}
        onPriorityChange={handlePriorityChange}
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
            onClick={() => handleViewModeChange('cards')}
            title="Card Grid View"
            className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleViewModeChange('table')}
            title="Dense Table View"
            className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'table'
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
              <span>Log Defect (NC)</span>
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
  );
};

export default NcCapPage;
