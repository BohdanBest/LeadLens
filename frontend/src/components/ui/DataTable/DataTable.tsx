import { type ReactNode } from "react";
import styles from "./DataTable.module.scss";

export interface DataTableProps {
  ariaLabel: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}

/**
 * Accessible responsive table container using container queries (`@container (width < 640px)`)
 * so cells with `data-label="..."` cleanly stack into readable cards on 360px screens.
 */
export function DataTable({ ariaLabel, children, compact = false, className = "" }: DataTableProps) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      className={`${styles.wrapper} ${compact ? styles.compact : ""} ${className}`.trim()}
    >
      <table className={styles.table}>{children}</table>
    </div>
  );
}
