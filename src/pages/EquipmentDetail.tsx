import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCanEdit } from "../auth";
import { authHeadersJson } from "../utils/authHeaders";
import { useTranslation } from "react-i18next";

type EquipmentStatus = "active" | "under_maintenance" | "decommissioned" | "replacement";

interface EquipmentItem {
  id: string;
  type: string;
  name: string;
  model: string;
  location: string;
  status: EquipmentStatus;
  capacity: string;
  lastServiceDate: string;
  notes: string;
  serialNumber?: string;
  manufacturer?: string;
  commissionDate?: string;
  warrantyExpiry?: string;
  nextInspectionDate?: string;
  lastInspectionDate?: string;
  complianceNotes?: string;
  clientId?: string | null;
  projectId?: string | null;
  clientName?: string | null;
  projectName?: string | null;
}

interface ServiceEntry {
  id: string;
  equipmentId?: string;
  craneId?: string;
  date: string;
  type: string;
  description: string;
  performedBy: string;
  nextDueDate: string;
}

function normalizeEquipmentStatus(s: string): EquipmentStatus {
  const v = String(s || "").toLowerCase();
  if (v === "active" || v === "under_maintenance" || v === "decommissioned" || v === "replacement") return v;
  return "active";
}

function equipmentStatusClass(s: string) {
  const v = normalizeEquipmentStatus(s);
  if (v === "active") return "status-active";
  if (v === "under_maintenance") return "status-undermaintenance";
  if (v === "replacement") return "status-replacement";
  return "status-decommissioned";
}

