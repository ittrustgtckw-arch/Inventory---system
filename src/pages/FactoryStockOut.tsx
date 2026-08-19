import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { getAuthToken } from "../utils/authToken";

const PURPOSES = ["Job issue", "Tool checkout", "Dispatch"];

interface FactoryItem { itemCode: string; description: string; category: string; unit: string; currentStock: number; }
interface StockOutRecord {
  id: string; itemCode: string; description: string; category: string; unit: string;
  qtyOut: number; date: string; issuedToJobNo: string; purpose: string; issuedBy: string; remarks: string; createdAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const FactoryStockOut: React.FC = () => {
  const { role } = useAuth();
  const canEdit = role === "manager" || role === "account";
  const [records, setRecords] = useState<StockOutRecord[]>([]);
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [form, setForm] = useState({ itemCode: "", qtyOut: "", date: today(), issuedToJobNo: "", purpose: "Job issue", issuedBy: "", remarks: "" });
  const [autoFill, setAutoFill] = useState<{ description: string; category: string; unit: string; currentStock: number } | null>(null);

  const load = () => {
    setLoading(true);
    const token = getAuthToken();
    Promise.all([
      fetch("/api/factory/stock-out", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
      fetch("/api/factory/items", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
    ]).then(([recs, itms]) => {
      setRecords(Array.isArray(recs) ? recs : []);
      setItems(Array.isArray(itms) ? itms : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemSelect = (code: string) => {
    const item = items.find((i) => i.itemCode === code);
    setForm((f) => ({ ...f, itemCode: code }));
    setAutoFill(item ? { description: item.description, category: item.category, unit: item.unit, currentStock: item.currentStock } : null);
  };

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/factory/stock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ ...form, qtyOut: Number(form.qtyOut) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to save.");
      setSuccess(`Stock Out recorded. Remaining stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      setShowForm(false);
      setForm({ itemCode: "", qtyOut: "", date: today(), issuedToJobNo: "", purpose: "Job issue", issuedBy: "", remarks: "" });
      setAutoFill(null);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const filtered = filterCode.trim() ? records.filter((r) => r.itemCode === filterCode.trim().toUpperCase()) : records;
  const selectedItem = items.find((i) => i.itemCode === form.itemCode);
  const qtyOutNum = Number(form.qtyOut || 0);
  const overStock = selectedItem && qtyOutNum > 0 && qtyOutNum > selectedItem.currentStock;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-box-arrow-up" style={{ color: "#dc2626" }} />
            Stock Out
          </h1>
          <p className="text-muted small mb-0">Issue material from factory stock for jobs, tools, or dispatch</p>
        </div>
        {canEdit && (
          <div className="stock-header-actions">
            <button className="btn btn-danger" onClick={() => { setShowForm(true); setError(""); setSuccess(""); }}>
              <i className="bi bi-plus-lg me-1" /> Issue Stock Out
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
            {items.map((i) => (
              <option key={i.itemCode} value={i.itemCode}>{i.itemCode} — {i.description} (stock: {i.currentStock})</option>
            ))}
          </select>
        </div>
        <button className="ghost-button stock-export-btn" onClick={load}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card"><div className="stock-empty"><div className="stock-empty-icon"><i className="bi bi-box-arrow-up" /></div><div className="stock-empty-title">No records yet</div></div></div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Date</th><th>Item Code</th><th>Description</th><th>Unit</th>
                <th style={{ textAlign: "right" }}>Qty Out</th>
                <th>Purpose</th><th>Job No / Issued To</th><th>Issued By</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td><strong>{r.itemCode}</strong></td>
                  <td>{r.description}</td>
                  <td>{r.unit}</td>
                  <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>{r.qtyOut}</td>
                  <td><span className="status-pill" style={{ background: "#fef3c7", color: "#92400e", border: "none" }}>{r.purpose}</span></td>
                  <td>{r.issuedToJobNo || "—"}</td>
                  <td className="text-muted small">{r.issuedBy || "—"}</td>
                  <td className="text-muted small">{r.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true">
          <div className="stock-delete-modal" style={{ maxWidth: 540, width: "100%" }}>
            <h4 style={{ marginBottom: 16 }}>Issue Stock Out</h4>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label form-label-sm">Item Code *</label>
                <select className="form-select form-select-sm" value={form.itemCode}
                  onChange={(e) => handleItemSelect(e.target.value)} disabled={saving}>
                  <option value="">— select item —</option>
                  {items.map((i) => (
                    <option key={i.itemCode} value={i.itemCode}>
                      {i.itemCode} — {i.description} (available: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
                {autoFill && (
                  <div className="mt-1 small text-muted">
                    <span className="me-3"><strong>Description:</strong> {autoFill.description}</span>
                    <span className="me-3"><strong>Category:</strong> {autoFill.category}</span>
                    <span style={{ color: autoFill.currentStock <= 0 ? "#dc2626" : undefined }}>
                      <strong>Available:</strong> {autoFill.currentStock} {autoFill.unit}
                    </span>
                  </div>
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Qty Out *</label>
                <input type="number" min={0.001} step={0.001} className={`form-control form-control-sm${overStock ? " is-invalid" : ""}`}
                  value={form.qtyOut} onChange={(e) => setForm((f) => ({ ...f, qtyOut: e.target.value }))} disabled={saving} />
                {overStock && <div className="invalid-feedback">Exceeds available stock ({selectedItem?.currentStock} {selectedItem?.unit}).</div>}
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Date *</label>
                <input type="date" className="form-control form-control-sm" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label form-label-sm">Purpose</label>
                <select className="form-select form-select-sm" value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} disabled={saving}>
                  {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Job No / Issued To</label>
                <input className="form-control form-control-sm" placeholder="WO-2025-001 or person name" value={form.issuedToJobNo}
                  onChange={(e) => setForm((f) => ({ ...f, issuedToJobNo: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label form-label-sm">Issued By</label>
                <input className="form-control form-control-sm" value={form.issuedBy}
                  onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-12">
                <label className="form-label form-label-sm">Remarks</label>
                <input className="form-control form-control-sm" value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="stock-delete-modal-actions" style={{ marginTop: 20 }}>
              <button className="stock-action-btn stock-cancel-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger" onClick={() => void handleSave()}
                disabled={saving || !form.itemCode || !form.qtyOut || !form.date || !!overStock}>
                {saving ? "Saving…" : "Issue Stock Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
