import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, Info, Warning, X, XCircle } from "@phosphor-icons/react";
import gsap from "gsap";
import { type ToastItem, useUiStore } from "@/stores/useUiStore";
import styles from "./ToastViewport.module.scss";

function ToastCard({ toast }: { toast: ToastItem }) {
  const { t } = useTranslation();
  const dismissToast = useUiStore((s) => s.dismissToast);
  const cardRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 12, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: "power3.out", clearProps: "transform,opacity" }
      );
    }
  }, []);

  useEffect(() => {
    if (paused || toast.durationMs <= 0) return;
    const id = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(id);
  }, [paused, toast.durationMs, toast.id, dismissToast]);

  const icon =
    toast.tone === "success" ? (
      <CheckCircle size={20} weight="duotone" />
    ) : toast.tone === "error" ? (
      <XCircle size={20} weight="duotone" />
    ) : toast.tone === "warning" ? (
      <Warning size={20} weight="duotone" />
    ) : (
      <Info size={20} weight="duotone" />
    );

  return (
    <div
      ref={cardRef}
      className={`${styles.toast} ${styles[toast.tone]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => dismissToast(toast.id)}
        aria-label={t("common.close")}
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const { t } = useTranslation();
  const toasts = useUiStore((s) => s.toasts);
  const latestText = toasts.length > 0 ? toasts[toasts.length - 1].title : "";

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestText}
      </div>
      <div
        role="region"
        aria-label={t("common.notifications")}
        className={styles.viewport}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  );
}
