export function normalizeHeaderKey(k: string): string {
  return String(k ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Match first column whose header normalizes to one of the candidate labels. */
export function getRowValue(row: Record<string, unknown>, candidates: string[]): string {
  if (!row || typeof row !== "object") return "";
  const want = new Set(candidates.map((c) => normalizeHeaderKey(c)));
  for (const [key, val] of Object.entries(row)) {
    if (want.has(normalizeHeaderKey(key))) return String(val ?? "").trim();
  }
  return "";
}

export function isBlankDataRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => String(v ?? "").trim() === "");
}
