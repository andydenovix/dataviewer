import { LabSample } from '@/types';
import { convertFirestoreTimestampToDate } from './utils';

function csvCell(val: any): string {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function exportSamplesToCSV(
  samples: LabSample[],
  projectMap: Record<string, string>,
  filename = 'samples.csv'
) {
  const headers = [
    'Sample Name', 'Type', 'Application', 'Project',
    'Concentration', 'Unit', '260/280', '260/230',
    'Total Cells/mL', 'Viability (%)', 'Mean Diameter (µm)',
    'Measured At', 'Alerts', 'Last Modified By',
  ];

  const rows = samples.map(s => {
    const date = convertFirestoreTimestampToDate(s.measuredAt);
    const cd = s.metadata?.cellCountData;
    return [
      s.sampleName,
      s.sampleType,
      s.application,
      projectMap[s.projectId ?? ''] ?? '',
      s.concentration != null ? s.concentration.toFixed(4) : '',
      s.metadata?.unit ?? '',
      s.ratios?.['260/280'] != null ? s.ratios['260/280'].toFixed(4) : '',
      s.ratios?.['260/230'] != null ? s.ratios['260/230'].toFixed(4) : '',
      cd?.totalCells != null ? String(cd.totalCells) : '',
      cd?.viability != null ? cd.viability.toFixed(2) : '',
      cd?.meanDiameter != null ? cd.meanDiameter.toFixed(2) : '',
      date ? date.toISOString() : '',
      (s.alerts ?? []).join('; '),
      s.lastModifiedBy ?? '',
    ].map(csvCell);
  });

  const content = [headers.map(csvCell), ...rows].map(r => r.join(',')).join('\n');
  // Prepend BOM so Excel opens UTF-8 correctly
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
