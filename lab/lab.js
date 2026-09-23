/* ============================================================
   MV Design · Lab — experiencia inmersiva (prototipo)
   Un solo mundo que se recorre con el scroll, en 5 escenas:
   01 La firma   la M de partículas se arma frente al eclipse,
                 sobre un piso espejo negro.
   02 Manifiesto la M se desarma en un anillo de acreción.
   03 Servicios  la cámara cruza el anillo y entra a un túnel de luz.
   04 Casos      galería con todos los proyectos a la vista.
   05 Contacto   las partículas vuelven a armar la M.
   Los textos viven DENTRO del espacio (CSS3D: HTML real, nítido
   a 1:1 cuando llegas a cada escena) y la cámara los atraviesa.
   Un gesto = una escena: la inercia del trackpad no se pasa de largo.
   ============================================================ */
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";
import { createParticles } from "./particles.js?v=13";

const canvas = document.querySelector("[data-gl]");
const curtain = document.querySelector("[data-curtain]");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const LAST = 4;        // escenas 0..4
const END_Z = -40;     // donde la M se vuelve a armar: el planeta de los casos y el cierre
const AXIS_Y = 1.9;    // centro de la M, del eclipse y del túnel
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// resolución adaptable: arranca moderada y se ajusta sola según lo que aguante el equipo
const DPR_MAX = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
let DPR = Math.min(DPR_MAX, mobile ? 1.25 : 1.5);

/* ---------- Renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  document.documentElement.classList.add("no-gl");
  curtain.classList.add("is-off");
  throw e;
}
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.documentElement.classList.add("is-3d");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07070B");
scene.fog = new THREE.FogExp2("#0B0A16", 0.035);

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2, 19);

/* ---------- Ciclorama: piso espejo que sube en curva a la pared ---------- */
function cyclorama(width, floorFront, floorBack, radius, wallTop) {
  const prof = []; // perfil (z, y)
  for (let i = 0; i <= 24; i++) prof.push([THREE.MathUtils.lerp(floorFront, floorBack, i / 24), 0]);
  for (let i = 1; i <= 40; i++) {
    const a = (i / 40) * Math.PI / 2;
    prof.push([floorBack - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
  }
  for (let i = 1; i <= 20; i++) prof.push([floorBack - radius, radius + (wallTop - radius) * i / 20]);
  const cols = 60, pos = [], uv = [], idx = [];
  for (let j = 0; j < prof.length; j++) for (let i = 0; i <= cols; i++) {
    pos.push((i / cols - 0.5) * width, prof[j][1], prof[j][0]); uv.push(i / cols, j / (prof.length - 1));
  }
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);   // caras hacia arriba/adentro (visibles desde la cámara)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// resplandor de marca pintado en la curva del ciclorama, detrás de la M
function backdropGlow() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 1024, 512);
  const halo = (x, y, r, stops) => {
    g.save(); g.translate(x, y); g.scale(0.45, 1.6);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(-2 * r, -2 * r, 4 * r, 4 * r);
    g.restore();
  };
  g.globalCompositeOperation = "lighter";
  halo(512, 250, 300, [[0, "rgba(98,92,217,.95)"], [.45, "rgba(98,92,217,.35)"], [1, "rgba(0,0,0,0)"]]);
  halo(420, 230, 200, [[0, "rgba(158,67,184,.75)"], [1, "rgba(0,0,0,0)"]]);
  halo(610, 270, 220, [[0, "rgba(43,204,217,.55)"], [1, "rgba(0,0,0,0)"]]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  return tex;
}
const cycloGeo = cyclorama(46, 14, -3.5, 4.5, 18);
const FLOOR_OPACITY = 0.74;
const floor = new THREE.Mesh(cycloGeo, new THREE.MeshBasicMaterial({
  color: new THREE.Color("#4a4a5c"), map: backdropGlow(), transparent: true, opacity: FLOOR_OPACITY
}));
scene.add(floor);
const floorEnd = new THREE.Mesh(cycloGeo, floor.material.clone());
floorEnd.position.z = END_Z;
floorEnd.material.opacity = 0;
scene.add(floorEnd);
// orden de dibujo: reflejos (-2) → piso que los vela (-1) → escena → la M de partículas (1)
floor.renderOrder = floorEnd.renderOrder = -1;
floor.material.depthWrite = floorEnd.material.depthWrite = false;   // no corta los brillos con un filo duro

/* ---------- Anillos de luz: el eclipse y el túnel ---------- */
const ringGeo = new THREE.PlaneGeometry(7.2, 7.2);
const ringTime = { value: 0 };
function makeRing(off = 0, glow = 1, clip = 0) {
  return new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: ringTime, uDim: { value: 1 }, uOff: { value: off }, uGlow: { value: glow }, uClip: { value: clip } },
    vertexShader: `varying vec2 vUv; varying float vWY;
      void main(){ vUv = uv; vWY = (modelMatrix * vec4(position, 1.)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform float uTime; uniform float uDim; uniform float uOff; uniform float uGlow; uniform float uClip; varying vec2 vUv; varying float vWY;
      void main(){
        vec2 p = (vUv - .5) * 2.;                 // el plano mide 7.2: radio del anillo ≈ 2.3
        float r = length(p);
        if (r > 1. || (uGlow < .5 && r < .38)) discard;   // el túnel no pinta su interior vacío
        // degradado de marca que gira despacio: morado → índigo → azul → cian
        float g = fract(atan(p.y, p.x) / 6.2831853 + .5 + uTime * .015 + uOff);
        g = g < .5 ? g * 2. : (1. - g) * 2.;      // ida y vuelta, sin costura
        vec3 c = mix(vec3(.62,.26,.72), vec3(.38,.36,.85), smoothstep(0., .33, g));
        c = mix(c, vec3(.28,.57,.85), smoothstep(.33, .66, g));
        c = mix(c, vec3(.17,.8,.85), smoothstep(.66, 1., g));
        float R = .64;
        float ring = exp(-pow((r - R) / .012, 2.));            // filo de luz
        float halo = exp(-pow((r - R) / .05, 2.)) * .22;        // resplandor corto (sin corona ni destellos)
        float corona = 0.;
        float inner = smoothstep(R, R - .5, r) * .05;           // velo tenue adentro
        float fade = smoothstep(1., .82, r);
        // el eclipse se hunde suave en el piso (+1) y su reflejo sólo existe debajo (-1)
        float clipK = uClip == 0. ? 1. : smoothstep(-.05, .3, vWY * uClip);
        gl_FragColor = vec4((c * (ring * 2.2 + (halo + corona + inner) * uGlow)) * fade * uDim * clipK, 1.);
      }`
  }));
}
const sun = makeRing(0, 1, 1);          // el eclipse detrás de la M
sun.position.set(0, AXIS_Y, -4.2);
scene.add(sun);
const mirror = new THREE.Group();        // lo que se refleja en el piso
mirror.scale.y = -1;
scene.add(mirror);
const sunMirror = makeRing(0, 1, -1);
sunMirror.position.copy(sun.position);
sunMirror.renderOrder = -2;
mirror.add(sunMirror);
const tunnel = [];
for (let i = 1; i <= 5; i++) {
  const r = makeRing(i * 0.13, 0.3);
  r.position.set(0, AXIS_Y, -4.2 - 3.6 * i);
  r.scale.setScalar(1 + i * 0.04);
  scene.add(r); tunnel.push(r);
}

