import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { UserRole } from "../App";

import companyLoginIcon from "../../Trustgtckw (1).png";
import loginRightIcon from "../../login.avif";
import usernameFieldIcon from "../../username.png";
import passwordFieldIcon from "../../password.jpg";

const API_LOGIN = "/api/auth/login";

interface LoginProps {
  onLogin: (role: UserRole, token: string, displayName: string, canEdit: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentLang: "en" | "ar" = String(i18n.resolvedLanguage || i18n.language || "en").startsWith("ar") ? "ar" : "en";

  const handleLanguageChange = (nextLang: "en" | "ar") => {
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("appLang", nextLang);
    } catch {
      // ignore
    }
    i18n.changeLanguage(nextLang);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(API_LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || t("login.invalidCreds"));
        setIsSubmitting(false);
        return;
      }

      if (data.success && data.role) {
        onLogin(
          String(data.role) as UserRole,
          String(data.token || ""),
          String(data.displayName || data.role || ""),
          Boolean(data.canEdit)
        );
        navigate("/dashboard");
      } else {
        setError(t("login.invalidCreds"));
      }
    } catch {
      setError(t("login.serverError"));
    }
    setIsSubmitting(false);
  };

  return (
    <div className="login-page">
      <div className="login-bg-shapes" aria-hidden="true">
        <span className="login-shape login-shape-1" />
        <span className="login-shape login-shape-2" />
        <span className="login-shape login-shape-3" />
      </div>

      <div className="login-card card shadow-lg border-0 overflow-hidden">
        <div className="row g-0 flex-md-row flex-column">
          <div className="col-md-5 login-left-col">
            <div className="login-left-inner">
              <div className="login-brand-icon">
                <img src={companyLoginIcon} alt="Company logo" className="login-brand-image" />
              </div>
              <h1 className="login-title">{t("login.title")}</h1>
              <p className="login-company">{t("login.company")}</p>
            </div>
          </div>

          <div className="col-md-7">
            <div className="card-body p-4 p-md-5 login-form-wrap">
              <div className="login-form-topbar">
                <div className="login-lang-chip" role="group" aria-label={t("common.language")}>
                  <i className="bi bi-translate login-lang-chip-icon" aria-hidden="true" />
                  <button
                    type="button"
                    className={`login-lang-btn ${currentLang === "en" ? "active" : ""}`}
                    onClick={() => handleLanguageChange("en")}
                    aria-pressed={currentLang === "en"}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`login-lang-btn ${currentLang === "ar" ? "active" : ""}`}
                    onClick={() => handleLanguageChange("ar")}
                    aria-pressed={currentLang === "ar"}
                  >
                    AR
                  </button>
                </div>
              </div>
              <div className="login-avatar-wrap">
                <div className="login-avatar">
                  <img src={loginRightIcon} alt="User icon" className="login-avatar-image" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
                {error && (
                  <div className="alert alert-danger d-flex align-items-center py-2" role="alert">
                    <span className="me-2">⚠</span>
                    {error}
                  </div>
                )}

                <div className="mb-3">
                  <label htmlFor="login-email" className="form-label login-input-label">
                    <img src={usernameFieldIcon} alt="" className="login-label-icon me-2" aria-hidden="true" />
                    {t("login.emailOrPhone")}
                  </label>
                  <input
                    id="login-email"
                    type="text"
                    className="form-control form-control-lg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="login-password" className="form-label login-input-label">
                    <img src={passwordFieldIcon} alt="" className="login-label-icon login-label-icon-password me-2" aria-hidden="true" />
                    {t("login.password")}
                  </label>
                  <div className="input-group input-group-lg">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="login-toggle-pw"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    >
                      <i className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100 login-btn-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                      {t("login.signingIn")}
                    </>
                  ) : (
                    t("login.logIn")
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
