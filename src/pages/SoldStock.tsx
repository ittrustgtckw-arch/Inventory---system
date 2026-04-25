import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import soldStockIcon from "../../sold dash.png";
import { useCanEdit } from "../auth";
import {
  BUSINESS_DEPARTMENTS,
  getBusinessDepartmentLabel,
  type BusinessDepartment,
  normalizeBusinessDepartment,
} from "../departments";
import { SoldFormCustomSelect } from "../components/SoldFormCustomSelect";
import { authHeadersJson } from "../utils/authHeaders";
import { getAuthToken } from "../utils/authToken";
import { downloadExcel } from "../utils/excel";
import { formatSoldWarrantyYearsMonths } from "../utils/soldWarrantyFormat";

interface SoldItem {
  id: string;
  serialNo: string;
  soldEquipmentDetails: string;
  sellingValue: string;
  clientInfo: string;
  sellsDate: string;
  warranty: string;
  locationDescription: string;
  department?: string;
  otherNotes?: string;
  hasInvoiceDoc?: boolean;
  hasPurchaseOrderDoc?: boolean;
  hasOtherDoc?: boolean;
}

interface Client {
  id: string;
  name: string;
}

interface EquipmentOption {
  id: string;
  name: string;
  model: string;
  type: string;
  serialNumber: string;
}

const API = "/api/sold-stock";

type SortKey =
  | "serialNo"
  | "soldEquipmentDetails"
  | "sellingValue"
  | "clientInfo"
  | "sellsDate"
  | "warranty"
  | "locationDescription"
  | "department";
