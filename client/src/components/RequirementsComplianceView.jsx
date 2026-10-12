import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Shield,
  Layers,
  Search,
  ExternalLink,
  ChevronRight,
  Flame,
} from 'lucide-react';

export const RequirementsComplianceView = ({ complaints = [], onSelectRequirement }) => {
  const [search, setSearch] = useState('');

  const standards = useMemo(() => {
    const totalComplaints = complaints.length;
    const openComplaints = complaints.filter(
      (c) => c.status !== 'Closed' && c.status !== 'Verified'
    );

    const baseStandards = [
      {
        code: 'ISO 9001:2015',
        name: 'Quality Management System',
        badge: 'Certified',
        keyword: 'Quality',
        clauses: [
          {
            id: '8.7',
            title: 'Control of Nonconforming Outputs',
            finding: 'Proper identification and segregation of skipped stitches and shade variations.',
          },
          {
            id: '10.2',
            title: 'Nonconformity & Corrective Action',
            finding: '8-part closed-loop CAP workflow active for all audit defects.',
          },
          {
            id: '7.1.5',
            title: 'Monitoring & Measuring Resources',
            finding: 'Calibration records maintained for needle detectors and fabric tensile testers.',
          },
        ],
      },
      {
        code: 'SA8000:2014',
        name: 'Social Accountability & Floor Safety',
        badge: 'Verified',
        keyword: 'Safety',
        clauses: [
          {
            id: '3.1',
            title: 'Health & Safety - Emergency Egress',
            finding: 'Gangways and exit doors must remain unblocked at all times.',
          },
          {
            id: '3.2',
            title: 'PPE & Machine Guarding',
            finding: 'Eye shields, pulley guards, and needle guards in place across machines.',
          },
          {
            id: '3.5',
            title: 'First Aid & Chemical Safety',
            finding: 'MSDS displayed at spot cleaning stations and eyewash stations inspected weekly.',
          },
        ],
      },
      {
        code: 'OEKO-TEX 100',
        name: 'Chemical & Environmental Safety',
        badge: 'High Compliance',
        keyword: 'Chemical',
        clauses: [
          {
            id: 'ENV-1',
            title: 'Chemical Inventory & Restricted Substances',
            finding: 'All spot-cleaning agents and stain removers certified eco-friendly and ZDHC Level 3.',
          },
          {
            id: 'ENV-2',
            title: 'Needle Policy & Metal Detection',
            finding: 'Broken needle log 100% matched with recovered needle fragments.',
          },
        ],
      },
      {
        code: 'WRAP',
        name: 'Worldwide Responsible Accredited Production',
        badge: 'Platinum Grade',
        keyword: 'Production',
        clauses: [
          {
            id: 'WRAP-04',
            title: 'Workplace Environment & Ergonomics',
            finding: 'Adequate lighting (500 lux) provided at final inspection tables.',
          },
          {
            id: 'WRAP-05',
            title: 'Security & Access Control (C-TPAT)',
            finding: 'Finished goods carton packing room securely monitored.',
          },
        ],
      },
    ];

    return baseStandards.map((std) => {
      // Find NCs matching this standard
      const allMatching = complaints.filter((c) => {
        const reqStr = (c.requirement || '').toLowerCase();
        const catStr = (c.category || '').toLowerCase();
        const deptStr = (c.department || '').toLowerCase();
        const kw = std.keyword.toLowerCase();
        return reqStr.includes(std.code.toLowerCase()) || catStr.includes(kw) || deptStr.includes(kw);
      });

      const openCount = allMatching.filter((c) => !['Closed', 'Verified'].includes(c.status)).length;
      const totalCount = allMatching.length;
      const capResolved = allMatching.filter((c) => ['Closed', 'Verified'].includes(c.status)).length;
      const capSubmitted = allMatching.filter((c) =>
        ['CAP Submitted', 'Under Review', 'Under Verification'].includes(c.status)
      ).length;

      const score = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round(((capResolved * 100) + (capSubmitted * 50)) / totalCount)))
        : null;

      const clauses = std.clauses.map((cl, idx) => {
        const clauseNCs = allMatching.filter((c) => !['Closed', 'Verified'].includes(c.status)).filter((_, i) => i % std.clauses.length === idx);
        return {
          ...cl,
          ncCount: clauseNCs.length,
          status: clauseNCs.length === 0 ? 'Compliant' : 'Requires Action',
        };
      });

      return {
        ...std,
        score,
        totalNC: totalCount,
        openNC: openCount,
        clauses,
      };
    });
  }, [complaints]);

  const filtered = standards.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.clauses.some((c) => c.title.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <Shield className="w-4 h-4" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Compliance Standards & Clause Coverage
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time compliance scorecard mapped against international garment certification frameworks.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search standards or clauses..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
      </div>

      {/* Standards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((std) => (
          <div
            key={std.code}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">
                      {std.code}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                      {std.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {std.name}
                  </h3>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {std.score !== null ? `${std.score}%` : '—'}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Adherence
                  </div>
                </div>
              </div>

              {/* Open NC Indicator */}
              <div className="flex items-center gap-2 mb-3 text-xs">
                {std.openNC > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {std.openNC} Open Non-Conformances
                  </span>
                ) : std.totalNC > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    100% Compliant • Zero Active NCs
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <span>⚪</span>
                    No NCs Logged
                  </span>
                )}
              </div>

              {/* Clauses List */}
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                {std.clauses.map((clause) => (
                  <div
                    key={clause.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-[10px]">
                          §{clause.id}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {clause.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {clause.finding}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        clause.status === 'Compliant'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {clause.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RequirementsComplianceView;
