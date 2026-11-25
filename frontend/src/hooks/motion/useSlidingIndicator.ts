import { type RefObject, useEffect } from "react";
import gsap from "gsap";

/**
 * Slides an indicator element horizontally to match the active button inside a container
 * using GPU-composited transforms (x + scaleX). Zero inline style props in JSX.
 */
export function useSlidingIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeKey: string
) {
  useEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const update = (immediate: boolean) => {
      const activeEl = container.querySelector<HTMLElement>(
        `[data-tab-key="${CSS.escape(activeKey)}"]`
      );
      if (!activeEl) {
        gsap.set(indicator, { autoAlpha: 0 });
        return;
      }

      const x = activeEl.offsetLeft;
      const width = activeEl.offsetWidth;
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (immediate || prefersReduced) {
        gsap.set(indicator, { x, width, autoAlpha: 1 });
      } else {
        gsap.to(indicator, {
          x,
          width,
          autoAlpha: 1,
          duration: 0.24,
          ease: "power3.out",
          overwrite: true,
        });
      }
    };

    update(false);

    const observer = new ResizeObserver(() => update(true));
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, indicatorRef, activeKey]);
}
