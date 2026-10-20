import React, { useState, useEffect, useMemo } from 'react';
import {
  Menu,
  Bell,
  LogOut,
  ShieldCheck,
  Wrench,
  RefreshCw,
  Camera,
  Layers,
  Flame,
  CheckCircle2,
  X,
  ChevronDown,
  Maximize,
  Minimize,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export const Header = ({
  onToggleSidebar,
  onOpenNewComplaint,
  onRefresh,
  isRefreshing,
  overdueCount = 0,
  onSelectOverdue,
}) => {
  const { user, isAdmin, isAuditor, isSupervisor, logout } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed or not permitted by browser:', err);
    }
  };

  const notifications = useMemo(() => {
    const list = [];
    if (overdueCount > 0) {
      list.push({
        id: 'alert-overdue',
        type: 'overdue',
        title: `${overdueCount} NC${overdueCount > 1 ? 's' : ''} Exceeded SLA`,
        detail: 'Immediate attention required for non-conformance records past resolution deadline.',
        time: 'Live',
      });
    }
    return list;
  }, [overdueCount]);

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/90 dark:border-slate-800/90 sticky top-0 z-30 backdrop-blur-md transition-colors">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Left: Mobile Menu Toggle & Brand Title */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            {/* Hamburger button for mobile/tablet sidebar */}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Toggle Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand Logo & Name */}
            <Link
              to="/"
              className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 group cursor-pointer focus:outline-none"
              title="Go to Compliance Overview"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 p-0.5 shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[9px] flex items-center justify-center">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-cyan-400" />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base lg:text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase font-sans truncate group-hover:text-indigo-600 dark:group-hover:text-cyan-400 transition-colors">
                    COMPLIANCE MANAGEMENT
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Unit #4
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                  Continuous Closed-Loop Quality Assurance &amp; NC/CAP System
                </p>
              </div>
            </Link>
          </div>

          {/* Right Header Controls: Refresh, 🔔 Notifications, Theme, Profile Pill, Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Refresh Data Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                type="button"
                id="btn-refresh-data"
                title="Refresh compliance and defect metrics"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-xs cursor-pointer text-xs font-semibold"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400 ${
                    isRefreshing ? 'animate-spin' : ''
                  }`}
                />
                <span className="text-[11px] hidden md:inline">
                  {isRefreshing ? 'Syncing...' : 'Sync'}
                </span>
              </button>
            )}

            {/* Notification Bell (🔔) with Popover */}
            <div className="relative">
              <button
                type="button"
                id="btn-notifications-bell"
                onClick={() => setShowNotifications((prev) => !prev)}
                title="Notifications & Escalation Alerts"
                className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {overdueCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white font-mono text-[9px] font-extrabold rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {overdueCount > 9 ? '9+' : overdueCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown Drawer */}
              {showNotifications && (
                <>
                  <div
                    onClick={() => setShowNotifications(false)}
                    className="fixed inset-0 z-40"
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Compliance Alerts
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold">
                        {overdueCount} Overdue
                      </span>
                    </div>

                    <div className="space-y-2 mt-3 max-h-72 overflow-y-auto no-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="py-6 px-3 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            All Systems In Compliance
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Zero overdue items or active escalation alerts.
                          </p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <div className="mt-0.5">
                              {n.type === 'overdue' ? (
                                <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                              ) : n.type === 'cap' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white truncate">
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {n.time}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                {n.detail}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifications(false);
                          if (onSelectOverdue) onSelectOverdue();
                          navigate('/nc-cap?deadline=Overdue');
                        }}
                        className="text-xs font-bold text-indigo-600 dark:text-cyan-400 hover:underline cursor-pointer"
                      >
                        View All Overdue Escalations →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fullscreen Mode Toggle Button */}
            <button
              type="button"
              id="fullscreen-toggle-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              title={isFullscreen ? 'Exit Fullscreen Mode (Esc)' : 'Enter Fullscreen Mode'}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center justify-center"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
              ) : (
                <Maximize className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              )}
            </button>


            {/* User Profile Pill ("Admin" / Auditor / Supervisor) */}
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/90 shadow-2xs">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-xs shrink-0 ${
                  isAdmin
                    ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500'
                    : isAuditor
                    ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                    : 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                }`}
              >
                {user?.name?.charAt(0) || (isAdmin ? 'A' : 'U')}
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {isAdmin ? 'Admin' : user?.name?.split(' ')[0] || 'User'}
                  </span>
                  <span
                    className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                      isAdmin
                        ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300'
                        : isAuditor
                        ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {isAdmin ? 'Admin' : isAuditor ? 'Auditor' : 'Department'}
                  </span>
                  {!isSupervisor && !(!isAdmin && !isAuditor) && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      title="Active session • Marked Present in system"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Present</span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  {user?.department || 'Apparel'}
                </span>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              id="btn-sign-out"
              title="Sign out of system"
              className="flex items-center gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:border-rose-900 dark:hover:text-rose-300 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
