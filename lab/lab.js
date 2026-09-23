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
import { createParticles, BLAST_GLSL, BLAST_N } from "./particles.js?v=21";

const canvas = document.querySelector("[data-gl]");
const curtain = document.querySelector("[data-curtain]");
// progreso real del telón: CSS y fuentes 10 % · three 40 % · SVG 55 % · partículas 85 % · primer cuadro 100 %
const setLoad = (v) => curtain && curtain.style.setProperty("--load", v);
setLoad(0.4);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const LAST = 4;        // escenas 0..4
const END_Z = -40;     // donde la M se vuelve a armar: el planeta de los casos y el cierre
const AXIS_Y = 1.9;    // centro de la M, del eclipse y del túnel
const RING_Z = -7;     // el eclipse: más atrás y más grande (el manifiesto vive dentro)
const RING_S = 1.55;   // radio del eclipse ≈ 3.57
const M_S = 1.3;       // la M, más grande (mínimo; buildPath la ajusta según la distancia de la cámara)
const TUNNEL_STEP = 6, TUNNEL_N = 5, TUNNEL_END = RING_Z - TUNNEL_STEP * TUNNEL_N;   // servicios vive dentro del último anillo
const RING_R = 2.304;                                   // radio del anillo a escala 1 (plano de 7.2, filo en r = .64)
const SUN_R = RING_R * RING_S, TUN_R = RING_R * RING_S * (1 + TUNNEL_N * 0.03);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// resolución adaptable: arranca moderada y se ajusta sola según lo que aguante el equipo
let DPR_MAX = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);   // se vuelve a leer al cambiar el zoom (resize)
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
// los textos se dibujan con su propia cámara: el mismo recorrido, sin vaivén, sin cursor y sin cambio de lente.
// Así quedan derechos, centrados y a 1:1 (nítidos), y el mundo conserva su movimiento detrás
const cssCam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 200);
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
sun.position.set(0, AXIS_Y, RING_Z);
sun.scale.setScalar(RING_S);
scene.add(sun);
const mirror = new THREE.Group();        // lo que se refleja en el piso
mirror.scale.y = -1;
scene.add(mirror);
const sunMirror = makeRing(0, 1, -1);
sunMirror.position.copy(sun.position);
sunMirror.scale.setScalar(RING_S);
sunMirror.renderOrder = -2;
mirror.add(sunMirror);
const tunnel = [];
for (let i = 1; i <= TUNNEL_N; i++) {       // túnel más ancho y más separado
  const r = makeRing(i * 0.13, 0.3);
  r.position.set(0, AXIS_Y, RING_Z - TUNNEL_STEP * i);
  r.scale.setScalar(RING_S * (1 + i * 0.03));   // cada anillo un poco mayor: desde el fondo se ven anidados
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
beam.position.set(0, 6.0, -0.2);
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

/* ---------- Polvo cósmico de fondo: diminuto, en todo el recorrido, reacciona al cursor ---------- */
const AMB = mobile ? 5000 : 14000;
const ambGeo = new THREE.BufferGeometry();
const ap = new Float32Array(AMB * 3), aseed = new Float32Array(AMB), atint = new Float32Array(AMB * 3);
const tints = [[0.78, 0.82, 1.0], [0.78, 0.82, 1.0], [0.78, 0.82, 1.0], [0.62, 0.35, 0.95], [0.3, 0.85, 0.95]];   // casi blanco, con toques de marca
for (let i = 0; i < AMB; i++) {
  const deep = Math.random() < 0.3;                             // una parte baja con la espiral de rubros hasta el cierre
  ap[i * 3] = (Math.random() - 0.5) * (deep ? 20 : Math.random() < 0.7 ? 16 : 28);   // más densas cerca del camino de la cámara
  ap[i * 3 + 1] = deep ? -15 + Math.random() * 17 : 0.3 + Math.random() * 7.2;
  ap[i * 3 + 2] = deep ? -22 - Math.random() * 34 : 9 - Math.random() * 62;          // del hero (z +9) al cierre (z -53)
  aseed[i] = Math.random();
  atint.set(tints[Math.floor(Math.random() * tints.length)], i * 3);
}
ambGeo.setAttribute("position", new THREE.BufferAttribute(ap, 3));
ambGeo.setAttribute("aSeed", new THREE.BufferAttribute(aseed, 1));
ambGeo.setAttribute("aTint", new THREE.BufferAttribute(atint, 3));
// clic = explosión invisible (ver BLAST_GLSL): la comparten las partículas de la M y el polvo de fondo
const BLAST = {
  uBlastO: { value: Array.from({ length: BLAST_N }, () => new THREE.Vector3()) },
  uBlastD: { value: Array.from({ length: BLAST_N }, () => new THREE.Vector3(0, 0, -1)) },
  uBlastT: { value: new Array(BLAST_N).fill(99) }, uBlastP: { value: new Array(BLAST_N).fill(99) }, uBlastK: { value: reduced ? 0 : 1 }
};
const blastRay = new THREE.Raycaster(), blastPt = new THREE.Vector2();
function fireBlast(x, y) {
  if (reduced) return;
  // la ranura más vieja; si hasta esa sigue visible (< 0.9 s), se ignora el clic: nunca se corta una onda en pantalla
  const T = BLAST.uBlastT.value;
  let s = 0;
  for (let i = 1; i < BLAST_N; i++) if (T[i] > T[s]) s = i;
  if (T[s] < 0.9) return;
  blastRay.setFromCamera(blastPt.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  BLAST.uBlastO.value[s].copy(blastRay.ray.origin);
  BLAST.uBlastD.value[s].copy(blastRay.ray.direction);
  T[s] = 0; BLAST.uBlastP.value[s] = -1;          // previo detrás del frente: el primer cuadro entrega el impulso completo
}
const AU = {
  uTime: { value: 0 }, uPx: { value: DPR }, uSpeed: { value: 0 },
  uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouse: { value: 0 },
  ...BLAST
};
const ambient = new THREE.Points(ambGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: AU,
  // suma color pero no toca el alfa: no altera la máscara (fotos de los casos y color exacto de la M)
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  vertexShader: `
    uniform float uTime, uPx, uSpeed, uMouse; uniform vec3 uRayO, uRayD;
    attribute float aSeed; attribute vec3 aTint; varying vec3 vC; varying float vA;
    ${BLAST_GLSL}
    void main(){
      vec3 p = position;
      // deriva lenta, cada una a su ritmo
      p += vec3(sin(uTime * (.11 + aSeed * .09) + aSeed * 40.), cos(uTime * (.09 + aSeed * .07) + aSeed * 23.), sin(uTime * (.07 + aSeed * .06) + aSeed * 61.)) * .45;
      // el cursor las aparta en remolino y las enciende
      vec3 w = p - uRayO; float tr = dot(w, uRayD);
      vec3 perp = w - uRayD * tr; float d = length(perp);
      float f = uMouse * smoothstep(1.7, 0., d) * step(0., tr);
      vec3 n = perp / max(d, 1e-3);
      p += n * f * .95 + cross(uRayD, n) * f * .7;
      float lit; p += mvBlastDisp(p, aSeed, lit);                // clic: la onda las aparta y regresan solas
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      float z = -mv.z;
      gl_PointSize = clamp((.8 + aSeed * 1.5) * uPx * (12. / max(z, .1)), 1., 5.5);
      float tw = .55 + .45 * sin(uTime * (.8 + aSeed * 1.7) + aSeed * 90.);
      vA = tw * smoothstep(.6, 2.5, z) * (1. - smoothstep(18., 34., z)) * (.55 + f * 2.6 + uSpeed * .5 + lit * .5);
      vC = aTint;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d);
      if (a * vA < .01) discard;
      gl_FragColor = vec4(vC * a * vA * .95, 1.); }`
}));
ambient.frustumCulled = false;
scene.add(ambient);

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
  setLoad(0.55);
  const data = new SVGLoader().parse(svgText);
  const box = new THREE.Box3(), geos = [];
  const shapes = data.paths.map((path) => SVGLoader.createShapes(path));
  data.paths.forEach((path, i) => {
    const geo = new THREE.ExtrudeGeometry(shapes[i], {
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
  // como en el logo plano, la lágrima morada tapa el brazo derecho del chevrón: ahí no hay partículas azules
  const tear = shapes[1] && shapes[1][0] ? shapes[1][0].getPoints(96) : null;
  const exclude = tear ? [{ geo: 0, poly: tear, margin: 8 }] : [];
  particles = createParticles({ renderer, geos, holderMatrix: holder.matrix, mobile, reduced, exclude, blast: BLAST });
  setLoad(0.85);
  particles.px = DPR * (mobile ? 0.8 : 1);
  particles.points.renderOrder = 1;
  particles.reflection.renderOrder = -2;            // debajo del piso: el piso la vela
  scene.add(particles.points);
  scene.add(particles.reflection);                  // la reflexión se voltea en su propio shader
  geos.forEach((g) => g.dispose());
  try {   // precompila todo (fichas incluidas) contra el búfer del composer
    cards.forEach((m) => { m.visible = true; });
    renderer.setRenderTarget(composer.readBuffer);
    renderer.compile(scene, camera);
  } catch (e) {} finally {
    renderer.setRenderTarget(null);
    cards.forEach((m) => { m.visible = false; });
  }
}

const raycaster = new THREE.Raycaster();
/* ---------- Casos: espiral de rubros que baja ----------
   Cada rubro es una ficha en una espiral: un gesto baja una estación y la espiral gira 60°.
   Las partículas son la cinta de la espiral; al final se sueltan y arman la M abajo (el cierre).
   Al elegir un rubro, la espiral se corre a la izquierda y sus proyectos (subfichas) salen de la
   ficha hacia el espacio libre de la derecha; cada subficha abre la ficha del caso. */
const CARD_AR = 1.55, TAU = Math.PI * 2;
// el contenido vive en el HTML (sirve sin 3D y para lectores de pantalla); aquí sólo se lee
const RUBROS = [...document.querySelectorAll("[data-rubro]")].map((el) => ({
  id: el.dataset.rubro,
  name: el.querySelector(".rubro__name").textContent.trim(),
  full: el.querySelector(".rubro__full").textContent.trim(),
  projects: [...el.querySelectorAll(".proj")].map((li) => ({
    name: li.querySelector(".proj__name").textContent.trim(),
    logo: li.dataset.logo || "",
    img: li.querySelector(".proj__img")?.getAttribute("src") || "", alt: li.querySelector(".proj__img")?.getAttribute("alt") || "",
    url: li.querySelector(".proj__url")?.getAttribute("href") || "",
    sector: li.querySelector(".proj__sector")?.textContent.trim() || "",
    chip: li.querySelector(".proj__chip")?.textContent.trim() || "",
    desc: li.querySelector(".proj__desc")?.textContent.trim() || ""
  }))
}));
const NR = RUBROS.length;
// estaciones de cámara: 0 inicio · 1 manifiesto · 2 servicios · Q0.. un rubro cada una · QLAST contacto
const Q0 = 3, QLAST = Q0 + NR;
// la "escena" que ven los efectos (0..4): dentro de la espiral siempre es 3
const sceneP = (q) => (q <= Q0 ? q : q <= Q0 + NR - 1 ? Q0 : Q0 + (q - (Q0 + NR - 1)));
const stationOf = (s) => (s < Q0 ? s : s === Q0 ? Q0 : QLAST);
// geometría de la espiral (buildPath la ajusta a la pantalla)
const SPI = { R: 3, drop: 2, cardW: 2.3, yTop: AXIS_Y, yM: AXIS_Y - 12.5, camD: 8.7, stepA: TAU / 6 };
// giro de la espiral: llega girando desde servicios, cada estación gira 60° y sigue girando hacia el cierre
const spinAt = (q) => (q < Q0 ? (Q0 - q) * 1.4 : -(q - Q0) * SPI.stepA);
const pad2 = (n) => String(n).padStart(2, "0");

const cardGeo = new THREE.PlaneGeometry(1, 1);
const cards = RUBROS.map((r, i) => {
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
  m.userData = { i, u, hover: 0, ready: false, canvas: null };
  m.visible = false;
  scene.add(m);
  return m;
});

// SVG → imagen con tamaño propio (Firefox no dibuja en canvas un SVG sin width/height)
const svgCache = new Map();
function loadSvg(url) {
  if (!svgCache.has(url)) svgCache.set(url, fetch(url).then((r) => (r.ok ? r.text() : Promise.reject())).then((txt) => {
    const vb = /viewBox="([^"]+)"/.exec(txt);
    if (vb && !/<svg[^>]*\swidth=/.test(txt)) {
      const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
      if (w > 0 && h > 0) txt = txt.replace("<svg", `<svg width="${w}" height="${h}"`);
    }
    const src = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }).catch(() => null));
  return svgCache.get(url);
}
// los logos publicados son tinta negra: para la ficha oscura se tiñen de blanco (una vez por logo)
const whiteCache = new WeakMap();
function whiteOf(im) {
  if (!whiteCache.has(im)) {
    const s = Math.min(1, 360 / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    whiteCache.set(im, c);
  }
  return whiteCache.get(im);
}
// la ficha de un rubro: vidrio oscuro, número, nombre grande, subrayado de marca y la fila de logos de sus proyectos
const TEX_W = 1024, TEX_H = Math.round(TEX_W / CARD_AR);
function drawRubroCard(c, j, logos) {
  const r = RUBROS[j], g = c.getContext("2d");
  g.clearRect(0, 0, TEX_W, TEX_H);
  const bg = g.createLinearGradient(0, 0, TEX_W, TEX_H);
  bg.addColorStop(0, "#17132b"); bg.addColorStop(0.55, "#0c0a16"); bg.addColorStop(1, "#07070b");
  g.fillStyle = bg; g.fillRect(0, 0, TEX_W, TEX_H);
  const glow = g.createRadialGradient(TEX_W * 0.95, 0, 0, TEX_W * 0.95, 0, TEX_W * 0.8);
  glow.addColorStop(0, "rgba(98,92,217,.45)"); glow.addColorStop(1, "rgba(98,92,217,0)");
  g.fillStyle = glow; g.fillRect(0, 0, TEX_W, TEX_H);
  const pad = 72;
  g.textBaseline = "alphabetic";
  g.fillStyle = "rgba(255,255,255,.5)"; g.font = '500 26px "JetBrains Mono", monospace';
  g.fillText(`${pad2(j + 1)} / ${pad2(NR)}  ·  RUBRO`, pad, pad + 22);
  g.textAlign = "right"; g.fillText("→", TEX_W - pad, pad + 22); g.textAlign = "left";
  const lines = r.name.split(" / ").map((s, k, a) => (k < a.length - 1 ? s + " /" : s));
  let size = 128;
  const setFont = () => { g.font = `700 ${size}px Montserrat, sans-serif`; };
  setFont();
  const maxW = TEX_W - pad * 2;
  while (Math.max(...lines.map((l) => g.measureText(l).width)) > maxW && size > 56) { size -= 4; setFont(); }
  if ("letterSpacing" in g) g.letterSpacing = `${-size * 0.04}px`;
  g.fillStyle = "#fff";
  let y = pad + 44 + size * 0.8;
  lines.forEach((l, k) => { g.fillText(l, pad - size * 0.03, y); if (k < lines.length - 1) y += size * 0.96; });
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  const gr = g.createLinearGradient(pad, 0, pad + 260, 0);
  gr.addColorStop(0, "#9E43B8"); gr.addColorStop(0.3, "#625CD9"); gr.addColorStop(0.65, "#4892D9"); gr.addColorStop(1, "#2BCCD9");
  g.fillStyle = gr; g.fillRect(pad, y + 34, 260, 6);
  g.fillStyle = "rgba(255,255,255,.66)"; g.font = '500 28px "JetBrains Mono", monospace';
  g.fillText(r.full, pad, y + 94);
  // logos de sus proyectos, en fila abajo (blancos, un poco atenuados)
  const row = logos.filter(Boolean).slice(0, 5).map(whiteOf), slots = 5;
  const boxW = (TEX_W - pad * 2) / slots, boxH = 78, by = TEX_H - pad - boxH;
  g.globalAlpha = 0.88;
  row.forEach((im, k) => {
    const s = Math.min((boxW - 30) / im.width, boxH / im.height), w = im.width * s, h = im.height * s;
    g.drawImage(im, pad + k * boxW + (boxW - 30 - w) / 2, by + (boxH - h) / 2, w, h);
  });
  g.globalAlpha = 1;
  const extra = r.projects.length - row.length;
  if (extra > 0 && row.length) {
    g.fillStyle = "rgba(255,255,255,.55)"; g.font = '500 26px "JetBrains Mono", monospace';
    g.fillText(`+${extra}`, pad + row.length * boxW + 4, by + boxH / 2 + 9);
  }
}
let rubroTexAsked = false;
async function loadRubroTextures() {
  if (rubroTexAsked) return; rubroTexAsked = true;
  try { await Promise.all([document.fonts.load("700 120px Montserrat"), document.fonts.load('500 26px "JetBrains Mono"')]); } catch (e) {}
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  for (const [j, m] of cards.entries()) {            // una ficha por cuadro: sin tirones
    const ud = m.userData;
    ud.canvas = document.createElement("canvas"); ud.canvas.width = TEX_W; ud.canvas.height = TEX_H;
    const tx = new THREE.CanvasTexture(ud.canvas);
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    const paint = (logos) => { drawRubroCard(ud.canvas, j, logos); tx.needsUpdate = true; renderer.initTexture(tx); };   // se sube ya, no a medio vuelo
    paint([]);                                       // el nombre ya se ve; los logos llegan después
    ud.u.uMap.value = tx; ud.ready = true;
    Promise.all(RUBROS[j].projects.map((pr) => (pr.logo ? loadSvg(pr.logo) : null))).then(async (logos) => { await nextFrame(); paint(logos); });
    await nextFrame();
  }
}
setTimeout(loadRubroTextures, 4600);                 // después de la intro (antes si ya vas camino a casos)

/* pie de la espiral: el rubro al frente, flechas y "ver proyectos" */
const capMeta = document.querySelector("[data-cap-meta]"), capName = document.querySelector("[data-cap-name]");
const capOpen = document.querySelector("[data-cap-open]"), capLive = document.querySelector("[data-cap-live]");
const capPrev = document.querySelector("[data-case-prev]"), capNext = document.querySelector("[data-case-next]");
const hoverCapable = matchMedia("(hover: hover)").matches;
let capShown = -1;
function showRubro(j) {
  if (j === capShown) return;
  capShown = j;
  const r = RUBROS[j];
  if (capMeta) capMeta.textContent = `${pad2(j + 1)} / ${pad2(NR)} · Rubro`;
  if (capName) capName.textContent = r.name;
  if (capOpen) {
    capOpen.textContent = `Ver ${r.projects.length} proyectos →`;
    capOpen.setAttribute("aria-label", `Ver los ${r.projects.length} proyectos de ${r.name}`);
  }
  capPrev?.setAttribute("aria-label", j === 0 ? "Volver a servicios" : "Rubro anterior");
  capNext?.setAttribute("aria-label", j === NR - 1 ? "Ir al contacto" : "Rubro siguiente");
  if (capLive && active === 3) capLive.textContent = `${r.name}. ${r.projects.length} proyectos.`;
}
const stationRubro = () => clamp(Math.round(prog - Q0), 0, NR - 1);
const settledRubro = () => (prog === to && to >= Q0 && to <= Q0 + NR - 1 ? to - Q0 : -1);   // -1 = en camino: no se abre nada
capPrev?.addEventListener("click", () => step(-1));
capNext?.addEventListener("click", () => step(1));
capOpen?.addEventListener("click", () => { const j = settledRubro(); if (j >= 0) openRubro(j, capOpen); });

/* ---------- Panel de un rubro: subfichas (logo + nombre) y la ficha del caso ---------- */
const rpEl = document.querySelector("[data-rpanel]");
const rp = { open: -1, detail: -1, opener: null, tile: null, closeTimer: 0 };
let rpView = 0;                                    // 0 = espiral al centro · 1 = corrida para dejar espacio al panel
const EASE = "cubic-bezier(.16,1,.3,1)";
const WA_URL = "https://wa.me/5214427146255?text=";
const tmpV = new THREE.Vector3();
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
// corrimiento de la vista (sin cambiar la perspectiva). En vertical la ficha se centra en la franja libre
// entre el HUD (~60 px) y la hoja (que empieza en 0.4H)
function setView(v) {
  if (v > 0.0005) {
    const W = innerWidth, H = innerHeight;
    if (portrait) camera.setViewOffset(W, H, 0, v * Math.max(0, 0.3 * H - 30), W, H);
    else camera.setViewOffset(W, H, v * W * 0.23, 0, W, H);
  } else if (camera.view && camera.view.enabled) camera.clearViewOffset();
}
// dónde está la ficha j en pantalla (de ahí salen y ahí regresan las subfichas).
// `view`: medir con la vista ya corrida (1) o centrada (0), que es donde estará cuando lleguen
function cardRect(j, view = rpView) {
  const m = cards[j];
  if (!m || !m.visible) return null;
  setView(view);
  m.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    tmpV.set(x, y, 0).applyMatrix4(m.matrixWorld).project(camera);
    const sx = (tmpV.x + 1) / 2 * innerWidth, sy = (1 - tmpV.y) / 2 * innerHeight;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  setView(rpView);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function flipKeys(elm, rect, tilt) {
  const b = elm.getBoundingClientRect();
  if (!rect || !b.width) return null;
  const dx = rect.x + rect.w / 2 - (b.left + b.width / 2), dy = rect.y + rect.h / 2 - (b.top + b.height / 2);
  const s = Math.max(0.06, Math.min(rect.w / b.width, rect.h / b.height));
  return `translate(${dx}px, ${dy}px) scale(${s})${tilt ? " perspective(900px) rotateY(-32deg)" : ""}`;
}
// sale del rectángulo `rect` hasta su lugar
function flipIn(elm, rect, { delay = 0, dur = 820, tilt = false } = {}) {
  const from = flipKeys(elm, rect, tilt);
  if (!from) return elm.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay, fill: "backwards" });
  return elm.animate([{ transform: from, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: dur, delay, easing: EASE, fill: "backwards" });
}
// regresa a `rect` y se desvanece
function flipOut(elm, rect, { delay = 0, dur = 460 } = {}) {
  const to = flipKeys(elm, rect, false);
  if (!to) return elm.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, delay, fill: "forwards" });
  return elm.animate([{ transform: "none", opacity: 1 }, { transform: to, opacity: 0 }], { duration: dur, delay, easing: "cubic-bezier(.55,0,.75,.2)", fill: "forwards" });
}
// capa de vuelo: las subfichas viajan como clones fuera del panel (su scroll las recortaría)
const flyLayer = mk("div", "rp-fly");
flyLayer.setAttribute("aria-hidden", "true");
document.body.append(flyLayer);
function fly(el, from, to, { delay = 0, dur = 850, out = false, tilt = false } = {}) {
  const b = el.getBoundingClientRect();
  if (!from || !to || !b.width) return null;
  const c = el.cloneNode(true);
  c.removeAttribute("id"); c.tabIndex = -1;
  Object.assign(c.style, { position: "fixed", left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, margin: "0" });
  flyLayer.append(c);
  el.style.visibility = "hidden";
  const k = (r) => {
    const dx = r.x + r.w / 2 - (b.left + b.width / 2), dy = r.y + r.h / 2 - (b.top + b.height / 2);
    const s = Math.max(0.06, Math.min(r.w / b.width, r.h / b.height));
    return `translate(${dx}px, ${dy}px) scale(${s})${tilt ? " perspective(900px) rotateY(-32deg)" : ""}`;
  };
  const frames = out ? [{ transform: "none", opacity: 1 }, { transform: k(to), opacity: 0 }] : [{ transform: k(from), opacity: 0 }, { transform: "none", opacity: 1 }];
  const a = c.animate(frames, { duration: dur, delay, easing: out ? "cubic-bezier(.55,0,.75,.2)" : EASE, fill: "both" });
  const end = () => { c.remove(); if (!out) el.style.visibility = ""; };
  a.onfinish = end; a.oncancel = end;
  return a;
}
function buildPanel(j) {
  const r = RUBROS[j];
  rpEl.textContent = "";
  const head = mk("header", "rpanel__head");
  const close = mk("button", "rpanel__close mono", "← Espiral");
  close.type = "button"; close.setAttribute("aria-label", "Cerrar y volver a la espiral de rubros");
  close.addEventListener("click", () => closeRubro());
  const title = mk("h3", "rpanel__title", r.name); title.id = "rpanel-title"; title.tabIndex = -1;
  head.append(close, mk("p", "kicker mono", `Rubro ${pad2(j + 1)} / ${pad2(NR)}`), title, mk("p", "rpanel__sub mono", r.full));
  const grid = mk("ul", "rpanel__grid");
  r.projects.forEach((pr, k) => {
    const li = mk("li"), b = mk("button", "sub");
    b.type = "button"; b.setAttribute("aria-label", `${pr.name}: ver el caso`);
    const box = mk("span", "sub__logo");
    if (pr.logo) { const im = mk("img"); im.src = pr.logo; im.alt = ""; im.decoding = "async"; box.append(im); }
    else box.append(mk("span", "sub__word", pr.name));
    b.append(box, mk("span", "sub__name", pr.name), mk("span", "sub__meta mono", "Ver caso →"));
    b.addEventListener("click", () => openDetail(k, b));
    li.append(b); grid.append(li);
  });
  const det = mk("article", "rpanel__detail");
  det.hidden = true; det.setAttribute("aria-labelledby", "rpanel-det-name");
  rpEl.append(head, grid, det);
}
function openRubro(j, opener) {
  if (j < 0 || j >= NR || rp.open === j) return;
  clearTimeout(rp.closeTimer);
  rp.open = j; rp.detail = -1; rp.tile = null;
  rp.opener = opener || null;
  buildPanel(j);
  rpEl.classList.remove("has-detail", "is-closing");
  rpEl.classList.add("is-open");
  document.body.classList.add("rp-open");
  rpEl.inert = false; rpEl.setAttribute("aria-hidden", "false");
  if (waFloat) waFloat.inert = true;                   // oculto con el panel: tampoco se tabula
  rpEl.scrollTop = 0;
  rp.openedAt = performance.now();                    // el clic sintético de un toque no debe abrir un caso
  if (!reduced) {
    const from = cardRect(j, 1);                     // donde queda la ficha con la vista ya corrida
    rpEl.querySelector(".rpanel__head").animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
      { duration: 700, delay: 160, easing: EASE, fill: "backwards" });
    rpEl.querySelectorAll(".sub").forEach((b, k) => {
      const r = b.getBoundingClientRect();
      fly(b, from, { x: r.left, y: r.top, w: r.width, h: r.height }, { delay: 80 + k * 50, dur: 900, tilt: true });
    });
  }
  rpEl.querySelector("#rpanel-title")?.focus({ preventScroll: true });
  if (capLive) capLive.textContent = `${RUBROS[j].name}: ${RUBROS[j].projects.length} proyectos.`;
}
function closeRubro(instant = false) {
  if (rp.open < 0) return;
  const j = rp.open;
  rp.open = -1; rp.detail = -1; rp.tile = null;
  document.body.classList.remove("rp-open");
  if (waFloat) waFloat.inert = active === LAST || (active === 3 && narrowMQ.matches);
  const hadFocus = rpEl.contains(document.activeElement);
  const done = () => {
    if (rp.open >= 0) return;                        // ya se abrió otro rubro
    rpEl.classList.remove("is-open", "has-detail", "is-closing");
    rpEl.setAttribute("aria-hidden", "true");
    rpEl.textContent = "";
  };
  rpEl.inert = true;                                 // lo que se desvanece ya no se tabula ni se lee
  if (instant || reduced) done();
  else {
    const to = cardRect(j, 0), subs = [...rpEl.querySelectorAll(".sub")];   // la ficha regresa al centro
    rpEl.classList.add("is-closing");
    rpEl.querySelectorAll(".rpanel__head, .rpanel__detail:not([hidden])").forEach((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" }));
    subs.forEach((b, k) => {
      const r = b.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) { b.style.visibility = "hidden"; return; }   // fuera de vista: no vuelan
      fly(b, { x: r.left, y: r.top, w: r.width, h: r.height }, to, { delay: k * 22, dur: 460, out: true });
    });
    rp.closeTimer = setTimeout(done, 480 + subs.length * 22);
  }
  // el foco regresa al pie de la espiral: se libera ya (el loop lo tenía inert mientras el panel estaba abierto)
  const o = rp.opener && rp.opener.isConnected ? rp.opener : capOpen;
  rp.opener = null;
  if (hadFocus && o) { sections[3].inert = false; labels[3].visible = true; sections[3].style.display = ""; o.focus({ preventScroll: true }); }
}
function openDetail(k, tile) {
  const r = RUBROS[rp.open], pr = r && r.projects[k];
  if (!pr || performance.now() - (rp.openedAt || 0) < 400) return;   // (clic sintético de un toque que abrió el rubro)
  const tb = tile.getBoundingClientRect();           // antes de ocultar la rejilla y de mover el scroll
  rp.scroll = rpEl.scrollTop;
  rp.detail = k; rp.tile = tile;
  const det = rpEl.querySelector(".rpanel__detail");
  det.getAnimations().forEach((a) => a.cancel());    // la salida anterior (fill forwards) no debe seguir aplicada
  det.textContent = "";
  const back = mk("button", "rpanel__back mono", `← ${r.name}`);
  back.type = "button"; back.setAttribute("aria-label", `Volver a los proyectos de ${r.name}`);
  back.addEventListener("click", closeDetail);
  const media = mk("div", "det__media" + (pr.img ? "" : " det__media--logo"));
  if (pr.img) { const im = mk("img"); im.src = pr.img; im.alt = pr.alt || pr.name; im.decoding = "async"; media.append(im); }
  else if (pr.logo) { const im = mk("img"); im.src = pr.logo; im.alt = `Logotipo de ${pr.name}`; media.append(im); }
  else media.append(mk("span", "sub__word", pr.name));
  const body = mk("div", "det__body");
  const name = mk("h4", "det__name", pr.name); name.id = "rpanel-det-name"; name.tabIndex = -1;
  const desc = mk("p", "det__desc", pr.desc || "Muy pronto: fotos, proceso y resultados de este proyecto.");
  if (!pr.desc) desc.classList.add("is-soon");
  const ctas = mk("div", "det__ctas");
  const wa = mk("a", "pill pill--light", "Quiero algo así →");
  wa.href = WA_URL + encodeURIComponent(`Hola MV Design, vi el caso de ${pr.name} y quiero cotizar algo así. [web · lab]`);
  wa.target = "_blank"; wa.rel = "noopener";
  ctas.append(wa);
  if (pr.url) { const a = mk("a", "pill pill--ghost", "Ver sitio ↗"); a.href = pr.url; a.target = "_blank"; a.rel = "noopener"; ctas.append(a); }
  body.append(mk("p", "det__meta mono", [pr.sector || r.name, pr.chip].filter(Boolean).join(" · ")), name, desc, ctas);
  det.append(back, media, body);
  det.hidden = false;
  rpEl.classList.add("has-detail");
  rpEl.querySelectorAll(".rpanel__head, .rpanel__grid").forEach((e) => { e.inert = true; });
  clearTimeout(rp.hideTimer);
  rp.hideTimer = setTimeout(() => { if (rp.detail >= 0) rpEl.querySelectorAll(".rpanel__head, .rpanel__grid").forEach((e) => { e.style.display = "none"; }); }, reduced ? 0 : 360);
  rpEl.scrollTop = 0;
  if (!reduced) flipIn(det, { x: tb.left, y: tb.top, w: tb.width, h: tb.height }, { dur: 760 });
  name.focus({ preventScroll: true });
}
function closeDetail() {
  const det = rpEl.querySelector(".rpanel__detail"), tile = rp.tile;
  if (!det || rp.detail < 0) return;
  rp.detail = -1; rp.tile = null;
  clearTimeout(rp.hideTimer);
  rpEl.querySelectorAll(".rpanel__head, .rpanel__grid").forEach((e) => { e.inert = false; e.style.display = ""; });
  rpEl.classList.remove("has-detail");
  rpEl.scrollTop = rp.scroll || 0;                   // la lista vuelve a donde estaba
  const finish = () => { det.getAnimations().forEach((a) => a.cancel()); if (rp.detail < 0) { det.hidden = true; det.textContent = ""; } };
  if (!reduced && tile && tile.isConnected) {
    const b = tile.getBoundingClientRect();
    rpEl.querySelector(".rpanel__grid")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease-out" });
    flipOut(det, { x: b.left, y: b.top, w: b.width, h: b.height }, { dur: 420 }).onfinish = finish;
  } else finish();
  if (tile && tile.isConnected) tile.focus({ preventScroll: true });
}

// tocar / hacer clic en una ficha de rubro: si es la del frente, abre sus proyectos; si no, la espiral viaja a ella.
// En cualquier escena, un clic o toque fuera de botones y fichas suelta la explosión invisible.
let downX = 0, downY = 0, downT = 0;
const onUI = (e) => !!(e.target.closest && e.target.closest("button, a, input, .orbit-cap, .hud, .wa, [data-rpanel]"));
const cardAt = (x, y) => {
  if (active !== 3) return null;
  raycaster.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  return raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0] || null;
};
addEventListener("pointerdown", (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
  if (e.pointerType === "mouse" && e.button === 0 && !onUI(e) && !cardAt(e.clientX, e.clientY)) fireBlast(e.clientX, e.clientY);
}, { passive: true });
addEventListener("pointerup", (e) => {
  if (onUI(e) || e.button !== 0) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10 || performance.now() - downT > 450) return;
  const hit = cardAt(e.clientX, e.clientY);
  if (e.pointerType !== "mouse" && !hit) fireBlast(e.clientX, e.clientY);
  if (hit) {
    const j = hit.object.userData.i;
    if (rp.open === j) closeRubro();
    else if (rp.open >= 0) { closeRubro(); goQ(Q0 + j); }
    else if (j === settledRubro()) openRubro(j);
    else goQ(Q0 + j);
  } else if (rp.open >= 0) closeRubro();             // clic en el espacio: de vuelta a la espiral
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
      vec3 c = mix(t.rgb, aces(t.rgb), smoothstep(.5, 1., t.a));
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
  el.style.pointerEvents = "";                                         // sólo botones y enlaces reciben clics
  cssScene.add(o); return o;
});

