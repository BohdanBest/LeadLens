import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useCountUp } from "@/hooks/motion/useCountUp";
import styles from "./ScoreGauge.module.scss";

gsap.registerPlugin(useGSAP);

export interface ScoreGaugeProps {
  score: number;
  level: string;
  label: string;
  size?: "md" | "lg";
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function levelToTone(level: string): "healthy" | "moderate" | "weak" | "critical" | "neutral" {
  switch (level) {
    case "Healthy":
      return "healthy";
    case "Moderate":
      return "moderate";
    case "Weak":
      return "weak";
    case "Critical":
      return "critical";
    default:
      return "neutral";
  }
}

export function ScoreGauge({ score, level, label, size = "lg" }: ScoreGaugeProps) {
  const ringRef = useRef<SVGCircleElement>(null);
  const clamped = Math.min(100, Math.max(0, score));
  const animatedScore = useCountUp(clamped, 0, 0.85);
  const tone = levelToTone(level);
  const targetOffset = CIRCUMFERENCE * (1 - clamped / 100);

  useGSAP(
    () => {
      const circle = ringRef.current;
      if (!circle) return;
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        gsap.set(circle, { strokeDashoffset: targetOffset });
      } else {
        gsap.fromTo(
          circle,
          { strokeDashoffset: CIRCUMFERENCE },
          {
            strokeDashoffset: targetOffset,
            duration: 0.9,
            ease: "power3.out",
          }
        );
      }
    },
    { dependencies: [targetOffset] }
  );

  return (
    <div
      className={`${styles.gauge} ${styles[size]} ${styles[tone]}`}
      role="img"
      aria-label={`${label}: ${clamped} / 100`}
    >
      <svg viewBox="0 0 128 128" className={styles.svg} aria-hidden="true">
        <circle className={styles.track} cx="64" cy="64" r={RADIUS} />
        <circle
          ref={ringRef}
          className={styles.progress}
          cx="64"
          cy="64"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>{animatedScore}</span>
        <span className={styles.outOf}>/ 100</span>
      </div>
    </div>
  );
}
