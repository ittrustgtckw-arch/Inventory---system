export type CompanyId = "trust_general" | "trust_factory";

export type CompanyMeta = {
  id: CompanyId;
  name: string;
};

const STORAGE_KEY = "selectedCompanyId";
const DEFAULT_COMPANY_ID: CompanyId = "trust_general";
export const COMPANY_CHANGED_EVENT = "app-company-changed";
let memorySelectedCompanyId: CompanyId = DEFAULT_COMPANY_ID;

const KNOWN_COMPANIES: Record<CompanyId, CompanyMeta> = {
  trust_general: {
    id: "trust_general",
    name: "Trust General Trading & Contracting SPC",
  },
  trust_factory: {
    id: "trust_factory",
    name: "Trust Factory For Fabrications",
  },
};

export function normalizeCompanyId(raw: string | null | undefined): CompanyId {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "trust_factory" || value === "factory") return "trust_factory";
  return DEFAULT_COMPANY_ID;
}

export function getSelectedCompanyId(): CompanyId {
  if (memorySelectedCompanyId !== DEFAULT_COMPANY_ID) return normalizeCompanyId(memorySelectedCompanyId);
  try {
    const fromStorage = normalizeCompanyId(localStorage.getItem(STORAGE_KEY));
    memorySelectedCompanyId = fromStorage;
    return fromStorage;
  } catch {
    return DEFAULT_COMPANY_ID;
  }
}

export function setSelectedCompanyId(next: CompanyId): void {
  const normalized = normalizeCompanyId(next);
  memorySelectedCompanyId = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    /* ignore storage failures */
  }
  try {
    window.dispatchEvent(new CustomEvent(COMPANY_CHANGED_EVENT, { detail: { companyId: normalized } }));
  } catch {
    /* ignore event dispatch failures */
  }
}

export function getCompanyMeta(companyId: CompanyId): CompanyMeta {
  return KNOWN_COMPANIES[normalizeCompanyId(companyId)];
}

export function getAllCompanyMeta(): CompanyMeta[] {
  return [KNOWN_COMPANIES.trust_general, KNOWN_COMPANIES.trust_factory];
}
