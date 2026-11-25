import { useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowCounterClockwise,
  Copy,
  FolderOpen,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { type CampaignSummary } from "@/api/client";
import { useCampaignListActions, useCampaigns } from "@/hooks/queries/useCampaigns";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Button } from "@/components/ui/Button/Button";
import { Badge, CampaignStatusBadge } from "@/components/ui/Badge/Badge";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import { AlertBanner } from "@/components/ui/FormField/FormField";
import styles from "./CampaignsPage.module.scss";

export function CampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const includeArchived = searchParams.get("archived") === "1";

  const notify = useUiStore((s) => s.notify);
  const confirm = useUiStore((s) => s.confirm);
  const pageRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useCampaigns(includeArchived);
  const { duplicate, archive, remove } = useCampaignListActions();

  useDocumentTitle(t("campaigns.title"));
  usePageEntrance(pageRef, [isLoading]);

  const toggleArchived = (checked: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (checked) next.set("archived", "1");
    else next.delete("archived");
    setSearchParams(next, { replace: true });
  };

  const handleDuplicate = async (c: CampaignSummary) => {
    try {
      await duplicate.mutateAsync(c.id);
      notify({ tone: "success", title: t("campaigns.duplicatedToast") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleArchiveToggle = async (c: CampaignSummary) => {
    try {
      await archive.mutateAsync({ id: c.id, archived: c.isArchived });
      notify({
        tone: "success",
        title: c.isArchived ? t("campaigns.unarchivedToast") : t("campaigns.archivedToast"),
      });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleDelete = async (c: CampaignSummary) => {
    const ok = await confirm({
      title: t("campaigns.deleteConfirmTitle"),
      message: t("campaigns.deleteConfirmMessage", { name: c.name }),
      confirmLabel: t("campaigns.delete"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!ok) return;

    try {
      await remove.mutateAsync(c.id);
      notify({ tone: "success", title: t("campaigns.deletedToast") });
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const items = data?.items ?? [];

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <div>
          <h1 className={styles.pageTitle}>{t("campaigns.title")}</h1>
          <p className={styles.pageSubtitle}>{t("campaigns.subtitle")}</p>
        </div>

        <div className={styles.headerActions}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => toggleArchived(e.target.checked)}
              className={styles.checkbox}
            />
            <span>{t("campaigns.showArchived")}</span>
          </label>

          <Button
            variant="primary"
            icon={<Plus size={18} weight="bold" />}
            onClick={() => navigate("/campaigns/new")}
          >
            {t("campaigns.createButton")}
          </Button>
        </div>
      </header>

      {error && (
        <AlertBanner tone="error">
          {error instanceof Error ? error.message : t("common.errorTitle")}
        </AlertBanner>
      )}

      {isLoading ? (
        <div className={styles.loadingStack}>
          <Skeleton variant="row" count={5} />
        </div>
      ) : items.length === 0 ? (
        <div data-animate="page-section">
          <EmptyState
            icon={<FolderOpen size={28} weight="duotone" />}
            title={t("campaigns.emptyTitle")}
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
        <div data-animate="page-section">
          <DataTable ariaLabel={t("campaigns.title")}>
            <thead>
              <tr>
                <th>{t("campaigns.name")}</th>
                <th>{t("campaigns.niche")}</th>
                <th>{t("campaigns.status")}</th>
                <th>{t("campaigns.audited")}</th>
                <th>{t("campaigns.limitCol")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td data-label={t("campaigns.name")}>
                    <div className={styles.nameCell}>
                      <Link to={`/campaigns/${c.id}`} className={styles.campaignLink}>
                        {c.name}
                      </Link>
                      {c.isArchived && (
                        <Badge tone="neutral">{t("campaigns.archivedBadge")}</Badge>
                      )}
                    </div>
                  </td>
                  <td data-label={t("campaigns.niche")}>
                    <div className={styles.nicheCell}>
                      <span>{c.niche}</span>
                      {c.region && <span className={styles.regionText}>{c.region}</span>}
                    </div>
                  </td>
                  <td data-label={t("campaigns.status")}>
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td data-label={t("campaigns.audited")} className={styles.monoCell}>
                    <span>
                      {c.sitesAudited} / {c.sitesFound}
                    </span>
                    {c.sitesFailed > 0 && (
                      <span className={styles.failedCount}>({c.sitesFailed} err)</span>
                    )}
                  </td>
                  <td data-label={t("campaigns.limitCol")} className={styles.monoCell}>
                    {c.siteLimit}
                  </td>
                  <td data-label={t("common.actions")}>
                    <div className={styles.rowActions}>
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => navigate(`/campaigns/${c.id}`)}
                      >
                        {t("campaigns.open")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy size={16} />}
                        onClick={() => void handleDuplicate(c)}
                        aria-label={t("campaigns.duplicate")}
                        title={t("campaigns.duplicate")}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={
                          c.isArchived ? (
                            <ArrowCounterClockwise size={16} />
                          ) : (
                            <Archive size={16} />
                          )
                        }
                        onClick={() => void handleArchiveToggle(c)}
                        aria-label={
                          c.isArchived ? t("campaigns.unarchive") : t("campaigns.archive")
                        }
                        title={c.isArchived ? t("campaigns.unarchive") : t("campaigns.archive")}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash size={16} />}
                        onClick={() => void handleDelete(c)}
                        aria-label={t("campaigns.delete")}
                        title={t("campaigns.delete")}
                        className={styles.deleteBtn}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
