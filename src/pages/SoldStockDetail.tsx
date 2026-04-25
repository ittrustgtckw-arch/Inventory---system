import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCanEdit } from "../auth";
import { authHeadersJson } from "../utils/authHeaders";
import { BUSINESS_DEPARTMENTS, getBusinessDepartmentLabel, normalizeBusinessDepartment } from "../departments";
import { formatSoldWarrantyYearsMonths } from "../utils/soldWarrantyFormat";

type SoldItem = {
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
};

type RecordFile = {
  id: string;
  url: string;
  originalName: string;
  slot?: string;
};

export const SoldStockDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const canEdit = useCanEdit();
  const uiLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";

  const [item, setItem] = useState<SoldItem | null>(null);
  const [files, setFiles] = useState<RecordFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/sold-stock/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/records/sold/${encodeURIComponent(id)}/files`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([record, docList]) => {
        setItem(record);
        setFiles(Array.isArray(docList) ? docList : []);
      })
      .catch(() => setError(t("soldPage.errors.unableToLoad")))
      .finally(() => setLoading(false));
  }, [id, t]);

  const sortedFiles = useMemo(() => {
    const rank = (slot?: string) => {
      if (slot === "invoice") return 0;
      if (slot === "purchase_order") return 1;
      if (slot === "other") return 2;
      return 3;
    };
    return [...files].sort((a, b) => rank(a.slot) - rank(b.slot));
  }, [files]);

  const fileFieldLabel = (slot?: string) => {
    if (slot === "invoice") return t("soldPage.invoiceFile");
    if (slot === "purchase_order") return t("soldPage.purchaseOrderFile");
    if (slot === "other") return t("soldPage.otherDocument");
    return t("soldPage.otherDocument");
  };

  const fileHref = (url?: string) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw.startsWith("/") ? raw : `/${raw}`;
  };

  const requestFileDelete = (fileId: string) => {
    setPendingDeleteFileId(fileId);
  };

  const cancelFileDelete = () => {
    setPendingDeleteFileId(null);
  };

  const confirmFileDelete = async () => {
    if (!id || !pendingDeleteFileId) return;
    try {
      const res = await fetch(
        `/api/records/sold/${encodeURIComponent(id)}/files/${encodeURIComponent(pendingDeleteFileId)}`,
        { method: "DELETE", headers: authHeadersJson() }
      );
      if (!res.ok) throw new Error();
      setFiles((prev) => prev.filter((f) => String(f.id) !== String(pendingDeleteFileId)));
    } catch {
      setError(t("soldPage.errors.deleteFailed"));
    } finally {
      setPendingDeleteFileId(null);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <p className="text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="page sold-detail-page">
        <Link to="/sold-stock" className="equipment-detail-back">
          {t("soldPage.backToSoldStock")}
        </Link>
        <div className="alert alert-warning mt-3">{t("dashboard.searchDetailPage.notFound")}</div>
      </div>
    );
  }

  return (
    <div className="page sold-detail-page">
      <div className="equipment-detail-hero card">
        <div className="equipment-detail-hero-main">
          <Link to="/sold-stock" className="equipment-detail-back">
            {t("soldPage.backToSoldStock")}
          </Link>
          <h1>{item.clientInfo || t("soldPage.viewDetailsTitle")}</h1>
          <div className="equipment-detail-subtitle">
            <span className="status-pill equipment-type-pill">{t("soldPage.title")}</span>
            <span className="equipment-detail-location">{item.soldEquipmentDetails || "—"}</span>
          </div>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="equipment-detail-tables">
        <div className="table-wrapper">
          <table className="data-table stock-table equipment-detail-spec-table equipment-detail-spec-table-main">
            <caption className="equipment-detail-table-caption">{t("soldPage.viewDetailsTitle")}</caption>
            <tbody>
              <tr>
                <th scope="row">{t("soldPage.serialNo")}</th>
                <td>{item.serialNo || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.soldEquipmentDetails")}</th>
                <td>{item.soldEquipmentDetails || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.sellingValue")}</th>
                <td>{item.sellingValue ? `${item.sellingValue} OMR` : "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.clientInformation")}</th>
                <td>{item.clientInfo || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.sellsDate")}</th>
                <td>{item.sellsDate || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.warranty")}</th>
                <td>{formatSoldWarrantyYearsMonths(item.warranty, t) || item.warranty || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("stockPage.department")}</th>
                <td>
                  {getBusinessDepartmentLabel(
                    normalizeBusinessDepartment(item.department || BUSINESS_DEPARTMENTS[0]),
                    uiLang
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.locationDescription")}</th>
                <td>{item.locationDescription || "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("soldPage.otherNotes")}</th>
                <td>{item.otherNotes?.trim() ? item.otherNotes : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-wrapper">
          <table className="data-table stock-table equipment-detail-spec-table equipment-detail-spec-table-warranty">
            <caption className="equipment-detail-table-caption">{t("soldPage.documentsSection")}</caption>
            <tbody>
              {sortedFiles.length === 0 ? (
                <tr>
                  <th scope="row">{t("soldPage.otherDocument")}</th>
                  <td>{t("soldPage.noDocumentsAttached")}</td>
                </tr>
              ) : (
                sortedFiles.map((f) => (
                  <tr key={f.id || `${f.url}-${f.originalName}`}>
                    <th scope="row">{fileFieldLabel(f.slot)}</th>
                    <td className="sold-detail-doc-cell">
                      <div className="sold-detail-doc-name">{f.originalName || f.url}</div>
                      <div className="sold-detail-doc-actions">
                        <a
                          href={fileHref(f.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-sm stock-action-btn stock-view-btn"
                        >
                          {t("soldPage.openDocument")}
                        </a>
                        <a
                          href={fileHref(f.url)}
                          download={f.originalName || undefined}
                          className="btn-sm stock-action-btn stock-download-btn"
                        >
                          {t("soldPage.downloadDocument")}
                        </a>
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn-sm stock-action-btn stock-delete-btn"
                            onClick={() => requestFileDelete(f.id)}
                          >
                            {t("common.delete")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {pendingDeleteFileId && canEdit ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-file-confirm-title">
          <div className="stock-delete-modal">
            <h3 id="delete-file-confirm-title">{t("soldPage.confirmDeleteDocument")}</h3>
            <p>{t("soldPage.deleteDocumentPrompt")}</p>
            <div className="stock-delete-modal-actions">
              <button type="button" className="stock-action-btn stock-cancel-btn" onClick={cancelFileDelete}>
                {t("common.cancel")}
              </button>
              <button type="button" className="stock-action-btn stock-delete-btn" onClick={confirmFileDelete}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
