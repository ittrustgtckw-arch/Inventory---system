import { useEffect, useState } from "react";
import { getAuthToken } from "../utils/authToken";

interface ReorderAlert {
  id: string; itemCode: string; description: string; category: string; unit: string;
  currentStock: number; minStockLevel: number; qtyToProcure: number;
  unitCost: number; estimatedCost: number; supplier: string; triggeredAt: string;
  hasPendingRequest: boolean;
}
interface ProcRequest {
  id: string; itemCode: string; description: string; quantity: number; unit: string;
  estimatedUnitCost: number; supplierHint: string; createdAt: string; sentToTrust: boolean; sentAt?: string;
}

export const FactoryReorderAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<ReorderAlert[]>([]);
  const [requests, setRequests] = useState<ProcRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const token = getAuthToken();
    Promise.all([
      fetch("/api/factory/reorder-alerts", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
      fetch("/api/factory/procurement-requests", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
    ]).then(([a, p]) => {
      setAlerts(Array.isArray(a) ? a : []);
      setRequests(Array.isArray(p) ? p : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ color: "#dc2626" }} />
            Factory Reorder Alerts
          </h1>
          <p className="text-muted small mb-0">Items at or below minimum stock level — procurement action required</p>
        </div>
        <button className="ghost-button stock-export-btn" onClick={load}><i className="bi bi-arrow-clockwise me-1" />Refresh</button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && alerts.length === 0 && (
        <div className="card mb-4">
          <div className="stock-empty">
            <div className="stock-empty-icon" style={{ color: "#16a34a" }}><i className="bi bi-check-circle" /></div>
            <div className="stock-empty-title" style={{ color: "#16a34a" }}>All items are above minimum stock level</div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <>
          <div className="alert alert-danger border-0 mb-3">
            <strong>{alerts.length} item{alerts.length > 1 ? "s" : ""} require reorder.</strong> Estimated total procurement cost:{" "}
            <strong>KWD {f(alerts.reduce((s, a) => s + a.estimatedCost, 0))}</strong>
          </div>
          <div className="table-wrapper mb-4">
            <table className="data-table stock-table">
              <thead>
                <tr>
                  <th>Item Code</th><th>Description</th><th>Category</th><th>Unit</th>
                  <th style={{ textAlign: "right" }}>Current</th>
                  <th style={{ textAlign: "right" }}>Min Level</th>
                  <th style={{ textAlign: "right" }}>Order Qty</th>
                  <th style={{ textAlign: "right" }}>Unit Cost</th>
                  <th style={{ textAlign: "right" }}>Est. Cost</th>
                  <th>Supplier</th>
                  <th>Triggered</th>
                  <th>PR Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} style={{ background: "#fff5f5" }}>
                    <td><strong>{a.itemCode}</strong></td>
                    <td>{a.description}</td>
                    <td><span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", border: "none" }}>{a.category}</span></td>
                    <td>{a.unit}</td>
                    <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 700 }}>{a.currentStock}</td>
                    <td style={{ textAlign: "right" }}>{a.minStockLevel}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{a.qtyToProcure}</td>
                    <td style={{ textAlign: "right" }}>{f(a.unitCost)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>KWD {f(a.estimatedCost)}</td>
                    <td className="text-muted small">{a.supplier}</td>
                    <td className="text-muted small">{a.triggeredAt ? a.triggeredAt.slice(0, 10) : "—"}</td>
                    <td>
                      <span className={`status-pill ${a.hasPendingRequest ? "status-undermaintenance" : "status-inactive"}`}>
                        {a.hasPendingRequest ? "PR queued" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>
        <i className="bi bi-send me-2" style={{ color: "#7c3aed" }} />
        Pending Procurement Requests
      </h2>
      <p className="text-muted small mb-3">
        These payloads are generated automatically when items cross the reorder threshold.
        {" "}{process.env.NODE_ENV !== "production" ? "Configure TRUST_PROCUREMENT_WEBHOOK_URL on Render to forward them to TRUST ERP." : ""}
      </p>
      {requests.length === 0 && !loading && <p className="text-muted small">No pending requests.</p>}
      {requests.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Item Code</th><th>Description</th>
                <th style={{ textAlign: "right" }}>Order Qty</th>
                <th>Unit</th>
                <th style={{ textAlign: "right" }}>Est. Unit Cost</th>
                <th>Supplier Hint</th>
                <th>Created</th>
                <th>Sent to TRUST</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.itemCode}</strong></td>
                  <td>{p.description}</td>
                  <td style={{ textAlign: "right" }}>{p.quantity}</td>
                  <td>{p.unit}</td>
                  <td style={{ textAlign: "right" }}>{f(p.estimatedUnitCost)}</td>
                  <td className="text-muted small">{p.supplierHint}</td>
                  <td className="text-muted small">{p.createdAt ? p.createdAt.slice(0, 10) : "—"}</td>
                  <td>
                    <span className={`status-pill ${p.sentToTrust ? "status-active" : "status-undermaintenance"}`}>
                      {p.sentToTrust ? `Sent ${p.sentAt ? p.sentAt.slice(0, 10) : ""}` : "Queued (webhook not set)"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
