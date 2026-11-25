import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./ProgressBar.module.scss";

gsap.registerPlugin(useGSAP);

export type ProgressTone = "accent" | "healthy" | "moderate" | "weak" | "critical" | "neutral";

export interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  size = "md",
  label,
  className = "",
}: ProgressBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  useGSAP(
    () => {
      const el = fillRef.current;
      if (!el) return;
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        gsap.set(el, { scaleX: ratio });
      } else {
        gsap.to(el, {
          scaleX: ratio,
          duration: 0.6,
          ease: "power3.out",
          overwrite: true,
        });
      }
    },
    { dependencies: [ratio] }
  );

  return (
    <div
      className={`${styles.track} ${styles[size]} ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <div ref={fillRef} className={`${styles.fill} ${styles[tone]}`} />
    </div>
  );
}
