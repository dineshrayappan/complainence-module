import React from 'react';
import {
  Clock,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  ArrowUpRight,
} from 'lucide-react';

export const KpiMetrics = ({ metrics, onSelectTab }) => {
  const cards = [
    {
      title: 'Open NCs',
      value: metrics?.open ?? metrics?.activeTickets ?? 0,
      subtext: 'Floor Rectifications Pending',
      icon: Clock,
      tabKey: 'open',
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      badgeText: null,
      borderStyle: 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500',
    },
    {
      title: 'CAP Submitted / Review',
      value:
        (metrics?.capSubmitted !== undefined || metrics?.underReview !== undefined)
          ? (Number(metrics?.capSubmitted) || 0) + (Number(metrics?.underReview) || 0)
          : (Number(metrics?.underVerification) || 0),
      subtext: 'Awaiting Audit Review & Verification',
      icon: ClipboardCheck,
      tabKey: 'cap-submitted',
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      badgeText:
        ((metrics?.capSubmitted !== undefined || metrics?.underReview !== undefined)
          ? (Number(metrics?.capSubmitted) || 0) + (Number(metrics?.underReview) || 0)
          : (Number(metrics?.underVerification) || 0)) > 0
          ? 'Action Req'
          : null,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
      borderStyle: 'border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500',
    },
    {
      title: 'Overdue Deadline Alerts',
      value: Number(metrics?.overdueCount) || 0,
      subtext: 'Exceeded SLA Window (Any Status)',
      icon: Flame,
      tabKey: 'all',
      iconBg: (Number(metrics?.overdueCount) || 0) > 0
        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      badgeText: (Number(metrics?.overdueCount) || 0) > 0 ? 'CRITICAL' : null,
      badgeColor: 'bg-rose-600 text-white animate-pulse',
      borderStyle: (Number(metrics?.overdueCount) || 0) > 0
        ? 'border-rose-300 dark:border-rose-600 bg-rose-50/40 dark:bg-rose-950/20'
        : 'border-slate-200 dark:border-slate-800',
    },
    {
      title: 'Verified & Closed NCs',
      value:
        (metrics?.closed !== undefined || metrics?.verified !== undefined)
          ? (Number(metrics?.closed) || 0) + (Number(metrics?.verified) || 0)
          : (Number(metrics?.closedTickets) || 0),
      subtext: 'Verified Effective & Sealed',
      icon: CheckCircle2,
      tabKey: 'closed',
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      badgeText: null,
      borderStyle: 'border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 my-4 sm:my-6">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            onClick={() => onSelectTab(card.tabKey)}
            className={`relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-3 sm:p-5 border ${card.borderStyle} transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md active:scale-[0.98] group flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${card.iconBg} flex items-center justify-center transition-colors shrink-0`}
              >
                <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {card.badgeText && (
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider rounded-md shrink-0 ${card.badgeColor}`}
                  >
                    {card.badgeText}
                  </span>
                )}
                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
              </div>
            </div>

            <div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans">
                {card.value}
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                {card.title}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {card.subtext}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KpiMetrics;
