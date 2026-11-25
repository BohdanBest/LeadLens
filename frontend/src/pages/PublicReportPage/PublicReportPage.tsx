import { useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowSquareOut, LinkBreak, ListChecks } from "@phosphor-icons/react";
import { usePublicReport } from "@/hooks/queries/useSiteReport";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthShell } from "@/components/layout/AuthShell";
import { Card, CardHeader } from "@/components/ui/Card/Card";
import { Badge, CheckResultBadge, NeedLevelBadge } from "@/components/ui/Badge/Badge";
import { ScoreGauge } from "@/components/ui/ScoreGauge/ScoreGauge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./PublicReportPage.module.scss";

export function PublicReportPage() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const pageRef = useRef<HTMLDivElement>(null);

  const { data: report, isLoading, error } = usePublicReport(token);

  useDocumentTitle(report ? `${report.domain} — ${t("publicReport.eyebrow")}` : t("publicReport.eyebrow"));
  usePageEntrance(pageRef, [isLoading]);

  const isUk = i18n.language === "uk";

  return (
    <AuthShell variant="centered">
      <div ref={pageRef} className={styles.wrap}>
        {isLoading && (
          <div className={styles.stack}>
            <Skeleton variant="card" />
            <Skeleton variant="row" count={4} />
          </div>
        )}

        {(error || (!isLoading && !report)) && (
          <EmptyState
            icon={<LinkBreak size={28} weight="duotone" />}
            title={t("publicReport.expiredTitle")}
            description={t("publicReport.expiredDesc")}
          />
        )}

        {report && (
          <div className={styles.stack}>
            <Card padding="lg" data-animate="page-header">
              <span className={styles.eyebrow}>{t("publicReport.eyebrow")}</span>
              <div className={styles.hero}>
                <ScoreGauge
                  score={report.needScore}
                  level={report.level}
                  label={t("report.needScore")}
                />
                <div className={styles.heroText}>
                  <div className={styles.domainRow}>
                    <h1 className={styles.domain}>{report.domain}</h1>
                    <a
                      href={report.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.extLink}
                      aria-label={report.url}
                    >
                      <ArrowSquareOut size={18} weight="bold" aria-hidden="true" />
                    </a>
                  </div>
                  <div className={styles.metaBadges}>
                    <NeedLevelBadge level={report.level} />
                    <Badge tone="neutral" mono>
                      v{report.auditVersion}
                    </Badge>
                    {report.auditedAt && (
                      <span className={styles.dateText}>
                        {new Date(report.auditedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className={styles.summary}>{report.summary}</p>
                </div>
              </div>
            </Card>

            <Card padding="lg" data-animate="page-section">
              <CardHeader
                title={t("publicReport.topFindingsTitle")}
                icon={<ListChecks size={20} weight="duotone" />}
              />
              {report.topFindings.length === 0 ? (
                <p className={styles.empty}>{t("publicReport.noFindings")}</p>
              ) : (
                <ul className={styles.findingList}>
                  {report.topFindings.map((f) => (
                    <li key={f.checkId} className={styles.findingRow}>
                      <div className={styles.findingMain}>
                        <div className={styles.findingTop}>
                          <CheckResultBadge result={f.result} />
                          <Badge tone="neutral" mono>
                            {f.checkId}
                          </Badge>
                          <strong className={styles.findingTitle}>
                            {isUk ? f.titleUk : f.titleEn}
                          </strong>
                        </div>
                        {f.value && <span className={styles.findingVal}>{f.value}</span>}
                      </div>
                      {f.scoreContribution > 0 && (
                        <Badge tone="weak" mono>
                          +{f.scoreContribution}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <p className={styles.footerNote}>{t("publicReport.footerNote")}</p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
