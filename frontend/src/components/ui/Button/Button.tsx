import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <CircleNotch className={styles.spinner} size={18} weight="bold" aria-hidden="true" />
      ) : (
        icon && <span className={styles.icon} aria-hidden="true">{icon}</span>
      )}
      {children && <span className={styles.label}>{children}</span>}
      {!loading && iconRight && <span className={styles.icon} aria-hidden="true">{iconRight}</span>}
    </button>
  );
}
