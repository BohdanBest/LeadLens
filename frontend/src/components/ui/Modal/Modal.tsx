import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import gsap from "gsap";
import styles from "./Modal.module.scss";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced && panelRef.current) {
        gsap.fromTo(
          panelRef.current,
          { opacity: 0, y: 10, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "power3.out", clearProps: "transform,opacity" }
        );
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Light-dismiss fallback for browsers without native closedby="any" (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`${styles.dialog} ${styles[size]}`}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = "";
        }
        onClose();
      }}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div ref={panelRef} className={styles.panel}>
        <header className={styles.header}>
          <h1 id={titleId} className={styles.title}>
            {title}
          </h1>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
