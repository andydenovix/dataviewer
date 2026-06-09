import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { parseScientificNum } from './utils';

const HEADER_ALIASES: Record<string, string[]> = {
  sampleName: ['Sample Name', 'Name', 'Sample', 'ID', 'Sample ID', 'Identifier'],
  resultId: ['Result ID', 'ResultID', 'ID'], // Added for your AOPI linking
  application: ['Sample Type', 'Application', 'App', 'Method', 'Calc Method', 'Assay'],
  concentration: ['Concentration from curve', 'Concentration', 'Conc.', 'Amount', 'Result'],
  rfu: ['RFU', 'Relative Fluorescence Units'],
  stockConcentration: ['Sample Stock Concentration'],
  dilutionFactor: ['Dilution Factor'],
  unit: ['Units', 'Unit'],
  curveType: ['Curve Type'],
  measuredAt: ['Date/Time', 'Timestamp', 'Date', 'Time', 'Measurement Date'],
  protocolName: ['Protocol', 'Protocol Name', 'Method Name', 'Assay Protocol'],
  totalCells: ['Total Cell Count', 'Total Cells', 'Cells/mL', 'Total Cells/mL'],
  liveCells: ['Live Cells', 'Live Cell Count', 'Live Cells/mL', 'Viable Cells/mL'],
  deadCells: ['Dead Cells', 'Dead Cell Count', 'Dead Cells/mL', 'Non-Viable Cells/mL'],
  viability: ['% Viability', 'Viability', 'Viability %', 'Cell Viability %', 'Percent Viability']
};

const getNormalizedKey = (header: string): string | null => {
  const trimmed = header.trim();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === trimmed.toLowerCase())) return key;
  }
  return null;
};

const normalizeProtocolName = (value: any): string | null => {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d+$/.test(str)) return null;
  const generic = ['new protocol', 'protocol', 'default', 'unknown', 'none', 'na', 'n/a'];
  if (generic.some(g => str.toLowerCase() === g)) return null;
  if (!/[a-zA-Z0-9]/.test(str)) return null;
  return str;
};

const parseDeNovixSpectralFile = (file: File, isCSV: boolean): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const parseData = (data: any[]) => {
      if (!data || data.length === 0) return [];

      const validData = data.filter(row => {
        const keys = Object.keys(row);
        return !keys.every(k => k.startsWith('__'));
      });

      if (!validData || validData.length === 0) return [];

      const headers = Object.keys(validData[0] || {});
      const wavelengthMap = new Map<number, string>();
      
      headers.forEach(header => {
        const trimmed = header.trim();
        const numHeader = parseFloat(trimmed);
        if (!isNaN(numHeader) && String(numHeader) === trimmed) {
          wavelengthMap.set(numHeader, header);
        }
      });
      const sortedWavelengths = Array.from(wavelengthMap.keys()).sort((a, b) => a - b);

      return validData.map((row: any) => {
          const wavelengths: number[] = [];
          const absorbance: number[] = [];
          const ratios: Record<string, number> = {};
          const alerts: string[] = [];
          const metadata: Record<string, any> = {};
          
          let sampleName, application, concentration, rfu, stockConcentration, dilutionFactor, unit, curveType, rawDate, protocolName, totalCells, liveCells, deadCells, viability;

          // Extract spectral data using verified numeric map (Fixed)
          sortedWavelengths.forEach(wl => {
            const rawVal = row[wavelengthMap.get(wl)!];
            const val = parseFloat(rawVal);
            if (!isNaN(val)) {
              wavelengths.push(wl);
              absorbance.push(val);
            }
          });

          // Extract Metadata
          Object.entries(row).forEach(([key, val]) => {
            if (wavelengthMap.values().next().value !== undefined && Array.from(wavelengthMap.values()).includes(key)) return;

            const cleanKey = key.trim();
            const lowerKey = cleanKey.toLowerCase();
            const normalizedKey = getNormalizedKey(cleanKey);

            if ((cleanKey === '260/280' || cleanKey === '260/230') && typeof val === 'number') {
              ratios[cleanKey] = val;
            } else if (normalizedKey === 'sampleName') {
              sampleName = String(val);
            } else if (normalizedKey === 'application') {
              application = String(val);
            } else if (normalizedKey === 'concentration') {
              concentration = parseScientificNum(val);
            } else if (normalizedKey === 'rfu') {
              rfu = parseScientificNum(val);
            } else if (normalizedKey === 'unit') {
              unit = String(val);
            } else if (normalizedKey === 'measuredAt') {
              rawDate = String(val);
            } else if (normalizedKey === 'protocolName') {
              const normalized = normalizeProtocolName(val);
              if (normalized) protocolName = normalized;
            } else if (normalizedKey === 'totalCells') {
              totalCells = parseScientificNum(val);
            } else if (normalizedKey === 'liveCells') {
              liveCells = parseScientificNum(val);
            } else if (normalizedKey === 'deadCells') {
              deadCells = parseScientificNum(val);
            } else if (normalizedKey === 'viability') {
              viability = parseScientificNum(val);
            } else {
              metadata[key] = val; 
            }
          });

          return { 
            wavelengths, absorbance, ratios, alerts, metadata, sampleName, application, 
            concentration, rfu, stockConcentration, dilutionFactor, unit, curveType, rawDate, 
            protocolName, totalCells, liveCells, deadCells, viability, rawRow: row 
          };
        });
    };

    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const firstLine = lines[0]?.trim().toUpperCase() || '';
        const isCellDropFormat = firstLine.includes('AO/PI') || firstLine.includes('TRYPAN') || firstLine.includes('CELL');
        const csvText = isCellDropFormat ? lines.slice(1).join('\n') : text;
        
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => resolve(parseData(results.data)),
          error: (error: any) => reject(error)
        });
      };
      reader.readAsText(file);
    } else {
      file.arrayBuffer().then(data => {
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
        let parsedData = jsonData;
        if (jsonData.length > 0) {
          const firstValue = String(Object.values(jsonData[0])[0] || '').trim().toUpperCase();
          if (Object.keys(jsonData[0]).length === 1 || firstValue.includes('AO/PI') || firstValue.includes('TRYPAN')) {
            parsedData = jsonData.slice(1);
          }
        }
        resolve(parseData(parsedData));
      }).catch(reject);
    }
  });
};

export const parseSpectroCSV = (file: File) => parseDeNovixSpectralFile(file, true);
export const parseSpectroExcel = (file: File) => parseDeNovixSpectralFile(file, false);
export const parseFile = async (file: File) => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.csv') ? parseSpectroCSV(file) : parseSpectroExcel(file);
};