import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowUpRight, Cube } from "@phosphor-icons/react";
import { useUiStore } from "@/stores/useUiStore";
import {
  buildOpticalLensRig,
  type LensNodeTone,
  type LensOrbitalNodeSpec,
  resolveIsDarkTheme,
} from "./opticalLensRig";
import styles from "./Dashboard3DScene.module.scss";

export type Bar3DTone = LensNodeTone;

export interface Bar3DItem {
  id: string;
  label: string;
  value: number;
  displayValue: string;
  subtext?: string;
  tone: Bar3DTone;
  href: string;
  actionHint: string;
}

export interface Dashboard3DSceneProps {
  items: Bar3DItem[];
  maxValue: number;
  onSelect: (item: Bar3DItem) => void;
}

type CameraPreset = "overview" | "optics" | "orbit";

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 7.2, 6.8], target: [0, -0.15, 0.2] },
  optics: { pos: [0, 10.4, 0.45], target: [0, 0, 0.2] },
  orbit: { pos: [6.2, 3.9, 6.2], target: [0, 0, 0] },
};

export function Dashboard3DScene({ items, maxValue, onSelect }: Dashboard3DSceneProps) {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const presetRef = useRef<CameraPreset>("overview");
  const transitionGoalRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const [hovered, setHovered] = useState<Bar3DItem | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const nodeSpecs = useMemo<LensOrbitalNodeSpec[]>(() => {
    const safeMax = Math.max(1, maxValue);
    const total = Math.max(1, items.length);
    return items.map((item, idx) => {
      const ratio = Math.max(0, Math.min(1, item.value / safeMax));
      const angle = (idx / total) * Math.PI * 2 - Math.PI * 0.65;
      const radius = idx % 2 === 0 ? 3.25 : 3.72;
      const size = 0.16 + ratio * 0.12;
      const baseY = 0.42 + (idx % 3) * 0.22 + ratio * 0.18;
      return { id: item.id, tone: item.tone, angle, radius, size, baseY };
    });
  }, [items, maxValue]);

  const applyPreset = (next: CameraPreset) => {
    presetRef.current = next;
    setCameraPreset(next);
    const cfg = CAMERA_PRESETS[next];
    transitionGoalRef.current = {
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
      setWebglUnavailable(true);
      return;
    }

    const width = host.clientWidth || 720;
    const height = host.clientHeight || 360;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.12 : 1.05;

    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(isDark ? 0x0b0f13 : 0xf4f7f8, isDark ? 0.032 : 0.022);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 60);
    const initialPreset = CAMERA_PRESETS[presetRef.current];
    camera.position.set(...initialPreset.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 14;
    controls.minPolarAngle = 0.06;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(...initialPreset.target);
    controls.update();

    const rig = buildOpticalLensRig(scene, renderer, nodeSpecs, isDark);

    // Raycasting on orbiting crystal nodes
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-99, -99);
    let hoveredIndex = -1;
    let pointerDownPos = { x: 0, y: 0 };
    let userDragging = false;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      userDragging = true;
      transitionGoalRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(rig.nodeMeshes, false);
      const nextIdx = hits.length > 0 ? (hits[0].object.userData.nodeIndex as number) : -1;

      if (nextIdx !== hoveredIndex) {
        hoveredIndex = nextIdx;
        renderer.domElement.classList.toggle(styles.pointerCursor, nextIdx >= 0);
        setHovered(nextIdx >= 0 ? items[nextIdx] ?? null : null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      userDragging = false;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist < 6 && hoveredIndex >= 0 && items[hoveredIndex]) {
        onSelectRef.current(items[hoveredIndex]);
      }
    };

    const onPointerLeave = () => {
      userDragging = false;
      hoveredIndex = -1;
      renderer.domElement.classList.remove(styles.pointerCursor);
      setHovered(null);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(260, Math.floor(entry.contentRect.width));
      const h = Math.max(260, Math.floor(entry.contentRect.height));
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

      // Smooth camera transition when switching Overview / Optics / Orbit
      const goal = transitionGoalRef.current;
      if (goal) {
        const lerpAlpha = prefersReduced ? 1 : 0.08;
        camera.position.lerp(goal.pos, lerpAlpha);
        controls.target.lerp(goal.target, lerpAlpha);
        if (camera.position.distanceTo(goal.pos) < 0.04) {
          transitionGoalRef.current = null;
        }
      } else if (presetRef.current === "orbit" && !userDragging && !prefersReduced) {
        const orbitAngle = elapsed * 0.24;
        const r = 7.4;
        camera.position.x = Math.cos(orbitAngle) * r;
        camera.position.z = Math.sin(orbitAngle) * r;
        camera.position.y = 2.45 + Math.sin(elapsed * 0.5) * 0.28;
      }

      // Subtle optical reticle slow rotation
      if (!prefersReduced) {
        rig.reticleGroup.rotation.y = elapsed * 0.04;
      }

      // Animate iris aperture blades (breathe smoothly + react to Optics mode / hover)
      const apertureBase =
        presetRef.current === "optics" ? 0.28 : hoveredIndex >= 0 ? 0.34 : 0.52;
      const apertureWave = prefersReduced ? 0 : Math.sin(elapsed * 0.9) * 0.06;
      rig.irisBlades.forEach(({ pivot, baseAngle }) => {
        const targetRot = -baseAngle + apertureBase + apertureWave;
        pivot.rotation.y += (targetRot - pivot.rotation.y) * 0.08;
      });

      // Animate bezel glow
      const baseGlow = isDark ? 1.55 : 0.72;
      rig.bezelMat.emissiveIntensity =
        hoveredIndex >= 0
          ? baseGlow + 0.7
          : baseGlow + (prefersReduced ? 0 : Math.sin(elapsed * 1.8) * 0.2);

      // Animate orbiting faceted lead crystals
      rig.nodeGroups.forEach(({ group, gem, halo, spec }, idx) => {
        const isHov = idx === hoveredIndex;
        const orbitSpeed = prefersReduced ? 0 : 0.14;
        const angle = spec.angle + elapsed * orbitSpeed;
        group.position.x = Math.cos(angle) * spec.radius;
        group.position.z = Math.sin(angle) * spec.radius;

        const bob = prefersReduced ? 0 : Math.sin(elapsed * 1.7 + idx * 1.3) * 0.09;
        const targetY = spec.baseY + bob + (isHov ? 0.22 : 0);
        gem.position.y += (targetY - gem.position.y) * 0.14;

        if (!prefersReduced) {
          gem.rotation.y = elapsed * 0.6 + idx;
          gem.rotation.x = elapsed * 0.35 + idx * 0.5;
        }

        const targetScale = spec.size * (isHov ? 1.32 : 1);
        gem.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.14);

        const gemMat = gem.material as THREE.MeshStandardMaterial;
        const targetEmissive = isHov ? 0.75 : 0.28;
        gemMat.emissiveIntensity += (targetEmissive - gemMat.emissiveIntensity) * 0.15;

        const haloScale = isHov ? 1.24 : 1;
        halo.scale.lerp(new THREE.Vector3(haloScale, haloScale, 1), 0.14);
        const haloMat = halo.material as THREE.MeshBasicMaterial;
        haloMat.opacity += ((isHov ? 0.95 : 0.62) - haloMat.opacity) * 0.15;
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      rig.dispose();
      renderer.dispose();
    };
  }, [items, nodeSpecs, theme]);

  if (webglUnavailable) {
    return (
      <div className={styles.fallback}>
        <Cube size={24} weight="duotone" aria-hidden="true" />
        <span>{t("dashboard.scene3dFallback")}</span>
      </div>
    );
  }

  const presetButtons: Array<{ id: CameraPreset; label: string }> = [
    { id: "overview", label: t("dashboard.scene3dCamOverview") },
    { id: "optics", label: t("dashboard.scene3dCamOptics") },
    { id: "orbit", label: t("dashboard.scene3dCamOrbit") },
  ];

  return (
    <div className={styles.stage}>
      <div className={styles.viewport}>
        <div ref={hostRef} className={styles.canvasHost} aria-label={t("dashboard.scene3dTitle")} />

        <div className={styles.hudTopLeft}>
          {hovered ? (
            <div className={styles.tooltipCard} role="status" aria-live="polite">
              <div className={styles.tooltipTop}>
                <span className={`${styles.toneDot} ${styles[`tone_${hovered.tone}`]}`} aria-hidden="true" />
                <strong className={styles.tooltipTitle}>{hovered.label}</strong>
                <span className={styles.tooltipVal}>{hovered.displayValue}</span>
              </div>
              {hovered.subtext && <span className={styles.tooltipSub}>{hovered.subtext}</span>}
              <span className={styles.tooltipAction}>
                <span>{hovered.actionHint}</span>
                <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
              </span>
            </div>
          ) : (
            <div className={styles.hintPill}>
              <Cube size={14} weight="duotone" aria-hidden="true" />
              <span>{t("dashboard.scene3dHint")}</span>
            </div>
          )}
        </div>

        <div className={styles.presetDock} role="group" aria-label={t("dashboard.scene3dTitle")}>
          {presetButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`${styles.presetBtn} ${cameraPreset === btn.id ? styles.presetBtnActive : ""}`.trim()}
              onClick={() => applyPreset(btn.id)}
              aria-pressed={cameraPreset === btn.id}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.legendBar}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.legendChip} ${hovered?.id === item.id ? styles.legendChipActive : ""}`.trim()}
            onClick={() => onSelect(item)}
            onMouseEnter={() => setHovered(item)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={`${styles.toneDot} ${styles[`tone_${item.tone}`]}`} aria-hidden="true" />
            <span className={styles.legendLabel}>{item.label}</span>
            <span className={styles.legendNum}>{item.displayValue}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
