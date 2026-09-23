/* ============================================================
   MV Design · Lab — experiencia inmersiva (prototipo)
   Un solo mundo que se recorre con el scroll, en 5 escenas:
   01 La firma   la M oficial en 3D, un eclipse de marca detrás
                 y un piso espejo negro.
   02 Manifiesto la M se disuelve en partículas de marca.
   03 Servicios  la cámara cruza el anillo y entra a un túnel de luz.
   04 Casos      carrusel 3D con los proyectos reales.
   05 Contacto   las partículas vuelven a formar la M.
   Posproceso: bloom, aberración cromática (crece con la
   velocidad del scroll), viñeta y grano.
   ============================================================ */
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const canvas = document.querySelector("[data-gl]");
const curtain = document.querySelector("[data-curtain]");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
// resolución adaptable: arranca moderada y se ajusta sola según lo que aguante el equipo
const DPR_MAX = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
let DPR = Math.min(DPR_MAX, mobile ? 1.25 : 1.5);
const LAST = 4;        // escenas 0..4
const END_Z = -54;     // donde la M se vuelve a formar
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07070B");
scene.fog = new THREE.FogExp2("#0B0A16", 0.035);

// ambiente de estudio propio: tiras de luz que se reflejan limpias en el barniz de la M
const pmrem = new THREE.PMREMGenerator(renderer);
function studioEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color("#030306");
  const strip = (color, k, w, h, pos, rotY = 0, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.rotation.set(rotX, rotY, 0); env.add(m);
  };
  strip("#b26bd0", 5, 1.2, 9, new THREE.Vector3(-6, 1, 1), Math.PI / 2);      // tira morada a la izquierda
  strip("#5fe0ea", 5, 1.2, 9, new THREE.Vector3(6, 1, 0.5), -Math.PI / 2);    // tira cian a la derecha
  strip("#ffffff", 4, 9, 1.0, new THREE.Vector3(0, 6, 0.5), 0, Math.PI / 2);  // cenital
  strip("#8f8cff", 1.2, 14, 4, new THREE.Vector3(0, 2, 8), Math.PI);          // rebote suave al frente
  strip("#ffffff", 2.5, 0.4, 6, new THREE.Vector3(2.5, 2, -6));               // filo detrás
  return pmrem.fromScene(env, 0.02).texture;
}
scene.environment = studioEnv();
scene.environmentIntensity = 1.25;

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2, 19);

/* ---------- Luces: softboxes en tira + contraluces de marca ---------- */
// todas viven en un "rig" que se muda a la M del final (sin luces extra: cada luz encarece el shader)
const rig = new THREE.Group();
scene.add(rig);
const key = new THREE.DirectionalLight("#dfe4ff", 1.6);
key.position.set(2.5, 7, 5);
key.target.position.set(0.6, 1.3, 0);
rig.add(key, key.target);
RectAreaLightUniformsLib.init();
function softbox(color, intensity, w, h, pos, look) {
  const l = new THREE.RectAreaLight(color, intensity, w, h);
  l.position.copy(pos); l.lookAt(look); rig.add(l); return l;
}
softbox("#9E43B8", 22, 0.7, 5.5, new THREE.Vector3(-4.6, 2.8, 1.2), new THREE.Vector3(0.6, 1.3, 0));
softbox("#2BCCD9", 20, 0.7, 5.5, new THREE.Vector3(5.2, 2.6, 0.6), new THREE.Vector3(0.6, 1.3, 0));
const rimPurple = new THREE.PointLight("#9E43B8", 26, 12, 2);
rimPurple.position.set(-2.2, 3.2, -2.6);
const rimCyan = new THREE.PointLight("#2BCCD9", 24, 12, 2);
rimCyan.position.set(3.4, 2.8, -2.4);
rig.add(rimPurple, rimCyan);

/* ---------- Ciclorama: piso que sube en curva a la pared ---------- */
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
  halo(560, 250, 300, [[0, "rgba(98,92,217,.95)"], [.45, "rgba(98,92,217,.35)"], [1, "rgba(0,0,0,0)"]]);
  halo(470, 230, 200, [[0, "rgba(158,67,184,.75)"], [1, "rgba(0,0,0,0)"]]);
  halo(660, 270, 220, [[0, "rgba(43,204,217,.55)"], [1, "rgba(0,0,0,0)"]]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  return tex;
}
// piso: espejo negro sin iluminar; deja ver el reflejo de la M por debajo
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

