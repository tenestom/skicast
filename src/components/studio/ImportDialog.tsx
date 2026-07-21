import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import type { Skier } from '../../types/broadcast';
import './ImportDialog.css';

// Set up pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (skiers: Skier[]) => void;
}

export function ImportDialog({ isOpen, onClose, onImport }: ImportDialogProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPasteText(text);
    
    // Parse TSV (Excel paste)
    const rows = text.trim().split('\n').map(row => row.split('\t').map(c => c.trim()));
    setParsedRows(rows.filter(r => r.length > 0 && r.some(c => c)));
    autoMapColumns(rows[0] || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setPasteText('');

    try {
      if (file.name.endsWith('.pdf')) {
        await parsePDF(file);
      } else {
        await parseSpreadsheet(file);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to parse file.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const parseSpreadsheet = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    // Convert to arrays of strings
    const json = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    const rows = json.map(row => row.map(cell => String(cell).trim()));
    const validRows = rows.filter(r => r.length > 0 && r.some(c => c));
    setParsedRows(validRows);
    autoMapColumns(validRows[0] || []);
  };

  const parsePDF = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extractedRows: string[][] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Group items by Y coordinate to form rows
      const rowMap = new Map<number, { text: string; x: number }[]>();
      
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5]);
        const x = Math.round(item.transform[4]);
        
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y)!.push({ text: item.str, x });
      }

      // Sort rows top to bottom (highest Y usually first in PDF, so sort descending)
      const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);
      
      for (const y of sortedY) {
        const items = rowMap.get(y)!;
        // Sort items left to right
        items.sort((a, b) => a.x - b.x);
        // Collapse items into columns if they are far apart, or just join them
        // For simplicity, we just take them as columns
        const rowData = items.map(i => i.text.trim()).filter(Boolean);
        if (rowData.length > 0) {
          extractedRows.push(rowData);
        }
      }
    }

    setParsedRows(extractedRows);
    autoMapColumns(extractedRows[0] || []);
  };

  const autoMapColumns = (headerRow: string[]) => {
    const newCols: Record<number, string> = {};
    const headerLower = headerRow.map(h => h.toLowerCase());
    
    headerLower.forEach((h, i) => {
      if (h.includes('name') || h.includes('skier')) newCols[i] = 'name';
      else if (h.includes('club') || h.includes('team')) newCols[i] = 'club';
      else if (h.includes('class') || h.includes('division')) newCols[i] = 'className';
      else if (h.includes('bib')) newCols[i] = 'bib';
      else if (h.includes('fed') || h.includes('country')) newCols[i] = 'federation';
    });
    setColumns(newCols);
  };

  const handleImport = () => {
    const nameColIdx = Object.keys(columns).find(k => columns[Number(k)] === 'name');
    if (nameColIdx === undefined) {
      alert('You must map at least one column to "Name"');
      return;
    }

    const skiers: Skier[] = parsedRows.map((row, i) => {
      // Skip header row if it seems like a header
      if (i === 0 && row[Number(nameColIdx)]?.toLowerCase().includes('name')) return null;

      const skier: Skier = {
        id: crypto.randomUUID(),
        name: '',
        club: '',
        className: '',
        bib: '',
        federation: '',
      };

      Object.entries(columns).forEach(([colIdxStr, fieldName]) => {
        const colIdx = Number(colIdxStr);
        const val = row[colIdx];
        if (val && (skier as any)[fieldName] !== undefined) {
          (skier as any)[fieldName] = val;
        }
      });

      if (!skier.name) return null;
      return skier;
    }).filter(Boolean) as Skier[];

    onImport(skiers);
    onClose();
  };

  const availableFields = ['name', 'club', 'className', 'bib', 'federation'];

  return (
    <div className="import-modal-overlay">
      <div className="import-modal">
        <h2 className="import-modal__title">Import Skiers</h2>
        
        <div className="import-modal__methods">
          <div className="import-modal__method">
            <h3>Paste Data</h3>
            <p>Paste cells directly from Excel, Google Sheets, or Word.</p>
            <textarea 
              className="import-modal__textarea"
              placeholder="Paste rows here..."
              value={pasteText}
              onChange={handlePaste}
            />
          </div>
          
          <div className="import-modal__method">
            <h3>Upload File</h3>
            <p>Support for CSV, XLSX, and PDF Start Lists.</p>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls,.pdf"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {loading && <p>Parsing file...</p>}

        {parsedRows.length > 0 && (
          <div className="import-modal__preview">
            <h3>Column Mapping</h3>
            <p>Assign data fields to the imported columns.</p>
            
            <div className="import-modal__table-wrapper">
              <table className="import-modal__table">
                <thead>
                  <tr>
                    {parsedRows[0].map((_, i) => (
                      <th key={i}>
                        <select 
                          value={columns[i] || ''} 
                          onChange={(e) => setColumns(prev => ({ ...prev, [i]: e.target.value }))}
                        >
                          <option value="">Ignore</option>
                          {availableFields.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="import-modal__note">Showing first 5 rows of {parsedRows.length}</p>
          </div>
        )}

        <div className="import-modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn--primary" 
            disabled={parsedRows.length === 0}
            onClick={handleImport}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
