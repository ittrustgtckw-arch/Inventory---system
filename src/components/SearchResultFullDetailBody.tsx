import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCanEdit } from "../auth";
import { getAuthToken } from "../utils/authToken";
import { getBusinessDepartmentLabel, normalizeBusinessDepartment } from "../departments";
import {
  SEARCH_DATE_FIELDS_BY_ENTITY,
  detailLabelKey,
  type SearchEntity,
  type SearchResultRow,
} from "../utils/searchResultHelpers";
import { formatSoldWarrantyYearsMonths } from "../utils/soldWarrantyFormat";

function FolderLink({ path, className, children }: { path: string; className?: string; children: React.ReactNode }) {
  if (path.startsWith("/uploads/")) {
    return (
      <a href={path} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={path} className={className}>
      {children}
    </Link>
  );
}

export function SearchResultFullDetailBody({
  row,
  uploading,
  uploadError,
  onUploadingChange,
  onUploadError,
  onUploadComplete,
}: {
  row: SearchResultRow;
  uploading: boolean;
  uploadError: string;
  onUploadingChange: (v: boolean) => void;
  onUploadError: (msg: string) => void;
  onUploadComplete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const uiLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";
  const canEdit = useCanEdit();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    onUploadError("");
    onUploadingChange(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/records/${row.entity}/${row.id}/files`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(String(data?.message || t("dashboard.searchUploadFailed")));
      }
      onUploadComplete();
    } catch (e) {
      onUploadError(e instanceof Error ? e.message : t("dashboard.searchUploadFailed"));
    } finally {
      onUploadingChange(false);
    }
  };

  const renderValue = (key: string, value: string, ent: SearchEntity) => {
    if (key === "department") {
      return getBusinessDepartmentLabel(normalizeBusinessDepartment(String(value)), uiLang);
    }
    if (key === "type") {
      return t(`equipmentPage.types.${value}`, { defaultValue: value });
    }
    if (key === "status" && ent === "equipment") {
      return String(value) === "under_maintenance"
        ? t("equipmentPage.status.underMaintenance")
        : t(`equipmentPage.status.${value}`, { defaultValue: value });
    }
    if (key === "warranty" && ent === "sold") {
      return formatSoldWarrantyYearsMonths(String(value), t) || String(value);
    }
    return value;
  };

  const dateKeys = new Set(SEARCH_DATE_FIELDS_BY_ENTITY[row.entity]);
  const detailEntries = Object.entries(row.details).filter(([, v]) => v != null && String(v).trim() !== "");
  const primaryEntries = detailEntries.filter(([k]) => !dateKeys.has(k));
  const dateEntries = detailEntries.filter(([k]) => dateKeys.has(k));
  const hasDetailRows = primaryEntries.length > 0 || dateEntries.length > 0;
  const foldersWithItems = row.folders.filter((f) => f.items.length > 0);
  const showRecordIdRow = !detailEntries.some(([k]) => k === "recordId");

  return (
    <div className="search-detail-body">
      <header className={`search-detail-hero card border-0 shadow-lg rounded-4 mb-4 overflow-hidden search-detail-hero-${row.entity}`}>
        <div className="search-detail-hero-accent" aria-hidden />
        <div className="card-body p-3 p-md-3 search-detail-hero-inner">
          <div className="search-detail-hero-top d-flex flex-wrap align-items-center justify-content-between gap-3">
            <span className={`dashboard-search-entity dashboard-search-entity-${row.entity} search-detail-entity-pill`}>
              {t(`dashboard.searchEntity.${row.entity}`)}
            </span>
            {canEdit ? (
              <label className="search-detail-upload btn btn-sm btn-outline-primary rounded-pill px-3 py-2 mb-0">
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    void handleFile(f);
                    e.currentTarget.value = "";
                  }}
                  disabled={uploading}
                />
                <i className="bi bi-cloud-upload me-1" aria-hidden />
                <span>{uploading ? t("dashboard.searchUploading") : t("dashboard.searchDetailPage.attachFile")}</span>
              </label>
            ) : null}
          </div>
          <h1 className="search-detail-title fw-bold mt-2 mb-0">{row.headline}</h1>
          {row.subline ? (
            <p className="search-detail-sub fs-6 text-muted mt-2 mb-0">
              <i className="bi bi-person-lines-fill me-2 opacity-75 search-detail-sub-icon" aria-hidden />
              {row.subline}
            </p>
          ) : null}
        </div>
      </header>

      {uploadError ? (
        <div className="alert alert-danger border-0 shadow-sm rounded-3 search-detail-inline-alert" role="alert">
          {uploadError}
        </div>
      ) : null}

      <div className="search-detail-layout search-detail-layout-tables d-flex flex-column gap-4">
        <section
          className={`search-detail-section card border-0 shadow rounded-4 overflow-hidden search-detail-section-kv search-detail-panel search-detail-panel--${row.entity}`}
        >
          <div className={`card-header border-0 py-2 px-3 search-detail-card-head search-detail-card-head--${row.entity}`}>
            <h2 className="h6 mb-0 fw-bold text-uppercase search-detail-head-text d-flex align-items-center gap-2">
              <span className="search-detail-section-icon">
                <i className="bi bi-table" aria-hidden />
              </span>
              {t("dashboard.searchDetailPage.recordDetails")}
            </h2>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive search-detail-table-wrap border-top border-light">
              <table
                className={`table table-hover table-borderless mb-0 align-middle data-table stock-table search-detail-kv-table search-detail-kv-table--${row.entity}`}
              >
              <thead>
                <tr>
                  <th scope="col" className="search-detail-kv-col-field">
                    {t("dashboard.searchDetailPage.fieldColumn")}
                  </th>
                  <th scope="col" className="search-detail-kv-col-value">
                    {t("dashboard.searchDetailPage.valueColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {!hasDetailRows && !showRecordIdRow ? (
                  <tr>
                    <td colSpan={2} className="search-detail-kv-empty">
                      {t("dashboard.searchDetailPage.noFields")}
                    </td>
                  </tr>
                ) : null}
                {primaryEntries.map(([key, value]) => (
                  <tr key={key} className="search-detail-kv-row">
                    <th scope="row">{t(detailLabelKey(key))}</th>
                    <td className="search-detail-kv-value">{renderValue(key, String(value), row.entity)}</td>
                  </tr>
                ))}
                {dateEntries.length > 0 && primaryEntries.length > 0 ? (
                  <tr className="search-detail-kv-section-row">
                    <td colSpan={2}>{t("dashboard.searchDetailPage.scheduleDates")}</td>
                  </tr>
                ) : null}
                {dateEntries.map(([key, value]) => (
                  <tr key={key} className="search-detail-kv-row search-detail-kv-row-date">
                    <th scope="row">{t(detailLabelKey(key))}</th>
                    <td className="search-detail-kv-value">{String(value)}</td>
                  </tr>
                ))}
                {showRecordIdRow ? (
                  <tr className="search-detail-kv-row search-detail-kv-row-meta">
                    <th scope="row">{t("dashboard.searchDetail.recordId")}</th>
                    <td className="search-detail-kv-value">
                      <code className="search-detail-kv-code">{row.id}</code>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </section>

        <section
          className={`search-detail-section card border-0 shadow rounded-4 overflow-hidden search-detail-section-related search-detail-panel search-detail-panel-related search-detail-panel--${row.entity}`}
        >
          <div className={`card-header border-0 py-2 px-3 search-detail-card-head-related search-detail-card-head--${row.entity}`}>
            <h2 className="h6 mb-0 fw-bold text-uppercase search-detail-head-text d-flex align-items-center gap-2">
              <span className="search-detail-section-icon search-detail-section-icon-folder">
                <i className="bi bi-folder2-open" aria-hidden />
              </span>
              {t("dashboard.searchDetailPage.relatedLinks")}
            </h2>
          </div>
          <div className="card-body px-3 pb-3 pt-2">
            <p className="search-detail-related-hint text-muted small mb-3">
              <i className="bi bi-info-circle me-1 text-secondary" aria-hidden />
              {t("dashboard.searchDocumentsHint")}
            </p>
          {foldersWithItems.length === 0 ? (
            <div className="text-center py-4 px-3 rounded-3 bg-light border border-dashed border-2 text-muted search-detail-docs-empty-wrap">
              <i className="bi bi-inbox fs-2 d-block mb-2 opacity-50" aria-hidden />
              <p className="search-detail-docs-empty mb-0">{t("dashboard.searchDetailPage.noDocuments")}</p>
            </div>
          ) : (
            foldersWithItems.map((folder) => (
              <div key={folder.key} className="search-detail-folder-block card border-0 shadow-sm rounded-3 mb-3 overflow-hidden">
                <div className="card-header border-0 py-2 px-3 bg-light search-detail-folder-card-head">
                  <h3 className="search-detail-folder-table-title h6 mb-0 fw-bold d-flex align-items-center gap-2">
                    <i className="bi bi-folder-fill text-secondary" aria-hidden />
                    {t(`dashboard.searchFolder.${folder.key}`, { defaultValue: folder.key })}
                  </h3>
                </div>
                <div className="card-body p-0">
                <div className="table-responsive search-detail-table-wrap">
                  <table
                    className={`table table-hover table-borderless mb-0 align-middle data-table stock-table search-detail-docs-table search-detail-docs-table--${row.entity}`}
                  >
                    <thead>
                      <tr>
                        <th scope="col">{t("dashboard.searchDetailPage.documentColumn")}</th>
                        <th scope="col" className="search-detail-docs-col-link">
                          {t("dashboard.searchDetailPage.linkColumn")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {folder.items.map((item, idx) => (
                        <tr key={`${folder.key}-${idx}`}>
                          <td className="search-detail-docs-name-cell">
                            <span className="search-detail-docs-name">
                              {folder.key === "serviceRecords" && item.title
                                ? t("dashboard.searchOpenServiceLog", { count: Number(item.title) || 0 })
                                : item.title || item.subtitle || item.path}
                            </span>
                            {item.subtitle && !(folder.key === "serviceRecords" && item.title) ? (
                              <span className="search-detail-docs-sub">{item.subtitle}</span>
                            ) : null}
                          </td>
                          <td className="search-detail-docs-link-cell">
                            <FolderLink
                              path={item.path}
                              className="btn btn-sm btn-primary rounded-pill px-3 search-detail-docs-open-btn"
                            >
                              {t("dashboard.searchDetailPage.openLink")}
                              <i className="bi bi-box-arrow-up-right ms-1" aria-hidden />
                            </FolderLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            ))
          )}
          </div>
        </section>
      </div>
    </div>
  );
}
