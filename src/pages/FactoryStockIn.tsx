import { useEffect, useState } from "react";
import { useAuth, useCanEdit } from "../auth";
import { getAuthToken } from "../utils/authToken";

const SOURCES = ["Purchase", "Production"];

interface FactoryItem { itemCode: string; description: string; category: string; unit: string; unitCost: number; currentStock: number; }
interface ModificationEntry {
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
interface StockInRecord {
  id: string; itemCode: string; description: string; category: string; unit: string;
  qtyIn: number; date: string; unitCost: number; totalValue: number;
  source: string; reference: string; receivedBy: string; remarks: string; createdBy: string; createdAt: string;
  lastModifiedAt?: string; lastModifiedBy?: string; lastModificationReason?: string;
  modificationHistory?: ModificationEntry[];
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  itemCode: "", qtyIn: "", date: today(), unitCost: "", source: "Purchase",
  reference: "", receivedBy: "", remarks: "", modificationReason: "",
});

export const FactoryStockIn: React.FC = () => {
  const { role } = useAuth();
  const canEditFlag = useCanEdit();
  const canEdit = canEditFlag || role === "manager" || role === "account";
  const [records, setRecords] = useState<StockInRecord[]>([]);
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyRecord, setHistoryRecord] = useState<StockInRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [form, setForm] = useState(emptyForm());
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
    if (editingId) return;
    const item = items.find((i) => i.itemCode === code);
    setForm((f) => ({ ...f, itemCode: code, unitCost: item ? String(item.unitCost) : f.unitCost }));
    setAutoFill(item ? { description: item.description, category: item.category, unit: item.unit } : null);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setAutoFill(null);
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEdit = (r: StockInRecord) => {
    setEditingId(r.id);
    setForm({
      itemCode: r.itemCode,
      qtyIn: String(r.qtyIn),
      date: r.date,
      unitCost: String(r.unitCost),
      source: r.source || "Purchase",
      reference: r.reference || "",
      receivedBy: r.receivedBy || "",
      remarks: r.remarks || "",
      modificationReason: "",
    });
    setAutoFill({ description: r.description, category: r.category, unit: r.unit });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
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
        const res = await fetch(`/api/factory/stock-in/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({
            qtyIn: Number(form.qtyIn),
            date: form.date,
            unitCost: form.unitCost !== "" ? Number(form.unitCost) : undefined,
            source: form.source,
            reference: form.reference,
            receivedBy: form.receivedBy,
            remarks: form.remarks,
            modificationReason: form.modificationReason.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Failed to update.");
        setSuccess(`Stock In updated. Current stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      } else {
        const res = await fetch("/api/factory/stock-in", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({
            itemCode: form.itemCode,
            qtyIn: Number(form.qtyIn),
            date: form.date,
            unitCost: form.unitCost !== "" ? Number(form.unitCost) : undefined,
            source: form.source,
            reference: form.reference,
            receivedBy: form.receivedBy,
            remarks: form.remarks,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Failed to save.");
        setSuccess(`Stock In recorded. New stock: ${data.currentStock} ${autoFill?.unit || ""}`);
      }
      closeForm();
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  };

  const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filtered = filterCode.trim() ? records.filter((r) => r.itemCode === filterCode.trim().toUpperCase()) : records;

  return (
    <div className="page page-factory">
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
            <button className="btn btn-success" onClick={openCreate}>
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
        <div className="table-wrapper factory-ledger-wrap">
          <table className="data-table stock-table factory-ledger-table">
            <thead>
              <tr>
                {canEdit && <th className="data-table-col-actions">Actions</th>}
                <th>Date</th><th>Item Code</th><th>Description</th><th>Category</th><th>Unit</th>
                <th style={{ textAlign: "right" }}>Qty In</th>
                <th style={{ textAlign: "right" }}>Unit Cost</th>
                <th style={{ textAlign: "right" }}>Total Value</th>
                <th>Source</th><th>Reference / PO</th><th>Received By</th><th>Remarks</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {canEdit && (
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <button type="button" className="btn-sm stock-action-btn stock-view-btn" onClick={() => openEdit(r)} title="Modify entry">
                          <i className="bi bi-pencil me-1" /> Modify
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="factory-col-nowrap">{r.date}</td>
                  <td className="factory-col-nowrap"><strong>{r.itemCode}</strong></td>
                  <td className="factory-col-desc" title={r.description}>{r.description}</td>
                  <td className="factory-col-nowrap"><span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "none" }}>{r.category}</span></td>
                  <td className="factory-col-nowrap">{r.unit}</td>
                  <td className="factory-col-nowrap" style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{r.qtyIn}</td>
                  <td className="factory-col-nowrap" style={{ textAlign: "right" }}>{f(r.unitCost)}</td>
                  <td className="factory-col-nowrap" style={{ textAlign: "right" }}>{f(r.totalValue)}</td>
                  <td className="factory-col-nowrap">{r.source}</td>
                  <td className="factory-col-clip text-muted small" title={r.reference || undefined}>{r.reference || "—"}</td>
                  <td className="factory-col-clip text-muted small" title={r.receivedBy || undefined}>{r.receivedBy || "—"}</td>
                  <td className="factory-col-clip text-muted small" title={r.remarks || undefined}>{r.remarks || "—"}</td>
                  <td className="factory-col-nowrap small">
                    {r.lastModifiedAt ? (
                      <button type="button" className="btn btn-link btn-sm p-0 text-warning" onClick={() => setHistoryRecord(r)} title={r.lastModificationReason || "View history"}>
                        <i className="bi bi-pencil-square me-1" />
                        {r.lastModifiedAt.slice(0, 10)}
                      </button>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="stock-delete-modal-backdrop factory-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="factory-stock-in-title">
          <div className={`stock-delete-modal factory-form-modal factory-form-modal--in card border-0 shadow-lg${editingId ? " factory-form-modal--modify" : ""}`}>
            <div className="factory-form-modal-header">
              <div className="factory-form-modal-icon" aria-hidden>
                <i className={`bi ${editingId ? "bi-pencil-square" : "bi-box-arrow-in-down"}`} />
              </div>
              <div className="factory-form-modal-heading">
                <div className="factory-form-modal-title-row">
                  <h4 id="factory-stock-in-title" className="mb-0">{editingId ? "Modify Stock In" : "Record Stock In"}</h4>
                  {editingId && <span className="factory-form-mode-badge">Correction</span>}
                </div>
                <p className="text-muted mb-0 small">
                  {editingId
                    ? "Correct a wrong entry. A clear modification reason is required and will be recorded."
                    : "Select an item, then enter quantity, date, and receiving details."}
                </p>
              </div>
            </div>
            {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
            <div className="factory-form-body">
              <section className="factory-form-section">
                <div className="factory-form-section-label"><i className="bi bi-box-seam me-1" />Item</div>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Item Code *</label>
                    <select className="form-select" value={form.itemCode}
                      onChange={(e) => handleItemSelect(e.target.value)} disabled={saving || !!editingId}>
                      <option value="">— select item —</option>
                      {items.map((i) => <option key={i.itemCode} value={i.itemCode}>{i.itemCode} — {i.description}</option>)}
                    </select>
                    {autoFill && (
                      <div className="factory-form-autofill alert alert-success py-2 px-3 mt-2 mb-0 d-flex flex-wrap gap-3">
                        <span><strong>Description:</strong> {autoFill.description}</span>
                        <span><strong>Category:</strong> {autoFill.category}</span>
                        <span><strong>Unit:</strong> {autoFill.unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="factory-form-section">
                <div className="factory-form-section-label"><i className="bi bi-sliders me-1" />Entry details</div>
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Qty In *</label>
                    <input type="number" min={0.001} step={0.001} className="form-control" value={form.qtyIn}
                      onChange={(e) => setForm((f) => ({ ...f, qtyIn: e.target.value }))} disabled={saving} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Date *</label>
                    <input type="date" className="form-control" value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} disabled={saving} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-semibold">Unit Cost <span className="text-muted fw-normal">(auto)</span></label>
                    <input type="number" min={0} step={0.001} className="form-control" value={form.unitCost}
                      onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} disabled={saving} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Source</label>
                    <select className="form-select" value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} disabled={saving}>
                      {SOURCES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Supplier / PO Reference</label>
                    <input className="form-control" placeholder="PO-2025-001 or supplier name" value={form.reference}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} disabled={saving} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Received By</label>
                    <input className="form-control" value={form.receivedBy}
                      onChange={(e) => setForm((f) => ({ ...f, receivedBy: e.target.value }))} disabled={saving} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Remarks</label>
                    <textarea className="form-control factory-form-remarks" rows={2} value={form.remarks}
                      onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} disabled={saving} />
                  </div>
                </div>
              </section>

              {editingId && (
                <section className="factory-form-section factory-form-audit">
                  <div className="factory-form-section-label">
                    <i className="bi bi-journal-text me-1" />Audit trail
                    <span className="factory-form-required-pill">Required</span>
                  </div>
                  <p className="factory-form-audit-hint mb-2">This reason is saved permanently with who changed the entry and when.</p>
                  <label className="form-label fw-semibold" htmlFor="factory-stock-in-reason">Reason for modification *</label>
                  <textarea
                    id="factory-stock-in-reason"
                    className="form-control factory-form-reason"
                    rows={3}
                    placeholder="Explain why this entry is being corrected (required)"
                    value={form.modificationReason}
                    onChange={(e) => setForm((f) => ({ ...f, modificationReason: e.target.value }))}
                    disabled={saving}
                  />
                </section>
              )}
            </div>
            <div className="factory-form-modal-actions d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={closeForm} disabled={saving}>Cancel</button>
              <button
                type="button"
                className={`btn px-4${editingId ? " btn-warning factory-form-save-modify" : " btn-success"}`}
                onClick={() => void handleSave()}
                disabled={saving || !form.itemCode || !form.qtyIn || !form.date || (!!editingId && !form.modificationReason.trim())}
              >
                {saving ? "Saving…" : editingId ? (<><i className="bi bi-check2-circle me-1" />Save Modification</>) : "Record Stock In"}
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
                          qty {String(h.before?.qtyIn ?? "—")} → {String(h.after?.qtyIn ?? "—")};{" "}
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