type SortDir = "asc" | "desc";
type WarrantyFilter = "all" | "with" | "without";

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function soldDateClass(dateValue?: string) {
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

export const SoldStock: React.FC = () => {
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

  const [list, setList] = useState<SoldItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serialNo, setSerialNo] = useState("");
  const [soldEquipmentDetails, setSoldEquipmentDetails] = useState("");
  const [sellingValue, setSellingValue] = useState("");
  const [clientInfo, setClientInfo] = useState("");
  const [sellsDate, setSellsDate] = useState("");
  const [warranty, setWarranty] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [otherNotes, setOtherNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [purchaseOrderFile, setPurchaseOrderFile] = useState<File | null>(null);
  const [otherDocFile, setOtherDocFile] = useState<File | null>(null);
  const [slotFiles, setSlotFiles] = useState<Record<string, { id: string; url: string; originalName: string }>>({});
  const [department, setDepartment] = useState<BusinessDepartment>("trading");
  const [query, setQuery] = useState("");
  const [warrantyFilter, setWarrantyFilter] = useState<WarrantyFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sellsDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const url = deptFilter ? `${API}?department=${encodeURIComponent(deptFilter)}` : API;
      const res = await fetch(url);
      if (!res.ok) throw new Error(t("soldPage.errors.unableToLoad"));
      const data = await res.json();
      setList(data);
    } catch (e) {
      setError(t("soldPage.errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [deptFilter]);

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([clientsData, equipmentData]) => {
        setClients(Array.isArray(clientsData) ? clientsData : []);
        setEquipment(
          Array.isArray(equipmentData)
            ? (equipmentData as any[])
                .map((e) => ({
                  id: String(e?.id || ""),
                  name: String(e?.name || ""),
                  model: String(e?.model || ""),
                  type: String(e?.type || ""),
                  serialNumber: String(e?.serialNumber || ""),
                }))
                .filter((e) => e.id && (e.serialNumber || e.name))
            : []
        );
      })
      .catch(() => {
        setClients([]);
        setEquipment([]);
      });
  }, []);

  const normKey = (s: string) => String(s || "").trim().toLowerCase();
  const equipmentDetailsLabel = (e: EquipmentOption) => {
    const name = String(e?.name || "").trim();
    const model = String(e?.model || "").trim();
    if (!name && !model) return "";
    if (name && model) return `${name} - ${model}`;
    return name || model;
  };

  const serialSelectOptions = useMemo(() => {
    const values = [
      ...equipment.map((e) => String(e.serialNumber || "").trim()).filter(Boolean),
      ...list.map((i) => String(i.serialNo || "").trim()).filter(Boolean),
    ];
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [equipment, list]);

  const detailsSelectOptions = useMemo(() => {
    const fromEquipment = equipment.map((e) => equipmentDetailsLabel(e)).filter(Boolean);
    const fromSold = list.map((i) => String(i.soldEquipmentDetails || "").trim()).filter(Boolean);
    const values = [...fromEquipment, ...fromSold];
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [equipment, list]);

  const equipmentBySerial = useMemo(() => {
    const m = new Map<string, EquipmentOption>();
    equipment.forEach((e) => {
      const k = normKey(e.serialNumber);
      if (!k) return;
      if (!m.has(k)) m.set(k, e);
    });
    return m;
  }, [equipment]);

  const equipmentByDetails = useMemo(() => {
    const m = new Map<string, EquipmentOption>();
    equipment.forEach((e) => {
      const label = equipmentDetailsLabel(e);
      const k = normKey(label);
      if (!k) return;
      if (!m.has(k)) m.set(k, e);
    });
    return m;
  }, [equipment]);

  const filteredSorted = useMemo(() => {
    const q = safeLower(query).trim();
    const filtered = list.filter((item) => {
      const hasWarranty = Boolean(String(item.warranty || "").trim());
      const warrantyOk =
        warrantyFilter === "all" ? true : warrantyFilter === "with" ? hasWarranty : !hasWarranty;
      if (!warrantyOk) return false;

      if (!q) return true;
      const hay = [
        item.serialNo,
        item.clientInfo,
        item.sellsDate,
        item.warranty,
        item.locationDescription,
        item.otherNotes,
        getBusinessDepartmentLabel(normalizeBusinessDepartment(item.department), uiLang),
      ].map(safeLower);
      const extra = [item.soldEquipmentDetails, item.sellingValue].map(safeLower);
      return [...hay, ...extra].some((h) => h.includes(q));
    });

    const dirMult = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "sellsDate") {
        return String(a.sellsDate || "").localeCompare(String(b.sellsDate || "")) * dirMult;
      }
      if (sortKey === "sellingValue") {
        const av = Number(a.sellingValue || 0);
        const bv = Number(b.sellingValue || 0);
        return (av - bv) * dirMult;
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
  }, [list, query, sortDir, sortKey, warrantyFilter]);

  const stats = useMemo(() => {
    const total = list.length;
    const shown = filteredSorted.length;
    const clientCount = new Set(list.map((i) => String(i.clientInfo || "").trim()).filter(Boolean)).size;
    const latest = list
      .map((i) => String(i.sellsDate || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0];
    return { total, shown, clientCount, latest: latest || "—" };
  }, [filteredSorted.length, list]);

  const clientOptions = useMemo(() => {
    const fromClients = clients.map((c) => String(c.name || "").trim()).filter(Boolean);
    const fromSoldRecords = list.map((i) => String(i.clientInfo || "").trim()).filter(Boolean);
    return Array.from(new Set([...fromClients, ...fromSoldRecords])).sort((a, b) => a.localeCompare(b));
  }, [clients, list]);

  const clientSelectOptions = useMemo(() => {
    const cur = String(clientInfo || "").trim();
    const set = new Set(clientOptions);
    if (cur) set.add(cur);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clientOptions, clientInfo]);

  const selectedClientHistory = useMemo(() => {
    const selected = String(clientInfo || "").trim().toLowerCase();
    if (!selected) return [];
    return list
      .filter(
        (item) => String(item.clientInfo || "").trim().toLowerCase() === selected && (editingId ? item.id !== editingId : true)
      )
      .sort((a, b) => String(b.sellsDate || "").localeCompare(String(a.sellsDate || "")));
  }, [clientInfo, editingId, list]);

  const resetDocumentPickers = () => {
    setInvoiceFile(null);
    setPurchaseOrderFile(null);
    setOtherDocFile(null);
    setSlotFiles({});
  };

  const openNew = () => {
    if (!canEdit) return;
    setEditingId(null);
    setSerialNo("");
    setSoldEquipmentDetails("");
    setSellingValue("");
    setClientInfo("");
    setSellsDate("");
    setWarranty("");
    setLocationDescription("");
    setOtherNotes("");
    resetDocumentPickers();
    setDepartment(deptFilter ?? "trading");
    setFormOpen(true);
    setError("");
  };

  const openEdit = (item: SoldItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setSerialNo(item.serialNo);
    setSoldEquipmentDetails(item.soldEquipmentDetails || "");
    setSellingValue(item.sellingValue || "");
    setClientInfo(item.clientInfo);
    setSellsDate(item.sellsDate);
    setWarranty(item.warranty);
    setLocationDescription(item.locationDescription);
    setOtherNotes(item.otherNotes || "");
    setInvoiceFile(null);
    setPurchaseOrderFile(null);
    setOtherDocFile(null);
    setSlotFiles({});
    setDepartment(normalizeBusinessDepartment(item.department));
    setFormOpen(true);
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    resetDocumentPickers();
    setOtherNotes("");
  };

  useEffect(() => {
    if (!formOpen || !editingId) return;
    let cancelled = false;
    fetch(`/api/records/sold/${encodeURIComponent(editingId)}/files`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { id?: string; url?: string; originalName?: string; slot?: string }[]) => {
        if (cancelled) return;
        const m: Record<string, { id: string; url: string; originalName: string }> = {};
        (Array.isArray(arr) ? arr : []).forEach((f) => {
          const sl = String(f.slot || "").trim();
          if (sl === "invoice" || sl === "purchase_order" || sl === "other") {
            m[sl] = { id: String(f.id || ""), url: String(f.url || ""), originalName: String(f.originalName || "") };
          }
        });
        setSlotFiles(m);
      })
      .catch(() => {
        if (!cancelled) setSlotFiles({});
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, editingId]);

  const uploadSoldSlot = async (recordId: string, file: File, slot: "invoice" | "purchase_order" | "other") => {
    const form = new FormData();
    form.append("file", file);
    form.append("slot", slot);
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/records/sold/${encodeURIComponent(recordId)}/files`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(String(data?.message || t("soldPage.errors.docUploadFailed")));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setError("");
    try {
      const body = {
        serialNo,
        soldEquipmentDetails,
        sellingValue,
        clientInfo,
        sellsDate,
        warranty,
        locationDescription,
        department,
        otherNotes,
      };
      let recordId = editingId || "";
      if (editingId) {
        const res = await fetch(`${API}/${editingId}`, {
          method: "PUT",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Update failed");
        recordId = editingId;
      } else {
        const res = await fetch(API, {
          method: "POST",
          headers: authHeadersJson(),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Add failed");
        recordId = String(data?.id || "").trim();
      }
      if (recordId) {
        try {
          if (invoiceFile) await uploadSoldSlot(recordId, invoiceFile, "invoice");
          if (purchaseOrderFile) await uploadSoldSlot(recordId, purchaseOrderFile, "purchase_order");
          if (otherDocFile) await uploadSoldSlot(recordId, otherDocFile, "other");
        } catch (docErr) {
          setError(docErr instanceof Error ? docErr.message : t("soldPage.errors.docUploadFailed"));
          await fetchList();
          return;
        }
      }
      closeForm();
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeadersJson() });
      if (!res.ok) throw new Error(t("soldPage.errors.deleteFailed"));
      fetchList();
    } catch {
      setError("Delete failed");
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
      "Serial no": i.serialNo,
      "Sold equipment details": i.soldEquipmentDetails || "",
      "Selling value": i.sellingValue || "",
      "Client information": i.clientInfo,
      [t("soldPage.sellsDate")]: i.sellsDate,
      [t("soldPage.warranty")]: formatSoldWarrantyYearsMonths(i.warranty, t) || i.warranty,
      "Location description": i.locationDescription,
      "Other notes": i.otherNotes || "",
      Invoice: i.hasInvoiceDoc ? "Yes" : "",
      "Purchase order": i.hasPurchaseOrderDoc ? "Yes" : "",
      "Other document": i.hasOtherDoc ? "Yes" : "",
    }));
    const deptTag = deptFilter ? `-${deptFilter}` : "";
    downloadExcel(`sold-stock${deptTag}-${new Date().toISOString().slice(0, 10)}`, rows);
  };

  return (
    <div className="page page-sold">
      <div className="page-header">
        <div>
          <div className="stock-heading">
            <img src={soldStockIcon} alt="" className="stock-heading-icon" aria-hidden="true" />
            <h1>{t("soldPage.title")}</h1>
          </div>
        </div>
        <div className="stock-header-actions">
          <button
            type="button"
            className="ghost-button stock-export-btn"
            onClick={handleExportExcel}
            disabled={filteredSorted.length === 0}
            title="Download current view as Excel (.xlsx)"
          >
            <i className="bi bi-file-earmark-spreadsheet me-1" />
            {t("stockPage.exportExcel")}
          </button>
          {canEdit ? (
            <button type="button" className="primary-button" onClick={openNew}>
              <i className="bi bi-plus-lg me-1" />
              {t("soldPage.addRecord")}
            </button>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-muted">{t("common.loading")}</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stock-stats">
        <div className="stock-stat-card stat-total">
          <div className="stock-stat-title">{t("soldPage.totalRecords")}</div>
          <div className="stock-stat-value">{stats.total}</div>
          <div className="stock-stat-sub">
            {deptFilter ? `${getBusinessDepartmentLabel(deptFilter, uiLang)} only` : t("stockPage.allDepartments")}
          </div>
          <i className="bi bi-receipt stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-shown">
          <div className="stock-stat-title">{t("stockPage.showing")}</div>
          <div className="stock-stat-value">{stats.shown}</div>
          <div className="stock-stat-sub">{t("stockPage.basedOnFilters")}</div>
          <i className="bi bi-funnel stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-locations">
          <div className="stock-stat-title">{t("soldPage.clients")}</div>
          <div className="stock-stat-value">{stats.clientCount}</div>
          <div className="stock-stat-sub">{t("soldPage.uniqueCustomers")}</div>
          <i className="bi bi-people stock-stat-icon" />
        </div>
        <div className="stock-stat-card stat-latest">
          <div className="stock-stat-title">{t("soldPage.latestSale")}</div>
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
            placeholder={t("soldPage.searchPlaceholder")}
          />
          {query.trim() ? (
            <button type="button" className="stock-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
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
              aria-label="Filter sold stock by business department"
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
            <span>{t("soldPage.warranty")}</span>
            <select value={warrantyFilter} onChange={(e) => setWarrantyFilter(e.target.value as WarrantyFilter)}>
              <option value="all">{t("alertsPage.all")}</option>
              <option value="with">{t("soldPage.withWarranty")}</option>
              <option value="without">{t("soldPage.withoutWarranty")}</option>
            </select>
          </label>
        </div>
      </div>

      {formOpen && canEdit && (
        <div className="card border-0 shadow-lg sold-form-shell">
          <div className="sold-form-shell-header px-3 py-3 px-md-4">
            <h2 className="sold-form-shell-title mb-0">
              <i className="bi bi-receipt-cutoff me-2" aria-hidden />
              {editingId ? t("stockPage.edit") : t("soldPage.addRecord")}
            </h2>
            <p className="sold-form-shell-sub mb-0 small">{t("soldPage.docUploadHint")}</p>
          </div>
          <div className="card-body pt-0 px-3 px-md-4 pb-4">
          <form onSubmit={handleSubmit} className="form sold-form-inner">
            <div className="form-grid sold-form-grid-vibrant">
              <label>
                <span>{t("soldPage.serialNo")}</span>
                <SoldFormCustomSelect
                  required
                  placeholder={t("soldPage.selectSerial")}
                  value={serialNo}
                  options={serialSelectOptions.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => {
                    setSerialNo(v);
                    const match = equipmentBySerial.get(normKey(v));
                    if (match) setSoldEquipmentDetails(equipmentDetailsLabel(match));
                  }}
                />
              </label>
              <label>
                <span>{t("soldPage.sellsDate")}</span>
                <input
                  type="date"
                  value={sellsDate}
                  onChange={(e) => setSellsDate(e.target.value)}
                  required
                />
              </label>
              <label className="full-width">
                <span>{t("soldPage.soldEquipmentDetails")}</span>
                <SoldFormCustomSelect
                  required
                  placeholder={t("soldPage.selectEquipmentDetails")}
                  value={soldEquipmentDetails}
                  options={detailsSelectOptions.map((d) => ({ value: d, label: d }))}
                  onChange={(v) => {
                    setSoldEquipmentDetails(v);
                    const match = equipmentByDetails.get(normKey(v));
                    if (match?.serialNumber) setSerialNo(match.serialNumber);
                  }}
                />
              </label>
              <label>
                <span>{t("soldPage.sellingValue")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellingValue}
                  onChange={(e) => setSellingValue(e.target.value)}
                  placeholder={t("soldPage.eg2500")}
                  required
                />
              </label>
              <label className="full-width">
                <span>{t("soldPage.clientInformation")}</span>
                <SoldFormCustomSelect
                  required
                  placeholder={t("soldPage.selectClient")}
                  value={clientInfo}
                  options={clientSelectOptions.map((c) => ({ value: c, label: c }))}
                  onChange={setClientInfo}
                />
              </label>
              <label>
                <span>{t("soldPage.warranty")}</span>
                <input
                  type="text"
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                  placeholder={t("soldPage.eg1year")}
                />
              </label>
              <label className="full-width">
                <span>{t("soldPage.locationDescription")}</span>
                <input
                  type="text"
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
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

            <div className="sold-form-documents card border-0 mt-3">
              <div className="card-header sold-form-documents-head py-3">
                <i className="bi bi-folder2-open me-2" aria-hidden />
                {t("soldPage.documentsSection")}
              </div>
              <div className="card-body pt-3">
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label sold-form-doc-label mb-2">
                      <i className="bi bi-file-earmark-text text-primary me-1" aria-hidden />
                      {t("soldPage.invoiceFile")}
                    </label>
                    {slotFiles.invoice ? (
                      <div className="small mb-2 sold-form-current-file">
                        <span className="text-muted me-1">{t("soldPage.currentFile")}:</span>
                        <a href={slotFiles.invoice.url} target="_blank" rel="noreferrer" className="fw-semibold">
                          {slotFiles.invoice.originalName}
                        </a>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      className="form-control form-control-sm sold-form-file-input"
                      onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    />
                    {invoiceFile ? <div className="small text-success mt-1 fw-semibold">{invoiceFile.name}</div> : null}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label sold-form-doc-label mb-2">
                      <i className="bi bi-cart-check text-info me-1" aria-hidden />
                      {t("soldPage.purchaseOrderFile")}
                    </label>
                    {slotFiles.purchase_order ? (
                      <div className="small mb-2 sold-form-current-file">
                        <span className="text-muted me-1">{t("soldPage.currentFile")}:</span>
                        <a href={slotFiles.purchase_order.url} target="_blank" rel="noreferrer" className="fw-semibold">
                          {slotFiles.purchase_order.originalName}
                        </a>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      className="form-control form-control-sm sold-form-file-input"
                      onChange={(e) => setPurchaseOrderFile(e.target.files?.[0] || null)}
                    />
                    {purchaseOrderFile ? (
                      <div className="small text-success mt-1 fw-semibold">{purchaseOrderFile.name}</div>
                    ) : null}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label sold-form-doc-label mb-2">
                      <i className="bi bi-paperclip text-warning me-1" aria-hidden />
                      {t("soldPage.otherDocument")}
                    </label>
                    {slotFiles.other ? (
                      <div className="small mb-2 sold-form-current-file">
                        <span className="text-muted me-1">{t("soldPage.currentFile")}:</span>
                        <a href={slotFiles.other.url} target="_blank" rel="noreferrer" className="fw-semibold">
                          {slotFiles.other.originalName}
                        </a>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      className="form-control form-control-sm sold-form-file-input"
                      onChange={(e) => setOtherDocFile(e.target.files?.[0] || null)}
                    />
                    {otherDocFile ? <div className="small text-success mt-1 fw-semibold">{otherDocFile.name}</div> : null}
                  </div>
                </div>
                <label className="form-label sold-form-doc-label mt-3 mb-2">
                  <i className="bi bi-chat-left-text text-secondary me-1" aria-hidden />
                  {t("soldPage.otherNotes")}
                </label>
                <textarea
                  className="form-control sold-form-notes"
                  rows={3}
                  value={otherNotes}
                  onChange={(e) => setOtherNotes(e.target.value)}
                  placeholder={t("soldPage.otherNotes")}
                />
              </div>
            </div>

            {clientInfo.trim() ? (
              <div className="sold-client-history-box">
                <h3>{t("soldPage.orderHistoryFor", { name: clientInfo.trim() })}</h3>
                {selectedClientHistory.length === 0 ? (
                  <p className="sold-client-history-empty">{t("soldPage.noPreviousOrders")}</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table stock-table">
                      <thead>
                        <tr>
                          <th>{t("soldPage.serialNo")}</th>
                          <th>{t("soldPage.soldEquipmentDetails")}</th>
                          <th>{t("soldPage.sellingValue")}</th>
                          <th>{t("soldPage.sellsDate")}</th>
                          <th>{t("soldPage.warranty")}</th>
                          <th>{t("soldPage.locationDescription")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedClientHistory.map((item) => (
                          <tr key={`client-order-${item.id}`}>
                            <td>{item.serialNo}</td>
                            <td>{item.soldEquipmentDetails || "—"}</td>
                            <td>{item.sellingValue ? `${item.sellingValue} OMR` : "—"}</td>
                            <td>{item.sellsDate || "—"}</td>
                            <td>{formatSoldWarrantyYearsMonths(item.warranty, t) || item.warranty || "—"}</td>
                            <td>{item.locationDescription || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

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
                  <button type="button" className="stock-th" onClick={() => toggleSort("department")}>
                    {t("stockPage.department")} {sortIcon("department")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("serialNo")}>
                    {t("soldPage.serialNo")} {sortIcon("serialNo")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("soldEquipmentDetails")}>
                    {t("soldPage.soldEquipmentDetails")} {sortIcon("soldEquipmentDetails")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("sellingValue")}>
                    {t("soldPage.sellingValue")} {sortIcon("sellingValue")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("clientInfo")}>
                    {t("soldPage.clientInformation")} {sortIcon("clientInfo")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("sellsDate")}>
                    {t("soldPage.sellsDate")} {sortIcon("sellsDate")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("warranty")}>
                    {t("soldPage.warranty")} {sortIcon("warranty")}
                  </button>
                </th>
                <th>
                  <button type="button" className="stock-th" onClick={() => toggleSort("locationDescription")}>
                    {t("soldPage.locationDescription")} {sortIcon("locationDescription")}
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
                  <td colSpan={9}>
                    <div className="stock-empty">
                      <div className="stock-empty-icon">
                        <i className="bi bi-receipt" />
                      </div>
                      <div className="stock-empty-title">{t("soldPage.noRecordsFound")}</div>
                      <div className="stock-empty-sub">
                        {list.length === 0 && deptFilter
                          ? `No sold records for ${getBusinessDepartmentLabel(deptFilter, uiLang)}.`
                          : list.length === 0
                          ? t("soldPage.createFirstRecord")
                          : t("stockPage.tryAdjusting")}
                      </div>
                      <div className="stock-empty-actions">
                        {deptFilter ? (
                          <button type="button" className="ghost-button" onClick={() => setDepartmentQuery("all")}>
                            {t("soldPage.viewAllDepartments")}
                          </button>
                        ) : null}
                        {query.trim() || warrantyFilter !== "all" ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setQuery("");
                              setWarrantyFilter("all");
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
                      <div className="stock-cell-main">{item.serialNo}</div>
                    </td>
                    <td>{item.soldEquipmentDetails || "—"}</td>
                    <td>{item.sellingValue ? `${item.sellingValue} OMR` : "—"}</td>
                    <td>{item.clientInfo}</td>
                    <td>
                      <span className={`equip-date-tag ${soldDateClass(item.sellsDate)}`}>{item.sellsDate || "—"}</span>
                    </td>
                    <td>{formatSoldWarrantyYearsMonths(item.warranty, t) || item.warranty || "—"}</td>
                    <td>{item.locationDescription || "—"}</td>
                    <td className="data-table-col-actions">
                      <div className="data-table-actions-inner">
                        <Link
                          to={`/sold-stock/${encodeURIComponent(item.id)}`}
                          className="btn-sm stock-action-btn stock-view-btn"
                        >
                          {t("soldPage.view")}
                        </Link>
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              className="btn-sm stock-action-btn stock-edit-btn"
                              onClick={() => openEdit(item)}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              className="btn-sm stock-action-btn stock-delete-btn"
                              onClick={() => requestDelete(item.id)}
                            >
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
            <h3 id="delete-confirm-title">{t("soldPage.confirmDelete")}</h3>
            <p>{t("soldPage.deletePrompt")}</p>
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
