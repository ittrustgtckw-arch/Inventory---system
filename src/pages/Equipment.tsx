import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import equipmentHeadingIcon from "../../inventiry dash.png";
import { useCanEdit } from "../auth";
import { SoldFormCustomSelect } from "../components/SoldFormCustomSelect";
import { authHeadersJson } from "../utils/authHeaders";
import { getAuthToken } from "../utils/authToken";
import { downloadExcel } from "../utils/excel";
import { useTranslation } from "react-i18next";

type EquipmentType =
  | "crane"
  | "generator"
  | "compressor"
  | "forklift"
  | "machinery_industrial_equipment"
  | "welding_machine"
  | "pump"
  | "hoist"
  | "hvac"
  | "other";

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
}

interface EquipmentFormErrors {
  equipmentType?: string;
  name?: string;
  model?: string;
  location?: string;
  status?: string;
  capacity?: string;
  serialNumber?: string;
  manufacturer?: string;
  commissionDate?: string;
  warrantyExpiry?: string;
  nextInspectionDate?: string;
  lastInspectionDate?: string;
  lastServiceDate?: string;
}

interface RecordFileItem {
  id: string;
  originalName: string;
  url: string;
  uploadedAt?: string;
  slot?: string;
}

type EquipmentFileSlot = "main" | "warranty" | "inspection" | "other";

const EQUIPMENT_FILE_FIELDS: { slot: EquipmentFileSlot; labelKey: string }[] = [
  { slot: "main", labelKey: "equipmentPage.mainFile" },
  { slot: "warranty", labelKey: "equipmentPage.warrantyFile" },
  { slot: "inspection", labelKey: "equipmentPage.inspectionFile" },
  { slot: "other", labelKey: "equipmentPage.otherFile" },
];

const API = "/api/equipment";

const EQUIPMENT_TYPE_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: "crane", label: "Crane" },
  { value: "generator", label: "Generator" },
  { value: "compressor", label: "Compressor" },
  { value: "forklift", label: "Heavy Equipment" },
  { value: "machinery_industrial_equipment", label: "Machinery & Industrial Equipment" },
  { value: "welding_machine", label: "Welding machine" },
  { value: "pump", label: "Pump" },
  { value: "hoist", label: "Hoist" },
  { value: "hvac", label: "HVAC" },
  { value: "other", label: "Other" },
];

function normalizeEquipmentStatus(s: string): EquipmentStatus {
  const v = String(s || "").toLowerCase();
  if (v === "active" || v === "under_maintenance" || v === "decommissioned" || v === "replacement") return v;
  return "active";
}

function typeLabel(t: (key: string) => string, type: string): string {
  return t(`equipmentPage.types.${type}`);
}

function statusLabel(t: (key: string) => string, s: EquipmentStatus): string {
  if (s === "under_maintenance") return t("equipmentPage.status.underMaintenance");
  return t(`equipmentPage.status.${s}`);
}

type SortKey =
  | "type"
  | "name"
  | "model"
  | "location"
  | "status"
  | "warrantyExpiry"
  | "nextInspectionDate";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | EquipmentStatus;

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function dateTagClass(dateValue?: string) {
  const d = String(dateValue || "").trim();
  if (!d) return "equip-date-neutral";
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return "equip-date-overdue";
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);
  if (d <= in30Str) return "equip-date-soon";
  return "equip-date-upcoming";
}

