import { lazy, type ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  Aperture,
  ChartLineUp,
  EnvelopeSimple,
  Globe,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "@phosphor-icons/react";
import { type ThemeChoice, type UiLanguage, useUiStore } from "@/stores/useUiStore";
import { ToastViewport } from "@/components/ui/Toast/ToastViewport";
import styles from "./AuthShell.module.scss";

const LeadLensGlobe3D = lazy(() =>
  import("@/components/three/LeadLensGlobe3D").then((m) => ({ default: m.LeadLensGlobe3D }))
);

export interface AuthShellProps {
  children: ReactNode;
  variant?: "split" | "centered";
}

export function AuthShell({ children, variant = "split" }: AuthShellProps) {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);

  const cycleTheme = () => {
    const order: ThemeChoice[] = ["system", "light", "dark"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const toggleLanguage = () => {
    const next: UiLanguage = language === "uk" ? "en" : "uk";
    setLanguage(next);
  };

  const themeIcon =
    theme === "dark" ? (
      <Moon size={16} weight="bold" />
    ) : theme === "light" ? (
      <Sun size={16} weight="bold" />
    ) : (
      <Monitor size={16} weight="bold" />
    );

  return (
    <div className={styles.page}>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <Aperture size={20} weight="duotone" />
          </span>
          <span className={styles.brandName}>LeadLens</span>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={cycleTheme}
            aria-label={t("controls.theme")}
          >
            {themeIcon}
          </button>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={toggleLanguage}
            aria-label={t("controls.language")}
          >
            <Globe size={16} weight="bold" aria-hidden="true" />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>
      </header>

      <main
        id="main-content"
        className={`${styles.main} ${variant === "centered" ? styles.centered : styles.split}`}
      >
        {variant === "split" && (
          <aside className={styles.aside}>
            <div className={styles.asideTop}>
              <span className={styles.eyebrow}>{t("brandTagline")}</span>
              <span className={styles.profileTag}>web_studio v1.0.0</span>
            </div>

            <div className={styles.stageArea}>
              <Suspense fallback={null}>
                <LeadLensGlobe3D />
              </Suspense>
            </div>

            <div className={styles.asideInner}>
              <h2 className={styles.asideHeading}>LeadLens</h2>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <div className={styles.featureTop}>
                    <span className={styles.featureIcon} aria-hidden="true">
                      <ShieldCheck size={19} weight="duotone" />
                    </span>
                    <span className={styles.featureIndex}>01</span>
                  </div>
                  <h3 className={styles.featureTitle}>{t("auth.feature1Title")}</h3>
                  <p className={styles.featureDesc}>{t("auth.feature1Desc")}</p>
                </li>
                <li className={styles.featureItem}>
                  <div className={styles.featureTop}>
                    <span className={styles.featureIcon} aria-hidden="true">
                      <ChartLineUp size={19} weight="duotone" />
                    </span>
                    <span className={styles.featureIndex}>02</span>
                  </div>
                  <h3 className={styles.featureTitle}>{t("auth.feature2Title")}</h3>
                  <p className={styles.featureDesc}>{t("auth.feature2Desc")}</p>
                </li>
                <li className={styles.featureItem}>
                  <div className={styles.featureTop}>
                    <span className={styles.featureIcon} aria-hidden="true">
                      <EnvelopeSimple size={19} weight="duotone" />
                    </span>
                    <span className={styles.featureIndex}>03</span>
                  </div>
                  <h3 className={styles.featureTitle}>{t("auth.feature3Title")}</h3>
                  <p className={styles.featureDesc}>{t("auth.feature3Desc")}</p>
                </li>
              </ul>
            </div>
          </aside>
        )}

        <div className={styles.content}>{children}</div>
      </main>

      <ToastViewport />
    </div>
  );
}
