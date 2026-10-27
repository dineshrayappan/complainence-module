import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Building2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { REGISTERED_COMPANIES } from '../config/companyRegistry';

export default function WorkspaceNotFoundPage() {
  const { companySlug } = useParams();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-inner">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 mb-3">
          HTTP 404 • Not Found
        </span>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          Workspace Not Found
        </h1>

        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          The requested company workspace{' '}
          <code className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-amber-300 font-mono text-xs font-semibold">
            /{companySlug || 'unknown'}
          </code>{' '}
          does not exist or is not registered in this system.
        </p>

        <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-6 text-left">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Available Active Workspaces</span>
          </div>
          <div className="space-y-2">
            {REGISTERED_COMPANIES.filter(c => c.status === 'active').map((comp) => (
              <Link
                key={comp.slug}
                to={`/${comp.slug}/login`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-700/40 hover:bg-indigo-600/20 border border-slate-600/40 hover:border-indigo-500/50 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-black flex items-center justify-center border border-indigo-500/30">
                    {comp.logoInitials}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {comp.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      /{comp.slug}/
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </div>

        <Link
          to="/esstee/login"
          className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Go to Primary Workspace (Esstee)</span>
        </Link>
      </div>
    </div>
  );
}
