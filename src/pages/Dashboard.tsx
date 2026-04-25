import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BUSINESS_DEPARTMENTS,
  getBusinessDepartmentLabel,
  normalizeBusinessDepartment,
  aggregateInventoryByDepartment,
  type BusinessDepartment,
} from "../departments";
import { detailLabelKey, type SearchResultRow } from "../utils/searchResultHelpers";
import totalRecordsIcon from "../../total records.jpg";
import inventoryItemsIcon from "../../inventory items.jpeg";
import equipmentIcon from "../../equipment.jpg";
import soldStockDashIcon from "../../sold daaash.jpg";
import alertIcon from "../../alert.png";
import deptIcon from "../../dept.png";
import { SearchResultFullDetailBody } from "../components/SearchResultFullDetailBody";
import { getAuthToken } from "../utils/authToken";
import { COMPANY_CHANGED_EVENT, getSelectedCompanyId, type CompanyId } from "../company";

interface AlertItem {
  type: string;
  severity: string;
  entityId: string;
  entityName: string;
  dueDate: string;
  message: string;
}

type EquipmentStatus = "active" | "under_maintenance" | "decommissioned" | "replacement";

type EquipmentStatusCounts = Record<EquipmentStatus, number>;

/** Relative activity levels per site (placeholder until site metrics are wired). */
const DASHBOARD_LOCATION_LEVEL_PCTS = [72, 48, 86, 58, 78, 52] as const;

const DASHBOARD_SITE_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

const MAIN_ROW_DETAIL_KEYS = [
  "type",
  "model",
  "serialNumber",
  "serialNo",
  "partNumber",
  "location",
  "status",
  "department",
  "clientName",
  "manufacturer",
] as const;

function mainRowChips(row: SearchResultRow, max = 5) {
  const d = row.details;
  const chips: { key: string; value: string }[] = [];
  for (const k of MAIN_ROW_DETAIL_KEYS) {
    const raw = d[k];
    if (raw != null && String(raw).trim() !== "") {
      chips.push({ key: k, value: String(raw) });
      if (chips.length >= max) break;
    }
  }
  return chips;
}

function truncateInline(s: string, n = 40) {
  const x = s.trim();
  if (x.length <= n) return x;
  return `${x.slice(0, n - 1)}…`;
}

async function fetchJsonArray(url: string, signal?: AbortSignal): Promise<unknown[]> {
  try {
    const r = await fetch(url, { cache: "no-store", signal });
    if (!r.ok) return [];
    const data = await r.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    if (e instanceof Error && e.name === "AbortError") throw e;
    return [];
  }
}

