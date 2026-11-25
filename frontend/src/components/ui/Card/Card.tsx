import { type HTMLAttributes, type ReactNode } from "react";
import styles from "./Card.module.scss";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  tone?: "default" | "elevated" | "danger" | "accent";
  children: ReactNode;
}

export function Card({
  as = "section",
  padding = "md",
  interactive = false,
  tone = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  const Tag = as;
  const classes = [
    styles.card,
    styles[`pad_${padding}`],
    styles[`tone_${tone}`],
    interactive ? styles.interactive : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, icon, action, className = "" }: CardHeaderProps) {
  return (
    <header className={`${styles.header} ${className}`.trim()}>
      <div className={styles.headerText}>
        <div className={styles.titleRow}>
          {icon && <span className={styles.headerIcon} aria-hidden="true">{icon}</span>}
          <h2 className={styles.title}>{title}</h2>
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </header>
  );
}
