import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { getAuthToken } from "../utils/authToken";

const SOURCES = ["Purchase", "Production"];

interface FactoryItem { itemCode: string; description: string; category: string; unit: string; unitCost: number; currentStock: number; }
interface StockInRecord {
  id: string; itemCode: string; description: string; category: string; unit: string;
  qtyIn: number; date: string; unitCost: number; totalValue: number;
  source: string; reference: string; receivedBy: string; remarks: string; createdBy: string; createdAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const FactoryStockIn: React.FC = () => {
  const { role } = useAuth();
  const canEdit = role === "manager" || role === "account";
  const [records, setRecords] = useState<StockInRecord[]>([]);
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [form, setForm] = useState({ itemCode: "", qtyIn: "", date: today(), unitCost: "", source: "Purchase", reference: "", receivedBy: "", remarks: "" });
  const [autoFill, setAutoFill] = useState<{ description: string; category: string; unit: string } | null>(null);

  const load = () => {
    setLoading(true);
    const token = getAuthToken();
    Promise.all([
      fetch("/api/factory/stock-in", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
      fetch("/api/factory/items", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
    ]).then(([recs, itms]) => {
      setRecords(Array.isArray(recs) ? recs : []);
      setItems(Array.isArray(itms) ? itms : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemSelect = (code: string) => {
    const item = items.find((i) => i.itemCode === code);
    setForm((f) => ({ ...f, itemCode: code, unitCost: item ? String(item.unitCost) : f.unitCost }));
    setAutoFill(item ? { description: item.description, category: item.category, unit: item.unit } : null);
  };

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/factory/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ ...form, qtyIn: Number(form.qtyIn), unitCost: form.unitCost !== "" ? Number(form.unitCost) : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to save.");
      setSuccess(`Stock In recorded. New stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      setShowForm(false);
      setForm({ itemCode: "", qtyIn: "", date: today(), unitCost: "", source: "Purchase", reference: "", receivedBy: "", remarks: "" });
      setAutoFill(null);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  };

  const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filtered = filterCode.trim() ? records.filter((r) => r.itemCode === filterCode.trim().toUpperCase()) : records;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-box-arrow-in-down" style={{ color: "#16a34a" }} />
            Stock In
          </h1>
          <p className="text-muted small mb-0">Record material / goods received into factory stock</p>
        </div>
        {canEdit && (
          <div className="stock-header-actions">
            <button className="btn btn-success" onClick={() => { setShowForm(true); setError(""); setSuccess(""); }}>
              <i className="bi bi-plus-lg me-1" /> Record Stock In
            </button>
          </div>
        )}
      </div>

      {success && <div className="alert alert-success py-2 mb-3 small">{success}</div>}

      <div className="stock-toolbar" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="small text-muted">Filter by item:</label>
          <select className="form-select form-select-sm" style={{ width: 220 }} value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}>
            <option value="">All items</option>
            {items.map((i) => <option key={i.itemCode} value={i.itemCode}>{i.itemCode} — {i.description}</option>)}
          </select>
        </div>
        <button className="ghost-button stock-export-btn" onClick={load}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card"><div className="stock-empty"><div className="stock-empty-icon"><i className="bi bi-box-arrow-in-down" /></div><div className="stock-empty-title">No records yet</div></div></div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Date</th><th>Item Code</th><th>Description</th><th>Category</th><th>Unit</th>
                <th style={{ textAlign: "right" }}>Qty In</th>
                <th style={{ textAlign: "right" }}>Unit Cost</th>
                <th style={{ textAlign: "right" }}>Total Value</th>
                <th>Source</th><th>Reference / PO</th><th>Received By</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td><strong>{r.itemCode}</strong></td>
                  <td>{r.description}</td>
                  <td><span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "none" }}>{r.category}</span></td>
                  <td>{r.unit}</td>
                  <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{r.qtyIn}</td>
                  <td style={{ textAlign: "right" }}>{f(r.unitCost)}</td>
                  <td style={{ textAlign: "right" }}>{f(r.totalValue)}</td>
                  <td>{r.source}</td>
                  <td className="text-muted small">{r.reference || "—"}</td>
                  <td className="text-muted small">{r.receivedBy || "—"}</td>
                  <td className="text-muted small">{r.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true">
          <div className="stock-delete-modal" style={{ maxWidth: 560, width: "100%" }}>
            <h4 style={{ marginBottom: 16 }}>Record Stock In</h4>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label form-label-sm">Item Code *</label>
                <select className="form-select form-select-sm" value={form.itemCode}
                  onChange={(e) => handleItemSelect(e.target.value)} disabled={saving}>
                  <option value="">— select item —</option>
                  {items.map((i) => <option key={i.itemCode} value={i.itemCode}>{i.itemCode} — {i.description}</option>)}
                </select>
                {autoFill && (
                  <div className="mt-1 small text-muted">
                    <span className="me-3"><strong>Description:</strong> {autoFill.description}</span>
                    <span className="me-3"><strong>Category:</strong> {autoFill.category}</span>
                    <span><strong>Unit:</strong> {autoFill.unit}</span>
                  </div>
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Qty In *</label>
                <input type="number" min={0.001} step={0.001} className="form-control form-control-sm" value={form.qtyIn}
                  onChange={(e) => setForm((f) => ({ ...f, qtyIn: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Date *</label>
                <input type="date" className="form-control form-control-sm" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Unit Cost <span className="text-muted">(auto from master)</span></label>
                <input type="number" min={0} step={0.001} className="form-control form-control-sm" value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Source</label>
                <select className="form-select form-select-sm" value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} disabled={saving}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Supplier / PO Reference</label>
                <input className="form-control form-control-sm" placeholder="PO-2025-001 or supplier name" value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Received By</label>
                <input className="form-control form-control-sm" value={form.receivedBy}
                  onChange={(e) => setForm((f) => ({ ...f, receivedBy: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Remarks</label>
                <input className="form-control form-control-sm" value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="stock-delete-modal-actions" style={{ marginTop: 20 }}>
              <button className="stock-action-btn stock-cancel-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-success" onClick={() => void handleSave()} disabled={saving || !form.itemCode || !form.qtyIn || !form.date}>
                {saving ? "Saving…" : "Record Stock In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
