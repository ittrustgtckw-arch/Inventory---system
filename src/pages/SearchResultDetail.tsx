import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SearchResultFullDetailBody } from "../components/SearchResultFullDetailBody";
import type { SearchEntity, SearchResultRow } from "../utils/searchResultHelpers";
import { getAuthToken } from "../utils/authToken";

const VALID_ENTITIES = new Set<SearchEntity>(["client", "equipment", "stock", "sold", "project"]);

function isSearchEntity(v: string | undefined): v is SearchEntity {
  return v != null && VALID_ENTITIES.has(v as SearchEntity);
}

type SearchNavState = { searchRow?: SearchResultRow };

function seededRowForUrl(state: unknown, entity: string | undefined, id: string): SearchResultRow | null {
  if (!isSearchEntity(entity) || !id) return null;
  const row = (state as SearchNavState | null | undefined)?.searchRow;
  if (!row || row.entity !== entity || String(row.id) !== String(id)) return null;
  return row;
}

function searchDetailStorageKey(entity: string, id: string) {
  return `searchDetailSnapshot:${entity}:${id}`;
}

function isLikelySearchRow(o: unknown, entity: string, id: string): o is SearchResultRow {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    r.entity === entity &&
    String(r.id) === String(id) &&
    typeof r.headline === "string" &&
    r.details != null &&
    typeof r.details === "object" &&
    Array.isArray(r.folders)
  );
}

function snapshotFromSession(entity: string | undefined, id: string): SearchResultRow | null {
  if (!isSearchEntity(entity) || !id) return null;
  try {
    const raw = sessionStorage.getItem(searchDetailStorageKey(entity, id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLikelySearchRow(parsed, entity, id) ? parsed : null;
  } catch {
    return null;
  }
}

export const SearchResultDetail: React.FC = () => {
  const { entity: entityParam, id: idParam } = useParams<{ entity: string; id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const q = searchParams.get("q") || "";
  const from = searchParams.get("from") || "";
  const { t } = useTranslation();

  const entity = entityParam as string | undefined;
  const id = idParam ? decodeURIComponent(idParam) : "";

  const [row, setRow] = useState<SearchResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshNote, setRefreshNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const dashboardBackHref =
    from === "clients"
      ? "/clients"
      : from === "projects"
        ? "/projects"
        : q.trim()
          ? `/dashboard?q=${encodeURIComponent(q.trim())}`
          : "/dashboard";

  const backLinkLabel =
    from === "clients"
      ? t("dashboard.searchDetailPage.backToClients")
      : from === "projects"
        ? t("dashboard.searchDetailPage.backToProjects")
        : q.trim()
          ? t("dashboard.searchDetailPage.backToSearch")
          : t("dashboard.searchDetailPage.backToDashboard");

  const loadRecord = useCallback(() => {
    if (!isSearchEntity(entity) || !id) {
      setRow(null);
      setLoading(false);
      setError(t("dashboard.searchDetailPage.notFound"));
      setRefreshNote("");
      return;
    }

    const seeded =
      seededRowForUrl(location.state, entity, id) ?? snapshotFromSession(entity, id);

    setRefreshNote("");
    if (seeded) {
      setRow(seeded);
      setError("");
      setLoading(false);
      try {
        sessionStorage.setItem(searchDetailStorageKey(entity, id), JSON.stringify(seeded));
      } catch {
        /* ignore quota / private mode */
      }
    } else {
      setLoading(true);
      setRow(null);
      setError("");
    }

    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const qs = new URLSearchParams();
    qs.set("entity", entity);
    qs.set("id", id);
    fetch(`/api/search/record?${qs.toString()}`, { headers })
      .then(async (r) => {
        const ct = String(r.headers.get("content-type") || "");
        const rawText = await r.text();
        let data: { success?: boolean; result?: SearchResultRow; message?: string } = {};
        if (ct.includes("application/json")) {
          try {
            data = JSON.parse(rawText) as typeof data;
          } catch {
            data = {};
          }
        }
        if (r.status === 0 || r.status >= 502) {
          throw new Error(t("dashboard.searchDetailPage.apiUnreachable"));
        }
        if (r.ok && !ct.includes("application/json")) {
          throw new Error(t("dashboard.searchDetailPage.apiNotJson"));
        }
        if (!r.ok) {
          if (r.status === 404) {
            try {
              sessionStorage.removeItem(searchDetailStorageKey(entity, id));
            } catch {
              /* ignore */
            }
            setRow(null);
            setError(
              (data && typeof data.message === "string" && data.message.trim()) ||
                t("dashboard.searchDetailPage.notFound")
            );
            setRefreshNote("");
            return;
          }
          throw new Error(
            (data && typeof data.message === "string" && data.message.trim()) || t("dashboard.searchDetailPage.loadError")
          );
        }
        if (!data?.success || data.result == null) {
          throw new Error(
            (typeof data.message === "string" && data.message.trim()) || t("dashboard.searchDetailPage.loadError")
          );
        }
        setRow(data.result);
        setRefreshNote("");
        setError("");
        try {
          sessionStorage.setItem(searchDetailStorageKey(entity, id), JSON.stringify(data.result));
        } catch {
          /* ignore */
        }
      })
      .catch((e) => {
        const isNetwork =
          e instanceof TypeError ||
          (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message));

        if (seeded) {
          setRow(seeded);
          setError("");
          setRefreshNote(t("dashboard.searchDetailPage.showingSearchSnapshot"));
          return;
        }

        setRow(null);
        setError(
          isNetwork
            ? t("dashboard.searchDetailPage.apiUnreachable")
            : e instanceof Error
              ? e.message
              : t("dashboard.searchDetailPage.loadError")
        );
      })
      .finally(() => setLoading(false));
  }, [entity, id, t, location.state]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  if (!isSearchEntity(entity)) {
    return (
      <div className="page search-detail-page">
        <div className="search-detail-error card">{t("dashboard.searchDetailPage.notFound")}</div>
        <Link to="/dashboard" className="search-detail-back-link">
          <i className="bi bi-arrow-left" aria-hidden />
          {t("dashboard.searchDetailPage.backToDashboard")}
        </Link>
      </div>
    );
  }

  const showSpinner = loading && !row;
  const showError = !row && error;

  return (
    <div className={`page search-detail-page search-detail-page-${entity}`}>
      <nav className="search-detail-breadcrumb mb-3" aria-label="Breadcrumb">
        <Link
          to={dashboardBackHref}
          className="search-detail-back-link btn btn-light border shadow-sm rounded-pill px-3 py-2 fw-semibold"
        >
          <i className="bi bi-arrow-left-short me-1" aria-hidden />
          {backLinkLabel}
        </Link>
      </nav>

      {showSpinner ? (
        <div className="search-detail-status card">{t("dashboard.searchSearching")}</div>
      ) : showError ? (
        <div className="search-detail-error card">{error}</div>
      ) : row ? (
        <>
          {refreshNote ? (
            <div className="alert alert-warning search-detail-snapshot-banner mb-3" role="status">
              {refreshNote}
            </div>
          ) : null}
          <SearchResultFullDetailBody
            row={row}
            uploading={uploading}
            uploadError={uploadError}
            onUploadingChange={setUploading}
            onUploadError={setUploadError}
            onUploadComplete={loadRecord}
          />
        </>
      ) : (
        <div className="search-detail-error card">{t("dashboard.searchDetailPage.notFound")}</div>
      )}
    </div>
  );
};
