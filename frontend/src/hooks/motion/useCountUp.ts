import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function useCountUp(target: number, decimals = 0, duration = 0.75): number {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(0);

  useGSAP(
    () => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReduced || !Number.isFinite(target)) {
        previousRef.current = target;
        setDisplay(target);
        return;
      }

      const obj = { value: previousRef.current };
      const tween = gsap.to(obj, {
        value: target,
        duration,
        ease: "power3.out",
        onUpdate: () => {
          const factor = 10 ** decimals;
          setDisplay(Math.round(obj.value * factor) / factor);
        },
        onComplete: () => {
          previousRef.current = target;
          setDisplay(target);
        },
      });

      return () => {
        tween.kill();
      };
    },
    { dependencies: [target, decimals, duration] }
  );

  return display;
}
