import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  FileCsv,
  ListBullets,
  MapPinLine,
  RocketLaunch,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { ApiError } from "@/api/client";
import { useCreateCampaign } from "@/hooks/queries/useCampaigns";
import { usePageEntrance } from "@/hooks/motion/usePageEntrance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useUiStore } from "@/stores/useUiStore";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { AlertBanner, Field, Input, Select, Textarea } from "@/components/ui/FormField/FormField";
import styles from "./CampaignCreatePage.module.scss";

type SourceType = "OpenStreetMap" | "ManualList" | "CsvImport";

export function CampaignCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useUiStore((s) => s.notify);
  const pageRef = useRef<HTMLDivElement>(null);

  const createMutation = useCreateCampaign();

  useDocumentTitle(t("campaigns.createTitle"));
  usePageEntrance(pageRef);

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [region, setRegion] = useState("");
  const [searchLanguage, setSearchLanguage] = useState<"uk" | "en">("uk");
  const [siteLimit, setSiteLimit] = useState(20);
  const [exclusionsText, setExclusionsText] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("OpenStreetMap");
  const [manualUrlsText, setManualUrlsText] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCsvFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const text = await file.text();
    setCsvContent(text);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const exclusionKeywords = exclusionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const manualUrls =
      sourceType === "ManualList"
        ? manualUrlsText
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        niche: niche.trim(),
        region: region.trim() || null,
        searchLanguage,
        siteLimit,
        exclusionKeywords,
        sourceType,
        manualUrls,
        csvContent: sourceType === "CsvImport" ? csvContent : undefined,
        startImmediately,
      });
      notify({ tone: "success", title: created.name });
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorTitle"));
    }
  };

  const sourceCards: Array<{
    type: SourceType;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      type: "OpenStreetMap",
      title: t("campaigns.sourceOsmTitle"),
      desc: t("campaigns.sourceOsmDesc"),
      icon: <MapPinLine size={24} weight="duotone" />,
    },
    {
      type: "ManualList",
      title: t("campaigns.sourceManualTitle"),
      desc: t("campaigns.sourceManualDesc"),
      icon: <ListBullets size={24} weight="duotone" />,
    },
    {
      type: "CsvImport",
      title: t("campaigns.sourceCsvTitle"),
      desc: t("campaigns.sourceCsvDesc"),
      icon: <FileCsv size={24} weight="duotone" />,
    },
  ];

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.pageHeader} data-animate="page-header">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} weight="bold" />}
          onClick={() => navigate("/campaigns")}
        >
          {t("campaigns.title")}
        </Button>
        <h1 className={styles.pageTitle}>{t("campaigns.createTitle")}</h1>
        <p className={styles.pageSubtitle}>{t("campaigns.createSubtitle")}</p>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form} data-animate="page-section">
        {error && (
          <AlertBanner tone="error" icon={<WarningCircle size={18} weight="bold" />}>
            {error}
          </AlertBanner>
        )}

        <Card padding="lg">
          <div className={styles.sectionBlock}>
            <span className={styles.sectionLabel}>{t("campaigns.sourceType")}</span>
            <div className={styles.sourceGrid} role="radiogroup" aria-label={t("campaigns.sourceType")}>
              {sourceCards.map((card) => {
                const selected = sourceType === card.type;
                return (
                  <button
                    key={card.type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`${styles.sourceCard} ${selected ? styles.sourceCardActive : ""}`.trim()}
                    onClick={() => setSourceType(card.type)}
                  >
                    <span className={styles.sourceIcon} aria-hidden="true">
                      {card.icon}
                    </span>
                    <span className={styles.sourceTitle}>{card.title}</span>
                    <span className={styles.sourceDesc}>{card.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.gridTwo}>
            <Field id="cmp-name" label={t("campaigns.name")} hint={t("campaigns.nameHint")} required>
              <Input
                id="cmp-name"
                type="text"
                minLength={3}
                maxLength={80}
                required
                placeholder={t("campaigns.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field id="cmp-niche" label={t("campaigns.niche")} hint={t("campaigns.nicheHint")} required>
              <Input
                id="cmp-niche"
                type="text"
                required
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </Field>

            <Field id="cmp-region" label={t("campaigns.region")}>
              <Input
                id="cmp-region"
                type="text"
                placeholder={t("campaigns.regionPlaceholder")}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </Field>

            <Field id="cmp-lang" label={t("campaigns.searchLang")}>
              <Select
                id="cmp-lang"
                value={searchLanguage}
                onChange={(e) => setSearchLanguage(e.target.value as "uk" | "en")}
              >
                <option value="uk">Українська (uk)</option>
                <option value="en">English (en)</option>
              </Select>
            </Field>

            <Field id="cmp-limit" label={t("campaigns.siteLimit")} required>
              <Input
                id="cmp-limit"
                type="number"
                min={5}
                max={200}
                required
                value={siteLimit}
                onChange={(e) => setSiteLimit(Number(e.target.value))}
              />
            </Field>

            <Field id="cmp-exclusions" label={t("campaigns.exclusions")}>
              <Input
                id="cmp-exclusions"
                type="text"
                placeholder={t("campaigns.exclusionsPlaceholder")}
                value={exclusionsText}
                onChange={(e) => setExclusionsText(e.target.value)}
              />
            </Field>
          </div>

          {sourceType === "ManualList" && (
            <div className={styles.sourceExtra}>
              <Field id="cmp-urls" label={t("campaigns.manualUrls")} required>
                <Textarea
                  id="cmp-urls"
                  mono
                  rows={6}
                  required
                  placeholder={"https://clinic-one.ua\nhttps://clinic-two.ua"}
                  value={manualUrlsText}
                  onChange={(e) => setManualUrlsText(e.target.value)}
                />
              </Field>
            </div>
          )}

          {sourceType === "CsvImport" && (
            <div className={styles.sourceExtra}>
              <Field id="cmp-csv" label={t("campaigns.csvFile")} required>
                <label className={styles.fileDrop}>
                  <UploadSimple size={20} weight="duotone" aria-hidden="true" />
                  <span>{csvFileName || "CSV (.csv, .txt)"}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={(e) => void handleCsvFile(e)}
                    className={styles.fileInput}
                  />
                </label>
                <Textarea
                  id="cmp-csv"
                  mono
                  rows={5}
                  required
                  placeholder={"url,name\nhttps://example.com,Example"}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                />
              </Field>
            </div>
          )}

          <div className={styles.submitRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
                className={styles.checkbox}
              />
              <span>{t("campaigns.startNow")}</span>
            </label>

            <div className={styles.submitActions}>
              <Button variant="secondary" onClick={() => navigate("/campaigns")}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={createMutation.isPending}
                icon={<RocketLaunch size={18} weight="bold" />}
              >
                {t("campaigns.submitCreate")}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
