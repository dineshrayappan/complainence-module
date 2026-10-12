import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, ShieldCheck, Lock, User, HelpCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your Employee ID or Email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await login(identifier.trim(), password);
      if (res && res.success === false) {
        setError(res.message || 'Login failed. Please verify your credentials.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-center items-center bg-slate-50 font-sans overflow-x-hidden selection:bg-indigo-500 selection:text-white">

      {/* ----------------- CENTERED LOGIN CARD ----------------- */}
      <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[440px] bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.14),0_0_0_1px_rgba(226,232,240,0.8)] p-7 sm:p-9 transition-all">
          
          {/* Card Top Pill Badge */}
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100/90">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Compliance Module
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
            Welcome back!
          </h1>
          <p className="text-xs sm:text-[13px] text-slate-500 mt-1 mb-6 leading-relaxed">
            Please sign in to access your compliance & audit workspace.
          </p>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Employee ID, Work Email, or Username */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username / Employee ID / Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter Employee ID or Email"
                  autoComplete="username"
                  className="w-full h-11 pl-10 pr-3.5 text-sm rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full h-11 pl-10 pr-11 text-sm rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 ${
                    !showPassword && password ? 'tracking-widest' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/25 hover:shadow-lg hover:shadow-indigo-600/30 active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Professional Tagline Below Login Card */}
        <div className="mt-6 text-center z-10 px-4">
          <p className="text-xs sm:text-sm font-semibold text-white tracking-wide drop-shadow-xs">
            Compliance Management & Action Tracking
          </p>
          <p className="text-[11px] text-white/80 mt-1 drop-shadow-2xs">
            Enterprise Closed-Loop Garment Audit & Action Tracking Platform
          </p>
        </div>
      </div>

      {/* ----------------- LOWER CURVED WAVE & GRADIENT SECTION ----------------- */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden h-[42vh] sm:h-[46vh] lg:h-[48vh] z-0">
        <svg
          viewBox="0 0 1440 480"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            {/* Primary rich blue-to-purple gradient */}
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1d4ed8" />
              <stop offset="35%" stopColor="#2563eb" />
              <stop offset="65%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>

            {/* Secondary layered wave gradient for organic depth */}
            <linearGradient id="waveGradientBack" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0.3" />
            </linearGradient>

            {/* Subtle dotted geometric pattern inside gradient area */}
            <pattern id="dotPattern" x="0" y="0" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="2.5" cy="2.5" r="1.5" fill="#ffffff" fillOpacity="0.16" />
            </pattern>
          </defs>

          {/* Background Soft Depth Wave */}
          <path
            d="M0,150 C320,70 540,220 860,130 C1140,60 1320,170 1440,110 L1440,480 L0,480 Z"
            fill="url(#waveGradientBack)"
          />

          {/* Primary Foreground Wave */}
          <path
            d="M0,185 C340,105 560,235 900,150 C1180,80 1340,180 1440,140 L1440,480 L0,480 Z"
            fill="url(#waveGradient)"
          />

          {/* Dotted Pattern Overlay clipped directly to the main wave */}
          <path
            d="M0,185 C340,105 560,235 900,150 C1180,80 1340,180 1440,140 L1440,480 L0,480 Z"
            fill="url(#dotPattern)"
          />

          {/* Abstract Subtle Radial Contours for Modern SaaS Depth */}
          <circle cx="160" cy="380" r="150" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.5" />
          <circle cx="160" cy="380" r="230" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1.5" />
          <circle cx="1280" cy="340" r="170" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.5" />
          <circle cx="1280" cy="340" r="260" stroke="#ffffff" strokeOpacity="0.03" strokeWidth="1.5" />
        </svg>
      </div>

      {/* ----------------- FORGOT PASSWORD MODAL ----------------- */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Password Reset Instructions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                In compliance with factory data security & ISO audit standards, individual user registration and self-service password resets are restricted.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-800">Need credentials reset?</div>
                <div>Please contact your <span className="font-bold text-indigo-600">Central Quality Administrator</span> or IT Helpdesk.</div>
                <div className="text-[11px] text-slate-500 font-mono">Email: admin@factory.com • Phone Ext: 402</div>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
