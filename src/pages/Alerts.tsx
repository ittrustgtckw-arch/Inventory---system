import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import alertsHeadingIcon from "../../alert dash.png";
import { useAuth } from "../auth";
import { getAuthToken } from "../utils/authToken";
import { downloadExcel } from "../utils/excel";

interface AlertItem {
  type: string;
  severity: string;
  entityType: string;
  entityId: string;
  entityName: string;
  dueDate: string;
  message: string;
}

type SeverityFilter = "all" | "high" | "medium";
type SortKey = "dueDate" | "severity" | "type";
type SortDir = "asc" | "desc";

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function dueDateClass(dueDate: string) {
  const d = String(dueDate || "").trim();
  if (!d) return "alert-due-neutral";
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return "alert-due-overdue";

  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Str = in7.toISOString().slice(0, 10);
  if (d <= in7Str) return "alert-due-soon";

  return "alert-due-upcoming";
}

function translateAlertType(t: (k: string) => string, rawType: string) {
  const v = String(rawType || "").toLowerCase();
  if (v.includes("warranty")) return t("alertsPage.typeWarranty");
  if (v.includes("inspection")) return t("alertsPage.typeInspection");
  if (v.includes("maintenance")) return t("alertsPage.typeMaintenance");
  if (v.includes("delivery")) return t("alertsPage.typeDelivery");
  if (v.includes("stock")) return t("alertsPage.typeStock");
  return rawType;
}

function translateAlertMessage(t: (k: string, o?: any) => string, msg: string) {
  const text = String(msg || "");
  if (!text) return text;
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Warranty expires for (.+) \((.+)\)\.?$/i, (m) => t("alertsPage.msgWarrantyExpires", { name: m[1], type: m[2] })],
    [/^Warranty expired for (.+) \((.+)\)\.?$/i, (m) => t("alertsPage.msgWarrantyExpired", { name: m[1], type: m[2] })],
    [/^Inspection due for (.+) \((.+)\)\.?$/i, (m) => t("alertsPage.msgInspectionDue", { name: m[1], type: m[2] })],
    [/^Inspection overdue for (.+) \((.+)\)\.?$/i, (m) => t("alertsPage.msgInspectionOverdue", { name: m[1], type: m[2] })],
    [/^Maintenance due for (.+)\.?$/i, (m) => t("alertsPage.msgMaintenanceDue", { name: m[1] })],
    [/^Maintenance overdue for (.+)\.?$/i, (m) => t("alertsPage.msgMaintenanceOverdue", { name: m[1] })],
    [/^Delivery due for (.+)\.?$/i, (m) => t("alertsPage.msgDeliveryDue", { name: m[1] })],
    [/^Stock level is critical: no items currently in stock\.?$/i, () => t("alertsPage.msgStockCriticalEmpty")],
    [/^Stock level is critical for (.+) \(1 item remaining\)\.?$/i, (m) => t("alertsPage.msgStockCriticalOne", { name: m[1] })],
    [/^Stock level is low for (.+) \((\d+) items remaining\)\.?$/i, (m) => t("alertsPage.msgStockLowMany", { name: m[1], count: m[2] })],
  ];
  for (const [rx, mapper] of patterns) {
    const match = text.match(rx);
    if (match) return mapper(match);
  }
  return text;
}