/* ---------- Haz de luz de estudio (volumétrico falso) ---------- */
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 2.6, 9, 64, 1, true),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#8f8cff") }, uDim: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uDim; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(vN, vV)), 2.2);
        float fall = smoothstep(0., .85, vUv.y) * smoothstep(1., .55, vUv.y);
        float flick = .92 + .08 * sin(uTime * .7 + vUv.y * 6.);
        gl_FragColor = vec4(uColor * edge * fall * flick * .05 * uDim, 1.);
      }`
  })
);
beam.position.set(0, 5.2, -0.2);
scene.add(beam);

/* ---------- Horizonte: resplandor de marca al fondo ---------- */
const horizon = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 18),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uDim: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform float uDim; varying vec2 vUv;
      void main(){
        vec2 p = vUv - vec2(.5, .18);
        float glow = exp(-dot(p * vec2(1.2, 4.2), p * vec2(1.2, 4.2)) * 6.);
        vec3 c = mix(vec3(.38,.36,.85), vec3(.17,.8,.85), vUv.x);
        c = mix(c, vec3(.62,.26,.72), smoothstep(.55, .0, vUv.x) * .6);
        gl_FragColor = vec4(c * glow * .22 * uDim, 1.);
      }`
  })
);
horizon.position.set(0, 2.6, -24);
scene.add(horizon);

/* ---------- Polvo en el aire del estudio ---------- */
const DUST = mobile ? 700 : 1600;
const dustGeo = new THREE.BufferGeometry();
const dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  dp[i * 3] = (Math.random() - .5) * 14; dp[i * 3 + 1] = Math.random() * 6; dp[i * 3 + 2] = (Math.random() - .5) * 12 - 1;
  ds[i] = Math.random();
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(ds, 1));
const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPx: { value: DPR }, uDim: { value: 1 } },
  vertexShader: `
    uniform float uTime; uniform float uPx; attribute float aSeed; varying float vA;
    void main(){
      vec3 p = position;
      p.y = mod(p.y + uTime * (.04 + aSeed * .06), 6.);
      p.x += sin(uTime * .2 + aSeed * 40.) * .25; p.z += cos(uTime * .17 + aSeed * 30.) * .25;
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (1.2 + aSeed * 2.6) * uPx * (6. / -mv.z);
      vA = .25 + .75 * aSeed; vA *= smoothstep(0., .6, p.y) * smoothstep(6., 4.8, p.y);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uDim; varying float vA;
    void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d);
      gl_FragColor = vec4(vec3(.78,.82,1.) * a * vA * .55 * uDim, 1.); }`
}));
dust.frustumCulled = false;
scene.add(dust);

