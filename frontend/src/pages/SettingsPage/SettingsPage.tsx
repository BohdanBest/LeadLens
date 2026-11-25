import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Buildings,
  Desktop,
  DeviceMobile,
  FloppyDisk,
  Gauge,
  Key,
  Palette,
  ShieldCheck,
  SignOut,
  Trash,
  WarningOctagon,
} from "@phosphor-icons/react";
import { ApiError, type AuthSessionDto } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/stores/useAuthStore";
import { type ThemeChoice, type UiLanguage, useUiStore } from "@/stores/useUiStore";
import { useUpdateWorkspace, useWorkspace } from "@/hooks/queries/useWorkspace";
import { useAuthSessions, useRevokeSession } from "@/hooks/queries/useAuthSessions";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Field, Input, Select, Textarea } from "@/components/ui/FormField/FormField";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import {
  evaluatePassword,
  PasswordStrengthMeter,
} from "@/components/ui/PasswordStrengthMeter/PasswordStrengthMeter";
import styles from "./SettingsPage.module.scss";

type SettingsTab = "profile" | "security";

function describeUserAgent(ua: string | null, fallback: string): { label: string; isMobile: boolean } {
  if (!ua) return { label: fallback, isMobile: false };
  const isMobile = /Mobile|Android|iPhone|iPad|iOS/i.test(ua);

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/curl/i.test(ua)) browser = "cURL / API";

  let os = "";
  if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  if (browser === "Browser" && !os) {
    return { label: ua.length > 56 ? `${ua.slice(0, 56)}…` : ua, isMobile };
  }
  return { label: os ? `${browser} · ${os}` : browser, isMobile };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pageRef = useRef<HTMLDivElement>(null);

  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const changePassword = useAuthStore((s) => s.changePassword);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const clearSession = useAuthStore((s) => s.clearSession);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const notify = useUiStore((s) => s.notify);
  const confirm = useUiStore((s) => s.confirm);

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const { data: workspace, isLoading } = useWorkspace();
  const updateMutation = useUpdateWorkspace();
  const { data: sessions = [], isLoading: sessionsLoading } = useAuthSessions(activeTab === "security");
  const revokeSessionMutation = useRevokeSession();

  useDocumentTitle(t("settings.title"));
  usePageEntrance(pageRef, [isLoading]);

  // Studio profile state
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [signature, setSignature] = useState("");
  const [defaultEmailLanguage, setDefaultEmailLanguage] = useState<"uk" | "en">("uk");
  const [defaultEmailTone, setDefaultEmailTone] = useState<"formal" | "friendly">("formal");
  const [deleting, setDeleting] = useState(false);

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setSiteUrl(workspace.siteUrl ?? "");
    setPortfolioUrl(workspace.portfolioUrl ?? "");
    setServicesText(workspace.services.join(", "));
    setSignature(workspace.signature);
    setDefaultEmailLanguage(workspace.defaultEmailLanguage);
    setDefaultEmailTone(workspace.defaultEmailTone);
  }, [workspace]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const services = servicesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        siteUrl: siteUrl.trim() || null,
        portfolioUrl: portfolioUrl.trim() || null,
        services,
        signature,
        defaultEmailLanguage,
        defaultEmailTone,
        uiTheme: theme,
        uiLanguage: language,
      });
      notify({ tone: "success", title: t("settings.saved") });
    } catch (err) {
      notify({
        tone: "error",
        title: err instanceof ApiError ? err.message : t("common.errorTitle"),
      });
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!evaluatePassword(newPassword).isValid) {
      notify({ tone: "error", title: t("auth.passwordError") });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({ tone: "error", title: t("settings.passwordMismatch") });
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      void qc.invalidateQueries({ queryKey: queryKeys.sessions });
      notify({ tone: "success", title: t("settings.passwordChanged") });
    } catch (err) {
      notify({
        tone: "error",
        title: err instanceof ApiError ? err.message : t("common.errorTitle"),
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (session: AuthSessionDto) => {
    try {
      await revokeSessionMutation.mutateAsync(session.id);
      notify({ tone: "success", title: t("settings.sessionRevoked") });
      if (session.isCurrent) {
        clearSession();
        navigate("/login", { replace: true });
      }
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleLogoutAll = async () => {
    const ok = await confirm({
      title: t("settings.logoutAllConfirmTitle"),
      message: t("settings.logoutAllConfirmMessage"),
      confirmLabel: t("settings.logoutAllButton"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;

    setLoggingOutAll(true);
    try {
      await logoutAll();
      notify({ tone: "info", title: t("settings.logoutAllSuccess") });
      navigate("/login", { replace: true });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
      setLoggingOutAll(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: t("settings.confirmDeleteTitle"),
      message: t("settings.confirmDeleteMessage"),
      confirmLabel: t("settings.deleteAccount"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteAccount();
      navigate("/login", { replace: true });
    } catch (err) {
      notify({
        tone: "error",
        title: err instanceof Error ? err.message : t("common.errorTitle"),
      });
      setDeleting(false);
    }
  };

  const tabOptions = [
    {
      value: "profile" as const,
      label: t("settings.tabProfile"),
      icon: <Buildings size={16} weight="bold" />,
    },
    {
      value: "security" as const,
      label: t("settings.tabSecurity"),
      icon: <ShieldCheck size={16} weight="bold" />,
    },
  ];

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <h1 className={styles.pageTitle}>{t("settings.title")}</h1>
        <p className={styles.pageSubtitle}>{t("settings.subtitle")}</p>
      </header>

      <div data-animate="page-section">
        <Tabs
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={t("settings.tabsLabel")}
        />
      </div>

      {activeTab === "profile" && (
        <>
          {isLoading || !workspace ? (
            <div className={styles.loadingStack}>
              <Skeleton variant="kpi" />
              <Skeleton variant="card" />
            </div>
          ) : (
            <div className={styles.sectionStack} data-animate="page-section">
              <Card>
                <CardHeader
                  title={t("settings.quotasTitle")}
                  icon={<Gauge size={20} weight="duotone" />}
                />
                <div className={styles.quotaGrid}>
                  <div className={styles.quotaItem}>
                    <div className={styles.quotaMeta}>
                      <span className={styles.quotaLabel}>{t("settings.monthlyAudits")}</span>
                      <span className={styles.quotaValue}>
                        {workspace.quotas.monthlyAuditsUsed} / {workspace.quotas.monthlyAuditQuota}
                      </span>
                    </div>
                    <ProgressBar
                      value={workspace.quotas.monthlyAuditsUsed}
                      max={workspace.quotas.monthlyAuditQuota}
                      tone="accent"
                      label={t("settings.monthlyAudits")}
                    />
                  </div>

                  <div className={styles.quotaItem}>
                    <div className={styles.quotaMeta}>
                      <span className={styles.quotaLabel}>{t("settings.concurrentCampaigns")}</span>
                      <span className={styles.quotaValue}>
                        {workspace.quotas.activeCampaigns} / {workspace.quotas.maxConcurrentCampaigns}
                      </span>
                    </div>
                    <ProgressBar
                      value={workspace.quotas.activeCampaigns}
                      max={workspace.quotas.maxConcurrentCampaigns}
                      tone="healthy"
                      label={t("settings.concurrentCampaigns")}
                    />
                  </div>
                </div>
              </Card>

              <form onSubmit={(e) => void handleSaveProfile(e)} className={styles.formStack}>
                <Card>
                  <CardHeader
                    title={t("settings.studioProfile")}
                    icon={<Buildings size={20} weight="duotone" />}
                  />

                  <div className={styles.gridTwo}>
                    <Field id="ws-name" label={t("settings.studioName")} required>
                      <Input
                        id="ws-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>

                    <Field id="ws-services" label={t("settings.services")}>
                      <Input
                        id="ws-services"
                        type="text"
                        value={servicesText}
                        onChange={(e) => setServicesText(e.target.value)}
                      />
                    </Field>

                    <Field id="ws-site" label={t("settings.siteUrl")}>
                      <Input
                        id="ws-site"
                        type="url"
                        placeholder="https://studio.example.com"
                        value={siteUrl}
                        onChange={(e) => setSiteUrl(e.target.value)}
                      />
                    </Field>

                    <Field id="ws-portfolio" label={t("settings.portfolioUrl")}>
                      <Input
                        id="ws-portfolio"
                        type="url"
                        placeholder="https://behance.net/studio"
                        value={portfolioUrl}
                        onChange={(e) => setPortfolioUrl(e.target.value)}
                      />
                    </Field>

                    <Field id="ws-email-lang" label={t("settings.defaultLang")}>
                      <Select
                        id="ws-email-lang"
                        value={defaultEmailLanguage}
                        onChange={(e) => setDefaultEmailLanguage(e.target.value as "uk" | "en")}
                      >
                        <option value="uk">Українська (uk)</option>
                        <option value="en">English (en)</option>
                      </Select>
                    </Field>

                    <Field id="ws-email-tone" label={t("settings.defaultTone")}>
                      <Select
                        id="ws-email-tone"
                        value={defaultEmailTone}
                        onChange={(e) =>
                          setDefaultEmailTone(e.target.value as "formal" | "friendly")
                        }
                      >
                        <option value="formal">{t("settings.formal")}</option>
                        <option value="friendly">{t("settings.friendly")}</option>
                      </Select>
                    </Field>
                  </div>

                  <div className={styles.sigField}>
                    <Field id="ws-signature" label={t("settings.signature")}>
                      <Textarea
                        id="ws-signature"
                        rows={3}
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                      />
                    </Field>
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title={t("settings.appearanceTitle")}
                    icon={<Palette size={20} weight="duotone" />}
                  />
                  <div className={styles.gridTwo}>
                    <Field id="ws-theme" label={t("controls.theme")}>
                      <Select
                        id="ws-theme"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value as ThemeChoice)}
                      >
                        <option value="system">{t("controls.themeSystem")}</option>
                        <option value="light">{t("controls.themeLight")}</option>
                        <option value="dark">{t("controls.themeDark")}</option>
                      </Select>
                    </Field>

                    <Field id="ws-ui-lang" label={t("controls.language")}>
                      <Select
                        id="ws-ui-lang"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                      >
                        <option value="uk">Українська</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                  </div>

                  <div className={styles.saveBar}>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={updateMutation.isPending}
                      icon={<FloppyDisk size={18} weight="bold" />}
                    >
                      {t("settings.saveButton")}
                    </Button>
                  </div>
                </Card>
              </form>
            </div>
          )}
        </>
      )}

      {activeTab === "security" && (
        <div className={styles.sectionStack}>
          <Card>
            <CardHeader
              title={t("settings.changePasswordTitle")}
              subtitle={t("settings.changePasswordSubtitle")}
              icon={<Key size={20} weight="duotone" />}
            />
            <form onSubmit={(e) => void handleChangePassword(e)} className={styles.passwordForm}>
              <Field id="sec-current-pw" label={t("settings.currentPassword")} required>
                <Input
                  id="sec-current-pw"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>

              <div className={styles.gridTwo}>
                <Field
                  id="sec-new-pw"
                  label={t("settings.newPassword")}
                  hint={t("auth.passwordRules")}
                  required
                >
                  <Input
                    id="sec-new-pw"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>

                <Field id="sec-confirm-pw" label={t("settings.confirmPassword")} required>
                  <Input
                    id="sec-confirm-pw"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
              </div>

              <PasswordStrengthMeter password={newPassword} />

              <div className={styles.saveBar}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={changingPassword}
                  icon={<ShieldCheck size={18} weight="bold" />}
                >
                  {t("settings.changePasswordButton")}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title={t("settings.sessionsTitle")}
              subtitle={t("settings.sessionsSubtitle")}
              icon={<Desktop size={20} weight="duotone" />}
              action={
                <Button
                  variant="danger"
                  size="sm"
                  loading={loggingOutAll}
                  icon={<SignOut size={16} weight="bold" />}
                  onClick={() => void handleLogoutAll()}
                >
                  {t("settings.logoutAllButton")}
                </Button>
              }
            />

            {sessionsLoading ? (
              <Skeleton variant="row" count={3} />
            ) : sessions.length === 0 ? (
              <p className={styles.emptyHint}>{t("settings.noSessions")}</p>
            ) : (
              <ul className={styles.sessionList}>
                {sessions.map((s) => {
                  const info = describeUserAgent(s.userAgent, t("settings.unknownDevice"));
                  return (
                    <li key={s.id} className={styles.sessionItem}>
                      <span className={styles.sessionIcon} aria-hidden="true">
                        {info.isMobile ? (
                          <DeviceMobile size={20} weight="duotone" />
                        ) : (
                          <Desktop size={20} weight="duotone" />
                        )}
                      </span>
                      <div className={styles.sessionInfo}>
                        <div className={styles.sessionTop}>
                          <span className={styles.sessionDevice}>{info.label}</span>
                          {s.isCurrent && (
                            <Badge tone="accent">{t("settings.currentSession")}</Badge>
                          )}
                        </div>
                        <div className={styles.sessionMeta}>
                          {s.ipAddress && <span>IP: {s.ipAddress}</span>}
                          <span>
                            {t("settings.lastUsed")}:{" "}
                            {new Date(s.lastUsedAt ?? s.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={revokeSessionMutation.isPending}
                        onClick={() => void handleRevokeSession(s)}
                      >
                        {t("settings.revokeSession")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card tone="danger">
            <CardHeader
              title={t("settings.dangerZone")}
              subtitle={t("settings.dangerText")}
              icon={<WarningOctagon size={20} weight="duotone" />}
            />
            <Button
              variant="danger"
              loading={deleting}
              icon={<Trash size={18} weight="bold" />}
              onClick={() => void handleDeleteAccount()}
            >
              {t("settings.deleteAccount")}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
