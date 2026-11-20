import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Region } from '../lib/lighting';
import { t, type Locale } from '../i18n';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const ll = (lat: number, lon: number, r = 1) => {
  const p = THREE.MathUtils.degToRad(90 - lat), t = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
};
const EUROPE = ll(46, 8, 2.85);

type Mode = Region;
const VIEWS: Record<Mode, THREE.Vector3> = { world: ll(25, 10, 3.6), switzerland: ll(46.8, 8.2, 1.75), europe: ll(52, 12, 2.85) };
const EU_CODES = new Set('ALB AND AUT BLR BEL BIH BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ITA KOS LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU RUS SMR SRB SVK SVN ESP SWE CHE GBR UKR VAT'.split(' '));
const RUS_MAX_LON = 60; // Russia is clipped to its European part

type Ring = [number, number][];
interface Country { code: string; name: string; rings: Ring[] }
const parseCountries = (gj: any): Country[] => (gj.features ?? []).map((f: any) => {
  const p = f.properties ?? {};
  const code = String(p.ADM0_A3 ?? p.ISO_A3 ?? p.iso_a3 ?? p['ISO3166-1-Alpha-3'] ?? f.id ?? '');
  const g = f.geometry;
  const polys: number[][][][] = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const rings: Ring[] = [];
  polys.forEach(poly => poly.forEach(r => rings.push(r as Ring)));
  const name = String(p.NAME ?? p.name ?? p.ADMIN ?? '');
  return { code: code === 'CHE' || name === 'Switzerland' ? 'CHE' : code, name, rings };
});
// Russia: clip each ring to lon <= RUS_MAX_LON (Sutherland–Hodgman); the cut edge is flagged so it is not drawn as a border.
const clipRus = (r: Ring): Ring => {
  const out: Ring = [], L = RUS_MAX_LON;
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1], ain = a[0] <= L, bin = b[0] <= L;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (L - a[0]) / (b[0] - a[0]); out.push([L, a[1] + t * (b[1] - a[1])]); }
  }
  if (out.length) out.push(out[0]);
  return out.length > 3 ? out : [];
};
const rings = (c: Country): Ring[] => (c.code === 'RUS' ? c.rings.map(clipRus).filter(r => r.length) : c.rings);
const onCut = (c: Country, a: number[], b: number[]) => c.code === 'RUS' && a[0] === RUS_MAX_LON && b[0] === RUS_MAX_LON;

// Region mask texture: R = Switzerland, G = Europe (rasterised from the same GeoJSON as the borders).
function buildMask(countries: Country[]) {
  const W = 4096, H = 2048, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const paint = (list: Country[], color: string) => {
    ctx.fillStyle = color;
    list.forEach(c => {
      ctx.beginPath();
      rings(c).forEach(r => r.forEach(([lo, la], i) => {
        const x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }));
      ctx.fill('evenodd');
    });
  };
  ctx.filter = 'blur(1.5px)';
  paint(countries.filter(c => c.code === 'CHE'), '#ff0000');
  paint(countries.filter(c => EU_CODES.has(c.code)), '#00ff00');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return tex;
}

// Border geometry on the sphere. `outline` = segments used by exactly one selected country (outer edge).
function buildBorders(countries: Country[], r: number) {
  const seg = (a: number[], b: number[]) => [ll(a[1], a[0], r), ll(b[1], b[0], r)];
  const push = (arr: number[], v: THREE.Vector3[]) => v.forEach(p => arr.push(p.x, p.y, p.z));
  const ch: number[] = [], outline: number[] = [], inner: number[] = [];
  const count = new Map<string, number>();
  const key = (a: number[], b: number[]) => { const A = a[0].toFixed(3) + ',' + a[1].toFixed(3), B = b[0].toFixed(3) + ',' + b[1].toFixed(3); return A < B ? A + '|' + B : B + '|' + A; };
  const eu = countries.filter(c => EU_CODES.has(c.code));
  eu.forEach(c => rings(c).forEach(rg => { for (let i = 0; i < rg.length - 1; i++) { const k = key(rg[i], rg[i + 1]); count.set(k, (count.get(k) ?? 0) + 1); } }));
  eu.forEach(c => rings(c).forEach(rg => {
    for (let i = 0; i < rg.length - 1; i++) {
      if (Math.abs(rg[i][0] - rg[i + 1][0]) > 90 || onCut(c, rg[i], rg[i + 1])) continue;
      push((count.get(key(rg[i], rg[i + 1])) ?? 0) > 1 ? inner : outline, seg(rg[i], rg[i + 1]));
    }
    if (c.code === 'CHE') for (let i = 0; i < rg.length - 1; i++) push(ch, seg(rg[i], rg[i + 1]));
  }));
  const mk = (a: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return g; };
  return { ch: mk(ch), outline: mk(outline), inner: mk(inner) };
}

