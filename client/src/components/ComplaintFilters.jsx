import React, { useRef } from 'react';
import {
  Search,
  RefreshCw,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Layers,
  Users,
  User,
} from 'lucide-react';

export const ComplaintFilters = ({
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  deadlineFilter = '',
  onDeadlineChange,
  onDeadlineFilterChange,
  departmentFilter = '',
  onDepartmentChange,
  departments = [],
  categoryFilter,
  onCategoryChange,
  priorityFilter,
  onPriorityChange,
  onRefresh,
  loading,
  counts,
  onNavigateReport,
}) => {
  const tabs = [
    { id: 'all', label: 'All NC/CAP', count: counts?.total },
    { id: 'open', label: 'Open', count: counts?.open ?? counts?.activeTickets },
    { id: 'cap-submitted', label: 'CAP Submitted', count: counts?.capSubmitted },
    { id: 'under-review', label: 'Under Review', count: counts?.underReview },
    { id: 'rejected-rework', label: 'Rejected / Rework', count: counts?.rejectedRework },
    { id: 'verified', label: 'Verified', count: counts?.verified },
    { id: 'closed', label: 'Closed', count: counts?.closed ?? counts?.closedTickets },
    { id: 'draft', label: 'Draft', count: counts?.draft },
  ];

  const deadlineOptions = [
    { value: '', label: 'All Deadlines' },
    { value: 'Overdue', label: `Overdue (${counts?.overdueCount ?? 0})` },
    { value: 'Due Soon', label: `Due Soon (<4h) (${counts?.dueSoonCount ?? 0})` },
    { value: 'Open', label: `Open (Within SLA) (${counts?.openDeadlineCount ?? 0})` },
    { value: 'Closed', label: `Closed (${counts?.closedDeadlineCount ?? counts?.closedTickets ?? 0})` },
  ];

  const categories = [
    'All Categories',
    'Stitching Fault',
    'Fabric Defect',
    'Oil / Stain',
    'Measurement / Fit',
    'Trims / Accessories',
    'Finishing / Pressing',
  ];

  const priorities = ['All Priorities', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  const tabsRef = useRef(null);

  const handleDeadlineChange = (val) => {
    if (onDeadlineChange) onDeadlineChange(val);
    if (onDeadlineFilterChange) onDeadlineFilterChange(val);
  };

  const scrollTabs = (direction) => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({
        left: direction === 'left' ? -220 : 220,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xs transition-colors space-y-3 sm:space-y-3.5">
      {/* 1. Workflow Lifecycle Status Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 sm:pb-3">
        <div className="relative flex items-center flex-1 min-w-0">
          {/* Scroll Left Button */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            title="Scroll tabs left"
            className="hidden sm:flex items-center justify-center w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mr-1 shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Horizontally Scrollable Flex Tabs Bar */}
          <div
            ref={tabsRef}
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
            className="flex items-center gap-1.5 overflow-x-auto horizontal-scroll-bar scroll-smooth flex-1 min-w-0 py-1"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold font-mono ${
                        isActive
                          ? 'bg-indigo-700/80 text-white'
                          : tab.count > 0 && tab.id === 'rejected-rework'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Scroll Right Button */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            title="Scroll tabs right"
            className="hidden sm:flex items-center justify-center w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1 shrink-0 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh defect records"
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors shrink-0 shadow-xs cursor-pointer ml-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600 dark:text-blue-400' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* 2. Comprehensive Dropdown Filters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
        {/* Search Input */}
        <div className="relative sm:col-span-2 lg:col-span-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search NC ID, line, supervisor, 5-Why..."
            className="w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs sm:text-sm pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-950 placeholder:text-slate-400 font-sans transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Dropdown Filter (synced with activeTab) */}
        <div className="sm:col-span-1 lg:col-span-2">
          <select
            value={activeTab}
            onChange={(e) => onTabChange(e.target.value)}
            aria-label="Filter by NC Status"
            className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
          >
            {tabs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} {typeof t.count === 'number' ? `(${t.count})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Department Dropdown Filter */}
        {departments && departments.length > 0 && (
          <div className="sm:col-span-1 lg:col-span-2">
            <select
              value={departmentFilter}
              onChange={(e) => onDepartmentChange && onDepartmentChange(e.target.value)}
              aria-label="Filter by Department"
              className={`w-full text-xs sm:text-sm px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium ${
                departmentFilter
                  ? 'bg-indigo-50 text-indigo-900 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800'
              }`}
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Separate Deadline Condition Filter */}
        <div className={`sm:col-span-1 ${departments && departments.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <select
            value={deadlineFilter}
            onChange={(e) => handleDeadlineChange(e.target.value)}
            aria-label="Filter by Deadline Condition"
            className={`w-full text-xs sm:text-sm px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium ${
              deadlineFilter === 'Overdue'
                ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700'
                : deadlineFilter === 'Due Soon'
                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700'
                : 'bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800'
            }`}
          >
            {deadlineOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className={`sm:col-span-1 ${departments && departments.length > 0 ? 'lg:col-span-1.5' : 'lg:col-span-2'}`}>
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by Defect Category"
            className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
          >
            {categories.map((c) => (
              <option key={c} value={c === 'All Categories' ? '' : c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Priority Filter */}
        <div className={`sm:col-span-1 ${departments && departments.length > 0 ? 'lg:col-span-1.5' : 'lg:col-span-2'}`}>
          <select
            value={priorityFilter}
            onChange={(e) => onPriorityChange(e.target.value)}
            aria-label="Filter by Risk Priority"
            className="w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs sm:text-sm px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
          >
            {priorities.map((p) => (
              <option key={p} value={p === 'All Priorities' ? '' : p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Advanced Filter Matrix & Specialized Reports Quick Launcher */}
      <div className="pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400" />
          <span>Advanced Filter Matrix &amp; Reports:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onNavigateReport && onNavigateReport('audit-register')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-cyan-300 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs hover:border-indigo-300"
            title="Open Master NC Report in Advanced Filter Matrix"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>Master NC Report</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-cyan-300 font-mono font-bold">
              {counts?.total ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateReport && onNavigateReport('members-report')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/60 dark:hover:text-purple-300 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs hover:border-purple-300"
            title="Open Department Members Report in Advanced Filter Matrix"
          >
            <Users className="w-3.5 h-3.5 text-purple-500" />
            <span>Department Members Report</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateReport && onNavigateReport('member-detail')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs hover:border-emerald-300"
            title="Open Individual Member NC Details in Advanced Filter Matrix"
          >
            <User className="w-3.5 h-3.5 text-emerald-500" />
            <span>Individual Member NC Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComplaintFilters;
