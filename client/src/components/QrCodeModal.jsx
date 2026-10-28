import React, { useState } from 'react';
import { X, Printer, Download, Copy, Check, ExternalLink, QrCode, Shield, Sparkles } from 'lucide-react';
import { generateQrSvg, downloadQrPng, printQrPoster } from '../utils/qrCodeGenerator';

export const QrCodeModal = ({
  isOpen,
  onClose,
  portalUrl,
  companyName = 'Garment Manufacturing Plant',
  unitName = 'Factory Unit',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const svgContent = generateQrSvg(portalUrl, {
    size: 260,
    margin: 4,
    darkColor: '#0f172a',
    lightColor: '#ffffff',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-center flex flex-col items-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span>Open Floor QR Reporting</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Public Compliance Raising QR
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          Anyone on the floor or plant can scan this code with a phone camera to report a compliance or safety defect instantly.
        </p>

        {/* QR Frame Container */}
        <div className="my-5 p-4 rounded-2xl bg-white border-2 border-indigo-500/20 shadow-xl shadow-indigo-500/10 flex items-center justify-center">
          <div
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center"
          />
        </div>

        {/* Live URL Pill with Copy */}
        <div className="w-full max-w-md p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs font-mono">
          <span className="truncate text-slate-600 dark:text-slate-300 text-[11px] px-2 select-all">
            {portalUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-3 gap-2 w-full mt-4">
          <button
            type="button"
            onClick={() => downloadQrPng(portalUrl, `Compliance_QR_${companyName.replace(/\s+/g, '_')}.png`, { title: 'Compliance Raising Portal' })}
            className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            <span>Download PNG</span>
          </button>

          <button
            type="button"
            onClick={() => printQrPoster(portalUrl, { companyName, unitName, portalUrl })}
            className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Poster</span>
          </button>

          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
            <span>Open Form</span>
          </a>
        </div>

        {/* Floor Instructions Notice */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>Zero login required • Submissions route straight to Floor Supervisor</span>
        </div>
      </div>
    </div>
  );
};

export default QrCodeModal;
