import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Buildings,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Lock,
  ShieldCheck,
  SignIn,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSlidingIndicator } from "@/hooks/motion/useSlidingIndicator";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthShell } from "@/components/layout/AuthShell";
import { AlertBanner, Field, Input } from "@/components/ui/FormField/FormField";
import { Button } from "@/components/ui/Button/Button";
import {
  evaluatePassword,
  PasswordStrengthMeter,
} from "@/components/ui/PasswordStrengthMeter/PasswordStrengthMeter";
import styles from "./AuthPage.module.scss";

type AuthMode = "login" | "register";

export function AuthPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const mode: AuthMode = location.pathname === "/register" ? "register" : "login";

  const switchRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef<AuthMode>(mode);

  useDocumentTitle(mode === "register" ? t("auth.registerTitle") : t("auth.loginTitle"));
  useSlidingIndicator(switchRef, indicatorRef, mode);

  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Smooth directional slide + fade transition when toggling between login & register
  useEffect(() => {
    setError(null);
    const panel = panelRef.current;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (!panel || prev === mode) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const dir = mode === "register" ? 1 : -1;
    gsap.fromTo(
      panel,
      { x: dir * 16, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.28, ease: "power3.out", clearProps: "transform,opacity" }
    );
  }, [mode]);

  const handleModeSwitch = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    navigate(nextMode === "register" ? "/register" : "/login");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.includes("@")) {
      setError(t("auth.emailError"));
      return;
    }

    if (mode === "register") {
      if (!evaluatePassword(password).isValid) {
        setError(t("auth.passwordError"));
        return;
      }
    } else if (!password) {
      setError(t("auth.passwordError"));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(email.trim(), password, studioName.trim() || undefined);
      } else {
        await login(email.trim(), password);
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setError(err.detail || t("auth.accountLocked"));
      } else {
        setError(err instanceof ApiError ? err.message : t("common.errorTitle"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell variant="split">
      <div className={styles.wrap}>
        <section className={styles.card}>
          <div
            ref={switchRef}
            className={styles.modeSwitch}
            role="tablist"
            aria-label={mode === "register" ? t("auth.registerTitle") : t("auth.loginTitle")}
          >
            <span ref={indicatorRef} className={styles.modeIndicator} aria-hidden="true" />
            <button
              type="button"
              role="tab"
              data-tab-key="login"
              aria-selected={mode === "login"}
              className={`${styles.modeTab} ${mode === "login" ? styles.modeTabActive : ""}`.trim()}
              onClick={() => handleModeSwitch("login")}
            >
              {t("auth.tabLogin")}
            </button>
            <button
              type="button"
              role="tab"
              data-tab-key="register"
              aria-selected={mode === "register"}
              className={`${styles.modeTab} ${mode === "register" ? styles.modeTabActive : ""}`.trim()}
              onClick={() => handleModeSwitch("register")}
            >
              {t("auth.tabRegister")}
            </button>
          </div>

          <div ref={panelRef} className={styles.panel}>
            <div className={styles.head}>
              <h1 className={styles.title}>
                {mode === "register" ? t("auth.registerTitle") : t("auth.loginTitle")}
              </h1>
              <p className={styles.subtitle}>
                {mode === "register" ? t("auth.registerSubtitle") : t("auth.loginSubtitle")}
              </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} noValidate className={styles.form}>
              {error && (
                <AlertBanner tone="error" icon={<WarningCircle size={18} weight="bold" />}>
                  {error}
                </AlertBanner>
              )}

              {mode === "register" && (
                <Field id="auth-studio" label={t("auth.studioName")}>
                  <Input
                    id="auth-studio"
                    type="text"
                    autoComplete="organization"
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    icon={<Buildings size={18} />}
                    placeholder={t("auth.studioPlaceholder")}
                    className={styles.inputField}
                  />
                </Field>
              )}

              <Field id="auth-email" label={t("auth.email")} required>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<EnvelopeSimple size={18} />}
                  placeholder="name@studio.com"
                  className={styles.inputField}
                />
              </Field>

              <Field
                id="auth-password"
                label={t("auth.password")}
                hint={mode === "register" ? t("auth.passwordRules") : undefined}
                required
              >
                <div className={styles.passwordBox}>
                  <Input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock size={18} />}
                    placeholder={t("auth.passwordPlaceholder")}
                    className={`${styles.inputField} ${styles.passwordInput}`}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {mode === "register" && <PasswordStrengthMeter password={password} />}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                icon={
                  mode === "register" ? (
                    <UserPlus size={18} weight="bold" />
                  ) : (
                    <SignIn size={18} weight="bold" />
                  )
                }
                className={styles.submitBtn}
              >
                {mode === "register" ? t("auth.signUpButton") : t("auth.signInButton")}
              </Button>
            </form>
          </div>

          <div className={styles.securityBar}>
            <ShieldCheck size={15} weight="duotone" aria-hidden="true" />
            <span>{t("auth.securityNote")}</span>
          </div>
        </section>
      </div>
    </AuthShell>
  );
}
