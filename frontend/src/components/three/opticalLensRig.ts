import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type LensNodeTone = "healthy" | "moderate" | "weak" | "critical" | "accent";

export interface LensOrbitalNodeSpec {
  id: string;
  tone: LensNodeTone;
  angle: number;
  radius: number;
  size: number;
  baseY: number;
}

export interface BuiltOpticalLensRig {
  root: THREE.Group;
  irisBlades: Array<{ pivot: THREE.Group; baseAngle: number }>;
  bezelMat: THREE.MeshStandardMaterial;
  reticleGroup: THREE.Group;
  nodeMeshes: THREE.Mesh[];
  nodeGroups: Array<{
    group: THREE.Group;
    gem: THREE.Mesh;
    halo: THREE.Mesh;
    spec: LensOrbitalNodeSpec;
  }>;
  dispose: () => void;
}

export function resolveIsDarkTheme(theme: "system" | "light" | "dark"): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function toneToGemHex(tone: LensNodeTone, isDark: boolean): number {
  switch (tone) {
    case "healthy":
      return isDark ? 0x4ade80 : 0x157347;
    case "moderate":
      return isDark ? 0xfacc15 : 0xc07d0a;
    case "weak":
      return isDark ? 0xfb923c : 0xd04f18;
    case "critical":
      return isDark ? 0xf87171 : 0xc52222;
    default:
      return isDark ? 0x2dd4bf : 0x0d7480;
  }
}

/**
 * Builds the precision LeadLens 3D optical assembly styled to the "Frost & Slate" design system:
 * - Neutral architectural slate/titanium lens barrel + 36 grip ribs
 * - Single architectural teal (#0d7480 / #2dd4bf) bezel ring & rim lighting
 * - 8 sharp metallic aperture blades clearly visible through crystal-clear glass dome
 * - Calibrated reticle & focus ticks adapted to light & dark themes
 * - Orbiting faceted crystal nodes with matching orbital rings
 */
