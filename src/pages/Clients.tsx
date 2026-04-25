import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clientsHeadingIcon from "../../clients dash.jpg";
import { useCanEdit } from "../auth";
import { authHeadersJson } from "../utils/authHeaders";
import { getAuthToken } from "../utils/authToken";
import { downloadExcel } from "../utils/excel";
import { useTranslation } from "react-i18next";

interface Client {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
}

interface ClientFormErrors {
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface ClientRecordFile {
  id: string;
  originalName: string;
  url: string;
  uploadedAt?: string;
}

const API = "/api/clients";

type SortKey = "name" | "contactName" | "email" | "phone";
type SortDir = "asc" | "desc";

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function validateClientForm(
  values: {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
},
  t: (key: string) => string
): ClientFormErrors {
  const errors: ClientFormErrors = {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{7,15}$/;

  if (!values.name.trim()) errors.name = t("clientsPage.errors.clientNameRequired");
  if (!values.contactName.trim()) errors.contactName = t("clientsPage.errors.contactNameRequired");
  if (!values.email.trim()) errors.email = t("clientsPage.errors.emailRequired");
  else if (!emailRegex.test(values.email.trim())) errors.email = t("clientsPage.errors.invalidEmail");
  if (!values.phone.trim()) errors.phone = t("clientsPage.errors.phoneRequired");
  else if (!phoneRegex.test(values.phone.trim())) errors.phone = t("clientsPage.errors.invalidPhone");
  if (!values.address.trim()) errors.address = t("clientsPage.errors.addressRequired");

  return errors;
}

export const Clients: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [formErrors, setFormErrors] = useState<ClientFormErrors>({});
  const [clientRecordFiles, setClientRecordFiles] = useState<ClientRecordFile[]>([]);
  const [pendingClientFiles, setPendingClientFiles] = useState<File[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchList = async () => {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(t("clientsPage.errors.unableToLoad"));
      setList(await res.json());
    } catch {
      setError(t("clientsPage.errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = list.filter((item) => {
      if (!q) return true;
      const hay = [item.name, item.contactName, item.email, item.phone, item.address].map(safeLower);
      return hay.some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const av = safeLower((a as any)[sortKey]);
      const bv = safeLower((b as any)[sortKey]);
      return av.localeCompare(bv) * dirMult;
    });

    return sorted;
  }, [list, query, sortDir, sortKey]);

  const stats = useMemo(() => {
    const total = list.length;
    const shown = filteredSorted.length;
    const withEmail = list.filter((i) => String(i.email || "").trim()).length;
    const withPhone = list.filter((i) => String(i.phone || "").trim()).length;
    return { total, shown, withEmail, withPhone };
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
      Name: i.name,
      Contact: i.contactName,
      Email: i.email,
      Phone: i.phone,
      Address: i.address,
    }));
    downloadExcel(`clients-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  const openNew = () => {
    if (!canEdit) return;
    setEditingId(null);
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setFormErrors({});
    setClientRecordFiles([]);
    setPendingClientFiles([]);
    setFormOpen(true);
    setError("");
  };

  const openEdit = (item: Client) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setName(item.name);
    setContactName(item.contactName || "");
    setEmail(item.email || "");
    setPhone(item.phone || "");
    setAddress(item.address || "");
    setFormErrors({});
    setPendingClientFiles([]);
    fetch(`/api/records/client/${encodeURIComponent(item.id)}/files`)
      .then((r) => (r.ok ? r.json() : []))
      .then((files) => setClientRecordFiles(Array.isArray(files) ? (files as ClientRecordFile[]) : []))
      .catch(() => setClientRecordFiles([]));
    setFormOpen(true);
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormErrors({});
    setClientRecordFiles([]);
    setPendingClientFiles([]);
  };

  const uploadClientFiles = async (clientId: string, files: File[]) => {
    const token = getAuthToken();
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const uploadRes = await fetch(`/api/records/client/${encodeURIComponent(clientId)}/files`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!uploadRes.ok) throw new Error(t("clientsPage.errors.fileUploadFailed"));
    }
  };

  const handleDeleteClientFile = async (fileId: string) => {
    if (!editingId || !canEdit) return;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(
        `/api/records/client/${encodeURIComponent(editingId)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) throw new Error(t("clientsPage.errors.fileDeleteFailed"));
      setClientRecordFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("clientsPage.errors.fileDeleteFailed"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setError("");
    try {
      const body = {
        name: name.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
      };
      const errors = validateClientForm(body, t);
      setFormErrors(errors);
      if (Object.keys(errors).length > 0) return;

      if (editingId) {
        const res = await fetch(`${API}/${editingId}`, { method: "PUT", headers: authHeadersJson(), body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || t("clientsPage.errors.updateFailed"));
        if (pendingClientFiles.length > 0) {
          await uploadClientFiles(editingId, pendingClientFiles);
        }
      } else {
        const res = await fetch(API, { method: "POST", headers: authHeadersJson(), body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("clientsPage.errors.addFailed"));
        const createdId = String(data?.id || "").trim();
        if (createdId && pendingClientFiles.length > 0) {
          await uploadClientFiles(createdId, pendingClientFiles);
        }
      }
      closeForm();
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("clientsPage.errors.requestFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) throw new Error(t("clientsPage.errors.deleteFailed"));
      fetchList();
    } catch { setError(t("clientsPage.errors.deleteFailed")); }
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

  return (
    <div className="page page-clients">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={clientsHeadingIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("clientsPage.title")}</h1>
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
              {t("clientsPage.addClient")}
            </button>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-muted">{t("common.loading")}</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("clientsPage.totalClients")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">{t("clientsPage.inDirectory")}</div>
          <i className="bi bi-people stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("stockPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("clientsPage.basedOnSearch")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("clientsPage.withEmail")}</div>
          <div className="stock-stat-value">{stats.withEmail}</div>
          <div className="stock-stat-sub">{t("clientsPage.reachable")}</div>
          <i className="bi bi-envelope stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("clientsPage.withPhone")}</div>
          <div className="stock-stat-value">{stats.withPhone}</div>
          <div className="stock-stat-sub">{t("clientsPage.callable")}</div>
          <i className="bi bi-telephone stock-stat-icon" />
        </div>
      </div>

      {!loading && (
        <div className="stock-toolbar">
          <div className="stock-search">
            <i className="bi bi-search" />
            <input
              className="stock-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("clientsPage.searchPlaceholder")}
            />
            {query.trim() ? (
              <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label={t("activities.clearSearch")}>
                <i className="bi bi-x-lg" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {formOpen && canEdit && (
        <div className="card border-0 shadow-lg sold-form-shell clients-form-shell mb-4">
          <div className="sold-form-shell-header px-3 py-3 px-md-4">
            <h2 className="sold-form-shell-title mb-0">
              <i className="bi bi-people me-2" aria-hidden />
              {editingId ? t("clientsPage.editClient") : t("clientsPage.addClient")}
            </h2>
            <p className="sold-form-shell-sub mb-0 small">{t("clientsPage.addFormHint")}</p>
          </div>
          <div className="card-body pt-0 px-3 px-md-4 pb-4">
            <form onSubmit={handleSubmit} className="form sold-form-inner">
              <div className="form-grid sold-form-grid-vibrant">
                <label className="full-width">
                  <span>{t("clientsPage.clientName")}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    required
                  />
                  {formErrors.name ? <small className="text-danger d-block mt-1">{formErrors.name}</small> : null}
                </label>
                <label>
                  <span>{t("clientsPage.contactName")}</span>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => {
                      setContactName(e.target.value);
                      if (formErrors.contactName) setFormErrors((prev) => ({ ...prev, contactName: undefined }));
                    }}
                    required
                  />
                  {formErrors.contactName ? <small className="text-danger d-block mt-1">{formErrors.contactName}</small> : null}
                </label>
                <label>
                  <span>{t("clientsPage.email")}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    required
                  />
                  {formErrors.email ? <small className="text-danger d-block mt-1">{formErrors.email}</small> : null}
                </label>
                <label>
                  <span>{t("clientsPage.phone")}</span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => {
                      const numeric = e.target.value.replace(/\D/g, "");
                      setPhone(numeric);
                      if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    required
                  />
                  {formErrors.phone ? <small className="text-danger d-block mt-1">{formErrors.phone}</small> : null}
                </label>
                <label className="full-width">
                  <span>{t("clientsPage.address")}</span>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      if (formErrors.address) setFormErrors((prev) => ({ ...prev, address: undefined }));
                    }}
                    required
                  />
                  {formErrors.address ? <small className="text-danger d-block mt-1">{formErrors.address}</small> : null}
                </label>
                <div className="full-width client-form-documents">
                  <div className="client-form-documents-head">
                    <span className="client-form-documents-title">
                      <i className="bi bi-folder2-open me-2" aria-hidden />
                      {t("clientsPage.clientDocuments")}
                    </span>
                    <p className="client-form-documents-hint mb-0 small">{t("clientsPage.clientDocumentsHint")}</p>
                  </div>
                  <label className="client-form-file-input-wrap">
                    <span className="client-form-file-input-label">{t("clientsPage.chooseFiles")}</span>
                    <input
                      type="file"
                      multiple
                      className="client-form-file-input"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,application/pdf"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length) setPendingClientFiles((prev) => [...prev, ...picked]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {pendingClientFiles.length > 0 ? (
                    <ul className="client-form-file-list client-form-file-list--pending list-unstyled mb-0">
                      {pendingClientFiles.map((f, i) => (
                        <li key={`${f.name}-${f.size}-${i}`} className="client-form-file-row">
                          <i className="bi bi-cloud-upload me-2 text-primary" aria-hidden />
                          <span className="client-form-file-name">{f.name}</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-link text-danger client-form-file-remove"
                            onClick={() => setPendingClientFiles((p) => p.filter((_, j) => j !== i))}
                          >
                            {t("clientsPage.removeFromQueue")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {editingId ? (
                    clientRecordFiles.length > 0 ? (
                      <ul className="client-form-file-list client-form-file-list--saved list-unstyled mb-0">
                        <li className="client-form-saved-heading small text-muted">{t("clientsPage.savedDocuments")}</li>
                        {clientRecordFiles.map((f) => (
                          <li key={f.id} className="client-form-file-row client-form-file-row--saved">
                            <i className="bi bi-file-earmark-check me-2 text-success" aria-hidden />
                            <a href={f.url} target="_blank" rel="noreferrer" className="client-form-file-name fw-semibold">
                              {f.originalName}
                            </a>
                            {f.uploadedAt ? (
                              <span className="client-form-file-date small text-muted ms-2">{String(f.uploadedAt).slice(0, 10)}</span>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm btn-link text-danger client-form-file-remove"
                              onClick={() => handleDeleteClientFile(f.id)}
                            >
                              {t("common.delete")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="client-form-no-files small text-muted mb-0">{t("clientsPage.noSavedDocuments")}</p>
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
      {!loading && (
        <div className="table-wrapper">
          <table className="data-table stock-table clients-data-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("name")}>
                    {t("clientsPage.name")} {sortIcon("name")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("contactName")}>
                    {t("clientsPage.contact")} {sortIcon("contactName")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("email")}>
                    {t("clientsPage.email")} {sortIcon("email")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("phone")}>
                    {t("clientsPage.phone")} {sortIcon("phone")}
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
                  <td colSpan={5}>
                    <div className="stock-empty">
                      <div className="stock-empty-icon">
                        <i className="bi bi-people" />
                      </div>
                      <div className="stock-empty-title">{t("clientsPage.noClientsFound")}</div>
                      <div className="stock-empty-sub">
                        {list.length === 0 ? t("clientsPage.addFirstClient") : t("activities.tryAdjusting")}
                      </div>
                      <div className="stock-empty-actions">
                        {query.trim() ? (
                          <button type="button" className="ghost-button" onClick={() => setQuery("")}>
                            {t("activities.clearSearch")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSorted.map((item) => (
                <tr key={item.id}>
                  <td className="client-cell client-cell-name">
                    <div className="stock-cell-main">{item.name}</div>
                  </td>
                  <td className="client-cell client-cell-contact">
                    {String(item.contactName || "").trim() ? (
                      <span className="client-field-pill client-field-pill-contact">{item.contactName}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="client-cell client-cell-email">
                    {String(item.email || "").trim() ? (
                      <a className="client-field-pill client-field-pill-email" href={`mailto:${String(item.email).trim()}`}>
                        {item.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="client-cell client-cell-phone">
                    {String(item.phone || "").trim() ? (
                      <a className="client-field-pill client-field-pill-phone" href={`tel:${String(item.phone).trim()}`}>
                        {item.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="client-cell client-cell-actions data-table-col-actions">
                    <div className="data-table-actions-inner">
                      <Link
                        to={`/search/client/${encodeURIComponent(item.id)}?from=clients`}
                        className="btn-sm stock-action-btn stock-view-btn"
                      >
                        {t("clientsPage.view")}
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
            <p>{t("clientsPage.deletePrompt")}</p>
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
