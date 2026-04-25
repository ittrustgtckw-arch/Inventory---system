import { useEffect, useMemo, useState } from "react";
import { useAuth, useCanEdit } from "../auth";
import activityHeadingIcon from "../../dashboard.jpg";
import { useTranslation } from "react-i18next";

interface ActivityItem {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  section: string;
  action: string;
  details: string;
}

function formatActivityTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatActivityDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function formatActivityOnlyTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

export const Activities: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useAuth();
  const canView = useCanEdit();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ActivityItem[]>([]);

  const fetchActivities = async () => {
    if (!canView) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setError("");
      setLoading(true);
      let authToken = token;
      if (!authToken) {
        try {
          authToken = localStorage.getItem("authToken");
        } catch {
          authToken = null;
        }
      }
      if (!authToken) {
        throw new Error(t("activities.sessionExpired"));
      }
      const res = await fetch("/api/activity/recent?limit=25", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) throw new Error(t("activities.sessionExpired"));
        if (res.status === 403) throw new Error(t("activities.editPermissionRequired"));
        throw new Error((data && data.message) || t("activities.noActivities"));
      }
      setItems(Array.isArray(data) ? (data as ActivityItem[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load activities.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [canView, token]);

  const filtered = useMemo(() => {
    const q = safeLower(query).trim();
    if (!q) return items;
    return items.filter((a) => {
      const hay = [a.actorName, a.actorRole, a.section, a.action, a.details, a.timestamp].map(safeLower);
      return hay.some((h) => h.includes(q));
    });
  }, [items, query]);

  const handleRefresh = () => fetchActivities();

  return (
    <div className="page page-activity">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={activityHeadingIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("activities.title")}</h1>
          </div>
        </div>
        <div className="stock-header-actions">
          <button type="button" className="ghost-button stock-export-btn" onClick={handleRefresh} disabled={loading || !canView}>
            <i className="bi bi-arrow-clockwise me-1" />
            {t("common.refresh")}
          </button>
        </div>
      </div>

      {!canView ? <div className="alert alert-danger">{t("activities.unauthorized")}</div> : null}

      {loading && canView ? <p className="text-muted">{t("common.loading")}</p> : null}
      {error && canView ? <div className="alert alert-danger">{error}</div> : null}

      {canView ? (
        <>
          <div className="stock-toolbar activity-log-toolbar">
            <div className="stock-search activity-log-search">
              <i className="bi bi-search" aria-hidden />
              <input
                className="stock-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("activities.searchPlaceholder")}
              />
              {query.trim() ? (
                <button
                  type="button"
                  className="stock-search-clear activity-log-search-clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <i className="bi bi-x-lg" />
                </button>
              ) : null}
            </div>
          </div>

          {!loading && filtered.length === 0 ? (
            <div className="card">
              <div className="stock-empty">
                <div className="stock-empty-icon">
                  <i className="bi bi-clock-history" />
                </div>
                <div className="stock-empty-title">{t("activities.noActivities")}</div>
                <div className="stock-empty-sub">{items.length === 0 ? t("activities.noRecent") : t("activities.tryAdjusting")}</div>
                <div className="stock-empty-actions">
                  {query.trim() ? (
                    <button type="button" className="ghost-button" onClick={() => setQuery("")}>
                      {t("activities.clearSearch")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && filtered.length > 0 ? (
            <div className="table-wrapper activity-log-table-wrap">
              <table className="data-table stock-table activity-log-table">
                <thead>
                  <tr>
                    <th className="activity-col-date">{t("activities.date")}</th>
                    <th className="activity-col-time">{t("activities.time")}</th>
                    <th className="activity-col-user">{t("activities.user")}</th>
                    <th className="activity-col-section">{t("activities.section")}</th>
                    <th className="activity-col-action">{t("activities.action")}</th>
                    <th className="activity-col-details">{t("activities.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id}>
                      <td className="activity-col-date">{formatActivityDate(a.timestamp)}</td>
                      <td className="activity-col-time">{formatActivityOnlyTime(a.timestamp)}</td>
                      <td className="activity-col-user">
                        <div className="stock-cell-main">{a.actorName}</div>
                        <div className="stock-cell-sub">{a.actorRole}</div>
                      </td>
                      <td className="activity-col-section">
                        <span className="stock-badge stock-badge-dept">{a.section}</span>
                      </td>
                      <td className="activity-col-action">{a.action}</td>
                      <td className="activity-col-details">{a.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

