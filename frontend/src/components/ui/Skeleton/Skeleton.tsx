import styles from "./Skeleton.module.scss";

export type SkeletonVariant = "line" | "title" | "kpi" | "card" | "row" | "gauge";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
}

export function Skeleton({ variant = "line", count = 1, className = "" }: SkeletonProps) {
  if (count <= 1) {
    return <div className={`${styles.skeleton} ${styles[variant]} ${className}`.trim()} aria-hidden="true" />;
  }

  return (
    <div className={styles.stack} aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`${styles.skeleton} ${styles[variant]} ${className}`.trim()}
        />
      ))}
    </div>
  );
}
