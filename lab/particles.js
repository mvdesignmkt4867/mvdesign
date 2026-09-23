/* ============================================================
   MV Design · Lab — partículas de marca con física en GPU
   Cada partícula tiene posición y velocidad reales (GPGPU):
   un resorte la lleva a su destino (la M, el anillo de acreción,
   la hélice del túnel o la M del final), un campo de flujo sin
   divergencia le da corrientes, y el cursor la empuja y la hace
   girar; al soltarla regresa con inercia.
   Render: núcleo nítido + halo, profundidad de campo (bokeh),
   las rápidas se encienden y hay destellos ocasionales.
   Si el equipo no puede simular en GPU, cae a un modo sin física
   (mismos destinos calculados en el vertex shader).
   ============================================================ */
import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

/* Destinos por estado. u = coordenada de la partícula en las texturas de datos */
const TARGET_GLSL = /* glsl */ `
uniform sampler2D tHome, tRing, tHelix;
uniform float uTime, uA, uB, uC, uRot, uPlanet, uMScale, uRingS;
uniform vec3 uStart, uEnd; uniform vec2 uAxis; uniform float uRingZ;
uniform vec4 uSpiral;  // espiral de rubros · x: altura del primer rubro, y: caída por rubro, z: radio, w: giro actual
uniform vec2 uSpiralK; // x: ángulo por rubro, y: cuántos rubros
float mvStag(float u, float s){ return smoothstep(0., 1., clamp(u * 1.6 - s * .6, 0., 1.)); }
vec3 mvRotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
// devuelve el destino; en w, cuánto "viaja" ahora (0 = asentada)
vec4 mvTarget(vec2 u){
  vec4 h = texture2D(tHome, u); float seed = h.w;
  vec3 mp = mvRotY(h.xyz * uMScale, uRot);
  vec4 rg = texture2D(tRing, u);
  float tt = rg.x + uTime * (1.45 / (rg.y * rg.y));                 // órbita: más rápido cerca del anillo
  vec3 ring = vec3(uAxis.x + cos(tt) * rg.y * uRingS, uAxis.y + sin(tt) * rg.y * uRingS, uRingZ + rg.z * uRingS);
  vec4 hx = texture2D(tHelix, u);
  float th = hx.x + uTime * (.035 + seed * .05);
  vec3 helix = vec3(uAxis.x + cos(th) * hx.y, uAxis.y + sin(th) * hx.y * .9, hx.z);
  float eA = mvStag(uA, seed), eC = mvStag(uC, rg.w), eB = mvStag(uB, 1. - seed);
  vec3 t = mix(mix(mix(mp + uStart, ring, eA), helix, eC), mp + uEnd, eB);
  // casos: TODAS forman la cinta de la espiral de rubros (por dentro de las fichas: no les pasan encima)
  // y giran con ella; al pasar al cierre se sueltan en cascada y arman la M al pie de la espiral
  float dsel = mvStag(uPlanet, fract(seed * 7.13)) * smoothstep(0., .25, uB);
  // posición a lo largo (la semilla, así llegan en orden), ancho y grosor de la cinta con azar independiente
  // (de la misma semilla saldrían líneas, no una banda)
  float along = fract(seed * 7.13) * (uSpiralK.y + .9) - .7;                  // en rubros: un poco antes del primero y después del último
  float sa = along * uSpiralK.x + uSpiral.w + sin(uTime * .15 + along) * .06 + (fract(rg.x * .15915) - .5) * .32;   // en fase con las fichas
  float sr = uSpiral.z * (.52 + .38 * rg.w);
  vec3 spiral = vec3(uEnd.x + sin(sa) * sr, uSpiral.x - along * uSpiral.y + rg.z * 1.7, uEnd.z + cos(sa) * sr);
  t = mix(t, spiral, dsel);
  float travel = sin(eA * 3.14159) + sin(eC * 3.14159) + sin(eB * 3.14159) + sin(dsel * 3.14159);
  return vec4(t, clamp(travel, 0., 1.));
}
`;

// campo de flujo sin divergencia (cada componente depende de las otras dos coordenadas)
const FLOW_GLSL = /* glsl */ `
vec3 mvFlow(vec3 p, float t){
  vec3 a = vec3(sin(p.y * 1.3 + t) + cos(p.z * 1.7 - t * .7),
                sin(p.z * 1.1 + t * .8) + cos(p.x * 1.5 + t * .6),
                sin(p.x * 1.2 - t * .9) + cos(p.y * 1.4 + t * .5));
  vec3 q = p * 2.3 + 4.1;
  vec3 b = vec3(sin(q.y + t * 1.3), sin(q.z - t * 1.1), sin(q.x + t * .9));
  return a + b * .5;
}
`;

