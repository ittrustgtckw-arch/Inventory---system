import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap-icons/font/bootstrap-icons.css";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import "./styles.css";
import i18n from "./i18n";
import { getSelectedCompanyId } from "./company";

declare global {
  interface Window {
    __companyFetchPatched?: boolean;
  }
}

if (!window.__companyFetchPatched) {
  const nativeFetch = window.fetch.bind(window);
  const apiBase = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    let target: RequestInfo | URL = input;
    if (typeof input === "string" && input.startsWith("/api") && apiBase) {
      target = `${apiBase}${input}`;
    } else if (input instanceof URL && input.pathname.startsWith("/api") && apiBase) {
      target = `${apiBase}${input.pathname}${input.search}`;
    }
    const headers = new Headers(init?.headers ?? req?.headers ?? {});
    headers.set("X-Company-Id", getSelectedCompanyId());
    return nativeFetch(target, { ...(init || {}), headers });
  };
  window.__companyFetchPatched = true;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Keep app behavior unchanged if SW registration fails.
    });
  });
}

