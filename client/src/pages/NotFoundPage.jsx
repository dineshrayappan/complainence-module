import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, ArrowLeft, FileCheck } from 'lucide-react';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-8 sm:p-10 text-center shadow-xl shadow-slate-900/5 relative overflow-hidden">
        {/* Ambient backlight glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-40 h-40 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-5 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 mb-3 border border-slate-200 dark:border-slate-700">
            HTTP 404 • Route Not Found
          </span>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
            Page Not Found
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
            The requested compliance route or defect module could not be located. It may have been moved, renamed, or you may not have sufficient access credentials.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>

            <Link
              to="/compliance"
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Overview</span>
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 w-full">
            <Link
              to="/compliance/nc-cap"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-cyan-400 hover:underline"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Access NC/CAP Defect Register →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