// clic = explosión invisible: una onda sale del rayo del clic y se abre en la pantalla.
// La distancia se mide como ángulo (tangente) para que la onda se vea igual a cualquier profundidad.
// BLAST_N ranuras: cada clic toma la más vieja, así uno nuevo no corta una onda que todavía se ve.
// uBlastT = segundos desde cada clic; uBlastP = el valor del cuadro previo (al disparar vale -1: el impulso sale completo).
export const BLAST_N = 4;
export const BLAST_GLSL = /* glsl */ `
#define BLAST_N ${BLAST_N}
uniform vec3 uBlastO[BLAST_N]; uniform vec3 uBlastD[BLAST_N]; uniform float uBlastT[BLAST_N]; uniform float uBlastP[BLAST_N]; uniform float uBlastK;
const float BLAST_V = 1.15;                         // velocidad del frente (tangente por segundo)
vec3 mvJit(float s){ return vec3(fract(s * 91.7), fract(s * 47.3), fract(s * 13.1)) - .5; }
// impulso (velocidad) que recibe una partícula cuando el frente la cruza en este cuadro: no depende de los fps
vec3 mvBlastKick(vec3 p, float seed){
  vec3 kick = vec3(0.);
  for (int i = 0; i < BLAST_N; i++) {
    if (uBlastT[i] > 2.) continue;
    vec3 w = p - uBlastO[i]; float tr = dot(w, uBlastD[i]);
    if (tr < .3) continue;
    vec3 perp = w - uBlastD[i] * tr; float dp = length(perp);
    float a = dp / tr;
    float pass = smoothstep(a - .03, a + .03, uBlastT[i] * BLAST_V) - smoothstep(a - .03, a + .03, uBlastP[i] * BLAST_V);
    if (pass <= 0.) continue;
    vec3 jit = mvJit(seed);
    vec3 jp = jit - uBlastD[i] * dot(jit, uBlastD[i]);                        // desorden en el plano de la pantalla
    vec3 n = dp > 1e-3 ? perp / dp : normalize(jp + vec3(1e-3));
    // hacia afuera y de lado (se ven volar); casi nada en profundidad: si no, se desenfocan y "desaparecen"
    vec3 dir = normalize(n + jp * 1.2 + uBlastD[i] * jit.z * .3);
    float amp = tr * (.36 * exp(-pow(a / .085, 2.)) + .06 * exp(-a / .16));  // fuerte en la zona del clic, se apaga al alejarse
    amp *= .5 + fract(seed * 7.77) * 1.;                                     // unas salen más lejos que otras: esquirlas, no burbuja
    kick += dir * amp * pass;
  }
  return kick * uBlastK;
}
// desplazamiento sin estado (polvo de fondo): sube cuando pasa el frente y regresa a su lugar
vec3 mvBlastDisp(vec3 p, float seed, out float lit){
  vec3 disp = vec3(0.); lit = 0.;
  for (int i = 0; i < BLAST_N; i++) {
    if (uBlastT[i] > 2.) continue;
    vec3 w = p - uBlastO[i]; float tr = dot(w, uBlastD[i]);
    if (tr < .3) continue;
    vec3 perp = w - uBlastD[i] * tr; float dp = length(perp);
    float a = dp / tr;
    float tau = uBlastT[i] - a / BLAST_V;
    if (tau <= 0.) continue;
    float env = (tau / .14) * exp(1. - tau / .14);                           // pico a 0.14 s, casi en reposo al segundo
    float fall = exp(-pow(a / .2, 2.));
    vec3 jit = mvJit(seed);
    vec3 n = dp > 1e-3 ? perp / dp : normalize(jit + vec3(1e-3));
    disp += normalize(n + uBlastD[i] * .3 + jit * .5) * tr * .075 * fall * env;
    lit += env * fall;
  }
  return disp * uBlastK;
}
`;

