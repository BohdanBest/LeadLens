import { type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Disciplined, one-shot route entrance animation per Taste Skill motion rules:
 * GPU-only (transform + opacity), power3.out, ~460ms, zero bounce, full reduced-motion support.
 */
export function usePageEntrance(containerRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      const root = containerRef.current;
      if (!root) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const header = root.querySelector<HTMLElement>("[data-animate='page-header']");
        const sections = root.querySelectorAll<HTMLElement>("[data-animate='page-section']");

        if (header) {
          gsap.from(header, {
            y: 10,
            opacity: 0,
            duration: 0.42,
            ease: "power3.out",
            clearProps: "transform,opacity",
          });
        }

        if (sections.length > 0) {
          gsap.from(sections, {
            y: 12,
            opacity: 0,
            duration: 0.46,
            stagger: 0.06,
            delay: 0.05,
            ease: "power3.out",
            clearProps: "transform,opacity",
          });
        }
      });

      return () => mm.revert();
    },
    { scope: containerRef, dependencies: deps }
  );
}
