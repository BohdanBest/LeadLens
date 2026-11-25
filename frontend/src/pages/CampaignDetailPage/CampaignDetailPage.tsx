import { useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowClockwise,
  ArrowLeft,
  ChartPieSlice,
  EnvelopeSimple,
  FileText,
  Globe,
  Pause,
  Play,
  Pulse,
  StopCircle,
} from "@phosphor-icons/react";
import { useCampaignControls, useCampaignDetail } from "@/hooks/queries/useCampaignDetail";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useCountUp } from "@/hooks/motion/useCountUp";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import {
  Badge,
  CampaignStatusBadge,
  LeadStatusBadge,
  NeedLevelBadge,
  SiteStatusBadge,
} from "@/components/ui/Badge/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import { AlertBanner } from "@/components/ui/FormField/FormField";
import styles from "./CampaignDetailPage.module.scss";

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useUiStore((s) => s.notify);
  const confirm = useUiStore((s) => s.confirm);
  const pageRef = useRef<HTMLDivElement>(null);

  const { data: campaign, isLoading, error } = useCampaignDetail(id);
  const { pause, resume, retry, cancel } = useCampaignControls(id);

  useDocumentTitle(campaign?.name ?? t("campaigns.title"));
  usePageEntrance(pageRef, [isLoading]);

  const animatedAvg = useCountUp(campaign?.averageNeedScore ?? 0, 1, 0.75);

  const handleAction = async (fn: () => Promise<unknown>, successText?: string) => {
    try {
      await fn();
      if (successText) notify({ tone: "success", title: successText });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: t("campaigns.cancelConfirmTitle"),
      message: t("campaigns.cancelConfirmMessage"),
      confirmLabel: t("campaigns.cancel"),
      cancelLabel: t("common.back"),
      danger: true,
    });
    if (!ok) return;
    await handleAction(() => cancel.mutateAsync());
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton variant="title" />
        <Skeleton variant="kpi" />
        <Skeleton variant="row" count={5} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className={styles.page}>
        <AlertBanner tone="error">
          {error instanceof Error ? error.message : t("common.errorTitle")}
        </AlertBanner>
      </div>
    );
  }

  const isActive = campaign.status === "Discovering" || campaign.status === "Auditing";
  const p = campaign.progress;
  const totalTarget = Math.max(1, p.reachable || p.found);
  const completedCount = p.audited + p.failed;
  const pct = p.found > 0 ? Math.min(100, Math.round((completedCount / totalTarget) * 100)) : 0;

  const dist = campaign.needDistribution;
  const distTotal = Math.max(1, dist.healthy + dist.moderate + dist.weak + dist.critical);

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <div className={styles.titleBlock}>
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={16} weight="bold" />}
            onClick={() => navigate("/campaigns")}
          >
            {t("campaigns.title")}
          </Button>
          <div className={styles.titleRow}>
            <h1 className={styles.pageTitle}>{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className={styles.metaText}>
            {campaign.niche}
            {campaign.region ? ` · ${campaign.region}` : ""} · {campaign.profileKey} v
            {campaign.profileVersion}
          </p>
        </div>

        <div className={styles.controls}>
          {isActive && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Pause size={16} weight="bold" />}
              loading={pause.isPending}
              onClick={() => void handleAction(() => pause.mutateAsync())}
            >
              {t("campaigns.pause")}
            </Button>
          )}
          {campaign.status === "Paused" && (
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={16} weight="bold" />}
              loading={resume.isPending}
              onClick={() => void handleAction(() => resume.mutateAsync())}
            >
              {t("campaigns.resume")}
            </Button>
          )}
          {p.failed > 0 && (
            <Button
              variant="soft"
              size="sm"
              icon={<ArrowClockwise size={16} weight="bold" />}
              loading={retry.isPending}
              onClick={() => void handleAction(() => retry.mutateAsync())}
            >
              {t("campaigns.retry")} ({p.failed})
            </Button>
          )}
          {campaign.status !== "Completed" && campaign.status !== "Cancelled" && (
            <Button
              variant="danger"
              size="sm"
              icon={<StopCircle size={16} weight="bold" />}
              loading={cancel.isPending}
              onClick={() => void handleCancel()}
            >
              {t("campaigns.cancel")}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.overviewGrid} data-animate="page-section">
        <Card>
          <CardHeader
            title={t("campaigns.progressTitle")}
            icon={<Pulse size={20} weight="duotone" />}
            action={<span className={styles.pctBadge}>{pct}%</span>}
          />
          <ProgressBar
            value={completedCount}
            max={totalTarget}
            tone={p.failed > 0 && p.audited === 0 ? "critical" : "accent"}
            size="lg"
            label={t("campaigns.progressTitle")}
          />
          <dl className={styles.statsRow}>
            <div className={styles.statItem}>
              <dt>{t("campaigns.found")}</dt>
              <dd>{p.found}</dd>
            </div>
            <div className={styles.statItem}>
              <dt>{t("campaigns.reachable")}</dt>
              <dd>{p.reachable}</dd>
            </div>
            <div className={styles.statItem}>
              <dt>{t("campaigns.audited")}</dt>
              <dd className={styles.statHealthy}>{p.audited}</dd>
            </div>
            <div className={styles.statItem}>
              <dt>{t("campaigns.failed")}</dt>
              <dd className={p.failed > 0 ? styles.statCritical : ""}>{p.failed}</dd>
            </div>
            <div className={styles.statItem}>
              <dt>{t("campaigns.excluded")}</dt>
              <dd>{p.excluded}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title={t("campaigns.summaryTitle")}
            icon={<ChartPieSlice size={20} weight="duotone" />}
          />
          <div className={styles.summaryTop}>
            <span className={styles.avgLabel}>{t("campaigns.avgNeedScore")}</span>
            <span className={styles.avgValue}>
              {campaign.averageNeedScore !== null ? animatedAvg.toFixed(1) : "—"}
            </span>
          </div>
          <div className={styles.distList}>
            <div className={styles.distRow}>
              <span className={styles.distLabel}>{t("badges.need.Critical")}</span>
              <ProgressBar value={dist.critical} max={distTotal} tone="critical" size="sm" />
              <span className={styles.distCount}>{dist.critical}</span>
            </div>
            <div className={styles.distRow}>
              <span className={styles.distLabel}>{t("badges.need.Weak")}</span>
              <ProgressBar value={dist.weak} max={distTotal} tone="weak" size="sm" />
              <span className={styles.distCount}>{dist.weak}</span>
            </div>
            <div className={styles.distRow}>
              <span className={styles.distLabel}>{t("badges.need.Moderate")}</span>
              <ProgressBar value={dist.moderate} max={distTotal} tone="moderate" size="sm" />
              <span className={styles.distCount}>{dist.moderate}</span>
            </div>
            <div className={styles.distRow}>
              <span className={styles.distLabel}>{t("badges.need.Healthy")}</span>
              <ProgressBar value={dist.healthy} max={distTotal} tone="healthy" size="sm" />
              <span className={styles.distCount}>{dist.healthy}</span>
            </div>
          </div>
        </Card>
      </div>

      <section className={styles.sitesSection} data-animate="page-section">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            {t("campaigns.sitesTitle")} ({campaign.sites.length})
          </h2>
        </div>

        {campaign.sites.length === 0 ? (
          <EmptyState
            compact
            icon={<Globe size={24} weight="duotone" />}
            title={t("campaigns.noSites")}
          />
        ) : (
          <DataTable ariaLabel={t("campaigns.sitesTitle")}>
            <thead>
              <tr>
                <th>{t("campaigns.domain")}</th>
                <th>{t("campaigns.status")}</th>
                <th>{t("campaigns.needScore")}</th>
                <th>{t("leads.crmStatusCol")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {campaign.sites.map((site) => {
                const canOpenReport = site.status === "Completed" || site.status === "Partial";
                return (
                  <tr key={site.id}>
                    <td data-label={t("campaigns.domain")}>
                      <div className={styles.domainCell}>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.domainLink}
                        >
                          {site.domain}
                        </a>
                        {site.businessName && (
                          <span className={styles.bizName}>{site.businessName}</span>
                        )}
                        {site.isDuplicateAcrossAccount && (
                          <Badge tone="moderate">{t("campaigns.duplicateFlag")}</Badge>
                        )}
                      </div>
                    </td>
                    <td data-label={t("campaigns.status")}>
                      <SiteStatusBadge status={site.status} />
                    </td>
                    <td data-label={t("campaigns.needScore")}>
                      <div className={styles.scoreCell}>
                        <span className={styles.scoreNum}>
                          {site.needScore !== null ? site.needScore : "—"}
                        </span>
                        <NeedLevelBadge level={site.level} />
                      </div>
                    </td>
                    <td data-label={t("leads.crmStatusCol")}>
                      <LeadStatusBadge status={site.leadStatus} />
                    </td>
                    <td data-label={t("common.actions")}>
                      <div className={styles.siteActions}>
                        {canOpenReport ? (
                          <>
                            <Button
                              size="sm"
                              variant="soft"
                              icon={<FileText size={15} weight="bold" />}
                              onClick={() => navigate(`/leads/${site.id}/report`)}
                            >
                              {t("campaigns.viewReport")}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<EnvelopeSimple size={15} weight="bold" />}
                              onClick={() => navigate(`/leads/${site.id}/email`)}
                            >
                              {t("campaigns.draftEmail")}
                            </Button>
                          </>
                        ) : (
                          <span className={styles.mutedDash}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