/* ---------- La M: se muestrea del SVG oficial y se vuelve partículas ---------- */
const GRADS = [ // [desde, hasta, color A, color B] en coordenadas del SVG (283.46²)
  [[88.59, 41.38], [194.36, 142.22], "#4892d9", "#2bccd9"],   // chevrón azul
  [[157.27, 150.49], [236.51, 71.25], "#9e43b8", "#625cd9"],  // lágrima morada
  [[39.02, 193.19], [94.11, 193.19], "#9e43b8", "#625cd9"],   // punto morado (en el SVG su degradado queda horizontal)
  [[189.93, 193.19], [245.02, 193.19], "#4892d9", "#2bccd9"]  // punto azul
];
const Z_OFF = [0, 5, 0, 0]; // la lágrima va un poco al frente del chevrón
// igual que el SVG: interpola en sRGB y después pasa a lineal (así el color en pantalla es idéntico al logo)
const srgb = (hex) => [0, 2, 4].map((k) => parseInt(hex.slice(1 + k, 3 + k), 16) / 255);
function paintGradient(geo, g) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const [a, b, ca, cb] = g, A = srgb(ca), B = srgb(cb), c = new THREE.Color();
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, ((pos.getX(i) - a[0]) * dx + (pos.getY(i) - a[1]) * dy) / L));
    c.setRGB(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, THREE.SRGBColorSpace);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}
let particles = null;
async function buildM() {
  const svgText = await (await fetch("../assets/logos/mv-design-mark-color.svg")).text();
  const data = new SVGLoader().parse(svgText);
  const box = new THREE.Box3(), geos = [];
  data.paths.forEach((path, i) => {
    const geo = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth: 34, bevelEnabled: true, bevelThickness: 9, bevelSize: 6.5, bevelOffset: 0, bevelSegments: 6, curveSegments: 40
    });
    geo.translate(0, 0, Z_OFF[i] || 0);
    paintGradient(geo, GRADS[Math.min(i, GRADS.length - 1)]);
    geo.computeVertexNormals();
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    geos.push(geo);
  });
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const s = 2.7 / size.x;                           // ~2.7 m de ancho, centrada en su pivote
  const holder = new THREE.Object3D();
  holder.scale.set(s, -s, s);                       // el SVG tiene la Y hacia abajo
  holder.position.set(-center.x * s, center.y * s, -center.z * s);
  holder.updateMatrix();
  particles = createParticles({ renderer, geos, holderMatrix: holder.matrix, mobile, reduced });
  particles.px = DPR * (mobile ? 0.8 : 1);
  particles.points.renderOrder = 1;
  particles.reflection.renderOrder = -2;            // debajo del piso: el piso la vela
  scene.add(particles.points);
  scene.add(particles.reflection);                  // la reflexión se voltea en su propio shader
  geos.forEach((g) => g.dispose());
}

