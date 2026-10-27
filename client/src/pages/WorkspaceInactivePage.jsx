import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react';
import { getCompanyBySlug } from '../config/companyRegistry';

export default function WorkspaceInactivePage() {
  const { companySlug } = useParams();
  const company = getCompanyBySlug(companySlug);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-rose-950/40 to-slate-950 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-rose-900/50 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-5 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-3">
          HTTP 403 • Workspace Suspended
        </span>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          Workspace Deactivated
        </h1>

        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          The company workspace for{' '}
          <strong className="text-rose-300 font-bold">
            {company ? company.name : companySlug}
          </strong>{' '}
          is currently inactive or administrative access has been suspended.
        </p>

        <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-6 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold">
            <Mail className="w-4 h-4 text-rose-400" />
            <span>Need workspace restoration?</span>
          </div>
          <p>Please contact your compliance system administrator or IT operations department to reactivate this organization's database access.</p>
        </div>

        <Link
          to="/esstee/login"
          className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 transition-all active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Switch to Esstee Workspace</span>
        </Link>
      </div>
    </div>
  );
}
