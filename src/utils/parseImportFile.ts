import * as XLSX from "xlsx";
import { parseExcelToRows } from "./excel";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

function detectDelimiter(sampleLine: string): "," | "\t" {
  const tabs = (sampleLine.match(/\t/g) || []).length;
  const commas = (sampleLine.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

function parseDelimitedTextToRows(text: string, delimiter: "," | "\t"): Record<string, unknown>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    if (delimiter === "\t") {
      return line.split("\t").map((c) => c.trim());
    }
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (!inQ && c === ",") {
        out.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, unknown>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseLine(lines[li]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      const key = String(h || `Column${j + 1}`).trim();
      row[key] = cells[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function rowsFromXlsxData(data: Uint8Array | string, type: "array" | "string"): Record<string, unknown>[] {
  const wb = type === "array" ? XLSX.read(data, { type: "array" }) : XLSX.read(data as string, { type: "string" });
  const sn = wb.SheetNames[0];
  if (!sn) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { defval: "", raw: false });
}

/**
 * Turn uploaded files into header→value row objects (same shape as Excel import).
 * Supports .xlsx, .xls, .csv, .tsv, .txt, .docx (table-like text). Other types tried as spreadsheet or delimited text.
 */
export async function parseTabularFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (ext === ".xlsx" || ext === ".xls") {
    return parseExcelToRows(file);
  }

  if (ext === ".csv") {
    const t = await readFileAsText(file);
    return parseDelimitedTextToRows(t, ",");
  }

  if (ext === ".tsv") {
    const t = await readFileAsText(file);
    return parseDelimitedTextToRows(t, "\t");
  }

  if (ext === ".txt") {
    const t = await readFileAsText(file);
    const first = t.split(/\r?\n/).find((l) => l.trim()) || "";
    const d = detectDelimiter(first);
    return parseDelimitedTextToRows(t, d);
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    const line =
      value.split(/\r?\n/).find((l) => l.includes("\t") || l.includes(",")) || value.split(/\r?\n/)[0] || "";
    const d = detectDelimiter(line);
    const rows = parseDelimitedTextToRows(value, d);
    if (rows.length) return rows;
    throw new Error(
      "Could not find table rows in this Word file. Use a table or line-based CSV in the document, or Excel/CSV."
    );
  }

  if (ext === ".doc") {
    throw new Error(
      "Old Word .doc format is not supported. Save as .docx, .xlsx, or .csv, then upload again."
    );
  }

  const buf = await file.arrayBuffer();
  try {
    const rows = rowsFromXlsxData(new Uint8Array(buf), "array");
    if (rows.length) return rows;
  } catch {
    /* try text */
  }

  const t = await readFileAsText(file);
  try {
    const rows = rowsFromXlsxData(t, "string");
    if (rows.length) return rows;
  } catch {
    /* try delimited */
  }

  const first = t.split(/\r?\n/).find((l) => l.trim()) || "";
  if (first) {
    const d = detectDelimiter(first);
    const rows = parseDelimitedTextToRows(t, d);
    if (rows.length) return rows;
  }

  throw new Error("Could not read this file as a table. Use Excel (.xlsx), CSV, or tab-separated text.");
}
