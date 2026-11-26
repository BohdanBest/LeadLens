import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bug,
  ChartBar,
  Cube,
  FolderOpen,
  FunnelSimple,
  Gauge,
  Plus,
  Table,
  TrendUp,
  UsersThree,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useDashboard } from "@/hooks/queries/useDashboard";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useCountUp } from "@/hooks/motion/useCountUp";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar/ProgressBar";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import { AlertBanner } from "@/components/ui/FormField/FormField";
import type { Bar3DItem } from "@/components/three/Dashboard3DScene";
import styles from "./DashboardPage.module.scss";

const Dashboard3DScene = lazy(() =>
  import("@/components/three/Dashboard3DScene").then((m) => ({ default: m.Dashboard3DScene }))
);

function KpiTile({
  label,
  value,
  decimals = 0,
  suffix = "",
  icon,
  tone = "accent",
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  icon: React.ReactNode;
  tone?: "accent" | "healthy" | "weak" | "neutral";
}) {
  const animated = useCountUp(value, decimals, 0.8);
  return (
    <Card as="article" padding="md" className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={`${styles.kpiIcon} ${styles[`kpi_${tone}`]}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={styles.kpiValue}>
        {decimals > 0 ? animated.toFixed(decimals) : animated}
        {suffix}
      </div>
    </Card>
  );
}

interface BarDatum {
  key: string;
  label: string;
  value: number;
  displayValue?: string;
  tone?: ProgressTone;
  subtext?: string;
  href?: string;
}

function BarSeries({
  items,
  maxValue,
  emptyLabel,
}: {
  items: BarDatum[];
  maxValue: number;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className={styles.emptyInline}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.barList}>
      {items.map((item) => (
        <div key={item.key} className={styles.barRow}>
          <div className={styles.barMeta}>
            <div className={styles.barLabelGroup}>
              {item.href ? (
                <Link to={item.href} className={styles.barLink}>
                  {item.label}
                </Link>
              ) : (
                <span className={styles.barLabel}>{item.label}</span>
              )}
              {item.subtext && <span className={styles.barSubtext}>{item.subtext}</span>}
            </div>
            <span className={styles.barNum}>{item.displayValue ?? item.value}</span>
          </div>
          <ProgressBar
            value={item.value}
            max={Math.max(1, maxValue)}
            tone={item.tone ?? "accent"}
            size="md"
            label={`${item.label}: ${item.displayValue ?? item.value}`}
          />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<"7d" | "30d" | "12m">("30d");
  const [tableMode, setTableMode] = useState(false);
  const [sceneMode, setSceneMode] = useState<"need" | "campaigns">("need");

  const { data, isLoading, error } = useDashboard(period);

  useDocumentTitle(t("dashboard.title"));
  usePageEntrance(pageRef, [isLoading]);

  const derived = useMemo(() => {
    if (!data) return null;
    const dist = data.needDistribution;
    const needBars: BarDatum[] = [
      { key: "Healthy", label: t("badges.need.Healthy"), value: dist.healthy, tone: "healthy" },
      { key: "Moderate", label: t("badges.need.Moderate"), value: dist.moderate, tone: "moderate" },
      { key: "Weak", label: t("badges.need.Weak"), value: dist.weak, tone: "weak" },
      { key: "Critical", label: t("badges.need.Critical"), value: dist.critical, tone: "critical" },
    ];
    const maxNeed = Math.max(1, ...needBars.map((b) => b.value));

    const funnelEntries = Object.entries(data.statusFunnel).map(([statusKey, count]) => ({
      key: statusKey,
      label: t(`badges.leadStatus.${statusKey}`, { defaultValue: statusKey }),
      value: count,
      tone:
        statusKey === "Replied"
          ? ("healthy" as ProgressTone)
          : statusKey === "Rejected"
            ? ("critical" as ProgressTone)
            : ("accent" as ProgressTone),
    }));
    const maxFunnel = Math.max(1, ...funnelEntries.map((b) => b.value));

    const topIssueBars: BarDatum[] = data.topIssues.map((issue) => ({
      key: issue.checkId,
      label: issue.checkId,
      subtext: issue.category,
      value: issue.count,
      tone: "weak",
    }));
    const maxIssue = Math.max(1, ...topIssueBars.map((b) => b.value));

    const campaignBars: BarDatum[] = data.campaignAverageScores.map((c) => ({
      key: c.campaignId,
      label: c.campaignName,
      subtext: `${c.leadsCount} ${t("campaigns.sitesCount")}`,
      value: c.averageScore,
      displayValue: `${c.averageScore.toFixed(1)}`,
      href: `/campaigns/${c.campaignId}`,
      tone:
        c.averageScore >= 75
          ? "critical"
          : c.averageScore >= 50
            ? "weak"
            : c.averageScore >= 25
              ? "moderate"
              : "healthy",
    }));

    const weightedSum = data.campaignAverageScores.reduce(
      (acc, c) => acc + c.averageScore * c.leadsCount,
      0
    );
    const weightedCount = data.campaignAverageScores.reduce((acc, c) => acc + c.leadsCount, 0);
    const avgScore = weightedCount > 0 ? weightedSum / weightedCount : 0;

    const need3dItems: Bar3DItem[] = [
      {
        id: "Healthy",
        label: t("badges.need.Healthy"),
        value: dist.healthy,
        displayValue: `${dist.healthy}`,
        tone: "healthy",
        href: "/leads?level=Healthy",
        actionHint: t("dashboard.scene3dClickLead"),
      },
      {
        id: "Moderate",
        label: t("badges.need.Moderate"),
        value: dist.moderate,
        displayValue: `${dist.moderate}`,
        tone: "moderate",
        href: "/leads?level=Moderate",
        actionHint: t("dashboard.scene3dClickLead"),
      },
      {
        id: "Weak",
        label: t("badges.need.Weak"),
        value: dist.weak,
        displayValue: `${dist.weak}`,
        tone: "weak",
        href: "/leads?level=Weak",
        actionHint: t("dashboard.scene3dClickLead"),
      },
      {
        id: "Critical",
        label: t("badges.need.Critical"),
        value: dist.critical,
        displayValue: `${dist.critical}`,
        tone: "critical",
        href: "/leads?level=Critical",
        actionHint: t("dashboard.scene3dClickLead"),
      },
    ];

    const campaign3dItems: Bar3DItem[] = data.campaignAverageScores.slice(0, 8).map((c) => ({
      id: c.campaignId,
      label: c.campaignName,
      value: c.averageScore,
      displayValue: `${c.averageScore.toFixed(1)}`,
      subtext: `${c.leadsCount} ${t("campaigns.sitesCount")}`,
      tone:
        c.averageScore >= 75
          ? "critical"
          : c.averageScore >= 50
            ? "weak"
            : c.averageScore >= 25
              ? "moderate"
              : "healthy",
      href: `/campaigns/${c.campaignId}`,
      actionHint: t("dashboard.scene3dClickCampaign"),
    }));

    return {
      needBars,
      maxNeed,
      funnelEntries,
      maxFunnel,
      topIssueBars,
      maxIssue,
      campaignBars,
      need3dItems,
      campaign3dItems,
      weakAndCritical: dist.weak + dist.critical,
      avgScore,
    };
  }, [data, t]);

  const periodOptions = [
    { value: "7d" as const, label: t("dashboard.period7d") },
    { value: "30d" as const, label: t("dashboard.period30d") },
    { value: "12m" as const, label: t("dashboard.period12m") },
  ];

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <div>
          <h1 className={styles.pageTitle}>{t("dashboard.title")}</h1>
          <p className={styles.pageSubtitle}>{t("dashboard.subtitle")}</p>
        </div>

        <div className={styles.headerActions}>
          <Tabs
            options={periodOptions}
            value={period}
            onChange={setPeriod}
            ariaLabel={t("dashboard.title")}
            variant="segmented"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={tableMode ? <ChartBar size={16} weight="bold" /> : <Table size={16} weight="bold" />}
            onClick={() => setTableMode((v) => !v)}
          >
            {tableMode ? t("dashboard.showChart") : t("dashboard.showTableAlt")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => navigate("/campaigns/new")}
          >
            {t("dashboard.quickActionCampaign")}
          </Button>
        </div>
      </header>

      {error && (
        <AlertBanner tone="error">
          {error instanceof Error ? error.message : t("common.errorTitle")}
        </AlertBanner>
      )}

      {isLoading && (
        <div className={styles.loadingGrid}>
          <div className={styles.kpiGrid}>
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </div>
          <div className={styles.chartsGrid}>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        </div>
      )}

      {data && derived && (
        <>
          <section className={styles.kpiGrid} data-animate="page-section">
            <KpiTile
              label={t("dashboard.campaignsCount")}
              value={data.totalCampaigns}
              icon={<FolderOpen size={22} weight="duotone" />}
              tone="accent"
            />
            <KpiTile
              label={t("dashboard.leadsCount")}
              value={data.totalLeads}
              icon={<UsersThree size={22} weight="duotone" />}
              tone="neutral"
            />
            <KpiTile
              label={t("dashboard.criticalLeadsCount")}
              value={derived.weakAndCritical}
              icon={<WarningOctagon size={22} weight="duotone" />}
              tone="weak"
            />
            <KpiTile
              label={t("dashboard.avgScoreKpi")}
              value={derived.avgScore}
              decimals={1}
              icon={<Gauge size={22} weight="duotone" />}
              tone="healthy"
            />
          </section>

          {data.totalCampaigns === 0 && data.totalLeads === 0 ? (
            <div data-animate="page-section">
              <EmptyState
                icon={<ChartBar size={28} weight="duotone" />}
                title={t("dashboard.emptyPeriod")}
                description={t("campaigns.empty")}
                action={
                  <Button
                    variant="primary"
                    icon={<Plus size={18} weight="bold" />}
                    onClick={() => navigate("/campaigns/new")}
                  >
                    {t("campaigns.createButton")}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {!tableMode && (
                <div data-animate="page-section">
                  <Card>
                    <CardHeader
                      title={t("dashboard.scene3dTitle")}
                      subtitle={t("dashboard.scene3dSubtitle")}
                      icon={<Cube size={20} weight="duotone" />}
                      action={
                        derived.campaign3dItems.length > 0 ? (
                          <Tabs
                            variant="segmented"
                            ariaLabel={t("dashboard.scene3dTitle")}
                            value={sceneMode}
                            onChange={setSceneMode}
                            options={[
                              { value: "need", label: t("dashboard.scene3dModeNeed") },
                              { value: "campaigns", label: t("dashboard.scene3dModeCampaigns") },
                            ]}
                          />
                        ) : undefined
                      }
                    />
                    <Suspense fallback={<Skeleton variant="card" />}>
                      <Dashboard3DScene
                        items={
                          sceneMode === "campaigns" && derived.campaign3dItems.length > 0
                            ? derived.campaign3dItems
                            : derived.need3dItems
                        }
                        maxValue={sceneMode === "campaigns" ? 100 : derived.maxNeed}
                        onSelect={(item) => navigate(item.href)}
                      />
                    </Suspense>
                  </Card>
                </div>
              )}

              <div className={styles.chartsGrid} data-animate="page-section">
              <Card>
                <CardHeader
                  title={t("dashboard.needDistTitle")}
                  icon={<Gauge size={20} weight="duotone" />}
                />
                {tableMode ? (
                  <DataTable ariaLabel={t("dashboard.needDistTitle")} compact>
                    <thead>
                      <tr>
                        <th>{t("campaigns.status")}</th>
                        <th>{t("dashboard.countCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derived.needBars.map((row) => (
                        <tr key={row.key}>
                          <td data-label={t("campaigns.status")}>{row.label}</td>
                          <td data-label={t("dashboard.countCol")} className={styles.numCell}>
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <BarSeries
                    items={derived.needBars}
                    maxValue={derived.maxNeed}
                    emptyLabel={t("common.noData")}
                  />
                )}
              </Card>

              <Card>
                <CardHeader
                  title={t("dashboard.funnelTitle")}
                  icon={<FunnelSimple size={20} weight="duotone" />}
                />
                {tableMode ? (
                  <DataTable ariaLabel={t("dashboard.funnelTitle")} compact>
                    <thead>
                      <tr>
                        <th>{t("leads.crmStatusCol")}</th>
                        <th>{t("dashboard.countCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derived.funnelEntries.map((row) => (
                        <tr key={row.key}>
                          <td data-label={t("leads.crmStatusCol")}>{row.label}</td>
                          <td data-label={t("dashboard.countCol")} className={styles.numCell}>
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <BarSeries
                    items={derived.funnelEntries}
                    maxValue={derived.maxFunnel}
                    emptyLabel={t("common.noData")}
                  />
                )}
              </Card>

              <Card>
                <CardHeader
                  title={t("dashboard.topIssuesTitle")}
                  icon={<Bug size={20} weight="duotone" />}
                />
                {tableMode ? (
                  <DataTable ariaLabel={t("dashboard.topIssuesTitle")} compact>
                    <thead>
                      <tr>
                        <th>Check ID</th>
                        <th>{t("report.categoryCol")}</th>
                        <th>{t("dashboard.countCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topIssues.map((issue) => (
                        <tr key={issue.checkId}>
                          <td data-label="Check ID" className={styles.monoCell}>
                            {issue.checkId}
                          </td>
                          <td data-label={t("report.categoryCol")}>{issue.category}</td>
                          <td data-label={t("dashboard.countCol")} className={styles.numCell}>
                            {issue.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <BarSeries
                    items={derived.topIssueBars}
                    maxValue={derived.maxIssue}
                    emptyLabel={t("common.noData")}
                  />
                )}
              </Card>

              <Card>
                <CardHeader
                  title={t("dashboard.campaignScoresTitle")}
                  icon={<TrendUp size={20} weight="duotone" />}
                />
                {tableMode ? (
                  <DataTable ariaLabel={t("dashboard.campaignScoresTitle")} compact>
                    <thead>
                      <tr>
                        <th>{t("campaigns.name")}</th>
                        <th>{t("dashboard.avgScoreCol")}</th>
                        <th>{t("dashboard.countCol")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaignAverageScores.map((c) => (
                        <tr key={c.campaignId}>
                          <td data-label={t("campaigns.name")}>
                            <Link to={`/campaigns/${c.campaignId}`}>{c.campaignName}</Link>
                          </td>
                          <td data-label={t("dashboard.avgScoreCol")} className={styles.numCell}>
                            {c.averageScore.toFixed(1)}
                          </td>
                          <td data-label={t("dashboard.countCol")} className={styles.numCell}>
                            {c.leadsCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <BarSeries
                    items={derived.campaignBars}
                    maxValue={100}
                    emptyLabel={t("common.noData")}
                  />
                )}
              </Card>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