/* ---------- Recorrido de cámara: un punto clave por escena ---------- */
let portrait = false, BASE_FOV = 28;
let posCurve, lookCurve, FOCUS = [];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KEYS = { pos: [], look: [] };
// ancla de cada texto: distancia frente a la cámara de su escena y desplazamiento vertical (fracción de pantalla)
// (manifiesto y servicios se anclan en el plano de su anillo: ver buildPath)
// (en las de anillo, oy es fracción del diámetro del anillo: servicios sube un poco porque su base es más ancha)
const TEXT_DESK = [{ d: 11, oy: 0.28 }, { oy: 0 }, { oy: -0.04 }, { d: 9.5, oy: 0 }, { d: 13.5, oy: 0.27 }];
const TEXT_PORT = [{ d: 14, oy: 0.17 }, { oy: 0 }, { oy: 0 }, { d: 9.5, oy: 0 }, { d: 17.5, oy: 0.25 }];
// qué tanto del lado corto de la pantalla ocupa el anillo cuando llegas a su escena
const RING_FILL = { land: 0.84, port: 0.96 };
const mLook = new THREE.Matrix4(), qTmp = new THREE.Quaternion();
// escala de la M y ventana lejana de los anillos: dependen del encuadre (buildPath)
let mScale = M_S, FAR_SUN = 20, FAR_TUN = 20, mouseRef = 12;
function buildPath() {
  const E = END_Z;
  const tanH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const H = innerHeight, narrow = innerWidth <= 720;
  // distancia a la que un anillo de radio R ocupa `fill` del lado corto de la pantalla
  const fill = portrait ? RING_FILL.port : RING_FILL.land;
  const view = (R) => R / (fill * tanH * Math.min(1, innerWidth / innerHeight));
  const dSun = view(SUN_R), dTun = view(TUN_R);
  const k1 = RING_Z + dSun;                        // manifiesto: frente al eclipse
  const k0 = k1 + (portrait ? 3.5 : 5);            // el inicio, más atrás: el viaje al manifiesto se siente
  // la M crece con la distancia: se ve ~12 % más grande que antes (cámara a 12 / 13.5) sin tocar el piso
  mScale = clamp(1.12 * k0 / (portrait ? 13.5 : 12), M_S, portrait ? 1.5 : 1.45);
  mouseRef = portrait ? 13.5 : 12;
  FAR_SUN = k0 - RING_Z + 8;                       // el eclipse nunca se apaga por lejanía en su encuadre (ni en el dolly de entrada)
  FAR_TUN = Math.max(20, dTun + 2);
  // espiral de rubros: la ficha del frente ocupa ~1/3 del alto (horizontal) o ~3/4 del ancho (vertical)
  const aspect = innerWidth / innerHeight;
  SPI.R = portrait ? 1.9 : 3.0;
  SPI.drop = portrait ? 2.3 : 2.0;
  SPI.cardW = portrait ? 1.9 : 2.3;
  SPI.yTop = AXIS_Y;
  SPI.yM = SPI.yTop - (NR - 1) * SPI.drop - (portrait ? 2.8 : 2.5);    // la M del cierre, al pie de la espiral
  const cardH = SPI.cardW / CARD_AR;
  // la ficha del frente vive en la franja libre entre el título de casos y su pie (medidos en px):
  // cabe en ella (con aire) y se centra ahí, en cualquier pantalla
  const el3 = sections[3], prev3 = el3.style.display;
  el3.style.display = "";
  const hh = el3.querySelector(".cases-head").offsetHeight, ch = el3.querySelector(".orbit-cap").offsetHeight, lh = el3.offsetHeight;
  el3.style.display = prev3;
  const top3 = (narrow ? 112 : 96) + SAFE_T, bot3 = (narrow ? 24 : 40) + SAFE_B, half3 = lh / 2;
  const cy3 = clamp(H / 2, top3 + half3, Math.max(top3 + half3, H - bot3 - half3));   // (igual que el ancla de su texto)
  const bandTop = cy3 - half3 + hh + 16, bandBot = cy3 + half3 - ch - 16;
  const bandH = Math.max(70, bandBot - bandTop), bandC = (bandTop + bandBot) / 2;
  SPI.camD = Math.max(
    SPI.cardW / ((portrait ? 0.78 : 0.46) * 2 * tanH * aspect),     // ancho
    cardH * H / (bandH * 2 * tanH),                                 // cabe en la franja
    portrait ? 0 : cardH / (0.34 * 2 * tanH)                        // en horizontal, no más de ~1/3 del alto
  );
  // altura de cámara para que el centro de la ficha caiga en el centro de la franja (una corrección lineal basta)
  const probe = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 200), pv = new THREE.Vector3();
  const pitch = 1.6;                                                // mira un poco hacia abajo: se ve la espiral que sigue
  const cardY = (lift) => {
    probe.position.set(0, SPI.yTop + lift, END_Z + SPI.R + SPI.camD);
    probe.lookAt(0, SPI.yTop + lift - pitch, END_Z);
    probe.updateMatrixWorld();
    pv.set(0, SPI.yTop, END_Z + SPI.R).project(probe);
    return (1 - pv.y) / 2 * H;
  };
  const d0 = cardY(1.1);
  const camLift = 1.1 + (bandC - d0) * (2 * SPI.camD * tanH) / H;
  floorEnd.position.y = SPI.yM - AXIS_Y;                                 // el piso del cierre, bajo la M
  const yM = SPI.yM;
  // estaciones: inicio, manifiesto, servicios, un rubro cada una (bajando), contacto
  KEYS.pos = [V(0, portrait ? 2.3 : 2.2, k0), V(0, AXIS_Y, k1), V(0, AXIS_Y, TUNNEL_END + dTun)];
  KEYS.look = [V(0, portrait ? 0.75 : 1.15, 0), V(0, AXIS_Y, RING_Z), V(0, AXIS_Y, TUNNEL_END)];
  FOCUS = [k0, dSun, dTun];
  for (let j = 0; j < NR; j++) {
    const y = SPI.yTop - j * SPI.drop;
    KEYS.pos.push(V(0, y + camLift, E + SPI.R + SPI.camD));
    KEYS.look.push(V(0, y + camLift - pitch, E));
    FOCUS.push(SPI.camD);
  }
  if (portrait) { KEYS.pos.push(V(0, yM + 0.6, E + 20.5)); KEYS.look.push(V(0, yM - 1.55, E)); FOCUS.push(20.5); }
  else { KEYS.pos.push(V(0, yM + 0.4, E + 16.5)); KEYS.look.push(V(0, yM - 0.95, E)); FOCUS.push(16.5); }
  posCurve = new THREE.CatmullRomCurve3(KEYS.pos, false, "centripetal");
  lookCurve = new THREE.CatmullRomCurve3(KEYS.look, false, "centripetal");
  // cada texto queda de frente a la cámara de su escena, a 1:1 (nítido) cuando llegas.
  // Manifiesto y servicios viven en el plano de su anillo y su tipografía se mide con él (--ring):
  // el texto queda dentro del círculo con cualquier zoom del navegador y en cualquier pantalla.
  const T = portrait ? TEXT_PORT : TEXT_DESK;
  const RING_AT = { 1: [SUN_R, dSun], 2: [TUN_R, dTun] };
  labels.forEach((o, i) => {
    const ring = RING_AT[i];
    let ringD = 0;
    const d = ring ? ring[1] : T[i].d, oy = T[i].oy;
    const k = stationOf(i);                          // la estación de cámara de su escena (casos: el primer rubro)
    mLook.lookAt(KEYS.pos[k], KEYS.look[k], THREE.Object3D.DEFAULT_UP);
    qTmp.setFromRotationMatrix(mLook);
    const s = (2 * d * tanH) / H;                   // unidades de mundo por píxel CSS a esa distancia
    const el = sections[i];
    if (ring) {
      const D = ringD = (2 * ring[0]) / s;          // diámetro del anillo en px
      el.style.setProperty("--ring", D.toFixed(1) + "px");
      el.style.setProperty("--ring-oy", (-oy * D).toFixed(1) + "px");   // el disco oscuro se queda en el centro del anillo
      el.classList.toggle("is-compact", portrait || D < 600);   // anillo chico: sólo lo esencial (la letra secundaria no baja de ~10 px)
    }
    // mide el bloque (el renderer oculta con display:none las escenas lejanas)
    const prevD = el.style.display;
    el.style.display = "";
    const h = el.offsetHeight;
    el.style.display = prevD;
    const top = (narrow ? (i === 3 ? 112 : 76) : 96) + SAFE_T, bottom = (narrow ? (i === LAST || i === 3 ? 24 : 96) : 40) + SAFE_B;
    // con anillo: centrado exacto y sin achicar (su tamaño ya sale del anillo), así texto, disco y anillo son concéntricos
    const fit = ring ? 1 : h > 0 ? Math.min(1, (H - top - bottom) / h) : 1;   // si no cabe, se achica un poco
    const half = (h * fit) / 2;
    const cy = ring ? H / 2 + oy * ringD : clamp(H / 2 + oy * H, top + half, Math.max(top + half, H - bottom - half));
    o.position.set(0, -(cy - H / 2) * s, -d).applyQuaternion(qTmp).add(KEYS.pos[k]);
    o.userData.base = o.position.clone();            // casos: el texto baja con la cámara de rubro en rubro
    o.quaternion.copy(qTmp);
    o.scale.setScalar(s * fit);
    o.userData.d = d;
  });
}

