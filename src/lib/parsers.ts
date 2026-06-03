import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { SpectroData } from '../types';
import { parseScientificNum } from './utils';

/**
 * Scalable mapping for different application header formats.
 * As you encounter new file formats, simply add the new header strings to these arrays.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  sampleName: ['Sample Name', 'Name', 'Sample', 'ID', 'Sample ID', 'Identifier'],
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
  const trimmed = header.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === trimmed)) return key;
  }
  return null;
};

/**
 * Validates and normalizes protocol names.
 * Filters out invalid values like row numbers, generic placeholders, etc.
 */
const normalizeProtocolName = (value: any): string | null => {
  if (!value) return null;

  const str = String(value).trim();

  // Filter out pure numbers (likely row IDs or errors)
  if (/^\d+$/.test(str)) {
    console.warn(`Protocol name appears to be a number: ${str}, skipping`);
    return null;
  }

  // Filter out generic placeholders
  const generic = ['new protocol', 'protocol', 'default', 'unknown', 'none', 'na', 'n/a'];
  if (generic.some(g => str.toLowerCase() === g)) {
    return null;
  }

  // Must have some alphanumeric content
  if (!/[a-zA-Z0-9]/.test(str)) {
    return null;
  }

  return str;
};

/**
 * Parses DeNovix CSV/Excel files where wavelengths are column headers.
 * It extracts spectral data, purity ratios, alerts, and other metadata for each sample row.
 *
 * @param file The CSV or Excel file to parse.
 * @returns A promise that resolves to an array of processed sample objects.
 */