export const Alerts: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stockMailTestLoading, setStockMailTestLoading] = useState(false);
  const [stockMailTestMessage, setStockMailTestMessage] = useState<"" | "ok" | "err" | "forbidden">("");
  const [stockMailTestDetail, setStockMailTestDetail] = useState("");
  const [stockMailEnabled, setStockMailEnabled] = useState(true);
  const [stockMailSettingsLoading, setStockMailSettingsLoading] = useState(false);
  const [stockMailToggleMessage, setStockMailToggleMessage] = useState("");
  const [stockMailToggleState, setStockMailToggleState] = useState<"" | "ok" | "err">("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (role !== "manager") return;
    const token = getAuthToken();
    if (!token) return;
    setStockMailSettingsLoading(true);
    fetch("/api/alerts/stock-email/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.success) return;
        setStockMailEnabled(Boolean(data.enabled));
      })
      .finally(() => setStockMailSettingsLoading(false));
  }, [role]);

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = alerts.filter((a) => {
      const sev = String(a.severity || "").toLowerCase();
      const sevOk = severityFilter === "all" ? true : sev === severityFilter;
      if (!sevOk) return false;
      if (!q) return true;
      const hay = [a.type, a.severity, a.entityType, a.entityName, a.dueDate, a.message].map(safeLower);
      return hay.some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const severityRank = (s: string) => (String(s).toLowerCase() === "high" ? 2 : 1);
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "dueDate") return String(a.dueDate || "").localeCompare(String(b.dueDate || "")) * dirMult;
      if (sortKey === "type") return safeLower(a.type).localeCompare(safeLower(b.type)) * dirMult;
      return (severityRank(a.severity) - severityRank(b.severity)) * dirMult;
    });

    return sorted;
  }, [alerts, query, severityFilter, sortDir, sortKey]);

  const stats = useMemo(() => {
    const total = alerts.length;
    const shown = filteredSorted.length;
    const high = alerts.filter((a) => String(a.severity || "").toLowerCase() === "high").length;
    const medium = alerts.filter((a) => String(a.severity || "").toLowerCase() !== "high").length;
    return { total, shown, high, medium };
  }, [alerts, filteredSorted.length]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <i className="bi bi-arrow-down-up ms-1 opacity-50" />;
    return sortDir === "asc" ? <i className="bi bi-sort-down ms-1" /> : <i className="bi bi-sort-up ms-1" />;
  };

  const severityLabel = (value: string) => {
    const v = String(value || "").toLowerCase();
    return v === "high" ? t("alertsPage.high") : t("alertsPage.medium");
  };

  const sendStockMailTest = async () => {
    if (role !== "manager") {
      setStockMailTestMessage("forbidden");
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setStockMailTestMessage("err");
      return;
    }
    setStockMailTestMessage("");
    setStockMailTestDetail("");
    setStockMailTestLoading(true);
    try {
      const res = await fetch("/api/alerts/stock-email/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      let data: { message?: string; detail?: string } = {};
      const ct = res.headers.get("content-type");
      if (ct?.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
      }
      if (res.status === 403) {
        setStockMailTestMessage("forbidden");
      } else if (res.ok) {
        setStockMailTestMessage("ok");
        if (typeof data.message === "string" && data.message.trim()) setStockMailTestDetail(data.message.trim());
      } else {
        setStockMailTestMessage("err");
        const parts = [data.message, data.detail].filter((s): s is string => typeof s === "string" && s.trim().length > 0);
        setStockMailTestDetail(parts.length ? parts.join(" — ") : t("alertsPage.sendStockMailErrGeneric"));
      }
    } catch {
      setStockMailTestMessage("err");
      setStockMailTestDetail(t("alertsPage.sendStockMailNetworkErr"));
    } finally {
      setStockMailTestLoading(false);
    }
  };

  const toggleStockMailEnabled = async () => {
    if (role !== "manager") return;
    const token = getAuthToken();
    if (!token) return;
    setStockMailToggleMessage("");
    setStockMailToggleState("");
    setStockMailSettingsLoading(true);
    const next = !stockMailEnabled;
    try {
      const res = await fetch("/api/alerts/stock-email/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        if (res.status === 404) {
          setStockMailToggleMessage("Server is missing stock alert settings API. Deploy latest backend.");
        } else if (res.status === 401) {
          setStockMailToggleMessage("Session expired. Please log in again.");
        } else if (res.status === 403) {
          setStockMailToggleMessage("Manager access required.");
        } else {
          const apiMsg = typeof data?.message === "string" ? data.message : "";
          setStockMailToggleMessage(apiMsg || `Could not update stock alert auto mail setting (HTTP ${res.status}).`);
        }
        setStockMailToggleState("err");
        return;
      }
      setStockMailEnabled(Boolean(data.enabled));
      setStockMailToggleMessage(Boolean(data.enabled) ? "Stock alert auto mail activated." : "Stock alert auto mail deactivated.");
      setStockMailToggleState("ok");
    } catch {
      setStockMailToggleMessage("Could not update stock alert auto mail setting.");
      setStockMailToggleState("err");
    } finally {
      setStockMailSettingsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredSorted.length === 0) return;
    const rows = filteredSorted.map((a) => ({
      Severity: a.severity,
      Type: a.type,
      "Entity type": a.entityType,
      "Entity name": a.entityName,
      "Due date": a.dueDate,
      Message: a.message,
    }));
    downloadExcel(`alerts-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  return (
    <div className="page page-alerts">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={alertsHeadingIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("alertsPage.title")}</h1>
          </div>
        </div>
        <div className="stock-header-actions">
          {role === "manager" ? (
            <button
              type="button"
              className={`ghost-button stock-export-btn ${stockMailEnabled ? "btn-outline-success" : "btn-outline-secondary"}`}
              onClick={() => void toggleStockMailEnabled()}
              disabled={stockMailSettingsLoading}
              title={stockMailEnabled ? "Deactivate auto stock alert mail" : "Activate auto stock alert mail"}
            >
              <i className={`bi ${stockMailEnabled ? "bi-toggle-on text-success" : "bi-toggle-off"} me-1`} />
              {stockMailEnabled ? "Auto mail ON" : "Auto mail OFF"}
            </button>
          ) : null}
          {role === "manager" ? (
            <button
              type="button"
              className="ghost-button stock-export-btn"
              onClick={() => void sendStockMailTest()}
              disabled={stockMailTestLoading || !stockMailEnabled}
              title={t("alertsPage.sendStockMailTest")}
            >
              <i className="bi bi-envelope-paper me-1" />
              {stockMailTestLoading ? t("alertsPage.sendStockMailSending") : t("alertsPage.sendStockMailTest")}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button stock-export-btn"
            onClick={handleExportExcel}
            disabled={filteredSorted.length === 0}
            title={t("alertsPage.exportExcel")}
          >
            <i className="bi bi-file-earmark-spreadsheet me-1" />
            {t("alertsPage.exportExcel")}
          </button>
        </div>
      </div>
      {stockMailTestMessage === "ok" ? (
        <div className="alert alert-success border-0 shadow-sm rounded-3 py-2 mb-3" role="status">
          <div>{t("alertsPage.sendStockMailOk")}</div>
          {stockMailTestDetail ? <div className="small mt-1 opacity-90">{stockMailTestDetail}</div> : null}
        </div>
      ) : null}
      {stockMailTestMessage === "err" ? (
        <div className="alert alert-danger border-0 shadow-sm rounded-3 py-2 mb-3" role="alert">
          <div>{t("alertsPage.sendStockMailErr")}</div>
          {stockMailTestDetail ? <div className="small mt-1">{stockMailTestDetail}</div> : null}
        </div>
      ) : null}
      {stockMailTestMessage === "forbidden" ? (
        <div className="alert alert-warning border-0 shadow-sm rounded-3 py-2 mb-3" role="alert">
          {t("alertsPage.sendStockMailForbidden")}
        </div>
      ) : null}
      {stockMailToggleMessage ? (
        <div
          className={`alert ${stockMailToggleState === "err" ? "alert-danger" : "alert-success"} border-0 shadow-sm rounded-3 py-2 mb-3`}
          role={stockMailToggleState === "err" ? "alert" : "status"}
        >
          {stockMailToggleMessage}
        </div>
      ) : null}
      {loading && <p className="text-muted">{t("common.loading")}</p>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("alertsPage.totalAlerts")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">{t("alertsPage.upcomingOverdue")}</div>
          <i className="bi bi-bell stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("alertsPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("alertsPage.basedOnFilters")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("alertsPage.high")}</div>
          <div className="stock-stat-value">{stats.high}</div>
          <div className="stock-stat-sub">{t("alertsPage.urgent")}</div>
          <i className="bi bi-exclamation-triangle stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("alertsPage.medium")}</div>
          <div className="stock-stat-value">{stats.medium}</div>
          <div className="stock-stat-sub">{t("alertsPage.planSoon")}</div>
          <i className="bi bi-info-circle stock-stat-icon" />
        </div>
      </div>

      <div className="stock-toolbar">
        <div className="stock-search">
          <i className="bi bi-search" />
          <input
            className="stock-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("alertsPage.searchPlaceholder")}
          />
          {query.trim() ? (
            <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label={t("activities.clearSearch")}>
              <i className="bi bi-x-lg" />
            </button>
          ) : null}
        </div>

        <div className="stock-filters">
          <label className="stock-filter">
            <span>{t("alertsPage.severity")}</span>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}>
              <option value="all">{t("alertsPage.all")}</option>
              <option value="high">{t("alertsPage.high")}</option>
              <option value="medium">{t("alertsPage.medium")}</option>
            </select>
          </label>
          <label className="stock-filter">
            <span>{t("alertsPage.sort")}</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="dueDate">{t("alertsPage.dueDate")}</option>
              <option value="severity">{t("alertsPage.severity")}</option>
              <option value="type">{t("alertsPage.type")}</option>
            </select>
          </label>
        </div>
      </div>

      {!loading && filteredSorted.length === 0 && (
        <div className="card">
          <div className="stock-empty">
            <div className="stock-empty-icon">
              <i className="bi bi-bell" />
            </div>
            <div className="stock-empty-title">{t("alertsPage.noAlertsFound")}</div>
            <div className="stock-empty-sub">
              {alerts.length === 0 ? t("alertsPage.noUpcoming") : t("alertsPage.tryAdjusting")}
            </div>
            <div className="stock-empty-actions">
              {query.trim() || severityFilter !== "all" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setQuery("");
                    setSeverityFilter("all");
                  }}
                >
                  {t("alertsPage.clearFilters")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {!loading && filteredSorted.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("severity")}>
                    {t("alertsPage.severity")} {sortIcon("severity")}
                  </button>
                </th>
                <th>{t("alertsPage.message")}</th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("dueDate")}>
                    {t("alertsPage.dueDate")} {sortIcon("dueDate")}
                  </button>
                </th>
                <th>{t("alertsPage.entity")}</th>
                <th className="data-table-col-actions" scope="col">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((a, i) => (
                <tr key={`${a.entityId}-${a.type}-${i}`}>
                  <td>
                    <span className={`status-pill ${String(a.severity).toLowerCase() === "high" ? "status-undermaintenance" : "status-active"}`}>
                      {severityLabel(String(a.severity || "medium"))}
                    </span>
                  </td>
                  <td>{translateAlertMessage(t, a.message)}</td>
                  <td>
                    <span className={`alert-due-date ${dueDateClass(a.dueDate)}`}>{a.dueDate || "—"}</span>
                  </td>
                  <td>
                    <div className="stock-cell-main">{a.entityName === "Inventory" ? t("alertsPage.inventoryEntity") : (a.entityName || "—")}</div>
                    <div className="stock-cell-sub">{translateAlertType(t, a.type)}</div>
                  </td>
                  <td className="data-table-col-actions">
                    {(a.entityType === "crane" || a.entityType === "equipment") ? (
                      <div className="data-table-actions-inner">
                        <Link to={`/equipment/${a.entityId}`} className="btn-sm stock-action-btn stock-view-btn">
                          {t("alertsPage.viewEquipment")}
                        </Link>
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
  );
};
