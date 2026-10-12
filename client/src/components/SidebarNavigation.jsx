import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  ShieldCheck,
  FileCheck,
  Building2,
  BarChart3,
  Settings,
  Users,
  ChevronRight,
  X,
  Activity,
  TrendingUp,
  Sparkles,
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
  const isSupervisor = user?.role === 'ACTION_PERSON' || user?.role === 'SUPERVISOR' || (!isAdmin && !isAuditor);

  const navItems = isSupervisor
    ? [
        {
          id: 'nc-cap',
          label: 'NC / CAP',
          icon: FileCheck,
          hasChevron: true,
          badge:
            (counts.openNC || 0) + (counts.cap || 0) > 0
              ? String((counts.openNC || 0) + (counts.cap || 0))
              : null,
          badgeColor: 'bg-amber-500 text-white',
        },
        { isDivider: true },
        {
          id: 'work-operations',
          label: 'Work Operations',
          icon: Activity,
          badge:
            counts.activeTasks !== undefined && counts.activeTasks !== null && counts.activeTasks > 0
              ? String(counts.activeTasks)
              : 'Live',
          badgeColor:
            'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        },
        { isDivider: true },
        {
          id: 'reports',
          label: 'Reports',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
        },
      ]
    : [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'audits',
          label: 'Audits',
          icon: ClipboardList,
          hasChevron: true,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'nc-cap',
          label: 'NC / CAP',
          icon: FileCheck,
          hasChevron: true,
          badge:
            (counts.openNC || 0) + (counts.cap || 0) > 0
              ? String((counts.openNC || 0) + (counts.cap || 0))
              : null,
          badgeColor: 'bg-rose-500 text-white',
        },
        {
          id: 'reports',
          label: 'Reports',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'departments',
          label: 'Departments',
          icon: Building2,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'users',
          label: 'Users',
          icon: Users,
          badge: null,
          badgeColor: '',
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          badge: null,
          badgeColor: '',
        },
      ];

  const handleItemClick = (id) => {
    onSelectSection(id);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 lg:top-0 left-0 h-screen w-64 bg-[#0c1427] border-r border-slate-800/90 z-50 lg:z-20 flex flex-col justify-between py-4 px-3.5 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto no-scrollbar">
          {/* AuditPro Brand Header */}
          <div className="flex items-center justify-between px-2 pb-4 pt-1 mb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight text-white font-sans">
                  Audit<span className="text-blue-500">Pro</span>
                </span>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems
              .filter((item) => !item.hidden && (item.isDivider || (item.id && item.icon)))
              .map((item, index) => {
                if (item.isDivider) {
                  return (
                    <div
                      key={`divider-${index}`}
                      className="my-2.5 border-t border-slate-800/60"
                    />
                  );
                }

                const Icon = item.icon;
                const isActive =
                  currentSection === item.id ||
                  (item.id === 'nc-cap' &&
                    (currentSection === 'nc' || currentSection === 'cap' || currentSection === 'nc-cap'));

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    type="button"
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all group cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive
                            ? 'text-white'
                            : 'text-slate-400 group-hover:text-blue-400'
                        }`}
                      />
                      <span className="truncate tracking-tight">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : item.badgeColor
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.hasChevron && (
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform ${
                            isActive
                              ? 'text-white/80'
                              : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
          </nav>
        </div>

        {/* Sidebar Footer: Motivational "Audit Today, Better Tomorrow" Widget */}
        <div className="pt-3 border-t border-slate-800/80 mt-2 shrink-0">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-900 via-[#0e172e] to-[#121c38] border border-slate-800 shadow-xl relative overflow-hidden group">
            {/* Ambient decorative glowing back-layer */}
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-blue-500/20 transition-all" />
            
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white tracking-tight leading-tight">
                  Audit Today
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  Better Tomorrow
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default SidebarNavigation;
