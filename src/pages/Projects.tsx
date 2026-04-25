import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import projectsHeadingIcon from "../../project dash.jpg";
import { useCanEdit } from "../auth";
import { SoldFormCustomSelect } from "../components/SoldFormCustomSelect";
import { authHeadersJson } from "../utils/authHeaders";
import { getAuthToken } from "../utils/authToken";
import { downloadExcel } from "../utils/excel";
import { useTranslation } from "react-i18next";

interface Project {
  id: string;
  name: string;
  clientId: string | null;
  projectValue: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface Client {
  id: string;
  name: string;
}

interface ProjectFormErrors {
  name?: string;
  clientId?: string;
  projectValue?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface ProjectRecordFile {
  id: string;
  originalName: string;
  url: string;
  uploadedAt?: string;
}

const API = "/api/projects";

type SortKey = "name" | "client" | "startDate" | "endDate" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "completed" | "on_hold";

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function validateProjectForm(values: {
  name: string;
  clientId: string;
  projectValue: string;
  status: string;
  startDate: string;
  endDate: string;
}, t: (key: string) => string): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const moneyRegex = /^\d+(\.\d{1,2})?$/;

  if (!values.name.trim()) errors.name = t("projectsPage.errors.projectNameRequired");
  if (!values.clientId.trim()) errors.clientId = t("projectsPage.errors.clientRequired");
  if (!values.projectValue.trim()) errors.projectValue = t("projectsPage.errors.projectValueRequired");
  else if (!moneyRegex.test(values.projectValue.trim())) errors.projectValue = t("projectsPage.errors.projectValueInvalid");
  if (!values.status.trim()) errors.status = t("projectsPage.errors.statusRequired");
  if (!values.startDate.trim()) errors.startDate = t("projectsPage.errors.startDateRequired");
  if (!values.endDate.trim()) errors.endDate = t("projectsPage.errors.endDateRequired");
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = t("projectsPage.errors.endDateEarlier");
  }

  return errors;
}