// zonas seguras (muesca, barra de inicio): CSS las conoce con env(); JS las lee de una sonda
const saProbe = Object.assign(document.createElement("div"), { ariaHidden: "true" });
saProbe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
document.body.append(saProbe);
let SAFE_T = 0, SAFE_B = 0;
function resize() {
  const w = innerWidth, h = innerHeight;
  const ps = getComputedStyle(saProbe);
  SAFE_T = parseFloat(ps.paddingTop) || 0; SAFE_B = parseFloat(ps.paddingBottom) || 0;
  portrait = w / h < 0.8;
  // el zoom del navegador cambia devicePixelRatio: sin esto, al alejar el búfer crece al cuádruple
  const dprNow = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  if (dprNow !== DPR_MAX) { DPR_MAX = dprNow; if (DPR > DPR_MAX) applyDpr(DPR_MAX); }
  camera.aspect = w / h;
  BASE_FOV = portrait ? 40 : 28;
  camera.fov = BASE_FOV; camera.updateProjectionMatrix();
  cssCam.aspect = w / h; cssCam.fov = BASE_FOV; cssCam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  css.setSize(w, h);
  document.documentElement.style.setProperty("--h", h + "px");   // tipografía proporcional al mundo 3D
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
  AU.uPx.value = v;
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

/* ---------- Navegación: un gesto = una estación (escena o rubro), y cada transición llega y se asienta ---------- */
let from = 0, to = 0, tStart = 0, dur = 0, prog = 0, lockUntil = 0, v0 = 0, progVel = 0;
const now = () => performance.now();
// curva del viaje: cubic-bezier(.45, 0, .1, 1). El gesto se nota desde el primer cuadro
// (al 25 % del tiempo ya va ~23 % del tramo) y la llegada frena largo y se asienta. Tabla de 65 muestras
const EASE_T = (() => {
  const B = (s, a, b) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  const out = new Float32Array(65);
  for (let i = 0; i <= 64; i++) {
    const x = i / 64; let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (B(m, 0.45, 0.1) < x) lo = m; else hi = m; }
    out[i] = B((lo + hi) / 2, 0, 1);
  }
  return out;
})();
const easeTab = (x) => { const f = clamp(x, 0, 1) * 64, i = Math.min(63, Math.floor(f)); return EASE_T[i] + (EASE_T[i + 1] - EASE_T[i]) * (f - i); };
const easeTabD = (x) => { const f = clamp(x, 0, 1) * 64, i = Math.min(63, Math.floor(f)); return (EASE_T[i + 1] - EASE_T[i]) * 64; };
// posición y velocidad del tramo actual: desde reposo, esa curva; si ya venía en movimiento,
// un tramo Hermite que arranca con esa velocidad (sin frenar en seco)
function tween(kt) {
  const D = to - from;
  if (dur <= 0) return [to, 0];
  if (v0 === 0) return [from + D * easeTab(kt), (D * easeTabD(kt)) / dur];
  const s = kt, s2 = s * s, s3 = s2 * s, m0 = v0 * dur;
  const pos = (2 * s3 - 3 * s2 + 1) * from + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * to;
  const dpos = (6 * s2 - 6 * s) * from + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) * to;
  return [pos, dpos / dur];
}
// prog / from / to están en estaciones (0..QLAST); dentro de la espiral cada rubro es una estación
function goQ(i) {
  i = clamp(Math.round(i), 0, QLAST);
  if (i === to) return;                                 // mismo destino: no se reinicia nada
  if (rp.open >= 0) closeRubro();
  const moving = prog !== to;
  from = prog; to = i; tStart = now();
  v0 = moving && !reduced ? progVel : 0;
  // la duración sigue a la distancia real de la cámara: tramos cortos ágiles, largos sin prisa (ni eternos)
  const n = Math.abs(to - from);
  let arc = 0;
  for (let s = 0, a = posCurve.getPoint(from / QLAST, tmp2); s < 24; s++) {
    const b = posCurve.getPoint((from + (to - from) * (s + 1) / 24) / QLAST, tmp3);
    arc += a.distanceTo(b); a.copy(b);
  }
  dur = reduced ? 0 : n <= 1.01 ? clamp(1.05 + 0.04 * arc, 1.15, 1.85) : clamp(1.3 + 0.025 * arc, 1.6, 2.6);
  lockUntil = tStart + (reduced ? 350 : Math.max(800, dur * 1000 * 0.72));
}
const goTo = (s) => goQ(stationOf(clamp(s, 0, LAST)));   // por escena (índice, "volver al inicio")
const step = (dirn) => goQ(to + dirn);
// rueda / trackpad: se cuenta UN gesto hasta que la rueda descansa 200 ms (así la inercia no brinca escenas)
let wheelAcc = 0, lastWheel = 0, gestureUsed = false, wheelAvg = 0;
addEventListener("wheel", (e) => {
  if (e.ctrlKey) return;                               // pellizco para zoom: se respeta
  if (rp.open >= 0 && e.target.closest && e.target.closest("[data-rpanel]")) {        // dentro del panel: scroll normal…
    const canUp = rpEl.scrollTop > 0, canDown = rpEl.scrollTop + rpEl.clientHeight < rpEl.scrollHeight - 1;
    if ((e.deltaY < 0 && canUp) || (e.deltaY > 0 && canDown)) return;                  // …si hay para dónde; si no, cuenta como gesto
  }
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
  if (Math.abs(wheelAcc) >= 36) { gestureUsed = true; wheelAcc = 0; if (rp.open >= 0) closeRubro(); else step(Math.sign(d)); }
}, { passive: false });
// touch: un deslizamiento de ~48 px = una escena
let ty0 = null, touchUsed = false;
addEventListener("touchstart", (e) => {
  // dentro del panel el dedo desplaza sus proyectos, no cambia de escena
  ty0 = rp.open >= 0 && e.target.closest && e.target.closest("[data-rpanel]") ? null : e.touches[0].clientY;
  touchUsed = false;
}, { passive: true });
addEventListener("touchmove", (e) => {
  if (ty0 === null || touchUsed || now() < lockUntil) return;
  const dy = ty0 - e.touches[0].clientY;
  if (Math.abs(dy) > 48) { touchUsed = true; if (rp.open >= 0) closeRubro(); else step(Math.sign(dy)); }
}, { passive: true });
addEventListener("touchend", () => { ty0 = null; }, { passive: true });
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "Escape" && rp.open >= 0) { e.preventDefault(); if (rp.detail >= 0) closeDetail(); else closeRubro(); return; }
  if (rp.open >= 0 && e.target.closest && e.target.closest("[data-rpanel]")) return;   // dentro del panel: Tab, Enter y flechas normales
  if (rp.open >= 0) {                                                                  // foco fuera (p. ej. tras clic en texto): desplazan el panel
    const dy = { ArrowDown: 60, ArrowUp: -60, PageDown: rpEl.clientHeight * 0.85, PageUp: -rpEl.clientHeight * 0.85, " ": (e.shiftKey ? -1 : 1) * rpEl.clientHeight * 0.85 }[e.key];
    if (dy !== undefined) { e.preventDefault(); rpEl.scrollBy({ top: dy, behavior: reduced ? "auto" : "smooth" }); return; }
  }
  if (e.key === " " && e.target.closest && e.target.closest("button, a, [tabindex], summary")) return;   // Espacio activa el botón enfocado
  if (e.repeat) { if ([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(e.key)) e.preventDefault(); return; }
  if (active === 3 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); return; }
  if (["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) { e.preventDefault(); step(1); }
  else if (["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) { e.preventDefault(); step(-1); }
  else if (e.key === "Home") { e.preventDefault(); goTo(0); }
  else if (e.key === "End") { e.preventDefault(); goQ(QLAST); }
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
try { if (sessionStorage.getItem("mv-hint")) document.documentElement.classList.add("hint-done"); } catch (e) {}
function setActive(a) {
  if (a === active) return;
  if (active === 0 && a > 0) { document.documentElement.classList.add("hint-done"); try { sessionStorage.setItem("mv-hint", "1"); } catch (e) {} }
  active = a;
  document.body.dataset.scene = a;
  // se esconde en contacto (ahí están los dos WhatsApp) y en casos en celular (tapaba la galería)
  if (waFloat) waFloat.inert = a === LAST || (a === 3 && narrowMQ.matches);
  if (a !== 3 && rp.open >= 0) closeRubro(true);
  idxBtns.forEach((b, i) => { if (i === a) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
  if (noteEl) noteEl.innerHTML = NOTES[a];
}

/* ---------- Cursor: rayo en el mundo para empujar partículas ---------- */
const ndc = new THREE.Vector2(), smooth = new THREE.Vector2(), swayT = new THREE.Vector2();
let pointerOn = 0, lastMove = 0, overUI = false;
addEventListener("pointermove", (e) => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (e.pointerType === "mouse") swayT.copy(ndc);                      // el dedo mueve partículas, nunca la cámara
  pointerOn = 1; lastMove = now();
  overUI = !!(e.target.closest && e.target.closest(".orbit-cap, .hud, .wa, a, button, [data-rpanel]"));
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointerOn = 0; swayT.set(0, 0); });
addEventListener("touchend", () => { pointerOn = 0; }, { passive: true });

/* ---------- Loop ---------- */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), camFwd = new THREE.Vector3();
const railPos = new THREE.Vector3(), cssFwd = new THREE.Vector3();
let t0 = null, lastT = 0, mouseAmt = 0, camSpd = 0, railInit = false;
let userMoved = false, peekT0 = -1, peekN = 0, peekV = 0;
// cualquier gesto cancela el asomo y adelanta la entrada del HUD
for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) addEventListener(ev, () => { userMoved = true; if (lifted) revealHud(); }, { passive: true, capture: true });


function frame() {
  const t = clock.getElapsedTime();
  if (t0 === null) { t0 = t; lastT = t; }
  const raw = t - lastT, dt = Math.min(0.05, raw); lastT = t;
  adaptDpr(raw, prog !== to);
  const intro = reduced ? 1 : Math.min(1, (t - t0) / 4.2);
  const k = easeOut(intro);
  smooth.lerp(swayT, 0.06);

  // transición: de una escena a la otra con llegada suave
  const kt = dur > 0 ? clamp((now() - tStart) / (dur * 1000), 0, 1) : 1;
  [prog, progVel] = kt >= 1 ? [to, 0] : tween(kt);
  const q = prog, p = sceneP(q);                       // q: estación (con rubros) · p: escena para los efectos (0..4)
  setActive(Math.round(p));
  if (progEl) progEl.style.transform = `scaleX(${q / QLAST})`;

  // cámara sobre la curva + entrada en dolly + deriva con el cursor
  // asomo: sin gesto, 3.5 s después de la intro la cámara se asoma a la escena siguiente y regresa (máx. 2)
  if (!userMoved && !reduced && peekN < 2 && lifted && to === 0 && prog === 0 && peekT0 < 0 && now() - liftedAt > 7700 + peekN * 6000) peekT0 = now();
  let peek = 0;
  if (peekT0 >= 0) {
    const e = (now() - peekT0) / 1000;
    peek = e < 0.7 ? 0.06 * (1 - Math.pow(1 - e / 0.7, 3)) : e < 1.6 ? 0.06 * (1 - easeInOut((e - 0.7) / 0.9)) : 0;
    if (e >= 1.6) { peekT0 = -1; peekN++; }
  }
  peekV = userMoved ? peekV * Math.exp(-dt * 8) : peek;                   // un gesto lo cancela sin brinco
  posCurve.getPoint(clamp(q + peekV, 0, QLAST) / QLAST, camPos);
  lookCurve.getPoint(clamp(q + peekV, 0, QLAST) / QLAST, camLook);
  // velocidad real de la cámara sobre su riel (u/s): de aquí sale el efecto de velocidad
  if (railInit && dt > 0) camSpd += (camPos.distanceTo(railPos) / dt - camSpd) * (1 - Math.exp(-dt * 10));
  railPos.copy(camPos); railInit = true;
  const heroW = 1 - sm(0, 0.6, p), endW = sm(3.4, 4, p);
  if (heroW > 0 && k < 1) {                                               // dolly de entrada (también para los textos)
    tmp.copy(camPos).sub(camLook).normalize().multiplyScalar(7 * (1 - k) * heroW);
    camPos.add(tmp); camPos.y += (1 - k) * 1.0 * heroW;
  }
  cssCam.position.copy(camPos); cssCam.lookAt(camLook); cssCam.getWorldDirection(cssFwd);
  if (!reduced) {
    const orbit = (Math.sin(t * 0.11) * (portrait ? 0.018 : 0.05) + smooth.x * 0.06) * Math.max(heroW, endW);   // en celular casi quieta: los botones no se corren
    tmp.copy(camPos).sub(camLook).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit);
    camPos.copy(camLook).add(tmp);
    camPos.x += smooth.x * 0.1 * (1 - Math.max(heroW, endW));
    camPos.y += smooth.y * 0.12;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const kick = reduced ? 0 : sm(2, 14, camSpd);                          // 0..1 según la velocidad real
  camera.fov = BASE_FOV + kick * 3.5;
  camera.updateProjectionMatrix();
  // con un rubro abierto, la vista se corre (sin cambiar la perspectiva): la espiral queda a la izquierda
  // en horizontal, o arriba en vertical, y el panel ocupa el espacio libre
  rpView += ((rp.open >= 0 ? 1 : 0) - rpView) * (1 - Math.exp(-dt * (reduced ? 60 : 4.5)));
  setView(rpView);
  camera.getWorldDirection(camFwd);
  finalPass.uniforms.uCA.value = BASE_CA + kick * 0.003;

  // el estudio del inicio se apaga al salir; el del final se enciende al llegar
  const studio = 1 - sm(0.2, 0.9, p), endStudio = sm(3.4, 4, p);
  floor.material.opacity = FLOOR_OPACITY * studio; floor.visible = studio > 0.001;
  floorEnd.material.opacity = FLOOR_OPACITY * endStudio; floorEnd.visible = endStudio > 0.001;
  beam.material.uniforms.uDim.value = studio; beam.visible = studio > 0.001;
  horizon.material.uniforms.uDim.value = studio; horizon.visible = studio > 0.001;
  dust.material.uniforms.uDim.value = studio; dust.visible = studio > 0.001;
  sunMirror.material.uniforms.uDim.value = 0.3 * studio; sunMirror.visible = studio > 0.001;

  // anillos: se encienden al acercarse y se apagan al cruzarlos
  const ringDim = (r, gate, far) => {
    const ahead = camera.position.z - r.position.z;
    r.material.uniforms.uDim.value = gate * sm(0.2, 2.6, ahead) * (1 - sm(far, far + 14, ahead));
    r.visible = r.material.uniforms.uDim.value > 0.001;
  };
  ringDim(sun, 1, FAR_SUN);
  sun.material.uniforms.uClip.value = studio > 0.02 ? 1 : 0;
  tunnel.forEach((r) => ringDim(r, 0.6 * sm(1.25, 1.9, p) * (1 - sm(2.45, 2.9, p)), FAR_TUN));   // al salir del túnel se apagan
  ringTime.value = t;

  // espiral de rubros: estación continua (0 = primer rubro) y giro
  const sIn = clamp(q - Q0, 0, NR - 1), spin = spinAt(q);

  // partículas: armar → anillo → túnel → armar de nuevo al final
  if (particles) {
    const U = particles.shared;
    U.uA.value = sm(0.05, 1.3, p);
    U.uC.value = sm(1.15, 2.1, p);
    U.uB.value = sm(2.2, 2.95, p);         // al salir del túnel la M se construye: es el planeta de los casos
    U.uMScale.value = mScale; U.uRingS.value = RING_S; U.uRingZ.value = RING_Z;
    U.uMouseK.value = clamp(camera.position.distanceTo(camLook) / mouseRef, 1, 1.7);   // el remolino del cursor sigue a la distancia
    U.uRot.value = reduced ? 0 : Math.sin(t * 0.23) * 0.22 + smooth.x * 0.1;
    // casos: las partículas son la cinta de la espiral (gira con ella); en el cierre bajan y arman la M al pie
    U.uPlanet.value = sm(2.2, 2.7, p) * (1 - sm(3.25, 3.85, p));
    U.uSpiral.value.set(SPI.yTop, SPI.drop, SPI.R, spin);
    U.uSpiralK.value.set(SPI.stepA, NR);
    const bob = reduced ? 0 : Math.sin(t * 0.6) * 0.04;
    U.uStart.value.set(0, AXIS_Y + bob, 0);
    U.uEnd.value.set(0, SPI.yM + bob, END_Z);
    // cursor: se enciende al moverlo y se relaja si se queda quieto
    const want = reduced ? 0 : pointerOn * (now() - lastMove < 2500 ? 1 : 0.45);
    mouseAmt += (want - mouseAmt) * (1 - Math.exp(-dt * 18));             // responde casi al instante
    raycaster.setFromCamera(ndc, camera);                                  // el mouse real, sin suavizado: cero retraso
    U.uRayO.value.copy(raycaster.ray.origin); U.uRayD.value.copy(raycaster.ray.direction);
    U.uMouse.value = mouseAmt;
    AU.uRayO.value.copy(raycaster.ray.origin); AU.uRayD.value.copy(raycaster.ray.direction); AU.uMouse.value = mouseAmt;
    const fi = Math.min(QLAST - 1, Math.floor(q)), ff = q - fi;
    particles.focus = THREE.MathUtils.lerp(FOCUS[fi], FOCUS[fi + 1], ff);
    particles.reflect = Math.max(studio, endStudio);
    particles.floorY = endStudio > studio ? SPI.yM - AXIS_Y : 0;           // el reflejo del cierre, sobre su propio piso
    particles.update(dt, reduced ? 0 : t);
  }

  // casos: las fichas de rubro en la espiral. Entran girando desde afuera, la del frente manda
  const cIn = sm(2.3, 2.95, p), cOut = sm(3.2, 3.62, p), cVis = cIn * (1 - cOut);
  if (p > 1.4) loadRubroTextures();
  const cur = Math.round(sIn);
  if (cVis > 0.01) showRubro(to >= Q0 && to <= Q0 + NR - 1 ? to - Q0 : cur);   // en camino: el rubro al que vas
  // hover (sólo con mouse y fuera de la interfaz): la ficha se acerca un poco y se enciende su filo
  let hov = -1;
  if (cVis > 0.5 && hoverCapable && pointerOn && !overUI) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0];
    if (hit) hov = hit.object.userData.i;
  }
  const wantCursor = hov >= 0 ? "pointer" : "";
  if (document.body.style.cursor !== wantCursor) document.body.style.cursor = wantCursor;
  cards.forEach((m) => {
    const ud = m.userData, j = ud.i;
    const th = j * SPI.stepA + spin;
    const face = Math.cos(th);                                             // 1 = de frente · <0 = del otro lado del eje
    m.visible = cVis > 0.01 && ud.ready && face > -0.2 && (j === rp.open || rpView < 0.97);
    if (!m.visible) return;
    ud.hover += ((j === hov ? 1 : 0) - ud.hover) * (1 - Math.exp(-dt * 8));
    const R = SPI.R * (1 + (1 - cIn) * 0.6 + cOut * 0.5) + 0.3 * ud.hover;
    const bob = reduced ? 0 : Math.sin(t * 0.7 + j * 1.9) * 0.05;
    m.position.set(Math.sin(th) * R, SPI.yTop - j * SPI.drop + bob, END_Z + Math.cos(th) * R);
    m.rotation.set(0, th, 0);                                              // mira hacia afuera del eje
    const fade = sm(0, 0.35, cVis);                                        // al entrar y salir de la espiral, crecen y se encienden
    const sc = SPI.cardW * (0.7 + 0.3 * cIn) * (1 + 0.05 * ud.hover) * fade;
    m.scale.set(Math.max(1e-3, sc), Math.max(1e-3, sc / CARD_AR), 1);
    const wc = clamp(1 - Math.abs(sIn - j), 0, 1);                         // qué tan "del frente" es (continuo: sin brincos)
    let b = (0.28 + 0.72 * sm(-0.2, 1, face)) * (0.62 + 0.38 * wc) * fade;
    if (j !== rp.open) b *= 1 - 0.97 * rpView;                            // con un rubro abierto, las demás se retiran
    ud.u.uBright.value = b;
    ud.u.uEdge.value = (0.3 + 0.7 * Math.max(ud.hover, 0.55 * wc, j === rp.open ? 1 : 0)) * fade;
  });

  // textos: aparecen al acercarte, la cámara los atraviesa al seguir
  const jumpA = Math.round(sceneP(from)), jumpB = Math.round(sceneP(to));
  const introText = reduced ? 1 : sm(0.42, 0.62, intro);
  labels.forEach((o, i) => {
    // un texto a la vez: el que sale se va en el primer tramo y el que llega aparece al final, con su objeto ya formado.
    // Servicios vive a 3 unidades de los casos y la cámara no lo cruza: sale aún antes al avanzar.
    // Contacto espera a que la M esté armada. En saltos largos (índice) los intermedios no aparecen
    let vis = i === 2 && p > 2 ? 1 - sm(0.04, 0.18, p - 2)
      : i === 4 && p < 4 ? sm(3.72, 3.95, p)
      : 1 - sm(0.12, 0.4, Math.abs(p - i));
    if (jumpA !== jumpB && Math.abs(jumpB - jumpA) >= 2 && i !== jumpA && i !== jumpB) vis = 0;
    if (i === 3) { o.position.copy(o.userData.base); o.position.y -= SPI.drop * sIn; }   // baja con la cámara de rubro en rubro
    const ratio = tmp.copy(o.position).sub(cssCam.position).dot(cssFwd) / o.userData.d;   // 1 = a 1:1; 0.5 = al doble
    const op = vis * sm(0.5, 0.78, ratio) * (i === 3 ? 1 - rpView : 1)   // con un rubro abierto manda el panel
      * (i === 0 ? introText : 1);                                        // el titular llega cuando la M ya se lee
    const on = (i === 3 ? op / Math.max(0.001, 1 - rpView) : op) > 0.01;   // (casos: se desvanece, no se quita del DOM)
    if (o.visible !== on) o.visible = on;
    const el = sections[i];
    const opS = op.toFixed(3);
    if (el.style.opacity !== opS) el.style.opacity = opS;
    const inert = vis < 0.6 || (i === 3 && rp.open >= 0);                  // con el panel abierto, el pie de la espiral no se toca
    if (el.inert !== inert) el.inert = inert;
  });

  beam.material.uniforms.uTime.value = t;
  dust.material.uniforms.uTime.value = reduced ? 0 : t;
  AU.uTime.value = reduced ? 0 : t;
  for (let i = 0; i < BLAST_N; i++) {
    BLAST.uBlastP.value[i] = BLAST.uBlastT.value[i];
    BLAST.uBlastT.value[i] = Math.min(99, BLAST.uBlastT.value[i] + dt);
  }
  AU.uSpeed.value = kick * 2;
  finalPass.uniforms.uTime.value = t;

  composer.render();
  css.render(cssScene, cssCam);
  requestAnimationFrame(frame);
}

// para pruebas: ?s=3 abre directo en una escena; ?debug expone el mundo en la consola
const qsScene = new URLSearchParams(location.search).get("s");
if (qsScene !== null) { from = to = prog = stationOf(clamp(Math.round(+qsScene) || 0, 0, LAST)); }
if (/[?&]debug\b/.test(location.search)) window.__lab = { THREE, get dpr() { return DPR; }, renderer, scene, composer, bloom, camera, get particles() { return particles; }, goTo, goQ, openRubro, openDetail, get rp() { return rp; }, cards, SPI };

// la entrada: el telón se levanta cuando todo está listo y ahí arranca el reloj de la intro
// (antes corría debajo del telón). Primero la M y el anillo, luego el titular, al final HUD, botón y pista
const introEls = () => [".hud--tl", ".idx", ".hud--tr", ".hud--bl", ".wa", "[data-hint]"].map((s) => document.querySelector(s)).filter(Boolean);
let revealed = false, liftedAt = 0;
function revealHud() {
  if (revealed) return; revealed = true;
  document.documentElement.classList.remove("is-intro");
  if (reduced) return;
  introEls().forEach((el, i) => el.animate([{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }],
    { duration: 480, delay: i < 4 ? i * 70 : 600, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
}
let lifted = false;
function lift() {
  if (lifted) return; lifted = true;
  setLoad(1);
  curtain.classList.add("is-off");
  t0 = null;                                         // la intro (dolly y titular) empieza aquí, a la vista
  liftedAt = now();
  setTimeout(revealHud, reduced ? 0 : 2800);
}
if (!reduced) document.documentElement.classList.add("is-intro");
setTimeout(lift, 6500);                              // red de seguridad (el telón de CSS se va a los 7 s)
frame();
buildM().catch((err) => console.error(err)).finally(() => requestAnimationFrame(() => requestAnimationFrame(lift)));