const raycaster = new THREE.Raycaster();
/* ---------- Casos: fichas en órbita alrededor de la M (el planeta) ---------- */
// son planos WebGL: las de atrás pasan DETRÁS del logo; se pintan con alfa 0 para salir del bloom y del
// tono de cámara, así cada foto conserva su color real (sin quemarse)
const CASES = [
  { img: "../assets/img/case-gu-poster.jpg", name: "GU · Gestión Urbanística", sector: "Inmobiliario · Urbanismo", chip: "Web 3D inmersiva" },
  { img: "../assets/img/case-vistareal.jpg", name: "Vista Real Country Club", sector: "Club deportivo · Hospitalidad", chip: "Web institucional" },
  { img: "../assets/img/case-blak.jpg", name: "Blak Coffee & Co", sector: "Cafetería", chip: "Branding integral" },
  { img: "../assets/img/case-protect.jpg", name: "Protect Diversity", sector: "Dermocosmética vegana", chip: "E-commerce · Shopify" },
  { img: "../assets/img/case-manzzani.jpg", name: "Manzzani", sector: "Manzanas gourmet", chip: "Shopify + redes" }
];
const CARD_AR = 1.55, TAU = Math.PI * 2;
const cardGeo = new THREE.PlaneGeometry(1, 1);
const cards = CASES.map((cs, i) => {
  const u = {
    uMap: { value: null }, uCover: { value: new THREE.Vector2(1, 1) }, uAspect: { value: CARD_AR },
    uBright: { value: 1 }, uEdge: { value: 0.4 }, uTime: ringTime
  };
  const m = new THREE.Mesh(cardGeo, new THREE.ShaderMaterial({
    uniforms: u, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec2 uCover; uniform float uAspect, uBright, uEdge, uTime; varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
      void main(){
        vec2 size = vec2(uAspect, 1.);
        float d = sdRound((vUv - .5) * size, size * .5, .08);
        if (d > 0.) discard;                                                   // esquinas redondeadas
        vec3 c = texture2D(uMap, (vUv - .5) * uCover + .5).rgb * uBright;
        vec3 bc = mix(vec3(.36, .06, .47), vec3(.02, .6, .69), clamp(vUv.x * .7 + vUv.y * .3 + sin(uTime * .5) * .15, 0., 1.));
        c = mix(c, bc, smoothstep(.022, .0, -d) * uEdge);                      // filo con el degradado de marca
        gl_FragColor = vec4(c, 0.);                                            // alfa 0: color exacto, fuera del bloom
      }`
  }));
  m.userData = { i, u, lift: 0, ready: false };
  m.visible = false;
  scene.add(m);
  return m;
});
let texturesAsked = false;
function loadCaseTextures() {
  if (texturesAsked) return; texturesAsked = true;
  const loader = new THREE.TextureLoader();
  cards.forEach((m, i) => loader.load(CASES[i].img, (tx) => {
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    const ia = tx.image.width / tx.image.height;
    m.userData.u.uCover.value.set(Math.min(1, CARD_AR / ia), Math.min(1, ia / CARD_AR));
    m.userData.u.uMap.value = tx; m.userData.ready = true;
    renderer.initTexture(tx);                       // sube a la GPU ya, no a medio vuelo
  }));
}
setTimeout(loadCaseTextures, 3000);
let orbitBase = 0, orbitSpeed = 0.14, orbitSel = -1, orbitFocus = -2;
const capMeta = document.querySelector("[data-cap-meta]"), capName = document.querySelector("[data-cap-name]"), capChip = document.querySelector("[data-cap-chip]");
const hoverCapable = matchMedia("(hover: hover)").matches;
function showCaption(i) {
  if (i === orbitFocus) return;
  orbitFocus = i;
  const cs = CASES[i];
  if (capMeta) capMeta.textContent = cs ? `${String(i + 1).padStart(2, "0")} / 05 · ${cs.sector}` : (hoverCapable ? "Pasa el cursor por una ficha" : "Toca una ficha");
  if (capName) capName.textContent = cs ? cs.name : "Cinco marcas en órbita";
  if (capChip) { capChip.textContent = cs ? cs.chip : ""; capChip.hidden = !cs; }
}
// la ficha más al frente de la órbita ahora mismo
const frontCard = () => cards.reduce((best, m, i) => (Math.sin(orbitBase + i * TAU / 5) > Math.sin(orbitBase + best * TAU / 5) ? i : best), 0);
function selectCase(dirn) {
  const start = orbitSel >= 0 ? orbitSel : frontCard() - (dirn > 0 ? 1 : -1) + 5;
  orbitSel = (((start + dirn) % 5) + 5) % 5;
}
document.querySelector("[data-case-prev]")?.addEventListener("click", () => selectCase(-1));
document.querySelector("[data-case-next]")?.addEventListener("click", () => selectCase(1));
// tocar / hacer clic en una ficha la trae al frente; tocar fuera la suelta
let downX = 0, downY = 0, downT = 0;
addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); }, { passive: true });
addEventListener("pointerup", (e) => {
  if (active !== 3 || (e.target.closest && e.target.closest("button, a"))) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10 || performance.now() - downT > 450) return;
  const pt = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pt, camera);
  const hit = raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0];
  orbitSel = hit ? (orbitSel === hit.object.userData.i ? -1 : hit.object.userData.i) : -1;
}, { passive: true });

/* ---------- Posproceso ---------- */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType }));
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), mobile ? 0.22 : 0.28, 0.45, 0.85);   // brillo contenido, sin flares
// el bloom ignora lo marcado con alfa < .25 (las fichas) y al mezclarse no toca el alfa (la máscara sobrevive)
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader
  .replace("gl_FragColor = mix( outputColor, texel, alpha );", "gl_FragColor = mix( outputColor, texel, alpha * step( .25, texel.a ) );");
bloom.materialHighPassFilter.needsUpdate = true;
Object.assign(bloom.blendMaterial, {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
});
composer.addPass(bloom);
// salida: tono de cámara ACES sólo donde toca; la M y las fichas conservan su color exacto
const outputPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uExposure: { value: renderer.toneMappingExposure } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;
    vec3 rrt(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
      const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
      c *= uExposure / .6; c = I * c; c = rrt(c); c = O * c; return clamp(c, 0., 1.);
    }
    vec3 toSRGB(vec3 c){ c = clamp(c, 0., 1.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c)); }
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.a > .75 ? aces(t.rgb) : t.rgb;
      gl_FragColor = vec4(toSRGB(c), 1.);
    }`
});
composer.addPass(outputPass);
const BASE_CA = 0;   // sin aberración cromática en reposo (sólo un toque al moverse)
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: BASE_CA }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uCA; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5; float r = length(d);
      vec2 off = d * uCA * (1. + r * 2.);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c *= mix(1., .55, smoothstep(.35, .95, r));                         // viñeta
      c += (hash(vUv * uRes + fract(uTime) * 100.) - .5) * .035;           // grano
      gl_FragColor = vec4(c, 1.);
    }`
});
composer.addPass(finalPass);

/* ---------- Textos dentro del espacio (CSS3D) ---------- */
const css = new CSS3DRenderer({ element: document.querySelector(".stage") });   // dentro de <main>
css.domElement.classList.add("world");
const cssScene = new THREE.Scene();
const sections = [...document.querySelectorAll(".scene[data-scene]")];
const labels = sections.map((el) => {
  const o = new CSS3DObject(el);
  el.style.userSelect = ""; el.style.webkitUserSelect = "";           // correo y teléfonos se pueden copiar
  cssScene.add(o); return o;
});

/* ---------- Recorrido de cámara: un punto clave por escena ---------- */
let portrait = false, BASE_FOV = 28;
let posCurve, lookCurve, FOCUS = [];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KEYS = { pos: [], look: [] };
// ancla de cada texto: distancia frente a la cámara de su escena y desplazamiento vertical (fracción de pantalla)
const TEXT_DESK = [{ d: 8.4, oy: 0.25 }, { d: 13.2, oy: 0 }, { d: 6.5, oy: 0.02 }, { d: 9.5, oy: 0 }, { d: 8.4, oy: 0.25 }];
const TEXT_PORT = [{ d: 9.5, oy: 0.26 }, { d: 15.5, oy: 0.02 }, { d: 6.5, oy: 0.04 }, { d: 9.5, oy: 0 }, { d: 9.5, oy: 0.25 }];
const mLook = new THREE.Matrix4(), qTmp = new THREE.Quaternion();
function buildPath() {
  const E = END_Z;
  if (portrait) {
    KEYS.pos = [V(0, 2.1, 13.5), V(0, 1.9, 12.5), V(0, AXIS_Y, -9), V(0, AXIS_Y + 4.2, E + 16.5), V(0, 2.1, E + 13.5)];
    KEYS.look = [V(0, 1.15, 0), V(0, 1.6, -4.2), V(0, AXIS_Y, -24), V(0, AXIS_Y + 1.2, E), V(0, 1.15, E)];
    FOCUS = [13.6, 16.7, 9, 17, 13.6];
  } else {
    KEYS.pos = [V(0, 1.9, 12), V(0, AXIS_Y, 9.8), V(0, AXIS_Y, -9), V(0, AXIS_Y + 2.2, E + 15.2), V(0, 1.9, E + 12)];
    KEYS.look = [V(0, 1.45, 0), V(0, AXIS_Y, -4.2), V(0, AXIS_Y, -24), V(0, AXIS_Y + 0.35, E), V(0, 1.45, E)];
    FOCUS = [12, 14, 9, 15, 12];
  }
  posCurve = new THREE.CatmullRomCurve3(KEYS.pos, false, "centripetal");
  lookCurve = new THREE.CatmullRomCurve3(KEYS.look, false, "centripetal");
  // cada texto queda de frente a la cámara de su escena, a 1:1 (nítido) cuando llegas
  const T = portrait ? TEXT_PORT : TEXT_DESK;
  const tanH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const H = innerHeight, narrow = innerWidth <= 720;
  labels.forEach((o, i) => {
    const { d, oy } = T[i];
    mLook.lookAt(KEYS.pos[i], KEYS.look[i], THREE.Object3D.DEFAULT_UP);
    qTmp.setFromRotationMatrix(mLook);
    const s = (2 * d * tanH) / H;                   // unidades de mundo por píxel CSS a esa distancia
    // mide el bloque (el renderer oculta con display:none las escenas lejanas)
    const el = sections[i], prevD = el.style.display;
    el.style.display = "";
    const h = el.offsetHeight;
    el.style.display = prevD;
    const top = narrow ? (i === 3 ? 112 : 76) : 96, bottom = narrow ? (i === LAST || i === 3 ? 24 : 96) : 40;
    const fit = h > 0 ? Math.min(1, (H - top - bottom) / h) : 1;   // si no cabe, se achica un poco
    const half = (h * fit) / 2;
    const cy = clamp(H / 2 + oy * H, top + half, Math.max(top + half, H - bottom - half));
    o.position.set(0, -(cy - H / 2) * s, -d).applyQuaternion(qTmp).add(KEYS.pos[i]);
    o.quaternion.copy(qTmp);
    o.scale.setScalar(s * fit);
    o.userData.d = d;
  });
}

function resize() {
  const w = innerWidth, h = innerHeight;
  portrait = w / h < 0.8;
  camera.aspect = w / h;
  BASE_FOV = portrait ? 40 : 28;
  camera.fov = BASE_FOV; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  css.setSize(w, h);
  finalPass.uniforms.uRes.value.set(w, h);
  buildPath();
}
addEventListener("resize", resize);
resize();

function applyDpr(v) {
  DPR = v;
  renderer.setPixelRatio(v);
  composer.setPixelRatio(v);
  composer.setSize(innerWidth, innerHeight);
  if (particles) particles.px = v * (mobile ? 0.8 : 1);
  dust.material.uniforms.uPx.value = v;
}
// mide 60 cuadros EN REPOSO (no durante transiciones) y decide con la mediana:
// baja la resolución si va lento, la sube si sobra. Cambiarla reasigna búferes, así que es poco frecuente.
// "base" = el ritmo natural de la pantalla (60/120 Hz, o 30 si el equipo está en ahorro de energía):
// se aprende con el mejor ritmo visto y se relaja un poco cada ventana, así se adapta si el tope cambia.
const DPR_MIN = Math.min(DPR_MAX, mobile ? 0.9 : 0.9);
let perfBuf = [], perfSkip = 90, frameBase = 1 / 60;
function adaptDpr(raw, moving) {
  if (perfSkip > 0) { perfSkip--; return; }           // ignora la compilación inicial
  if (moving || raw > 0.25) { perfBuf.length = 0; return; }   // en transición o pestaña oculta: no mide
  perfBuf.push(raw);
  if (perfBuf.length < 60) return;
  const med = perfBuf.sort((a, b) => a - b)[30]; perfBuf.length = 0;
  frameBase = Math.min(frameBase * 1.03, med);
  if (med > frameBase * 1.35 && DPR > DPR_MIN) { applyDpr(Math.max(DPR_MIN, DPR * 0.85)); perfSkip = 30; }
  else if (med < frameBase * 1.1 && DPR < DPR_MAX) { applyDpr(Math.min(DPR_MAX, DPR * 1.08)); perfSkip = 30; }
}

/* ---------- Navegación: un gesto = una escena, y cada transición llega y se asienta ---------- */
let from = 0, to = 0, tStart = 0, dur = 0, prog = 0, lockUntil = 0, v0 = 0, progVel = 0;
const now = () => performance.now();
// posición y velocidad del tramo actual: desde reposo, curva cubic in-out; si ya venía en
// movimiento, un tramo Hermite que arranca con esa velocidad (sin frenar en seco)
function tween(kt) {
  const D = to - from;
  if (dur <= 0) return [to, 0];
  if (v0 === 0) {
    const e = easeInOut(kt), de = kt < 0.5 ? 12 * kt * kt : 3 * Math.pow(2 - 2 * kt, 2);
    return [from + D * e, (D * de) / dur];
  }
  const s = kt, s2 = s * s, s3 = s2 * s, m0 = v0 * dur;
  const pos = (2 * s3 - 3 * s2 + 1) * from + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * to;
  const dpos = (6 * s2 - 6 * s) * from + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) * to;
  return [pos, dpos / dur];
}
function goTo(i) {
  i = clamp(i, 0, LAST);
  if (i === to) return;                                 // mismo destino: no se reinicia nada
  const moving = prog !== to;
  from = prog; to = i; tStart = now();
  v0 = moving && !reduced ? progVel : 0;
  dur = reduced ? 0 : 1.55 + 0.3 * Math.max(0, Math.abs(to - from) - 1);
  lockUntil = tStart + (reduced ? 350 : Math.max(900, dur * 1000 * 0.72));
}
const step = (dirn) => goTo(to + dirn);
// rueda / trackpad: se cuenta UN gesto hasta que la rueda descansa 200 ms (así la inercia no brinca escenas)
let wheelAcc = 0, lastWheel = 0, gestureUsed = false, wheelAvg = 0;
addEventListener("wheel", (e) => {
  if (e.ctrlKey) return;                               // pellizco para zoom: se respeta
  e.preventDefault();
  const t = now();
  let d = e.deltaY; if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= innerHeight;
  const ad = Math.abs(d);
  if (t - lastWheel > 200) { wheelAcc = 0; gestureUsed = false; }
  // la inercia sólo decae: si el empuje vuelve a crecer de golpe, es un gesto nuevo
  else if (gestureUsed && t >= lockUntil && ad > Math.max(14, wheelAvg * 2.5)) { gestureUsed = false; wheelAcc = 0; }
  wheelAvg = wheelAvg * 0.75 + ad * 0.25;
  lastWheel = t;
  if (gestureUsed || t < lockUntil) return;
  wheelAcc += d;
  if (Math.abs(wheelAcc) >= 36) { gestureUsed = true; wheelAcc = 0; step(Math.sign(d)); }
}, { passive: false });
// touch: un deslizamiento de ~48 px = una escena
let ty0 = null, touchUsed = false;
addEventListener("touchstart", (e) => { ty0 = e.touches[0].clientY; touchUsed = false; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (ty0 === null || touchUsed || now() < lockUntil) return;
  const dy = ty0 - e.touches[0].clientY;
  if (Math.abs(dy) > 48) { touchUsed = true; step(Math.sign(dy)); }
}, { passive: true });
addEventListener("touchend", () => { ty0 = null; }, { passive: true });
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === " " && e.target.closest && e.target.closest("button, a, [tabindex], summary")) return;   // Espacio activa el botón enfocado
  if (e.repeat) { if ([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(e.key)) e.preventDefault(); return; }
  if (active === 3 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); selectCase(e.key === "ArrowRight" ? 1 : -1); return; }
  if (["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) { e.preventDefault(); step(1); }
  else if (["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) { e.preventDefault(); step(-1); }
  else if (e.key === "Home") { e.preventDefault(); goTo(0); }
  else if (e.key === "End") { e.preventDefault(); goTo(LAST); }
});
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.go)));

/* ---------- HUD ---------- */
const idxBtns = [...document.querySelectorAll(".idx [data-go]")];
const noteEl = document.querySelector("[data-note]");
const progEl = document.querySelector("[data-prog]");
const NOTES = [
  "Diseñamos marcas, sitios<br>y contenido con intención<br>comercial. Para que tu<br>cliente te elija.",
  "Antes del diseño,<br>la decisión.",
  "Estrategia, diseño, contenido<br>y pauta en un solo equipo.",
  "Trabajo real de branding,<br>diseño web y contenido.<br>Desde Querétaro para todo México.",
  "Respondemos el mismo día<br>por WhatsApp."
];
let active = -1;
const waFloat = document.querySelector(".wa");
const narrowMQ = matchMedia("(max-width: 720px)");
function setActive(a) {
  if (a === active) return;
  active = a;
  document.body.dataset.scene = a;
  // se esconde en contacto (ahí están los dos WhatsApp) y en casos en celular (tapaba la galería)
  if (waFloat) waFloat.inert = a === LAST || (a === 3 && narrowMQ.matches);
  idxBtns.forEach((b, i) => { if (i === a) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
  if (noteEl) noteEl.innerHTML = NOTES[a];
}

/* ---------- Cursor: rayo en el mundo para empujar partículas ---------- */
const ndc = new THREE.Vector2(), smooth = new THREE.Vector2();
let pointerOn = 0, lastMove = 0;
addEventListener("pointermove", (e) => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointerOn = 1; lastMove = now();
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointerOn = 0; });
addEventListener("touchend", () => { pointerOn = 0; }, { passive: true });

/* ---------- Loop ---------- */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camFwd = new THREE.Vector3();
let t0 = null, lastT = 0, vel = 0, mouseAmt = 0;

function frame() {
  const t = clock.getElapsedTime();
  if (t0 === null) { t0 = t; lastT = t; }
  const raw = t - lastT, dt = Math.min(0.05, raw); lastT = t;
  adaptDpr(raw, prog !== to);
  const intro = reduced ? 1 : Math.min(1, (t - t0) / 4.2);
  const k = easeOut(intro);
  smooth.lerp(ndc, 0.06);

  // transición: de una escena a la otra con llegada suave
  const kt = dur > 0 ? clamp((now() - tStart) / (dur * 1000), 0, 1) : 1;
  [prog, progVel] = kt >= 1 ? [to, 0] : tween(kt);
  vel = THREE.MathUtils.lerp(vel, progVel, 0.25);
  const p = prog;
  setActive(Math.round(p));
  if (progEl) progEl.style.transform = `scaleX(${p / LAST})`;

  // cámara sobre la curva + entrada en dolly + deriva con el cursor
  posCurve.getPoint(p / LAST, camPos);
  lookCurve.getPoint(p / LAST, camLook);
  const heroW = 1 - sm(0, 0.6, p), endW = sm(3.4, 4, p);
  if (!reduced) {
    const orbit = (Math.sin(t * 0.11) * (portrait ? 0.018 : 0.05) + smooth.x * 0.06) * Math.max(heroW, endW);   // en celular casi quieta: los botones no se corren
    tmp.copy(camPos).sub(camLook).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit);
    camPos.copy(camLook).add(tmp);
    camPos.x += smooth.x * 0.1 * (1 - Math.max(heroW, endW));
    camPos.y += smooth.y * 0.12;
  }
  if (heroW > 0 && k < 1) {
    tmp.copy(camPos).sub(camLook).normalize().multiplyScalar(7 * (1 - k) * heroW);
    camPos.add(tmp); camPos.y += (1 - k) * 1.0 * heroW;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const kick = reduced ? 0 : Math.min(Math.abs(vel), 2.5);
  camera.fov = BASE_FOV + kick * 2;
  camera.updateProjectionMatrix();
  camera.getWorldDirection(camFwd);
  finalPass.uniforms.uCA.value = BASE_CA + kick * 0.0015;

  // el estudio del inicio se apaga al salir; el del final se enciende al llegar
  const studio = 1 - sm(0.2, 0.9, p), endStudio = sm(3.4, 4, p);
  floor.material.opacity = FLOOR_OPACITY * studio; floor.visible = studio > 0.001;
  floorEnd.material.opacity = FLOOR_OPACITY * endStudio; floorEnd.visible = endStudio > 0.001;
  beam.material.uniforms.uDim.value = studio; beam.visible = studio > 0.001;
  horizon.material.uniforms.uDim.value = studio; horizon.visible = studio > 0.001;
  dust.material.uniforms.uDim.value = studio; dust.visible = studio > 0.001;
  sunMirror.material.uniforms.uDim.value = 0.3 * studio; sunMirror.visible = studio > 0.001;

  // anillos: se encienden al acercarse y se apagan al cruzarlos
  const ringDim = (r, gate) => {
    const ahead = camera.position.z - r.position.z;
    r.material.uniforms.uDim.value = gate * sm(0.2, 2.6, ahead) * (1 - sm(20, 34, ahead));
    r.visible = r.material.uniforms.uDim.value > 0.001;
  };
  ringDim(sun, 1);
  sun.material.uniforms.uClip.value = studio > 0.02 ? 1 : 0;
  tunnel.forEach((r) => ringDim(r, 0.6 * sm(1.25, 1.9, p) * (1 - sm(2.45, 2.9, p))));   // al salir del túnel se apagan
  ringTime.value = t;

  // partículas: armar → anillo → túnel → armar de nuevo al final
  if (particles) {
    const U = particles.shared;
    U.uA.value = sm(0.05, 1.3, p);
    U.uC.value = sm(1.15, 2.1, p);
    U.uB.value = sm(2.2, 2.95, p);         // al salir del túnel la M se construye: es el planeta de los casos
    U.uRot.value = reduced ? 0 : Math.sin(t * 0.23) * 0.22 + smooth.x * 0.1;
    const bob = reduced ? 0 : Math.sin(t * 0.6) * 0.04;
    U.uStart.value.set(0, AXIS_Y + bob, 0);
    U.uEnd.value.set(0, AXIS_Y + bob, END_Z);
    // cursor: se enciende al moverlo y se relaja si se queda quieto
    const want = reduced ? 0 : pointerOn * (now() - lastMove < 2500 ? 1 : 0.45);
    mouseAmt += (want - mouseAmt) * (1 - Math.exp(-dt * 6));
    raycaster.setFromCamera(smooth, camera);
    U.uRayO.value.copy(raycaster.ray.origin); U.uRayD.value.copy(raycaster.ray.direction);
    U.uMouse.value = mouseAmt;
    const fi = Math.min(LAST - 1, Math.floor(p)), ff = p - fi;
    particles.focus = THREE.MathUtils.lerp(FOCUS[fi], FOCUS[fi + 1], ff);
    particles.reflect = Math.max(studio, endStudio);
    particles.update(dt, reduced ? 0 : t);
  }

  // casos: las fichas orbitan la M; entran girando, se detienen con el cursor y se van al pasar al contacto
  const cIn = sm(2.3, 2.95, p), cOut = sm(3.2, 3.62, p), cVis = cIn * (1 - cOut);
  if (p > 1.4) loadCaseTextures();
  if (active !== 3) orbitSel = -1;
  let hov = -1;
  if (cVis > 0.5 && hoverCapable && pointerOn) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0];
    if (hit) hov = hit.object.userData.i;
  }
  const focus = hov >= 0 ? hov : orbitSel;
  if (cVis > 0.01) showCaption(focus);
  document.body.style.cursor = hov >= 0 ? "pointer" : "";
  orbitSpeed += ((focus >= 0 || reduced ? 0 : 0.14) - orbitSpeed) * (1 - Math.exp(-dt * 3));
  if (orbitSel >= 0 && hov < 0) {   // la elegida viene al frente
    let dA = (Math.PI / 2 - orbitSel * TAU / 5) - orbitBase;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    orbitBase += dA * (1 - Math.exp(-dt * (reduced ? 60 : 3.5)));
  } else orbitBase += orbitSpeed * dt;
  const ORB_R = portrait ? 2.2 : 4.3, CARD_W = portrait ? 1.3 : 2.05, TILT = portrait ? 0.38 : 0.15;
  const C = tmp2.set(0, AXIS_Y + (reduced ? 0 : Math.sin(t * 0.6) * 0.04), END_Z);
  cards.forEach((m) => {
    const ud = m.userData, i = ud.i;
    m.visible = cVis > 0.01 && ud.ready;
    if (!m.visible) return;
    const th = orbitBase + i * TAU / 5 + (1 - cIn) * 2.2;
    const R = ORB_R * (0.45 + 0.55 * cIn) * (1 + cOut * 0.9);
    const x = Math.cos(th) * R, z = Math.sin(th) * R;
    m.position.set(C.x + x, C.y - z * Math.sin(TILT), C.z + z * Math.cos(TILT));
    ud.lift += ((i === focus ? 1 : 0) - ud.lift) * (1 - Math.exp(-dt * 7));
    m.position.addScaledVector(camFwd, -1.1 * ud.lift);                     // la enfocada se acerca
    const sc = CARD_W * cVis * (1 + 0.42 * ud.lift);
    m.scale.set(sc, sc / CARD_AR, 1);
    m.quaternion.copy(camera.quaternion);                                  // siempre de frente
    const near = (Math.sin(th) + 1) / 2;
    let b = 0.5 + 0.5 * near;
    if (focus >= 0) b = i === focus ? 1.05 : b * 0.55;
    ud.u.uBright.value = b;
    ud.u.uEdge.value = 0.35 + 0.65 * ud.lift;
  });

  // textos: aparecen al acercarte, la cámara los atraviesa al seguir
  labels.forEach((o, i) => {
    const vis = 1 - sm(0.45, 0.85, Math.abs(p - i));
    const ratio = tmp.copy(o.position).sub(camera.position).dot(camFwd) / o.userData.d;   // 1 = a 1:1; 0.5 = al doble
    const op = vis * sm(0.5, 0.78, ratio);
    const on = op > 0.01;
    if (o.visible !== on) o.visible = on;
    const el = sections[i];
    const opS = op.toFixed(3);
    if (el.style.opacity !== opS) el.style.opacity = opS;
    const inert = vis < 0.6;
    if (el.inert !== inert) el.inert = inert;
  });

  beam.material.uniforms.uTime.value = t;
  dust.material.uniforms.uTime.value = reduced ? 0 : t;
  finalPass.uniforms.uTime.value = t;

  composer.render();
  css.render(cssScene, camera);
  requestAnimationFrame(frame);
}

// para pruebas: ?s=3 abre directo en una escena; ?debug expone el mundo en la consola
const qsScene = new URLSearchParams(location.search).get("s");
if (qsScene !== null) { from = to = prog = clamp(Math.round(+qsScene) || 0, 0, LAST); }
if (/[?&]debug\b/.test(location.search)) window.__lab = { THREE, get dpr() { return DPR; }, renderer, scene, composer, bloom, camera, get particles() { return particles; }, goTo };

const lift = () => curtain.classList.add("is-off");
setTimeout(lift, 3500);
frame();
buildM().catch((err) => console.error(err)).finally(() => requestAnimationFrame(lift));
