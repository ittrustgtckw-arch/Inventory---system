import { useEffect, useState } from "react";
import { useAuth, useCanEdit } from "../auth";
import { getAuthToken } from "../utils/authToken";

const PURPOSES = ["Job issue", "Tool checkout", "Dispatch"];

interface FactoryItem { itemCode: string; description: string; category: string; unit: string; currentStock: number; }
interface ModificationEntry {
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
interface StockOutRecord {
  id: string; itemCode: string; description: string; category: string; unit: string;
  qtyOut: number; date: string; issuedToJobNo: string; purpose: string; issuedBy: string; remarks: string; createdAt: string;
  lastModifiedAt?: string; lastModifiedBy?: string; lastModificationReason?: string;
  modificationHistory?: ModificationEntry[];
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  itemCode: "", qtyOut: "", date: today(), issuedToJobNo: "", purpose: "Job issue",
  issuedBy: "", remarks: "", modificationReason: "",
});

export const FactoryStockOut: React.FC = () => {
  const { role } = useAuth();
  const canEditFlag = useCanEdit();
  const canEdit = canEditFlag || role === "manager" || role === "account";
  const [records, setRecords] = useState<StockOutRecord[]>([]);
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalQty, setEditingOriginalQty] = useState(0);
  const [historyRecord, setHistoryRecord] = useState<StockOutRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [form, setForm] = useState(emptyForm());
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
    if (editingId) return;
    const item = items.find((i) => i.itemCode === code);
    setForm((f) => ({ ...f, itemCode: code }));
    setAutoFill(item ? { description: item.description, category: item.category, unit: item.unit, currentStock: item.currentStock } : null);
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingOriginalQty(0);
    setForm(emptyForm());
    setAutoFill(null);
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEdit = (r: StockOutRecord) => {
    const item = items.find((i) => i.itemCode === r.itemCode);
    setEditingId(r.id);
    setEditingOriginalQty(Number(r.qtyOut || 0));
    setForm({
      itemCode: r.itemCode,
      qtyOut: String(r.qtyOut),
      date: r.date,
      issuedToJobNo: r.issuedToJobNo || "",
      purpose: r.purpose || "Job issue",
      issuedBy: r.issuedBy || "",
      remarks: r.remarks || "",
      modificationReason: "",
    });
    setAutoFill({
      description: r.description,
      category: r.category,
      unit: r.unit,
      currentStock: item ? item.currentStock + Number(r.qtyOut || 0) : Number(r.qtyOut || 0),
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingOriginalQty(0);
    setForm(emptyForm());
    setAutoFill(null);
  };

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      if (editingId) {
        if (!form.modificationReason.trim()) {
          throw new Error("Modification reason is required.");
        }
        const res = await fetch(`/api/factory/stock-out/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({
            qtyOut: Number(form.qtyOut),
            date: form.date,
            issuedToJobNo: form.issuedToJobNo,
            purpose: form.purpose,
            issuedBy: form.issuedBy,
            remarks: form.remarks,
            modificationReason: form.modificationReason.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Failed to update.");
        setSuccess(`Stock Out updated. Remaining stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      } else {
        const res = await fetch("/api/factory/stock-out", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({
            itemCode: form.itemCode,
            qtyOut: Number(form.qtyOut),
            date: form.date,
            issuedToJobNo: form.issuedToJobNo,
            purpose: form.purpose,
            issuedBy: form.issuedBy,
            remarks: form.remarks,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Failed to save.");
        setSuccess(`Stock Out recorded. Remaining stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      }
      closeForm();
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const filtered = filterCode.trim() ? records.filter((r) => r.itemCode === filterCode.trim().toUpperCase()) : records;
  const selectedItem = items.find((i) => i.itemCode === form.itemCode);
  const qtyOutNum = Number(form.qtyOut || 0);
  const availableForEdit = editingId
    ? (selectedItem ? selectedItem.currentStock + editingOriginalQty : autoFill?.currentStock || 0)
    : (selectedItem?.currentStock || 0);
  const overStock = qtyOutNum > 0 && qtyOutNum > availableForEdit;

  return (
    <div className="page page-factory">
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
            <button className="btn btn-danger" onClick={openCreate}>
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
                <th>Modified</th>
                {canEdit && <th className="data-table-col-actions">Actions</th>}
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
                  <td className="small">
                    {r.lastModifiedAt ? (
                      <button type="button" className="btn btn-link btn-sm p-0 text-warning" onClick={() => setHistoryRecord(r)} title={r.lastModificationReason || "View history"}>
                        <i className="bi bi-pencil-square me-1" />
                        {r.lastModifiedAt.slice(0, 10)}
                      </button>
                    ) : "—"}
                  </td>
                  {canEdit && (
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <button type="button" className="btn-sm stock-action-btn stock-view-btn" onClick={() => openEdit(r)} title="Modify entry">
                          <i className="bi bi-pencil me-1" /> Modify
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="stock-delete-modal-backdrop factory-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="factory-stock-out-title">
          <div className="stock-delete-modal factory-form-modal factory-form-modal--out card border-0 shadow-lg">
            <div className="factory-form-modal-header">
              <div className="factory-form-modal-icon" aria-hidden>
                <i className={`bi ${editingId ? "bi-pencil-square" : "bi-box-arrow-up"}`} />
              </div>
              <div>
                <h4 id="factory-stock-out-title" className="mb-1">{editingId ? "Modify Stock Out" : "Issue Stock Out"}</h4>
                <p className="text-muted mb-0 small">
                  {editingId
                    ? "Correct a wrong issue entry. A clear modification reason is required and will be recorded."
                    : "Select an item, then enter quantity, date, and who it is issued to."}
                </p>
              </div>
            </div>
            {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
            <div className="row g-3 g-md-4">
              <div className="col-12">
                <label className="form-label fw-semibold">Item Code *</label>
                <select className="form-select" value={form.itemCode}
                  onChange={(e) => handleItemSelect(e.target.value)} disabled={saving || !!editingId}>
                  <option value="">— select item —</option>
                  {items.map((i) => (
                    <option key={i.itemCode} value={i.itemCode}>
                      {i.itemCode} — {i.description} (available: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
                {autoFill && (
                  <div className="factory-form-autofill alert alert-warning py-2 px-3 mt-2 mb-0 d-flex flex-wrap gap-3">
                    <span><strong>Description:</strong> {autoFill.description}</span>
                    <span><strong>Category:</strong> {autoFill.category}</span>
                    <span style={{ color: availableForEdit <= 0 ? "#dc2626" : undefined }}>
                      <strong>Available:</strong> {availableForEdit} {autoFill.unit}
                    </span>
                  </div>
                )}
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Qty Out *</label>
                <input type="number" min={0.001} step={0.001} className={`form-control${overStock ? " is-invalid" : ""}`}
                  value={form.qtyOut} onChange={(e) => setForm((f) => ({ ...f, qtyOut: e.target.value }))} disabled={saving} />
                {overStock && <div className="invalid-feedback">Exceeds available stock ({availableForEdit} {autoFill?.unit || selectedItem?.unit}).</div>}
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Date *</label>
                <input type="date" className="form-control" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Purpose</label>
                <select className="form-select" value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} disabled={saving}>
                  {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Job No / Issued To</label>
                <input className="form-control" placeholder="WO-2025-001 or person name" value={form.issuedToJobNo}
                  onChange={(e) => setForm((f) => ({ ...f, issuedToJobNo: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Issued By</label>
                <input className="form-control" value={form.issuedBy}
                  onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold">Remarks</label>
                <textarea className="form-control factory-form-remarks" rows={2} value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} disabled={saving} />
              </div>
              {editingId && (
                <div className="col-12">
                  <label className="form-label fw-semibold">Reason for modification *</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Explain why this entry is being corrected (required)"
                    value={form.modificationReason}
                    onChange={(e) => setForm((f) => ({ ...f, modificationReason: e.target.value }))}
                    disabled={saving}
                  />
                </div>
              )}
            </div>
            <div className="factory-form-modal-actions d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={closeForm} disabled={saving}>Cancel</button>
              <button
                type="button"
                className="btn btn-danger px-4"
                onClick={() => void handleSave()}
                disabled={saving || !form.itemCode || !form.qtyOut || !form.date || !!overStock || (!!editingId && !form.modificationReason.trim())}
              >
                {saving ? "Saving…" : editingId ? "Save Modification" : "Issue Stock Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyRecord && (
        <div className="stock-delete-modal-backdrop factory-form-backdrop" role="dialog" aria-modal="true">
          <div className="stock-delete-modal factory-form-modal card border-0 shadow-lg" style={{ maxWidth: 720 }}>
            <div className="factory-form-modal-header">
              <div className="factory-form-modal-icon" aria-hidden><i className="bi bi-clock-history" /></div>
              <div>
                <h4 className="mb-1">Modification history — {historyRecord.itemCode}</h4>
                <p className="text-muted mb-0 small">{historyRecord.description}</p>
              </div>
            </div>
            {(historyRecord.modificationHistory || []).length === 0 ? (
              <p className="text-muted">No modification history.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>When</th><th>By</th><th>Reason</th><th>Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(historyRecord.modificationHistory || [])].reverse().map((h) => (
                      <tr key={h.id}>
                        <td className="small">{h.modifiedAt ? h.modifiedAt.replace("T", " ").slice(0, 19) : "—"}</td>
                        <td className="small">{h.modifiedBy}</td>
                        <td className="small">{h.reason}</td>
                        <td className="small text-muted">
                          qty {String(h.before?.qtyOut ?? "—")} → {String(h.after?.qtyOut ?? "—")};{" "}
                          date {String(h.before?.date ?? "—")} → {String(h.after?.date ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="factory-form-modal-actions d-flex justify-content-end">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={() => setHistoryRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
