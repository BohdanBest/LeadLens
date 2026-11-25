import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  FloppyDisk,
  PaperPlaneTilt,
  ShieldCheck,
  Sparkle,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { api, type EmailClaimDto, type EmailDraftDto } from "@/api/client";
import { useSiteReport } from "@/hooks/queries/useSiteReport";
import { useEmailDrafts, useEmailMutations } from "@/hooks/queries/useEmailDrafts";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useClipboard } from "@/hooks/useClipboard";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { Badge, ClaimStatusBadge } from "@/components/ui/Badge/Badge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { AlertBanner, Field, Input, Select, Textarea } from "@/components/ui/FormField/FormField";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./EmailEditorPage.module.scss";

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function EmailEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);

  const notify = useUiStore((s) => s.notify);
  const { copied, copy } = useClipboard();
  const { isDownloading, download } = useBlobDownload();

  const { data: report } = useSiteReport(id);
  const { data: drafts = [], isLoading } = useEmailDrafts(id);
  const mutations = useEmailMutations(id);

  const [language, setLanguage] = useState<"uk" | "en">(i18n.language === "en" ? "en" : "uk");
  const [tone, setTone] = useState<"formal" | "friendly">("formal");
  const [length, setLength] = useState<"short" | "medium">("short");
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);

  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [claims, setClaims] = useState<EmailClaimDto[]>([]);
  const [verifyWarnings, setVerifyWarnings] = useState<string[]>([]);

  useDocumentTitle(report ? `${report.domain} — ${t("email.title")}` : t("email.title"));
  usePageEntrance(pageRef, [isLoading]);

  const activeDraft: EmailDraftDto | null = useMemo(() => {
    if (drafts.length === 0) return null;
    return drafts.find((d) => d.id === activeDraftId) ?? drafts[0];
  }, [drafts, activeDraftId]);

  useEffect(() => {
    if (!activeDraft) return;
    setActiveDraftId(activeDraft.id);
    setSubject(activeDraft.subject);
    setBody(activeDraft.body);
    setClaims(activeDraft.claims);
    setVerifyWarnings([]);
  }, [activeDraft?.id, activeDraft?.updatedAt]);

  const problemFindings = useMemo(
    () => (report?.findings ?? []).filter((f) => f.result === "Fail" || f.result === "Warning"),
    [report]
  );

  const isUk = i18n.language === "uk";
  const words = countWords(body);
  const wordLimit = (activeDraft?.length ?? length) === "short" ? 130 : 220;
  const emailContact = report?.contacts.find((c) => c.kind === "Email")?.value ?? "";

  const toggleFinding = (findingId: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(findingId) ? prev.filter((x) => x !== findingId) : [...prev, findingId]
    );
  };

  const handleGenerate = async () => {
    try {
      const created = await mutations.generate.mutateAsync({
        findingIds: selectedFindingIds.length > 0 ? selectedFindingIds : undefined,
        language,
        tone,
        length,
      });
      setActiveDraftId(created.id);
      notify({ tone: "success", title: t("email.generatedToast") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleSaveAndVerify = async () => {
    if (!activeDraft) return;
    try {
      await mutations.save.mutateAsync({
        emailId: activeDraft.id,
        subject,
        body,
        claims: claims.map((c) => ({ id: c.id, findingId: c.findingId, text: c.text })),
      });
      const verification = await mutations.verify.mutateAsync(activeDraft.id);
      setClaims(verification.claims);
      setVerifyWarnings(verification.warnings);
      notify({
        tone: verification.allVerified ? "success" : "warning",
        title: verification.allVerified ? t("email.verifiedOk") : t("email.verifiedWarn"),
      });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleVerifyOnly = async () => {
    if (!activeDraft) return;
    try {
      const verification = await mutations.verify.mutateAsync(activeDraft.id);
      setClaims(verification.claims);
      setVerifyWarnings(verification.warnings);
      notify({
        tone: verification.allVerified ? "success" : "warning",
        title: verification.allVerified ? t("email.verifiedOk") : t("email.verifiedWarn"),
      });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleMarkSent = async () => {
    if (!activeDraft) return;
    try {
      await mutations.markSent.mutateAsync(activeDraft.id);
      notify({ tone: "success", title: t("email.sentSuccess") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleDownloadEml = () => {
    if (!activeDraft) return;
    void download(
      () => api.downloadEml(activeDraft.id),
      `${report?.domain ?? "draft"}-v${activeDraft.version}.eml`
    );
  };

  const mailtoHref = `mailto:${encodeURIComponent(emailContact)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} weight="bold" />}
          onClick={() => navigate(`/leads/${id}/report`)}
        >
          {t("email.backToReport")}
        </Button>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{t("email.title")}</h1>
          {report && (
            <Badge tone="neutral" mono>
              {report.domain}
            </Badge>
          )}
        </div>
        <p className={styles.pageSubtitle}>{t("email.subtitle")}</p>
      </header>

      <div className={styles.workspace} data-animate="page-section">
        <aside className={styles.sidebarCol}>
          <Card>
            <CardHeader
              title={t("email.generateTitle")}
              icon={<Sparkle size={20} weight="duotone" />}
            />
            <div className={styles.optionsStack}>
              <div className={styles.optionsRow}>
                <Field id="em-lang" label={t("email.language")}>
                  <Select
                    id="em-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "uk" | "en")}
                  >
                    <option value="uk">Українська</option>
                    <option value="en">English</option>
                  </Select>
                </Field>

                <Field id="em-tone" label={t("email.tone")}>
                  <Select
                    id="em-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as "formal" | "friendly")}
                  >
                    <option value="formal">{t("settings.formal")}</option>
                    <option value="friendly">{t("settings.friendly")}</option>
                  </Select>
                </Field>
              </div>

              <Field id="em-len" label={t("email.length")}>
                <Select
                  id="em-len"
                  value={length}
                  onChange={(e) => setLength(e.target.value as "short" | "medium")}
                >
                  <option value="short">{t("email.shortLen")}</option>
                  <option value="medium">{t("email.mediumLen")}</option>
                </Select>
              </Field>

              {problemFindings.length > 0 && (
                <div className={styles.problemsBlock}>
                  <span className={styles.problemsLabel}>{t("email.selectProblems")}</span>
                  <div className={styles.problemsList}>
                    {problemFindings.slice(0, 10).map((f) => (
                      <label key={f.id} className={styles.problemOption}>
                        <input
                          type="checkbox"
                          checked={selectedFindingIds.includes(f.id)}
                          onChange={() => toggleFinding(f.id)}
                          className={styles.checkbox}
                        />
                        <span className={styles.problemText}>
                          <span className={styles.problemCode}>{f.checkId}</span>
                          <span>{isUk ? f.titleUk : f.titleEn}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="primary"
                fullWidth
                loading={mutations.generate.isPending}
                icon={<Sparkle size={18} weight="bold" />}
                onClick={() => void handleGenerate()}
              >
                {t("email.generateBtn")}
              </Button>
            </div>
          </Card>
        </aside>

        <section className={styles.editorCol}>
          {isLoading ? (
            <Skeleton variant="card" />
          ) : !activeDraft ? (
            <EmptyState
              icon={<EnvelopeSimple size={28} weight="duotone" />}
              title={t("email.noDraftsTitle")}
              description={t("email.noDraftsDesc")}
              action={
                <Button
                  variant="primary"
                  loading={mutations.generate.isPending}
                  icon={<Sparkle size={18} weight="bold" />}
                  onClick={() => void handleGenerate()}
                >
                  {t("email.generateBtn")}
                </Button>
              }
            />
          ) : (
            <div className={styles.editorStack}>
              <Card padding="md">
                <div className={styles.versionHeader}>
                  <Tabs
                    variant="segmented"
                    ariaLabel={t("email.versions")}
                    value={activeDraft.id}
                    onChange={setActiveDraftId}
                    options={drafts.map((d) => ({
                      value: d.id,
                      label: `v${d.version}`,
                    }))}
                  />
                  <Badge
                    tone={
                      activeDraft.status === "Sent"
                        ? "healthy"
                        : activeDraft.status === "Ready"
                          ? "accent"
                          : "neutral"
                    }
                  >
                    {t(`badges.emailStatus.${activeDraft.status}`, {
                      defaultValue: activeDraft.status,
                    })}
                  </Badge>
                </div>

                <div className={styles.composeStack}>
                  <div className={styles.subjectWrap}>
                    <Field id="em-subject" label={t("email.subject")}>
                      <Input
                        id="em-subject"
                        maxLength={70}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </Field>
                    <span className={styles.counterText}>
                      {subject.length} / 70 {t("email.charsCount")}
                    </span>
                  </div>

                  <div className={styles.bodyWrap}>
                    <Field id="em-body" label={t("email.body")}>
                      <Textarea
                        id="em-body"
                        rows={11}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </Field>
                    <div className={styles.wordMeter}>
                      <div className={styles.wordMeta}>
                        <span>
                          {t("email.wordsCount")}: <strong>{words}</strong> / {wordLimit}{" "}
                          {t("email.wordsTarget")}
                        </span>
                      </div>
                      <ProgressBar
                        value={words}
                        max={wordLimit}
                        size="sm"
                        tone={words > wordLimit ? "critical" : words > wordLimit * 0.85 ? "moderate" : "accent"}
                        label={t("email.wordsCount")}
                      />
                    </div>
                  </div>

                  <div className={styles.editorToolbar}>
                    <div className={styles.primaryGroup}>
                      <Button
                        variant="primary"
                        loading={mutations.save.isPending || mutations.verify.isPending}
                        icon={<FloppyDisk size={16} weight="bold" />}
                        onClick={() => void handleSaveAndVerify()}
                      >
                        {t("email.saveVerify")}
                      </Button>
                      <Button
                        variant="secondary"
                        loading={mutations.verify.isPending}
                        icon={<ShieldCheck size={16} weight="bold" />}
                        onClick={() => void handleVerifyOnly()}
                      >
                        {t("email.verifyOnly")}
                      </Button>
                    </div>

                    <div className={styles.exportGroup}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={copied ? <Check size={15} weight="bold" /> : <Copy size={15} weight="bold" />}
                        onClick={() => void copy(`${subject}\n\n${body}`)}
                      >
                        {copied ? t("email.copied") : t("email.copyBtn")}
                      </Button>
                      <a href={mailtoHref} className={styles.mailtoLink}>
                        <EnvelopeSimple size={15} weight="bold" aria-hidden="true" />
                        <span>{t("email.mailtoBtn")}</span>
                      </a>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={isDownloading}
                        icon={<DownloadSimple size={15} weight="bold" />}
                        onClick={handleDownloadEml}
                      >
                        {t("email.emlBtn")}
                      </Button>
                      <Button
                        variant="soft"
                        size="sm"
                        loading={mutations.markSent.isPending}
                        icon={<PaperPlaneTilt size={15} weight="bold" />}
                        onClick={() => void handleMarkSent()}
                      >
                        {t("email.markSentBtn")}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={t("email.claimsTitle")}
                  icon={<ShieldCheck size={20} weight="duotone" />}
                />

                {verifyWarnings.length > 0 && (
                  <div className={styles.warningsStack}>
                    {verifyWarnings.map((w, i) => (
                      <AlertBanner key={i} tone="warning" icon={<Warning size={16} weight="bold" />}>
                        {w}
                      </AlertBanner>
                    ))}
                  </div>
                )}

                {claims.length === 0 ? (
                  <p className={styles.emptyHint}>{t("email.noClaims")}</p>
                ) : (
                  <ul className={styles.claimList}>
                    {claims.map((claim, idx) => (
                      <li key={claim.id || idx} className={styles.claimCard}>
                        <div className={styles.claimTop}>
                          <div className={styles.claimBadges}>
                            <ClaimStatusBadge status={claim.verificationStatus} />
                            {claim.checkId && (
                              <Badge tone="neutral" mono>
                                {claim.checkId}
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash size={15} />}
                            aria-label={t("email.removeClaim")}
                            onClick={() =>
                              setClaims((prev) => prev.filter((_, i) => i !== idx))
                            }
                          />
                        </div>
                        <p className={styles.claimText}>{claim.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
