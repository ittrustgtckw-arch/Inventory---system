/** Normalize arbitrary stored dates to YYYY-MM-DD for comparison with calendar selection. */
export function normalizeDateKey(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

export function formatIsoDateForLocale(isoDay: string, locale: "en" | "ar"): string {
  const [y, m, d] = isoDay.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDay;
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" }).format(date);
}