const VEL_SHADER = /* glsl */ `
${TARGET_GLSL}
${FLOW_GLSL}
${BLAST_GLSL}
uniform float uDt, uIntro, uFlowAmt, uMouse, uMouseR, uMouseK, uSnap;
uniform vec3 uRayO, uRayD;
void main(){
  vec2 u = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, u).xyz;
  vec3 vel = texture2D(textureVelocity, u).xyz;
  if (uSnap > .5) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  vec4 tg = mvTarget(u);
  float seed = texture2D(tHome, u).w;
  float rel = smoothstep(0., 1., clamp(uIntro * 1.5 - seed * .5, 0., 1.));   // entrada: se sueltan en cascada
  float k = mix(1.5, 26., rel) * (1. - .55 * tg.w);                           // resorte (más flojo al viajar)
  vec3 acc = (tg.xyz - pos) * k;
  acc += mvFlow(pos * .55, uTime * .6) * uFlowAmt * (.07 + .2 * uPlanet + 1.5 * tg.w + (1. - rel) * 1.3);
  // cursor: empuja desde su rayo y hace girar alrededor de él
  vec3 w = pos - uRayO; float tr = dot(w, uRayD);
  vec3 dv = w - uRayD * tr; float dist = length(dv);
  float fm = uMouse * smoothstep(uMouseR * uMouseK, 0., dist) * step(0., tr);
  vec3 dn = dv / max(dist, 1e-3);
  acc += dn * fm * 30. + cross(uRayD, dn) * fm * 11.;
  vel += acc * uDt;
  vel *= exp(-uDt * mix(3.2, 7.2, rel));                                     // amortiguado: un poco de rebote
  // clic: se dispersan y el resorte las regresa. Se mide desde su lugar de reposo: un solo impulso, igual a 60 o 120 Hz
  vel += mvBlastKick(mix(pos, tg.xyz, 1. - tg.w), seed) * rel;
  gl_FragColor = vec4(vel, 1.);
}
`;

const POS_SHADER = /* glsl */ `
${TARGET_GLSL}
uniform float uDt, uSnap;
void main(){
  vec2 u = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, u);
  if (uSnap > .5) { gl_FragColor = vec4(mvTarget(u).xyz, 1.); return; }       // sin movimiento: directo al destino
  vec3 v = texture2D(textureVelocity, u).xyz;
  gl_FragColor = vec4(p.xyz + v * uDt, 1.);
}
`;

const RENDER_VERT = /* glsl */ `
${BLAST_GLSL}
uniform sampler2D tPos, tVel;
uniform float uPx, uFocus, uAperture, uMirror, uAlpha, uReflect, uSim, uFloorY;
uniform vec3 uRayO, uRayD; uniform float uMouse, uMouseK;
attribute vec2 aRef; attribute vec3 aCol; attribute float aSeed;
varying vec3 vC; varying float vA; varying float vCoc;
${TARGET_GLSL}
void main(){
  vec3 p; vec3 v = vec3(0.);
  if (uSim > .5) { p = texture2D(tPos, aRef).xyz; v = texture2D(tVel, aRef).xyz; }
  else { p = mvTarget(aRef).xyz; }
  float sp = length(v);
  // luz del cursor: las cercanas a su rayo se encienden
  vec3 w = p - uRayO; float tr = dot(w, uRayD);
  float near = uMouse * smoothstep(.45 * uMouseK, 0., length(w - uRayD * tr)) * step(0., tr);
  float blastLit; mvBlastDisp(p, aSeed, blastLit);                              // (antes de reflejar: la onda vive en el mundo)
  if (uMirror > .5) p.y = 2. * uFloorY - p.y;                                  // espejo sobre el piso de la escena
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float z = -mv.z;
  float coc = clamp(abs(z - uFocus) * uAperture, 0., 1.);                     // profundidad de campo
  vec4 rgs = texture2D(tRing, aRef);
  float calm = mvStag(uC, rgs.w) * (1. - mvStag(uB, 1. - aSeed));             // 1 = viajando por el túnel
  float base = (.95 + aSeed * 1.6) * uPx * (16. / max(z, .1)) * mix(1., .6, calm);   // partículas finas
  gl_PointSize = clamp(base * (1. + coc * .9), 1., 16.) * smoothstep(.8, 2.2, z);   // sin discos gigantes
  gl_PointSize *= 1. + .15 * max(1. - mvStag(uA, aSeed), mvStag(uB, 1. - aSeed));    // la M armada, más llena
  float asmW = max(1. - mvStag(uA, aSeed), mvStag(uB, 1. - aSeed));            // 1 = forma la M
  float tw = mix(.72 + .28 * sin(uTime * (1.3 + aSeed * 2.1) + aSeed * 50.), 1., asmW * .75);
  vA = tw / (1. + coc * coc * 5.) * smoothstep(1., 3.5, z) * uAlpha * mix(1., .55, calm);
  if (uMirror > .5) vA *= .7 * smoothstep(-1.8, 0., p.y - uFloorY) * uReflect;
  blastLit = min(blastLit, 1.);
  vA *= 1. + blastLit * .35;                                                    // la onda del clic: crecen y brillan un poco al pasar
  gl_PointSize *= 1. + blastLit * .7;                                           // (más tamaño que brillo: el color de marca no se satura)
  vC = aCol * (mix(1.5, 1.3, asmW) + near * .3);                                // siempre su color de marca, nunca blanco
  vCoc = coc;
  gl_Position = projectionMatrix * mv;
}
`;
const RENDER_FRAG = /* glsl */ `
varying vec3 vC; varying float vA; varying float vCoc;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  if (d > 1.) discard;
  float core = exp(-d * d * mix(6.5, 2.4, vCoc));                             // nítida → bokeh
  float rim = 0.;
  float k = (core + rim) * vA;
  if (k < .015) discard;
  gl_FragColor = vec4(vC * k, 1. - .5 * smoothstep(.03, .3, k));   // .5 = color exacto; se funde suave con la escena
}
`;

