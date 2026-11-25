import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AddressBook,
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Browser,
  ChartBarHorizontal,
  Check,
  ClockCounterClockwise,
  Copy,
  EnvelopeSimple,
  FilePdf,
  ListChecks,
  PencilSimple,
  Phone,
  Plus,
  ShareNetwork,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { api, type ContactDto, type ReportShareLinkDto } from "@/api/client";
import { useLeadDetail, useSiteReport, useSiteReportMutations } from "@/hooks/queries/useSiteReport";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { useClipboard } from "@/hooks/useClipboard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import {
  Badge,
  CheckResultBadge,
  LeadStatusBadge,
  NeedLevelBadge,
} from "@/components/ui/Badge/Badge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ScoreGauge } from "@/components/ui/ScoreGauge/ScoreGauge";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { ScreenshotGallery, type ScreenshotItem } from "@/components/ui/ScreenshotGallery/ScreenshotGallery";
import { EvidenceViewer } from "@/components/ui/EvidenceViewer/EvidenceViewer";
import { AlertBanner, Field, Input, Select, Textarea } from "@/components/ui/FormField/FormField";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./SiteReportPage.module.scss";

type ReportTab = "findings" | "categories" | "contacts" | "crm";

export function SiteReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageRef = useRef<HTMLDivElement>(null);

  const notify = useUiStore((s) => s.notify);
  const confirm = useUiStore((s) => s.confirm);
  const { isDownloading, download } = useBlobDownload();
  const { copied, copy } = useClipboard();

  const versionParam = searchParams.get("version");
  const requestedVersion = versionParam ? Number(versionParam) : undefined;
  const validVersion = requestedVersion && Number.isInteger(requestedVersion) && requestedVersion > 0
    ? requestedVersion
    : undefined;

  const { data: report, isLoading, error } = useSiteReport(id, validVersion);
  const { data: lead } = useLeadDetail(id);
  const mutations = useSiteReportMutations(id);

  const [maxKnownVersion, setMaxKnownVersion] = useState(1);
  useEffect(() => {
    if (report && report.auditVersion > maxKnownVersion) {
      setMaxKnownVersion(report.auditVersion);
    }
  }, [report, maxKnownVersion]);

  const [activeTab, setActiveTab] = useState<ReportTab>("findings");
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [shareLink, setShareLink] = useState<ReportShareLinkDto | null>(null);

  // Contact creation & inline edit state
  const [contactKind, setContactKind] = useState<"Email" | "Phone" | "ContactForm">("Email");
  const [contactValue, setContactValue] = useState("");
  const [contactSource, setContactSource] = useState("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<"Email" | "Phone" | "ContactForm">("Email");
  const [editValue, setEditValue] = useState("");
  const [editSource, setEditSource] = useState("");

  // CRM tags & events state
  const [tagsInput, setTagsInput] = useState("");
  const [eventType, setEventType] = useState<"Note" | "Reminder">("Note");
  const [eventNote, setEventNote] = useState("");
  const [eventDueAt, setEventDueAt] = useState("");

  useEffect(() => {
    if (lead) {
      setTagsInput(lead.tags.join(", "));
    }
  }, [lead]);

  useDocumentTitle(report ? `${report.domain} — ${t("report.title")}` : t("report.title"));
  usePageEntrance(pageRef, [isLoading]);

  const screenshots = useMemo<ScreenshotItem[]>(() => {
    if (!report) return [];
    const seen = new Set<string>();
    const collected: ScreenshotItem[] = [];

    const desktopRef = report.desktopScreenshotRef ?? `audits/${report.auditId}/desktop.png`;
    const mobileRef = report.mobileScreenshotRef ?? `audits/${report.auditId}/mobile.png`;

    if (desktopRef) {
      seen.add(desktopRef);
      collected.push({
        id: `${report.auditId}-desktop`,
        fileRef: desktopRef,
        variant: "desktop",
        label: t("report.desktopView"),
      });
    }

    if (mobileRef) {
      seen.add(mobileRef);
      collected.push({
        id: `${report.auditId}-mobile`,
        fileRef: mobileRef,
        variant: "mobile",
        label: t("report.mobileView"),
      });
    }

    for (const f of report.findings) {
      for (const ev of f.evidences) {
        if (ev.kind !== "Screenshot" || !ev.fileRef || seen.has(ev.fileRef)) continue;
        seen.add(ev.fileRef);
        const lower = ev.fileRef.toLowerCase();
        const isMobile = lower.includes("mobile") || lower.includes("390");
        collected.push({
          id: ev.id,
          fileRef: ev.fileRef,
          variant: isMobile ? "mobile" : "desktop",
          label: isMobile ? t("report.mobileView") : t("report.desktopView"),
        });
      }
    }
    return collected;
  }, [report, t]);

  const isUk = i18n.language === "uk";
  const problemFindings = useMemo(
    () => (report?.findings ?? []).filter((f) => f.result === "Fail" || f.result === "Warning"),
    [report]
  );
  const visibleFindings = showAllFindings ? (report?.findings ?? []) : problemFindings;

  const handleVersionChange = (v: number) => {
    const next = new URLSearchParams(searchParams);
    if (v === maxKnownVersion) next.delete("version");
    else next.set("version", String(v));
    setSearchParams(next, { replace: true });
  };

  const handlePdfDownload = () => {
    if (!id || !report) return;
    void download(
      () => api.downloadReportPdf(id, i18n.language, report.auditVersion),
      `${report.domain}-audit-v${report.auditVersion}.pdf`,
      undefined,
      t("report.pdfError")
    );
  };

  const handleReaudit = async () => {
    try {
      await mutations.reaudit.mutateAsync();
      notify({ tone: "success", title: t("report.reauditQueued") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleShare = async () => {
    try {
      const link = await mutations.createShareLink.mutateAsync(report?.auditVersion);
      setShareLink(link);
      const fullUrl = `${window.location.origin}${link.publicPath}`;
      await copy(fullUrl);
      notify({ tone: "success", title: t("report.shareCreated") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleRevokeShare = async () => {
    if (!shareLink) return;
    try {
      await mutations.revokeShareLink.mutateAsync(shareLink.id);
      setShareLink(null);
      notify({ tone: "info", title: t("report.shareRevoked") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleAddContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!contactValue.trim()) return;
    try {
      await mutations.createContact.mutateAsync({
        kind: contactKind,
        value: contactValue.trim(),
        sourcePage: contactSource.trim() || undefined,
      });
      setContactValue("");
      setContactSource("");
      notify({ tone: "success", title: t("report.contactAdded") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const startEditContact = (c: ContactDto) => {
    setEditingContactId(c.id);
    setEditKind(c.kind);
    setEditValue(c.value);
    setEditSource(c.sourcePage ?? "");
  };

  const handleSaveContactEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingContactId || !editValue.trim()) return;
    try {
      await mutations.updateContact.mutateAsync({
        contactId: editingContactId,
        payload: {
          kind: editKind,
          value: editValue.trim(),
          sourcePage: editSource.trim() || undefined,
        },
      });
      setEditingContactId(null);
      notify({ tone: "success", title: t("report.contactUpdated") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleDeleteContact = async (c: ContactDto) => {
    const ok = await confirm({
      title: t("report.deleteContactTitle"),
      message: t("report.deleteContactMessage", { value: c.value }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.deleteContact.mutateAsync(c.id);
      notify({ tone: "success", title: t("report.contactDeleted") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleStatusChange = async (nextStatus: string) => {
    try {
      await mutations.updateStatus.mutateAsync(nextStatus);
      notify({ tone: "success", title: t("report.statusUpdated") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleSaveTags = async (e: FormEvent) => {
    e.preventDefault();
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await mutations.updateTags.mutateAsync(tags);
      notify({ tone: "success", title: t("report.tagsSaved") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleAddEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!eventNote.trim()) return;
    try {
      await mutations.createEvent.mutateAsync({
        type: eventType,
        note: eventNote.trim(),
        dueAt: eventType === "Reminder" && eventDueAt ? new Date(eventDueAt).toISOString() : null,
      });
      setEventNote("");
      setEventDueAt("");
      notify({ tone: "success", title: t("report.eventAdded") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton variant="title" />
        <div className={styles.heroGrid}>
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
        <Skeleton variant="row" count={4} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={styles.page}>
        <AlertBanner tone="error">
          {error instanceof Error ? error.message : t("common.errorTitle")}
        </AlertBanner>
      </div>
    );
  }

  const contacts = lead?.contacts ?? report.contacts;
  const tabOptions = [
    {
      value: "findings" as const,
      label: t("report.tabFindings"),
      icon: <ListChecks size={16} weight="bold" />,
      badge: problemFindings.length,
    },
    {
      value: "categories" as const,
      label: t("report.tabCategories"),
      icon: <ChartBarHorizontal size={16} weight="bold" />,
      badge: report.categoryComparisons.length,
    },
    {
      value: "contacts" as const,
      label: t("report.tabContacts"),
      icon: <AddressBook size={16} weight="bold" />,
      badge: contacts.length,
    },
    {
      value: "crm" as const,
      label: t("report.tabCrm"),
      icon: <ClockCounterClockwise size={16} weight="bold" />,
      badge: lead?.events.length ?? 0,
    },
  ];

  const versionList = Array.from({ length: maxKnownVersion }, (_, i) => maxKnownVersion - i);
  const fullShareUrl = shareLink ? `${window.location.origin}${shareLink.publicPath}` : "";

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <div className={styles.headerLeft}>
          {lead && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} weight="bold" />}
              onClick={() => navigate(`/campaigns/${lead.campaignId}`)}
            >
              {lead.campaignName}
            </Button>
          )}
          <div className={styles.domainRow}>
            <h1 className={styles.pageTitle}>{report.domain}</h1>
            <a
              href={report.url}
              target="_blank"
              rel="noreferrer"
              className={styles.externalLink}
              aria-label={report.url}
            >
              <ArrowSquareOut size={18} weight="bold" aria-hidden="true" />
            </a>
            {lead && <LeadStatusBadge status={lead.leadStatus} />}
          </div>
          {versionList.length > 1 && (
            <div className={styles.versionRow}>
              <span className={styles.versionLabel}>{t("report.auditVersion")}:</span>
              <Select
                aria-label={t("report.auditVersion")}
                value={String(report.auditVersion)}
                onChange={(e) => handleVersionChange(Number(e.target.value))}
                className={styles.versionSelect}
              >
                {versionList.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            loading={isDownloading}
            icon={<FilePdf size={16} weight="bold" />}
            onClick={handlePdfDownload}
          >
            {t("report.exportPdf")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={mutations.createShareLink.isPending}
            icon={<ShareNetwork size={16} weight="bold" />}
            onClick={() => void handleShare()}
          >
            {t("report.shareLink")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={mutations.reaudit.isPending}
            icon={<ArrowClockwise size={16} weight="bold" />}
            onClick={() => void handleReaudit()}
          >
            {t("report.reaudit")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<EnvelopeSimple size={16} weight="bold" />}
            onClick={() => navigate(`/leads/${report.siteId}/email`)}
          >
            {t("report.draftEmail")}
          </Button>
        </div>
      </header>

      {shareLink && (
        <AlertBanner tone="info" icon={<ShareNetwork size={18} weight="bold" />}>
          <div className={styles.shareBanner}>
            <div className={styles.shareUrlWrap}>
              <strong>{t("report.shareCreated")}:</strong>{" "}
              <a href={shareLink.publicPath} target="_blank" rel="noreferrer" className={styles.shareLink}>
                {fullShareUrl}
              </a>
              <span className={styles.shareExpiry}>
                ({t("report.shareExpires")}: {new Date(shareLink.expiresAt).toLocaleDateString()})
              </span>
            </div>
            <div className={styles.shareActions}>
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
                onClick={() => void copy(fullShareUrl)}
              >
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={mutations.revokeShareLink.isPending}
                onClick={() => void handleRevokeShare()}
              >
                {t("report.revokeShare")}
              </Button>
            </div>
          </div>
        </AlertBanner>
      )}

      {report.auditStatus === "Partial" && (
        <AlertBanner tone="warning" icon={<Warning size={18} weight="bold" />}>
          {t("report.partialWarning")}
        </AlertBanner>
      )}

      <div className={styles.heroGrid} data-animate="page-section">
        <Card padding="lg" className={styles.scoreCard}>
          <div className={styles.scoreHero}>
            <ScoreGauge
              score={report.needScore}
              level={report.level}
              label={t("report.needScore")}
            />
            <div className={styles.scoreInfo}>
              <div className={styles.scoreBadges}>
                <NeedLevelBadge level={report.level} />
                <Badge tone="neutral" mono>
                  v{report.auditVersion}
                </Badge>
              </div>
              <p className={styles.summaryText}>{report.summary}</p>
            </div>
          </div>

          <dl className={styles.metaStrip}>
            <div className={styles.metaCell}>
              <dt>{t("report.campaignMedian")}</dt>
              <dd>{report.campaignMedianScore !== null ? report.campaignMedianScore.toFixed(1) : "—"}</dd>
            </div>
            <div className={styles.metaCell}>
              <dt>{t("report.coverage")}</dt>
              <dd>{Math.round(report.coverageRatio * 100)}%</dd>
            </div>
            <div className={styles.metaCell}>
              <dt>{t("report.auditedAt")}</dt>
              <dd>
                {report.auditedAt ? new Date(report.auditedAt).toLocaleDateString() : "—"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card padding="md">
          <CardHeader title={t("report.screenshotsTitle")} />
          <ScreenshotGallery screenshots={screenshots} domain={report.domain} />
        </Card>
      </div>

      <section className={styles.tabsSection} data-animate="page-section">
        <Tabs
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={t("report.tabsLabel")}
        />

        {activeTab === "findings" && (
          <div role="tabpanel" className={styles.tabPanel}>
            <div className={styles.findingsToolbar}>
              <div className={styles.findingsStats}>
                <strong>{problemFindings.length}</strong> {t("report.problemsCount")} ·{" "}
                {report.findings.length} {t("report.allChecks").toLowerCase()}
              </div>
              <Tabs
                variant="segmented"
                ariaLabel={t("report.findingsTitle")}
                value={showAllFindings ? "all" : "problems"}
                onChange={(v) => setShowAllFindings(v === "all")}
                options={[
                  { value: "problems", label: t("report.onlyProblems") },
                  { value: "all", label: t("report.allChecks") },
                ]}
              />
            </div>

            <div className={styles.findingsList}>
              {visibleFindings.map((f) => (
                <Card key={f.id} as="article" padding="md" className={styles.findingCard}>
                  <div className={styles.findingHead}>
                    <div className={styles.findingTitleGroup}>
                      <CheckResultBadge result={f.result} />
                      <Badge tone="neutral" mono>
                        {f.checkId}
                      </Badge>
                      <h3 className={styles.findingTitle}>{isUk ? f.titleUk : f.titleEn}</h3>
                    </div>
                    {f.scoreContribution > 0 && (
                      <Badge tone="weak" mono>
                        +{f.scoreContribution}
                      </Badge>
                    )}
                  </div>

                  {(isUk ? f.descriptionUk : f.descriptionEn) && (
                    <p className={styles.findingDesc}>
                      {isUk ? f.descriptionUk : f.descriptionEn}
                    </p>
                  )}

                  <dl className={styles.findingMeta}>
                    {f.value && (
                      <div>
                        <dt>{t("report.measured")}</dt>
                        <dd className={styles.monoVal}>{f.value}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("report.impact")}</dt>
                      <dd className={styles.monoVal}>{f.impact}/5</dd>
                    </div>
                    <div>
                      <dt>{t("report.effort")}</dt>
                      <dd className={styles.monoVal}>{f.effort}/5</dd>
                    </div>
                    <div>
                      <dt>{t("report.service")}</dt>
                      <dd>{f.service}</dd>
                    </div>
                  </dl>

                  <EvidenceViewer evidences={f.evidences} domain={report.domain} />
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === "categories" && (
          <div role="tabpanel" className={styles.tabPanel}>
            <Card>
              <CardHeader title={t("report.categoriesTitle")} />
              <div className={styles.catList}>
                {report.categoryComparisons.map((cat) => {
                  const sitePct = Math.round(cat.siteScore * 100);
                  const medPct =
                    cat.campaignMedianScore !== null ? Math.round(cat.campaignMedianScore * 100) : null;
                  return (
                    <div key={cat.category} className={styles.catRow}>
                      <div className={styles.catTop}>
                        <span className={styles.catName}>{isUk ? cat.nameUk : cat.nameEn}</span>
                        <div className={styles.catNumbers}>
                          <span>
                            {t("report.siteDefectCol")}: <strong>{sitePct}%</strong>
                          </span>
                          <span className={styles.catMedian}>
                            {t("report.medianCol")}: {medPct !== null ? `${medPct}%` : "—"}
                          </span>
                        </div>
                      </div>
                      <div className={styles.catBars}>
                        <ProgressBar
                          value={sitePct}
                          max={100}
                          tone={sitePct >= 60 ? "critical" : sitePct >= 35 ? "weak" : "accent"}
                          size="md"
                          label={`${isUk ? cat.nameUk : cat.nameEn}: ${sitePct}%`}
                        />
                        {medPct !== null && (
                          <ProgressBar
                            value={medPct}
                            max={100}
                            tone="neutral"
                            size="sm"
                            label={`${t("report.medianCol")}: ${medPct}%`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {activeTab === "contacts" && (
          <div role="tabpanel" className={styles.tabPanel}>
            <div className={styles.twoCol}>
              <Card>
                <CardHeader title={t("report.contactsTitle")} />
                {contacts.length === 0 ? (
                  <p className={styles.emptyHint}>{t("report.noContacts")}</p>
                ) : (
                  <ul className={styles.contactList}>
                    {contacts.map((c) => {
                      const isEditing = editingContactId === c.id;
                      if (isEditing) {
                        return (
                          <li key={c.id} className={styles.contactEditItem}>
                            <form
                              onSubmit={(e) => void handleSaveContactEdit(e)}
                              className={styles.contactEditForm}
                            >
                              <Select
                                aria-label={t("report.contactKind")}
                                value={editKind}
                                onChange={(e) =>
                                  setEditKind(e.target.value as "Email" | "Phone" | "ContactForm")
                                }
                              >
                                <option value="Email">{t("badges.contactKind.Email")}</option>
                                <option value="Phone">{t("badges.contactKind.Phone")}</option>
                                <option value="ContactForm">
                                  {t("badges.contactKind.ContactForm")}
                                </option>
                              </Select>
                              <Input
                                aria-label={t("report.contactValue")}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                required
                              />
                              <Input
                                aria-label={t("report.contactSource")}
                                placeholder={t("report.contactSource")}
                                value={editSource}
                                onChange={(e) => setEditSource(e.target.value)}
                              />
                              <div className={styles.editActions}>
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="primary"
                                  loading={mutations.updateContact.isPending}
                                >
                                  {t("report.saveContact")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingContactId(null)}
                                >
                                  {t("common.cancel")}
                                </Button>
                              </div>
                            </form>
                          </li>
                        );
                      }

                      const kindIcon =
                        c.kind === "Email" ? (
                          <EnvelopeSimple size={18} weight="duotone" />
                        ) : c.kind === "Phone" ? (
                          <Phone size={18} weight="duotone" />
                        ) : (
                          <Browser size={18} weight="duotone" />
                        );

                      return (
                        <li key={c.id} className={styles.contactItem}>
                          <span className={styles.contactIcon} aria-hidden="true">
                            {kindIcon}
                          </span>
                          <div className={styles.contactBody}>
                            <div className={styles.contactMain}>
                              <span className={styles.contactVal}>{c.value}</span>
                              {c.isManual && (
                                <Badge tone="neutral">{t("report.manualBadge")}</Badge>
                              )}
                            </div>
                            {c.sourcePage && (
                              <span className={styles.contactSrc}>{c.sourcePage}</span>
                            )}
                          </div>
                          <div className={styles.contactBtns}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<PencilSimple size={16} />}
                              aria-label={t("report.editContact")}
                              onClick={() => startEditContact(c)}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash size={16} />}
                              aria-label={t("common.delete")}
                              onClick={() => void handleDeleteContact(c)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title={t("report.addContact")} />
                <form onSubmit={(e) => void handleAddContact(e)} className={styles.stackForm}>
                  <Field id="c-kind" label={t("report.contactKind")}>
                    <Select
                      id="c-kind"
                      value={contactKind}
                      onChange={(e) =>
                        setContactKind(e.target.value as "Email" | "Phone" | "ContactForm")
                      }
                    >
                      <option value="Email">{t("badges.contactKind.Email")}</option>
                      <option value="Phone">{t("badges.contactKind.Phone")}</option>
                      <option value="ContactForm">{t("badges.contactKind.ContactForm")}</option>
                    </Select>
                  </Field>

                  <Field id="c-val" label={t("report.contactValue")} required>
                    <Input
                      id="c-val"
                      required
                      value={contactValue}
                      onChange={(e) => setContactValue(e.target.value)}
                      placeholder="info@company.ua"
                    />
                  </Field>

                  <Field id="c-src" label={t("report.contactSource")}>
                    <Input
                      id="c-src"
                      value={contactSource}
                      onChange={(e) => setContactSource(e.target.value)}
                      placeholder="https://company.ua/contacts"
                    />
                  </Field>

                  <Button
                    type="submit"
                    variant="primary"
                    loading={mutations.createContact.isPending}
                    icon={<Plus size={16} weight="bold" />}
                  >
                    {t("report.addContact")}
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "crm" && (
          <div role="tabpanel" className={styles.tabPanel}>
            <div className={styles.twoCol}>
              <Card>
                <CardHeader title={t("report.crmTitle")} />
                <div className={styles.stackForm}>
                  <Field id="lead-status" label={t("report.crmStatus")}>
                    <Select
                      id="lead-status"
                      value={lead?.leadStatus ?? "New"}
                      onChange={(e) => void handleStatusChange(e.target.value)}
                    >
                      <option value="New">{t("badges.leadStatus.New")}</option>
                      <option value="DraftReady">{t("badges.leadStatus.DraftReady")}</option>
                      <option value="Sent">{t("badges.leadStatus.Sent")}</option>
                      <option value="Replied">{t("badges.leadStatus.Replied")}</option>
                      <option value="Rejected">{t("badges.leadStatus.Rejected")}</option>
                    </Select>
                  </Field>

                  <form onSubmit={(e) => void handleSaveTags(e)} className={styles.stackForm}>
                    <Field id="lead-tags" label={t("report.tagsLabel")}>
                      <Input
                        id="lead-tags"
                        placeholder={t("report.tagsPlaceholder")}
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                      />
                    </Field>
                    {lead && lead.tags.length > 0 && (
                      <div className={styles.tagChips}>
                        {lead.tags.map((tag) => (
                          <Badge key={tag} tone="accent">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Button
                      type="submit"
                      variant="secondary"
                      loading={mutations.updateTags.isPending}
                    >
                      {t("report.saveTags")}
                    </Button>
                  </form>
                </div>
              </Card>

              <Card>
                <CardHeader title={t("report.addEvent")} />
                <form onSubmit={(e) => void handleAddEvent(e)} className={styles.stackForm}>
                  <Field id="ev-type" label={t("report.noteType")}>
                    <Select
                      id="ev-type"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value as "Note" | "Reminder")}
                    >
                      <option value="Note">{t("badges.eventType.Note")}</option>
                      <option value="Reminder">{t("badges.eventType.Reminder")}</option>
                    </Select>
                  </Field>

                  <Field id="ev-note" label={t("report.noteText")} required>
                    <Textarea
                      id="ev-note"
                      rows={3}
                      required
                      placeholder={t("report.notePlaceholder")}
                      value={eventNote}
                      onChange={(e) => setEventNote(e.target.value)}
                    />
                  </Field>

                  {eventType === "Reminder" && (
                    <Field id="ev-due" label={t("report.dueAt")}>
                      <Input
                        id="ev-due"
                        type="datetime-local"
                        value={eventDueAt}
                        onChange={(e) => setEventDueAt(e.target.value)}
                      />
                    </Field>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    loading={mutations.createEvent.isPending}
                    icon={<Plus size={16} weight="bold" />}
                  >
                    {t("report.addEvent")}
                  </Button>
                </form>

                <div className={styles.timeline}>
                  {!lead || lead.events.length === 0 ? (
                    <p className={styles.emptyHint}>{t("report.noEvents")}</p>
                  ) : (
                    lead.events.map((ev) => (
                      <div key={ev.id} className={styles.timelineItem}>
                        <div className={styles.timelineHead}>
                          <Badge tone={ev.type === "Reminder" ? "moderate" : "neutral"}>
                            {t(`badges.eventType.${ev.type}`, { defaultValue: ev.type })}
                          </Badge>
                          <time className={styles.timelineTime}>
                            {new Date(ev.createdAt).toLocaleString()}
                          </time>
                        </div>
                        {ev.note && <p className={styles.timelineNote}>{ev.note}</p>}
                        {ev.dueAt && (
                          <span className={styles.timelineDue}>
                            {t("report.dueAt")}: {new Date(ev.dueAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