function validateEquipmentForm(values: {
  equipmentType: string;
  name: string;
  model: string;
  location: string;
  status: string;
  capacity: string;
  serialNumber: string;
  manufacturer: string;
  commissionDate: string;
  warrantyExpiry: string;
  nextInspectionDate: string;
  lastInspectionDate: string;
  lastServiceDate: string;
}, t: (key: string) => string): EquipmentFormErrors {
  const errors: EquipmentFormErrors = {};

  if (!values.equipmentType.trim()) errors.equipmentType = t("equipmentPage.errors.equipmentTypeRequired");
  if (!values.name.trim()) errors.name = t("equipmentPage.errors.nameRequired");
  if (!values.model.trim()) errors.model = t("equipmentPage.errors.modelRequired");
  if (!values.location.trim()) errors.location = t("equipmentPage.errors.locationRequired");
  if (!values.status.trim()) errors.status = t("equipmentPage.errors.statusRequired");
  if (!values.capacity.trim()) errors.capacity = t("equipmentPage.errors.capacityRequired");
  if (!values.serialNumber.trim()) errors.serialNumber = t("equipmentPage.errors.serialNumberRequired");
  if (!values.manufacturer.trim()) errors.manufacturer = t("equipmentPage.errors.manufacturerRequired");
  if (!values.commissionDate.trim()) errors.commissionDate = t("equipmentPage.errors.commissionDateRequired");

  if (values.warrantyExpiry && values.commissionDate && values.warrantyExpiry < values.commissionDate) {
    errors.warrantyExpiry = t("equipmentPage.errors.warrantyAfterCommission");
  }
  if (values.lastInspectionDate && values.commissionDate && values.lastInspectionDate < values.commissionDate) {
    errors.lastInspectionDate = t("equipmentPage.errors.lastInspectionBeforeCommission");
  }
  if (values.nextInspectionDate && values.lastInspectionDate && values.nextInspectionDate < values.lastInspectionDate) {
    errors.nextInspectionDate = t("equipmentPage.errors.nextInspectionBeforeLast");
  }
  if (values.lastServiceDate && values.commissionDate && values.lastServiceDate < values.commissionDate) {
    errors.lastServiceDate = t("equipmentPage.errors.lastServiceBeforeCommission");
  }

  return errors;
}

