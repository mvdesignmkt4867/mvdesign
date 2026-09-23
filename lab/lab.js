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
import { createParticles } from "./particles.js?v=17";

const canvas = document.querySelector("[data-gl]");
const curtain = document.querySelector("[data-curtain]");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const LAST = 4;        // escenas 0..4
const END_Z = -40;     // donde la M se vuelve a armar: el planeta de los casos y el cierre
const AXIS_Y = 1.9;    // centro de la M, del eclipse y del túnel
const RING_Z = -7;     // el eclipse: más atrás y más grande (el manifiesto vive dentro)
const RING_S = 1.55;   // radio del eclipse ≈ 3.57
const M_S = 1.3;       // la M, más grande
const TUNNEL_STEP = 6, TUNNEL_N = 5, TUNNEL_END = RING_Z - TUNNEL_STEP * TUNNEL_N;   // servicios vive dentro del último anillo
const RING_R = 2.304;                                   // radio del anillo a escala 1 (plano de 7.2, filo en r = .64)
const SUN_R = RING_R * RING_S, TUN_R = RING_R * RING_S * (1 + TUNNEL_N * 0.03);
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
  ap[i * 3] = (Math.random() - 0.5) * (Math.random() < 0.7 ? 16 : 28);   // más densas cerca del camino de la cámara
  ap[i * 3 + 1] = 0.3 + Math.random() * 7.2;
  ap[i * 3 + 2] = 9 - Math.random() * 62;                       // del hero (z +9) al cierre (z -53)
  aseed[i] = Math.random();
  atint.set(tints[Math.floor(Math.random() * tints.length)], i * 3);
}
ambGeo.setAttribute("position", new THREE.BufferAttribute(ap, 3));
ambGeo.setAttribute("aSeed", new THREE.BufferAttribute(aseed, 1));
ambGeo.setAttribute("aTint", new THREE.BufferAttribute(atint, 3));
const AU = {
  uTime: { value: 0 }, uPx: { value: DPR }, uSpeed: { value: 0 },
  uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouse: { value: 0 }
};
const ambient = new THREE.Points(ambGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: AU,
  // suma color pero no toca el alfa: no altera la máscara (fotos de los casos y color exacto de la M)
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  vertexShader: `
    uniform float uTime, uPx, uSpeed, uMouse; uniform vec3 uRayO, uRayD;
    attribute float aSeed; attribute vec3 aTint; varying vec3 vC; varying float vA;
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
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      float z = -mv.z;
      gl_PointSize = clamp((.8 + aSeed * 1.5) * uPx * (12. / max(z, .1)), 1., 5.5);
      float tw = .55 + .45 * sin(uTime * (.8 + aSeed * 1.7) + aSeed * 90.);
      vA = tw * smoothstep(.6, 2.5, z) * (1. - smoothstep(18., 34., z)) * (.55 + f * 2.6 + uSpeed * .5);
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
  particles = createParticles({ renderer, geos, holderMatrix: holder.matrix, mobile, reduced, exclude });
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
let orbitBase = 0, orbitSpeed = 0.2, orbitSel = -1, orbitFocus = -2;
const capMeta = document.querySelector("[data-cap-meta]"), capName = document.querySelector("[data-cap-name]"), capChip = document.querySelector("[data-cap-chip]");
const capLive = document.querySelector("[data-cap-live]");
const hoverCapable = matchMedia("(hover: hover)").matches;
function showCaption(i) {
  if (i === orbitFocus) return;
  orbitFocus = i;
  const cs = CASES[i];
  if (capMeta) capMeta.textContent = cs ? `${String(i + 1).padStart(2, "0")} / 05 · ${cs.sector}` : (hoverCapable ? "Pasa el cursor o elige una ficha" : "Toca una ficha");
  if (capName) capName.textContent = cs ? cs.name : "Cinco marcas en órbita";
  if (capChip) { capChip.textContent = cs ? cs.chip : ""; capChip.classList.toggle("is-empty", !cs); }
}
// elegir (clic, toque, flechas): la ficha vuela al centro de la órbita y se presenta grande.
// Sólo las elecciones explícitas se anuncian al lector de pantalla (el hover no).
function select(i) {
  orbitSel = i;
  if (capLive) capLive.textContent = i >= 0 ? `${CASES[i].name}. ${CASES[i].sector}. ${CASES[i].chip}.` : "";
}
// la ficha más al frente de la órbita ahora mismo
const frontCard = () => cards.reduce((best, m, i) => (Math.sin(orbitBase + i * TAU / 5) > Math.sin(orbitBase + best * TAU / 5) ? i : best), 0);
const selectCase = (dirn) => select(orbitSel < 0 ? frontCard() : (orbitSel + dirn + 5) % 5);
document.querySelector("[data-case-prev]")?.addEventListener("click", () => selectCase(-1));
document.querySelector("[data-case-next]")?.addEventListener("click", () => selectCase(1));
// tocar / hacer clic en una ficha la presenta; tocar la presentada o fuera la regresa a la órbita
let downX = 0, downY = 0, downT = 0;
addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); }, { passive: true });
addEventListener("pointerup", (e) => {
  if (active !== 3 || (e.target.closest && e.target.closest("button, a, .orbit-cap, .hud"))) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10 || performance.now() - downT > 450) return;
  const pt = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pt, camera);
  const hit = raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0];
  select(hit && orbitSel !== hit.object.userData.i ? hit.object.userData.i : -1);
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
const TEXT_DESK = [{ d: 11, oy: 0.28 }, { oy: 0 }, { oy: 0 }, { d: 9.5, oy: 0 }, { d: 13.5, oy: 0.27 }];
const TEXT_PORT = [{ d: 14, oy: 0.17 }, { oy: 0 }, { oy: 0 }, { d: 9.5, oy: 0 }, { d: 17.5, oy: 0.25 }];
// qué tanto del lado corto de la pantalla ocupa el anillo cuando llegas a su escena
const RING_FILL = { land: 0.84, port: 0.96 };
const mLook = new THREE.Matrix4(), qTmp = new THREE.Quaternion();
function buildPath() {
  const E = END_Z;
  const tanH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  const H = innerHeight, narrow = innerWidth <= 720;
  // distancia a la que un anillo de radio R ocupa `fill` del lado corto de la pantalla
  const fill = portrait ? RING_FILL.port : RING_FILL.land;
  const view = (R) => R / (fill * tanH * Math.min(1, innerWidth / innerHeight));
  const dSun = view(SUN_R), dTun = view(TUN_R);
  const k1 = RING_Z + dSun;                        // manifiesto: frente al eclipse
  const k0 = k1 + (portrait ? 6 : 6.5);            // el inicio, más atrás: el viaje al manifiesto se siente
  if (portrait) {
    KEYS.pos = [V(0, 2.3, k0), V(0, AXIS_Y, k1), V(0, AXIS_Y, TUNNEL_END + dTun), V(0, AXIS_Y + 4.2, E + 16.5), V(0, 2.5, E + 20.5)];
    KEYS.look = [V(0, 0.75, 0), V(0, AXIS_Y, RING_Z), V(0, AXIS_Y, TUNNEL_END), V(0, AXIS_Y + 0.6, E), V(0, 0.35, E)];
    FOCUS = [k0, dSun, dTun, 17, 20.5];
  } else {
    KEYS.pos = [V(0, 2.2, k0), V(0, AXIS_Y, k1), V(0, AXIS_Y, TUNNEL_END + dTun), V(0, AXIS_Y + 1.5, E + 15.4), V(0, 2.3, E + 16.5)];
    KEYS.look = [V(0, 1.15, 0), V(0, AXIS_Y, RING_Z), V(0, AXIS_Y, TUNNEL_END), V(0, AXIS_Y + 0.35, E), V(0, 0.95, E)];
    FOCUS = [k0, dSun, dTun, 15, 16.5];
  }
  posCurve = new THREE.CatmullRomCurve3(KEYS.pos, false, "centripetal");
  lookCurve = new THREE.CatmullRomCurve3(KEYS.look, false, "centripetal");
  // cada texto queda de frente a la cámara de su escena, a 1:1 (nítido) cuando llegas.
  // Manifiesto y servicios viven en el plano de su anillo y su tipografía se mide con él (--ring):
  // el texto queda dentro del círculo con cualquier zoom del navegador y en cualquier pantalla.
  const T = portrait ? TEXT_PORT : TEXT_DESK;
  const RING_AT = { 1: [SUN_R, dSun], 2: [TUN_R, dTun] };
  labels.forEach((o, i) => {
    const ring = RING_AT[i];
    const d = ring ? ring[1] : T[i].d, oy = T[i].oy;
    mLook.lookAt(KEYS.pos[i], KEYS.look[i], THREE.Object3D.DEFAULT_UP);
    qTmp.setFromRotationMatrix(mLook);
    const s = (2 * d * tanH) / H;                   // unidades de mundo por píxel CSS a esa distancia
    const el = sections[i];
    if (ring) {
      const D = (2 * ring[0]) / s;                  // diámetro del anillo en px
      el.style.setProperty("--ring", D.toFixed(1) + "px");
      el.classList.toggle("is-compact", portrait || D < 540);   // anillo chico: sólo lo esencial
    }
    // mide el bloque (el renderer oculta con display:none las escenas lejanas)
    const prevD = el.style.display;
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
let pointerOn = 0, lastMove = 0, overUI = false;
addEventListener("pointermove", (e) => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointerOn = 1; lastMove = now();
  overUI = !!(e.target.closest && e.target.closest(".orbit-cap, .hud, .wa, a, button"));
}, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointerOn = 0; });
addEventListener("touchend", () => { pointerOn = 0; }, { passive: true });

/* ---------- Loop ---------- */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), camFwd = new THREE.Vector3();
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

  // órbita de casos: inclinación viva del anillo (precesión suave) y tamaño según el alto disponible
  const orbitFit = portrait ? 1 : clamp((innerHeight - 330) / 570, 0.55, 1);
  const orbitTilt = (portrait ? 0.38 : 0.12) + (reduced ? 0 : Math.sin(t * 0.21) * 0.03);

  // partículas: armar → anillo → túnel → armar de nuevo al final
  if (particles) {
    const U = particles.shared;
    U.uA.value = sm(0.05, 1.3, p);
    U.uC.value = sm(1.15, 2.1, p);
    U.uB.value = sm(2.2, 2.95, p);         // al salir del túnel la M se construye: es el planeta de los casos
    U.uMScale.value = M_S; U.uRingS.value = RING_S; U.uRingZ.value = RING_Z;
    U.uRot.value = reduced ? 0 : Math.sin(t * 0.23) * 0.22 + smooth.x * 0.1;
    // casos: las partículas son el anillo de la órbita; en el cierre vuelven y arman la M
    U.uPlanet.value = sm(2.2, 2.7, p) * (1 - sm(3.25, 3.85, p));
    U.uTilt.value = orbitTilt;
    U.uDust.value.set(portrait ? 1.45 : 2.9 * orbitFit, portrait ? 3.0 : 5.8 * orbitFit);
    const bob = reduced ? 0 : Math.sin(t * 0.6) * 0.04;
    U.uStart.value.set(0, AXIS_Y + bob, 0);
    U.uEnd.value.set(0, AXIS_Y + bob, END_Z);
    // cursor: se enciende al moverlo y se relaja si se queda quieto
    const want = reduced ? 0 : pointerOn * (now() - lastMove < 2500 ? 1 : 0.45);
    mouseAmt += (want - mouseAmt) * (1 - Math.exp(-dt * 18));             // responde casi al instante
    raycaster.setFromCamera(ndc, camera);                                  // el mouse real, sin suavizado: cero retraso
    U.uRayO.value.copy(raycaster.ray.origin); U.uRayD.value.copy(raycaster.ray.direction);
    U.uMouse.value = mouseAmt;
    AU.uRayO.value.copy(raycaster.ray.origin); AU.uRayD.value.copy(raycaster.ray.direction); AU.uMouse.value = mouseAmt;
    const fi = Math.min(LAST - 1, Math.floor(p)), ff = p - fi;
    particles.focus = THREE.MathUtils.lerp(FOCUS[fi], FOCUS[fi + 1], ff);
    particles.reflect = Math.max(studio, endStudio);
    particles.update(dt, reduced ? 0 : t);
  }

  // casos: las fichas orbitan la M; entran girando, se detienen con el cursor y se van al pasar al contacto
  const cIn = sm(2.3, 2.95, p), cOut = sm(3.2, 3.62, p), cVis = cIn * (1 - cOut);
  if (p > 1.4) loadCaseTextures();
  if (active !== 3 && orbitSel >= 0) select(-1);
  // hover (sólo con mouse, fuera de la interfaz y si no hay una ficha presentada): pausa la órbita
  let hov = -1;
  if (cVis > 0.5 && hoverCapable && pointerOn && !overUI && orbitSel < 0) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(cards.filter((m) => m.visible), false)[0];
    if (hit) hov = hit.object.userData.i;
  }
  const focus = orbitSel >= 0 ? orbitSel : hov;                          // lo elegido manda sobre el hover
  if (cVis > 0.01) showCaption(focus);
  const wantCursor = hov >= 0 ? "pointer" : "";
  if (document.body.style.cursor !== wantCursor) document.body.style.cursor = wantCursor;
  orbitSpeed += ((focus >= 0 || reduced ? 0 : 0.2) - orbitSpeed) * (1 - Math.exp(-dt * 3));
  orbitBase += orbitSpeed * dt;
  // la órbita cabe en el cuadro: más chica en pantallas bajas o angostas
  const fitH = orbitFit;
  const CARD_W = (portrait ? 1.3 : 2.05) * fitH;
  const halfW = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 15.4 * camera.aspect;
  const ORB_R = portrait ? 2.2 : Math.max(2.4, Math.min(4.3 * fitH, halfW * 0.92 - CARD_W / 2));
  const TILT = orbitTilt, PRES = portrait ? 3.3 : 1.75;
  const C = tmp2.set(0, AXIS_Y + (reduced ? 0 : Math.sin(t * 0.6) * 0.04), END_Z);
  const presPos = tmp3.copy(C).addScaledVector(camFwd, -2.2);           // al centro, un poco hacia ti
  cards.forEach((m) => {
    const ud = m.userData, i = ud.i;
    m.visible = cVis > 0.01 && ud.ready;
    if (!m.visible) return;
    const th = orbitBase + i * TAU / 5 + (1 - cIn) * 2.2;
    const R = ORB_R * (0.45 + 0.55 * cIn) * (1 + cOut * 0.9);
    const x = Math.cos(th) * R, z = Math.sin(th) * R;
    const bob = reduced ? 0 : Math.sin(t * 0.8 + i * 1.7) * 0.09;           // flotan, cada una a su ritmo
    m.position.set(C.x + x, C.y + bob - z * Math.sin(TILT), C.z + z * Math.cos(TILT));
    const k = reduced ? 60 : 5;
    ud.lift += ((i === orbitSel ? 1 : 0) - ud.lift) * (1 - Math.exp(-dt * k));
    ud.hover = (ud.hover || 0) + ((i === hov ? 1 : 0) - (ud.hover || 0)) * (1 - Math.exp(-dt * 8));
    const e = ud.lift * ud.lift * (3 - 2 * ud.lift);
    m.position.lerp(presPos, e);                                           // la elegida vuela al centro
    m.position.addScaledVector(camFwd, -0.35 * ud.hover);                  // la del hover apenas se acerca
    const sc = CARD_W * cVis * (1 + (PRES - 1) * e + 0.1 * ud.hover);
    m.scale.set(sc, sc / CARD_AR, 1);
    m.quaternion.copy(camera.quaternion);                                  // siempre de frente
    const near = (Math.sin(th) + 1) / 2;
    let b = 0.5 + 0.5 * near;
    if (focus >= 0) b = i === focus ? 1.05 : b * 0.5;
    ud.u.uBright.value = b;
    ud.u.uEdge.value = 0.35 + 0.65 * Math.max(e, ud.hover);
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
  AU.uTime.value = reduced ? 0 : t;
  AU.uSpeed.value = kick;
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
