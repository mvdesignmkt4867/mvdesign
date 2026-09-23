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
uniform float uTime, uA, uB, uC, uRot;
uniform vec3 uStart, uEnd; uniform vec2 uAxis; uniform float uRingZ;
float mvStag(float u, float s){ return smoothstep(0., 1., clamp(u * 1.6 - s * .6, 0., 1.)); }
vec3 mvRotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
// devuelve el destino; en w, cuánto "viaja" ahora (0 = asentada)
vec4 mvTarget(vec2 u){
  vec4 h = texture2D(tHome, u); float seed = h.w;
  vec3 mp = mvRotY(h.xyz, uRot);
  vec4 rg = texture2D(tRing, u);
  float tt = rg.x + uTime * (1.45 / (rg.y * rg.y));                 // órbita: más rápido cerca del anillo
  vec3 ring = vec3(uAxis.x + cos(tt) * rg.y, uAxis.y + sin(tt) * rg.y, uRingZ + rg.z);
  vec4 hx = texture2D(tHelix, u);
  float th = hx.x + uTime * (.035 + seed * .05);
  vec3 helix = vec3(uAxis.x + cos(th) * hx.y, uAxis.y + sin(th) * hx.y * .9, hx.z);
  float eA = mvStag(uA, seed), eC = mvStag(uC, rg.w), eB = mvStag(uB, 1. - seed);
  vec3 t = mix(mix(mix(mp + uStart, ring, eA), helix, eC), mp + uEnd, eB);
  float travel = sin(eA * 3.14159) + sin(eC * 3.14159) + sin(eB * 3.14159);
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

const VEL_SHADER = /* glsl */ `
${TARGET_GLSL}
${FLOW_GLSL}
uniform float uDt, uIntro, uFlowAmt, uMouse, uMouseR, uSnap;
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
  acc += mvFlow(pos * .55, uTime * .6) * uFlowAmt * (.07 + 1.5 * tg.w + (1. - rel) * 1.3);
  // cursor: empuja desde su rayo y hace girar alrededor de él
  vec3 w = pos - uRayO; float tr = dot(w, uRayD);
  vec3 dv = w - uRayD * tr; float dist = length(dv);
  float fm = uMouse * smoothstep(uMouseR, 0., dist) * step(0., tr);
  vec3 dn = dv / max(dist, 1e-3);
  acc += dn * fm * 55. + cross(uRayD, dn) * fm * 24.;
  vel += acc * uDt;
  vel *= exp(-uDt * mix(3.2, 7.2, rel));                                     // amortiguado: un poco de rebote
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
uniform sampler2D tPos, tVel;
uniform float uPx, uFocus, uAperture, uMirror, uAlpha, uReflect, uSim;
uniform vec3 uRayO, uRayD; uniform float uMouse;
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
  float near = uMouse * smoothstep(.9, 0., length(w - uRayD * tr)) * step(0., tr);
  if (uMirror > .5) p.y = -p.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float z = -mv.z;
  float coc = clamp(abs(z - uFocus) * uAperture, 0., 1.);                     // profundidad de campo
  vec4 rgs = texture2D(tRing, aRef);
  float calm = mvStag(uC, rgs.w) * (1. - mvStag(uB, 1. - aSeed));             // 1 = viajando por el túnel
  float base = (1.2 + aSeed * 2.2) * uPx * (19. / max(z, .1)) * mix(1., .55, calm);
  gl_PointSize = clamp(base * (1. + coc * 1.8), 1., 36.) * smoothstep(.8, 2.2, z);   // pegadas a la cámara: sin costo
  float tw = .72 + .28 * sin(uTime * (1.3 + aSeed * 2.1) + aSeed * 50.);
  float glint = pow(max(0., sin(uTime * .55 + aSeed * 173.)), 60.) * 3.;      // destellos ocasionales
  vA = (tw + glint) / (1. + coc * coc * 5.) * smoothstep(1., 3.5, z) * uAlpha * mix(1., .55, calm);
  if (uMirror > .5) vA *= .7 * smoothstep(-1.8, 0., p.y) * uReflect;
  vec3 hot = mix(aCol, vec3(.86, .95, 1.), clamp(sp * .1 + near * .45, 0., .75));   // energía y cursor
  vC = hot * (1.7 + clamp(sp * .25, 0., 1.4) + near * 1.2);
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
  float rim = smoothstep(1., .84, d) * smoothstep(.5, .95, d) * vCoc * .35;   // borde del bokeh
  gl_FragColor = vec4(vC * (core + rim) * vA, 1.);
}
`;

export function createParticles({ renderer, geos, holderMatrix, mobile, reduced }) {
  const W = mobile ? 120 : 180, N = W * W;

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
      do { smp.sample(p, n, c); } while (n.z < -0.5 && Math.random() < 0.65);
      p.applyMatrix4(holderMatrix);
      const seed = Math.random();
      home.set([p.x, p.y, p.z, seed], k * 4);
      col.set([c.r, c.g, c.b], k * 3);
      seeds[k] = seed;
      refs.set([(k % W + 0.5) / W, (Math.floor(k / W) + 0.5) / W], k * 2);
      // anillo de acreción alrededor del eclipse
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      ring.set([Math.random() * Math.PI * 2, 2.85 + g * 0.55 + (Math.random() < .06 ? Math.random() * 2.5 : 0), g * 0.35, Math.random()], k * 4);
      // hélice de tres brazos a lo largo del túnel
      const z = Math.random() < 0.82 ? -1.5 - Math.random() * 23 : -24.5 - Math.random() * 28;
      const spread = Math.pow(Math.random(), 2) * (Math.random() < .5 ? -1 : 1);
      helix.set([(k % 3) * (Math.PI * 2 / 3) + z * 0.22 + spread * 0.9, 2.5 + Math.pow(Math.random(), 1.6) * 3.8 + Math.abs(spread) * 0.8, z, 0], k * 4);
      // nube de la entrada: la M se arma desde aquí
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), rad = 5 + Math.random() * 7;
      start.set([Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad * 0.6 + 1.9, Math.sin(ph) * Math.sin(th) * rad - 2, 1], k * 4);
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
    uAxis: { value: new THREE.Vector2(0, 1.9) }, uRingZ: { value: -4.2 },
    uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouse: { value: 0 }
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
        uIntro: { value: 0 }, uFlowAmt: { value: reduced ? 0 : 1 }, uMouseR: { value: 0.48 }
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
    uPx: { value: 1 }, uFocus: { value: 12 }, uAperture: { value: mobile ? 0.07 : 0.09 },
    uMirror: { value: mirror ? 1 : 0 }, uAlpha: { value: 1 }, uReflect: { value: 0 }
  });
  const mk = (mirror) => {
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
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