/* ---------- La M: extruida del SVG oficial ---------- */
const GRADS = [ // [desde, hasta, color A, color B] en coordenadas del SVG (283.46²)
  [[88.59, 41.38], [194.36, 142.22], "#4892d9", "#2bccd9"],   // chevrón azul
  [[157.27, 150.49], [236.51, 71.25], "#9e43b8", "#625cd9"],  // lágrima morada
  [[46.5, 213.2], [86.6, 173.2], "#9e43b8", "#625cd9"],       // punto morado (degradado a 45°)
  [[189.93, 193.19], [245.02, 193.19], "#4892d9", "#2bccd9"]  // punto azul
];
const Z_OFF = [0, 5, 0, 0]; // la lágrima va un poco al frente del chevrón (sin z-fighting)

function paintGradient(geo, g) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const [a, b, ca, cb] = g, A = new THREE.Color(ca), B = new THREE.Color(cb), c = new THREE.Color();
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, ((pos.getX(i) - a[0]) * dx + (pos.getY(i) - a[1]) * dy) / L));
    c.copy(A).lerp(B, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

// ruido para la disolución: la M se deshace en islas con el filo encendido
const NOISE = `
float mvHash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mvNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(mvHash(i), mvHash(i + vec3(1,0,0)), f.x), mix(mvHash(i + vec3(0,1,0)), mvHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mvHash(i + vec3(0,0,1)), mvHash(i + vec3(1,0,1)), f.x), mix(mvHash(i + vec3(0,1,1)), mvHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float mvFbm(vec3 p){ return .55 * mvNoise(p) + .3 * mvNoise(p * 2.1) + .15 * mvNoise(p * 4.3); }
`;
// parche común: emisivo por vértice (el degradado oficial brilla dentro) + disolución
function mPatch(sh, dissolveU, extra = "") {
  sh.uniforms.uDissolve = dissolveU;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nvarying float vWY;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;\nvWY = (modelMatrix * vec4(transformed, 1.)).y;");
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uDissolve;\nvarying vec3 vObj;\nvarying float vWY;\n" + NOISE)
    .replace("#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nfloat mvD = mvFbm(vObj * .045) - uDissolve * 1.15 + .08;\nif (mvD < 0.) discard;")
    .replace("vec3 totalEmissiveRadiance = emissive;",
      "vec3 totalEmissiveRadiance = emissive * vColor + vColor * smoothstep(.07, 0., mvD) * 5. * step(.001, uDissolve);")
    .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n" + extra);
}
const dStart = { value: 0 }, dEnd = { value: 1 };

// acrílico iluminado desde adentro con barniz que refleja las tiras de luz
const mMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  color: new THREE.Color("#c9ccff"),
  metalness: 0.1, roughness: 0.16,
  clearcoat: 1, clearcoatRoughness: 0.02,
  emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.32,
  envMapIntensity: 1.2
});
mMaterial.onBeforeCompile = (sh) => mPatch(sh, dStart);
// reflejo: más oscuro y se desvanece con la profundidad (como un piso pulido real)
const mirrorMat = new THREE.MeshStandardMaterial({
  vertexColors: true, color: new THREE.Color("#5a5d85"), metalness: 0.1, roughness: 0.25,
  emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.12, envMapIntensity: 0.3
});
mirrorMat.onBeforeCompile = (sh) => mPatch(sh, dStart, "gl_FragColor.rgb *= smoothstep(-1.7, 0., vWY) * .55;");
// la M del final (arranca disuelta)
const endMat = mMaterial.clone();
endMat.onBeforeCompile = (sh) => mPatch(sh, dEnd);

let M_BASE_Y = 1.3;
const mGroup = new THREE.Group(), mHolder = new THREE.Group();   // pivote + M centrada/escalada
mGroup.add(mHolder); scene.add(mGroup);
const endGroup = new THREE.Group(), endHolder = new THREE.Group();
endGroup.add(endHolder); endGroup.visible = false; scene.add(endGroup);
const mirror = new THREE.Group();
mirror.scale.y = -1;
scene.add(mirror);
const mirrorHolder = new THREE.Group(), mirrorPivot = new THREE.Group();
mirrorPivot.add(mirrorHolder); mirror.add(mirrorPivot);
const mGeos = [];

