import React, { useState, useMemo } from 'react';
import {
  QrCode,
  Copy,
  Check,
  Printer,
  Download,
  ExternalLink,
  Maximize2,
  Sparkles,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { generateQrSvg, downloadQrPng, printQrPoster } from '../utils/qrCodeGenerator';
import QrCodeModal from './QrCodeModal';

/**
 * PublicComplianceQrCard
 * Description Bar at the end of the Compliance Raising Form.
 * Enables instant QR code generation allowing anyone on the floor to raise compliance without login.
 */
export const PublicComplianceQrCard = ({
  companySlug = 'esstee',
  companyName = 'Garment Manufacturing Plant',
  unitId = 'UNIT-1',
  unitName = 'Unit 1',
}) => {
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Compute live public raise portal URL
  const portalUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      return `${origin}/${companySlug}/raise`;
    }
    return `/${companySlug}/raise`;
  }, [companySlug]);

  const handleCopyLink = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Failed to copy portal URL:', err);
    }
  };

  const handleDownload = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    downloadQrPng(
      portalUrl,
      `Compliance_QR_${companySlug.toUpperCase()}_${unitId}.png`,
      {
        size: 1024,
        margin: 4,
        darkColor: '#0f172a',
        lightColor: '#ffffff',
        title: `${companyName} • Scan to Raise Compliance`,
      }
    );
  };

  const handlePrint = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    printQrPoster(portalUrl, {
      companyName,
      unitName,
      portalUrl,
    });
  };

  const miniQrSvg = useMemo(() => {
    return generateQrSvg(portalUrl, {
      size: 88,
      margin: 2,
      darkColor: '#1e1b4b',
      lightColor: '#ffffff',
    });
  }, [portalUrl]);

  return (
    <>
      {/* DESCRIPTION BAR AT END OF COMPLIANCE RAISING FORM */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/70 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-slate-50/90 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90 p-4 sm:p-5 shadow-sm transition-all duration-200">
        
        {/* Subtle Decorative Background Glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          {/* LEFT: QR CODE PREVIEW BOX WITH SCANNER BADGE */}
          <div className="flex items-center gap-3.5 shrink-0">
            <div
              onClick={() => setIsModalOpen(true)}
              title="Click to expand & print QR poster"
              className="group relative w-20 h-20 sm:w-22 sm:h-22 p-1.5 rounded-xl bg-white border border-indigo-300 dark:border-indigo-700 shadow-md shadow-indigo-600/10 flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            >
              <div
                dangerouslySetInnerHTML={{ __html: miniQrSvg }}
                className="w-full h-full flex items-center justify-center"
              />
              <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                <Maximize2 className="w-4 h-4 text-white drop-shadow" />
              </div>
            </div>

            {/* DESCRIPTION TEXT */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600 text-white font-extrabold text-[10px] uppercase tracking-wider">
                  <QrCode className="w-3 h-3" />
                  <span>Public QR Raising</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Zero-Login Required</span>
                </span>
              </div>

              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                Scan QR to Raise Compliance from Anyone
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Allow sewing line operators, helpers, maintenance technicians, or floor visitors to immediately report non-conformance defects directly from their smartphones without an account.
              </p>
            </div>
          </div>

          {/* RIGHT: QUICK ACTIONS & COPY LINK */}
          <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-indigo-100 dark:border-slate-800">
            {/* Live URL Pill with Copy */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-indigo-200 dark:border-indigo-800 text-[11px] font-mono shadow-2xs w-full sm:w-auto">
              <span className="truncate max-w-[200px] sm:max-w-[220px] px-2 text-indigo-700 dark:text-cyan-400 select-all font-semibold">
                {portalUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all cursor-pointer shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
                title="Copy public raising portal link"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Action Button Group */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-bold text-[10px] shadow-2xs transition-all cursor-pointer"
                title="Print ready-to-stick floor poster"
              >
                <Printer className="w-3 h-3 text-indigo-600 dark:text-cyan-400" />
                <span>Print Poster</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-bold text-[10px] shadow-2xs transition-all cursor-pointer"
                title="Download high-resolution QR PNG"
              >
                <Download className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span>Download PNG</span>
              </button>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-bold text-[10px] shadow-2xs transition-all cursor-pointer"
                title="Expand QR poster view"
              >
                <Maximize2 className="w-3 h-3 text-indigo-500" />
                <span>Expand</span>
              </button>

              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] transition-all cursor-pointer"
                title="Open and test public raising form in new tab"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Test Form</span>
              </a>
            </div>
          </div>

        </div>

      </div>

      {/* POPUP MODAL FOR EXPANDED QR POSTER */}
      <QrCodeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        portalUrl={portalUrl}
        companyName={companyName}
        unitName={unitName}
      />
    </>
  );
};

export default PublicComplianceQrCard;
