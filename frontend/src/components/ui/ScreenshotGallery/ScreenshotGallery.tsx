import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowsOut,
  Desktop,
  DeviceMobile,
  ImageBroken,
} from "@phosphor-icons/react";
import { api } from "@/api/client";
import { Modal } from "@/components/ui/Modal/Modal";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import styles from "./ScreenshotGallery.module.scss";

export function ArtifactImage({
  fileRef,
  alt,
  className = "",
}: {
  fileRef: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setFailed(false);
    setObjectUrl(null);

    api
      .fetchArtifactBlob(fileRef)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileRef]);

  if (failed) {
    return (
      <div className={styles.fallback} role="img" aria-label={alt}>
        <ImageBroken size={24} weight="duotone" aria-hidden="true" />
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={styles.loadingPlaceholder} aria-hidden="true" />;
  }

  return <img src={objectUrl} alt={alt} className={className} loading="lazy" />;
}

export interface ScreenshotItem {
  id: string;
  fileRef: string;
  variant: "desktop" | "mobile";
  label: string;
}

export interface ScreenshotGalleryProps {
  screenshots: ScreenshotItem[];
  domain: string;
}

export function ScreenshotGallery({ screenshots, domain }: ScreenshotGalleryProps) {
  const { t } = useTranslation();
  const desktop = screenshots.find((s) => s.variant === "desktop");
  const mobile = screenshots.find((s) => s.variant === "mobile");

  const defaultTab: "desktop" | "mobile" = desktop ? "desktop" : "mobile";
  const [activeTab, setActiveTab] = useState<"desktop" | "mobile">(defaultTab);
  const [lightboxItem, setLightboxItem] = useState<ScreenshotItem | null>(null);

  if (screenshots.length === 0) {
    return (
      <div className={styles.empty}>
        <ImageBroken size={22} weight="duotone" aria-hidden="true" />
        <span>{t("report.noScreenshots")}</span>
      </div>
    );
  }

  const current = (activeTab === "desktop" ? desktop : mobile) ?? screenshots[0];

  const tabOptions = [
    ...(desktop
      ? [
          {
            value: "desktop" as const,
            label: t("report.desktopView"),
            icon: <Desktop size={16} weight="bold" />,
          },
        ]
      : []),
    ...(mobile
      ? [
          {
            value: "mobile" as const,
            label: t("report.mobileView"),
            icon: <DeviceMobile size={16} weight="bold" />,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.gallery}>
      <div className={styles.toolbar}>
        {tabOptions.length > 1 ? (
          <Tabs
            options={tabOptions}
            value={current.variant}
            onChange={(val) => setActiveTab(val)}
            ariaLabel={t("report.screenshotsTitle")}
            variant="segmented"
          />
        ) : (
          <span className={styles.singleLabel}>{current.label}</span>
        )}
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setLightboxItem(current)}
          aria-label={t("report.openLightbox")}
        >
          <ArrowsOut size={16} weight="bold" aria-hidden="true" />
          <span>{t("report.openLightbox")}</span>
        </button>
      </div>

      <button
        type="button"
        className={`${styles.frame} ${current.variant === "mobile" ? styles.mobileFrame : styles.desktopFrame}`}
        onClick={() => setLightboxItem(current)}
        aria-label={`${t("report.openLightbox")}: ${domain}`}
      >
        <div className={styles.browserChrome} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.urlBar}>{domain}</span>
        </div>
        <div className={styles.viewport}>
          <ArtifactImage
            fileRef={current.fileRef}
            alt={`${domain} — ${current.label}`}
            className={styles.image}
          />
        </div>
      </button>

      <Modal
        open={Boolean(lightboxItem)}
        onClose={() => setLightboxItem(null)}
        title={lightboxItem ? `${domain} — ${lightboxItem.label}` : ""}
        size="xl"
      >
        {lightboxItem && (
          <div className={styles.lightboxBody}>
            <ArtifactImage
              fileRef={lightboxItem.fileRef}
              alt={`${domain} — ${lightboxItem.label}`}
              className={styles.lightboxImage}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