async function buildM() {
  const svgText = await (await fetch("../assets/logos/mv-design-mark-color.svg")).text();
  const data = new SVGLoader().parse(svgText);
  const box = new THREE.Box3();
  data.paths.forEach((path, i) => {
    const geo = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth: 34, bevelEnabled: true, bevelThickness: 9, bevelSize: 6.5, bevelOffset: 0,
      bevelSegments: mobile ? 6 : 14, curveSegments: mobile ? 32 : 72
    });
    geo.translate(0, 0, Z_OFF[i] || 0);
    paintGradient(geo, GRADS[Math.min(i, GRADS.length - 1)]);
    geo.computeVertexNormals();
    mGeos.push(geo);
    mHolder.add(new THREE.Mesh(geo, mMaterial));
    endHolder.add(new THREE.Mesh(geo, endMat));
    mirrorHolder.add(new THREE.Mesh(geo, mirrorMat));
    geo.computeBoundingBox(); box.union(geo.boundingBox);
  });
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const s = 2.7 / size.x;                       // ~2.7 m de ancho
  for (const h of [mHolder, endHolder, mirrorHolder]) {
    h.scale.set(s, -s, s);                      // el SVG tiene la Y hacia abajo
    h.position.set(-center.x * s, center.y * s, -center.z * s);
  }
  M_BASE_Y = size.y * s / 2 + 0.08;             // parada sobre el piso
  buildParticles(mHolder);
}