export const Equipment: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState<EquipmentItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>("crane");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<EquipmentStatus>("active");
  const [capacity, setCapacity] = useState("");
  const [lastServiceDate, setLastServiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [commissionDate, setCommissionDate] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [nextInspectionDate, setNextInspectionDate] = useState("");
  const [lastInspectionDate, setLastInspectionDate] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");
  const [formErrors, setFormErrors] = useState<EquipmentFormErrors>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [recordFiles, setRecordFiles] = useState<RecordFileItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Record<EquipmentFileSlot, File | null>>({
    main: null,
    warranty: null,
    inspection: null,
    other: null,
  });

  const equipmentFileFieldLabel = (slot?: string) => {
    const value = String(slot || "").trim().toLowerCase().replace(/-/g, "_");
    if (value === "main") return t("equipmentPage.mainFile");
    if (value === "warranty" || value === "warranty_inspection") return t("equipmentPage.warrantyFile");
    if (value === "inspection") return t("equipmentPage.inspectionFile");
    if (value === "other") return t("equipmentPage.otherFile");
    return t("equipmentPage.otherFile");
  };

  const equipmentTypeSelectOptions = useMemo(
    () => EQUIPMENT_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: typeLabel(t, opt.value) })),
    [t]
  );

  const statusSelectOptions = useMemo(
    () =>
      (["active", "under_maintenance", "decommissioned", "replacement"] as EquipmentStatus[]).map((s) => ({
        value: s,
        label: statusLabel(t, s),
      })),
    [t]
  );

  const fetchList = async () => {
    setLoading(true);
    try {
      const url = typeFilter ? `${API}?type=${encodeURIComponent(typeFilter)}` : API;
      const res = await fetch(url);
      if (!res.ok) throw new Error(t("equipmentPage.errors.failedToLoad"));
      const data = await res.json();
      setList(data);
    } catch (e) {
      setError(t("equipmentPage.errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [typeFilter]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || list.length === 0) return;
    const target = list.find((i) => i.id === editId);
    if (!target) return;
    openEdit(target);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [list, searchParams, setSearchParams]);

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = list.filter((item) => {
      const itemSt = normalizeEquipmentStatus(String(item.status));
      const statusOk = statusFilter === "all" ? true : itemSt === statusFilter;
      if (!statusOk) return false;
      if (!q) return true;
      const hay = [
        typeLabel(t, item.type),
        item.name,
        item.model,
        item.location,
        statusLabel(t, itemSt),
        item.serialNumber,
        item.manufacturer,
        item.capacity,
        item.warrantyExpiry,
        item.nextInspectionDate,
      ].map(safeLower);
      return hay.some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const getVal = (x: EquipmentItem) => {
        if (sortKey === "type") return typeLabel(t, x.type);
        return (x as any)[sortKey] ?? "";
      };
      const av = safeLower(getVal(a));
      const bv = safeLower(getVal(b));
      return av.localeCompare(bv) * dirMult;
    });

    return sorted;
  }, [list, query, sortDir, sortKey, statusFilter]);

  const stats = useMemo(() => {
    const total = list.length;
    const shown = filteredSorted.length;
    const active = list.filter((i) => normalizeEquipmentStatus(String(i.status)) === "active").length;
    const maintenance = list.filter((i) => normalizeEquipmentStatus(String(i.status)) === "under_maintenance").length;
    const decommissioned = list.filter((i) => normalizeEquipmentStatus(String(i.status)) === "decommissioned").length;
    const replacement = list.filter((i) => normalizeEquipmentStatus(String(i.status)) === "replacement").length;
    return { total, shown, active, maintenance, decommissioned, replacement };
  }, [filteredSorted.length, list]);

  const openNew = () => {
    if (!canEdit) return;
    setEditingId(null);
    setEquipmentType("crane");
    setName("");
    setModel("");
    setLocation("");
    setStatus("active");
    setCapacity("");
    setLastServiceDate("");
    setNotes("");
    setSerialNumber("");
    setManufacturer("");
    setCommissionDate("");
    setWarrantyExpiry("");
    setNextInspectionDate("");
    setLastInspectionDate("");
    setComplianceNotes("");
    setFormErrors({});
    setRecordFiles([]);
    setPendingFiles({ main: null, warranty: null, inspection: null, other: null });
    setFormOpen(true);
    setError("");
  };

  const openEdit = (item: EquipmentItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setEquipmentType((item.type as EquipmentType) || "other");
    setName(item.name);
    setModel(item.model || "");
    setLocation(item.location);
    setStatus(normalizeEquipmentStatus(item.status));
    setCapacity(item.capacity || "");
    setLastServiceDate(item.lastServiceDate || "");
    setNotes(item.notes || "");
    setSerialNumber(item.serialNumber || "");
    setManufacturer(item.manufacturer || "");
    setCommissionDate(item.commissionDate || "");
    setWarrantyExpiry(item.warrantyExpiry || "");
    setNextInspectionDate(item.nextInspectionDate || "");
    setLastInspectionDate(item.lastInspectionDate || "");
    setComplianceNotes(item.complianceNotes || "");
    setFormErrors({});
    setPendingFiles({ main: null, warranty: null, inspection: null, other: null });
    fetch(`/api/records/equipment/${item.id}/files`)
      .then((r) => (r.ok ? r.json() : []))
      .then((files) => setRecordFiles(Array.isArray(files) ? (files as RecordFileItem[]) : []))
      .catch(() => setRecordFiles([]));
    setFormOpen(true);
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormErrors({});
    setRecordFiles([]);
    setPendingFiles({ main: null, warranty: null, inspection: null, other: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setError("");
    try {
      const values = {
        equipmentType: String(equipmentType || "").trim(),
        name: String(name || "").trim(),
        model: String(model || "").trim(),
        location: String(location || "").trim(),
        status: String(status || "").trim(),
        capacity: String(capacity || "").trim(),
        serialNumber: String(serialNumber || "").trim(),
        manufacturer: String(manufacturer || "").trim(),
        commissionDate: String(commissionDate || "").trim(),
        warrantyExpiry: String(warrantyExpiry || "").trim(),
        nextInspectionDate: String(nextInspectionDate || "").trim(),
        lastInspectionDate: String(lastInspectionDate || "").trim(),
        lastServiceDate: String(lastServiceDate || "").trim(),
      };
      const errors = validateEquipmentForm(values, t);
      setFormErrors(errors);
      if (Object.keys(errors).length > 0) return;

      const body = {
        type: values.equipmentType,
        name: values.name,
        model: values.model,
        location: values.location,
        status: values.status,
        capacity: values.capacity,
        lastServiceDate: values.lastServiceDate || undefined,
        notes,
        serialNumber: values.serialNumber || undefined,
        manufacturer: values.manufacturer || undefined,
        commissionDate: values.commissionDate || undefined,
        warrantyExpiry: values.warrantyExpiry || undefined,
        nextInspectionDate: values.nextInspectionDate || undefined,
        lastInspectionDate: values.lastInspectionDate || undefined,
        complianceNotes: complianceNotes || undefined,
      };
      if (editingId) {
        const res = await fetch(`${API}/${editingId}`, {
          method: "PUT",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("equipmentPage.errors.updateFailed"));
        const token = getAuthToken();
        for (const field of EQUIPMENT_FILE_FIELDS) {
          const selected = pendingFiles[field.slot];
          if (!selected) continue;
          const form = new FormData();
          form.append("file", selected);
          form.append("slot", field.slot);
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          const uploadRes = await fetch(`/api/records/equipment/${editingId}/files`, {
            method: "POST",
            headers,
            body: form,
          });
          if (!uploadRes.ok) throw new Error(t("equipmentPage.errors.fileUploadFailed"));
        }
      } else {
        const res = await fetch(API, {
          method: "POST",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("equipmentPage.errors.addFailed"));
        const createdId = String(data?.id || "").trim();
        if (createdId) {
          const token = getAuthToken();
          for (const field of EQUIPMENT_FILE_FIELDS) {
            const selected = pendingFiles[field.slot];
            if (!selected) continue;
            const form = new FormData();
            form.append("file", selected);
            form.append("slot", field.slot);
            const headers: Record<string, string> = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            const uploadRes = await fetch(`/api/records/equipment/${createdId}/files`, {
              method: "POST",
              headers,
              body: form,
            });
            if (!uploadRes.ok) throw new Error(t("equipmentPage.errors.fileUploadFailed"));
          }
        }
      }
      closeForm();
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("equipmentPage.errors.requestFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) throw new Error(t("equipmentPage.errors.deleteFailed"));
      fetchList();
    } catch {
      setError(t("equipmentPage.errors.deleteFailed"));
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

  const statusClass = (s: EquipmentStatus) => {
    if (s === "active") return "status-active";
    if (s === "under_maintenance") return "status-undermaintenance";
    if (s === "replacement") return "status-replacement";
    return "status-decommissioned";
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
      Type: typeLabel(t, i.type),
      Name: i.name,
      Model: i.model || "",
      Location: i.location,
      Status: statusLabel(t, normalizeEquipmentStatus(String(i.status))),
      Capacity: i.capacity || "",
      "Serial number": i.serialNumber || "",
      Manufacturer: i.manufacturer || "",
      "Commission date": i.commissionDate || "",
      "Warranty expiry": i.warrantyExpiry || "",
      "Next inspection": i.nextInspectionDate || "",
      "Last service date": i.lastServiceDate || "",
      Notes: i.notes || "",
    }));
    downloadExcel(`equipment-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  return (
    <div className="page page-equipment">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={equipmentHeadingIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("equipmentPage.title")}</h1>
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
              {t("equipmentPage.addEquipment")}
            </button>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-muted">{t("common.loading")}</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("equipmentPage.totalEquipment")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">{t("equipmentPage.allItems")}</div>
          <i className="bi bi-tools stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("stockPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("stockPage.basedOnFilters")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("dashboard.statusActive")}</div>
          <div className="stock-stat-value">{stats.active}</div>
          <div className="stock-stat-sub">{t("equipmentPage.inOperation")}</div>
          <i className="bi bi-check2-circle stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("equipmentPage.maintenance")}</div>
          <div className="stock-stat-value">{stats.maintenance}</div>
          <div className="stock-stat-sub">{t("dashboard.statusUnderMaintenance")}</div>
          <i className="bi bi-wrench-adjustable stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-replacement">
          <div className="stock-stat-title">{t("dashboard.statusReplacement")}</div>
          <div className="stock-stat-value">{stats.replacement}</div>
          <div className="stock-stat-sub">{t("equipmentPage.pendingSwap")}</div>
          <i className="bi bi-arrow-left-right stock-stat-icon" />
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
              placeholder={t("equipmentPage.searchPlaceholder")}
            />
            {query.trim() ? (
              <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label={t("activities.clearSearch")}>
                <i className="bi bi-x-lg" />
              </button>
            ) : null}
          </div>

          <div className="stock-filters">
            <label className="stock-filter">
              <span>{t("alertsPage.type")}</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">{t("equipmentPage.allEquipment")}</option>
                {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {typeLabel(t, opt.value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="stock-filter">
              <span>{t("projectsPage.status")}</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">{t("alertsPage.all")}</option>
                <option value="active">{t("equipmentPage.status.active")}</option>
                <option value="under_maintenance">{t("equipmentPage.status.underMaintenance")}</option>
                <option value="decommissioned">{t("equipmentPage.status.decommissioned")}</option>
                <option value="replacement">{t("equipmentPage.status.replacement")}</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {formOpen && canEdit && (
        <div className="card border-0 shadow-lg sold-form-shell equipment-form-shell mb-4">
          <div className="sold-form-shell-header px-3 py-3 px-md-4">
            <h2 className="sold-form-shell-title mb-0">
              <i className="bi bi-tools me-2" aria-hidden />
              {editingId ? t("equipmentPage.editEquipment") : t("equipmentPage.addEquipment")}
            </h2>
            <p className="sold-form-shell-sub mb-0 small">{t("equipmentPage.addFormHint")}</p>
          </div>
          <div className="card-body pt-0 px-3 px-md-4 pb-4">
            <form onSubmit={handleSubmit} className="form sold-form-inner">
              <div className="form-grid sold-form-grid-vibrant">
                <label>
                  <span>{t("equipmentPage.equipmentType")}</span>
                  <SoldFormCustomSelect
                    value={equipmentType}
                    options={equipmentTypeSelectOptions}
                    onChange={(v) => {
                      setEquipmentType(v as EquipmentType);
                      if (formErrors.equipmentType) setFormErrors((p) => ({ ...p, equipmentType: undefined }));
                    }}
                  />
                  {formErrors.equipmentType ? <small className="text-danger d-block mt-1">{formErrors.equipmentType}</small> : null}
                </label>
                <label>
                  <span>{t("clientsPage.name")}</span>
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
                  <span>{t("equipmentPage.model")}</span>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      if (formErrors.model) setFormErrors((p) => ({ ...p, model: undefined }));
                    }}
                    required
                  />
                  {formErrors.model ? <small className="text-danger d-block mt-1">{formErrors.model}</small> : null}
                </label>
                <label>
                  <span>{t("stockPage.location")}</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      if (formErrors.location) setFormErrors((p) => ({ ...p, location: undefined }));
                    }}
                    required
                  />
                  {formErrors.location ? <small className="text-danger d-block mt-1">{formErrors.location}</small> : null}
                </label>
                <label>
                  <span>{t("projectsPage.status")}</span>
                  <SoldFormCustomSelect
                    value={status}
                    options={statusSelectOptions}
                    onChange={(v) => {
                      setStatus(v as EquipmentStatus);
                      if (formErrors.status) setFormErrors((p) => ({ ...p, status: undefined }));
                    }}
                  />
                  {formErrors.status ? <small className="text-danger d-block mt-1">{formErrors.status}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.capacity")}</span>
                  <input
                    type="text"
                    value={capacity}
                    onChange={(e) => {
                      setCapacity(e.target.value);
                      if (formErrors.capacity) setFormErrors((p) => ({ ...p, capacity: undefined }));
                    }}
                    placeholder={t("equipmentPage.egCapacity")}
                    required
                  />
                  {formErrors.capacity ? <small className="text-danger d-block mt-1">{formErrors.capacity}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.serialNumber")}</span>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => {
                      setSerialNumber(e.target.value);
                      if (formErrors.serialNumber) setFormErrors((p) => ({ ...p, serialNumber: undefined }));
                    }}
                    required
                  />
                  {formErrors.serialNumber ? <small className="text-danger d-block mt-1">{formErrors.serialNumber}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.manufacturer")}</span>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => {
                      setManufacturer(e.target.value);
                      if (formErrors.manufacturer) setFormErrors((p) => ({ ...p, manufacturer: undefined }));
                    }}
                    required
                  />
                  {formErrors.manufacturer ? <small className="text-danger d-block mt-1">{formErrors.manufacturer}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.commissionDate")}</span>
                  <input
                    type="date"
                    value={commissionDate}
                    onChange={(e) => {
                      setCommissionDate(e.target.value);
                      if (formErrors.commissionDate) setFormErrors((p) => ({ ...p, commissionDate: undefined }));
                    }}
                    required
                  />
                  {formErrors.commissionDate ? <small className="text-danger d-block mt-1">{formErrors.commissionDate}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.warrantyExpiry")}</span>
                  <input
                    type="date"
                    value={warrantyExpiry}
                    onChange={(e) => {
                      setWarrantyExpiry(e.target.value);
                      if (formErrors.warrantyExpiry) setFormErrors((p) => ({ ...p, warrantyExpiry: undefined }));
                    }}
                  />
                  {formErrors.warrantyExpiry ? <small className="text-danger d-block mt-1">{formErrors.warrantyExpiry}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.nextInspection")}</span>
                  <input
                    type="date"
                    value={nextInspectionDate}
                    onChange={(e) => {
                      setNextInspectionDate(e.target.value);
                      if (formErrors.nextInspectionDate) setFormErrors((p) => ({ ...p, nextInspectionDate: undefined }));
                    }}
                  />
                  {formErrors.nextInspectionDate ? <small className="text-danger d-block mt-1">{formErrors.nextInspectionDate}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.lastInspection")}</span>
                  <input
                    type="date"
                    value={lastInspectionDate}
                    onChange={(e) => {
                      setLastInspectionDate(e.target.value);
                      if (formErrors.lastInspectionDate) setFormErrors((p) => ({ ...p, lastInspectionDate: undefined }));
                    }}
                  />
                  {formErrors.lastInspectionDate ? <small className="text-danger d-block mt-1">{formErrors.lastInspectionDate}</small> : null}
                </label>
                <label>
                  <span>{t("equipmentPage.lastServiceDate")}</span>
                  <input
                    type="date"
                    value={lastServiceDate}
                    onChange={(e) => {
                      setLastServiceDate(e.target.value);
                      if (formErrors.lastServiceDate) setFormErrors((p) => ({ ...p, lastServiceDate: undefined }));
                    }}
                  />
                  {formErrors.lastServiceDate ? <small className="text-danger d-block mt-1">{formErrors.lastServiceDate}</small> : null}
                </label>
                <label className="full-width">
                  <span>{t("equipmentPage.complianceNotes")}</span>
                  <textarea rows={2} value={complianceNotes} onChange={(e) => setComplianceNotes(e.target.value)} />
                </label>
                <label className="full-width">
                  <span>{t("equipmentPage.notes")}</span>
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <div className="full-width">
                  <div className="equipment-form-files-title mb-2">{t("equipmentPage.uploadedFiles")}</div>
                  <div className="form-grid sold-form-grid-vibrant">
                    {EQUIPMENT_FILE_FIELDS.map((field) => (
                      <label key={field.slot}>
                        <span>{t(field.labelKey)}</span>
                        <input
                          type="file"
                          onChange={(e) => {
                            const selected = e.target.files?.[0] || null;
                            setPendingFiles((prev) => ({ ...prev, [field.slot]: selected }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                {editingId && recordFiles.length > 0 ? (
                  <div className="full-width equipment-form-files-list equipment-form-files-list--themed">
                    <div className="equipment-form-files-title">{t("equipmentPage.uploadedFiles")}</div>
                    <ul className="mb-0">
                      {recordFiles.map((f) => (
                        <li key={f.id}>
                          <span className="me-2 fw-semibold">{equipmentFileFieldLabel(f.slot)}:</span>
                          <a href={f.url} target="_blank" rel="noreferrer">
                            {f.originalName}
                          </a>
                          {f.uploadedAt ? <span className="equipment-form-files-date">{String(f.uploadedAt).slice(0, 10)}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("type")}>
                    {t("alertsPage.type")} {sortIcon("type")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("name")}>
                    {t("clientsPage.name")} {sortIcon("name")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("model")}>
                    {t("equipmentPage.model")} {sortIcon("model")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("location")}>
                    {t("stockPage.location")} {sortIcon("location")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("status")}>
                    {t("projectsPage.status")} {sortIcon("status")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("warrantyExpiry")}>
                    {t("equipmentPage.tableColumnWarranty")} {sortIcon("warrantyExpiry")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("nextInspectionDate")}>
                    {t("equipmentPage.tableColumnInspection")} {sortIcon("nextInspectionDate")}
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
                  <td colSpan={8}>
                    <div className="stock-empty">
                      <div className="stock-empty-icon">
                        <i className="bi bi-tools" />
                      </div>
                      <div className="stock-empty-title">{t("equipmentPage.noEquipmentFound")}</div>
                      <div className="stock-empty-sub">
                        {list.length === 0 ? t("equipmentPage.addFirstEquipment") : t("stockPage.tryAdjusting")}
                      </div>
                      <div className="stock-empty-actions">
                        {query.trim() ||
                        statusFilter !== "all" ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setQuery("");
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
                      <span className="equip-type-badge">{typeLabel(t, item.type)}</span>
                    </td>
                    <td>
                      <div className="stock-cell-main">{item.name}</div>
                    </td>
                    <td>{item.model || "—"}</td>
                    <td>{item.location}</td>
                    <td>
                      <span className={`status-pill ${statusClass(normalizeEquipmentStatus(item.status))}`}>
                        {statusLabel(t, normalizeEquipmentStatus(item.status))}
                      </span>
                    </td>
                    <td>
                      {item.warrantyExpiry ? (
                        <span className={`equip-date-tag ${dateTagClass(item.warrantyExpiry)}`}>{item.warrantyExpiry}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {item.nextInspectionDate ? (
                        <span className={`equip-date-tag ${dateTagClass(item.nextInspectionDate)}`}>{item.nextInspectionDate}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <Link to={`/equipment/${item.id}`} className="btn-sm stock-action-btn stock-view-btn">
                          {t("equipmentPage.view")}
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
            <p>{t("equipmentPage.deletePrompt")}</p>
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
