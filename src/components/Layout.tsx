import { Link, NavLink, Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth, useCanEdit } from "../auth";
import { useTranslation } from "react-i18next";
import { getAuthToken } from "../utils/authToken";
import trustGeneralLogo from "../../Trustgtckw (1).png";
import trustFactoryLogo from "../../TrustFactory.png";
import { getAllCompanyMeta, getSelectedCompanyId, setSelectedCompanyId, type CompanyId } from "../company";

interface LayoutProps {
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { role, token, displayName } = useAuth();
  const canEdit = useCanEdit();
  const currentLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";

  // Prefer context token, but fall back to shared token store.
  let authToken = token;
  if (!authToken) {
    authToken = getAuthToken();
  }

  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [permissionsState, setPermissionsState] = useState<Record<string, boolean>>({
    technician: false,
    account: false,
  });
  const [newDepartment, setNewDepartment] = useState("");
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionError, setPermissionError] = useState<string>("");
  const [permissionSuccess, setPermissionSuccess] = useState<string>("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileData, setProfileData] = useState<{
    username: string;
    role: string;
    displayName: string;
    canEdit: boolean;
  } | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<CompanyId>(() => getSelectedCompanyId());
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const companyMenuRef = useRef<HTMLDivElement | null>(null);
  const companies = getAllCompanyMeta();
  const companyLogos: Record<CompanyId, string> = {
    trust_general: trustGeneralLogo,
    trust_factory: trustFactoryLogo,
  };
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];
  const profileName = (profileData?.displayName || displayName || role || "User").trim();
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  useEffect(() => {
    if (!permissionModalOpen) return;
    if (!authToken) return;

    setPermissionError("");
    setPermissionLoading(true);

    fetch("/api/permissions", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.success) return;
        if (data.permissions && typeof data.permissions === "object") {
          const next: Record<string, boolean> = {};
          Object.entries(data.permissions).forEach(([k, v]) => {
            next[String(k)] = Boolean(v);
          });
          // ensure defaults exist
          if (next.technician == null) next.technician = false;
          if (next.account == null) next.account = false;
          setPermissionsState(next);
          return;
        }

        // backward compatible (older server response)
        setPermissionsState({
          technician: Boolean(data.technicianCanEdit),
          account: Boolean(data.accountCanEdit),
        });
      })
      .catch(() => setPermissionError("Failed to load current permissions."))
      .finally(() => setPermissionLoading(false));
  }, [permissionModalOpen, authToken]);

  useEffect(() => {
    if (!profileModalOpen) return;
    if (!authToken) return;
    setProfileLoading(true);
    setProfileError("");
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.success) {
          const status = Number(r.status || 0);
          if (status === 401) throw new Error(t("profile.sessionExpired"));
          throw new Error(data?.message || "Failed to load profile.");
        }
        setProfileData({
          username: String(data.username || ""),
          role: String(data.role || ""),
          displayName: String(data.displayName || ""),
          canEdit: Boolean(data.canEdit),
        });
      })
      .catch((e) => {
        setProfileData(null);
        setProfileError(e instanceof Error ? e.message : "Failed to load profile.");
      })
      .finally(() => setProfileLoading(false));
  }, [profileModalOpen, authToken]);

  const handleLanguageChange = (nextLang: "en" | "ar") => {
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("appLang", nextLang);
    } catch {
      /* ignore */
    }
    i18n.changeLanguage(nextLang);
  };

  useEffect(() => {
    const activeLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";
    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === "ar" ? "rtl" : "ltr";
  }, [i18n.language, i18n.resolvedLanguage, location.pathname, location.search]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 991.98px)");
    const syncBody = () => {
      if (!mq.matches) {
        document.body.classList.remove("mobile-nav-open");
        return;
      }
      if (mobileNavOpen) document.body.classList.add("mobile-nav-open");
      else document.body.classList.remove("mobile-nav-open");
    };
    syncBody();
    const onMq = () => syncBody();
    mq.addEventListener("change", onMq);
    return () => {
      mq.removeEventListener("change", onMq);
      document.body.classList.remove("mobile-nav-open");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!companyMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!companyMenuRef.current) return;
      if (!companyMenuRef.current.contains(e.target as Node)) setCompanyMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCompanyMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [companyMenuOpen]);

  const handleCompanyChange = (next: CompanyId) => {
    setSelectedCompanyId(next);
    setSelectedCompanyIdState(next);
    setCompanyMenuOpen(false);
    navigate("/dashboard", { replace: true });
  };

  const normalizeDepartmentKey = (val: string) =>
    String(val || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

  const handleAddDepartment = () => {
    const key = normalizeDepartmentKey(newDepartment);
    if (!key) return;
    if (key === "manager" || key === "admin") return;
    setPermissionsState((p) => (p[key] != null ? p : { ...p, [key]: false }));
    setNewDepartment("");
  };

  const handleDeleteDepartment = (key: string) => {
    // Keep base departments stable in this demo app.
    if (key === "technician" || key === "account") return;
    setPermissionsState((p) => {
      if (p[key] == null) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!authToken) {
      setPermissionError(t("errors.notLoggedIn"));
      setPermissionSaving(false);
      return;
    }
    setPermissionError("");
    setPermissionSuccess("");
    setPermissionSaving(true);

    try {
      const res = await fetch("/api/permissions/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ permissions: permissionsState }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || t("errors.saveFailed"));

      if (data.permissions && typeof data.permissions === "object") {
        const next: Record<string, boolean> = {};
        Object.entries(data.permissions).forEach(([k, v]) => {
          next[String(k)] = Boolean(v);
        });
        if (next.technician == null) next.technician = false;
        if (next.account == null) next.account = false;
        setPermissionsState(next);
      }

      setPermissionSuccess(t("common.save"));
      // Let the user see the success message briefly, then close.
      setTimeout(() => {
        setPermissionModalOpen(false);
      }, 4500);
    } catch (e) {
      setPermissionError(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setPermissionSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!authToken) {
      setPasswordError(t("errors.notLoggedIn"));
      return;
    }
    setPasswordError("");
    setPasswordSuccess("");
    const next = String(newPassword || "");
    const confirm = String(confirmPassword || "");
    if (next.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to update password.");
      setPasswordSuccess("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setPasswordModalOpen(false);
      }, 1200);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <button
            type="button"
            className="ghost-button mobile-nav-toggle"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-expanded={mobileNavOpen}
            aria-controls="app-side-nav"
            aria-label={mobileNavOpen ? t("nav.closeMenu") : t("nav.menu")}
          >
            <i className={mobileNavOpen ? "bi bi-x-lg" : "bi bi-list"} aria-hidden />
          </button>
          <Link to="/dashboard" className="brand">
            <div className="brand-mark">
              <img src={companyLogos[selectedCompany.id]} alt="" className="brand-logo-image" width={40} height={40} />
            </div>
            <div className="brand-text">
              <span className="brand-subtitle brand-subtitle-primary">{selectedCompany.name}</span>
            </div>
          </Link>
        </div>
        <div className="top-bar-right">
          <div className="topbar-company-switcher" ref={companyMenuRef}>
            <button
              type="button"
              className="topbar-company-trigger"
              onClick={() => setCompanyMenuOpen((s) => !s)}
              aria-haspopup="menu"
              aria-expanded={companyMenuOpen}
              aria-label="Choose company"
            >
              <span className="topbar-company-trigger-main">
                <span className="topbar-company-trigger-logo-wrap">
                  <img src={companyLogos[selectedCompany.id]} alt="" className="topbar-company-trigger-logo" />
                </span>
                <span className="topbar-company-trigger-text">
                  <span className="topbar-company-trigger-label">Workspace</span>
                  <span className="topbar-company-trigger-name">{selectedCompany.name}</span>
                </span>
              </span>
              <span className="topbar-company-trigger-caret">
                <i className={`bi ${companyMenuOpen ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden />
              </span>
            </button>
            {companyMenuOpen ? (
              <div className="topbar-company-menu" role="menu" aria-label="Company options">
                <div className="topbar-company-menu-title">Select company</div>
                {companies.map((company) => {
                  const active = company.id === selectedCompanyId;
                  return (
                    <button
                      key={company.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`topbar-company-option ${active ? "is-active" : ""}`}
                      onClick={() => handleCompanyChange(company.id)}
                    >
                      <span className="topbar-company-option-logo-wrap">
                        <img src={companyLogos[company.id]} alt="" className="topbar-company-option-logo" />
                      </span>
                      <span className="topbar-company-option-name">{company.name}</span>
                      {active ? <i className="bi bi-check-circle-fill topbar-company-option-check" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="lang-switch-wrap">
            <label className="lang-switch-label" htmlFor="lang-switch">
              {t("common.language")}
            </label>
            <select
              id="lang-switch"
              className="lang-switch-select"
              value={currentLang}
              onChange={(e) => handleLanguageChange(e.target.value as "en" | "ar")}
              aria-label="Select language"
            >
              <option value="en">{t("common.english")}</option>
              <option value="ar">{t("common.arabic")}</option>
            </select>
          </div>
          <button className="ghost-button profile-trigger-btn" onClick={() => setProfileModalOpen(true)}>
            <span className="profile-trigger-avatar" aria-hidden>
              {((displayName || role || "U").slice(0, 1) || "U").toUpperCase()}
            </span>
            <span>{t("topbar.myProfile")}</span>
          </button>
          {role === "manager" ? (
            <button className="ghost-button" onClick={() => setPermissionModalOpen(true)} disabled={permissionSaving}>
              {t("topbar.managePermissions")}
            </button>
          ) : null}
          <button className="ghost-button" onClick={handleLogout}>
            {t("common.logout")}
          </button>
        </div>
      </header>

      <div className={`main-layout${mobileNavOpen ? " mobile-nav-open" : ""}`}>
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label={t("nav.closeMenu")}
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />
        <nav className="side-nav" id="app-side-nav">
          <NavLink to="/dashboard" className="nav-item nav-item-dashboard">
            <i className="bi bi-speedometer2 nav-icon nav-icon-dashboard" />
            <span className="nav-label">{t("nav.dashboard")}</span>
          </NavLink>

          <div className="nav-section nav-section-inventory">
            <span className="nav-section-label">{t("nav.inventory")}</span>
            <NavLink to="/stock-availability" className="nav-item">
              <i className="bi bi-box-seam nav-icon nav-icon-stock" />
              <span className="nav-label">{t("nav.stockAvailability")}</span>
            </NavLink>
            <NavLink to="/sold-stock" className="nav-item">
              <i className="bi bi-receipt nav-icon nav-icon-sold" />
              <span className="nav-label">{t("nav.soldStock")}</span>
            </NavLink>
          </div>

          <div className="nav-section nav-section-equipment">
            <span className="nav-section-label">{t("nav.equipment")}</span>
            <NavLink to="/equipment" className="nav-item">
              <i className="bi bi-tools nav-icon nav-icon-equipment" />
              <span className="nav-label">{t("nav.allEquipment")}</span>
            </NavLink>
          </div>

          <div className="nav-section nav-section-clients-projects">
            <span className="nav-section-label">{t("nav.clientsProjects")}</span>
            <NavLink to="/clients" className="nav-item">
              <i className="bi bi-people nav-icon nav-icon-clients" />
              <span className="nav-label">{t("nav.clients")}</span>
            </NavLink>
            <NavLink to="/projects" className="nav-item">
              <i className="bi bi-diagram-3 nav-icon nav-icon-projects" />
              <span className="nav-label">{t("nav.projects")}</span>
            </NavLink>
          </div>

          {canEdit ? (
            <div className="nav-section nav-section-activities">
              <span className="nav-section-label">{t("nav.activityLog")}</span>
              <NavLink to="/activities" className="nav-item">
                <i className="bi bi-clock-history nav-icon nav-icon-activities" />
                <span className="nav-label">{t("nav.recentActivities")}</span>
              </NavLink>
            </div>
          ) : null}

          <div className="nav-section nav-section-actions">
            <span className="nav-section-label">{t("nav.actions")}</span>
            <NavLink to="/alerts" className="nav-item">
              <i className="bi bi-bell nav-icon nav-icon-alerts" />
              <span className="nav-label">{t("nav.alerts")}</span>
            </NavLink>
          </div>
        </nav>
        <main className="content-area">
          <Outlet />
        </main>
      </div>

      {permissionModalOpen ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="permission-modal-title">
          <div className="stock-delete-modal">
            <h3 id="permission-modal-title">{t("permission.title")}</h3>
            <p>{t("permission.subtitle")}</p>

            {permissionError ? <div className="alert alert-danger">{permissionError}</div> : null}
            {!permissionError && permissionSuccess ? <div className="alert alert-success">{permissionSuccess}</div> : null}

            {permissionLoading ? (
              <p className="text-muted">{t("common.loading")}</p>
            ) : (
              <div className="d-grid gap-2">
                <div className="d-flex gap-2 align-items-center">
                  <input
                    className="form-control form-control-sm"
                    placeholder={t("permission.addDepartmentPlaceholder")}
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    disabled={permissionSaving}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleAddDepartment}
                    disabled={permissionSaving}
                    aria-label={t("common.save")}
                    title={t("common.save")}
                  >
                    <i className="bi bi-plus-lg" />
                  </button>
                </div>

                {Object.keys(permissionsState)
                  .filter((k) => k !== "manager" && k !== "admin")
                  .sort((a, b) => a.localeCompare(b))
                  .map((k) => (
                    <div key={k} className="d-flex align-items-center justify-content-between gap-2">
                      <label className="d-flex align-items-center justify-content-between flex-grow-1">
                        <span>{k.replace(/_/g, " ")} can edit</span>
                        <input
                          type="checkbox"
                          checked={Boolean(permissionsState[k])}
                          onChange={(e) => setPermissionsState((p) => ({ ...p, [k]: e.target.checked }))}
                          disabled={permissionSaving}
                        />
                      </label>
                      {k === "technician" || k === "account" ? null : (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteDepartment(k)}
                          disabled={permissionSaving}
                          aria-label={`Delete ${k}`}
                          title="Delete department"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}

            <div className="stock-delete-modal-actions">
              <button
                type="button"
                className="stock-action-btn stock-cancel-btn"
                onClick={() => setPermissionModalOpen(false)}
                disabled={permissionSaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="stock-action-btn stock-delete-btn"
                onClick={handleSavePermissions}
                disabled={permissionSaving || permissionLoading}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileModalOpen ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
          <div className="stock-delete-modal profile-modal">
            <div className="profile-modal-hero">
              <div className="profile-modal-avatar" aria-hidden>
                {profileInitials || "U"}
              </div>
              <div className="profile-modal-hero-text">
                <h3 id="profile-modal-title">{t("profile.title")}</h3>
                <p>{t("profile.subtitle")}</p>
              </div>
            </div>
            {profileLoading ? <p className="text-muted">{t("common.loading")}</p> : null}
            {!profileLoading && profileError ? <div className="alert alert-danger">{profileError}</div> : null}
            {!profileLoading && !profileError && profileData ? (
              <div className="profile-details-grid">
                <div className="profile-detail-card profile-detail-name">
                  <span className="profile-detail-label">{t("profile.name")}</span>
                  <strong>{profileData.displayName || "—"}</strong>
                </div>
                <div className="profile-detail-card profile-detail-username">
                  <span className="profile-detail-label">{t("profile.emailUsername")}</span>
                  <strong>{profileData.username || "—"}</strong>
                </div>
                <div className="profile-detail-card profile-detail-role">
                  <span className="profile-detail-label">{t("profile.role")}</span>
                  <strong>{profileData.role || "—"}</strong>
                </div>
                <div className="profile-detail-card profile-detail-access">
                  <span className="profile-detail-label">{t("profile.editPermission")}</span>
                  <strong>{profileData.canEdit ? t("profile.granted") : t("profile.notGranted")}</strong>
                </div>
              </div>
            ) : null}

            <div className="stock-delete-modal-actions">
              <button
                type="button"
                className="stock-action-btn stock-cancel-btn"
                onClick={() => setProfileModalOpen(false)}
              >
                {t("common.close")}
              </button>
              <button
                type="button"
                className="stock-action-btn stock-delete-btn"
                onClick={() => {
                  setPasswordError("");
                  setPasswordSuccess("");
                  setPasswordModalOpen(true);
                }}
              >
                {t("profile.forgotPassword")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordModalOpen ? (
        <div className="stock-delete-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
          <div className="stock-delete-modal profile-password-modal">
            <div className="password-modal-hero">
              <div className="password-modal-hero-icon" aria-hidden>
                <i className="bi bi-shield-lock" />
              </div>
              <div>
                <h3 id="password-modal-title">{t("password.title")}</h3>
                <p>{t("password.subtitle")}</p>
              </div>
            </div>
            {passwordError ? <div className="alert alert-danger">{passwordError}</div> : null}
            {!passwordError && passwordSuccess ? <div className="alert alert-success">{passwordSuccess}</div> : null}
            <div className="d-grid gap-2 password-form-grid">
              <label className="password-field">
                <span className="password-field-label">{t("password.newPassword")}</span>
                <input
                  className="form-control form-control-sm password-field-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordSaving}
                />
              </label>
              <label className="password-field">
                <span className="password-field-label">{t("password.confirmPassword")}</span>
                <input
                  className="form-control form-control-sm password-field-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={passwordSaving}
                />
              </label>
            </div>
            <div className="stock-delete-modal-actions">
              <button
                type="button"
                className="stock-action-btn stock-cancel-btn password-cancel-btn"
                onClick={() => setPasswordModalOpen(false)}
                disabled={passwordSaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="stock-action-btn stock-delete-btn password-save-btn"
                onClick={handleChangePassword}
                disabled={passwordSaving}
              >
                {passwordSaving ? t("password.saving") : t("password.updatePassword")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
