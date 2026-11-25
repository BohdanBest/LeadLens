import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  DownloadSimple,
  EnvelopeSimple,
  FileText,
  MagnifyingGlass,
  Tag,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { api } from "@/api/client";
import { useBulkUpdateLeadStatus, useInfiniteLeads } from "@/hooks/queries/useLeads";
import { useDebounce } from "@/hooks/useDebounce";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { Badge, LeadStatusBadge, NeedLevelBadge } from "@/components/ui/Badge/Badge";
import { AlertBanner, Input, Select } from "@/components/ui/FormField/FormField";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./LeadsPage.module.scss";

export function LeadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useUiStore((s) => s.notify);
  const pageRef = useRef<HTMLDivElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const searchInput = searchParams.get("q") ?? "";
  const level = searchParams.get("level") ?? "";
  const leadStatus = searchParams.get("status") ?? "";
  const tagInput = searchParams.get("tag") ?? "";
  const sortBy = searchParams.get("sort") ?? "score_desc";

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedTag = useDebounce(tagInput, 300);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("Sent");

  const { isDownloading, download } = useBlobDownload();
  const bulkMutation = useBulkUpdateLeadStatus();

  const filters = useMemo(
    () => ({
      search: debouncedSearch.trim(),
      level,
      leadStatus,
      tag: debouncedTag.trim(),
      sortBy,
    }),
    [debouncedSearch, level, leadStatus, debouncedTag, sortBy]
  );

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteLeads(filters);

  useDocumentTitle(t("leads.title"));
  usePageEntrance(pageRef, [isLoading]);

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const hasActiveFilters = Boolean(searchInput || level || leadStatus || tagInput);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setSelectedIds([]);
  };

  const resetFilters = () => {
    setSearchParams({}, { replace: true });
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === items.length && items.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((l) => l.id));
    }
  };

  const handleBulkApply = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await bulkMutation.mutateAsync({
        leadIds: selectedIds,
        leadStatus: bulkStatus,
      });
      notify({
        tone: "success",
        title: t("leads.bulkUpdated", { count: res.updatedCount }),
      });
      setSelectedIds([]);
    } catch (err) {
      notify({ tone: "error", title: err instanceof Error ? err.message : t("common.errorTitle") });
    }
  };

  const handleExportCsv = () => {
    void download(
      () => api.exportLeadsCsv(),
      "leadlens-leads.csv",
      t("leads.exportSuccess")
    );
  };

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <div>
          <h1 className={styles.pageTitle}>{t("leads.title")}</h1>
          <p className={styles.pageSubtitle}>{t("leads.subtitle")}</p>
        </div>

        <Button
          variant="secondary"
          loading={isDownloading}
          icon={<DownloadSimple size={18} weight="bold" />}
          onClick={handleExportCsv}
        >
          {t("leads.exportCsv")}
        </Button>
      </header>

      <Card padding="sm" data-animate="page-section">
        <div className={styles.filterGrid}>
          <Input
            type="search"
            aria-label={t("leads.searchPlaceholder")}
            placeholder={t("leads.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => updateParam("q", e.target.value)}
            icon={<MagnifyingGlass size={16} />}
          />

          <Select
            aria-label={t("leads.allLevels")}
            value={level}
            onChange={(e) => updateParam("level", e.target.value)}
          >
            <option value="">{t("leads.allLevels")}</option>
            <option value="Critical">{t("badges.need.Critical")}</option>
            <option value="Weak">{t("badges.need.Weak")}</option>
            <option value="Moderate">{t("badges.need.Moderate")}</option>
            <option value="Healthy">{t("badges.need.Healthy")}</option>
          </Select>

          <Select
            aria-label={t("leads.allStatuses")}
            value={leadStatus}
            onChange={(e) => updateParam("status", e.target.value)}
          >
            <option value="">{t("leads.allStatuses")}</option>
            <option value="New">{t("badges.leadStatus.New")}</option>
            <option value="DraftReady">{t("badges.leadStatus.DraftReady")}</option>
            <option value="Sent">{t("badges.leadStatus.Sent")}</option>
            <option value="Replied">{t("badges.leadStatus.Replied")}</option>
            <option value="Rejected">{t("badges.leadStatus.Rejected")}</option>
          </Select>

          <Input
            type="text"
            aria-label={t("leads.tagPlaceholder")}
            placeholder={t("leads.tagPlaceholder")}
            value={tagInput}
            onChange={(e) => updateParam("tag", e.target.value)}
            icon={<Tag size={16} />}
          />

          <Select
            aria-label={t("leads.sortScoreDesc")}
            value={sortBy}
            onChange={(e) => updateParam("sort", e.target.value)}
          >
            <option value="score_desc">{t("leads.sortScoreDesc")}</option>
            <option value="score_asc">{t("leads.sortScoreAsc")}</option>
            <option value="created_desc">{t("leads.sortCreatedDesc")}</option>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={16} weight="bold" />}
              onClick={resetFilters}
            >
              {t("common.resetFilters")}
            </Button>
          )}
        </div>
      </Card>

      {selectedIds.length > 0 && (
        <div className={styles.bulkBar} role="region" aria-label={t("leads.bulkApply")}>
          <span className={styles.bulkCount}>
            {t("leads.bulkSelected", { count: selectedIds.length })}
          </span>
          <div className={styles.bulkControls}>
            <Select
              aria-label={t("leads.crmStatusCol")}
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className={styles.bulkSelect}
            >
              <option value="New">{t("badges.leadStatus.New")}</option>
              <option value="DraftReady">{t("badges.leadStatus.DraftReady")}</option>
              <option value="Sent">{t("badges.leadStatus.Sent")}</option>
              <option value="Replied">{t("badges.leadStatus.Replied")}</option>
              <option value="Rejected">{t("badges.leadStatus.Rejected")}</option>
            </Select>
            <Button
              variant="primary"
              size="sm"
              loading={bulkMutation.isPending}
              onClick={() => void handleBulkApply()}
            >
              {t("leads.bulkApply")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              {t("leads.clearSelection")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <AlertBanner tone="error">
          {error instanceof Error ? error.message : t("common.errorTitle")}
        </AlertBanner>
      )}

      {isLoading ? (
        <Skeleton variant="row" count={6} />
      ) : items.length === 0 ? (
        <div data-animate="page-section">
          <EmptyState
            icon={<UsersThree size={28} weight="duotone" />}
            title={t("leads.noLeadsTitle")}
            description={t("leads.noLeads")}
            action={
              hasActiveFilters ? (
                <Button variant="secondary" onClick={resetFilters}>
                  {t("common.resetFilters")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className={styles.tableStack} data-animate="page-section">
          <DataTable ariaLabel={t("leads.title")}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    aria-label={t("common.selectAll")}
                    checked={items.length > 0 && selectedIds.length === items.length}
                    onChange={toggleAll}
                    className={styles.checkbox}
                  />
                </th>
                <th>{t("campaigns.domain")}</th>
                <th>{t("leads.campaignCol")}</th>
                <th>{t("campaigns.needScore")}</th>
                <th>{t("leads.crmStatusCol")}</th>
                <th>{t("leads.contactsCol")}</th>
                <th>{t("leads.tagsCol")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead.id}>
                  <td data-label={t("common.select")}>
                    <input
                      type="checkbox"
                      aria-label={`${t("common.select")} ${lead.domain}`}
                      checked={selectedIds.includes(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className={styles.checkbox}
                    />
                  </td>
                  <td data-label={t("campaigns.domain")}>
                    <div className={styles.domainCell}>
                      <Link to={`/leads/${lead.id}/report`} className={styles.domainLink}>
                        {lead.domain}
                      </Link>
                      {lead.businessName && (
                        <span className={styles.bizName}>{lead.businessName}</span>
                      )}
                    </div>
                  </td>
                  <td data-label={t("leads.campaignCol")}>
                    <Link to={`/campaigns/${lead.campaignId}`} className={styles.campaignLink}>
                      {lead.campaignName}
                    </Link>
                  </td>
                  <td data-label={t("campaigns.needScore")}>
                    <div className={styles.scoreCell}>
                      <span className={styles.scoreNum}>
                        {lead.needScore !== null ? lead.needScore : "—"}
                      </span>
                      <NeedLevelBadge level={lead.level} />
                    </div>
                  </td>
                  <td data-label={t("leads.crmStatusCol")}>
                    <LeadStatusBadge status={lead.leadStatus} />
                  </td>
                  <td data-label={t("leads.contactsCol")}>
                    {lead.noContactsFound ? (
                      <Badge tone="neutral" icon={<WarningCircle size={13} weight="bold" />}>
                        {t("leads.noContactsShort")}
                      </Badge>
                    ) : (
                      <Badge tone="healthy" icon={<CheckCircle size={13} weight="bold" />}>
                        {t("leads.contactsFound")}
                      </Badge>
                    )}
                  </td>
                  <td data-label={t("leads.tagsCol")}>
                    {lead.tags.length > 0 ? (
                      <div className={styles.tagList}>
                        {lead.tags.map((tag) => (
                          <Badge key={tag} tone="neutral">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.mutedDash}>—</span>
                    )}
                  </td>
                  <td data-label={t("common.actions")}>
                    <div className={styles.rowActions}>
                      <Button
                        size="sm"
                        variant="soft"
                        icon={<FileText size={15} weight="bold" />}
                        onClick={() => navigate(`/leads/${lead.id}/report`)}
                      >
                        {t("campaigns.viewReport")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<EnvelopeSimple size={15} weight="bold" />}
                        onClick={() => navigate(`/leads/${lead.id}/email`)}
                      >
                        {t("campaigns.draftEmail")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          {hasNextPage && (
            <div className={styles.loadMoreRow}>
              <Button
                variant="secondary"
                loading={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {t("leads.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
