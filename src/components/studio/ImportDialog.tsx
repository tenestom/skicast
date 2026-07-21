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
  const [isConfident, setIsConfident] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPasteText(text);
    
    // Parse TSV (Excel paste)
    const rows = text.trim().split('\n').map(row => row.split('\t').map(c => c.trim()));
    analyzeAndMapColumns(rows);
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
    analyzeAndMapColumns(rows);
  };

  const parsePDF = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extractedRows: string[][] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const rowMap = new Map<number, { text: string; x: number }[]>();
      const Y_TOLERANCE = 4;
      
      // 1. Group items by Y coordinate with tolerance
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const text = item.str.trim();
        if (!text) continue;

        const y = item.transform[5];
        const x = item.transform[4];
        
        let matchedY = -1;
        for (const existingY of rowMap.keys()) {
          if (Math.abs(existingY - y) <= Y_TOLERANCE) {
            matchedY = existingY;
            break;
          }
        }
        
        if (matchedY === -1) {
          matchedY = y;
          rowMap.set(matchedY, []);
        }
        
        rowMap.get(matchedY)!.push({ text, x });
      }

      const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);

      // 2. Sort horizontally and merge close words
      const pageRows = sortedY.map(y => {
        const items = rowMap.get(y)!;
        items.sort((a, b) => a.x - b.x);
        
        const merged: { text: string; x: number }[] = [];
        for (const item of items) {
          if (merged.length === 0) {
            merged.push(item);
          } else {
            const last = merged[merged.length - 1];
            // If words are closer than ~15px + character width, merge them
            if (item.x - last.x < 15 + (last.text.length * 5)) {
              last.text += ' ' + item.text;
            } else {
              merged.push(item);
            }
          }
        }
        return merged;
      });

      // 3. Establish column boundaries based on the row with the most items, or a header row
      let columnXs: number[] = [];
      for (const row of pageRows) {
        if (row.some(i => /name|competitor|skier|club|team|class/i.test(i.text))) {
          columnXs = row.map(i => i.x);
          break;
        }
      }
      
      if (columnXs.length === 0) {
        let maxItems = 0;
        for (const row of pageRows) {
          if (row.length > maxItems) {
            maxItems = row.length;
            columnXs = row.map(i => i.x);
          }
        }
      }

      // 4. Map items to columns
      for (const row of pageRows) {
        const rowData = new Array(columnXs.length).fill('');
        for (const item of row) {
          let closestCol = -1;
          let minDiff = Infinity;
          for (let i = 0; i < columnXs.length; i++) {
            const diff = Math.abs(columnXs[i] - item.x);
            if (diff < minDiff && diff < 80) { // Tolerate some alignment drift
              minDiff = diff;
              closestCol = i;
            }
          }
          if (closestCol !== -1) {
            rowData[closestCol] = rowData[closestCol] ? rowData[closestCol] + ' ' + item.text : item.text;
          } else {
            rowData.push(item.text);
          }
        }
        if (rowData.some(cell => cell.trim())) {
          extractedRows.push(rowData);
        }
      }
    }

    console.log('[ImportDialog] PDF Extracted Rows:', extractedRows);
    analyzeAndMapColumns(extractedRows);
  };

  const analyzeAndMapColumns = (rows: string[][]) => {
    let confident = false;
    const newCols: Record<number, string> = {};
    let dataStartRow = 0;

    // 1. Try to find a header row (in first 10 rows)
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const row = rows[r].map(c => c.toLowerCase());
      let matches = 0;
      const tempCols: Record<number, string> = {};
      
      row.forEach((h, i) => {
        if (/name|competitor|skier/.test(h)) { tempCols[i] = 'name'; matches++; }
        else if (/club|team/.test(h)) { tempCols[i] = 'club'; matches++; }
        else if (/category|class|division/.test(h)) { tempCols[i] = 'className'; matches++; }
        else if (/bib|start number|stno/.test(h)) { tempCols[i] = 'bib'; matches++; }
        else if (/fed|country|nation/.test(h)) { tempCols[i] = 'federation'; matches++; }
      });

      if (matches >= 2) {
        // High confidence we found a header
        confident = true;
        Object.assign(newCols, tempCols);
        dataStartRow = r + 1;
        break;
      }
    }

    // 2. If no header found, use heuristics on the first full row
    if (!confident && rows.length > 0) {
      // Find the first row that has at least 3 columns of data
      const firstDataRowIdx = rows.findIndex(r => r.filter(c => c.trim()).length >= 3);
      if (firstDataRowIdx !== -1) {
        const row = rows[firstDataRowIdx];
        let nameAssigned = false;
        let bibAssigned = false;
        let classAssigned = false;

        row.forEach((cell, i) => {
          const val = cell.trim();
          if (!val) return;

          // Looks like a bib number?
          if (!bibAssigned && /^\d{1,3}$/.test(val)) {
            newCols[i] = 'bib';
            bibAssigned = true;
          }
          // Looks like a Class/Category? (e.g. U14, U17, Open, O35, M1, F1)
          else if (!classAssigned && /^(u\d{2}|open|o\d{2}|[mf]\d)$/i.test(val)) {
            newCols[i] = 'className';
            classAssigned = true;
          }
          // Looks like a name? (2 or more words, no numbers)
          else if (!nameAssigned && /^[a-zA-ZÀ-ÿ\s\-']+$/.test(val) && val.includes(' ')) {
            newCols[i] = 'name';
            nameAssigned = true;
          }
          // Leftover strings could be club or federation
          else if (val.length <= 3 && /^[A-Z]{3}$/.test(val)) {
            newCols[i] = 'federation';
          }
          else if (val.length > 3 && !/^\d+$/.test(val)) {
            newCols[i] = 'club';
          }
        });

        if (nameAssigned) {
          confident = true;
        }
      }
    }

    console.log('[ImportDialog] Final Column Mapping:', newCols);
    console.log('[ImportDialog] Confident:', confident);
    
    setColumns(newCols);
    setIsConfident(confident);
    // Keep all rows, but we will filter out empty ones
    const finalRows = rows.slice(dataStartRow).filter(r => r.length > 0 && r.some(c => c.trim()));
    setParsedRows(finalRows);
  };

  const handleImport = () => {
    const nameColIdx = Object.keys(columns).find(k => columns[Number(k)] === 'name');
    if (nameColIdx === undefined) {
      alert('You must map at least one column to "Name"');
      return;
    }

    const skiers: Skier[] = parsedRows.map((row) => {

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
                        {isConfident ? (
                          <div className="import-modal__confident-header">
                            {columns[i] || 'Ignored'}
                          </div>
                        ) : (
                          <select 
                            value={columns[i] || ''} 
                            onChange={(e) => setColumns(prev => ({ ...prev, [i]: e.target.value }))}
                          >
                            <option value="">Ignore</option>
                            {availableFields.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        )}
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
