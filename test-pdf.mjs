import './polyfill.mjs';
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

async function testPdf() {
  const data = new Uint8Array(fs.readFileSync('invite.pdf'));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  
  let extractedRows = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group items by Y coordinate to form rows
    const rowMap = new Map();
    
    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y).push({ text: item.str, x });
    }

    // Sort rows top to bottom (highest Y usually first in PDF, so sort descending)
    const sortedY = Array.from(rowMap.keys()).sort((a, b) => b - a);
    
    for (const y of sortedY) {
      const items = rowMap.get(y);
      // Sort items left to right
      items.sort((a, b) => a.x - b.x);
      
      const rowData = items.map(i => i.text.trim()).filter(Boolean);
      if (rowData.length > 0) {
        extractedRows.push(rowData);
      }
    }
  }

  console.log("Extracted Rows (first 20):");
  extractedRows.slice(0, 20).forEach((row, i) => {
    console.log(`[${i}]`, row);
  });
}

testPdf().catch(console.error);