export const Projects: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [list, setList] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectValue, setProjectValue] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("active");
  const [formErrors, setFormErrors] = useState<ProjectFormErrors>({});
  const [projectRecordFiles, setProjectRecordFiles] = useState<ProjectRecordFile[]>([]);
  const [pendingProjectFiles, setPendingProjectFiles] = useState<File[]>([]);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const clientSelectOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);

  const statusSelectOptions = useMemo(
    () => [
      { value: "active", label: t("projectsPage.active") },
      { value: "completed", label: t("projectsPage.completed") },
      { value: "on_hold", label: t("projectsPage.onHold") },
    ],
    [t]
  );

  const fetchList = async () => {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(t("projectsPage.errors.unableToLoad"));
      setList(await res.json());
    } catch {
      setError(t("projectsPage.errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    fetch("/api/clients").then((r) => r.ok && r.json().then(setClients)).catch(() => {});
  }, []);

  const openNew = () => {
    if (!canEdit) return;
    setEditingId(null);
    setName("");
    setClientId("");
    setProjectValue("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setStatus("active");
    setFormErrors({});
    setProjectRecordFiles([]);
    setPendingProjectFiles([]);
    setFormOpen(true);
    setError("");
  };

  const openEdit = (item: Project) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setName(item.name);
    setClientId(item.clientId || "");
    setProjectValue(item.projectValue || "");
    setDescription(item.description || "");
    setStartDate(item.startDate || "");
    setEndDate(item.endDate || "");
    setStatus(item.status || "active");
    setFormErrors({});
    setPendingProjectFiles([]);
    fetch(`/api/records/project/${encodeURIComponent(item.id)}/files`)
      .then((r) => (r.ok ? r.json() : []))
      .then((files) => setProjectRecordFiles(Array.isArray(files) ? (files as ProjectRecordFile[]) : []))
      .catch(() => setProjectRecordFiles([]));
    setFormOpen(true);
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormErrors({});
    setProjectRecordFiles([]);
    setPendingProjectFiles([]);
  };

  const uploadProjectFiles = async (projectId: string, files: File[]) => {
    const token = getAuthToken();
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const uploadRes = await fetch(`/api/records/project/${encodeURIComponent(projectId)}/files`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!uploadRes.ok) throw new Error(t("projectsPage.errors.fileUploadFailed"));
    }
  };

  const handleDeleteProjectFile = async (fileId: string) => {
    if (!editingId || !canEdit) return;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(
        `/api/records/project/${encodeURIComponent(editingId)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) throw new Error(t("projectsPage.errors.fileDeleteFailed"));
      setProjectRecordFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projectsPage.errors.fileDeleteFailed"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setError("");
    try {
      const values = {
        name: String(name || "").trim(),
        clientId: String(clientId || "").trim(),
        projectValue: String(projectValue || "").trim(),
        status: String(status || "").trim(),
        startDate: String(startDate || "").trim(),
        endDate: String(endDate || "").trim(),
      };
      const errors = validateProjectForm(values, t);
      setFormErrors(errors);
      if (Object.keys(errors).length > 0) return;

      const body = {
        name: values.name,
        clientId: values.clientId || null,
        projectValue: values.projectValue,
        description,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
      };
      if (editingId) {
        const res = await fetch(`${API}/${editingId}`, { method: "PUT", headers: authHeadersJson(), body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || t("projectsPage.errors.updateFailed"));
        if (pendingProjectFiles.length > 0) {
          await uploadProjectFiles(editingId, pendingProjectFiles);
        }
      } else {
        const res = await fetch(API, { method: "POST", headers: authHeadersJson(), body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("projectsPage.errors.addFailed"));
        const createdId = String(data?.id || "").trim();
        if (createdId && pendingProjectFiles.length > 0) {
          await uploadProjectFiles(createdId, pendingProjectFiles);
        }
      }
      closeForm();
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projectsPage.errors.requestFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) throw new Error(t("projectsPage.errors.deleteFailed"));
      fetchList();
    } catch { setError(t("projectsPage.errors.deleteFailed")); }
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

  const clientName = (cid: string | null) => clients.find((c) => c.id === cid)?.name ?? t("projectsPage.notAvailable");

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = list.filter((item) => {
      const clientOk = clientFilter === "all" ? true : String(item.clientId || "") === clientFilter;
      if (!clientOk) return false;
      const statusOk = statusFilter === "all" ? true : String(item.status || "active") === statusFilter;
      if (!statusOk) return false;
      if (!q) return true;
      const hay = [
        item.name,
        clientName(item.clientId),
        item.projectValue,
        item.description,
        item.startDate,
        item.endDate,
        item.status,
      ].map(safeLower);
      return hay.some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const getVal = (x: Project) => {
        if (sortKey === "client") return clientName(x.clientId);
        return (x as any)[sortKey] ?? "";
      };
      const av = safeLower(getVal(a));
      const bv = safeLower(getVal(b));
      return av.localeCompare(bv) * dirMult;
    });

    return sorted;
  }, [clientFilter, clients, list, query, sortDir, sortKey, statusFilter]);

  const stats = useMemo(() => {
    const total = list.length;
    const shown = filteredSorted.length;
    const activeCount = list.filter((i) => String(i.status || "active") === "active").length;
    const completedCount = list.filter((i) => String(i.status || "") === "completed").length;
    const onHoldCount = list.filter((i) => String(i.status || "") === "on_hold").length;
    return { total, shown, activeCount, completedCount, onHoldCount };
  }, [filteredSorted.length, list]);

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
      Project: i.name,
      Client: clientName(i.clientId),
      "Project value": i.projectValue,
      Start: i.startDate,
      End: i.endDate,
      Status: i.status,
      Description: i.description,
    }));
    downloadExcel(`projects-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  const projectStatusClass = (value: string) => {
    const v = String(value || "").toLowerCase();
    if (v === "active") return "status-active";
    if (v === "completed") return "status-completed";
    if (v === "on_hold") return "status-onhold";
    return "status-decommissioned";
  };

  const projectStatusLabel = (value: string) => {
    const v = String(value || "").toLowerCase();
    if (v === "active") return t("projectsPage.active");
    if (v === "completed") return t("projectsPage.completed");
    if (v === "on_hold") return t("projectsPage.onHold");
    return t("projectsPage.notAvailable");
  };

  return (
    <div className="page page-projects">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={projectsHeadingIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("projectsPage.title")}</h1>
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
              {t("projectsPage.addProject")}
            </button>
          ) : null}
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("projectsPage.totalProjects")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">{t("projectsPage.allRecords")}</div>
          <i className="bi bi-diagram-3 stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("stockPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("stockPage.basedOnFilters")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("projectsPage.active")}</div>
          <div className="stock-stat-value">{stats.activeCount}</div>
          <div className="stock-stat-sub">{t("projectsPage.inProgress")}</div>
          <i className="bi bi-play-circle stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("projectsPage.completed")}</div>
          <div className="stock-stat-value">{stats.completedCount}</div>
          <div className="stock-stat-sub">{t("projectsPage.finished")}</div>
          <i className="bi bi-check2-circle stock-stat-icon" />
        </div>
      </div>

      <div className="stock-toolbar">
        <div className="stock-search">
          <i className="bi bi-search" />
          <input
            className="stock-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("projectsPage.searchPlaceholder")}
          />
          {query.trim() ? (
            <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label={t("activities.clearSearch")}>
              <i className="bi bi-x-lg" />
            </button>
          ) : null}
        </div>

        <div className="stock-filters">
          <label className="stock-filter">
            <span>{t("projectsPage.client")}</span>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="all">{t("alertsPage.all")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stock-filter">
            <span>{t("projectsPage.status")}</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">{t("alertsPage.all")}</option>
              <option value="active">{t("projectsPage.active")}</option>
              <option value="completed">{t("projectsPage.completed")}</option>
              <option value="on_hold">{t("projectsPage.onHold")}</option>
            </select>
          </label>
        </div>
      </div>
      {formOpen && canEdit && (
        <div className="card border-0 shadow-lg sold-form-shell projects-form-shell mb-4">
          <div className="sold-form-shell-header px-3 py-3 px-md-4">
            <h2 className="sold-form-shell-title mb-0">
              <i className="bi bi-diagram-3 me-2" aria-hidden />
              {editingId ? t("projectsPage.editProject") : t("projectsPage.addProject")}
            </h2>
            <p className="sold-form-shell-sub mb-0 small">{t("projectsPage.addFormHint")}</p>
          </div>
          <div className="card-body pt-0 px-3 px-md-4 pb-4">
            <form onSubmit={handleSubmit} className="form sold-form-inner">
              <div className="form-grid sold-form-grid-vibrant">
                <label className="full-width">
                  <span>{t("projectsPage.projectName")}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
                    }}
                    required
                  />
                  {formErrors.name ? <small className="text-danger d-block mt-1">{formErrors.name}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.client")}</span>
                  <SoldFormCustomSelect
                    required
                    placeholder={t("projectsPage.selectClient")}
                    value={clientId}
                    options={clientSelectOptions}
                    onChange={(v) => {
                      setClientId(v);
                      if (formErrors.clientId) setFormErrors((p) => ({ ...p, clientId: undefined }));
                    }}
                  />
                  {formErrors.clientId ? <small className="text-danger d-block mt-1">{formErrors.clientId}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.projectValue")}</span>
                  <input
                    type="text"
                    value={projectValue}
                    onChange={(e) => {
                      setProjectValue(e.target.value);
                      if (formErrors.projectValue) setFormErrors((p) => ({ ...p, projectValue: undefined }));
                    }}
                    placeholder={t("projectsPage.egValue")}
                    required
                  />
                  {formErrors.projectValue ? <small className="text-danger d-block mt-1">{formErrors.projectValue}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.status")}</span>
                  <SoldFormCustomSelect
                    value={status}
                    options={statusSelectOptions}
                    onChange={(v) => {
                      setStatus(v);
                      if (formErrors.status) setFormErrors((p) => ({ ...p, status: undefined }));
                    }}
                  />
                  {formErrors.status ? <small className="text-danger d-block mt-1">{formErrors.status}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.startDate")}</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (formErrors.startDate) setFormErrors((p) => ({ ...p, startDate: undefined }));
                    }}
                    required
                  />
                  {formErrors.startDate ? <small className="text-danger d-block mt-1">{formErrors.startDate}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.endDate")}</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      if (formErrors.endDate) setFormErrors((p) => ({ ...p, endDate: undefined }));
                    }}
                    required
                  />
                  {formErrors.endDate ? <small className="text-danger d-block mt-1">{formErrors.endDate}</small> : null}
                </label>
                <label className="full-width">
                  <span>{t("projectsPage.description")}</span>
                  <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <div className="full-width project-form-documents">
                  <div className="project-form-documents-head">
                    <span className="project-form-documents-title">
                      <i className="bi bi-folder2-open me-2" aria-hidden />
                      {t("projectsPage.projectDocuments")}
                    </span>
                    <p className="project-form-documents-hint mb-0 small">{t("projectsPage.projectDocumentsHint")}</p>
                  </div>
                  <label className="project-form-file-input-wrap">
                    <span className="project-form-file-input-label">{t("projectsPage.chooseFiles")}</span>
                    <input
                      type="file"
                      multiple
                      className="project-form-file-input"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,application/pdf"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length) setPendingProjectFiles((prev) => [...prev, ...picked]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {pendingProjectFiles.length > 0 ? (
                    <ul className="project-form-file-list project-form-file-list--pending list-unstyled mb-0">
                      {pendingProjectFiles.map((f, i) => (
                        <li key={`${f.name}-${f.size}-${i}`} className="project-form-file-row">
                          <i className="bi bi-cloud-upload me-2 text-primary" aria-hidden />
                          <span className="project-form-file-name">{f.name}</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-link text-danger project-form-file-remove"
                            onClick={() => setPendingProjectFiles((p) => p.filter((_, j) => j !== i))}
                          >
                            {t("projectsPage.removeFromQueue")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {editingId ? (
                    projectRecordFiles.length > 0 ? (
                      <ul className="project-form-file-list project-form-file-list--saved list-unstyled mb-0">
                        <li className="project-form-saved-heading small text-muted">{t("projectsPage.savedDocuments")}</li>
                        {projectRecordFiles.map((f) => (
                          <li key={f.id} className="project-form-file-row project-form-file-row--saved">
                            <i className="bi bi-file-earmark-check me-2 text-success" aria-hidden />
                            <a href={f.url} target="_blank" rel="noreferrer" className="project-form-file-name fw-semibold">
                              {f.originalName}
                            </a>
                            {f.uploadedAt ? (
                              <span className="project-form-file-date small text-muted ms-2">{String(f.uploadedAt).slice(0, 10)}</span>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm btn-link text-danger project-form-file-remove"
                              onClick={() => handleDeleteProjectFile(f.id)}
                            >
                              {t("common.delete")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="project-form-no-files small text-muted mb-0">{t("projectsPage.noSavedDocuments")}</p>
                    )
                  ) : null}
                </div>
              </div>
              <div className="form-actions sold-form-actions mt-4">
                <button type="button" className="btn btn-outline-secondary px-4 rounded-pill" onClick={closeForm}>
                  {t("common.cancel")}
                </button>
                <button type="submit" className="btn btn-primary px-4 rounded-pill sold-form-submit-btn fw-bold">
                  {editingId ? t("common.update") : t("common.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {loading && <p className="text-muted">{t("common.loading")}</p>}
      {!loading && (
        <div className="table-wrapper">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("name")}>
                    {t("projectsPage.project")} {sortIcon("name")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("client")}>
                    {t("projectsPage.client")} {sortIcon("client")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("startDate")}>
                    {t("projectsPage.start")} {sortIcon("startDate")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("endDate")}>
                    {t("projectsPage.end")} {sortIcon("endDate")}
                  </button>
                </th>
                <th>
                  {t("projectsPage.projectValue")}
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("status")}>
                    {t("projectsPage.status")} {sortIcon("status")}
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
                        <i className="bi bi-diagram-3" />
                      </div>
                      <div className="stock-empty-title">{t("projectsPage.noProjectsFound")}</div>
                      <div className="stock-empty-sub">
                        {list.length === 0 ? t("projectsPage.addFirstProject") : t("stockPage.tryAdjusting")}
                      </div>
                      <div className="stock-empty-actions">
                        {query.trim() || clientFilter !== "all" || statusFilter !== "all" ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setQuery("");
                              setClientFilter("all");
                              setStatusFilter("all");
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
                      <div className="stock-cell-main">{item.name}</div>
                    </td>
                    <td>{clientName(item.clientId)}</td>
                    <td>{item.startDate || t("projectsPage.notAvailable")}</td>
                    <td>{item.endDate || t("projectsPage.notAvailable")}</td>
                    <td>{item.projectValue || t("projectsPage.notAvailable")}</td>
                    <td>
                      <span className={`status-pill ${projectStatusClass(item.status)}`}>{projectStatusLabel(item.status)}</span>
                    </td>
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <Link
                          to={`/search/project/${encodeURIComponent(item.id)}?from=projects`}
                          className="btn-sm stock-action-btn stock-view-btn"
                        >
                          {t("projectsPage.view")}
                        </Link>
                        {canEdit ? (
                          <>
                            <button type="button" className="btn-sm stock-action-btn stock-edit-btn" onClick={() => openEdit(item)}>
                              {t("common.edit")}
                            </button>
                            <button type="button" className="btn-sm stock-action-btn stock-delete-btn" onClick={() => requestDelete(item.id)}>
                              {t("common.delete")}
                            </button>
                          </>
                        ) : null}
                      </div>
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
            <p>{t("projectsPage.deletePrompt")}</p>
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