export const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const uiLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";
  const [stockCount, setStockCount] = useState<number | null>(null);
  const [soldCount, setSoldCount] = useState<number | null>(null);
  const [equipmentCount, setEquipmentCount] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [equipmentStatusCounts, setEquipmentStatusCounts] = useState<EquipmentStatusCounts>({
    active: 0,
    under_maintenance: 0,
    decommissioned: 0,
    replacement: 0,
  });
  const [deptSectionOpen, setDeptSectionOpen] = useState(false);
  const [deptCounts, setDeptCounts] = useState<Record<BusinessDepartment, { stock: number; sold: number }> | null>(
    null
  );
  const statsLoadGenRef = useRef(0);
  const dashboardPathRef = useRef(location.pathname);
  dashboardPathRef.current = location.pathname;

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalDismissed, setSearchModalDismissed] = useState(false);
  const [searchDetailRow, setSearchDetailRow] = useState<SearchResultRow | null>(null);
  const [searchDetailLoading, setSearchDetailLoading] = useState(false);
  const [searchDetailError, setSearchDetailError] = useState("");
  const [uploadingSearchFile, setUploadingSearchFile] = useState(false);
  const [searchUploadError, setSearchUploadError] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<CompanyId>(() => getSelectedCompanyId());

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null && q.trim() !== "") {
      setSearchInput(q.trim());
    }
  }, [searchParams]);

  useEffect(() => {
    const onCompanyChanged = () => setSelectedCompanyId(getSelectedCompanyId());
    window.addEventListener(COMPANY_CHANGED_EVENT, onCompanyChanged);
    return () => window.removeEventListener(COMPANY_CHANGED_EVENT, onCompanyChanged);
  }, []);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(h);
  }, [searchInput]);


  useEffect(() => {
    setSearchModalDismissed(false);
  }, [debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        const rows = Array.isArray(data.results) ? data.results : [];
        setSearchResults(rows as SearchResultRow[]);
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch]);

  useEffect(() => {
    setSearchModalOpen(debouncedSearch.length >= 2 && !searchModalDismissed);
  }, [debouncedSearch, searchModalDismissed]);

  useEffect(() => {
    if (location.pathname !== "/dashboard") return;

    const ac = new AbortController();

    const applyStats = (
      gen: number,
      stock: unknown[],
      sold: unknown[],
      equipment: unknown[],
      clients: unknown[],
      projects: unknown[],
      alertList: unknown[]
    ) => {
      if (gen !== statsLoadGenRef.current) return;
      setStockCount(stock.length);
      setSoldCount(sold.length);
      const equipmentList = equipment as { status?: string }[];
        setEquipmentCount(equipmentList.length);
      setClientCount(clients.length);
      setProjectCount(projects.length);
      setAlerts(alertList as AlertItem[]);

        const counts: EquipmentStatusCounts = { active: 0, under_maintenance: 0, decommissioned: 0, replacement: 0 };
      equipmentList.forEach((e) => {
          const s = String(e?.status || "").toLowerCase();
          if (s === "active" || s === "under_maintenance" || s === "decommissioned" || s === "replacement") counts[s as EquipmentStatus] += 1;
        });
        setEquipmentStatusCounts(counts);

      setDeptCounts(
        aggregateInventoryByDepartment(
          stock as { department?: unknown }[],
          sold as { department?: unknown }[]
        )
      );
    };

    const load = () => {
      const gen = ++statsLoadGenRef.current;
      Promise.all([
        fetchJsonArray("/api/stock-availability", ac.signal),
        fetchJsonArray("/api/sold-stock", ac.signal),
        fetchJsonArray("/api/equipment", ac.signal),
        fetchJsonArray("/api/clients", ac.signal),
        fetchJsonArray("/api/projects", ac.signal),
        fetchJsonArray("/api/alerts", ac.signal),
      ])
        .then(([stock, sold, equipment, clients, projects, alertList]) => {
          applyStats(gen, stock, sold, equipment, clients, projects, alertList);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (e instanceof Error && e.name === "AbortError") return;
        });
    };

    load();

    const onVisible = () => {
      if (document.visibilityState === "visible" && dashboardPathRef.current === "/dashboard") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      statsLoadGenRef.current += 1;
      ac.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [location.pathname, selectedCompanyId]);

  const totalRecords =
    (stockCount ?? 0) +
    (soldCount ?? 0) +
    (equipmentCount ?? 0) +
    (clientCount ?? 0) +
    (projectCount ?? 0);

  const showSearchPanel = searchInput.trim().length > 0;

  const previewDetailValue = (row: SearchResultRow, key: string, value: string) => {
    if (key === "department") {
      return getBusinessDepartmentLabel(normalizeBusinessDepartment(String(value)), uiLang);
    }
    if (key === "type") {
      return t(`equipmentPage.types.${value}`, { defaultValue: value });
    }
    if (key === "status" && row.entity === "equipment") {
      return String(value) === "under_maintenance"
        ? t("equipmentPage.status.underMaintenance")
        : t(`equipmentPage.status.${value}`, { defaultValue: value });
    }
    return value;
  };

  const attachedFileCount = (row: SearchResultRow) =>
    row.folders.find((f) => f.key === "files")?.items.length ?? 0;

  const openSearchFullDetail = (row: SearchResultRow) => {
    setSearchDetailError("");
    setSearchUploadError("");
    setSearchDetailRow(row);
    setSearchDetailLoading(true);
    const token = getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/search/record?entity=${encodeURIComponent(row.entity)}&id=${encodeURIComponent(row.id)}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.result) setSearchDetailRow(data.result as SearchResultRow);
      })
      .catch(() => setSearchDetailError(t("dashboard.searchDetailPage.loadError")))
      .finally(() => setSearchDetailLoading(false));
  };

  const closeSearchFullDetail = () => {
    setSearchDetailRow(null);
    setSearchDetailError("");
    setSearchUploadError("");
    setSearchDetailLoading(false);
  };

  const locationSiteLabels = useMemo(
    () =>
      [
        t("dashboard.siteA"),
        t("dashboard.siteB"),
        t("dashboard.siteC"),
        t("dashboard.siteD"),
        t("dashboard.siteE"),
        t("dashboard.siteF"),
      ] as const,
    [t, uiLang]
  );

  return (
    <div className="page page-dashboard">
      <div className="dashboard-search card">
        <label className="dashboard-search-label" htmlFor="dashboard-main-search">
          <i className="bi bi-search" aria-hidden />
          <span className="dashboard-search-label-text">{t("dashboard.searchTitle")}</span>
        </label>
        <div className="dashboard-search-inner">
          <input
            id="dashboard-main-search"
            type="search"
            className="dashboard-search-input"
            placeholder={t("dashboard.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoComplete="off"
          />
          <p className="dashboard-search-hint">{t("dashboard.searchHint")}</p>
          {showSearchPanel ? (
            <>
              {searchModalOpen ? (
                <div className="dashboard-search-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("dashboard.searchModalTitle")}>
                  <div className="dashboard-search-modal">
                    <div className="dashboard-search-modal-header">
                      <div className="dashboard-search-modal-header-left">
                        <i className="bi bi-search" aria-hidden />
                        <span className="dashboard-search-modal-header-title">{t("dashboard.searchModalTitle")}</span>
                      </div>
                      <button
                        type="button"
                        className="dashboard-search-modal-close"
                        onClick={() => {
                          closeSearchFullDetail();
                          setSearchModalDismissed(true);
                          setSearchModalOpen(false);
                        }}
                        aria-label={t("common.close")}
                      >
                        <i className="bi bi-x-lg" aria-hidden />
                      </button>
                    </div>

                    <div className="dashboard-search-modal-body" role="region" aria-live="polite">
                      {searchDetailRow ? (
                        <div className="dashboard-search-inline-full-detail">
                          <div className="mb-3">
                            <button
                              type="button"
                              className="btn btn-sm rounded-pill dashboard-search-back-btn"
                              onClick={closeSearchFullDetail}
                            >
                              <i className="bi bi-arrow-left me-1" aria-hidden />
                              {t("dashboard.searchDetailPage.backToSearch")}
                            </button>
                          </div>
                          {searchDetailLoading ? (
                            <div className="dashboard-search-status">{t("dashboard.searchSearching")}</div>
                          ) : null}
                          {searchDetailError ? <div className="alert alert-warning mb-3">{searchDetailError}</div> : null}
                          <SearchResultFullDetailBody
                            row={searchDetailRow}
                            uploading={uploadingSearchFile}
                            uploadError={searchUploadError}
                            onUploadingChange={setUploadingSearchFile}
                            onUploadError={setSearchUploadError}
                            onUploadComplete={() => openSearchFullDetail(searchDetailRow)}
                          />
                        </div>
                      ) : searchLoading ? (
                        <div className="dashboard-search-status">{t("dashboard.searchSearching")}</div>
                      ) : debouncedSearch.length < 2 ? (
                        <div className="dashboard-search-status">{t("dashboard.searchMinChars")}</div>
                      ) : searchResults.length === 0 ? (
                        <div className="dashboard-search-status">{t("dashboard.searchNoResults")}</div>
                      ) : (
                        (() => {
                          const mainRow = searchResults[0];
                          const otherRows = searchResults.slice(1);
                          const chips = mainRowChips(mainRow, 5);
                          const mainFiles = attachedFileCount(mainRow);
                          return (
                            <div className="dashboard-search-results-stack">
                              <section className="dashboard-search-main-block" aria-label={t("dashboard.searchMainResult")}>
                                <article
                                  className={`dashboard-search-main-row card border-0 shadow-sm dashboard-search-main-row-${mainRow.entity}`}
                                >
                                  <div className="dashboard-search-main-row-accent" aria-hidden />
                                  <div className="dashboard-search-main-row-inner">
                                    <div className="dashboard-search-main-row-lead">
                                      <span className={`dashboard-search-entity dashboard-search-entity-${mainRow.entity}`}>
                                        {t(`dashboard.searchEntity.${mainRow.entity}`)}
                                      </span>
                                      <div className="dashboard-search-main-row-titles">
                                        <span className="dashboard-search-main-row-headline">{mainRow.headline}</span>
                                        {mainRow.subline ? (
                                          <span className="dashboard-search-main-row-sub">{mainRow.subline}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    {chips.length > 0 ? (
                                      <div className="dashboard-search-main-row-meta" role="list">
                                        {chips.map(({ key, value }) => (
                                          <span key={key} className="dashboard-search-meta-chip" role="listitem">
                                            <span className="dashboard-search-meta-chip-label">{t(detailLabelKey(key))}</span>
                                            <span className="dashboard-search-meta-chip-value">
                                              {truncateInline(
                                                String(previewDetailValue(mainRow, key, value)),
                                                key === "recordId" ? 24 : 40
                                              )}
                                            </span>
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <div className="dashboard-search-main-row-end">
                                      {mainFiles > 0 ? (
                                        <span className="badge rounded-pill dashboard-search-files-pill">
                                          <i className="bi bi-paperclip me-1" aria-hidden />
                                          {t("dashboard.searchAttachedFilesBadge", { count: mainFiles })}
                                        </span>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="btn btn-primary dashboard-search-view-more-primary rounded-pill"
                                        onClick={() => openSearchFullDetail(mainRow)}
                                      >
                                        <i className="bi bi-layout-text-sidebar-reverse me-2" aria-hidden />
                                        {t("dashboard.searchViewMore")}
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              </section>

                              {otherRows.length > 0 ? (
                                <section className="dashboard-search-others" aria-label={t("dashboard.searchOtherResults")}>
                                  <h3 className="dashboard-search-others-heading">
                                    {t("dashboard.searchOtherResults")}
                                    <span className="dashboard-search-others-count"> ({otherRows.length})</span>
                                  </h3>
                                  <ul className="dashboard-search-others-list">
                                    {otherRows.map((row) => {
                                      const ok = `${row.entity}-${row.id}`;
                                      const fc = attachedFileCount(row);
                                      const oc = mainRowChips(row, 3);
                                      return (
                                        <li key={ok} className={`dashboard-search-other-strip dashboard-search-other-strip-${row.entity}`}>
                                          <div className="dashboard-search-other-strip-inner">
                                            <span className={`dashboard-search-entity dashboard-search-entity-${row.entity}`}>
                                              {t(`dashboard.searchEntity.${row.entity}`)}
                                            </span>
                                            <div className="dashboard-search-other-strip-text">
                                              <span className="dashboard-search-other-strip-title">{row.headline}</span>
                                              {row.subline ? (
                                                <span className="dashboard-search-other-strip-sub">{row.subline}</span>
                                              ) : null}
                                              {oc.length > 0 ? (
                                                <div className="dashboard-search-other-strip-chips">
                                                  {oc.map(({ key, value }) => (
                                                    <span key={key} className="dashboard-search-meta-chip dashboard-search-meta-chip-sm">
                                                      <span className="dashboard-search-meta-chip-label">{t(detailLabelKey(key))}</span>
                                                      <span className="dashboard-search-meta-chip-value">
                                                        {truncateInline(String(previewDetailValue(row, key, value)), 28)}
                                                      </span>
                                                    </span>
                                                  ))}
                                                </div>
                                              ) : null}
                                              {fc > 0 ? (
                                                <span className="dashboard-search-other-files small">{t("dashboard.searchAttachedFilesBadge", { count: fc })}</span>
                                              ) : null}
                                            </div>
                                            <button
                                              type="button"
                                              className="btn btn-outline-primary btn-sm rounded-pill dashboard-search-other-btn"
                                              onClick={() => openSearchFullDetail(row)}
                                            >
                                              {t("dashboard.searchViewMore")}
                                            </button>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </section>
                              ) : null}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Top KPI strip */}
      <div className="dashboard-kpi-row">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-card-main">
            <div className="kpi-label kpi-label-strong kpi-label-total">{t("dashboard.totalRecords")}</div>
            <div className="kpi-value kpi-value-strong kpi-value-total">{totalRecords}</div>
          </div>
          <div className="kpi-icon">
            <img src={totalRecordsIcon} alt="" className="kpi-icon-image" />
          </div>
        </div>

        <Link to="/stock-availability" className="kpi-card kpi-card-orange kpi-card-link" aria-label={t("dashboard.stockRecords")}>
          <div className="kpi-card-main">
            <div className="kpi-label kpi-label-strong kpi-label-stock">{t("dashboard.stockRecords")}</div>
            <div className="kpi-value kpi-value-strong kpi-value-stock">{stockCount ?? "…"}</div>
          </div>
          <div className="kpi-icon">
            <img src={inventoryItemsIcon} alt="" className="kpi-icon-image" />
          </div>
        </Link>

        <Link to="/sold-stock" className="kpi-card kpi-card-sold kpi-card-link" aria-label={t("dashboard.soldRecords")}>
          <div className="kpi-card-main">
            <div className="kpi-label kpi-label-strong kpi-label-sold">{t("dashboard.soldRecords")}</div>
            <div className="kpi-value kpi-value-strong kpi-value-sold">{soldCount ?? "…"}</div>
          </div>
          <div className="kpi-icon">
            <img src={soldStockDashIcon} alt="" className="kpi-icon-image" />
          </div>
        </Link>

        <Link to="/equipment" className="kpi-card kpi-card-purple kpi-card-link" aria-label={t("dashboard.equipmentRecords")}>
          <div className="kpi-card-main">
            <div className="kpi-label kpi-label-strong kpi-label-equipment">{t("dashboard.equipmentRecords")}</div>
            <div className="kpi-value kpi-value-strong kpi-value-equipment">{equipmentCount ?? "…"}</div>
          </div>
          <div className="kpi-icon">
            <img src={equipmentIcon} alt="" className="kpi-icon-image" />
          </div>
        </Link>

        <Link to="/alerts" className="kpi-card kpi-card-pink kpi-card-link" aria-label={t("dashboard.alerts")}>
          <div className="kpi-card-main">
            <div className="kpi-label kpi-label-strong kpi-label-alerts">{t("dashboard.alerts")}</div>
            <div className="kpi-value kpi-value-strong kpi-value-alerts">{alerts.length}</div>
          </div>
          <div className="kpi-icon">
            <img src={alertIcon} alt="" className="kpi-icon-image" />
          </div>
        </Link>
      </div>

      <div className="dashboard-row dashboard-row-department">
        <div className="dashboard-panel panel-department">
          <button
            type="button"
            className="dashboard-dept-toggle"
            onClick={() => setDeptSectionOpen((o) => !o)}
            aria-expanded={deptSectionOpen}
          >
            <div className="dashboard-dept-toggle-text">
              <span className="dashboard-dept-kpi-label">{t("dashboard.department")}</span>
            </div>
            <div className="dashboard-dept-toggle-end">
              <span className="dashboard-dept-kpi-icon-wrap" aria-hidden>
                <img src={deptIcon} alt="" className="dashboard-dept-kpi-icon-image" />
              </span>
              <i className={`bi bi-chevron-${deptSectionOpen ? "up" : "down"} dashboard-dept-chevron`} aria-hidden />
            </div>
          </button>
          {deptSectionOpen ? (
            <div className="dashboard-dept-body">
              {BUSINESS_DEPARTMENTS.map((d) => (
                <div key={d} className="dashboard-dept-row">
                  <div className="dashboard-dept-name">{getBusinessDepartmentLabel(d, uiLang)}</div>
                  <div className="dashboard-dept-metrics">
                    <Link
                      to={`/stock-availability?department=${d}`}
                      className="dashboard-dept-metric dashboard-dept-metric-link"
                      aria-label={`${t("dashboard.stockList")} – ${getBusinessDepartmentLabel(d, uiLang)}`}
                    >
                      <span className="dashboard-dept-metric-label">{t("dashboard.stock")}</span>
                      <span className="dashboard-dept-metric-value">{deptCounts?.[d]?.stock ?? 0}</span>
                    </Link>
                    <Link
                      to={`/sold-stock?department=${d}`}
                      className="dashboard-dept-metric dashboard-dept-metric-link"
                      aria-label={`${t("dashboard.soldList")} – ${getBusinessDepartmentLabel(d, uiLang)}`}
                    >
                      <span className="dashboard-dept-metric-label">{t("dashboard.sold")}</span>
                      <span className="dashboard-dept-metric-value">{deptCounts?.[d]?.sold ?? 0}</span>
                    </Link>
                  </div>
                  <div className="dashboard-dept-links">
                    <Link to={`/stock-availability?department=${d}`} className="dashboard-dept-link">
                      {t("dashboard.stockList")}
                    </Link>
                    <Link to={`/sold-stock?department=${d}`} className="dashboard-dept-link">
                      {t("dashboard.soldList")}
                    </Link>
                  </div>
                  <div className="dashboard-dept-total" aria-live="polite">
                    {t("dashboard.deptStockSoldTotal", {
                      count: (deptCounts?.[d]?.stock ?? 0) + (deptCounts?.[d]?.sold ?? 0),
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="dashboard-row dashboard-row-charts">
        <div className="dashboard-panel panel-locations">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-title">{t("dashboard.locations")}</span>
            <span className="dashboard-panel-sub">{t("dashboard.last6Months")}</span>
          </div>
          <div className="chart-area chart-locations-area">
            <div className="chart-locations-matrix" role="list" aria-label={t("dashboard.locations")}>
              {DASHBOARD_LOCATION_LEVEL_PCTS.map((pct, i) => (
                <div key={i} className="chart-locations-row" role="listitem">
                  <div className="chart-locations-row-meta">
                    <span className="chart-locations-badge" aria-hidden>
                      {DASHBOARD_SITE_LETTERS[i]}
                    </span>
                    <span className="chart-locations-name">{locationSiteLabels[i]}</span>
                  </div>
                  <div className="chart-locations-meter" dir="ltr">
                    <div className="chart-locations-meter-track">
                      <div
                        className={`chart-locations-meter-fill chart-locations-meter-fill--${i + 1}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="chart-locations-meter-value">{pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-panel panel-stock">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-title">{t("dashboard.inventoryStock")}</span>
            <div className="chart-legend">
              <span className="legend-dot legend-in" /> {t("dashboard.chartIn")}
              <span className="legend-dot legend-low" /> {t("dashboard.chartLow")}
              <span className="legend-dot legend-out" /> {t("dashboard.chartOut")}
            </div>
          </div>
          <div className="chart-area chart-bar-area">
            <div className="chart-bars">
              {["A", "B", "C", "D", "E", "F"].map((label) => (
                <div key={label} className="chart-bar-group">
                  <div className="bar bar-in" />
                  <div className="bar bar-low" />
                  <div className="bar bar-out" />
                  <span className="bar-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-row dashboard-row-bottom">
        <div className="dashboard-panel panel-sections">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-title">{t("dashboard.equipmentByStatus")}</span>
          </div>
          <div className="status-overview">
            {(() => {
              const rows = [
                { key: "active" as const, label: t("dashboard.statusActive"), className: "status-active" },
                { key: "under_maintenance" as const, label: t("dashboard.statusUnderMaintenance"), className: "status-undermaintenance" },
                { key: "decommissioned" as const, label: t("dashboard.statusDecommissioned"), className: "status-decommissioned" },
                { key: "replacement" as const, label: t("dashboard.statusReplacement"), className: "status-replacement" },
              ] as const;
              const total = equipmentCount ?? 0;

              return (
                <>
                  <div className="status-vertical-chart" aria-hidden="true">
                    <div className="status-vertical-grid" />
                    <div className="status-vertical-bars">
                      {rows.map((row) => {
                        const value = equipmentStatusCounts[row.key] ?? 0;
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return (
                          <div key={`bar-${row.key}`} className="status-vertical-col">
                            <span className={`status-vertical-pct status-metric-value-${row.key}`}>{pct}%</span>
                            <div className="status-vertical-track">
                              <div className={`status-vertical-fill status-vertical-fill-${row.key}`} style={{ height: `${pct}%` }} />
                            </div>
                            <span className={`status-vertical-label status-metric-value-${row.key}`}>{row.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="status-overview-list">
                    {rows.map((row) => {
                      const value = equipmentStatusCounts[row.key] ?? 0;
                      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                      return (
                        <div key={row.key} className="status-metric">
                          <div className="status-metric-top">
                            <span className={`status-pill ${row.className}`}>{row.label}</span>
                            <span className={`status-metric-value status-metric-value-${row.key}`}>
                              {value} <span className="status-metric-pct">({pct}%)</span>
                            </span>
                          </div>
                          <div className="status-bar-track" aria-hidden="true">
                            <div className={`status-bar-fill status-bar-${row.key}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="dashboard-panel panel-quick">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-title">{t("dashboard.quickNavigation")}</span>
          </div>
          <div className="quick-links-grid">
            <Link to="/stock-availability" className="quick-link">
              <i className="bi bi-boxes" />
              <span className="quick-link-title">{t("dashboard.quickStockRecords")}</span>
            </Link>
            <Link to="/sold-stock" className="quick-link">
              <i className="bi bi-receipt" />
              <span className="quick-link-title">{t("dashboard.quickSoldRecords")}</span>
            </Link>
            <Link to="/clients" className="quick-link">
              <i className="bi bi-people" />
              <span className="quick-link-title">{t("dashboard.quickClients")}</span>
            </Link>
            <Link to="/projects" className="quick-link">
              <i className="bi bi-diagram-3" />
              <span className="quick-link-title">{t("dashboard.quickProjects")}</span>
            </Link>
            <Link to="/equipment" className="quick-link">
              <i className="bi bi-nut" />
              <span className="quick-link-title">{t("dashboard.quickEquipmentRecords")}</span>
            </Link>
            <Link to="/alerts" className="quick-link">
              <i className="bi bi-bell" />
              <span className="quick-link-title">{t("dashboard.quickAlerts")}</span>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
};