const EARTH_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EARTH_F = `
// The night texture is sampled RAW (NoColorSpace) and the result written straight to the canvas:
// no sRGB decode + no output re-encode, so there is no double conversion and no brightness loss.
uniform sampler2D uNight, uMask, uMaskCH, uChNight; uniform vec4 uBox; uniform float uReg, uSel, uHasMask, uHasCH, uClose, uHasChNight, uLightReveal, uTime; varying vec2 vUv;
// Night colour: global texture, or the dedicated high-res Swiss texture inside uBox once it is loaded (uniform branch -> no cost otherwise).
vec3 nightAt(vec2 uv){
  vec3 g = texture2D(uNight, uv).rgb;
  if (uHasChNight < 0.5) return g;
  vec2 l = (uv - uBox.xy) / (uBox.zw - uBox.xy);
  float w = step(0.0, l.x) * step(l.x, 1.0) * step(0.0, l.y) * step(l.y, 1.0);
  return mix(g, texture2D(uChNight, clamp(l, 0.0, 1.0)).rgb, w);
}
float city(vec2 uv){ vec3 c = nightAt(uv); return clamp(c.r * 3.4 - c.b * 0.7, 0.0, 2.0); } // warm = lights, blue = land
void main(){
  vec3 night = nightAt(vUv);
  float I = city(vUv);
  vec2 m = texture2D(uMask, vUv).rg;
  vec2 lc = (vUv - uBox.xy) / (uBox.zw - uBox.xy);          // dedicated high-res Switzerland mask (bbox-local UV)
  float inBox = step(0.0, lc.x) * step(lc.x, 1.0) * step(0.0, lc.y) * step(lc.y, 1.0);
  float chm = mix(m.r, texture2D(uMaskCH, lc).r, uHasCH * inBox);
  float sel = mix(chm, m.g, uSel) * uHasMask;          // exclusive region mask
  float k = mix(1.0, sel, uReg);                       // 1 everywhere in World mode
  // dark-blue land layer, oceans stay near black
  vec3 land = min(night * vec3(0.8, 1.15, 1.6), vec3(0.16, 0.24, 0.40)) + vec3(0.0, 0.003, 0.010);
  land *= mix(1.0, mix(0.22, 1.35, sel), uReg);
  // bloom: wide soft halo + tight halo
  float g1 = 0.0, g2 = 0.0; vec2 px = vec2(1.0 / 4096.0, 1.0 / 2048.0);
  for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; vec2 d = vec2(cos(a), sin(a));
    g1 += city(vUv + d * px * 4.0); g2 += city(vUv + d * px * 11.0) + city(vUv + d * px * 20.0) * 0.6; }
  g1 /= 12.0; g2 /= 12.0;
  float core = pow(clamp(I, 0.0, 1.6), 0.65);
  vec3 orange = vec3(1.0, 0.42, 0.10), warmWhite = vec3(1.0, 0.90, 0.62);
  float lightReveal = smoothstep(0.0, 1.0, uLightReveal);
  float lightPulse = 0.985 + 0.015 * sin(uTime * 1.35 + I * 2.0);
  vec3 lights = mix(orange, warmWhite, smoothstep(0.45, 1.2, I)) * core * 2.6
              + vec3(1.0, 0.95, 0.85) * smoothstep(1.1, 1.8, I) * 1.2;   // major cities -> near white
  vec3 glow = orange * (g1 * 0.8 + g2 * 1.0) * (1.0 - 0.5 * smoothstep(0.8, 1.6, I));
  vec3 col = land + (lights * lightPulse + glow) * lightReveal * k * (1.0 - 0.6 * uClose * inBox * uHasChNight); // city lights switch on smoothly when the map loads or region changes
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

const CITY_V = `attribute float aSize; uniform float uDpr, uDist; varying float vS;
void main(){ vS = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min((4.0 + 40.0 * aSize) * (0.3 / max(0.25, uDist - 1.0)) * uDpr, 64.0); }`;
const CITY_F = `uniform float uFade; varying float vS;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float g = exp(-d * d * 5.0), c = exp(-d * d * 30.0);
  vec3 col = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.92, 0.70), c) * (g * 0.55 + c * 0.9);
  gl_FragColor = vec4(col * uFade * (0.45 + 0.55 * vS), 1.0); }`;

const ATM_V = `varying vec3 vNormalView; void main(){ vNormalView = normalize(mat3(modelViewMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ATM_F = `varying vec3 vNormalView; void main(){ float rim = pow(clamp(1.0 + dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.6); vec3 glow = vec3(0.10, 0.48, 0.82) * rim * 0.34; gl_FragColor = vec4(glow, rim * 0.28); }`;

export default function Globe({ mode, locale = 'en' }: { mode: Region; locale?: Locale }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [geoOk, setGeoOk] = useState(true);
  const modeRef = useRef<Mode>('world');
  modeRef.current = mode;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let idleTimer = 0;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let earthMaterial: THREE.ShaderMaterial | null = null;
    let maskTexture: THREE.Texture | null = null;
    let chMask: THREE.Texture | null = null;
    let chNight: THREE.Texture | null = null;
    let nightTexture: THREE.Texture | null = null;
    const scene = new THREE.Scene();
    const borderMats: Record<string, THREE.LineBasicMaterial> = {};
    const cur = { reg: 0, sel: 1, ch: 0, eu: 0 };
    let prevMode: Mode = 'world', camT = 1, camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), last = performance.now();
    let lightRevealProgress = 0;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      // Device tiers: pixel budget keeps 4K (3840×2160) crisp on strong desktops, lighter on weak/mobile GPUs.
      const maxTex = renderer.capabilities.maxTextureSize;
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4, cores = navigator.hardwareConcurrency ?? 4;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const weak = mem <= 2 || cores <= 2 || maxTex < 4096;
      const strong = !coarse && !weak && mem >= 4 && cores >= 8 && maxTex >= 8192;
      const pixelBudget = strong ? 3840 * 2160 : weak ? 1.6e6 : 4.2e6, maxDpr = strong ? 3 : weak ? 1.5 : 2;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0x050a14, 0);
      el.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 50);
      camera.position.copy(EUROPE);
      camera.lookAt(0, 0, 0);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.055;
      controls.minDistance = 1.12;
      controls.maxDistance = 5.2;
      controls.enablePan = false;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.7;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.16;
      controls.minPolarAngle = 0.16;
      controls.maxPolarAngle = Math.PI - 0.16;

      const setSize = () => {
        if (!renderer || !el.clientWidth || !el.clientHeight) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(pixelBudget / (el.clientWidth * el.clientHeight))));
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(el);
      setSize();

      new THREE.TextureLoader().load(weak ? './tex/night_2k.jpg' : './tex/night.jpg', texture => {
        if (disposed) {
          texture.dispose();
          return;
        }
        nightTexture = texture;
        nightTexture.colorSpace = THREE.NoColorSpace; // raw values, shader writes display-referred colour
        lightRevealProgress = prefersReducedMotion ? 1 : 0;
        nightTexture.anisotropy = Math.min(strong ? 16 : 8, renderer?.capabilities.getMaxAnisotropy() ?? 1);

        const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        blank.needsUpdate = true;
        earthMaterial = new THREE.ShaderMaterial({
          vertexShader: EARTH_V, fragmentShader: EARTH_F, toneMapped: false,
          uniforms: { uNight: { value: nightTexture }, uMask: { value: blank }, uMaskCH: { value: blank }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uHasCH: { value: 0 }, uClose: { value: 0 }, uChNight: { value: blank }, uHasChNight: { value: 0 }, uReg: { value: 0 }, uSel: { value: 1 }, uHasMask: { value: 0 }, uLightReveal: { value: 0 }, uTime: { value: 0 } },
        });
        const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 160), earthMaterial);
        scene.add(earth);

        fetch('./geo/countries.geojson').then(r => { if (!r.ok) throw new Error('geo'); return r.json(); }).then(gj => {
          if (disposed || !earthMaterial) return;
          const countries = parseCountries(gj);
          maskTexture = buildMask(countries);
          earthMaterial.uniforms.uMask.value = maskTexture;
          earthMaterial.uniforms.uHasMask.value = 1;
          const b = buildBorders(countries, 1.003);
          const mat = (color: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
          const add = (g: THREE.BufferGeometry, m: THREE.LineBasicMaterial, name: string, scale = 1) => { const l = new THREE.LineSegments(g, m); l.name = name; l.scale.setScalar(scale); l.renderOrder = 2; scene.add(l); borderMats[name] = m; };
          add(b.ch, mat(0x35e6ff), 'ch'); add(b.ch, mat(0x1a8cff), 'chGlow', 1.0025);
          add(b.outline, mat(0x35c8ff), 'eu'); add(b.outline, mat(0x1a78ff), 'euGlow', 1.0025);
          add(b.inner, mat(0x2a8fd0), 'euIn');
        }).catch(() => { if (!disposed) setGeoOk(false); });

        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.035, 96, 96),
          new THREE.ShaderMaterial({
            vertexShader: ATM_V,
            fragmentShader: ATM_F,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        scene.add(atmosphere);
        setState('ready');
      }, undefined, () => {
        if (!disposed) setState('error');
      });

      const onStart = () => {
        if (controls) controls.autoRotate = false;
        window.clearTimeout(idleTimer);
      };
      const onEnd = () => {
        idleTimer = window.setTimeout(() => {
          if (controls) controls.autoRotate = true;
        }, 6000);
      };
      controls.addEventListener('start', onStart);
      controls.addEventListener('end', onEnd);

      // Progressive extras: optional 8K night texture (strong devices only) and the Swiss vector detail layer.
      let upgrading = false, detailReq = false, detailReady = false, chReplaced = false;
      const tier = (k: string, v: string) => host.current?.setAttribute(k, v);
      tier('data-night-tier', weak ? '2k' : '4k'); tier('data-ch-night', 'off');
      // HEAD check: the asset must exist and really be an image (dev servers may answer 200 with index.html).
      const probe = (url: string) => fetch(url, { method: 'HEAD' }).then(r => r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'), () => false);
      const tryUpgrade = () => {
        if (!strong || upgrading || !earthMaterial) return;
        upgrading = true; // probe once only
        probe('./tex/night_8k.jpg').then(ok => {
          if (!ok) { console.info('[Globe] ./tex/night_8k.jpg not found – keeping the 4K global night texture'); return; }
          new THREE.TextureLoader().load('./tex/night_8k.jpg', t => {
            if (disposed || !earthMaterial) { t.dispose(); return; }
            t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() ?? 1);
            const old = nightTexture; nightTexture = t; earthMaterial.uniforms.uNight!.value = t; old?.dispose(); tier('data-night-tier', '8k');
          }, undefined, () => console.warn('[Globe] ./tex/night_8k.jpg failed to decode – keeping the 4K global night texture'));
        });
      };
      // Optional dedicated Swiss night texture: ./tex/ch_night.jpg, equirectangular over the detail box (lon 5.0–11.4, lat 45.3–48.3), north up.
      const loadChNight = () => probe('./tex/ch_night.jpg').then(ok => {
        if (!ok) { console.info('[Globe] ./tex/ch_night.jpg not found – Switzerland uses the global night texture'); return; }
        new THREE.TextureLoader().load('./tex/ch_night.jpg', t => {
          if (disposed || !earthMaterial) { t.dispose(); return; }
          t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() ?? 1);
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; chNight = t;
          earthMaterial.uniforms.uChNight!.value = t; earthMaterial.uniforms.uHasChNight!.value = 1; tier('data-ch-night', 'on');
        }, undefined, () => console.warn('[Globe] ./tex/ch_night.jpg failed to decode – Switzerland uses the global night texture'));
      });
      const dMats: { m: THREE.LineBasicMaterial; base: number; zoom: boolean; ch: boolean }[] = [];
      let cityMat: THREE.ShaderMaterial | null = null;
      const loadDetail = () => fetch('./geo/switzerland-detail.json').then(r => { if (!r.ok) throw new Error('detail'); return r.json(); }).then(d => {
        if (disposed || !earthMaterial) return;
        const [lo0, la0, lo1, la1] = d.box as [number, number, number, number];
        const MW = 4096, MH = Math.round(MW * (la1 - la0) / (lo1 - lo0)), cv = document.createElement('canvas');
        cv.width = MW; cv.height = MH;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, MW, MH); ctx.fillStyle = '#ff0000'; ctx.beginPath();
        (d.border as Ring[]).forEach(rg => rg.forEach(([lo, la], i) => { const x = (lo - lo0) / (lo1 - lo0) * MW, y = (la1 - la) / (la1 - la0) * MH; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }));
        ctx.fill('evenodd');
        chMask = new THREE.CanvasTexture(cv); chMask.colorSpace = THREE.NoColorSpace; chMask.anisotropy = 4;
        const u = earthMaterial.uniforms;
        u.uMaskCH!.value = chMask; u.uBox!.value.set((lo0 + 180) / 360, (la0 + 90) / 180, (lo1 + 180) / 360, (la1 + 90) / 180); u.uHasCH!.value = 1;
        const line = (list: Ring[], color: number, base: number, o: { r?: number; scale?: number; zoom?: boolean; ch?: boolean }) => {
          const a: number[] = [];
          list.forEach(rg => { for (let i = 0; i < rg.length - 1; i++) { const p = ll(rg[i]![1], rg[i]![0], o.r ?? 1.0015), q = ll(rg[i + 1]![1], rg[i + 1]![0], o.r ?? 1.0015); a.push(p.x, p.y, p.z, q.x, q.y, q.z); } });
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
          const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
          const l = new THREE.LineSegments(g, m); l.scale.setScalar(o.scale ?? 1); l.renderOrder = 3; scene.add(l);
          dMats.push({ m, base, zoom: !!o.zoom, ch: !!o.ch });
        };
        line(d.border, 0x35e6ff, 1.0, { r: 1.003, ch: true }); line(d.border, 0x1a8cff, 0.45, { r: 1.003, scale: 1.0025, ch: true });
        line(d.cantons, 0x4aa8e0, 0.4, { zoom: true, ch: true }); line(d.lakes, 0x3aa0ff, 0.7, { zoom: true }); line(d.rivers, 0x2a78c8, 0.45, { zoom: true });
        const pos: number[] = [], sz: number[] = [];
        (d.cities as number[][]).forEach(([lo, la, pop]) => { const p = ll(la!, lo!, 1.002); pos.push(p.x, p.y, p.z); sz.push(THREE.MathUtils.clamp((Math.log10(Math.max(pop!, 1000)) - 3) / 3.2, 0, 1)); });
        const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
        cityMat = new THREE.ShaderMaterial({ vertexShader: CITY_V, fragmentShader: CITY_F, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, uniforms: { uDpr: { value: renderer?.getPixelRatio() ?? 1 }, uDist: { value: 3 }, uFade: { value: 0 } } });
        const pts = new THREE.Points(cg, cityMat); pts.renderOrder = 4; scene.add(pts);
        chReplaced = true; detailReady = true; loadChNight();
      }).catch(() => { detailReq = false; });

      const animate = () => {
        raf = requestAnimationFrame(animate);
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        const m = modeRef.current;
        if (m !== prevMode) {
          prevMode = m;
          lightRevealProgress = prefersReducedMotion ? 1 : 0;
          camFrom.copy(camera.position); camTo.copy(VIEWS[m]); camT = 0;
          if (controls) controls.autoRotate = false;
        }
        if (camT < 1) {
          camT = Math.min(1, camT + dt / 1.4);
          const e = camT * camT * (3 - 2 * camT);
          const dir = camFrom.clone().normalize().lerp(camTo.clone().normalize(), e).normalize();
          camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(camFrom.length(), camTo.length(), e)));
          camera.lookAt(0, 0, 0);
          if (camT >= 1) window.clearTimeout(idleTimer), idleTimer = window.setTimeout(() => { if (controls) controls.autoRotate = true; }, 6000);
        }
        const dist = camera.position.length();
        if (controls) controls.rotateSpeed = 0.5 * THREE.MathUtils.clamp((dist - 1) / 1.6, 0.12, 1);
        if (m !== 'world' && dist < 2.9) tryUpgrade();
        if (!detailReq && earthMaterial && (m === 'switzerland' || dist < 2.3)) { detailReq = true; loadDetail(); }
        // ~700 ms fades toward the targets of the current mode
        const step = dt / 0.7, toward = (v: number, t: number) => v + Math.max(-step, Math.min(step, t - v));
        cur.reg = toward(cur.reg, m === 'world' ? 0 : 1);
        if (m !== 'world') cur.sel = toward(cur.sel, m === 'europe' ? 1 : 0);
        cur.ch = toward(cur.ch, m === 'switzerland' ? 1 : 0);
        cur.eu = toward(cur.eu, m === 'europe' ? 1 : 0);
        lightRevealProgress = Math.min(1, lightRevealProgress + dt / 1.45);
        if (earthMaterial) {
          earthMaterial.uniforms.uReg.value = cur.reg;
          earthMaterial.uniforms.uSel.value = cur.sel;
          const reveal = lightRevealProgress * lightRevealProgress * (3 - 2 * lightRevealProgress);
          earthMaterial.uniforms.uLightReveal.value = reveal;
          earthMaterial.uniforms.uTime.value = prefersReducedMotion ? 0 : now / 1000;
        }
        if (detailReady && earthMaterial) {
          const zk = THREE.MathUtils.clamp((2.4 - dist) / 0.8, 0, 1), near = THREE.MathUtils.clamp((2.2 - dist) / 0.8, 0, 1);
          dMats.forEach(d => { d.m.opacity = d.base * (d.ch ? cur.ch : Math.max(cur.ch, cur.eu * 0.6)) * (d.zoom ? zk : 1); });
          earthMaterial.uniforms.uClose!.value = near;
          if (cityMat) { cityMat.uniforms.uDist!.value = dist; cityMat.uniforms.uDpr!.value = renderer?.getPixelRatio() ?? 1; cityMat.uniforms.uFade!.value = THREE.MathUtils.clamp((2.6 - dist) / 0.7, 0, 1) * (m === 'world' ? 0.6 : 1); }
        }
        const bm = borderMats, o = chReplaced ? 0 : 1;
        if (bm.ch) { bm.ch.opacity = cur.ch * o; bm.chGlow.opacity = cur.ch * 0.45 * o; bm.eu.opacity = cur.eu * 0.9; bm.euGlow.opacity = cur.eu * 0.35; bm.euIn.opacity = cur.eu * 0.28; }
        controls?.update();
        renderer?.render(scene, camera);
      };
      raf = requestAnimationFrame(animate);
    } catch {
      setState('error');
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      resizeObserver?.disconnect();
      controls?.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material?.dispose();
      });
      earthMaterial?.dispose();
      maskTexture?.dispose();
      chMask?.dispose();
      chNight?.dispose();
      nightTexture?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div ref={host} className="globe" role="img" aria-label={t(locale, 'globe.aria')}>
      {!geoOk && mode !== 'world' && <div className="globe-msg" style={{ top: 12, bottom: 'auto' }}>{t(locale, 'globe.boundaryMissing')}</div>}
      {state === 'loading' && <div className="globe-msg">{t(locale, 'globe.loading')}</div>}
      {state === 'error' && <div className="globe-msg">{t(locale, 'globe.error')}</div>}
    </div>
  );
}
