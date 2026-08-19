import { useEffect, useMemo, useState } from "react";
import { getAuthToken } from "../utils/authToken";

interface MonthlyItem {
  itemCode: string; description: string; category: string; unit: string;
  months: Record<string, number>; yearTotal: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

export const FactoryMonthlyConsumption: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<MonthlyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = (y = year) => {
    setLoading(true);
    fetch(`/api/factory/monthly-consumption?year=${y}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setData(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleYearChange = (y: number) => { setYear(y); load(y); };

  const cats = useMemo(() => Array.from(new Set(data.map((r) => r.category))), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((r) => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (q && !r.itemCode.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, catFilter, query]);

  const monthTotals = useMemo(() =>
    Object.fromEntries(MONTH_KEYS.map((k) => [k, filtered.reduce((s, r) => s + Number(r.months[k] || 0), 0)])),
    [filtered]
  );
  const grandTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="page page-factory">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-calendar3" style={{ color: "#0891b2" }} />
            Monthly Consumption
          </h1>
          <p className="text-muted small mb-0">Read-only — qty issued per item per month (from Stock Out records)</p>
        </div>
        <div className="stock-header-actions">
          <select className="form-select form-select-sm" style={{ width: 100 }} value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="ghost-button stock-export-btn" onClick={() => load()}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
        </div>
      </div>

      <div className="stock-toolbar" style={{ marginBottom: 12 }}>
        <div className="stock-search">
          <i className="bi bi-search" />
          <input className="stock-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item…" />
          {query && <button className="stock-search-clear" onClick={() => setQuery("")}><i className="bi bi-x-lg" /></button>}
        </div>
        <div className="stock-filters">
          <label className="stock-filter">
            <span>Category</span>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">All</option>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card"><div className="stock-empty"><div className="stock-empty-icon"><i className="bi bi-calendar3" /></div><div className="stock-empty-title">No data for {year}</div></div></div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="table-wrapper" style={{ overflowX: "auto" }}>
          <table className="data-table stock-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 110 }}>Item Code</th>
                <th style={{ minWidth: 180 }}>Description</th>
                <th>Unit</th>
                {MONTH_LABELS.map((m, i) => (
                  <th key={m} style={{ textAlign: "right", minWidth: 55 }}>
                    {m}<br /><span className="text-muted" style={{ fontWeight: 400, fontSize: "0.7rem" }}>{MONTH_KEYS[i]}</span>
                  </th>
                ))}
                <th style={{ textAlign: "right", minWidth: 70 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.itemCode}>
                  <td><strong>{r.itemCode}</strong></td>
                  <td>{r.description}</td>
                  <td className="text-muted">{r.unit}</td>
                  {MONTH_KEYS.map((k) => (
                    <td key={k} style={{ textAlign: "right", color: Number(r.months[k] || 0) > 0 ? "#dc2626" : "#9ca3af" }}>
                      {Number(r.months[k] || 0) > 0 ? r.months[k] : "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: 700, color: r.yearTotal > 0 ? "#dc2626" : undefined }}>
                    {r.yearTotal || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                <td colSpan={3} style={{ color: "#374151" }}>Monthly Total ({year})</td>
                {MONTH_KEYS.map((k) => (
                  <td key={k} style={{ textAlign: "right", color: monthTotals[k] > 0 ? "#374151" : "#9ca3af" }}>
                    {monthTotals[k] > 0 ? monthTotals[k] : "—"}
                  </td>
                ))}
                <td style={{ textAlign: "right", color: "#374151" }}>{grandTotal || "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-muted small mt-3">
        <i className="bi bi-lock-fill me-1" />
        This grid is computed from Stock Out records. Edit Stock Out entries to adjust values.
      </p>
    </div>
  );
};
