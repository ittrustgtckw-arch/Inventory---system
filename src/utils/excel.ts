import * as XLSX from "xlsx";

export function downloadExcel(filename: string, rows: Record<string, string>[]) {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const name = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

/** First worksheet → array of row objects (string cell values). */
export function parseExcelToRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result;
        if (!(buf instanceof ArrayBuffer)) {
          resolve([]);
          return;
        }
        const data = new Uint8Array(buf);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          resolve([]);
          return;
        }
        const sheet = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
        resolve(json);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Invalid Excel file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}
