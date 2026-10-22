import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileCheck,
  BarChart3,
  Settings,
  ChevronRight,
  X,
  Activity,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SidebarNavigation = ({
  currentSection,
  onSelectSection,
  counts = {},
  isOpen = false,
  onClose,
}) => {
  const { user, isAdmin, isAuditor } = useAuth();
  const location = useLocation();
  const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR' || (!isAdmin && !isAuditor);

  const navItems = isSupervisor
    ? [
        {
          id: 'nc-cap',
          path: '/compliance/nc-cap',
          label: 'NC/CAP',
          icon: FileCheck,
          badge:
            (counts.openNC || 0) + (counts.cap || 0) > 0
              ? String((counts.openNC || 0) + (counts.cap || 0))
              : null,
          badgeColor: 'bg-amber-500 text-white',
        },
        { isDivider: true },
        {
          id: 'work-operations',
          path: '/compliance/work-operations',
          label: 'Work Operations',
          icon: Activity,
          badge:
            counts.activeTasks !== undefined && counts.activeTasks !== null && counts.activeTasks > 0
              ? String(counts.activeTasks)
              : 'Live',
          badgeColor:
            'bg-indigo-500/10 text-indigo-600 dark:text-cyan-400 border border-indigo-500/20',
        },
        { isDivider: true },
        {
          id: 'reports',
          path: '/compliance/reports',
          label: 'Reports',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
        },
      ]
    : [
        {
          id: 'dashboard',
          path: '/compliance/dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'nc-cap',
          path: '/compliance/nc-cap',
          label: 'NC/CAP',
          icon: FileCheck,
          badge:
            (counts.openNC || 0) + (counts.cap || 0) > 0
              ? String((counts.openNC || 0) + (counts.cap || 0))
              : null,
          badgeColor: 'bg-amber-500 text-white',
        },
        { isDivider: true },
        {
          id: 'work-operations',
          path: '/compliance/work-operations',
          label: 'Work Operations',
          icon: Activity,
          badge:
            counts.activeTasks !== undefined && counts.activeTasks !== null && counts.activeTasks > 0
              ? String(counts.activeTasks)
              : 'Live',
          badgeColor:
            'bg-indigo-500/10 text-indigo-600 dark:text-cyan-400 border border-indigo-500/20',
        },
        {
          id: 'department',
          path: '/compliance/department',
          label: 'Departments',
          icon: Building2,
          badge: counts.deptCount ? String(counts.deptCount) : null,
          badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
        },
        { isDivider: true },
        {
          id: 'reports',
          path: '/compliance/reports',
          label: 'Reports',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
        },
        ...(isAdmin
          ? [
              { isDivider: true },
              {
                id: 'admin',
                path: '/compliance/admin',
                label: 'Admin',
                icon: Settings,
                badge: 'Admin',
                badgeColor:
                  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
              },
            ]
          : []),
      ];

  const handleItemClick = (item) => {
    if (onSelectSection) onSelectSection(item.id);
    if (onClose) onClose();
  };

  // Determine active item based on current route pathname
  const isItemActive = (item) => {
    if (!item.path) return false;
    const currentPath = location.pathname;
    if (item.id === 'dashboard') {
      return (
        currentPath === '/compliance/dashboard' ||
        currentPath === '/compliance' ||
        currentPath === '/compliance/' ||
        currentPath === '/dashboard' ||
        currentPath === '/'
      );
    }
    if (item.id === 'nc-cap') {
      return (
        currentPath === '/compliance/nc-cap' ||
        currentPath === '/compliance/nc' ||
        currentPath === '/compliance/cap' ||
        currentPath === '/compliance/tasks' ||
        currentPath === '/compliance/complaints' ||
        currentPath.startsWith('/compliance/nc-cap/') ||
        currentPath === '/nc-cap' ||
        currentPath === '/nc' ||
        currentPath === '/cap'
      );
    }
    if (item.id === 'work-operations') {
      return (
        currentPath.startsWith('/compliance/work-operations') ||
        currentPath.startsWith('/work-operations')
      );
    }
    if (item.id === 'department' || item.id === 'departments') {
      return (
        currentPath.startsWith('/compliance/department') ||
        currentPath.startsWith('/compliance/departments') ||
        currentPath.startsWith('/departments')
      );
    }
    if (item.id === 'reports') {
      return (
        currentPath.startsWith('/compliance/reports') ||
        currentPath.startsWith('/reports')
      );
    }
    if (item.id === 'admin' || item.id === 'settings') {
      return (
        currentPath.startsWith('/compliance/admin') ||
        currentPath.startsWith('/compliance/settings') ||
        currentPath.startsWith('/settings') ||
        currentPath.startsWith('/admin')
      );
    }
    if (currentSection) {
      return currentSection === item.id;
    }
    return currentPath === item.path;
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 lg:top-20 left-0 h-screen lg:h-[calc(100vh-5rem)] w-64 bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800/90 z-50 lg:z-10 flex flex-col justify-between py-4 px-3 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto no-scrollbar">
          {/* Mobile Header in Drawer */}
          <div className="flex items-center justify-between px-2 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800 lg:hidden">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Navigation Menu
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems
              .filter((item) => !item.hidden && (item.isDivider || (item.id && item.icon)))
              .map((item, index) => {
                if (item.isDivider) {
                  return (
                    <div
                      key={`divider-${index}`}
                      className="my-2 border-t border-slate-100 dark:border-slate-800/80"
                    />
                  );
                }

                const Icon = item.icon;
                const active = isItemActive(item);

                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all group cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                          active
                            ? 'text-white'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-cyan-400'
                        }`}
                      />
                      <span className="truncate tracking-tight">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                            active
                              ? 'bg-white/20 text-white'
                              : item.badgeColor
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {active && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
                    </div>
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* Sidebar Footer Plant Status */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-2 shrink-0 space-y-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Unit #4 Active</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                100% SLA
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              Live Closed-Loop QMS
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default SidebarNavigation;
