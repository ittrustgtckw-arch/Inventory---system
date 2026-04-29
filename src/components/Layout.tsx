import { Link, NavLink, Outlet, useNavigate, Navigate, useLocation } from "react-router-dom";
import { Fragment, useEffect, useRef, useState } from "react";
import { useAuth, useCanEdit } from "../auth";
import { useTranslation } from "react-i18next";
import { getAuthToken } from "../utils/authToken";
import trustGeneralLogo from "../../Trustgtckw (1).png";
import trustFactoryLogo from "../../TrustFactory.png";
import { getAllCompanyMeta, getSelectedCompanyId, setSelectedCompanyId, type CompanyId } from "../company";

interface LayoutProps {
  onLogout: () => void;
}

type UserAccountRow = { username: string; role: string; displayName: string; active: boolean };

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
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<CompanyId>(() => getSelectedCompanyId());
  const [userAccounts, setUserAccounts] = useState<UserAccountRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "technician" | "account">("technician");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [addUserSaving, setAddUserSaving] = useState(false);
  const [addUserError, setAddUserError] = useState("");
  const [resettingFor, setResettingFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState("");
  const [userRowError, setUserRowError] = useState("");
  const [userRowSuccess, setUserRowSuccess] = useState("");
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
    setUsersError("");
    setAddUserError("");
    setUserRowError("");
    setUserRowSuccess("");
    setResettingFor(null);
    setResetPass("");
    setResetConfirm("");
    setResetError("");
    setPermissionLoading(true);
    setUsersLoading(true);

    void (async () => {
      try {
        const [permRes, usersRes] = await Promise.all([
          fetch("/api/permissions", { headers: { Authorization: `Bearer ${authToken}` } }),
          fetch("/api/users", { headers: { Authorization: `Bearer ${authToken}` } }),
        ]);
        const permData = (await permRes.json().catch(() => null)) as { success?: boolean; message?: string; permissions?: unknown } | null;
        const usersData = (await usersRes.json().catch(() => null)) as
          | { success?: boolean; message?: string; users?: unknown }
          | null;

        if (permRes.status === 401 || usersRes.status === 401) {
          setPermissionError(t("profile.sessionExpired"));
          setUsersError(t("profile.sessionExpired"));
          return;
        }

        if (permData?.success) {
          if (permData.permissions && typeof permData.permissions === "object") {
            const next: Record<string, boolean> = {};
            Object.entries(permData.permissions).forEach(([k, v]) => {
              next[String(k)] = Boolean(v);
            });
            if (next.technician == null) next.technician = false;
            if (next.account == null) next.account = false;
            setPermissionsState(next);
          } else {
            setPermissionsState({
              technician: Boolean((permData as { technicianCanEdit?: boolean }).technicianCanEdit),
              account: Boolean((permData as { accountCanEdit?: boolean }).accountCanEdit),
            });
          }
        } else {
          const pMsg = permData && typeof permData.message === "string" ? permData.message : "";
          if (permRes.status === 403) {
            setPermissionError(pMsg || t("permission.userLoadForbidden"));
          } else if (permRes.status === 404) {
            setPermissionError(pMsg || t("permission.userLoadNotFound"));
          } else if (!permRes.ok) {
            setPermissionError(pMsg || t("permission.permLoadHttp", { status: permRes.status }));
          } else {
          setPermissionError(
            (permData && typeof permData.message === "string" && permData.message) ||
              (!permRes.ok ? t("permission.permLoadHttp", { status: permRes.status }) : t("permission.permLoadFailed"))
          );
          }
        }

        if (usersData?.success && Array.isArray(usersData.users)) {
          setUserAccounts(usersData.users as UserAccountRow[]);
          setUsersError("");
        } else {
          const apiMsg = usersData && typeof usersData.message === "string" ? usersData.message : "";
          if (usersRes.status === 404) {
            setUsersError(apiMsg || t("permission.userLoadNotFound"));
          } else if (usersRes.status === 403) {
            setUsersError(apiMsg || t("permission.userLoadForbidden"));
          } else if (!usersRes.ok) {
            setUsersError(apiMsg || t("permission.userLoadHttp", { status: usersRes.status }));
          } else if (apiMsg) {
            setUsersError(apiMsg);
          } else {
            setUsersError(t("permission.userLoadFailed"));
          }
        }
      } catch {
        setPermissionError(t("permission.permLoadFailed"));
        setUsersError(t("permission.userLoadNetwork"));
      } finally {
        setPermissionLoading(false);
        setUsersLoading(false);
      }
    })();
  }, [permissionModalOpen, authToken, t]);

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
    const mq = window.matchMedia("(max-width: 1199.98px)");
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

  const refreshUserList = async () => {
    if (!authToken) return;
    const r = await fetch("/api/users", { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.success && Array.isArray(data.users)) {
      setUserAccounts(data.users as UserAccountRow[]);
    }
  };

  const handleAddUser = async () => {
    if (!authToken) return;
    setAddUserError("");
    setAddUserSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          username: newUserUsername.trim().toLowerCase(),
          password: newUserPassword,
          role: newUserRole,
          displayName: newUserDisplayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || t("permission.addUserFailed"));
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserDisplayName("");
      setNewUserRole("technician");
      await refreshUserList();
    } catch (e) {
      setAddUserError(e instanceof Error ? e.message : t("permission.addUserFailed"));
    } finally {
      setAddUserSaving(false);
    }
  };

  const patchUserAccount = async (username: string, body: Record<string, unknown>) => {
    if (!authToken) throw new Error(t("errors.notLoggedIn"));
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) throw new Error(data?.message || t("permission.updateUserFailed"));
    if (data.user) {
      setUserAccounts((prev) => prev.map((u) => (u.username === data.user.username ? { ...u, ...data.user } : u)));
    } else {
      await refreshUserList();
    }
  };

  const handleToggleUserActive = async (username: string, nextActive: boolean) => {
    setUserRowError("");
    setUserRowSuccess("");
    try {
      await patchUserAccount(username, { active: nextActive });
      setUserRowSuccess(
        nextActive
          ? t("permission.userActivated", { username })
          : t("permission.userDeactivated", { username })
      );
    } catch (e) {
      setUserRowError(e instanceof Error ? e.message : t("permission.updateUserFailed"));
    }
  };

  const handleSaveResetPassword = async () => {
    if (!authToken || !resettingFor) return;
    setResetError("");
    const a = String(resetPass || "");
    const b = String(resetConfirm || "");
    if (a.length < 6) {
      setResetError(t("permission.passwordMin6"));
      return;
    }
    if (a !== b) {
      setResetError(t("permission.passwordMismatch"));
      return;
    }
    setResetSaving(true);
    try {
      await patchUserAccount(resettingFor, { newPassword: a });
      setResettingFor(null);
      setResetPass("");
      setResetConfirm("");
    } catch (e) {
      setResetError(e instanceof Error ? e.message : t("permission.updateUserFailed"));
    } finally {
      setResetSaving(false);
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
            <label className="lang-switch-label" htmlFor="lang-switch" aria-label={t("common.language")}>
              <i className="bi bi-translate lang-switch-label-icon" aria-hidden />
            </label>
            <select
              id="lang-switch"
              className="lang-switch-select"
              value={currentLang}
              onChange={(e) => handleLanguageChange(e.target.value as "en" | "ar")}
              aria-label="Select language"
            >
              <option value="en">EN</option>
              <option value="ar">AR</option>
            </select>
          </div>
          <button
            type="button"
            className="ghost-button profile-trigger-btn top-action-btn top-action-profile"
            onClick={() => setProfileModalOpen(true)}
            aria-label={t("topbar.myProfile")}
          >
            <span className="profile-trigger-avatar" aria-hidden>
              {((displayName || role || "U").slice(0, 1) || "U").toUpperCase()}
            </span>
            <span className="top-action-label">{t("topbar.myProfile")}</span>
          </button>
          {role === "manager" ? (
            <button
              type="button"
              className="ghost-button top-action-btn top-action-manage"
              onClick={() => setPermissionModalOpen(true)}
              disabled={permissionSaving}
              aria-label={t("topbar.managePermissions")}
            >
              <i className="bi bi-shield-lock-fill top-action-icon" aria-hidden />
              <span className="top-action-label">{t("topbar.managePermissions")}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button top-action-btn top-action-logout"
            onClick={handleLogout}
            aria-label={t("common.logout")}
          >
            <i className="bi bi-box-arrow-right top-action-icon" aria-hidden />
            <span className="top-action-label">{t("common.logout")}</span>
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
        <div
          className="stock-delete-modal-backdrop permission-manage-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permission-modal-title"
        >
          <div className="stock-delete-modal permission-manage-modal">
            <header className="permission-manage-hero">
              <div className="permission-manage-hero-icon" aria-hidden>
                <i className="bi bi-shield-lock-fill" />
              </div>
              <div className="permission-manage-hero-text">
                <h3 id="permission-modal-title">{t("permission.title")}</h3>
                {String(t("permission.subtitle") || "").trim() ? (
                  <p className="permission-manage-hero-lead">{t("permission.subtitle")}</p>
                ) : null}
              </div>
            </header>

            {permissionError ? <div className="alert alert-danger permission-manage-alert">{permissionError}</div> : null}
            {!permissionError && permissionSuccess ? (
              <div className="alert alert-success permission-manage-alert">{permissionSuccess}</div>
            ) : null}

            <div className="permission-manage-scroll">
              <div className="row g-3 permission-manage-columns">
                <div className="col-12 col-lg-5">
                  <section className="permission-panel permission-panel--departments h-100">
                    <div className="permission-panel-head">
                      <span className="permission-panel-badge permission-panel-badge--teal">
                        <i className="bi bi-diagram-3-fill me-1" aria-hidden />
                        {t("permission.sectionDepartmentsTitle")}
                      </span>
                      {String(t("permission.sectionDepartmentsLead") || "").trim() ? (
                        <p className="permission-panel-lead">{t("permission.sectionDepartmentsLead")}</p>
                      ) : null}
                    </div>
                    <div className="permission-panel-body">
                      {permissionLoading ? (
                        <div className="permission-panel-skeleton text-muted">
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          {t("common.loading")}
                        </div>
                      ) : (
                        <div className="d-grid gap-2">
                          <div className="permission-add-dept input-group input-group-sm">
                            <input
                              className="form-control"
                              placeholder={t("permission.addDepartmentPlaceholder")}
                              value={newDepartment}
                              onChange={(e) => setNewDepartment(e.target.value)}
                              disabled={permissionSaving}
                            />
                            <button
                              type="button"
                              className="btn btn-teal-gradient"
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
                              <div key={k} className="permission-dept-card">
                                <label className="permission-dept-label">
                                  <span className="permission-dept-name">{k.replace(/_/g, " ")}</span>
                                  <span className="permission-dept-hint text-muted">{t("permission.canEditLabel")}</span>
                                  <input
                                    type="checkbox"
                                    className="form-check-input permission-dept-check"
                                    checked={Boolean(permissionsState[k])}
                                    onChange={(e) => setPermissionsState((p) => ({ ...p, [k]: e.target.checked }))}
                                    disabled={permissionSaving}
                                  />
                                </label>
                                {k === "technician" || k === "account" ? null : (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger permission-dept-remove"
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
                    </div>
                  </section>
                </div>

                <div className="col-12 col-lg-7">
                  <section className="permission-panel permission-panel--users h-100">
                    <div className="permission-panel-head">
                      <span className="permission-panel-badge permission-panel-badge--violet">
                        <i className="bi bi-people-fill me-1" aria-hidden />
                        {t("permission.userAccountsTitle")}
                      </span>
                      <p className="permission-panel-sub">{t("permission.sectionUsersTitle")}</p>
                      {String(t("permission.userAccountsHint") || "").trim() ? (
                        <p className="permission-panel-lead">{t("permission.userAccountsHint")}</p>
                      ) : null}
                    </div>
                    <div className="permission-panel-body">
                      {usersError ? <div className="alert alert-danger small py-2">{usersError}</div> : null}
                      {userRowError ? <div className="alert alert-danger small py-2">{userRowError}</div> : null}
                      {userRowSuccess ? <div className="alert alert-success small py-2">{userRowSuccess}</div> : null}
                      {usersLoading ? (
                        <div className="permission-panel-skeleton text-muted">
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          {t("common.loading")}
                        </div>
                      ) : (
                        <div className="d-grid gap-3">
                          <div className="permission-add-user-card">
                            <div className="permission-add-user-title">
                              <i className="bi bi-person-plus-fill me-2 permission-add-user-icon" aria-hidden />
                              {t("permission.addUserSection")}
                            </div>
                            {addUserError ? <div className="alert alert-danger py-1 small mb-2">{addUserError}</div> : null}
                            <div className="row g-2">
                              <div className="col-12">
                                <label className="form-label permission-field-label">{t("permission.username")}</label>
                                <input
                                  className="form-control form-control-sm"
                                  placeholder={t("permission.username")}
                                  value={newUserUsername}
                                  onChange={(e) => setNewUserUsername(e.target.value)}
                                  disabled={addUserSaving || permissionSaving}
                                  autoComplete="off"
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label permission-field-label">{t("permission.password")}</label>
                                <input
                                  className="form-control form-control-sm"
                                  placeholder={t("permission.password")}
                                  type="password"
                                  value={newUserPassword}
                                  onChange={(e) => setNewUserPassword(e.target.value)}
                                  disabled={addUserSaving || permissionSaving}
                                  autoComplete="new-password"
                                />
                              </div>
                              <div className="col-md-6">
                                <label className="form-label permission-field-label">{t("permission.displayName")}</label>
                                <input
                                  className="form-control form-control-sm"
                                  placeholder={t("permission.displayName")}
                                  value={newUserDisplayName}
                                  onChange={(e) => setNewUserDisplayName(e.target.value)}
                                  disabled={addUserSaving || permissionSaving}
                                />
                              </div>
                              <div className="col-12">
                                <div className="permission-add-user-footer">
                                  <div className="permission-add-user-footer-role">
                                    <label className="form-label permission-field-label">{t("permission.role")}</label>
                                    <select
                                      className="form-select form-select-sm"
                                      value={newUserRole}
                                      onChange={(e) => setNewUserRole(e.target.value as "admin" | "technician" | "account")}
                                      disabled={addUserSaving || permissionSaving}
                                    >
                                      <option value="technician">technician</option>
                                      <option value="account">account</option>
                                      <option value="admin">admin</option>
                                    </select>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-violet-gradient"
                                    onClick={() => void handleAddUser()}
                                    disabled={
                                      addUserSaving ||
                                      permissionSaving ||
                                      !newUserUsername.trim() ||
                                      newUserPassword.length < 6
                                    }
                                  >
                                    {addUserSaving ? t("common.loading") : t("permission.addUser")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="table-responsive permission-users-table-wrap">
                            <table className="table table-sm align-middle mb-0 permission-users-table">
                              <thead>
                                <tr>
                                  <th scope="col">{t("permission.colUsername")}</th>
                                  <th scope="col">{t("permission.colName")}</th>
                                  <th scope="col">{t("permission.colRole")}</th>
                                  <th scope="col" className="text-center">
                                    {t("permission.colActive")}
                                  </th>
                                  <th scope="col">{t("permission.colActions")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {userAccounts.map((u) => (
                                  <Fragment key={u.username}>
                                    <tr
                                      className={`permission-user-data-row${u.active ? "" : " permission-user-row-inactive"}`}
                                    >
                                      <td className="small text-break fw-semibold text-body">{u.username}</td>
                                      <td className="small">{u.displayName}</td>
                                      <td>
                                        <span className="permission-role-pill">{u.role}</span>
                                      </td>
                                      <td className="text-center">
                                        <div className="form-check form-switch d-inline-flex justify-content-center">
                                          <input
                                            className="form-check-input"
                                            type="checkbox"
                                            role="switch"
                                            checked={u.active}
                                            onChange={(e) => void handleToggleUserActive(u.username, e.target.checked)}
                                            disabled={permissionSaving}
                                            aria-label={t("permission.active")}
                                          />
                                        </div>
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary permission-reset-btn"
                                          onClick={() => {
                                            setResetError("");
                                            setResetPass("");
                                            setResetConfirm("");
                                            setResettingFor((cur) => (cur === u.username ? null : u.username));
                                          }}
                                          disabled={permissionSaving}
                                        >
                                          <i className="bi bi-key-fill me-1" aria-hidden />
                                          {t("permission.resetPassword")}
                                        </button>
                                      </td>
                                    </tr>
                                    {resettingFor === u.username ? (
                                      <tr className="permission-reset-row">
                                        <td colSpan={5}>
                                          {resetError ? <div className="alert alert-danger py-1 small mb-2">{resetError}</div> : null}
                                          <div className="permission-reset-inner">
                                            <div className="row g-2">
                                              <div className="col-12 col-md-6">
                                                <label className="form-label permission-field-label mb-0">
                                                  {t("permission.resetPasswordHint")}
                                                </label>
                                                <input
                                                  type="password"
                                                  className="form-control form-control-sm"
                                                  value={resetPass}
                                                  onChange={(e) => setResetPass(e.target.value)}
                                                  disabled={resetSaving}
                                                  autoComplete="new-password"
                                                />
                                              </div>
                                              <div className="col-12 col-md-6">
                                                <label className="form-label permission-field-label mb-0">
                                                  {t("permission.confirmPassword")}
                                                </label>
                                                <input
                                                  type="password"
                                                  className="form-control form-control-sm"
                                                  value={resetConfirm}
                                                  onChange={(e) => setResetConfirm(e.target.value)}
                                                  disabled={resetSaving}
                                                  autoComplete="new-password"
                                                />
                                              </div>
                                              <div className="col-12">
                                                <div className="permission-reset-actions">
                                                  <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => void handleSaveResetPassword()}
                                                    disabled={resetSaving}
                                                  >
                                                    {t("permission.applyPassword")}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => {
                                                      setResettingFor(null);
                                                      setResetPass("");
                                                      setResetConfirm("");
                                                      setResetError("");
                                                    }}
                                                    disabled={resetSaving}
                                                  >
                                                    {t("permission.cancelPassword")}
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>

            <footer className="permission-manage-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setPermissionModalOpen(false)}
                disabled={permissionSaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-save-permissions"
                onClick={handleSavePermissions}
                disabled={permissionSaving || permissionLoading}
              >
                <i className="bi bi-check2-circle me-1" aria-hidden />
                {t("common.save")}
              </button>
            </footer>
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
