import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useUiStore } from "@/stores/useUiStore";
import {
  buildOpticalLensRig,
  type LensOrbitalNodeSpec,
  resolveIsDarkTheme,
} from "./opticalLensRig";
import styles from "./LeadLensGlobe3D.module.scss";

type AuthCamPreset = "overview" | "optics" | "orbit";

const AUTH_PRESETS: Record<AuthCamPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 7.5, 7.1], target: [0, -0.25, 0.2] },
  optics: { pos: [0, 10.6, 0.45], target: [0, 0, 0.25] },
  orbit: { pos: [6.4, 4.1, 6.4], target: [0, -0.1, 0] },
};

const DEMO_NODES: LensOrbitalNodeSpec[] = [
  { id: "healthy", tone: "healthy", angle: -Math.PI * 0.55, radius: 3.3, size: 0.19, baseY: 0.65 },
  { id: "moderate", tone: "moderate", angle: -Math.PI * 0.92, radius: 3.55, size: 0.21, baseY: 0.52 },
  { id: "weak-1", tone: "weak", angle: Math.PI * 0.72, radius: 3.45, size: 0.25, baseY: 0.46 },
  { id: "weak-2", tone: "weak", angle: Math.PI * 0.28, radius: 3.25, size: 0.24, baseY: 0.48 },
  { id: "critical-1", tone: "critical", angle: -Math.PI * 0.12, radius: 3.65, size: 0.25, baseY: 0.62 },
  { id: "critical-2", tone: "critical", angle: -Math.PI * 0.34, radius: 3.45, size: 0.22, baseY: 0.72 },
];

export function LeadLensGlobe3D() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const hostRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<AuthCamPreset>("overview");
  const presetRef = useRef<AuthCamPreset>("overview");
  const goalRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const selectPreset = (next: AuthCamPreset) => {
    presetRef.current = next;
    setPreset(next);
    const cfg = AUTH_PRESETS[next];
    goalRef.current = {
      pos: new THREE.Vector3(...cfg.pos),
      target: new THREE.Vector3(...cfg.target),
    };
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isDark = resolveIsDarkTheme(theme);
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    const width = host.clientWidth || 400;
    const height = host.clientHeight || 260;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.12 : 1.05;
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(isDark ? 0x0b0f13 : 0xf4f7f8, isDark ? 0.03 : 0.02);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 60);
    const startCfg = AUTH_PRESETS[presetRef.current];
    camera.position.set(...startCfg.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.target.set(...startCfg.target);
    controls.update();

    const rig = buildOpticalLensRig(scene, renderer, DEMO_NODES, isDark);

    let dragging = false;
    const onDown = () => {
      dragging = true;
      goalRef.current = null;
    };
    const onUp = () => {
      dragging = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(200, Math.floor(entry.contentRect.width));
      const h = Math.max(200, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(host);

    let rafId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const goal = goalRef.current;
      if (goal) {
        const alpha = prefersReduced ? 1 : 0.08;
        camera.position.lerp(goal.pos, alpha);
        controls.target.lerp(goal.target, alpha);
        if (camera.position.distanceTo(goal.pos) < 0.04) {
          goalRef.current = null;
        }
      } else if (presetRef.current === "orbit" && !dragging && !prefersReduced) {
        const a = elapsed * 0.25;
        camera.position.set(Math.cos(a) * 7.8, 2.6, Math.sin(a) * 7.8);
      }

      if (!prefersReduced) {
        rig.reticleGroup.rotation.y = elapsed * 0.04;
      }

      const apertureBase = presetRef.current === "optics" ? 0.28 : 0.42;
      const wave = prefersReduced ? 0 : Math.sin(elapsed * 0.9) * 0.06;
      rig.irisBlades.forEach(({ pivot, baseAngle }) => {
        pivot.rotation.y += (-baseAngle + apertureBase + wave - pivot.rotation.y) * 0.08;
      });

      rig.nodeGroups.forEach(({ group, gem, spec }, idx) => {
        const a = spec.angle + (prefersReduced ? 0 : elapsed * 0.16);
        group.position.x = Math.cos(a) * spec.radius;
        group.position.z = Math.sin(a) * spec.radius;
        gem.position.y = spec.baseY + (prefersReduced ? 0 : Math.sin(elapsed * 1.6 + idx * 1.1) * 0.08);
        if (!prefersReduced) {
          gem.rotation.y = elapsed * 0.55 + idx;
          gem.rotation.x = elapsed * 0.3 + idx;
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      controls.dispose();
      rig.dispose();
      renderer.dispose();
    };
  }, [theme]);

  const presetItems: Array<{ id: AuthCamPreset; label: string }> = [
    { id: "overview", label: t("dashboard.scene3dCamOverview") },
    { id: "optics", label: t("dashboard.scene3dCamOptics") },
    { id: "orbit", label: t("dashboard.scene3dCamOrbit") },
  ];

  return (
    <div className={styles.wrap}>
      <div ref={hostRef} className={styles.globe} aria-hidden="true" />
      <div className={styles.dock} role="group" aria-label={t("dashboard.scene3dTitle")}>
        {presetItems.map((btn) => (
          <button
            key={btn.id}
            type="button"
            className={`${styles.dockBtn} ${preset === btn.id ? styles.dockBtnActive : ""}`.trim()}
            onClick={() => selectPreset(btn.id)}
            aria-pressed={preset === btn.id}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
