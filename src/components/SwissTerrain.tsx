import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { t, type Locale } from '../i18n';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ViewMode = 'satellite' | 'night';
type LineRing = [number, number][];
interface City { x: number; y: number; population: number; name: string }
interface SwissVectors {
  border: LineRing[];
  cantons: LineRing[];
  lakes: LineRing[];
  rivers: LineRing[];
  cities: City[];
}
interface SceneMeta {
  width: number;
  height: number;
  heightWidth: number;
  heightHeight: number;
  bounds: [number, number, number, number];
  heightMaxMetres: number;
  verticalExaggeration: number;
  attribution: string;
}

interface MotorwayCorridor {
  id: string;
  points: [number, number][]; // WGS84 latitude, longitude; generalized visual route
}

// Generalized Swiss motorway corridors. They are a visual guide, not surveyed road geometry.
const MOTORWAY_CORRIDORS: MotorwayCorridor[] = [
  { id: 'A1', points: [[46.2044, 6.1432], [46.3835, 6.2390], [46.5197, 6.6323], [46.7785, 6.6412], [46.9929, 6.9310], [47.1368, 7.2468], [46.9480, 7.4474], [47.0590, 7.6270], [47.2150, 7.7870], [47.3120, 7.8180], [47.3920, 8.0450], [47.4720, 8.3080], [47.3769, 8.5417], [47.4990, 8.7240], [47.4620, 9.0440], [47.4245, 9.3767]] },
  { id: 'A2', points: [[47.5596, 7.5886], [47.5100, 7.7000], [47.3120, 7.8180], [47.3000, 7.8800], [47.0502, 8.3093], [46.8804, 8.6444], [46.8170, 8.6500], [46.6670, 8.5860], [46.5280, 8.6060], [46.3590, 8.9700], [46.1950, 9.0240], [46.0037, 8.9510], [45.8710, 8.9830], [45.8330, 9.0310]] },
  { id: 'A3', points: [[47.5596, 7.5886], [47.5570, 7.7900], [47.5100, 8.0200], [47.4800, 8.2100], [47.4720, 8.3080], [47.3769, 8.5417], [47.2300, 8.6700], [47.2000, 8.7800], [47.1700, 8.9700], [47.0500, 9.4400]] },
  { id: 'A9', points: [[46.5197, 6.6323], [46.4620, 6.8410], [46.3180, 6.9680], [46.1020, 7.0730], [46.2330, 7.3600], [46.2920, 7.5300], [46.2940, 7.8820]] },
  { id: 'A12', points: [[46.9480, 7.4474], [46.8060, 7.1580], [46.6750, 7.1150], [46.6150, 7.0580], [46.4620, 6.8410]] },
  { id: 'A13', points: [[47.4490, 9.6370], [47.4245, 9.3767], [47.0500, 9.4400], [46.8500, 9.5300], [46.7000, 9.4400], [46.5500, 9.3200], [46.4600, 9.1900], [46.3900, 9.2300], [46.1950, 9.0240]] },
];

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
uniform sampler2D uSatellite;
uniform sampler2D uHillshade;
uniform sampler2D uNight;
uniform sampler2D uMask;
uniform vec2 uNightTexel;
uniform float uViewMode;
varying vec2 vUv;
float nightAt(vec2 uv) {
  return texture2D(uNight, clamp(uv, vec2(0.001), vec2(0.999))).r;
}
void main() {
  float mask = texture2D(uMask, vUv).r;
  if (mask < 0.04) discard;

  vec3 aerial = texture2D(uSatellite, vUv).rgb;
  float relief = texture2D(uHillshade, vUv).r;
  float terrainShade = 0.72 + relief * 0.48;
  vec3 satelliteView = aerial * terrainShade;

  // The nighttime surface keeps the real aerial geography, but is graded into a dark blue atlas.
  vec3 luminance = vec3(dot(aerial, vec3(0.299, 0.587, 0.114)));
  vec3 nightSurface = mix(vec3(0.008, 0.018, 0.034), luminance * vec3(0.10, 0.16, 0.24), 0.62);
  nightSurface *= 0.70 + relief * 0.55;

  float radiance = nightAt(vUv);
  // Lift the genuine VIIRS signal without flattening the whole terrain.
  // A soft lower threshold reveals smaller towns and valley settlements.
  float signal = pow(max(radiance, 0.0), 0.58);
  float core = smoothstep(0.008, 0.20, signal);
  float strongCore = smoothstep(0.30, 0.82, signal);

  // A wider, directional neighbourhood gives existing VIIRS road corridors
  // a little continuity. It does not invent roads or illuminate empty terrain.
  vec2 px = uNightTexel * 2.0;
  float halo = 0.0;
  halo += nightAt(vUv + vec2(px.x * 2.8, 0.0)) * 0.85;
  halo += nightAt(vUv - vec2(px.x * 2.8, 0.0)) * 0.85;
  halo += nightAt(vUv + vec2(0.0, px.y * 2.8)) * 0.85;
  halo += nightAt(vUv - vec2(0.0, px.y * 2.8)) * 0.85;
  halo += nightAt(vUv + px * vec2(1.5, 1.5)) * 0.55;
  halo += nightAt(vUv - px * vec2(1.5, 1.5)) * 0.55;
  halo += nightAt(vUv + px * vec2(1.5, -1.5)) * 0.55;
  halo += nightAt(vUv - px * vec2(1.5, -1.5)) * 0.55;
  halo += nightAt(vUv + vec2(px.x * 4.4, 0.0)) * 0.28;
  halo += nightAt(vUv - vec2(px.x * 4.4, 0.0)) * 0.28;
  halo += nightAt(vUv + vec2(0.0, px.y * 4.4)) * 0.28;
  halo += nightAt(vUv - vec2(0.0, px.y * 4.4)) * 0.28;
  halo /= 6.72;
  float corridor = smoothstep(0.012, 0.16, pow(max(halo, 0.0), 0.66));

  vec3 amber = vec3(1.0, 0.66, 0.34);
  vec3 warmWhite = vec3(1.0, 0.91, 0.74);
  vec3 cityCore = mix(amber, warmWhite, strongCore) * signal * 2.35;
  vec3 cityHalo = amber * corridor * (0.24 + core * 0.17);
  vec3 nightView = nightSurface + cityCore + cityHalo;

  vec3 color = mix(satelliteView, nightView, uViewMode);
  gl_FragColor = vec4(color, mask);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;



function loadTexture(url: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, texture => {
      texture.colorSpace = colorSpace;
      texture.anisotropy = 8;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      resolve(texture);
    }, undefined, reject);
  });
}

