/* ============================================================
   MV DESIGN · Sonda de arranque (solo con ?debug=1)
   Mide en el teléfono real si el reveal o el primer scroll se traban:
   el hueco más largo entre cuadros (un congelamiento de 2-3 s aparece
   como un hueco de 2000-3000 ms). Guarda un historial por modo en este
   navegador. ?debug=reset borra el historial.
   Prueba: abrir, NO tocar hasta que aparezca el título, y entonces scrollear.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "mv-probe-v1";
  var now = function () { return performance.now(); };
  var legacy = /[?&]legacy=1/.test(location.search);
  var mode = legacy ? "legacy" : "2a";

  if (/[?&]debug=reset/.test(location.search)) {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  // al recargar, que la corrida empiece arriba (sin scroll restaurado que ensucie)
  try {
    if (window.ScrollTrigger && ScrollTrigger.clearScrollMemory) ScrollTrigger.clearScrollMemory("manual");
    else if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch (e) {}

  // Solo cuenta el scroll que viene de un gesto real (no el restaurado ni el de Lenis)
  var revealAt = null, y0 = null, firstScrollAt = null, gestureAt = null;
  var lastGestureAt = null, scrollBeforeReveal = false;
  var gaps = [];            // huecos >= 50 ms: [fin, duración]
  var worst = 0, worstAt = 0, frames = 0, resizes = [];
  var last = now(), hiddenGap = false, recorded = false;

  ["touchstart", "wheel", "keydown", "pointerdown"].forEach(function (ev) {
    window.addEventListener(ev, function () { lastGestureAt = now(); }, { passive: true, capture: true });
  });
  window.addEventListener("mv:reveal", function () {
    if (revealAt === null) { revealAt = now(); y0 = Math.round(window.scrollY || 0); }
  });
  window.addEventListener("scroll", function () {
    if (lastGestureAt === null) return;                       // restaurado/programático
    if (revealAt === null) { scrollBeforeReveal = true; return; }
    if (firstScrollAt === null && lastGestureAt >= revealAt) {
      firstScrollAt = now();
      gestureAt = lastGestureAt;  // el congelamiento del scroll empieza en el gesto
    }
  }, { passive: true });
  window.addEventListener("resize", function () {
    resizes.push([now(), window.innerHeight]);
    if (resizes.length > 6) resizes.shift();
  });
  document.addEventListener("visibilitychange", function () { hiddenGap = true; });

  function tick() {
    var t = now(), gap = t - last;
    last = t; frames++;
    if (hiddenGap || document.hidden) { hiddenGap = document.hidden; }
    else if (frames > 2) {
      if (gap >= 50) gaps.push([t, gap]);
      if (gap > worst) { worst = gap; worstAt = t; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // peor hueco cuyo final cae en [a, b]
  function worstIn(a, b) {
    var w = 0;
    for (var i = 0; i < gaps.length; i++) {
      var end = gaps[i][0], g = gaps[i][1];
      if (end - g <= b && end >= a && g > w) w = g;
    }
    return w;
  }
  function verdict(g) {
    if (g >= 1000) return "✗ CONGELAMIENTO";
    if (g >= 250) return "⚠ tirón";
    return "✓ fluido";
  }
  function ms(v) { return v == null ? "—" : Math.round(v) + " ms"; }
  function sec(v) { return v == null ? "—" : (v / 1000).toFixed(2) + " s"; }

  function history() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function record(run) {
    try {
      var h = history(); h.push(run);
      if (h.length > 60) h = h.slice(-60);
      localStorage.setItem(KEY, JSON.stringify(h));
    } catch (e) {}
  }

  var box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = [
    "position:fixed", "left:8px", "top:72px", "z-index:9999", "pointer-events:none",
    "max-width:calc(100vw - 16px)", "padding:7px 9px", "border-radius:8px",
    "background:rgba(0,0,0,.8)", "color:#bff", "white-space:pre-wrap", "overflow-wrap:anywhere",
    "font:10.5px/1.4 ui-monospace,Menlo,Consolas,monospace"
  ].join(";");
  function mount() { if (document.body && !box.parentNode) document.body.appendChild(box); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  function render() {
    var t = now();
    var st = (window.MVHERO && window.MVHERO.stats) || {};
    // la ventana del reveal termina donde empieza el primer gesto: así un
    // congelamiento causado por el scroll no se cuenta también como del reveal
    var revEnd = revealAt === null ? null : Math.min(revealAt + 3000, gestureAt === null ? Infinity : gestureAt);
    var revealGap = revealAt === null ? null : worstIn(revealAt - 300, revEnd);
    var scrollGap = gestureAt === null ? null : worstIn(gestureAt, gestureAt + 2500);

    // guarda la corrida una vez: 2.5 s después del gesto (o 12 s sin scroll).
    // Nunca con un cuadro pendiente (t - last grande = el hueco aún no está en gaps)
    if (!recorded && revealAt !== null && t - last < 100 &&
        ((gestureAt !== null && t > gestureAt + 2500) || t > revealAt + 12000)) {
      recorded = true;
      record({ m: mode, rg: Math.round(revealGap || 0), sg: scrollGap == null ? null : Math.round(scrollGap),
               sb: scrollBeforeReveal, y0: y0, w: Math.round(worst) });
    }

    var runs = history().filter(function (r) { return r.m === mode; });
    // el A/B se lee SOLO sobre corridas limpias (sin tocar antes del reveal, desde arriba, con scroll)
    var clean = runs.filter(function (r) { return !r.sb && !r.y0 && r.sg != null; });
    var freezes = clean.filter(function (r) { return Math.max(r.rg || 0, r.sg || 0) >= 1000; }).length;
    var worstRun = clean.reduce(function (a, r) { return Math.max(a, r.rg || 0, r.sg || 0); }, 0);

    var rz = resizes.map(function (r) {
      return (revealAt === null ? "" : (r[0] >= revealAt ? "+" : "")) +
             (revealAt === null ? sec(r[0]) : ((r[0] - revealAt) / 1000).toFixed(1) + "s") + "→" + r[1];
    }).join("  ");

    var lines = [
      "MV sonda · modo " + (legacy ? "LEGACY (antes)" : "2a (lvh + filtro)"),
      "reveal a los " + sec(revealAt) + (scrollBeforeReveal ? "  ⚠ scroll ANTES del reveal (no cuenta)" :
        (y0 ? "  ⚠ no empezó arriba (no cuenta)" : "")),
      "reveal:       " + ms(revealGap) + (revealGap == null ? "" : "  " + verdict(revealGap)),
      "1er scroll:   " + ms(scrollGap) + (scrollGap == null ? "  (scrollea después del título)" : "  " + verdict(scrollGap)),
      "peor total:   " + ms(worst) + " a los " + sec(worstAt),
      "canvas: " + (st.reallocs || 0) + " realloc · " + (st.resizes || 0) + " resize · k " + (st.k ? st.k.toFixed(3) : "1"),
      "alto visible " + window.innerHeight + " · canvas " + ((document.querySelector("[data-fx-back]") || {}).clientHeight || "—"),
      rz ? "resizes: " + rz : "resizes: ninguno",
      "HISTORIAL " + mode + ": " + runs.length + " corridas · " + clean.length + " limpias · " +
        freezes + " congel. (en limpias) · peor " + ms(worstRun)
    ];
    box.textContent = lines.join("\n");
  }
  setInterval(render, 400);
})();
