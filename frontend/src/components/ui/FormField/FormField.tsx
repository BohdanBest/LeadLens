import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./FormField.module.scss";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`${styles.field} ${className}`.trim()}>
      <label htmlFor={id} className={styles.label}>
        <span>{label}</span>
        {required && <span className={styles.required} aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  icon?: ReactNode;
}

export function Input({ hasError, icon, className = "", ...rest }: InputProps) {
  if (icon) {
    return (
      <div className={styles.inputWrap}>
        <span className={styles.inputIcon} aria-hidden="true">
          {icon}
        </span>
        <input
          className={`${styles.control} ${styles.withIcon} ${hasError ? styles.invalid : ""} ${className}`.trim()}
          aria-invalid={hasError || undefined}
          {...rest}
        />
      </div>
    );
  }
  return (
    <input
      className={`${styles.control} ${hasError ? styles.invalid : ""} ${className}`.trim()}
      aria-invalid={hasError || undefined}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export function Select({ hasError, className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`${styles.control} ${styles.select} ${hasError ? styles.invalid : ""} ${className}`.trim()}
      aria-invalid={hasError || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
  mono?: boolean;
}

export function Textarea({ hasError, mono, className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      className={`${styles.control} ${styles.textarea} ${mono ? styles.mono : ""} ${hasError ? styles.invalid : ""} ${className}`.trim()}
      aria-invalid={hasError || undefined}
      {...rest}
    />
  );
}

export interface AlertBannerProps {
  tone: "error" | "success" | "warning" | "info";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AlertBanner({ tone, icon, children, className = "" }: AlertBannerProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${styles.alert} ${styles[`alert_${tone}`]} ${className}`.trim()}
    >
      {icon && <span className={styles.alertIcon} aria-hidden="true">{icon}</span>}
      <div className={styles.alertBody}>{children}</div>
    </div>
  );
}