// ¿el punto (x, y) cae dentro del polígono o a menos de `margin` de su borde? (coordenadas del SVG)
function nearPoly(x, y, poly, margin) {
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L));
    best = Math.min(best, Math.hypot(a.x + dx * u - x, a.y + dy * u - y));
  }
  return inside || best < margin;
}

export function createParticles({ renderer, geos, holderMatrix, mobile, reduced, exclude = [], blast = {} }) {
  const W = mobile ? 136 : 210, N = W * W;

  /* --- muestreo sobre la superficie de la M (menos en la cara trasera: silueta más nítida) --- */
  const samplers = geos.map((g) => new MeshSurfaceSampler(new THREE.Mesh(g)).build());
  const areas = samplers.map((s) => s.distribution[s.distribution.length - 1]);
  const total = areas.reduce((a, b) => a + b, 0);
  const home = new Float32Array(N * 4), ring = new Float32Array(N * 4), helix = new Float32Array(N * 4);
  const col = new Float32Array(N * 3), seeds = new Float32Array(N), refs = new Float32Array(N * 2);
  const start = new Float32Array(N * 4);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  let k = 0;
  samplers.forEach((smp, si) => {
    const count = si === samplers.length - 1 ? N - k : Math.round(N * areas[si] / total);
    for (let j = 0; j < count && k < N; j++, k++) {
      const ex = exclude.filter((e) => e.geo === si);
      for (let tries = 0; tries < 60; tries++) {
        smp.sample(p, n, c);
        if (n.z < -0.5 && Math.random() < 0.65) continue;                     // menos cara trasera
        if (ex.some((e) => nearPoly(p.x, p.y, e.poly, e.margin))) continue;   // tapado por otra pieza
        break;
      }
      p.applyMatrix4(holderMatrix);
      const seed = Math.random();
      home.set([p.x, p.y, p.z, seed], k * 4);
      col.set([c.r, c.g, c.b], k * 3);
      seeds[k] = seed;
      refs.set([(k % W + 0.5) / W, (Math.floor(k / W) + 0.5) / W], k * 2);
      // anillo de acreción ceñido al eclipse (así cabe en pantalla con el manifiesto adentro)
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      ring.set([Math.random() * Math.PI * 2, 2.62 + g * 0.38 + (Math.random() < .06 ? Math.random() * 2 : 0), g * 0.3, Math.random()], k * 4);
      // hélice de tres brazos a lo largo del túnel
      const z = Math.random() < 0.86 ? -8 - Math.random() * 29 : -37.5 - Math.random() * 22;   // dentro del túnel (más ancho y largo)
      const spread = Math.pow(Math.random(), 2) * (Math.random() < .5 ? -1 : 1);
      helix.set([(k % 3) * (Math.PI * 2 / 3) + z * 0.2 + spread * 0.9, 3.4 + Math.pow(Math.random(), 1.6) * 4.4 + Math.abs(spread) * 0.9, z, 0], k * 4);
      // nube de la entrada: la M se arma desde aquí
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), rad = 4.2 + Math.random() * 5.8;
      start.set([Math.sin(ph) * Math.cos(th) * rad * 1.2, Math.cos(ph) * rad * 0.55 + 1.9, Math.sin(ph) * Math.sin(th) * rad * 0.7 - 3.5, 1], k * 4);
    }
  });
  const dataTex = (arr) => {
    const t = new THREE.DataTexture(arr, W, W, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
  };
  const tHome = dataTex(home), tRing = dataTex(ring), tHelix = dataTex(helix);

  const shared = {
    tHome: { value: tHome }, tRing: { value: tRing }, tHelix: { value: tHelix },
    uTime: { value: 0 }, uA: { value: 0 }, uB: { value: 0 }, uC: { value: 0 }, uRot: { value: 0 },
    uStart: { value: new THREE.Vector3() }, uEnd: { value: new THREE.Vector3() },
    uPlanet: { value: 0 }, uSpiral: { value: new THREE.Vector4(1.9, 2, 3, 0) }, uSpiralK: { value: new THREE.Vector2(Math.PI / 3, 6) },
    uMScale: { value: 1 }, uRingS: { value: 1 }, uMouseK: { value: 1 },
    uAxis: { value: new THREE.Vector2(0, 1.9) }, uRingZ: { value: -4.2 },
    uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouse: { value: 0 },
    ...blast                                           // la onda del clic: los mismos uniforms que el polvo de fondo
  };

  /* --- simulación en GPU --- */
  let gpu = null, posVar = null, velVar = null;
  const canFloat = renderer.extensions.has("EXT_color_buffer_float");
  const canHalf = canFloat || renderer.extensions.has("EXT_color_buffer_half_float");
  if (canHalf) {
    try {
      gpu = new GPUComputationRenderer(W, W, renderer);
      if (!canFloat) gpu.setDataType(THREE.HalfFloatType);
      const pos0 = gpu.createTexture(), vel0 = gpu.createTexture();
      (reduced ? home : start).forEach((v, i) => { pos0.image.data[i] = v; });
      if (reduced) for (let i = 0; i < N; i++) pos0.image.data[i * 4 + 3] = 1;
      velVar = gpu.addVariable("textureVelocity", VEL_SHADER, vel0);
      posVar = gpu.addVariable("texturePosition", POS_SHADER, pos0);
      gpu.setVariableDependencies(velVar, [posVar, velVar]);
      gpu.setVariableDependencies(posVar, [posVar, velVar]);
      const sim = { uDt: { value: 0 }, uSnap: { value: reduced ? 1 : 0 } };
      Object.assign(velVar.material.uniforms, shared, sim, {
        uIntro: { value: 0 }, uFlowAmt: { value: reduced ? 0 : 1 }, uMouseR: { value: 0.3 }
      });
      Object.assign(posVar.material.uniforms, shared, sim);
      const err = gpu.init();
      if (err) throw new Error(err);
    } catch (e) {
      console.warn("Partículas sin simulación:", e.message);
      gpu = null;
    }
  }

  /* --- render --- */
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));   // no se usa: la posición viene de la textura
  geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2));
  geo.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const renderUniforms = (mirror) => Object.assign({}, shared, {
    tPos: { value: null }, tVel: { value: null }, uSim: { value: gpu ? 1 : 0 },
    uPx: { value: 1 }, uFocus: { value: 12 }, uAperture: { value: mobile ? 0.04 : 0.05 },
    uMirror: { value: mirror ? 1 : 0 }, uAlpha: { value: 1 }, uReflect: { value: 0 }, uFloorY: { value: 0 }
  });
  const mk = (mirror) => {
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      // la M: alfa = mínimo (las fichas guardan su 0); el reflejo bajo el piso no toca la máscara
      blendEquationAlpha: mirror ? THREE.AddEquation : THREE.MinEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: mirror ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: mirror ? THREE.OneFactor : THREE.OneFactor,
      uniforms: renderUniforms(mirror), vertexShader: RENDER_VERT, fragmentShader: RENDER_FRAG
    }));
    pts.frustumCulled = false;
    return pts;
  };
  const points = mk(false), reflection = mk(true);
  // la reflexión comparte el estado de la principal
  for (const key of ["uPx", "uFocus", "uAperture", "uAlpha", "tPos", "tVel"]) reflection.material.uniforms[key] = points.material.uniforms[key];

  let intro = reduced ? 1 : 0;
  return {
    points, reflection, simulated: !!gpu, count: N, shared,
    set px(v) { points.material.uniforms.uPx.value = v; },
    set focus(v) { points.material.uniforms.uFocus.value = v; },
    set reflect(v) { reflection.material.uniforms.uReflect.value = v; reflection.visible = v > 0.001; },   // sin piso: no se dibuja
    set floorY(v) { reflection.material.uniforms.uFloorY.value = v; },
    update(dt, t) {
      shared.uTime.value = t;
      if (!gpu) return;
      intro = Math.min(1, intro + dt / 2.6);
      velVar.material.uniforms.uIntro.value = intro;
      const sdt = Math.min(dt, 1 / 30);
      velVar.material.uniforms.uDt.value = posVar.material.uniforms.uDt.value = sdt;
      gpu.compute();
      points.material.uniforms.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
      points.material.uniforms.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    }
  };
}