const parseDeNovixSpectralFile = (file: File, isCSV: boolean): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const parseData = (data: any[]) => {
      if (!data || data.length === 0) {
        return [];
      }

      // Filter out any rows that are entirely metadata or malformed (like __parsed_extra)
      const validData = data.filter(row => {
        const keys = Object.keys(row);
        // Skip rows that only have metadata keys like __parsed_extra
        return !keys.every(k => k.startsWith('__'));
      });

      if (!validData || validData.length === 0) {
        return [];
      }

      const headers = Object.keys(validData[0] || {});
      const wavelengthHeaders: number[] = [];

      // Identify wavelength headers: must be a pure number, not a ratio like "260/280"
      headers.forEach(header => {
        const trimmed = header.trim();
        const numHeader = parseFloat(trimmed);
        if (!isNaN(numHeader) && String(numHeader) === trimmed) {
          wavelengthHeaders.push(numHeader);
        }
      });
      wavelengthHeaders.sort((a, b) => a - b); // Ensure wavelengths are sorted

      return validData.map((row: any) => {
          const wavelengths: number[] = [];
          const absorbance: number[] = [];
          const ratios: Record<string, number> = {};
          const alerts: string[] = [];
          const metadata: Record<string, any> = {};
          let concentration: number | undefined;
          let application: string | undefined;
          let sampleName: string | undefined;
          let unit: string | undefined;
          let rfu: number | undefined;
          let stockConcentration: number | undefined;
          let dilutionFactor: number | undefined;
          let curveType: string | undefined;
          let rawDate: string | undefined;
          let protocolName: string | undefined;
          let totalCells: number | undefined;
          let liveCells: number | undefined;
          let deadCells: number | undefined;
          let viability: number | undefined;

          // Extract spectral data
          wavelengthHeaders.forEach(wl => {
            const val = row[String(wl)];
            if (val !== undefined && typeof val === 'number') {
              wavelengths.push(wl);
              absorbance.push(val);
            }
          });

          // Extract specific metadata and ratios
          Object.entries(row).forEach(([key, val]) => {
            const cleanKey = key.trim();
            
            // Only skip if the header is exactly one of our identified wavelength numbers
            if (wavelengthHeaders.some(wl => String(wl) === cleanKey)) {
              return;
            }

            const lowerKey = cleanKey.toLowerCase();
            const normalizedKey = getNormalizedKey(cleanKey);

            // 1. Capture Purity Ratios (headers like "260/280")
            if ((cleanKey === '260/280' || cleanKey === '260/230') && typeof val === 'number') {
              ratios[cleanKey] = val;
            }
            // 2. Capture specific alert messages for ratios
            else if (lowerKey.includes('alert') && lowerKey.includes('260/280')) {
              metadata['260/280 Alert'] = String(val);
            } else if (lowerKey.includes('alert') && lowerKey.includes('260/230')) {
              metadata['260/230 Alert'] = String(val);
            }
            // 3. Normalized Mappings (Name, Conc, Date, etc.)
            else if (normalizedKey === 'sampleName') {
              sampleName = String(val);
            } else if (normalizedKey === 'application') {
              application = String(val);
            } else if (normalizedKey === 'concentration') {
              concentration = parseScientificNum(val);
            } else if (normalizedKey === 'rfu') {
              rfu = parseScientificNum(val);
            } else if (normalizedKey === 'stockConcentration') {
              stockConcentration = parseScientificNum(val);
            } else if (normalizedKey === 'dilutionFactor') {
              dilutionFactor = parseScientificNum(val);
            } else if (normalizedKey === 'unit') {
              unit = String(val);
            } else if (normalizedKey === 'curveType') {
              curveType = String(val);
            } else if (normalizedKey === 'measuredAt') {
              rawDate = String(val);
            } else if (normalizedKey === 'protocolName') {
              const normalized = normalizeProtocolName(val);
              if (normalized) {
                protocolName = normalized;
              }
            } else if (normalizedKey === 'totalCells') {
              totalCells = parseScientificNum(val);
            } else if (normalizedKey === 'liveCells') {
              liveCells = parseScientificNum(val);
            } else if (normalizedKey === 'deadCells') {
              deadCells = parseScientificNum(val);
            } else if (normalizedKey === 'viability') {
              viability = parseScientificNum(val);
            }
            // 4. Fallback: general alerts or metadata
            else if (typeof val === 'string' && lowerKey.includes('concentration')) {
              alerts.push(val);
            } else {
              metadata[key] = val; 
            }
          });

          // Return rawDate explicitly so FileUpload knows which metadata key to parse
          return { 
            wavelengths, absorbance, ratios, alerts, metadata, sampleName, application, 
            concentration, rfu, stockConcentration, dilutionFactor, unit, curveType, rawDate, 
            protocolName, totalCells, liveCells, deadCells, viability, rawRow: row 
          };
        });
    };

    if (isCSV) {
      // Read file as text first to detect CellDrop format
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        
        // Detect CellDrop format: if first line contains protocol keywords
        const firstLine = lines[0]?.trim().toUpperCase() || '';
        const isCellDropFormat = firstLine.includes('AO/PI') || firstLine.includes('TRYPAN') || firstLine.includes('CELL');
        
        // Skip first row if it's a CellDrop protocol title
        const csvText = isCellDropFormat ? lines.slice(1).join('\n') : text;
        
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => resolve(parseData(results.data)),
          error: (error: any) => reject(error)
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    } else { // Excel
      file.arrayBuffer().then(data => {
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
        
        // Handle CellDrop format: skip first row if it's a protocol title
        let parsedData = jsonData;
        if (jsonData.length > 0) {
          const firstRowKeys = Object.keys(jsonData[0]);
          const firstValue = String(Object.values(jsonData[0])[0] || '').trim().toUpperCase();
          
          // If first row looks like a protocol/title (single field or contains protocol keywords), skip it
          if (firstRowKeys.length === 1 || firstValue.includes('AO/PI') || firstValue.includes('TRYPAN')) {
            parsedData = jsonData.slice(1);
          }
        }
        
        resolve(parseData(parsedData));
      }).catch(reject);
    }
  });
};

export const parseSpectroCSV = (file: File): Promise<any[]> => {
  return parseDeNovixSpectralFile(file, true);
};

export const parseSpectroExcel = (file: File): Promise<any[]> => {
  return parseDeNovixSpectralFile(file, false);
};

/**
 * Orchestrates parsing and returns an array of sample data.
 */
export const parseFile = async (file: File): Promise<any[]> => {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.csv')) {
    return parseSpectroCSV(file);
  }
  return parseSpectroExcel(file);
};