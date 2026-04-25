import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import stockAvailabilityIcon from "../../stock ava dash.avif";
import { useCanEdit } from "../auth";
import {
  BUSINESS_DEPARTMENTS,
  getBusinessDepartmentLabel,
  type BusinessDepartment,
  normalizeBusinessDepartment,
} from "../departments";
import { SoldFormCustomSelect } from "../components/SoldFormCustomSelect";
import { authHeadersJson } from "../utils/authHeaders";
import { downloadExcel } from "../utils/excel";

interface StockItem {
  id: string;
  partNumber: string;
  partDescription: string;
  dateOfProcurement: string;
  storageLocation: string;
  qrCode: string;
  department?: string;
}

const API = "/api/stock-availability";

type SortKey =
  | "partNumber"
  | "partDescription"
  | "dateOfProcurement"
  | "storageLocation"
  | "qrCode"
  | "department";
type SortDir = "asc" | "desc";

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function isProbablyUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export const StockAvailability: React.FC = () => {
  const { t, i18n } = useTranslation();
  const uiLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";
  const canEdit = useCanEdit();
  const [searchParams, setSearchParams] = useSearchParams();
  const deptParam = searchParams.get("department");
  const deptFilter: BusinessDepartment | null =
    deptParam && (BUSINESS_DEPARTMENTS as readonly string[]).includes(deptParam) ? (deptParam as BusinessDepartment) : null;

  const setDepartmentQuery = (next: BusinessDepartment | "all") => {
    const p = new URLSearchParams(searchParams);
    if (next === "all") p.delete("department");
    else p.set("department", next);
    setSearchParams(p, { replace: true });
  };

  const [list, setList] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [dateOfProcurement, setDateOfProcurement] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [department, setDepartment] = useState<BusinessDepartment>("trading");
  const [query, setQuery] = useState("");
  const [filterField, setFilterField] = useState<"all" | "partNumber" | "partDescription" | "location">("all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dateOfProcurement");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const url = deptFilter ? `${API}?department=${encodeURIComponent(deptFilter)}` : API;
      const res = await fetch(url);
      if (!res.ok) throw new Error(t("stockPage.errors.unableToLoad"));
      const data = await res.json();
      setList(data);
    } catch (e) {
      setError(t("stockPage.errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [deptFilter]);

  const locations = useMemo(() => {
    const unique = Array.from(new Set(list.map((i) => String(i.storageLocation || "").trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [list]);

  const partNumbers = useMemo(() => {
    const unique = Array.from(new Set(list.map((i) => String(i.partNumber || "").trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [list]);

  const partDescriptions = useMemo(() => {
    const unique = Array.from(new Set(list.map((i) => String(i.partDescription || "").trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [list]);

  const filterValues = useMemo(() => {
    if (filterField === "partNumber") return partNumbers;
    if (filterField === "partDescription") return partDescriptions;
    if (filterField === "location") return locations;
    return [];
  }, [filterField, locations, partDescriptions, partNumbers]);

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = list.filter((item) => {
      const currentValue =
        filterField === "partNumber"
          ? String(item.partNumber || "").trim()
          : filterField === "partDescription"
          ? String(item.partDescription || "").trim()
          : filterField === "location"
          ? String(item.storageLocation || "").trim()
          : "";
      const fieldOk = filterField === "all" || filterValue === "all" ? true : currentValue === filterValue;
      if (!fieldOk) return false;
      if (!q) return true;
      const hay = [
        item.partNumber,
        item.partDescription,
        item.dateOfProcurement,
        item.storageLocation,
        item.qrCode,
        getBusinessDepartmentLabel(normalizeBusinessDepartment(item.department), uiLang),
      ].map(safeLower);
      return hay.some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "dateOfProcurement") {
        return String(a.dateOfProcurement || "").localeCompare(String(b.dateOfProcurement || "")) * dirMult;
      }
      if (sortKey === "department") {
        const av = getBusinessDepartmentLabel(normalizeBusinessDepartment(a.department), uiLang);
        const bv = getBusinessDepartmentLabel(normalizeBusinessDepartment(b.department), uiLang);
        return av.localeCompare(bv) * dirMult;
      }
      const av = safeLower((a as any)[sortKey]);
      const bv = safeLower((b as any)[sortKey]);
      return av.localeCompare(bv) * dirMult;
    });

    return sorted;
  }, [list, filterField, filterValue, query, sortDir, sortKey]);

  const stats = useMemo(() => {
    const total = list.length;
    const shown = filteredSorted.length;
    const locationCount = new Set(list.map((i) => String(i.storageLocation || "").trim()).filter(Boolean)).size;
    const latest = list
      .map((i) => String(i.dateOfProcurement || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0];
    return { total, shown, locationCount, latest: latest || "—" };
  }, [filteredSorted.length, list]);

  const openNew = () => {
    if (!canEdit) return;
    setEditingId(null);
    setPartNumber("");
    setPartDescription("");
    setDateOfProcurement("");
    setStorageLocation("");
    setQrCode("");
    setDepartment(deptFilter ?? "trading");
    setFormOpen(true);
    setError("");
  };

  const openEdit = (item: StockItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setPartNumber(item.partNumber);
    setPartDescription(item.partDescription);
    setDateOfProcurement(item.dateOfProcurement);
    setStorageLocation(item.storageLocation);
    setQrCode(item.qrCode);
    setDepartment(normalizeBusinessDepartment(item.department));
    setFormOpen(true);
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setError("");
    try {
      const body = {
        partNumber,
        partDescription,
        dateOfProcurement,
        storageLocation,
        qrCode,
        department,
      };
      if (editingId) {
        const res = await fetch(`${API}/${editingId}`, {
          method: "PUT",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) throw new Error(t("activities.sessionExpired"));
          throw new Error(data.message || t("stockPage.errors.updateFailed"));
        }
      } else {
        const res = await fetch(API, {
          method: "POST",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) throw new Error(t("activities.sessionExpired"));
          throw new Error(data.message || t("stockPage.errors.addFailed"));
        }
      }
      closeForm();
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("stockPage.errors.requestFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) {
        if (res.status === 401) throw new Error(t("activities.sessionExpired"));
        throw new Error(t("stockPage.errors.deleteFailed"));
      }
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("stockPage.errors.deleteFailed"));
    }
  };

  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const cancelDelete = () => {
    setPendingDeleteId(null);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    await handleDelete(pendingDeleteId);
    setPendingDeleteId(null);
  };

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

  const handleExportExcel = () => {
    if (filteredSorted.length === 0) return;
    const rows = filteredSorted.map((i) => ({
      Department: getBusinessDepartmentLabel(normalizeBusinessDepartment(i.department), uiLang),
      "Part number": i.partNumber,
      "Part description": i.partDescription,
      "Date of procurement": i.dateOfProcurement,
      "Storage location": i.storageLocation,
      "QR Code": i.qrCode,
    }));
    const deptTag = deptFilter ? `-${deptFilter}` : "";
    downloadExcel(`stock-availability${deptTag}-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  const handleCopy = async (value: string) => {
    const v = String(value || "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      // ignore
    }
  };

  return (
    <div className="page page-stock">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={stockAvailabilityIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("stockPage.title")}</h1>
          </div>
        </div>
        <div className="stock-header-actions">
          <button
            type="button"
            className="ghost-button stock-export-btn"
            onClick={handleExportExcel}
            disabled={filteredSorted.length === 0}
            title={t("stockPage.exportExcel")}
          >
            <i className="bi bi-file-earmark-spreadsheet me-1" />
            {t("stockPage.exportExcel")}
          </button>
          {canEdit ? (
            <button type="button" className="primary-button" onClick={openNew}>
              <i className="bi bi-plus-lg me-1" />
              {t("stockPage.addItem")}
            </button>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-muted">{t("common.loading")}</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("stockPage.totalItems")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">
            {deptFilter ? t("stockPage.departmentOnly", { department: getBusinessDepartmentLabel(deptFilter, uiLang) }) : t("stockPage.allDepartments")}
          </div>
          <i className="bi bi-box-seam stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("stockPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("stockPage.basedOnFilters")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("stockPage.locations")}</div>
          <div className="stock-stat-value">{stats.locationCount}</div>
          <div className="stock-stat-sub">{t("stockPage.storageSites")}</div>
          <i className="bi bi-geo-alt stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("stockPage.latestProcurement")}</div>
          <div className="stock-stat-value stock-stat-value-small">{stats.latest}</div>
          <div className="stock-stat-sub">{t("stockPage.mostRecentDate")}</div>
          <i className="bi bi-calendar3 stock-stat-icon" />
        </div>
      </div>

      <div className="stock-toolbar">
        <div className="stock-search">
          <i className="bi bi-search" />
          <input
            className="stock-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("stockPage.searchPlaceholder")}
          />
          {query.trim() ? (
            <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label={t("activities.clearSearch")}>
              <i className="bi bi-x-lg" />
            </button>
          ) : null}
        </div>

        <div className="stock-filters">
          <label className="stock-filter stock-filter-department">
            <span>{t("stockPage.department")}</span>
            <select
              value={deptFilter ?? "all"}
              onChange={(e) => {
                const v = e.target.value;
                setDepartmentQuery(v === "all" ? "all" : (v as BusinessDepartment));
              }}
              aria-label={t("stockPage.filterDepartmentAria")}
            >
              <option value="all">{t("stockPage.allDepartments")}</option>
              {BUSINESS_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {getBusinessDepartmentLabel(d, uiLang)}
                </option>
              ))}
            </select>
          </label>
          <label className="stock-filter">
            <span>{t("stockPage.filter")}</span>
            <select
              value={filterField}
              onChange={(e) => {
                setFilterField(e.target.value as "all" | "partNumber" | "partDescription" | "location");
                setFilterValue("all");
              }}
            >
              <option value="all">{t("stockPage.allFields")}</option>
              <option value="partNumber">{t("stockPage.partNumber")}</option>
              <option value="partDescription">{t("stockPage.partDescription")}</option>
              <option value="location">{t("stockPage.location")}</option>
            </select>
          </label>

          <label className="stock-filter">
            <span>{t("stockPage.value")}</span>
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={filterField === "all"}
            >
              <option value="all">{t("alertsPage.all")}</option>
              {filterValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {formOpen && canEdit && (
        <div className="card border-0 shadow-lg sold-form-shell stock-availability-form-shell mb-4">
          <div className="sold-form-shell-header px-3 py-3 px-md-4">
            <h2 className="sold-form-shell-title mb-0">
              <i className="bi bi-box-seam me-2" aria-hidden />
              {editingId ? t("stockPage.editItem") : t("stockPage.addItem")}
            </h2>
            <p className="sold-form-shell-sub mb-0 small">{t("stockPage.addFormHint")}</p>
          </div>
          <div className="card-body pt-0 px-3 px-md-4 pb-4">
            <form onSubmit={handleSubmit} className="form sold-form-inner">
              <div className="form-grid sold-form-grid-vibrant">
                <label className="full-width">
                  <span>{t("stockPage.partNumberLabel")}</span>
                  <input
                    type="text"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    required
                  />
                </label>
                <label className="full-width">
                  <span>{t("stockPage.partDescriptionLabel")}</span>
                  <input
                    type="text"
                    value={partDescription}
                    onChange={(e) => setPartDescription(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>{t("stockPage.dateOfProcurement")}</span>
                  <input
                    type="date"
                    value={dateOfProcurement}
                    onChange={(e) => setDateOfProcurement(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>{t("stockPage.storageLocation")}</span>
                  <input
                    type="text"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    required
                  />
                </label>
                <label className="full-width">
                  <span>{t("stockPage.qrCode")}</span>
                  <input
                    type="text"
                    value={qrCode}
                    onChange={(e) => setQrCode(e.target.value)}
                    placeholder={t("stockPage.codeOrUrl")}
                  />
                </label>
                <label>
                  <span>{t("stockPage.department")}</span>
                  <SoldFormCustomSelect
                    value={department}
                    options={BUSINESS_DEPARTMENTS.map((d) => ({
                      value: d,
                      label: getBusinessDepartmentLabel(d, uiLang),
                    }))}
                    onChange={(v) => setDepartment(v as BusinessDepartment)}
                  />
                </label>
              </div>
              <div className="form-actions sold-form-actions mt-4">
                <button type="button" className="btn btn-outline-secondary px-4 rounded-pill" onClick={closeForm}>
                  {t("stockPage.cancel")}
                </button>
                <button type="submit" className="btn btn-primary px-4 rounded-pill sold-form-submit-btn fw-bold">
                  {editingId ? t("stockPage.update") : t("stockPage.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("department")}>
                    {t("stockPage.department")} {sortIcon("department")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("partNumber")}>
                    {t("stockPage.partNumber")} {sortIcon("partNumber")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("partDescription")}>
                    {t("stockPage.partDescription")} {sortIcon("partDescription")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("dateOfProcurement")}>
                    {t("stockPage.procurementDate")} {sortIcon("dateOfProcurement")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("storageLocation")}>
                    {t("stockPage.location")} {sortIcon("storageLocation")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("qrCode")}>
                    {t("stockPage.qrRef")} {sortIcon("qrCode")}
                  </button>
                </th>
                <th className="data-table-col-actions" scope="col">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="stock-empty">
                      <div className="stock-empty-icon">
                        <i className="bi bi-inboxes" />
                      </div>
                      <div className="stock-empty-title">{t("stockPage.noItemsFound")}</div>
                      <div className="stock-empty-sub">
                        {list.length === 0 && deptFilter
                          ? `No stock is tagged for ${getBusinessDepartmentLabel(deptFilter, uiLang)}.`
                          : list.length === 0
                          ? t("stockPage.addFirstItem")
                          : t("stockPage.tryAdjusting")}
                      </div>
                      <div className="stock-empty-actions">
                        {deptFilter ? (
                          <button type="button" className="ghost-button" onClick={() => setDepartmentQuery("all")}>
                            {t("stockPage.showAllDepartments")}
                          </button>
                        ) : null}
                        {query.trim() || filterField !== "all" || filterValue !== "all" ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setQuery("");
                              setFilterField("all");
                              setFilterValue("all");
                            }}
                          >
                            {t("stockPage.clearFilters")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSorted.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="stock-badge stock-badge-dept">
                        {getBusinessDepartmentLabel(normalizeBusinessDepartment(item.department), uiLang)}
                      </span>
                    </td>
                    <td>
                      <div className="stock-cell-main">{item.partNumber}</div>
                      <div className="stock-cell-sub">{t("stockPage.id")}: {item.id.slice(0, 8)}</div>
                    </td>
                    <td>{item.partDescription}</td>
                    <td>{item.dateOfProcurement}</td>
                    <td>
                      <span className="stock-badge">{item.storageLocation}</span>
                    </td>
                    <td>
                      {item.qrCode ? (
                        <div className="stock-qr">
                          <span className="stock-qr-text" title={item.qrCode}>
                            {item.qrCode}
                          </span>
                          <div className="stock-qr-actions">
                            <button
                              type="button"
                              className="stock-icon-btn stock-icon-btn-copy"
                              onClick={() => handleCopy(item.qrCode)}
                              title={t("stockPage.copy")}
                            >
                              <i className="bi bi-clipboard" />
                            </button>
                            {isProbablyUrl(item.qrCode) ? (
                              <a className="stock-icon-btn stock-icon-btn-link" href={item.qrCode} target="_blank" rel="noreferrer" title={t("stockPage.openLink")}>
                                <i className="bi bi-box-arrow-up-right" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="data-table-col-actions">
                      {canEdit ? (
                        <div className="data-table-actions-inner">
                          <button type="button" className="btn-sm stock-action-btn stock-edit-btn" onClick={() => openEdit(item)}>
                            {t("stockPage.edit")}
                          </button>
                          <button type="button" className="btn-sm stock-action-btn stock-delete-btn" onClick={() => requestDelete(item.id)}>
                            {t("stockPage.delete")}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pendingDeleteId && canEdit ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="stock-delete-modal">
            <h3 id="delete-confirm-title">{t("stockPage.confirmDelete")}</h3>
            <p>{t("stockPage.deletePrompt")}</p>
            <div className="stock-delete-modal-actions">
              <button type="button" className="stock-action-btn stock-cancel-btn" onClick={cancelDelete}>
                {t("common.cancel")}
              </button>
              <button type="button" className="stock-action-btn stock-delete-btn" onClick={confirmDelete}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