/* ---------- Anillos de luz (el eclipse y el túnel) ---------- */
const ringGeo = new THREE.PlaneGeometry(7.2, 7.2);
const ringTime = { value: 0 };
function makeRing(off = 0, glow = 1) {
  return new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: ringTime, uDim: { value: 1 }, uOff: { value: off }, uGlow: { value: glow } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform float uTime; uniform float uDim; uniform float uOff; uniform float uGlow; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - .5) * 2.;                 // el plano mide 7.2: radio del anillo ≈ 2.3
        float r = length(p);
        // degradado de marca que gira despacio: morado → índigo → azul → cian
        float g = fract(atan(p.y, p.x) / 6.2831853 + .5 + uTime * .015 + uOff);
        g = g < .5 ? g * 2. : (1. - g) * 2.;      // ida y vuelta, sin costura
        vec3 c = mix(vec3(.62,.26,.72), vec3(.38,.36,.85), smoothstep(0., .33, g));
        c = mix(c, vec3(.28,.57,.85), smoothstep(.33, .66, g));
        c = mix(c, vec3(.17,.8,.85), smoothstep(.66, 1., g));
        float R = .64;
        float ring = exp(-pow((r - R) / .012, 2.));            // filo de luz
        float halo = exp(-pow((r - R) / .09, 2.)) * .35;        // resplandor corto
        float corona = exp(-max(r - R, 0.) * 5.) * step(R, r) * .18;
        float inner = smoothstep(R, R - .5, r) * .05;           // velo tenue adentro
        float fade = smoothstep(1., .82, r);
        gl_FragColor = vec4((c * (ring * 2.2 + (halo + corona + inner) * uGlow)) * fade * uDim, 1.);
      }`
  }));
}
const RING_Y = 1.9;
const sun = makeRing(0);                 // el eclipse detrás de la M
sun.position.set(0, RING_Y, -4.2);
scene.add(sun);
const sunMirror = makeRing(0);           // su reflejo
sunMirror.position.set(0, RING_Y, -4.2);
mirror.add(sunMirror);
const tunnel = [];
for (let i = 1; i <= 5; i++) {
  const r = makeRing(i * 0.13, 0.3);
  r.position.set(0, RING_Y, -4.2 - 3.6 * i);
  r.scale.setScalar(1 + i * 0.04);
  scene.add(r); tunnel.push(r);
}
const endRing = makeRing(0.5);
endRing.position.set(0, RING_Y, END_Z - 4.2);
scene.add(endRing);

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
beam.position.set(0, 4.6, -0.2);
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

/* ---------- Partículas de marca: nacen de la superficie de la M ---------- */
const PU = {
  uTime: { value: 0 }, uPx: { value: DPR * (mobile ? 0.7 : 1) }, uA: { value: 0 }, uB: { value: 0 }, uC: { value: 0 }, uRingZ: { value: -4.2 },
  uStart: { value: new THREE.Vector3() }, uEnd: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector2(0, 1.9) }
};
let particles = null;
function buildParticles(holder) {
  const N = mobile ? 7000 : 18000;
  holder.updateMatrix();
  const samplers = mGeos.map((g) => new MeshSurfaceSampler(new THREE.Mesh(g)).build());
  const areas = samplers.map((s) => s.distribution[s.distribution.length - 1]);
  const total = areas.reduce((a, b) => a + b, 0);
  const aM = new Float32Array(N * 3), aCloud = new Float32Array(N * 3), aRnd = new Float32Array(N * 3), aTor = new Float32Array(N * 3);
  const aCol = new Float32Array(N * 3), aSeed = new Float32Array(N);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  let k = 0;
  samplers.forEach((smp, si) => {
    const count = si === samplers.length - 1 ? N - k : Math.round(N * areas[si] / total);
    for (let j = 0; j < count && k < N; j++, k++) {
      smp.sample(p, n, c);
      p.applyMatrix4(holder.matrix);            // a coordenadas de la M (relativas a su pivote)
      aM.set([p.x, p.y, p.z], k * 3);
      aCol.set([c.r, c.g, c.b], k * 3);
      // nube: tres brazos en hélice alrededor del eje del túnel (al cruzarlo se ven como corrientes)
      const z = -1 - Math.pow(Math.random(), 1.2) * 50;
      const arm = (k % 3) * (Math.PI * 2 / 3);
      const spread = Math.pow(Math.random(), 2) * (Math.random() < .5 ? -1 : 1);
      const th = arm + z * 0.22 + spread * 0.9;
      const rad = 2.5 + Math.pow(Math.random(), 1.6) * 3.8 + Math.abs(spread) * 0.8;
      aCloud.set([th, rad, z], k * 3);
      // anillo de acreción: orbitan alrededor del eclipse (escena 02)
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // casi gaussiano
      aTor.set([Math.random() * Math.PI * 2, 2.85 + g * 0.55 + (Math.random() < .06 ? Math.random() * 2.5 : 0), g * 0.35], k * 3);
      aRnd.set([(Math.random() - .5) * 2, (Math.random() - .2) * 1.6, (Math.random() - .5) * 2], k * 3);
      aSeed[k] = Math.random();
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(aM, 3));
  g.setAttribute("aCloud", new THREE.BufferAttribute(aCloud, 3));
  g.setAttribute("aTor", new THREE.BufferAttribute(aTor, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(aRnd, 3));
  g.setAttribute("aCol", new THREE.BufferAttribute(aCol, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
  particles = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: PU,
    vertexShader: `
      uniform float uTime, uPx, uA, uB, uC, uRingZ; uniform vec3 uStart, uEnd; uniform vec2 uAxis;
      attribute vec3 aCloud, aRnd, aCol, aTor; attribute float aSeed;
      varying vec3 vC; varying float vAl;
      void main(){
        float eA = smoothstep(0., 1., clamp(uA * 1.6 - aSeed * .6, 0., 1.));
        float eB = smoothstep(0., 1., clamp(uB * 1.6 - (1. - aSeed) * .6, 0., 1.));
        float eC = smoothstep(0., 1., clamp(uC * 1.5 - aSeed * .5, 0., 1.));
        float tt = aTor.x + uTime * (.9 / (aTor.y * aTor.y)) * 1.6;       // órbita: más rápido cerca del anillo
        vec3 tor = vec3(uAxis.x + cos(tt) * aTor.y, uAxis.y + sin(tt) * aTor.y, uRingZ + aTor.z);
        float th = aCloud.x + uTime * (.035 + aSeed * .05);
        vec3 helix = vec3(uAxis.x + cos(th) * aCloud.y, uAxis.y + sin(th) * aCloud.y * .9, aCloud.z);
        vec3 cloud = mix(tor, helix, eC) + aRnd * sin(eC * 3.14159) * .8;
        vec3 p = mix(position + uStart, cloud, eA) + aRnd * sin(eA * 3.14159) * 1.5;
        p = mix(p, position + uEnd, eB) + aRnd * sin(eB * 3.14159) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = clamp((1.2 + aSeed * 2.4) * uPx * (15. / -mv.z), 1., 30.);
        float tw = .65 + .35 * sin(uTime * 2.2 + aSeed * 60.);
        vAl = smoothstep(0., .12, eA) * (1. - smoothstep(.85, 1., eB)) * tw * smoothstep(.4, 1.8, -mv.z);
        vC = mix(aCol, vec3(1.), .06) * 1.9;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vAl;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .05, d);
        gl_FragColor = vec4(vC * a * vAl, 1.); }`
  }));
  particles.frustumCulled = false;
  scene.add(particles);
}

/* ---------- Casos: carrusel 3D con los proyectos reales ---------- */
const CASES = [
  { img: "../assets/img/case-gu-poster.jpg", name: "GU · Gestión Urbanística", sector: "Inmobiliario · Urbanismo", chip: "Web 3D inmersiva" },
  { img: "../assets/img/case-vistareal.jpg", name: "Vista Real Country Club", sector: "Club deportivo · Hospitalidad", chip: "Web institucional" },
  { img: "../assets/img/case-blak.jpg", name: "Blak Coffee & Co", sector: "Cafetería", chip: "Branding integral" },
  { img: "../assets/img/case-protect.jpg", name: "Protect Diversity", sector: "Dermocosmética vegana", chip: "E-commerce · Shopify" },
  { img: "../assets/img/case-manzzani.jpg", name: "Manzzani", sector: "Manzanas gourmet", chip: "Shopify + redes" }
];
const carousel = new THREE.Group();
scene.add(carousel);
const cards = [];
const CARD_AR = 1.55;
CASES.forEach(() => {
  const u = {
    uMap: { value: null }, uCover: { value: new THREE.Vector2(1, 1) }, uSize: { value: new THREE.Vector2(CARD_AR, 1) },
    uOpacity: { value: 0 }, uActive: { value: 0 }, uTime: ringTime
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 16), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: u,
    vertexShader: `
      uniform float uActive; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        p.z += (1. - uActive) * -.08 * cos((uv.x - .5) * 3.14159);   // se curva un poco al alejarse
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec2 uCover; uniform vec2 uSize; uniform float uOpacity; uniform float uActive; uniform float uTime;
      varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
      void main(){
        vec2 p = (vUv - .5) * uSize;
        float d = sdRound(p, uSize * .5, .06);
        float a = smoothstep(.004, -.004, d);
        vec3 c = texture2D(uMap, (vUv - .5) * uCover + .5).rgb;
        c *= mix(.32, 1.45, uActive);
        // filo con el degradado de marca en la tarjeta al frente
        vec3 bc = mix(vec3(.62,.26,.72), vec3(.17,.8,.85), clamp(vUv.x * .8 + vUv.y * .2 + sin(uTime * .6) * .1, 0., 1.));
        float edge = smoothstep(.012, 0., abs(d + .004));
        c = mix(c, bc * 2.2, edge * (.35 + .65 * uActive));
        gl_FragColor = vec4(c, a * uOpacity);
      }`
  }));
  mesh.userData.u = u;
  carousel.add(mesh); cards.push(mesh);
});
let texturesAsked = false;
function loadCaseTextures() {
  if (texturesAsked) return; texturesAsked = true;
  const loader = new THREE.TextureLoader();
  cards.forEach((m, i) => loader.load(CASES[i].img, (tx) => {
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const ia = tx.image.width / tx.image.height;
    m.userData.u.uCover.value.set(Math.min(1, CARD_AR / ia), Math.min(1, ia / CARD_AR));
    m.userData.u.uMap.value = tx;
  }));
}

/* ---------- Posproceso ---------- */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, {
  type: THREE.HalfFloatType,
  // MSAA sólo si el equipo puede pintar en half-float (si no, el búfer queda incompleto y la pantalla en negro)
  samples: renderer.extensions.has("EXT_color_buffer_float") ? (mobile ? 2 : 4) : 0
}));
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), mobile ? 0.35 : 0.42, 0.7, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const BASE_CA = mobile ? 0.0012 : 0.0018;
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

/* ---------- Recorrido de cámara: un punto clave por escena ---------- */
let M_X = 1.7, portrait = false, BASE_FOV = 28;
let posCurve, lookCurve;
const C = new THREE.Vector3();   // centro del carrusel
let CAR_R = 3, CARD_W = 2.5;
function buildPath() {
  const X = M_X, E = END_Z;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let pos, look;
  if (portrait) {
    pos = [V(0, 1.55, 11.5), V(0, 2.1, 13.5), V(0, 1.9, -9.5), V(0, 2.2, -23), V(0, 1.9, E + 14.5)];
    look = [V(0, 1.05, 0), V(0, 0.7, -4.2), V(0, 1.6, -24), V(0, 1.55, -33), V(0, -0.35, E)];
    C.set(0, 2.55, -33.5); CAR_R = 2.5; CARD_W = 2.0;
  } else {
    pos = [V(0, 1.55, 10.2), V(-1.0, 2.1, 10.2), V(X, 1.9, -9.5), V(X - 0.9, 1.95, -24), V(0, 1.55, E + 10.2)];
    look = [V(0.35, 1.45, 0), V(X - 0.9, 1.9, -4.2), V(X - 1.2, 1.9, -24), V(X - 0.5, 1.85, -33), V(0.35, 1.45, E)];
    C.set(X + 0.45, 1.85, -33.5); CAR_R = 3.0; CARD_W = 2.5;
  }
  posCurve = new THREE.CatmullRomCurve3(pos, false, "centripetal");
  lookCurve = new THREE.CatmullRomCurve3(look, false, "centripetal");
  // todo lo que vive sobre el eje del túnel sigue a M_X
  sun.position.x = sunMirror.position.x = endRing.position.x = X;
  tunnel.forEach((r) => { r.position.x = X; });
  beam.position.x = X - 0.35;
  PU.uAxis.value.set(X, RING_Y);
  carousel.position.copy(C);
  cards.forEach((m, i) => {
    const th = i / CASES.length * Math.PI * 2;
    m.position.set(Math.sin(th) * CAR_R, 0, Math.cos(th) * CAR_R);
    m.rotation.y = th;
    m.scale.set(CARD_W, CARD_W / CARD_AR, 1);
  });
}

function resize() {
  const w = innerWidth, h = innerHeight;
  portrait = w / h < 0.8;
  camera.aspect = w / h;
  BASE_FOV = portrait ? 40 : 28;
  M_X = portrait ? 0 : (w / h < 1.3 ? 0.95 : 1.7);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
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
  PU.uPx.value = v * (mobile ? 0.7 : 1);
  dust.material.uniforms.uPx.value = v;
}
// mide ~45 cuadros a la vez; baja la resolución si va lento, la sube si sobra
let perfAcc = 0, perfN = 0, perfSkip = 90;
function adaptDpr(raw) {
  if (perfSkip > 0) { perfSkip--; return; }           // ignora la compilación inicial
  if (raw > 0.25) return;                              // pestaña en segundo plano
  perfAcc += raw; perfN++;
  if (perfN < 45) return;
  const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
  if (avg > 0.021 && DPR > 0.7) { applyDpr(Math.max(0.7, DPR * 0.85)); perfSkip = 20; }
  else if (avg < 0.0135 && DPR < DPR_MAX) { applyDpr(Math.min(DPR_MAX, DPR * 1.1)); perfSkip = 20; }
}

/* ---------- Navegación: rueda, touch, teclado e índice ---------- */
let target = 0, prog = 0, lastInput = 0, dir = 1;
const nudge = (d) => {
  if (!d) return;
  dir = Math.sign(d);
  target = clamp(target + clamp(d, -0.3, 0.3), 0, LAST);
  lastInput = performance.now();
};
const go = (i) => { target = clamp(i, 0, LAST); lastInput = 0; };
addEventListener("wheel", (e) => {
  e.preventDefault();
  let d = e.deltaY; if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= innerHeight;
  nudge(d * 0.0014);
}, { passive: false });
let ty = null;
addEventListener("touchstart", (e) => { ty = e.touches[0].clientY; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (ty === null) return;
  const y = e.touches[0].clientY;
  nudge((ty - y) / innerHeight * 2.4); ty = y;
}, { passive: true });
addEventListener("touchend", () => { ty = null; if (lastInput) lastInput = performance.now() - 200; }, { passive: true });
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  const now = Math.round(target);
  if (["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) { e.preventDefault(); go(now + 1); }
  else if (["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) { e.preventDefault(); go(now - 1); }
  else if (e.key === "Home") { e.preventDefault(); go(0); }
  else if (e.key === "End") { e.preventDefault(); go(LAST); }
});
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));

/* ---------- Capa de texto (HTML real: SEO y lectores de pantalla) ---------- */
const sections = [...document.querySelectorAll(".scene[data-scene]")];
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
function setActive(a) {
  if (a === active) return;
  active = a;
  document.body.dataset.scene = a;
  sections.forEach((s, i) => { s.classList.toggle("is-active", i === a); s.inert = i !== a; });
  idxBtns.forEach((b, i) => { if (i === a) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
  if (noteEl) noteEl.innerHTML = NOTES[a];
  if (a === 3) loadCaseTextures();
}

// carrusel: avanza solo cada 3.4 s y con las flechas del pie de foto
let caseIdx = 0, caseTurn = 0, caseTimer = 0;
const capName = document.querySelector("[data-case-name]");
const capSector = document.querySelector("[data-case-sector]");
const capChip = document.querySelector("[data-case-chip]");
const capCount = document.querySelector("[data-case-count]");
function showCase(i) {
  const n = CASES.length, half = Math.floor(n / 2);
  const next = ((i % n) + n) % n;
  caseTurn += ((next - caseIdx + n + half) % n) - half;   // gira por el camino corto
  caseIdx = next; caseTimer = 0;
  const cs = CASES[next];
  if (capName) capName.textContent = cs.name;
  if (capSector) capSector.textContent = cs.sector;
  if (capChip) capChip.textContent = cs.chip;
  if (capCount) capCount.textContent = String(next + 1).padStart(2, "0") + " / " + String(n).padStart(2, "0");
}
document.querySelector("[data-case-prev]")?.addEventListener("click", () => showCase(caseIdx - 1));
document.querySelector("[data-case-next]")?.addEventListener("click", () => showCase(caseIdx + 1));
showCase(0);

/* ---------- Loop ---------- */
const mouse = new THREE.Vector2(), smooth = new THREE.Vector2();
addEventListener("pointermove", (e) => { mouse.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); }, { passive: true });
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
let t0 = null, lastT = 0, vel = 0, carRot = 0;

function frame() {
  const t = clock.getElapsedTime();
  if (t0 === null) { t0 = t; lastT = t; }
  const raw = t - lastT, dt = Math.min(0.05, raw); lastT = t;
  adaptDpr(raw);
  const intro = reduced ? 1 : Math.min(1, (t - t0) / 4.2);
  const k = easeOut(intro);
  smooth.lerp(mouse, 0.04);

  // encaje: al soltar, se asienta en la escena hacia donde ibas
  if (lastInput && performance.now() - lastInput > 380) {
    target = dir > 0 ? Math.ceil(target - 0.18) : Math.floor(target + 0.18);
    target = clamp(target, 0, LAST); lastInput = 0;
  }
  const prev = prog;
  prog = reduced ? target : prog + (target - prog) * (1 - Math.exp(-dt * 2.6));
  if (Math.abs(target - prog) < 1e-4) prog = target;
  vel = THREE.MathUtils.lerp(vel, dt > 0 ? (prog - prev) / dt : 0, 0.2);
  const p = prog;
  setActive(Math.round(p));
  if (progEl) progEl.style.transform = `scaleX(${p / LAST})`;

  // cámara sobre la curva + entrada en dolly + deriva con el cursor
  posCurve.getPoint(p / LAST, camPos);
  lookCurve.getPoint(p / LAST, camLook);
  const heroW = 1 - sm(0, 0.6, p);
  const endW = sm(3.4, 4, p);
  const orbit = reduced ? 0 : (Math.sin(t * 0.11) * 0.28 + smooth.x * 0.22) * Math.max(heroW, endW);
  if (orbit) {  // orbita alrededor del punto que mira (sólo en la firma y en el contacto)
    tmp.copy(camPos).sub(camLook);
    tmp.applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit);
    camPos.copy(camLook).add(tmp);
  }
  if (heroW > 0 && k < 1) {
    tmp.copy(camPos).sub(camLook).normalize().multiplyScalar((19 - 10.2) * (1 - k) * heroW);
    camPos.add(tmp); camPos.y += (1 - k) * 1.05 * heroW;
  }
  if (!reduced) { camPos.x += smooth.x * 0.12 * (1 - heroW); camPos.y -= smooth.y * 0.2; }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const kick = reduced ? 0 : Math.min(Math.abs(vel), 2.5);
  camera.fov = BASE_FOV + kick * 2.2;
  camera.updateProjectionMatrix();
  finalPass.uniforms.uCA.value = BASE_CA + kick * 0.0032;

  // 01 → 02: la M se disuelve y sus partículas se van al túnel; el estudio se apaga
  dStart.value = sm(0.08, 0.75, p);
  mGroup.visible = dStart.value < 0.999;
  const studio = 1 - sm(0.2, 0.9, p);
  floor.material.opacity = FLOOR_OPACITY * studio; floor.visible = studio > 0.001;
  mirror.visible = studio > 0.001 && mGroup.visible;
  beam.material.uniforms.uDim.value = studio; beam.visible = studio > 0.001;
  horizon.material.uniforms.uDim.value = studio; horizon.visible = studio > 0.001;
  dust.material.uniforms.uDim.value = studio; dust.visible = studio > 0.001;
  mGroup.rotation.y = reduced ? 0 : Math.sin(t * 0.23) * 0.22 + smooth.x * 0.12;
  mGroup.position.set(M_X, M_BASE_Y + (reduced ? 0 : Math.sin(t * 0.6) * 0.035), 0);
  mirrorPivot.position.copy(mGroup.position); mirrorPivot.rotation.copy(mGroup.rotation);

  // 04 → 05: las partículas vuelven y forman la M del final
  PU.uA.value = sm(0.05, 1.35, p);
  PU.uB.value = sm(3.25, 3.97, p);
  PU.uC.value = sm(1.15, 2.1, p);
  PU.uTime.value = reduced ? 0 : t;
  PU.uStart.value.copy(mGroup.position);
  PU.uEnd.value.set(M_X, M_BASE_Y, END_Z);
  if (particles) particles.visible = p > 0.02 && PU.uB.value < 0.999;
  dEnd.value = 1 - sm(3.55, 4, p);
  endGroup.visible = dEnd.value < 0.999;
  endGroup.position.set(M_X, M_BASE_Y + (reduced ? 0 : Math.sin(t * 0.6) * 0.035), END_Z);
  endGroup.rotation.y = reduced ? 0 : Math.sin(t * 0.23) * 0.22 + smooth.x * 0.12;
  floorEnd.material.opacity = FLOOR_OPACITY * sm(3.4, 4, p); floorEnd.visible = p > 3.35;

  // anillos: se encienden al acercarse y se apagan al cruzarlos
  const ringDim = (r, gate) => {
    const ahead = camera.position.z - r.position.z;
    r.material.uniforms.uDim.value = gate * sm(0.2, 2.6, ahead) * (1 - sm(20, 34, ahead));
    r.visible = r.material.uniforms.uDim.value > 0.001;
  };
  ringDim(sun, 1);
  sunMirror.material.uniforms.uDim.value = 0.3 * studio; sunMirror.visible = studio > 0.001;
  tunnel.forEach((r) => ringDim(r, 0.6 * sm(1.25, 1.9, p)));
  ringDim(endRing, sm(3.1, 3.8, p));
  ringTime.value = t;

  // carrusel de casos
  const carVis = sm(2.3, 2.85, p) * (1 - sm(3.3, 3.7, p));
  carousel.visible = carVis > 0.001;
  if (active === 3 && !reduced) { caseTimer += dt; if (caseTimer > 3.4) showCase(caseIdx + 1); }
  const carTarget = -caseTurn / CASES.length * Math.PI * 2;
  carRot += (carTarget - carRot) * (1 - Math.exp(-dt * (reduced ? 60 : 3.2)));
  carousel.rotation.y = carRot + (1 - carVis) * 0.9;
  carousel.scale.setScalar(0.82 + 0.18 * carVis);
  cards.forEach((m) => {
    const u = m.userData.u;
    let a = m.rotation.y + carousel.rotation.y;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    u.uActive.value = 1 - sm(0, 0.9, Math.abs(a));
    u.uOpacity.value = carVis * (u.uMap.value ? 1 : 0) * (0.45 + 0.55 * u.uActive.value);
  });

  // el rig de luces se muda a la M del final mientras nadie lo ve (entre servicios y casos)
  rig.position.z = p > 2.5 ? END_Z : 0;
  const lit = p > 2.5 ? sm(3.3, 4, p) : studio;
  rimPurple.intensity = (26 + Math.sin(t * 0.9) * 4) * lit;
  rimCyan.intensity = (24 + Math.cos(t * 0.8) * 4) * lit;
  beam.material.uniforms.uTime.value = t;
  dust.material.uniforms.uTime.value = reduced ? 0 : t;
  finalPass.uniforms.uTime.value = t;

  composer.render();
  requestAnimationFrame(frame);
}

// para pruebas: ?debug expone el mundo en la consola
if (/[?&]debug\b/.test(location.search)) window.__lab = { THREE, get dpr() { return DPR; }, renderer, scene, composer, bloom, finalPass, mMaterial, endMat, mirror, tunnel, cards, get particles() { return particles; } };
// para pruebas: ?s=3 abre directo en una escena
const qsScene = new URLSearchParams(location.search).get("s");
if (qsScene !== null) { target = prog = clamp(+qsScene || 0, 0, LAST); }

buildM().then(() => {
  requestAnimationFrame(() => { curtain.classList.add("is-off"); });
  frame();
  setTimeout(loadCaseTextures, 2500);
}).catch((err) => { console.error(err); curtain.classList.add("is-off"); });
