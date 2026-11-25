import { type FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EnvelopeSimple, Eye, EyeSlash, Lock, SignIn, WarningCircle } from "@phosphor-icons/react";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthShell } from "@/components/layout/AuthShell";
import { Card } from "@/components/ui/Card/Card";
import { AlertBanner, Field, Input } from "@/components/ui/FormField/FormField";
import { Button } from "@/components/ui/Button/Button";
import styles from "./LoginPage.module.scss";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const pageRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(t("auth.loginTitle"));
  usePageEntrance(pageRef);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError(t("auth.emailError"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordError"));
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
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
      <div ref={pageRef} className={styles.wrap}>
        <Card padding="lg" data-animate="page-section">
          <div className={styles.head} data-animate="page-header">
            <h1 className={styles.title}>{t("auth.loginTitle")}</h1>
            <p className={styles.subtitle}>{t("auth.loginSubtitle")}</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className={styles.form}>
            {error && (
              <AlertBanner tone="error" icon={<WarningCircle size={18} weight="bold" />}>
                {error}
              </AlertBanner>
            )}

            <Field id="login-email" label={t("auth.email")} hint={t("auth.emailHint")} required>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<EnvelopeSimple size={18} />}
                placeholder="name@studio.com"
              />
            </Field>

            <Field id="login-password" label={t("auth.password")} hint={t("auth.passwordRules")} required>
              <div className={styles.passwordRow}>
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                />
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              icon={<SignIn size={18} weight="bold" />}
            >
              {t("auth.signInButton")}
            </Button>
          </form>

          <p className={styles.footer}>
            {t("auth.noAccount")}{" "}
            <Link to="/register" className={styles.footerLink}>
              {t("auth.goRegister")}
            </Link>
          </p>
        </Card>
      </div>
    </AuthShell>
  );
}