export function buildOpticalLensRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  nodes: LensOrbitalNodeSpec[],
  isDark: boolean
): BuiltOpticalLensRig {
  const disposables: Array<{ dispose: () => void }> = [];

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  disposables.push(pmrem, envTex);

  const accentHex = isDark ? 0x2dd4bf : 0x0d7480;

  // Neutral studio lighting matching Frost & Slate
  const hemi = new THREE.HemisphereLight(
    isDark ? 0xe6f0f2 : 0xffffff,
    isDark ? 0x0b0f13 : 0xdbe3e6,
    isDark ? 0.9 : 1.25
  );
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.8 : 1.65);
  keyLight.position.set(5, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0006;
  scene.add(keyLight);

  const rimTeal = new THREE.PointLight(accentHex, isDark ? 5.5 : 3.2, 16, 1.5);
  rimTeal.position.set(-2.8, 2.8, -3.2);
  scene.add(rimTeal);

  const fillLight = new THREE.DirectionalLight(0xeef6f7, isDark ? 0.55 : 0.75);
  fillLight.position.set(4, 3, -5);
  scene.add(fillLight);

  // Subtle shadow-receiving floor plane so the lens feels grounded in Light & Dark modes
  const shadowFloorGeom = new THREE.PlaneGeometry(24, 24);
  const shadowFloorMat = new THREE.ShadowMaterial({ opacity: isDark ? 0.36 : 0.12 });
  const shadowFloor = new THREE.Mesh(shadowFloorGeom, shadowFloorMat);
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);
  disposables.push(shadowFloorGeom, shadowFloorMat);

  const root = new THREE.Group();
  scene.add(root);

  // 1. Machined anodized graphite-slate barrel (LatheGeometry)
  const barrelPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.42, 0.0),
    new THREE.Vector2(1.62, 0.14),
    new THREE.Vector2(1.74, 0.36),
    new THREE.Vector2(1.78, 0.62),
    new THREE.Vector2(1.78, 1.05),
    new THREE.Vector2(1.71, 1.18),
    new THREE.Vector2(1.56, 1.24),
    new THREE.Vector2(1.38, 1.22),
    new THREE.Vector2(1.26, 1.06),
    new THREE.Vector2(1.22, 0.42),
    new THREE.Vector2(0.0, 0.42),
  ];
  const barrelGeom = new THREE.LatheGeometry(barrelPoints, 72);
  const barrelMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x1a222b : 0x26343c,
    roughness: isDark ? 0.25 : 0.28,
    metalness: 0.82,
    envMapIntensity: isDark ? 1.15 : 1.05,
  });
  const barrel = new THREE.Mesh(barrelGeom, barrelMat);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  root.add(barrel);
  disposables.push(barrelGeom, barrelMat);

  // Deep matte inner optical chamber
  const chamberGeom = new THREE.CircleGeometry(1.21, 48);
  const chamberMat = new THREE.MeshStandardMaterial({
    color: 0x0c1216,
    roughness: 0.85,
    metalness: 0.15,
  });
  const chamber = new THREE.Mesh(chamberGeom, chamberMat);
  chamber.rotation.x = -Math.PI / 2;
  chamber.position.y = 0.45;
  root.add(chamber);
  disposables.push(chamberGeom, chamberMat);

  // 36 vertical focus-grip ribs
  const ribCount = 36;
  const ribGeom = new THREE.BoxGeometry(0.055, 0.44, 0.06);
  const ribMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x2d3a45 : 0x3b4d58,
    roughness: 0.35,
    metalness: 0.78,
  });
  const ribsMesh = new THREE.InstancedMesh(ribGeom, ribMat, ribCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 1.77, 0.66, Math.sin(a) * 1.77);
    dummy.rotation.set(0, -a + Math.PI / 2, 0);
    dummy.updateMatrix();
    ribsMesh.setMatrixAt(i, dummy.matrix);
  }
  ribsMesh.instanceMatrix.needsUpdate = true;
  root.add(ribsMesh);
  disposables.push(ribGeom, ribMat, ribsMesh);

  // Architectural teal bezel ring
  const bezelGeom = new THREE.TorusGeometry(1.735, 0.025, 18, 96);
  const bezelMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: isDark ? 1.55 : 0.75,
    roughness: 0.22,
    metalness: 0.35,
  });
  const bezelRing = new THREE.Mesh(bezelGeom, bezelMat);
  bezelRing.rotation.x = Math.PI / 2;
  bezelRing.position.y = 1.07;
  root.add(bezelRing);
  disposables.push(bezelGeom, bezelMat);

  // Inner brushed metallic ring
  const innerRimGeom = new THREE.TorusGeometry(1.36, 0.016, 14, 72);
  const innerRimMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x6b7e89 : 0x9ab0ba,
    roughness: 0.2,
    metalness: 0.9,
  });
  const innerRim = new THREE.Mesh(innerRimGeom, innerRimMat);
  innerRim.rotation.x = Math.PI / 2;
  innerRim.position.y = 1.19;
  root.add(innerRim);
  disposables.push(innerRimGeom, innerRimMat);

  // 2. 8 crisp overlapping metallic aperture blades (clearly visible through the glass!)
  const irisGroup = new THREE.Group();
  irisGroup.position.y = 0.78;
  root.add(irisGroup);

  const bladeCount = 8;
  const bladeGeom = new THREE.BoxGeometry(0.72, 0.02, 0.3);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: isDark ? 0x354754 : 0x2a3a45,
    roughness: 0.2,
    metalness: 0.88,
    envMapIntensity: 1.35,
  });
  const bladeEdgeGeom = new THREE.EdgesGeometry(bladeGeom);
  const bladeEdgeMat = new THREE.LineBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: isDark ? 0.62 : 0.55,
  });
  disposables.push(bladeGeom, bladeMat, bladeEdgeGeom, bladeEdgeMat);

  const irisBlades: Array<{ pivot: THREE.Group; baseAngle: number }> = [];
  for (let i = 0; i < bladeCount; i++) {
    const baseAngle = (i / bladeCount) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(baseAngle) * 0.94, i * 0.005, Math.sin(baseAngle) * 0.94);
    pivot.rotation.y = -baseAngle + 0.52;

    const blade = new THREE.Mesh(bladeGeom, bladeMat);
    blade.position.set(-0.31, 0, 0.12);
    const edge = new THREE.LineSegments(bladeEdgeGeom, bladeEdgeMat);
    blade.add(edge);

    pivot.add(blade);
    irisGroup.add(pivot);
    irisBlades.push({ pivot, baseAngle });
  }

  // 3. Crystal-clear domed optical glass lens (depthWrite: false keeps blades razor-sharp!)
  const domeGeom = new THREE.SphereGeometry(
    1.18,
    64,
    32,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.42
  );
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: isDark ? 0xd5f3f0 : 0xe9f6f7,
    metalness: 0.02,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: isDark ? 0.26 : 0.3,
    depthWrite: false,
    reflectivity: 0.95,
    envMapIntensity: 1.5,
  });
  const dome = new THREE.Mesh(domeGeom, domeMat);
  dome.position.y = 0.34;
  dome.renderOrder = 3;
  root.add(dome);
  disposables.push(domeGeom, domeMat);

  // 4. Precision calibrated Frost & Slate reticle on the floor
  const reticleGroup = new THREE.Group();
  reticleGroup.position.y = 0.02;
  scene.add(reticleGroup);

  const ringRadii = [2.25, 2.72, 3.48, 3.95];
  ringRadii.forEach((r, idx) => {
    const rg = new THREE.RingGeometry(r - 0.008, r + 0.008, 96);
    const rm = new THREE.MeshBasicMaterial({
      color: idx === 1 ? accentHex : isDark ? 0x3b4d5a : 0x9fb2bc,
      transparent: true,
      opacity: idx === 1 ? (isDark ? 0.55 : 0.45) : isDark ? 0.32 : 0.48,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(rg, rm);
    m.rotation.x = -Math.PI / 2;
    reticleGroup.add(m);
    disposables.push(rg, rm);
  });

  const tickCount = 60;
  const minorTickGeom = new THREE.PlaneGeometry(0.015, 0.16);
  const majorTickGeom = new THREE.PlaneGeometry(0.026, 0.3);
  const minorTickMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0x4f6472 : 0x8aa0ac,
    transparent: true,
    opacity: isDark ? 0.5 : 0.58,
    side: THREE.DoubleSide,
  });
  const majorTickMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: isDark ? 0.82 : 0.72,
    side: THREE.DoubleSide,
  });
  disposables.push(minorTickGeom, majorTickGeom, minorTickMat, majorTickMat);

  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2;
    const isMajor = i % 5 === 0;
    const tick = new THREE.Mesh(
      isMajor ? majorTickGeom : minorTickGeom,
      isMajor ? majorTickMat : minorTickMat
    );
    const r = isMajor ? 2.52 : 2.58;
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a + Math.PI / 2;
    tick.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r);
    reticleGroup.add(tick);
  }

  // 5. Orbiting faceted crystal nodes with matching rings
  const gemGeom = new THREE.IcosahedronGeometry(1, 1);
  disposables.push(gemGeom);

  const nodeMeshes: THREE.Mesh[] = [];
  const nodeGroups: BuiltOpticalLensRig["nodeGroups"] = [];

  nodes.forEach((spec, idx) => {
    const group = new THREE.Group();
    const colorHex = toneToGemHex(spec.tone, isDark);
    const baseColor = new THREE.Color(colorHex);

    const gemMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone(),
      emissiveIntensity: isDark ? 0.28 : 0.12,
      roughness: 0.24,
      metalness: 0.14,
      flatShading: true,
    });
    const gem = new THREE.Mesh(gemGeom, gemMat);
    gem.scale.setScalar(spec.size);
    gem.position.y = spec.baseY;
    gem.castShadow = true;
    gem.userData = { nodeIndex: idx, nodeId: spec.id };
    group.add(gem);

    const haloRadius = spec.size * 1.5;
    const haloGeom = new THREE.RingGeometry(haloRadius - 0.02, haloRadius + 0.02, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: isDark ? 0.72 : 0.65,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = Math.max(0.06, spec.baseY - spec.size * 0.92);
    group.add(halo);

    group.position.set(Math.cos(spec.angle) * spec.radius, 0, Math.sin(spec.angle) * spec.radius);
    scene.add(group);

    disposables.push(gemMat, haloGeom, haloMat);
    nodeMeshes.push(gem);
    nodeGroups.push({ group, gem, halo, spec });
  });

  return {
    root,
    irisBlades,
    bezelMat,
    reticleGroup,
    nodeMeshes,
    nodeGroups,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