export const EquipmentDetail: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<EquipmentItem | null>(null);
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [serviceDate, setServiceDate] = useState("");
  const [serviceType, setServiceType] = useState("maintenance");
  const [serviceDescription, setServiceDescription] = useState("");
  const [servicePerformedBy, setServicePerformedBy] = useState("");
  const [serviceNextDue, setServiceNextDue] = useState("");
  const [pendingServiceDeleteId, setPendingServiceDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/equipment/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/equipment/${id}/services`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([eq, s]) => {
        setItem(eq);
        setServices(Array.isArray(s) ? s : []);
      })
      .catch(() => setError(t("equipmentDetailPage.errors.failedToLoad")))
      .finally(() => setLoading(false));
  }, [id]);

  const addService = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    if (!id) return;
    setError("");
    try {
      const res = await fetch(`/api/equipment/${id}/services`, {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({
          date: serviceDate,
          type: serviceType,
          description: serviceDescription,
          performedBy: servicePerformedBy,
          nextDueDate: serviceNextDue || undefined,
        }),
      });
      if (!res.ok) throw new Error(t("equipmentDetailPage.errors.failedToAddService"));
      setServiceDate("");
      setServiceType("maintenance");
      setServiceDescription("");
      setServicePerformedBy("");
      setServiceNextDue("");
      setServiceFormOpen(false);
      const list = await fetch(`/api/equipment/${id}/services`).then((r) => r.json());
      setServices(list);
      if (item) setItem({ ...item, lastServiceDate: serviceDate });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipmentDetailPage.errors.failed"));
    }
  };

  const deleteService = async (serviceId: string) => {
    if (!canEdit) return;
    if (!id) return;
    try {
      const res = await fetch(`/api/equipment/${id}/services/${serviceId}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) throw new Error(t("equipmentDetailPage.errors.deleteFailed"));
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
    } catch {
      setError(t("equipmentDetailPage.errors.deleteFailed"));
    }
  };

  const requestServiceDelete = (serviceId: string) => {
    setPendingServiceDeleteId(serviceId);
  };

  const cancelServiceDelete = () => {
    setPendingServiceDeleteId(null);
  };

  const confirmServiceDelete = async () => {
    if (!pendingServiceDeleteId) return;
    await deleteService(pendingServiceDeleteId);
    setPendingServiceDeleteId(null);
  };

  if (loading) return <div className="page"><p className="text-muted">{t("common.loading")}</p></div>;
  if (!item) return <div className="page"><p className="text-muted">{t("equipmentDetailPage.notFound")}</p><Link to="/equipment">{t("equipmentDetailPage.backToEquipment")}</Link></div>;

  const statusClass = equipmentStatusClass(item.status);
  const typeLabel = t(`equipmentPage.types.${item.type}`);
  const latestServiceDate = services[0]?.date || item.lastServiceDate || "—";
  const nextDueDate = services.find((s) => String(s.nextDueDate || "").trim())?.nextDueDate || item.nextInspectionDate || "—";

  return (
    <div className="page equipment-detail-page">
      <div className="equipment-detail-hero card">
        <div className="equipment-detail-hero-main">
          <Link to="/equipment" className="equipment-detail-back">{t("equipmentDetailPage.allEquipmentBack")}</Link>
          <h1>{item.name}</h1>
          <div className="equipment-detail-subtitle">
            <span className="status-pill equipment-type-pill">{typeLabel}</span>
            <span className={`status-pill ${statusClass}`}>{normalizeEquipmentStatus(String(item.status)) === "under_maintenance" ? t("equipmentPage.status.underMaintenance") : t(`equipmentPage.status.${normalizeEquipmentStatus(String(item.status))}`)}</span>
            {item.location ? <span className="equipment-detail-location">{item.location}</span> : null}
          </div>
        </div>
        <div className="equipment-detail-kpis">
          <div className="equipment-detail-kpi">
            <span className="equipment-detail-kpi-label">{t("equipmentDetailPage.latestService")}</span>
            <span className="equipment-detail-kpi-value">{latestServiceDate}</span>
          </div>
          <div className="equipment-detail-kpi">
            <span className="equipment-detail-kpi-label">{t("equipmentDetailPage.nextDue")}</span>
            <span className="equipment-detail-kpi-value">{nextDueDate}</span>
          </div>
          <div className="equipment-detail-kpi">
            <span className="equipment-detail-kpi-label">{t("equipmentDetailPage.serviceEntries")}</span>
            <span className="equipment-detail-kpi-value">{services.length}</span>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="equipment-detail-tables">
        <div className="table-wrapper">
          <table className="data-table stock-table equipment-detail-spec-table equipment-detail-spec-table-main">
            <caption className="equipment-detail-table-caption">{t("equipmentDetailPage.equipmentDetails")}</caption>
            <tbody>
              <tr>
                <th scope="row">{t("alertsPage.type")}</th>
                <td>{typeLabel}</td>
              </tr>
              <tr>
                <th scope="row">{t("clientsPage.name")}</th>
                <td>{item.name}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.model")}</th>
                <td>{item.model || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.serialNumber")}</th>
                <td>{item.serialNumber || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.manufacturer")}</th>
                <td>{item.manufacturer || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("stockPage.location")}</th>
                <td>{item.location}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.capacity")}</th>
                <td>{item.capacity || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.commissionDate")}</th>
                <td>{item.commissionDate || t("projectsPage.notAvailable")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-wrapper">
          <table className="data-table stock-table equipment-detail-spec-table equipment-detail-spec-table-warranty">
            <caption className="equipment-detail-table-caption">{t("equipmentDetailPage.warrantyCompliance")}</caption>
            <tbody>
              <tr>
                <th scope="row">{t("equipmentPage.warrantyExpiry")}</th>
                <td>{item.warrantyExpiry || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.lastInspection")}</th>
                <td>{item.lastInspectionDate || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.nextInspection")}</th>
                <td>{item.nextInspectionDate || t("projectsPage.notAvailable")}</td>
              </tr>
              <tr>
                <th scope="row">{t("equipmentPage.complianceNotes")}</th>
                <td>{item.complianceNotes || t("projectsPage.notAvailable")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card equipment-detail-actions-bar">
          <h2 className="section-title equipment-detail-actions-title">{t("nav.actions")}</h2>
          <p className="equipment-action-copy">{t("equipmentDetailPage.actionsCopy")}</p>
          <div className="equipment-detail-action-group">
            {canEdit ? (
              <Link to={`/equipment?edit=${item.id}`} className="primary-button equipment-detail-btn-edit">
                {t("equipmentPage.editEquipment")}
              </Link>
            ) : null}
            <div className="equipment-detail-action-buttons">
              <Link to="/equipment" className="ghost-button equipment-detail-btn-back">
                {t("equipmentDetailPage.backToList")}
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  className={`primary-button ${serviceFormOpen ? "equipment-detail-btn-cancel" : "equipment-detail-btn-add-service"}`}
                  onClick={() => setServiceFormOpen(!serviceFormOpen)}
                >
                  {serviceFormOpen ? t("equipmentDetailPage.hideServiceForm") : t("equipmentDetailPage.addService")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="card equipment-service-card">
        <div className="equipment-service-header">
          <h2 className="section-title">{t("equipmentDetailPage.maintenanceHistory")}</h2>
        </div>

        {serviceFormOpen && canEdit && (
          <form onSubmit={addService} className="form equipment-service-form">
            <div className="form-grid">
              <label><span>{t("activities.date")}</span><input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required /></label>
              <label>
                <span>{t("alertsPage.type")}</span>
                <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                  <option value="maintenance">{t("equipmentDetailPage.maintenance")}</option>
                  <option value="inspection">{t("equipmentDetailPage.inspection")}</option>
                  <option value="repair">{t("equipmentDetailPage.repair")}</option>
                </select>
              </label>
              <label><span>{t("equipmentDetailPage.performedBy")}</span><input type="text" value={servicePerformedBy} onChange={(e) => setServicePerformedBy(e.target.value)} /></label>
              <label><span>{t("equipmentDetailPage.nextDueDate")}</span><input type="date" value={serviceNextDue} onChange={(e) => setServiceNextDue(e.target.value)} /></label>
              <label className="full-width"><span>{t("activities.details")}</span><input type="text" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} /></label>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button equipment-detail-btn-add">{t("common.add")}</button>
            </div>
          </form>
        )}

        {services.length === 0 ? (
          <p className="text-muted equipment-service-empty">{t("equipmentDetailPage.noServiceRecords")}</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table stock-table">
              <thead>
                <tr>
                  <th>{t("activities.date")}</th>
                  <th>{t("alertsPage.type")}</th>
                  <th>{t("activities.details")}</th>
                  <th>{t("equipmentDetailPage.performedBy")}</th>
                  <th>{t("equipmentDetailPage.nextDue")}</th>
                  <th className="data-table-col-actions" scope="col">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{s.type}</td>
                    <td>{s.description || t("projectsPage.notAvailable")}</td>
                    <td>{s.performedBy || t("projectsPage.notAvailable")}</td>
                    <td>{s.nextDueDate || t("projectsPage.notAvailable")}</td>
                    <td className="data-table-col-actions">
                      {canEdit ? (
                        <div className="data-table-actions-inner">
                          <button
                            type="button"
                            className="btn-sm stock-action-btn stock-delete-btn"
                            onClick={() => requestServiceDelete(s.id)}
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pendingServiceDeleteId && canEdit ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-service-confirm-title">
          <div className="stock-delete-modal">
            <h3 id="delete-service-confirm-title">{t("stockPage.confirmDelete")}</h3>
            <p>{t("equipmentDetailPage.deletePrompt")}</p>
            <div className="stock-delete-modal-actions">
              <button type="button" className="stock-action-btn stock-cancel-btn" onClick={cancelServiceDelete}>
                {t("common.cancel")}
              </button>
              <button type="button" className="stock-action-btn stock-delete-btn" onClick={confirmServiceDelete}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
