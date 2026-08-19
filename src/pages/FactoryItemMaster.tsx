import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { getAuthToken } from "../utils/authToken";

const CATEGORIES = ["Raw Material", "Consumable", "Tool", "Finished Good"];

interface FactoryItem {
  id: string;
  itemCode: string;
  description: string;
  category: string;
  unit: string;
  openingStock: number;
  minStockLevel: number;
  reorderQty: number;
  unitCost: number;
  supplier: string;
  storageLocation: string;
  currentStock: number;
  status: "OK" | "REORDER";
  stockValue: number;
}

const EMPTY_FORM = {
  itemCode: "", description: "", category: "Raw Material", unit: "", openingStock: "",
  minStockLevel: "", reorderQty: "", unitCost: "", supplier: "", storageLocation: "",
};

export const FactoryItemMaster: React.FC = () => {
  const { role } = useAuth();
  const canEdit = role === "manager" || role === "account";
  const [items, setItems] = useState<FactoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FactoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/factory/items${q}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditCode(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setShowForm(true);
  };

  const openEdit = (item: FactoryItem) => {
    setEditCode(item.itemCode);
    setForm({
      itemCode: item.itemCode, description: item.description, category: item.category,
      unit: item.unit, openingStock: String(item.openingStock), minStockLevel: String(item.minStockLevel),
      reorderQty: String(item.reorderQty), unitCost: String(item.unitCost),
      supplier: item.supplier, storageLocation: item.storageLocation,
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    const token = getAuthToken();
    const body = {
      itemCode: form.itemCode.trim().toUpperCase(),
      description: form.description.trim(),
      category: form.category,
      unit: form.unit.trim(),
      openingStock: Number(form.openingStock || 0),
      minStockLevel: Number(form.minStockLevel || 0),
      reorderQty: Number(form.reorderQty || 0),
      unitCost: Number(form.unitCost || 0),
      supplier: form.supplier.trim(),
      storageLocation: form.storageLocation.trim(),
    };
    try {
      const url = editCode ? `/api/factory/items/${encodeURIComponent(editCode)}` : "/api/factory/items";
      const method = editCode ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to save.");
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/factory/items/${encodeURIComponent(deleteTarget.itemCode)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.message || "Delete failed."); }
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filtered = query.trim()
    ? items.filter((i) =>
        i.itemCode.toLowerCase().includes(query.toLowerCase()) ||
        i.description.toLowerCase().includes(query.toLowerCase()) ||
        i.category.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-card-list" style={{ color: "#3b82f6" }} />
            Item Master
          </h1>
          <p className="text-muted small mb-0">Trust Factory — warehouse item catalogue</p>
        </div>
        <div className="stock-header-actions">
          {canEdit && (
            <button className="btn btn-primary" onClick={openNew}>
              <i className="bi bi-plus-lg me-1" /> New Item
            </button>
          )}
        </div>
      </div>

      <div className="stock-toolbar" style={{ marginBottom: 12 }}>
        <div className="stock-search">
          <i className="bi bi-search" />
          <input
            className="stock-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search item code, description, category…"
          />
          {query && (
            <button className="stock-search-clear" onClick={() => { setQuery(""); }} aria-label="Clear">
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>
        <button className="ghost-button stock-export-btn" onClick={load}>
          <i className="bi bi-arrow-clockwise me-1" /> Refresh
        </button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card">
          <div className="stock-empty">
            <div className="stock-empty-icon"><i className="bi bi-card-list" /></div>
            <div className="stock-empty-title">No items found</div>
            {canEdit && <div className="stock-empty-sub">Click "New Item" to add your first item.</div>}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>Unit</th>
                <th style={{ textAlign: "right" }}>Opening</th>
                <th style={{ textAlign: "right" }}>Current Stock</th>
                <th style={{ textAlign: "right" }}>Min Level</th>
                <th style={{ textAlign: "right" }}>Reorder Qty</th>
                <th style={{ textAlign: "right" }}>Unit Cost</th>
                <th style={{ textAlign: "right" }}>Stock Value</th>
                <th>Supplier</th>
                <th>Location</th>
                <th>Status</th>
                {canEdit && <th className="data-table-col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.itemCode} style={item.status === "REORDER" ? { background: "#fff5f5" } : {}}>
                  <td><strong>{item.itemCode}</strong></td>
                  <td>{item.description}</td>
                  <td><span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "none" }}>{item.category}</span></td>
                  <td>{item.unit}</td>
                  <td style={{ textAlign: "right" }}>{item.openingStock}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: item.currentStock <= item.minStockLevel ? "#dc2626" : undefined }}>{item.currentStock}</td>
                  <td style={{ textAlign: "right" }}>{item.minStockLevel}</td>
                  <td style={{ textAlign: "right" }}>{item.reorderQty}</td>
                  <td style={{ textAlign: "right" }}>{f(item.unitCost)}</td>
                  <td style={{ textAlign: "right" }}>{f(item.stockValue)}</td>
                  <td className="text-muted small">{item.supplier}</td>
                  <td className="text-muted small">{item.storageLocation}</td>
                  <td>
                    <span className={`status-pill ${item.status === "REORDER" ? "status-undermaintenance" : "status-active"}`}>
                      {item.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <button className="btn-sm stock-action-btn stock-view-btn" onClick={() => openEdit(item)}>
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn-sm stock-action-btn stock-delete-btn"
                          onClick={() => { setDeleteTarget(item); setError(""); }}
                        >
                          <i className="bi bi-trash" />
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
        <div className="stock-delete-modal-backdrop factory-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="factory-item-form-title">
          <div className="stock-delete-modal factory-form-modal factory-form-modal--item card border-0 shadow-lg">
            <div className="factory-form-modal-header">
              <div className="factory-form-modal-icon" aria-hidden>
                <i className={`bi ${editCode ? "bi-pencil-square" : "bi-plus-lg"}`} />
              </div>
              <div>
                <h4 id="factory-item-form-title" className="mb-1">{editCode ? `Edit Item — ${editCode}` : "New Item"}</h4>
                <p className="text-muted mb-0 small">
                  {editCode ? "Update master data for this item. Current stock stays calculated from in/out." : "Add a unique item code. Description, unit, and cost will auto-fill on Stock In / Out."}
                </p>
              </div>
            </div>
            {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
            <div className="row g-3 g-md-4">
              {!editCode && (
                <div className="col-md-4">
                  <label className="form-label fw-semibold">Item Code *</label>
                  <input className="form-control" placeholder="e.g. RM-001" value={form.itemCode}
                    onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))} disabled={saving} />
                </div>
              )}
              <div className={editCode ? "col-12" : "col-md-8"}>
                <label className="form-label fw-semibold">Description *</label>
                <input className="form-control" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Category *</label>
                <select className="form-select" value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} disabled={saving}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Unit *</label>
                <input className="form-control" placeholder="KG / PCS / M" value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Opening Stock</label>
                <input type="number" min={0} className="form-control" value={form.openingStock}
                  onChange={(e) => setForm((f) => ({ ...f, openingStock: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Min Stock Level</label>
                <input type="number" min={0} className="form-control" value={form.minStockLevel}
                  onChange={(e) => setForm((f) => ({ ...f, minStockLevel: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Reorder Qty</label>
                <input type="number" min={0} className="form-control" value={form.reorderQty}
                  onChange={(e) => setForm((f) => ({ ...f, reorderQty: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold">Unit Cost (KWD)</label>
                <input type="number" min={0} step={0.001} className="form-control" value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Supplier</label>
                <input className="form-control" value={form.supplier}
                  onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} disabled={saving} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Storage Location</label>
                <input className="form-control" value={form.storageLocation}
                  onChange={(e) => setForm((f) => ({ ...f, storageLocation: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="factory-form-modal-actions d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary px-4" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true">
          <div className="stock-delete-modal">
            <h4>Delete Item</h4>
            <p>Delete <strong>{deleteTarget.itemCode}</strong> — {deleteTarget.description}? This also removes all stock-in/out history for this item.</p>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <div className="stock-delete-modal-actions">
              <button className="stock-action-btn stock-cancel-btn" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="stock-action-btn stock-delete-btn" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
