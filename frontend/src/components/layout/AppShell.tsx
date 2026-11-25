import { type ReactNode, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Aperture,
  ChartBar,
  FolderOpen,
  GearSix,
  Globe,
  List,
  Monitor,
  Moon,
  SignOut,
  Sun,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { useAuthStore } from "@/stores/useAuthStore";
import { type ThemeChoice, type UiLanguage, useUiStore } from "@/stores/useUiStore";
import { useWorkspace } from "@/hooks/queries/useWorkspace";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { ToastViewport } from "@/components/ui/Toast/ToastViewport";
import { ConfirmDialog } from "@/components/ui/Modal/ConfirmDialog";
import styles from "./AppShell.module.scss";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  const { data: workspace } = useWorkspace();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced && drawerRef.current) {
      gsap.fromTo(
        drawerRef.current,
        { x: -28, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.24, ease: "power3.out", clearProps: "transform,opacity" }
      );
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: <ChartBar size={20} weight="duotone" /> },
    { to: "/campaigns", label: t("nav.campaigns"), icon: <FolderOpen size={20} weight="duotone" /> },
    { to: "/leads", label: t("nav.leads"), icon: <UsersThree size={20} weight="duotone" /> },
    { to: "/settings", label: t("nav.settings"), icon: <GearSix size={20} weight="duotone" /> },
  ];

  const cycleTheme = () => {
    const order: ThemeChoice[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const themeIcon =
    theme === "dark" ? (
      <Moon size={16} weight="bold" />
    ) : theme === "light" ? (
      <Sun size={16} weight="bold" />
    ) : (
      <Monitor size={16} weight="bold" />
    );

  const themeLabel =
    theme === "dark"
      ? t("controls.themeDark")
      : theme === "light"
        ? t("controls.themeLight")
        : t("controls.themeSystem");

  const toggleLanguage = () => {
    const next: UiLanguage = language === "uk" ? "en" : "uk";
    setLanguage(next);
  };

  const quotaUsed = workspace?.quotas.monthlyAuditsUsed ?? 0;
  const quotaMax = workspace?.quotas.monthlyAuditQuota ?? 200;
  const quotaRatio = quotaMax > 0 ? quotaUsed / quotaMax : 0;

  const sidebarContent = (
    <>
      <div className={styles.brandBlock}>
        <NavLink to="/dashboard" className={styles.brandLink}>
          <span className={styles.brandMark} aria-hidden="true">
            <Aperture size={22} weight="duotone" />
          </span>
          <span className={styles.brandWordmark}>LeadLens</span>
        </NavLink>
      </div>

      <nav className={styles.nav} aria-label={t("navLabel")}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()
            }
          >
            <span className={styles.navIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        {workspace && (
          <div className={styles.quotaCard}>
            <div className={styles.quotaHeader}>
              <span className={styles.quotaLabel}>{t("nav.monthlyQuota")}</span>
              <span className={styles.quotaNumbers}>
                {quotaUsed} / {quotaMax}
              </span>
            </div>
            <ProgressBar
              value={quotaUsed}
              max={quotaMax}
              size="sm"
              tone={quotaRatio > 0.9 ? "critical" : quotaRatio > 0.75 ? "moderate" : "accent"}
              label={t("nav.monthlyQuota")}
            />
          </div>
        )}

        <div className={styles.accountRow}>
          <div className={styles.accountMeta}>
            <span className={styles.studioTitle}>{workspace?.name ?? "LeadLens Studio"}</span>
            <span className={styles.accountEmail}>{session?.email ?? ""}</span>
          </div>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={() => void handleLogout()}
            aria-label={t("nav.logout")}
            title={t("nav.logout")}
          >
            <SignOut size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>

      <aside className={styles.sidebar}>{sidebarContent}</aside>

      {mobileNavOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={() => setMobileNavOpen(false)}
          role="presentation"
        >
          <div
            ref={drawerRef}
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.drawerClose}
              onClick={() => setMobileNavOpen(false)}
              aria-label={t("common.closeMenu")}
            >
              <X size={20} weight="bold" aria-hidden="true" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setMobileNavOpen(true)}
              aria-label={t("common.openMenu")}
              aria-expanded={mobileNavOpen}
            >
              <List size={22} weight="bold" aria-hidden="true" />
            </button>
            <NavLink to="/dashboard" className={styles.mobileBrand}>
              <span className={styles.brandMarkSm} aria-hidden="true">
                <Aperture size={18} weight="duotone" />
              </span>
              <span>LeadLens</span>
            </NavLink>
          </div>

          <div className={styles.topbarControls}>
            <button
              type="button"
              className={styles.controlChip}
              onClick={cycleTheme}
              aria-label={`${t("controls.theme")}: ${themeLabel}`}
            >
              <span className={styles.chipIcon} aria-hidden="true">
                {themeIcon}
              </span>
              <span className={styles.chipText}>{themeLabel}</span>
            </button>

            <button
              type="button"
              className={styles.controlChip}
              onClick={toggleLanguage}
              aria-label={t("controls.language")}
            >
              <Globe size={16} weight="bold" aria-hidden="true" />
              <span>{language.toUpperCase()}</span>
            </button>
          </div>
        </header>

        <main id="main-content" className={styles.main} tabIndex={-1}>
          <div className={styles.container}>{children}</div>
        </main>
      </div>

      <ToastViewport />
      <ConfirmDialog />
    </div>
  );
}
