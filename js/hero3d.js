/* ============================================================
   MV DESIGN · FX 3D — el símbolo recorre todo el sitio
   Dos capas de canvas (detrás y delante del contenido) para que
   las partículas pasen POR ATRÁS y POR ENCIMA de las secciones.
   Fases (desde main.js vía MVHERO.setState):
     assemble 0→1  nube → símbolo M (hero)
     spin     0→1  rotación 360° del símbolo formado
     wave     0→1  el M se disuelve en enjambre
     journey  0→1  el enjambre VIAJA por las secciones, anclándose
                   a los títulos reales (MVHERO.setWaypoints)
     reform   0→1  el enjambre vuelve a formar el M (CTA)
     flow          deriva con el scroll horizontal de servicios
   ============================================================ */
(function () {
  "use strict";

  if (typeof THREE === "undefined") return;
  var mountBack  = document.querySelector("[data-fx-back]");
  var mountFront = document.querySelector("[data-fx-front]");
  if (!mountBack) return;

  // "Reducir movimiento" del sistema o "Pausar movimiento" del sitio → M estática
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
                document.documentElement.classList.contains("motion-off");

  /* ---------- Marca ---------- */
  var BLUE_1 = new THREE.Color("#4892D9");
  var BLUE_2 = new THREE.Color("#2BCCD9");
  var PUR_1  = new THREE.Color("#9E43B8");
  var PUR_2  = new THREE.Color("#625CD9");
  var BLUE_MID = BLUE_1.clone().lerp(BLUE_2, 0.5);

  /* ---------- Geometría del símbolo (SVG oficial) ---------- */
  var P_LEFT   = [-0.801,  0.544];
  var P_VERTEX = [ 0.000, -0.251];
  var P_RIGHT  = [ 0.801,  0.544];
  var P_PUREND = [ 0.100,  0.115];
  var DOT_L    = [-0.795, -0.545];
  var DOT_R    = [ 0.802, -0.545];
  var R_STROKE = 0.385;  // gordito
  var R_DOT    = 0.405;

  var MOBILE = window.innerWidth < 860;

  /* Fase 2a. El canvas mide 100lvh (CSS) y solo reasigna sus búferes si cambia el
     ancho o, en touch, si el alto cambia más de 20%: la barra de Safari ya no lo
     redimensiona a mitad del reveal. `?legacy=1` restaura el comportamiento
     anterior (canvas inset:0 + setSize en cada resize) para comparar en un iPhone. */
  var LEGACY = /[?&]legacy=1/.test(location.search);
  if (LEGACY) document.documentElement.classList.add("fx-legacy");
  var COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var stats = { resizes: 0, reallocs: 0, k: 1, legacy: LEGACY, slow: [] }; // slow: frames >50 ms [fin, ms]

  /* Encuadre compensado (fase 2a). Con la barra de Safari visible, el canvas
     (100lvh) es más alto que el área visible (k = visible / canvas < 1). La cámara
     encuadra SOLO el área visible, igual que antes, y el sobrante del canvas queda
     abajo, fuera de pantalla: setViewOffset con un "cuadro completo" del alto
     visible (cssH·k) dibujando el canvas entero (cssH). Así la M, las estrellas y el
     cometa se ven idénticos. Con k = 1 (desktop, barra oculta, ?legacy=1) equivale
     a una cámara normal con aspect = ancho/alto. */
  function frameCam(sys, k) {
    if (!sys || !sys.cssW || !sys.cssH) return;
    sys.camera.setViewOffset(sys.cssW, sys.cssH * k, 0, 0, sys.cssW, sys.cssH);
    sys.kApplied = k;
  }

  function rand() { return Math.random(); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function diskOffset(r) {
    // volumen 3D real (tubo, no disco): el trazo se ve lleno aun rotando
    var a = rand() * Math.PI * 2;
    var d = (rand() < 0.6 ? Math.pow(rand(), 0.75) * 0.74 : 0.74 + Math.pow(rand(), 1.3) * 0.26) * r;
    return [Math.cos(a) * d, Math.sin(a) * d * 0.94, (rand() - 0.5) * r * 0.95];
  }
  function sampleSegment(A, B, r, out, col, cA, cB) {
    var t = rand(), o = diskOffset(r);
    out[0] = lerp(A[0], B[0], t) + o[0];
    out[1] = lerp(A[1], B[1], t) + o[1];
    out[2] = o[2];
    var c = cA.clone().lerp(cB, t);
    col[0] = c.r; col[1] = c.g; col[2] = c.b;
  }
  function sampleDot(C, r, out, col, cA, cB) {
    var o = diskOffset(r);
    out[0] = C[0] + o[0]; out[1] = C[1] + o[1]; out[2] = o[2];
    var c = cA.clone().lerp(cB, (o[0] / r + 1) / 2);
    col[0] = c.r; col[1] = c.g; col[2] = c.b;
  }

  /* ---------- Shaders compartidos ---------- */
  var VSH = [
    "attribute vec3 aStart;",
    "attribute vec3 aTarget;",
    "attribute vec3 aWave;",
    "attribute vec3 aColor;",
    "attribute float aRand;",
    "uniform float uTime;",
    "uniform float uProgress;",
    "uniform float uWave;",
    "uniform float uFlow;",
    "uniform float uSize;",
    "uniform float uZBias;",
    "uniform vec3 uPath[8];",   // ventana de la RUTA real (elementos del DOM)
    "uniform float uRot;",      // rotación del M (siempre al mismo sentido)
    "uniform vec3 uMOff;",      // posición del M en mundo (hero ↔ CTA)
    "uniform float uMScale;",
    "uniform float uReform;",   // re-ensamble: el cometa se DRENA en el logo
    "varying vec3 vColor;",
    "varying float vEase;",
    "varying float vGlow;",
    "void main(){",
    "  float pp = clamp((uProgress - aRand * 0.28) / 0.72, 0.0, 1.0);",
    "  float e = pp * pp * (3.0 - 2.0 * pp);",
    // disolución (hero): stagger aleatorio · re-ensamble (CTA): la CABEZA
    // del cometa se convierte primero y la cola se drena detrás
    "  float dkey = mix(aRand, 1.0 - aWave.x, clamp(uReform * 1.6, 0.0, 1.0));",
    "  float wv = clamp((uWave - dkey * 0.35) / 0.65, 0.0, 1.0);",
    "  wv = wv * wv * (3.0 - 2.0 * wv);",
    "  if (aWave.z < 0.0) { wv = 0.0; }",      // estrellas: nunca a la corriente
    "  // El M vive en MUNDO vía uniforms: rota en su sitio y se funde con la",
    "  // corriente punto a punto — cero saltos por construcción",
    "  float cR = cos(uRot), sR = sin(uRot);",
    "  vec3 mt = aTarget * uMScale;",
    "  mt = vec3(mt.x * cR + mt.z * sR, mt.y, -mt.x * sR + mt.z * cR);",
    "  mt += uMOff;",
    "  // COMETA sobre la RUTA real: uPath es una ventana de 8 puntos del",
    "  // recorrido (elementos del DOM) — uPath[7] = cabeza, uPath[0] = cola",
    "  float q = aWave.x;",                                   // 0 = cabeza · 1 = cola
    "  float seg = (1.0 - q) * 7.0;",
    "  float fi = clamp(floor(seg), 0.0, 6.0);",
    "  int i0 = int(fi);",
    "  vec3 stream = mix(uPath[i0], uPath[i0 + 1], clamp(seg - fi, 0.0, 1.0));",
    "  float r = 0.05 + q * 0.30;",                           // cabeza fina, cola abierta
    "  stream += vec3(cos(aWave.y), sin(aWave.y) * 0.85, sin(aWave.y * 1.7)) * aWave.z * r;",
    "  stream.y += sin(seg * 2.0 + uTime * 0.55) * 0.045;",   // vida sutil, no protagonista
    "  stream.z += uZBias;",
    "  vec3 shape = mix(mt, stream, wv);",
    "  vGlow = mix(1.0, (1.3 - q) * 0.77, wv);",              // la cabeza brilla, la cola se apaga
    "  // la nube de origen gravita alrededor del M (cohesión visual)",
    "  vec3 startP = aStart + uMOff * 0.7;",
    "  if (aWave.z < 0.0) { startP = aStart; }",
    "  vec3 pos = mix(startP, shape, e);",
    "  float w = 0.022 * (0.12 + 0.88 * (1.0 - e * (1.0 - wv * 0.5)));",
    "  pos.x += sin(uTime * 0.8 + aRand * 43.7) * w;",
    "  pos.y += cos(uTime * 0.7 + aRand * 29.3) * w;",
    "  pos.z += sin(uTime * 0.9 + aRand * 17.1) * w;",
    "  vec4 mv = modelViewMatrix * vec4(pos, 1.0);",
    "  gl_PointSize = uSize * (0.45 + 0.85 * aRand) * (1.0 / -mv.z);",
    "  // twinkle cósmico: cada partícula respira a su ritmo",
    "  gl_PointSize *= (0.82 + 0.3 * sin(uTime * (1.2 + aRand * 2.4) + aRand * 47.0));",
    "  gl_Position = projectionMatrix * mv;",
    "  vColor = aColor;",
    "  vEase = e * (1.0 - wv * 0.3);",
    "}"
  ].join("\n");

  var FSH = [
    "uniform float uDim;",
    "varying vec3 vColor;",
    "varying float vEase;",
    "varying float vGlow;",
    "void main(){",
    "  float d = length(gl_PointCoord - 0.5);",
    "  float a = smoothstep(0.5, 0.06, d);",
    "  float boost = 0.5 + 0.62 * vEase;",
    "  gl_FragColor = vec4(vColor * boost, a * (0.5 + 0.5 * vEase) * uDim * vGlow);",
    "}"
  ].join("\n");

  /* ---------- Fábrica de sistemas (capa trasera / delantera) ---------- */
  function createSystem(mount, opts) {
    var sys = { cssW: 0, cssH: 0 }; // tamaño CSS vigente del canvas (para proyectar el DOM)
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.05, 7.2);
    sys.camera = camera; // resize() → frameCam() la necesita desde la primera llamada
    var renderer;
    try {
      // Móvil: sin antialias (las partículas son glows suaves con additive blending,
      // el MSAA casi no se ve pero es caro por frame y al arrancar) y DPR tope 1.5
      // en vez de 2 (en una pantalla 3x son ~44% menos píxeles) → el cometa corre
      // fluido desde el primer frame en el teléfono. Desktop queda igual.
      renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return null; }
    // Móvil: DPR 1.0 (no 1.5). El costo del cometa es FILL-RATE (partículas
    // grandes con additive blending = mucho overdraw) y escala con DPR² → bajar
    // a 1.0 son ~2.25x menos píxeles que pintar. Es lo que colapsaba los fps del
    // iPhone en el pico del reveal (cometa a full + título + fade del loader).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.0 : 2));
    mount.appendChild(renderer.domElement);

    var group = new THREE.Group();
    scene.add(group);

    var N = opts.count, AMB = Math.floor(N * opts.ambient);
    var starts = new Float32Array(N * 3), targets = new Float32Array(N * 3),
        waves = new Float32Array(N * 3), colors = new Float32Array(N * 3),
        rands = new Float32Array(N);
    var p3 = [0, 0, 0], c3 = [0, 0, 0];

    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      var th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      var rad = 3.4 + rand() * 5.2;
      starts[i3]     = Math.sin(ph) * Math.cos(th) * rad;
      starts[i3 + 1] = (Math.cos(ph) * rad) * 0.72;
      starts[i3 + 2] = Math.sin(ph) * Math.sin(th) * rad - 1.2 + opts.zBias;

      // stream orgánico: cada partícula lleva [posición en el path, ángulo, radio]
      waves[i3]     = rand();                 // tSeed: dónde va en la corriente
      waves[i3 + 1] = rand() * 6.2832;        // ángulo del offset radial
      waves[i3 + 2] = Math.pow(rand(), 0.7);  // radio del offset (0..1)

      if (i < AMB) {
        targets[i3] = starts[i3] * 1.06; targets[i3 + 1] = starts[i3 + 1] * 1.06; targets[i3 + 2] = starts[i3 + 2];
        waves[i3 + 2] = -1.0; // bandera: las estrellas no se unen a la corriente
        var amb = (rand() < 0.5 ? BLUE_2 : PUR_2).clone().multiplyScalar(0.55 + rand() * 0.3);
        colors[i3] = amb.r; colors[i3 + 1] = amb.g; colors[i3 + 2] = amb.b;
        rands[i] = rand();
        continue;
      }

      var u = rand();
      if (u < 0.30)      sampleSegment(P_LEFT, P_VERTEX, R_STROKE, p3, c3, BLUE_1, BLUE_MID);
      else if (u < 0.55) sampleSegment(P_VERTEX, P_RIGHT, R_STROKE, p3, c3, BLUE_MID, BLUE_2);
      else if (u < 0.80) { sampleSegment(P_RIGHT, P_PUREND, R_STROKE * 0.96, p3, c3, PUR_2, PUR_1); p3[2] += 0.12; }
      else if (u < 0.90) sampleDot(DOT_L, R_DOT, p3, c3, PUR_1, PUR_2);
      else               sampleDot(DOT_R, R_DOT, p3, c3, BLUE_1, BLUE_2);

      targets[i3] = p3[0]; targets[i3 + 1] = p3[1]; targets[i3 + 2] = p3[2];
      colors[i3] = c3[0]; colors[i3 + 1] = c3[1]; colors[i3 + 2] = c3[2];
      rands[i] = rand();
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(starts.slice(), 3));
    geo.setAttribute("aStart",  new THREE.BufferAttribute(starts, 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
    geo.setAttribute("aWave",   new THREE.BufferAttribute(waves, 3));
    geo.setAttribute("aColor",  new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aRand",   new THREE.BufferAttribute(rands, 1));

    var pathInit = [];
    for (var pi = 0; pi < 8; pi++) pathInit.push(new THREE.Vector3());
    var uniforms = {
      uTime: { value: 0 }, uProgress: { value: 0 }, uWave: { value: 0 },
      uFlow: { value: 0 }, uPath: { value: pathInit },
      uRot: { value: 0 }, uMOff: { value: new THREE.Vector3() }, uMScale: { value: 1 },
      uReform: { value: 0 },
      uSize: { value: opts.size },
      uZBias: { value: opts.zBias }, uDim: { value: opts.dim }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexShader: VSH, fragmentShader: FSH
    });
    group.add(new THREE.Points(geo, mat));

    var bufW = 0, bufH = 0;
    function resize() {
      var w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      sys.cssW = w; sys.cssH = h;
      // la proyección sigue SIEMPRE al tamaño CSS: si el búfer no se reasigna, el
      // estiramiento CSS no deforma la escena (solo los glows quedan apenas ovalados)
      frameCam(sys, sys.kApplied || 1);
      // setSize reasigna los búferes del canvas (bloqueo síncrono de GPU en iOS):
      // solo si cambió el ancho, o el alto en desktop, o el alto >20% en touch
      // (Firefox iOS y algunos in-app sí cambian lvh con su barra)
      if (!LEGACY && w === bufW && (h === bufH || (COARSE && Math.abs(h - bufH) < bufH * 0.2))) return;
      if (bufW) stats.reallocs++; // solo REasignaciones: la inicial no cuenta
      bufW = w; bufH = h;
      renderer.setSize(w, h, false);
    }
    window.addEventListener("resize", resize);
    resize();

    // Pre-compila los shaders y hace un primer draw AHORA (en el setup, detrás
    // del preloader). El link de los shaders sigue siendo síncrono en ese primer
    // render; lo que ya no bloquea es esperar a que la GPU termine el cuadro
    // (antes readPixels, ahora fenceSync, fase 2g). Chequeo de shaders solo con ?debug.
    renderer.debug.checkShaderErrors = /[?&]debug=/.test(location.search);
    try {
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
    } catch (e) {}

    sys.scene = scene; sys.camera = camera; sys.renderer = renderer;
    sys.group = group; sys.uniforms = uniforms; sys.opts = opts;
    return sys;
  }

  var back = createSystem(mountBack, {
    count: MOBILE ? 4200 : 10600, ambient: 0.24,
    size: MOBILE ? 30 : 38, spreadX: 2.4, zSpread: 1.2, zBias: 0, dim: 1.0
  });
  if (!back) return;

  // Celular: un solo canvas (fase 2g). 600 puntos al frente no justifican un
  // segundo contexto WebGL en el teléfono; en desktop la capa frontal se queda.
  var front = (!reduced && mountFront && !MOBILE) ? createSystem(mountFront, {
    count: MOBILE ? 600 : 2400, ambient: 0.1,
    size: MOBILE ? 40 : 58, spreadX: 2.1, zSpread: 1.6, zBias: 2.4, dim: 0.62
  }) : null;

  /* ---------- Estado ---------- */
  var target = { assemble: 0, spin: 0, wave: 0, reform: 0, flow: 0, journey: 0 };
  var shown  = { assemble: 0, spin: 0, wave: 0, reform: 0, flow: 0, journey: 0 };

  var A_HERO = MOBILE ? [0, 0.78, 0.92] : [2.18, -0.1, 1.14];
  var A_CTA  = MOBILE ? [0, 1.35, 0.58] : [0, 1.28, 0.7];

  /* k para el encuadre compensado (ver frameCam). Cuando la barra se oculta, k→1
     con suavidad (antes era un salto + el realloc). En desktop y ?legacy=1, k = 1. */
  var kTarget = 1, kShown = 1;
  function updateK() {
    if (LEGACY || !back || !back.cssH) { kTarget = 1; return; }
    if (window.visualViewport && window.visualViewport.scale > 1.01) return; // pinch-zoom: no tocar
    kTarget = Math.max(0.8, Math.min(1, window.innerHeight / back.cssH));
    stats.k = kTarget;
  }
  window.addEventListener("resize", function () {
    stats.resizes++;
    MOBILE = window.innerWidth < 860;
    A_HERO = MOBILE ? [0, 0.78, 0.92] : [2.18, -0.1, 1.14];
    A_CTA  = MOBILE ? [0, 1.35, 0.58] : [0, 1.28, 0.7];
    updateK();
  });
  // el pinch-zoom no dispara window.resize en Chrome: al volver a escala 1, recalcular
  if (window.visualViewport) window.visualViewport.addEventListener("resize", updateK);
  updateK(); kShown = kTarget; // al cargar, sin animación
  frameCam(back, kShown); if (front) frameCam(front, kShown);

  /* ---------- RUTA real: spline por los elementos del DOM ----------
     El cometa visita títulos, fichas y rieles en orden, leyendo sus
     rects ACTUALES cada frame (los pins y el scroll quedan resueltos). */
  var route = [];          // [{el, dx, dy}] — dx/dy en fracción de viewport
  var ctaAnchorEl = null;  // el M reformado vive AQUÍ y scrollea con la página

  // El DOM se proyecta sobre lo que encuadra la cámara: el alto visible cssH·k
  // (con la barra oculta = innerHeight, como antes). El ancho, como antes.
  function viewW() { return window.innerWidth; }
  function viewH() {
    if (LEGACY || !back || !back.cssH) return window.innerHeight;
    return back.cssH * kShown;
  }

  function rectWorld(el, camZ) {
    var r = el.getBoundingClientRect();
    var vw = viewW(), vh = viewH();
    var halfH = Math.tan(21 * Math.PI / 180) * camZ;
    var halfW = halfH * (vw / vh);
    return [
      ((r.left + r.width / 2) / vw * 2 - 1) * halfW,
      -((r.top + r.height / 2) / vh * 2 - 1) * halfH
    ];
  }

  function computeRoutePts(camZ) {
    if (route.length < 2) return null;
    var vw = viewW(), vh = viewH();
    var halfH = Math.tan(21 * Math.PI / 180) * camZ;
    var halfW = halfH * (vw / vh);
    var pts = [], ys = [];
    for (var i = 0; i < route.length; i++) {
      var d = route[i];
      var r = d.el.getBoundingClientRect();
      var cx = (r.left + r.width / 2) / vw + (d.dx || 0);
      var cy = (r.top + r.height / 2) / vh + (d.dy || 0);
      pts.push([(cx * 2 - 1) * halfW, -(cy * 2 - 1) * halfH]);
      ys.push(cy * vh); // posición en viewport (px) para calcular la cabeza
    }
    // la CABEZA del cometa = la parada que está cruzando tu línea de lectura
    // (58% del área VISIBLE). El cometa baja CONTIGO, parada por parada.
    var ty = window.innerHeight * 0.58, n = ys.length, headU = 0;
    if (ys[0] >= ty) headU = 0;
    else if (ys[n - 1] <= ty) headU = n - 1;
    else {
      for (var j = 0; j < n - 1; j++) {
        if (ys[j] < ty && ys[j + 1] >= ty) {
          headU = j + (ty - ys[j]) / (ys[j + 1] - ys[j]);
          break;
        }
      }
    }
    return { pts: pts, headU: headU };
  }

  function sampleRoute(pts, u) {
    // Catmull-Rom: curva suave que pasa por todos los puntos
    var n = pts.length;
    u = Math.max(0, Math.min(n - 1.0001, u));
    var i = Math.floor(u), t = u - i;
    var p0 = pts[Math.max(0, i - 1)], p1 = pts[i],
        p2 = pts[Math.min(n - 1, i + 1)], p3 = pts[Math.min(n - 1, i + 2)];
    var t2 = t * t, t3 = t2 * t;
    function cr(a, b, c, d) {
      return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    }
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
  }

  var TAIL_SPAN = 1.9; // segmentos de ruta que ocupa la cola
  function fillPathWindow(sys, pts, headU, lead) {
    var H = headU + (lead || 0);
    for (var k = 0; k < 8; k++) {
      var u = H - TAIL_SPAN * (1 - k / 7); // k=7 → cabeza
      var p = sampleRoute(pts, u);
      sys.uniforms.uPath.value[k].set(p[0], p[1], 0);
    }
  }

  /* ---------- Interacción ---------- */
  var mouse = { x: 0, y: 0 }, sm = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------- Loop ---------- */
  var clock = new THREE.Clock();
  var raf = null;

  // Señal de "primer frame del cometa ya pintado": el preloader la usa para
  // no revelar un hero vacío. Se dispara UNA vez, tras el primer render().
  var firstPaintDone = false;
  function signalPaint() {
    if (firstPaintDone) return;
    firstPaintDone = true;
    if (window.MVHERO) window.MVHERO.painted = true;
    try { window.dispatchEvent(new Event("mvhero:painted")); } catch (e) {}
  }
  // "Pintado" = la GPU terminó de compilar y dibujar el primer cuadro. Se pregunta
  // con un fence de WebGL2 en cada frame (no bloquea). Sin WebGL2 o si tarda más
  // de 1.5 s, se avisa igual (main.js tiene además su red de seguridad).
  var gpuFence = null, fenceT0 = 0, glc = back.renderer.getContext();
  function checkGpuDone() {
    if (firstPaintDone) return;
    if (!glc.fenceSync) { signalPaint(); return; }
    var now = performance.now();
    if (!gpuFence) { gpuFence = glc.fenceSync(glc.SYNC_GPU_COMMANDS_COMPLETE, 0); glc.flush(); fenceT0 = now; return; }
    if (glc.getSyncParameter(gpuFence, glc.SYNC_STATUS) === glc.SIGNALED || now - fenceT0 > 1500) {
      glc.deleteSync(gpuFence); gpuFence = null; signalPaint();
    }
  }

  function applySystem(sys, t, asm, spn, wv, rf, rp, headNorm, isFront) {
    var u = sys.uniforms;
    u.uTime.value = t;
    u.uFlow.value = shown.flow;
    u.uReform.value = rf;

    // sándwich SECUENCIAL: las capas se alternan con el avance REAL —
    // cuando la trasera sale de escena, la frontal entra (y viceversa)
    var streamMode = wv * (1 - rf);
    var backW = 0.5 + 0.5 * Math.cos(headNorm * Math.PI * 4.0);
    var frontW = 1.0 - backW;

    // ventana de la ruta: la frontal va medio paso ADELANTE (relevo visual)
    if (rp) fillPathWindow(sys, rp.pts, headShown, isFront ? 0.45 : 0);

    if (isFront) {
      u.uProgress.value = wv;
      u.uWave.value = 1.0;
      u.uDim.value = sys.opts.dim * wv * (0.22 + 0.78 * frontW) * (1 - rf * 0.85);
    } else {
      u.uProgress.value = Math.max(asm, rf * 0.999);
      u.uWave.value = streamMode;
      // el "sándwich" (atrás se apaga mientras el frente lo releva) solo si hay capa
      // frontal; en celular (un solo canvas) el cometa se queda encendido
      u.uDim.value = front ? 1.0 - streamMode * 0.62 * (1.0 - backW) : 1.0;
    }

    // el M en coordenadas de MUNDO (uniforms): hero ↔ ancla real del CTA
    var camZ = 7.2 - asm * (1 - wv) * 2.3;
    var ctaW = ctaAnchorEl ? rectWorld(ctaAnchorEl, camZ) : A_CTA;
    u.uMOff.value.set(lerp(A_HERO[0], ctaW[0], rf), lerp(A_HERO[1], ctaW[1], rf), 0);
    u.uMScale.value = lerp(A_HERO[2], A_CTA[2], rf);

    // rotación SIEMPRE al mismo sentido (derecha): solo el giro del scroll.
    // Al anclarse en el CTA, sway y parallax se congelan → clavado al pixel
    var freeze = 1 - rf;
    var sway = Math.sin(t * 0.32) * 0.04 * Math.max(asm, rf) * freeze;
    u.uRot.value = -(spn * Math.PI * 4.0) + sway + sm.x * 0.2 * freeze;

    // parallax cósmico en la CÁMARA (no toca la ruta ni el trazo)
    sys.camera.position.x = sm.x * 0.16 * freeze;
    sys.camera.position.y = 0.05 - sm.y * 0.1 * freeze;
    sys.camera.position.z = camZ;

    sys.renderer.render(sys.scene, sys.camera);
  }

  var headShown = 0; // cabeza suavizada (en unidades de parada)

  function frame() {
    var f0 = performance.now();
    var t = clock.getElapsedTime();
    // el ensamble respira más lento (cinemático); el resto responde ágil
    for (var k in target) {
      var sf = (k === "assemble" || k === "reform") ? 0.05 : 0.09;
      shown[k] += (target[k] - shown[k]) * sf;
    }
    sm.x += (mouse.x - sm.x) * 0.045;
    sm.y += (mouse.y - sm.y) * 0.045;
    kShown += (kTarget - kShown) * 0.06;
    if (Math.abs(kShown - (back.kApplied || 1)) > 1e-4) { frameCam(back, kShown); if (front) frameCam(front, kShown); }

    var asm = shown.assemble, spn = shown.spin, wv = shown.wave, rf = shown.reform;
    var camZ = 7.2 - asm * (1 - wv) * 2.3;
    var rp = (wv > 0.01 && rf < 0.99) ? computeRoutePts(camZ) : null;
    var headNorm = 0;
    if (rp) {
      headShown += (rp.headU - headShown) * 0.09;
      headNorm = headShown / Math.max(1, route.length - 1);
    }
    applySystem(back, t, asm, spn, wv, rf, rp, headNorm, false);
    if (front) applySystem(front, t, asm, spn, wv, rf, rp, headNorm, true);
    checkGpuDone();

    var fd = performance.now() - f0; // costo JS+GL de este frame (para la sonda)
    if (fd > 50) { stats.slow.push([performance.now(), fd]); if (stats.slow.length > 30) stats.slow.shift(); }
    raf = requestAnimationFrame(frame);
  }

  if (reduced) {
    shown.assemble = target.assemble = 1;
    var renderStatic = function () {
      kShown = kTarget;
      frameCam(back, kShown);
      back.uniforms.uProgress.value = 1;
      back.uniforms.uMOff.value.set(A_HERO[0], A_HERO[1], 0);
      back.uniforms.uMScale.value = A_HERO[2];
      back.camera.position.z = 4.9;
      back.renderer.render(back.scene, back.camera);
    };
    renderStatic();
    // si el canvas se reasigna (giro de pantalla), setSize lo borra: se vuelve a pintar
    window.addEventListener("resize", renderStatic);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", renderStatic);
    signalPaint(); // reduced-motion: render estático único, igual avisamos
  } else {
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", function () {
    if (reduced) return;
    if (document.hidden && raf !== null) { cancelAnimationFrame(raf); raf = null; }
    else if (!document.hidden && raf === null) { clock.start(); raf = requestAnimationFrame(frame); }
  });

  window.MVHERO = {
    ready: true,
    painted: firstPaintDone, // true ya si reduced-motion pintó su frame estático
    setState: function (s) { for (var k in s) if (k in target) target[k] = Math.max(0, Math.min(1.5, s[k])); },
    setRoute: function (defs) {
      route = defs.filter(function (d) { return d && d.el; });
    },
    setWaypoints: function (els) { // compat: ruta sin offsets
      route = els.filter(Boolean).map(function (el) { return { el: el, dx: 0, dy: 0 }; });
    },
    setCtaAnchor: function (el) { ctaAnchorEl = el || null; },
    setProgress: function (p) { target.assemble = Math.max(0, Math.min(1, p)); },
    // clava shown = target (sin easing): el preloader lo usa para que, al abrir,
    // las partículas YA estén en su estado de reposo aunque el ensamblaje por
    // frame no haya terminado (hilo saturado en la carga = pocos fps)
    settleNow: function () { for (var k in shown) shown[k] = target[k]; },
    stats: stats, // sonda ?debug=1: resizes, reasignaciones del canvas, k, legacy
    getState: function () { return { target: JSON.parse(JSON.stringify(target)), shown: JSON.parse(JSON.stringify(shown)), uWave: back.uniforms.uWave.value }; }
  };
})();
