import type { TFunction } from "i18next";

/** Interpret stored value as decimal years (e.g. 1 → 1 yr 0 m, 1.25 → 1 yr 3 m). Non-numeric strings are returned unchanged. */
export function formatSoldWarrantyYearsMonths(raw: string, t: TFunction): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const normalized = s.replace(/,/g, ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return s;
  const totalMonths = Math.round(n * 12);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return t("soldPage.warrantyPeriod", { years, months });
}
