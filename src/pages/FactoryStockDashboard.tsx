import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../utils/authToken";

interface DashboardRow {
  itemCode: string; description: string; category: string; unit: string;
  openingStock: number; currentStock: number; minStockLevel: number; reorderQty: number;
  unitCost: number; stockValue: number; status: "OK" | "REORDER"; qtyToProcure: number;
  supplier: string; storageLocation: string;
}

export const FactoryStockDashboard: React.FC = () => {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reorderAlerts, setReorderAlerts] = useState<{ itemCode: string }[]>([]);

  const load = () => {
    setLoading(true);
    const token = getAuthToken();
    Promise.all([
      fetch("/api/factory/stock-dashboard", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
      fetch("/api/factory/reorder-alerts", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
    ]).then(([d, a]) => {
      setRows(Array.isArray(d) ? d : []);
      setReorderAlerts(Array.isArray(a) ? a : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useMemo(() => Array.from(new Set(rows.map((r) => r.category))), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.itemCode.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, catFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    reorder: rows.filter((r) => r.status === "REORDER").length,
    ok: rows.filter((r) => r.status === "OK").length,
    totalValue: rows.reduce((s, r) => s + r.stockValue, 0),
  }), [rows]);

  const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page page-factory">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-bar-chart-fill" style={{ color: "#7c3aed" }} />
            Current Stock Dashboard
          </h1>
          <p className="text-muted small mb-0">Live computed — not editable. Updates automatically when stock in/out is recorded.</p>
        </div>
        <div className="stock-header-actions">
          <button className="ghost-button stock-export-btn" onClick={load}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
        </div>
      </div>

      <div className="stock-stats" style={{ marginBottom: 20 }}>
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">Total Items</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">in item master</div>
        </div>
        <div className="stock-stat-card stat-shown" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="stock-stat-title">OK</div>
          <div className="stock-stat-value" style={{ color: "#16a34a" }}>{stats.ok}</div>
          <div className="stock-stat-sub">above minimum level</div>
        </div>
        <div className="stock-stat-card stat-locations" style={{ borderLeft: "4px solid #dc2626" }}>
          <div className="stock-stat-title">REORDER</div>
          <div className="stock-stat-value" style={{ color: "#dc2626" }}>{stats.reorder}</div>
          <div className="stock-stat-sub">at or below minimum</div>
        </div>
        <div className="stock-stat-card stat-total" style={{ borderLeft: "4px solid #7c3aed" }}>
          <div className="stock-stat-title">Total Stock Value</div>
          <div className="stock-stat-value" style={{ fontSize: "1.2rem" }}>KWD {f(stats.totalValue)}</div>
          <div className="stock-stat-sub">current stock × unit cost</div>
        </div>
      </div>

      {reorderAlerts.length > 0 && (
        <div className="alert alert-danger border-0 mb-3 d-flex align-items-center gap-2" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>
            <strong>{reorderAlerts.length} item{reorderAlerts.length > 1 ? "s" : ""} need reorder:</strong>{" "}
            {reorderAlerts.map((a) => a.itemCode).join(", ")}.{" "}
            <Link to="/factory/reorder-alerts" style={{ color: "#dc2626" }}>View procurement requests →</Link>
          </span>
        </div>
      )}

      <div className="stock-toolbar" style={{ marginBottom: 12 }}>
        <div className="stock-search">
          <i className="bi bi-search" />
          <input className="stock-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item code or description…" />
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
          <label className="stock-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="OK">OK</option>
              <option value="REORDER">REORDER</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card"><div className="stock-empty"><div className="stock-empty-icon"><i className="bi bi-bar-chart" /></div><div className="stock-empty-title">No data</div></div></div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Item Code</th><th>Description</th><th>Category</th><th>Unit</th>
                <th style={{ textAlign: "right" }}>Opening</th>
                <th style={{ textAlign: "right" }}>Current Stock</th>
                <th style={{ textAlign: "right" }}>Min Level</th>
                <th style={{ textAlign: "right" }}>Reorder Qty</th>
                <th style={{ textAlign: "right" }}>Unit Cost</th>
                <th style={{ textAlign: "right" }}>Stock Value</th>
                <th style={{ textAlign: "right" }}>Qty to Procure</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.itemCode} style={r.status === "REORDER" ? { background: "#fff5f5" } : {}}>
                  <td><strong>{r.itemCode}</strong></td>
                  <td>{r.description}</td>
                  <td><span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "none" }}>{r.category}</span></td>
                  <td>{r.unit}</td>
                  <td style={{ textAlign: "right", color: "#6b7280" }}>{r.openingStock}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: r.status === "REORDER" ? "#dc2626" : "#16a34a" }}>
                    {r.currentStock}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.minStockLevel}</td>
                  <td style={{ textAlign: "right" }}>{r.reorderQty}</td>
                  <td style={{ textAlign: "right" }}>{f(r.unitCost)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>KWD {f(r.stockValue)}</td>
                  <td style={{ textAlign: "right", color: r.qtyToProcure > 0 ? "#dc2626" : "#6b7280" }}>
                    {r.qtyToProcure > 0 ? <strong>{r.qtyToProcure}</strong> : "—"}
                  </td>
                  <td className="text-muted small">{r.supplier}</td>
                  <td>
                    <span className={`status-pill ${r.status === "REORDER" ? "status-undermaintenance" : "status-active"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted small mt-3">
        <i className="bi bi-info-circle me-1" />
        Current Stock = Opening Stock + Σ Stock In − Σ Stock Out. This view is read-only and computed on every load.
      </p>
    </div>
  );
};
