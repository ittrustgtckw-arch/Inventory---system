import type { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAuthToken } from "../utils/authToken";

type BarcodeMatch = { entity: string; id: string; label: string; path: string };

const READER_ID = "barcode-scan-reader";

export const BarcodeScan: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<BarcodeMatch[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopCamera = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (!inst) {
      setCameraOn(false);
      return;
    }
    try {
      await inst.stop();
    } catch {
      /* ignore */
    }
    try {
      inst.clear();
    } catch {
      /* ignore */
    }
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  const runLookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setLoading(true);
      setError("");
      setMatches([]);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(trimmed)}`, { headers });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          matches?: BarcodeMatch[];
        } | null;
        if (!res.ok) {
          setError(data?.message || t("scanPage.lookupFailed"));
          return;
        }
        const m = data?.matches || [];
        if (m.length === 0) {
          setError(t("scanPage.noMatches"));
          return;
        }
        if (m.length === 1) {
          await stopCamera();
          navigate(m[0].path);
          return;
        }
        await stopCamera();
        setMatches(m);
      } catch {
        setError(t("scanPage.networkError"));
      } finally {
        setLoading(false);
      }
    },
    [navigate, stopCamera, t]
  );

  const startCamera = async () => {
    setCameraError("");
    if (cameraOn) {
      await stopCamera();
      return;
    }
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!document.getElementById(READER_ID)) {
        setCameraError(t("scanPage.cameraError"));
        return;
      }
      const html5 = new Html5Qrcode(READER_ID);
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 180 } },
        (decodedText) => {
          if (decodedText) void runLookup(decodedText);
        },
        () => {}
      );
      scannerRef.current = html5;
      setCameraOn(true);
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as Error).name) : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError(t("scanPage.cameraDenied"));
      } else {
        setCameraError(t("scanPage.cameraError"));
      }
    }
  };

  const entityKindLabel = (entity: string) =>
    t(`scanPage.entities.${entity}`, { defaultValue: entity });

  return (
    <div className="page page-barcode-scan">
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <h1 className="h4 mb-2">{t("scanPage.title")}</h1>
          <p className="text-secondary small mb-4">{t("scanPage.subtitle")}</p>

          <form
            className="barcode-scan-form mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              void runLookup(code);
            }}
          >
            <label className="form-label" htmlFor="barcode-scan-input">
              {t("scanPage.codeLabel")}
            </label>
            <div className="input-group">
              <input
                id="barcode-scan-input"
                type="text"
                className="form-control"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder={t("scanPage.codePlaceholder")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !code.trim()}>
                {loading ? t("scanPage.lookingUp") : t("scanPage.lookup")}
              </button>
            </div>
            <p className="form-text mb-0">{t("scanPage.wedgeHint")}</p>
          </form>

          <div className="barcode-scan-camera-block mb-3">
            <button
              type="button"
              className={`btn btn-outline-secondary btn-sm ${cameraOn ? "active" : ""}`}
              onClick={() => void startCamera()}
              disabled={loading}
            >
              <i className="bi bi-camera-fill me-1" aria-hidden />
              {cameraOn ? t("scanPage.cameraStop") : t("scanPage.cameraStart")}
            </button>
            {cameraError ? <p className="text-danger small mt-2 mb-0">{cameraError}</p> : null}
            <div id={READER_ID} className="barcode-scan-reader mt-3 rounded overflow-hidden bg-dark" />
          </div>

          {error ? (
            <div className="alert alert-warning py-2 mb-3" role="alert">
              {error}
            </div>
          ) : null}

          {matches.length > 1 ? (
            <div className="barcode-scan-matches">
              <p className="fw-semibold mb-2">{t("scanPage.multipleMatches")}</p>
              <ul className="list-group">
                {matches.map((m) => (
                  <li key={`${m.entity}:${m.id}`} className="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
                    <div>
                      <span className="badge text-bg-secondary me-2">{entityKindLabel(m.entity)}</span>
                      <span>{m.label || m.id}</span>
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(m.path)}>
                      {t("scanPage.open")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
