import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { useSlidingIndicator } from "@/hooks/motion/useSlidingIndicator";
import styles from "./Tabs.module.scss";

export interface TabOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
}

export interface TabsProps<T extends string = string> {
  options: Array<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: "underline" | "segmented";
  className?: string;
}

export function Tabs<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = "underline",
  className = "",
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useSlidingIndicator(listRef, indicatorRef, value);

  const handleSelect = (nextValue: T, el: HTMLButtonElement | null) => {
    onChange(nextValue);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIdx: number | null = null;
    if (event.key === "ArrowRight") nextIdx = (index + 1) % options.length;
    else if (event.key === "ArrowLeft") nextIdx = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") nextIdx = 0;
    else if (event.key === "End") nextIdx = options.length - 1;

    if (nextIdx === null) return;
    event.preventDefault();
    const nextOption = options[nextIdx];
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const targetBtn = buttons?.[nextIdx] ?? null;
    targetBtn?.focus();
    handleSelect(nextOption.value, targetBtn);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`${styles.tablist} ${styles[variant]} ${className}`.trim()}
    >
      <span ref={indicatorRef} className={styles.indicator} aria-hidden="true" />
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            data-tab-key={opt.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={(e) => handleSelect(opt.value, e.currentTarget)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {opt.icon && <span className={styles.icon} aria-hidden="true">{opt.icon}</span>}
            <span className={styles.label}>{opt.label}</span>
            {opt.badge !== undefined && (
              <span className={styles.badge}>{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
