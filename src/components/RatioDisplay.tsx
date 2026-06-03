"use client";

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const RatioDisplay: React.FC<{ value?: number; alert?: string }> = ({ value, alert }) => {
  const alertText = String(alert || '').toLowerCase().trim();
  const hasValue = typeof value === 'number' && value !== 0;

  if (alertText.includes('below min concentration')) {
    return (
      <div className="flex items-center gap-1 text-amber-500 group relative cursor-help">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-mono">{hasValue ? value!.toFixed(2) : '—'}</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-xl">
          Concentration too low for accurate ratio
        </div>
      </div>
    );
  }

  let colorClass = 'text-slate-600';
  let showCircle = false;
  let circleColor = 'bg-slate-300';

  if (alertText.includes('met criteria')) {
    colorClass = 'text-emerald-600 font-bold';
    showCircle = true;
    circleColor = 'bg-emerald-500';
  } else if (
    alertText !== '' && 
    alertText !== '-' && 
    alertText !== 'none' && 
    alertText !== 'n/a' &&
    alertText !== 'null' &&
    alertText !== 'undefined'
  ) {
    colorClass = 'text-red-600 font-bold';
    showCircle = true;
    circleColor = 'bg-red-500';
  }

  return (
    <div className="flex items-center gap-1.5">
      {showCircle && <div className={`h-2 w-2 rounded-full ${circleColor} shrink-0`} />}
      <span className={`font-mono ${colorClass}`}>{hasValue ? value!.toFixed(2) : '—'}</span>
    </div>
  );
};