import { type FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Buildings,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  Lock,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthShell } from "@/components/layout/AuthShell";
import { Card } from "@/components/ui/Card/Card";
import { AlertBanner, Field, Input } from "@/components/ui/FormField/FormField";
import { Button } from "@/components/ui/Button/Button";
import {
  evaluatePassword,
  PasswordStrengthMeter,
} from "@/components/ui/PasswordStrengthMeter/PasswordStrengthMeter";
import styles from "./RegisterPage.module.scss";

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const pageRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(t("auth.registerTitle"));
  usePageEntrance(pageRef);

  const [studioName, setStudioName] = useState("");
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
    if (!evaluatePassword(password).isValid) {
      setError(t("auth.passwordError"));
      return;
    }

    setSubmitting(true);
    try {
      await register(email.trim(), password, studioName.trim() || undefined);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorTitle"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell variant="split">
      <div ref={pageRef} className={styles.wrap}>
        <Card padding="lg" data-animate="page-section">
          <div className={styles.head} data-animate="page-header">
            <h1 className={styles.title}>{t("auth.registerTitle")}</h1>
            <p className={styles.subtitle}>{t("auth.registerSubtitle")}</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className={styles.form}>
            {error && (
              <AlertBanner tone="error" icon={<WarningCircle size={18} weight="bold" />}>
                {error}
              </AlertBanner>
            )}

            <Field id="reg-studio" label={t("auth.studioName")}>
              <Input
                id="reg-studio"
                type="text"
                autoComplete="organization"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                icon={<Buildings size={18} />}
                placeholder={t("auth.studioPlaceholder")}
              />
            </Field>

            <Field id="reg-email" label={t("auth.email")} hint={t("auth.emailHint")} required>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<EnvelopeSimple size={18} />}
                placeholder="name@studio.com"
              />
            </Field>

            <Field id="reg-password" label={t("auth.password")} hint={t("auth.passwordRules")} required>
              <div className={styles.passwordRow}>
                <Input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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

            <PasswordStrengthMeter password={password} />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              icon={<UserPlus size={18} weight="bold" />}
            >
              {t("auth.signUpButton")}
            </Button>
          </form>

          <p className={styles.footer}>
            {t("auth.hasAccount")}{" "}
            <Link to="/login" className={styles.footerLink}>
              {t("auth.goLogin")}
            </Link>
          </p>
        </Card>
      </div>
    </AuthShell>
  );
}
