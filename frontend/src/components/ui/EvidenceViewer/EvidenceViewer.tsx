import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Code, Gauge, Image as ImageIcon, LinkSimple } from "@phosphor-icons/react";
import { type EvidenceDto } from "@/api/client";
import { Modal } from "@/components/ui/Modal/Modal";
import { ArtifactImage } from "@/components/ui/ScreenshotGallery/ScreenshotGallery";
import styles from "./EvidenceViewer.module.scss";

function parsePayload(raw: string | null): unknown {
  if (!raw) return null;
  try {
    const first = JSON.parse(raw);
    if (typeof first === "string") {
      const trimmed = first.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return first;
        }
      }
    }
    return first;
  } catch {
    return raw;
  }
}

function isUrlString(val: string): boolean {
  return /^https?:\/\/\S+$/i.test(val.trim());
}

export function EvidenceViewer({ evidences, domain }: { evidences: EvidenceDto[]; domain: string }) {
  const { t } = useTranslation();
  const [previewRef, setPreviewRef] = useState<string | null>(null);

  if (!evidences || evidences.length === 0) return null;

  return (
    <div className={styles.list}>
      {evidences.map((ev) => {
        if (ev.kind === "Screenshot" && ev.fileRef) {
          return (
            <div key={ev.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <ImageIcon size={15} weight="bold" aria-hidden="true" />
                <span>{t("report.evidenceScreenshot")}</span>
              </div>
              <button
                type="button"
                className={styles.thumbBtn}
                onClick={() => setPreviewRef(ev.fileRef)}
                aria-label={t("report.openLightbox")}
              >
                <ArtifactImage
                  fileRef={ev.fileRef}
                  alt={`${domain} ${t("report.evidenceScreenshot")}`}
                  className={styles.thumbImg}
                />
              </button>
            </div>
          );
        }

        const parsed = parsePayload(ev.payloadJson);
        if (parsed === null || parsed === "") return null;

        if (ev.kind === "HtmlSnippet") {
          const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
          return (
            <div key={ev.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <Code size={15} weight="bold" aria-hidden="true" />
                <span>{t("report.evidenceHtml")}</span>
              </div>
              <pre className={styles.codeBlock}>
                <code>{text}</code>
              </pre>
            </div>
          );
        }

        if (Array.isArray(parsed)) {
          const items = parsed.map((entry) => String(entry)).filter(Boolean);
          const looksLikeUrls = items.length > 0 && items.every(isUrlString);
          return (
            <div key={ev.id} className={styles.item}>
              <div className={styles.itemHeader}>
                {looksLikeUrls ? (
                  <LinkSimple size={15} weight="bold" aria-hidden="true" />
                ) : (
                  <Gauge size={15} weight="bold" aria-hidden="true" />
                )}
                <span>{looksLikeUrls ? t("report.evidenceUrlList") : t("report.evidenceMetric")}</span>
              </div>
              <ul className={styles.bulletList}>
                {items.slice(0, 8).map((val, i) => (
                  <li key={i} className={styles.bulletItem}>
                    {isUrlString(val) ? (
                      <a href={val} target="_blank" rel="noreferrer" className={styles.monoLink}>
                        {val}
                      </a>
                    ) : (
                      <span className={styles.monoVal}>{val}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (typeof parsed === "object" && parsed !== null) {
          const entries = Object.entries(parsed as Record<string, unknown>);
          return (
            <div key={ev.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <Gauge size={15} weight="bold" aria-hidden="true" />
                <span>{t("report.evidenceMetric")}</span>
              </div>
              <dl className={styles.kvGrid}>
                {entries.map(([k, v]) => (
                  <div key={k} className={styles.kvRow}>
                    <dt className={styles.kvKey}>{k}</dt>
                    <dd className={styles.kvVal}>
                      {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        }

        const strVal = String(parsed);
        return (
          <div key={ev.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <Gauge size={15} weight="bold" aria-hidden="true" />
              <span>{t("report.evidenceMetric")}</span>
            </div>
            <p className={styles.metricText}>{strVal}</p>
          </div>
        );
      })}

      <Modal
        open={Boolean(previewRef)}
        onClose={() => setPreviewRef(null)}
        title={`${domain} — ${t("report.evidenceScreenshot")}`}
        size="xl"
      >
        {previewRef && (
          <div className={styles.modalImgWrap}>
            <ArtifactImage fileRef={previewRef} alt={domain} className={styles.modalImg} />
          </div>
        )}
      </Modal>
    </div>
  );
}
