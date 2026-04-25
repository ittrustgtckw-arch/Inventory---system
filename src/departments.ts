export const BUSINESS_DEPARTMENTS = ["trading", "freelancer", "factory"] as const;
export type BusinessDepartment = (typeof BUSINESS_DEPARTMENTS)[number];

const LABELS: Record<"en" | "ar", Record<BusinessDepartment, string>> = {
  en: {
    trading: "Trading",
    freelancer: "Freelancer",
    factory: "Factory",
  },
  ar: {
    trading: "التجارة",
    freelancer: "العمل الحر",
    factory: "المصنع",
  },
};

export const BUSINESS_DEPARTMENT_LABELS: Record<BusinessDepartment, string> = LABELS.en;

/** Strip zero-width / BOM so API values still match trading | freelancer | factory. */
function scrubDepartmentInput(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export function getBusinessDepartmentLabel(dept: BusinessDepartment, lang: "en" | "ar" = "en"): string {
  return LABELS[lang]?.[dept] || LABELS.en[dept];
}

/** Same idea as server `normalizeBusinessDepartment`: codes plus en/ar labels. */
export function normalizeBusinessDepartment(v: unknown): BusinessDepartment {
  const raw = scrubDepartmentInput(v);
  if (!raw) return "trading";
  const s = raw.toLowerCase();
  if ((BUSINESS_DEPARTMENTS as readonly string[]).includes(s)) return s as BusinessDepartment;
  const labelMap: Record<BusinessDepartment, readonly string[]> = {
    trading: ["trading", "التجارة"],
    freelancer: ["freelancer", "العمل الحر"],
    factory: ["factory", "المصنع"],
  };
  for (const d of BUSINESS_DEPARTMENTS) {
    for (const lab of labelMap[d]) {
      if (lab.toLowerCase() === s) return d;
    }
  }
  return "trading";
}

/** Accepts department code or display label (e.g. Factory / factory). */
export function departmentFromLabelOrCode(v: unknown): BusinessDepartment {
  const s = scrubDepartmentInput(v);
  if (!s) return "trading";
  const lower = s.toLowerCase();
  if ((BUSINESS_DEPARTMENTS as readonly string[]).includes(lower)) return lower as BusinessDepartment;
  for (const d of BUSINESS_DEPARTMENTS) {
    if (LABELS.en[d].toLowerCase() === lower) return d;
    if (LABELS.ar[d].toLowerCase() === lower) return d;
  }
  return normalizeBusinessDepartment(s);
}

/** Dashboard / reports: bucket stock + sold rows by business department (must match KPI list fetches). */
export function aggregateInventoryByDepartment(
  stock: ReadonlyArray<{ department?: unknown }>,
  sold: ReadonlyArray<{ department?: unknown }>
): Record<BusinessDepartment, { stock: number; sold: number }> {
  const next: Record<BusinessDepartment, { stock: number; sold: number }> = {
    trading: { stock: 0, sold: 0 },
    freelancer: { stock: 0, sold: 0 },
    factory: { stock: 0, sold: 0 },
  };
  for (const row of stock) {
    next[departmentFromLabelOrCode(row?.department)].stock += 1;
  }
  for (const row of sold) {
    next[departmentFromLabelOrCode(row?.department)].sold += 1;
  }
  return next;
}
