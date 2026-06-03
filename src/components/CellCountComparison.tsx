"use client";

import React, { useState } from 'react';
import { LabSample } from '../types';
import { X, BarChart3 } from 'lucide-react';
import { CellCountMetrics, calculateCellCountStats, extractCellCountMetrics, formatStats } from '@/lib/cellCountStats';
import { BRAND_COLOR } from '@/lib/constants';

export interface CellCountComparisonProps {
  samples: LabSample[];
  onClose: () => void;
}

type DataPoint = 'totalCellCount' | 'liveCells' | 'deadCells' | 'viability';

const DATA_POINT_CONFIG: Record<DataPoint, { label: string; unit: string; color: string; gradientFrom: string; gradientTo: string }> = {
  totalCellCount: {
    label: 'Total Cell Count',
    unit: 'cells',
    color: 'slate',
    gradientFrom: 'from-slate-400',
    gradientTo: 'to-slate-600',
  },
  liveCells: {
    label: 'Live Cells',
    unit: 'cells',
    color: 'emerald',
    gradientFrom: 'from-emerald-400',
    gradientTo: 'to-emerald-600',
  },
  deadCells: {
    label: 'Dead Cells',
    unit: 'cells',
    color: 'red',
    gradientFrom: 'from-red-400',
    gradientTo: 'to-red-600',
  },
  viability: {
    label: 'Viability',
    unit: '%',
    color: 'teal',
    gradientFrom: 'from-teal-400',
    gradientTo: 'to-teal-600',
  },
};

export const CellCountComparison: React.FC<CellCountComparisonProps> = ({ samples, onClose }) => {
  const [activeDataPoint, setActiveDataPoint] = useState<DataPoint>('totalCellCount');

  // Extract cell count metrics from samples
  const sampleMetrics = samples
    .map((sample) => ({
      sample,
      metrics: extractCellCountMetrics(sample.metadata || {}),
    }))
    .filter(({ metrics }) => metrics !== null) as Array<{
      sample: LabSample;
      metrics: CellCountMetrics;
    }>;

  if (sampleMetrics.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-slate-900">Cell Count Comparison</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-slate-600" />
            </button>
          </div>
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">
              No cell count data available for the selected samples.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Please select samples with cell count measurements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const config = DATA_POINT_CONFIG[activeDataPoint];

  // Get values for current data point
  const getValueForDataPoint = (metrics: CellCountMetrics): number => {
    switch (activeDataPoint) {
      case 'totalCellCount':
        return metrics.totalCells;
      case 'liveCells':
        return metrics.liveCells;
      case 'deadCells':
        return metrics.deadCells;
      case 'viability':
        return metrics.viability;
    }
  };

  const values = sampleMetrics.map(({ metrics }) => getValueForDataPoint(metrics));
  const maxValue = Math.max(...values, 1);
  const minValue = activeDataPoint === 'viability' ? 0 : 0;

  // Calculate replicate statistics if multiple samples with same name
  const groupedBySampleName = new Map<string, CellCountMetrics[]>();
  sampleMetrics.forEach(({ sample, metrics }) => {
    const key = sample.sampleName;
    if (!groupedBySampleName.has(key)) {
      groupedBySampleName.set(key, []);
    }
    groupedBySampleName.get(key)!.push(metrics);
  });

  const replicateStats = new Map<string, any>();
  groupedBySampleName.forEach((metricsList, sampleName) => {
    if (metricsList.length > 1) {
      const stats = calculateCellCountStats(metricsList);
      if (stats) {
        let dataPointStats: any = null;
        switch (activeDataPoint) {
          case 'totalCellCount':
            dataPointStats = stats.totalCellCount;
            break;
          case 'liveCells':
            dataPointStats = stats.liveCells;
            break;
          case 'deadCells':
            dataPointStats = stats.deadCells;
            break;
          case 'viability':
            dataPointStats = stats.viability;
            break;
        }
        replicateStats.set(sampleName, dataPointStats);
      }
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="border-b border-slate-200 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Cell Count Comparison</h2>
            <p className="text-sm text-slate-500 mt-1">
              Comparing {sampleMetrics.length} sample{sampleMetrics.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Data Point Selector */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Data Point</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.entries(DATA_POINT_CONFIG) as [DataPoint, (typeof DATA_POINT_CONFIG)[DataPoint]][]).map(
                ([dataPoint, dataConfig]) => (
                  <button
                    key={dataPoint}
                    onClick={() => setActiveDataPoint(dataPoint)}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      activeDataPoint === dataPoint
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                    style={
                      activeDataPoint === dataPoint
                        ? { borderColor: BRAND_COLOR, backgroundColor: `${BRAND_COLOR}10` }
                        : undefined
                    }
                  >
                    <div className="text-xs font-bold text-slate-900">{dataConfig.label}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{dataConfig.unit}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
            <h3 className="font-bold text-slate-900 mb-6">{config.label}</h3>

            <div className="space-y-4">
              {sampleMetrics.map(({ sample, metrics }, index) => {
                const value = getValueForDataPoint(metrics);
                const percentage = (value / maxValue) * 100;
                const stats = replicateStats.get(sample.sampleName);

                return (
                  <div key={sample.id || index} className="space-y-1">
                    <div className="flex justify-between items-baseline">
                      <label className="text-sm font-semibold text-slate-900 flex-1">
                        {sample.sampleName}
                      </label>
                      <span className="font-mono font-bold text-slate-900">
                        {activeDataPoint === 'viability'
                          ? value.toFixed(1)
                          : value.toLocaleString()}
                        <span className="text-xs text-slate-500 ml-1">{config.unit}</span>
                      </span>
                    </div>

                    {/* Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-8 overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} flex items-center justify-end px-3 transition-all`}
                        style={{ width: `${percentage}%` }}
                      >
                        {percentage > 15 && (
                          <span className="text-xs font-bold text-white">
                            {percentage.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Replicate Stats if available */}
                    {stats && (
                      <div className="text-xs text-slate-600 pl-1">
                        Mean: {formatStats(stats).meanStr} | SD: ±{formatStats(stats).sdStr} | CV: {formatStats(stats).cvStr}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Statistics Summary */}
          {replicateStats.size > 0 && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h3 className="font-bold text-slate-900 mb-3 text-sm">Replicate Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {Array.from(replicateStats.entries()).map(([sampleName, stats]) => (
                  <div key={sampleName} className="bg-white p-3 rounded-lg border border-blue-100">
                    <div className="font-semibold text-slate-900 mb-2">{sampleName}</div>
                    <div className="space-y-1 text-slate-700">
                      <div className="flex justify-between">
                        <span>Mean:</span>
                        <span className="font-mono font-bold">
                          {formatStats(stats).meanStr} {config.unit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>SD:</span>
                        <span className="font-mono font-bold">
                          ±{formatStats(stats).sdStr} {config.unit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>CV:</span>
                        <span className="font-mono font-bold">{formatStats(stats).cvStr}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