function makeTerrainGeometry(meta: SceneMeta, samples: Uint16Array, segmentsX: number, segmentsY: number) {
  const [minX, minY, maxX, maxY] = meta.bounds;
  const width = maxX - minX;
  const depth = maxY - minY;
  const positions = new Float32Array((segmentsX + 1) * (segmentsY + 1) * 3);
  const uvs = new Float32Array((segmentsX + 1) * (segmentsY + 1) * 2);
  const indices = new Uint32Array(segmentsX * segmentsY * 6);
  let p = 0, uv = 0, ii = 0;

  for (let y = 0; y <= segmentsY; y++) {
    const v = y / segmentsY;
    const sampleY = Math.min(meta.heightHeight - 1, Math.round(v * (meta.heightHeight - 1)));
    for (let x = 0; x <= segmentsX; x++) {
      const u = x / segmentsX;
      const sampleX = Math.min(meta.heightWidth - 1, Math.round(u * (meta.heightWidth - 1)));
      const encoded = samples[sampleY * meta.heightWidth + sampleX] ?? 0;
      const elevation = encoded / 65535 * meta.heightMaxMetres;
      positions[p++] = (u - 0.5) * width;
      positions[p++] = elevation * meta.verticalExaggeration + 35;
      positions[p++] = (v - 0.5) * depth;
      uvs[uv++] = u;
      uvs[uv++] = 1 - v;
    }
  }

  const row = segmentsX + 1;
  for (let y = 0; y < segmentsY; y++) {
    for (let x = 0; x < segmentsX; x++) {
      const a = y * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function lineGeometry(rings: LineRing[], meta: SceneMeta, heightSamples: Uint16Array, lift = 300) {
  const [minX, minY, maxX, maxY] = meta.bounds;
  const w = maxX - minX, h = maxY - minY;
  const coords: number[] = [];
  const heightAt = (x: number, y: number) => {
    const u = THREE.MathUtils.clamp((x - minX) / w, 0, 1);
    const v = THREE.MathUtils.clamp((maxY - y) / h, 0, 1);
    const sx = Math.round(u * (meta.heightWidth - 1));
    const sy = Math.round(v * (meta.heightHeight - 1));
    const encoded = heightSamples[sy * meta.heightWidth + sx] ?? 0;
    return encoded / 65535 * meta.heightMaxMetres * meta.verticalExaggeration + lift;
  };
  rings.forEach(ring => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (!a || !b) continue;
      coords.push(a[0] - (minX + maxX) / 2, heightAt(a[0], a[1]), - (a[1] - (minY + maxY) / 2));
      coords.push(b[0] - (minX + maxX) / 2, heightAt(b[0], b[1]), - (b[1] - (minY + maxY) / 2));
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  return geometry;
}

function wgs84ToLv95(lat: number, lon: number): [number, number] {
  const latAux = (lat * 3600 - 169028.66) / 10000;
  const lonAux = (lon * 3600 - 26782.5) / 10000;
  const east = 2600072.37 + 211455.93 * lonAux - 10938.51 * lonAux * latAux - 0.36 * lonAux * latAux ** 2 - 44.54 * lonAux ** 3;
  const north = 1200147.07 + 308807.95 * latAux + 3745.25 * lonAux ** 2 + 76.63 * latAux ** 2 - 194.56 * lonAux ** 2 * latAux + 119.79 * latAux ** 3;
  return [east, north];
}

function terrainHeightAt(east: number, north: number, meta: SceneMeta, samples: Uint16Array, lift = 0) {
  const [minX, minY, maxX, maxY] = meta.bounds;
  const u = THREE.MathUtils.clamp((east - minX) / (maxX - minX), 0, 1);
  const v = THREE.MathUtils.clamp((maxY - north) / (maxY - minY), 0, 1);
  const sx = Math.round(u * (meta.heightWidth - 1));
  const sy = Math.round(v * (meta.heightHeight - 1));
  const encoded = samples[sy * meta.heightWidth + sx] ?? 0;
  return encoded / 65535 * meta.heightMaxMetres * meta.verticalExaggeration + lift;
}

function motorwayCurve(route: MotorwayCorridor, meta: SceneMeta, samples: Uint16Array) {
  const [minX, minY, maxX, maxY] = meta.bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const flatPoints = route.points.map(([lat, lon]) => {
    const [east, north] = wgs84ToLv95(lat, lon);
    return new THREE.Vector3(east - centerX, 0, -(north - centerY));
  });
  const flatCurve = new THREE.CatmullRomCurve3(flatPoints, false, 'centripetal', 0.35);
  const samplesPerRoute = Math.max(90, route.points.length * 24);
  const drapedPoints = flatCurve.getPoints(samplesPerRoute).map(point => {
    const east = point.x + centerX;
    const north = centerY - point.z;
    return new THREE.Vector3(point.x, terrainHeightAt(east, north, meta, samples, 1250), point.z);
  });
  return new THREE.CatmullRomCurve3(drapedPoints, false, 'centripetal', 0.35);
}

function createCityLabel(city: City, meta: SceneMeta, samples: Uint16Array) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 84;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(229,240,250,.92)';
  ctx.fillText(city.name, 160, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.78 }));
  const [minX, minY, maxX, maxY] = meta.bounds;
  const u = (city.x - minX) / (maxX - minX), v = (maxY - city.y) / (maxY - minY);
  const sx = Math.round(THREE.MathUtils.clamp(u, 0, 1) * (meta.heightWidth - 1));
  const sy = Math.round(THREE.MathUtils.clamp(v, 0, 1) * (meta.heightHeight - 1));
  const encoded = samples[sy * meta.heightWidth + sx] ?? 0;
  const elevation = encoded / 65535 * meta.heightMaxMetres * meta.verticalExaggeration;
  sprite.position.set(city.x - (minX + maxX) / 2, elevation + 1800, - (city.y - (minY + maxY) / 2));
  sprite.scale.set(15000, 3900, 1);
  return sprite;
}

export default function SwissTerrain({ locale = 'en' }: { locale?: Locale }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewMode>('night');
  const [view, setView] = useState<ViewMode>('night');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;
    let raf = 0;
    let lastTime = performance.now();
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let terrainMaterial: THREE.ShaderMaterial | null = null;
    const cityGlowMaterials: { material: THREE.SpriteMaterial; strength: number }[] = [];
    const motorwayMaterials: { material: THREE.MeshBasicMaterial; strength: number; phase: number }[] = [];
    let hotspotMaterial: THREE.SpriteMaterial | null = null;
    let municipalityMaterial: THREE.MeshBasicMaterial | null = null;
    const coarseDevice = window.matchMedia('(pointer: coarse)').matches || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    const pixelBudget = coarseDevice ? 1_600_000 : 4_200_000;
    const pixelRatioFor = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const area = Math.max(1, element.clientWidth * element.clientHeight);
      return Math.min(dpr, Math.sqrt(pixelBudget / area));
    };
    const scene = new THREE.Scene();
    const resources: { dispose: () => void }[] = [];

    const animate = () => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nightTarget = viewRef.current === 'night' ? 1 : 0;
      if (terrainMaterial) {
        const current = terrainMaterial.uniforms.uViewMode.value as number;
        terrainMaterial.uniforms.uViewMode.value = prefersReducedMotion ? nightTarget : THREE.MathUtils.damp(current, nightTarget, 2.25, dt);
      }
      cityGlowMaterials.forEach(({ material, strength }) => {
        material.opacity = prefersReducedMotion ? nightTarget * strength : THREE.MathUtils.damp(material.opacity, nightTarget * strength, 2.25, dt);
      });
      if (hotspotMaterial) hotspotMaterial.opacity = prefersReducedMotion ? nightTarget * 0.42 : THREE.MathUtils.damp(hotspotMaterial.opacity, nightTarget * 0.42, 2.25, dt);
      if (municipalityMaterial) municipalityMaterial.opacity = prefersReducedMotion ? nightTarget * 0.46 : THREE.MathUtils.damp(municipalityMaterial.opacity, nightTarget * 0.46, 2.25, dt);
      motorwayMaterials.forEach(({ material, strength, phase }) => {
        const pulse = prefersReducedMotion ? 1 : 0.94 + Math.sin(now * 0.00125 + phase) * 0.06;
        material.opacity = prefersReducedMotion ? nightTarget * strength : THREE.MathUtils.damp(material.opacity, nightTarget * strength * pulse, 2.4, dt);
      });
      controls?.update();
      if (renderer && camera) renderer.render(scene, camera);
    };

    const start = async () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.setPixelRatio(pixelRatioFor());
        renderer.setClearColor(0x050a14, 0);
        element.appendChild(renderer.domElement);

        camera = new THREE.PerspectiveCamera(34, 1, 1, 3000000);
        camera.position.set(0, 360000, 330000);
        camera.lookAt(0, 9500, 0);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 9500, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.autoRotate = false;
        controls.minDistance = 260000;
        controls.maxDistance = 1100000;
        controls.minPolarAngle = 0.18;
        controls.maxPolarAngle = 1.42;
        controls.rotateSpeed = 0.55;
        controls.zoomSpeed = 0.72;

        const setSize = () => {
          if (!renderer || !camera || !element.clientWidth || !element.clientHeight) return;
          renderer.setPixelRatio(pixelRatioFor());
          renderer.setSize(element.clientWidth, element.clientHeight);
          camera.aspect = element.clientWidth / element.clientHeight;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(setSize);
        resizeObserver.observe(element);
        setSize();
        animate();

        const metaResponse = await fetch('./terrain/ch_scene.json');
        if (!metaResponse.ok) throw new Error('Swiss 3D assets are missing. Run BUILD_SWISS_3D_SCENE.bat from the project root.');
        const meta = await metaResponse.json() as SceneMeta;
        const [heightResponse, vectorResponse, municipalityResponse] = await Promise.all([
          fetch('./terrain/ch_height_u16.bin'),
          fetch('./terrain/ch_vectors.json'),
          fetch('./terrain/ch_municipality_lights.bin'),
        ]);
        if (!heightResponse.ok || !vectorResponse.ok || !municipalityResponse.ok) throw new Error('Swiss terrain data is incomplete. Restore the included municipality-light asset or rebuild the Swiss scene.');
        const [heightBuffer, vectors, municipalityBuffer] = await Promise.all([
          heightResponse.arrayBuffer(),
          vectorResponse.json() as Promise<SwissVectors>,
          municipalityResponse.arrayBuffer(),
        ]);
        const municipalityPoints = new Float32Array(municipalityBuffer);
        if (municipalityPoints.length !== 2110 * 2) throw new Error('The municipality-light layer must contain exactly 2,110 points.');
        const heightSamples = new Uint16Array(heightBuffer);
        if (heightSamples.length !== meta.heightWidth * meta.heightHeight) throw new Error('The Swiss height grid has an invalid size. Rebuild the terrain assets.');

        const [satellite, hillshade, night, mask] = await Promise.all([
          loadTexture('./terrain/ch_satellite.jpg', THREE.SRGBColorSpace),
          loadTexture('./terrain/ch_hillshade.png', THREE.NoColorSpace),
          loadTexture('./terrain/ch_night_radiance.png', THREE.NoColorSpace),
          loadTexture('./terrain/ch_mask.png', THREE.NoColorSpace),
        ]);
        resources.push(satellite, hillshade, night, mask);

        const bounds = meta.bounds;
        const width = bounds[2] - bounds[0];
        const depth = bounds[3] - bounds[1];
        const outline = vectors.border[0] ?? [];
        const slabShape = new THREE.Shape();
        outline.forEach(([x, y], index) => {
          const px = x - (bounds[0] + bounds[2]) / 2;
          const py = y - (bounds[1] + bounds[3]) / 2;
          if (index === 0) slabShape.moveTo(px, py); else slabShape.lineTo(px, py);
        });
        slabShape.closePath();
        const slabDepth = 12500;
        const slabGeometry = new THREE.ExtrudeGeometry(slabShape, { depth: slabDepth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 1250, bevelThickness: 850, curveSegments: 4 });
        slabGeometry.rotateX(-Math.PI / 2);
        slabGeometry.translate(0, -slabDepth, 0);
        const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x162a3c, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
        const slab = new THREE.Mesh(slabGeometry, slabMaterial);
        slab.renderOrder = 0;
        scene.add(slab);
        resources.push(slabGeometry, slabMaterial);

        const segmentsX = coarseDevice ? 640 : 1024;
        const segmentsY = Math.max(420, Math.round(segmentsX * depth / width));
        const terrainGeometry = makeTerrainGeometry(meta, heightSamples, segmentsX, segmentsY);
        terrainMaterial = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: {
            uSatellite: { value: satellite },
            uHillshade: { value: hillshade },
            uNight: { value: night },
            uMask: { value: mask },
            uNightTexel: { value: new THREE.Vector2(1 / night.image.width, 1 / night.image.height) },
            uViewMode: { value: 0 }, // start from satellite grading, then reveal the night lights smoothly
          },
        });
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.renderOrder = 1;
        scene.add(terrain);
        resources.push(terrainGeometry, terrainMaterial);

        const skirtPositions: number[] = [];
        const vertical = meta.verticalExaggeration;
        const heightAt = (x: number, y: number) => {
          const u = THREE.MathUtils.clamp((x - bounds[0]) / width, 0, 1);
          const v = THREE.MathUtils.clamp((bounds[3] - y) / depth, 0, 1);
          const sx = Math.round(u * (meta.heightWidth - 1));
          const sy = Math.round(v * (meta.heightHeight - 1));
          return (heightSamples[sy * meta.heightWidth + sx] ?? 0) / 65535 * meta.heightMaxMetres * vertical + 35;
        };
        outline.forEach((point, i) => {
          const next = outline[(i + 1) % outline.length];
          if (!next) return;
          const ax = point[0] - (bounds[0] + bounds[2]) / 2;
          const az = - (point[1] - (bounds[1] + bounds[3]) / 2);
          const bx = next[0] - (bounds[0] + bounds[2]) / 2;
          const bz = - (next[1] - (bounds[1] + bounds[3]) / 2);
          const ay = heightAt(point[0], point[1]);
          const by = heightAt(next[0], next[1]);
          skirtPositions.push(ax, 0, az, bx, 0, bz, ax, ay, az, bx, 0, bz, bx, by, bz, ax, ay, az);
        });
        const skirtGeometry = new THREE.BufferGeometry();
        skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
        skirtGeometry.computeVertexNormals();
        const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x20384b, roughness: 0.76, metalness: 0.12, side: THREE.DoubleSide });
        const skirt = new THREE.Mesh(skirtGeometry, skirtMaterial);
        skirt.renderOrder = 2;
        scene.add(skirt);
        resources.push(skirtGeometry, skirtMaterial);

        const addLines = (rings: LineRing[], color: number, opacity: number, lift: number, renderOrder: number) => {
          const geometry = lineGeometry(rings, meta, heightSamples, lift);
          const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
          const lines = new THREE.LineSegments(geometry, material);
          lines.renderOrder = renderOrder;
          scene.add(lines);
          resources.push(geometry, material);
        };
        addLines(vectors.border, 0xa4bdc9, 0.76, 650, 4);
        addLines(vectors.cantons, 0x8ba4b6, 0.30, 450, 3);
        addLines(vectors.lakes, 0x6ab6d2, 0.62, 520, 4);
        addLines(vectors.rivers, 0x62a7c5, 0.42, 500, 4);

        // Three concentric additive tubes give generalized motorway corridors a restrained neon light-trail effect.
        MOTORWAY_CORRIDORS.forEach((route, routeIndex) => {
          const curve = motorwayCurve(route, meta, heightSamples);
          const layers = [
            { radius: 1450, radial: 5, color: 0xff8c42, strength: 0.12, order: 3 },
            { radius: 590, radial: 5, color: 0xffbd78, strength: 0.22, order: 4 },
            { radius: 185, radial: 4, color: 0xfff0cc, strength: 0.56, order: 5 },
          ];
          layers.forEach(layer => {
            const geometry = new THREE.TubeGeometry(curve, Math.max(90, route.points.length * 24), layer.radius, layer.radial, false);
            const material = new THREE.MeshBasicMaterial({
              color: layer.color,
              transparent: true,
              opacity: 0,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              toneMapped: false,
            });
            const trail = new THREE.Mesh(geometry, material);
            trail.renderOrder = layer.order;
            scene.add(trail);
            resources.push(geometry, material);
            motorwayMaterials.push({ material, strength: layer.strength, phase: routeIndex * 0.72 + layer.order * 0.31 });
          });
        });

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const glowContext = glowCanvas.getContext('2d')!;
        const glowGradient = glowContext.createRadialGradient(64, 64, 2, 64, 64, 62);
        glowGradient.addColorStop(0, 'rgba(255,238,190,0.95)');
        glowGradient.addColorStop(0.12, 'rgba(255,190,105,0.72)');
        glowGradient.addColorStop(0.38, 'rgba(255,145,65,0.22)');
        glowGradient.addColorStop(1, 'rgba(255,125,45,0)');
        glowContext.fillStyle = glowGradient;
        glowContext.fillRect(0, 0, 128, 128);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        glowTexture.colorSpace = THREE.SRGBColorSpace;
        resources.push(glowTexture);

        // 2,110 tiny surface lights, matching the FSO municipality count for 01.01.2026.
        // Positions are evenly distributed over the Swiss land mask as visual markers,
        // not official municipality centroids or electricity-delivery locations.
        const municipalityGeometry = new THREE.PlaneGeometry(1, 1);
        municipalityGeometry.rotateX(-Math.PI / 2);
        const municipalityGlowMaterial = new THREE.MeshBasicMaterial({
          map: glowTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        municipalityMaterial = municipalityGlowMaterial;
        const municipalityLights = new THREE.InstancedMesh(municipalityGeometry, municipalityGlowMaterial, municipalityPoints.length / 2);
        municipalityLights.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        const lightTransform = new THREE.Object3D();
        const centerX = (bounds[0] + bounds[2]) / 2;
        const centerY = (bounds[1] + bounds[3]) / 2;
        for (let i = 0; i < municipalityPoints.length / 2; i++) {
          const u = municipalityPoints[i * 2] ?? 0;
          const v = municipalityPoints[i * 2 + 1] ?? 0;
          const east = bounds[0] + u * width;
          const north = bounds[3] - v * depth;
          const elevation = terrainHeightAt(east, north, meta, heightSamples, 230);
          const variation = ((i * 37 + 17) % 101) / 100;
          const size = 1050 + variation * 620;
          lightTransform.position.set(east - centerX, elevation, -(north - centerY));
          lightTransform.scale.set(size, 1, size);
          lightTransform.updateMatrix();
          municipalityLights.setMatrixAt(i, lightTransform.matrix);
          const warmth = 0.74 + variation * 0.22;
          municipalityLights.setColorAt(i, new THREE.Color(1, warmth * 0.79, warmth * 0.53));
        }
        municipalityLights.instanceMatrix.needsUpdate = true;
        municipalityLights.computeBoundingSphere();
        if (municipalityLights.instanceColor) municipalityLights.instanceColor.needsUpdate = true;
        municipalityLights.renderOrder = 3;
        scene.add(municipalityLights);
        resources.push(municipalityGeometry, municipalityGlowMaterial);

        vectors.cities.filter(city => city.name && city.population >= 18000).forEach(city => {
          const [minX, minY, maxX, maxY] = meta.bounds;
          const u = (city.x - minX) / (maxX - minX);
          const v = (maxY - city.y) / (maxY - minY);
          const sx = Math.round(THREE.MathUtils.clamp(u, 0, 1) * (meta.heightWidth - 1));
          const sy = Math.round(THREE.MathUtils.clamp(v, 0, 1) * (meta.heightHeight - 1));
          const encoded = heightSamples[sy * meta.heightWidth + sx] ?? 0;
          const elevation = encoded / 65535 * meta.heightMaxMetres * meta.verticalExaggeration;
          const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
          const glow = new THREE.Sprite(glowMaterial);
          const size = THREE.MathUtils.clamp(5200 + Math.sqrt(city.population) * 34, 7000, 14500);
          glow.position.set(city.x - (minX + maxX) / 2, elevation + 180, -(city.y - (minY + maxY) / 2));
          glow.scale.set(size, size, 1);
          glow.renderOrder = 2;
          scene.add(glow);
          cityGlowMaterials.push({ material: glowMaterial, strength: 0.78 });
          resources.push(glowMaterial);

          if (city.population >= 120000) {
            const label = createCityLabel(city, meta, heightSamples);
            label.renderOrder = 5;
            scene.add(label);
            const material = label.material as THREE.SpriteMaterial;
            resources.push(material);
            if (material.map) resources.push(material.map);
          }
        });

        // Discover smaller settlements directly from the VIIRS image rather than adding invented city coordinates.
        try {
          const scanWidth = 512;
          const scanHeight = Math.round(scanWidth * night.image.height / night.image.width);
          const radianceCanvas = document.createElement('canvas');
          const maskCanvas = document.createElement('canvas');
          radianceCanvas.width = maskCanvas.width = scanWidth;
          radianceCanvas.height = maskCanvas.height = scanHeight;
          const radianceContext = radianceCanvas.getContext('2d', { willReadFrequently: true });
          const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
          if (!radianceContext || !maskContext) throw new Error('Canvas pixel access is unavailable.');
          radianceContext.drawImage(night.image as CanvasImageSource, 0, 0, scanWidth, scanHeight);
          maskContext.drawImage(mask.image as CanvasImageSource, 0, 0, scanWidth, scanHeight);
          const radiancePixels = radianceContext.getImageData(0, 0, scanWidth, scanHeight).data;
          const maskPixels = maskContext.getImageData(0, 0, scanWidth, scanHeight).data;
          const radius = 5;
          const candidates: { x: number; y: number; value: number }[] = [];
          for (let y = radius; y < scanHeight - radius; y++) {
            for (let x = radius; x < scanWidth - radius; x++) {
              const index = y * scanWidth + x;
              const value = radiancePixels[index * 4] ?? 0;
              if (value < 140 || (maskPixels[index * 4] ?? 0) < 110) continue;
              let peak = true;
              for (let oy = -radius; oy <= radius && peak; oy++) {
                for (let ox = -radius; ox <= radius; ox++) {
                  if (ox === 0 && oy === 0) continue;
                  const neighbour = (y + oy) * scanWidth + x + ox;
                  const neighbourValue = radiancePixels[neighbour * 4] ?? 0;
                  if (neighbourValue > value || (neighbourValue === value && neighbour < index)) { peak = false; break; }
                }
              }
              if (peak) candidates.push({ x, y, value });
            }
          }
          candidates.sort((a, b) => b.value - a.value);
          const selected: typeof candidates = [];
          const cityPixels = vectors.cities.map(city => ({
            x: ((city.x - bounds[0]) / width) * scanWidth,
            y: ((bounds[3] - city.y) / depth) * scanHeight,
          }));
          for (const candidate of candidates) {
            if (selected.length >= 190) break;
            if (cityPixels.some(city => Math.hypot(city.x - candidate.x, city.y - candidate.y) < 11)) continue;
            if (selected.some(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) < 6.2)) continue;
            selected.push(candidate);
          }
          hotspotMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
          resources.push(hotspotMaterial);
          selected.forEach(({ x, y, value }) => {
            const u = x / (scanWidth - 1);
            const v = y / (scanHeight - 1);
            const east = bounds[0] + u * width;
            const north = bounds[3] - v * depth;
            const elevation = terrainHeightAt(east, north, meta, heightSamples);
            const glow = new THREE.Sprite(hotspotMaterial!);
            const size = THREE.MathUtils.clamp(2600 + (value - 160) * 30, 3000, 6500);
            glow.position.set(east - (bounds[0] + bounds[2]) / 2, elevation + 320, -(north - (bounds[1] + bounds[3]) / 2));
            glow.scale.set(size, size, 1);
            glow.renderOrder = 3;
            scene.add(glow);
          });
        } catch (hotspotError) {
          console.warn('[SwissTerrain] Could not build the secondary VIIRS glow layer.', hotspotError);
        }

        scene.add(new THREE.AmbientLight(0xffffff, 0.76));
        const sun = new THREE.DirectionalLight(0xfff2dc, 1.05);
        sun.position.set(-160000, 360000, 220000);
        scene.add(sun);
        setState('ready');
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : 'Could not load the Swiss 3D terrain.';
          element.dataset.error = message;
          setState(message.includes('missing') || message.includes('incomplete') ? 'missing' : 'error');
          console.warn('[SwissTerrain]', error);
        }
      }
    };
    void start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      controls?.dispose();
      resources.forEach(resource => resource.dispose());
      scene.clear();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  const setSurface = (next: ViewMode) => {
    viewRef.current = next;
    setView(next);
  };

  return (
    <div ref={host} className="globe swiss-terrain-stage" role="region" aria-label={t(locale, 'swiss.aria')}>
      <div className="swiss-scene-heading">
        <span className="eyebrow">{t(locale, 'swiss.heading')}</span>
        <div className="swiss-view-toggle" role="group" aria-label={t(locale, 'swiss.surface')}>
          <button type="button" className={view === 'satellite' ? 'on' : ''} aria-pressed={view === 'satellite'} onClick={() => setSurface('satellite')}>{t(locale, 'swiss.satellite')}</button>
          <button type="button" className={view === 'night' ? 'on' : ''} aria-pressed={view === 'night'} onClick={() => setSurface('night')}>{t(locale, 'swiss.night')}</button>
        </div>
      </div>
      {state === 'loading' && <div className="globe-msg swiss-loading">{t(locale, 'swiss.loading')}</div>}
      {state === 'missing' && <div className="globe-msg swiss-loading"><b>{t(locale, 'swiss.missingTitle')}</b><span>{t(locale, 'swiss.missingDesc')}</span></div>}
      {state === 'error' && <div className="globe-msg swiss-loading"><b>{t(locale, 'swiss.errorTitle')}</b><span>{t(locale, 'swiss.errorDesc')}</span></div>}
      {view === 'night' && <div className="swiss-scene-legend" aria-label={t(locale, 'swiss.legend.aria')}>
        <span><i className="legend-route" />{t(locale, 'swiss.legend.routes')}</span>
        <span><i className="legend-light" />{t(locale, 'swiss.legend.viirs')}</span>
        <span><i className="legend-municipality" />{t(locale, 'swiss.legend.municipalities')}</span>
      </div>}
      <div className="swiss-scene-attribution">SWISSIMAGE orthophoto · swissALTI3D relief shading · Copernicus DEM GLO-30 · VIIRS 2024</div>
    </div>
  );
}
