/* ============================================================
   MV DESIGN · Sonda de arranque (solo con ?debug=…)
   ?debug=1            mide el modo actual (con &legacy=1, el anterior a la 2a)
   ?debug=auto         bisección: cada corrida limpia pasa a otra condición
   ?debug=1&cond=X     fuerza una condición (ver PLAN)
   &reset=1            borra el historial y reinicia la ronda
   Prueba: recargar, NO tocar hasta ver el título, deslizar una vez, esperar ~3 s.
   Un congelamiento de 1-3 s aparece como un hueco de 1000-3000 ms entre cuadros.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "mv-probe-v1", CKEY = "mv-probe-cond";
  var PLAN = ["base", "fx0", "noblur", "norefresh", "nocosmos", "nolenis"];
  var LABEL = {
    base: "normal (2a)", fx0: "SIN partículas", noblur: "nav sin blur",
    norefresh: "sin refresh tardíos", nocosmos: "sin nebulosas", nolenis: "sin Lenis"
  };
  var now = function () { return performance.now(); };
  var qs = location.search;
  var legacy = /[?&]legacy=1/.test(qs);
  var auto = /[?&]debug=auto/.test(qs);
  var cond = window.MV_DBG || "base";   // la eligió hero3d.js al cargar (antes que todo)
  var mode = auto ? "auto" : (legacy ? "legacy" : "2a");

  if (/[?&](debug=reset|reset=1)/.test(qs)) {
    try { localStorage.removeItem(KEY); localStorage.removeItem(CKEY); } catch (e) {}
    // el reset es de UNA vez: se quita de la URL para que ↻ no vuelva a borrar la ronda
    try {
      var q2 = qs.replace(/([?&])reset=1(&|$)/, function (m, p1, p2) { return p2 ? p1 : ""; }).replace("debug=reset", "debug=1");
      window.history.replaceState(null, "", location.pathname + q2 + location.hash);
    } catch (e) {}
  }
  // al recargar, que la corrida empiece arriba (sin scroll restaurado que ensucie)
  try {
    if (window.ScrollTrigger && ScrollTrigger.clearScrollMemory) ScrollTrigger.clearScrollMemory("manual");
    else if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch (e) {}

  // condiciones que son solo CSS: se aplican aquí (antes del reveal)
  var CSS = {
    noblur: ".nav,.nav *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}",
    nocosmos: ".cosmos{display:none!important}"
  };
  if (CSS[cond]) {
    var st = document.createElement("style");
    st.textContent = CSS[cond];
    document.head.appendChild(st);
  }

  /* ---------- Registro ---------- */
  var revealAt = null, y0 = null, firstScrollAt = null, gestureAt = null, touchDelay = null;
  var lastGesture = null, lastGestureDelay = 0, scrollBeforeReveal = false, navAt = null;
  var gaps = [], hbGaps = [], slowTicks = [], refreshes = [], resizes = [];
  var worst = 0, frames = 0, last = now(), hidden = false, recorded = false;
  var hbLast = now(), hbHidden = false;

  // gesto real; event.timeStamp = cuándo ocurrió de verdad (aunque el JS lo atienda tarde)
  function onGesture(e) {
    var t = now(), ts = (e && e.timeStamp > 0 && e.timeStamp <= t) ? e.timeStamp : t;
    lastGesture = ts; lastGestureDelay = t - ts;
  }
  ["touchstart", "wheel", "keydown", "pointerdown"].forEach(function (ev) {
    window.addEventListener(ev, onGesture, { passive: true, capture: true });
  });
  window.addEventListener("mv:reveal", function () {
    if (revealAt === null) { revealAt = now(); y0 = Math.round(window.scrollY || 0); }
  });
  window.addEventListener("scroll", function () {
    if (lastGesture === null) return;                       // restaurado/programático
    if (revealAt === null) { scrollBeforeReveal = true; return; }
    if (firstScrollAt === null && lastGesture >= revealAt) {
      firstScrollAt = now(); gestureAt = lastGesture; touchDelay = lastGestureDelay;
    }
  }, { passive: true });
  window.addEventListener("resize", function () {
    resizes.push([now(), window.innerHeight]);
    if (resizes.length > 6) resizes.shift();
  });
  document.addEventListener("visibilitychange", function () { hidden = true; hbHidden = true; });

  // 1) cuadros (rAF): el hueco que ve el usuario
  function tick() {
    var t = now(), gap = t - last;
    last = t; frames++;
    if (hidden || document.hidden) { hidden = document.hidden; }
    else if (frames > 2) {
      if (gap >= 50) gaps.push([t, gap]);
      if (gap > worst) worst = gap;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // 2) latido del hilo principal: si también se detiene, el bloqueo es del hilo
  //    (JS, estilo/layout o una llamada síncrona a la GPU); si no, es composición/GPU
  setInterval(function () {
    var t = now(), g = t - hbLast; hbLast = t;
    if (hbHidden || document.hidden) { hbHidden = document.hidden; return; }
    if (g > 100) hbGaps.push([t, g]);
  }, 20);

  // 3) JS medido: el ticker de GSAP (Lenis + ScrollTrigger + animaciones) y los refresh
  if (window.gsap && gsap.ticker) {
    var tk0 = 0;
    gsap.ticker.add(function () { tk0 = now(); }, false, true);
    gsap.ticker.add(function () { var d = now() - tk0; if (d > 50) slowTicks.push([now(), d]); });
  }
  if (window.ScrollTrigger && ScrollTrigger.addEventListener) {
    var r0 = 0;
    ScrollTrigger.addEventListener("refreshInit", function () { r0 = now(); });
    ScrollTrigger.addEventListener("refresh", function () { refreshes.push([now(), now() - r0]); });
  }
  // 4) el nav se vuelve "vidrio" (backdrop-filter) en el primer scroll
  var nav = document.querySelector("[data-nav]");
  if (nav && window.MutationObserver) {
    new MutationObserver(function () {
      if (navAt === null && revealAt !== null && nav.getAttribute("data-scrolled") === "true") navAt = now();
    }).observe(nav, { attributes: true, attributeFilter: ["data-scrolled"] });
  }

  /* ---------- Análisis ---------- */
  // el peor [fin, duración] que se traslapa con [a, b]
  function maxIn(arr, a, b) {
    var w = 0, at = null;
    for (var i = 0; i < arr.length; i++) {
      var end = arr[i][0], g = arr[i][1];
      if (end - g <= b && end >= a && g > w) { w = g; at = end - g; }
    }
    return { ms: w, start: at };
  }
  function verdict(g) {
    if (g >= 1000) return "✗ CONGELAMIENTO";
    if (g >= 250) return "⚠ tirón";
    return "✓ fluido";
  }
  function ms(v) { return v == null ? "—" : Math.round(v) + " ms"; }
  function rel(t) {
    if (t == null || revealAt === null) return "—";
    var d = (t - revealAt) / 1000;
    return (d >= 0 ? "+" : "") + d.toFixed(2) + "s";
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  function history() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function record(run) {
    try {
      var h = history(); h.push(run);
      if (h.length > 80) h = h.slice(-80);
      localStorage.setItem(KEY, JSON.stringify(h));
    } catch (e) {}
  }
  function isClean(r) { return !r.sb && !r.y0 && r.sg != null; }
  function nextCond(c) { var i = PLAN.indexOf(c); return PLAN[(i < 0 ? 0 : i + 1) % PLAN.length]; }

  var box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = [
    "position:fixed", "left:8px", "top:72px", "z-index:9999", "pointer-events:none",
    "max-width:calc(100vw - 16px)", "padding:7px 9px", "border-radius:8px",
    "background:rgba(0,0,0,.84)", "color:#bff", "white-space:pre-wrap", "overflow-wrap:anywhere",
    "font:10px/1.38 ui-monospace,Menlo,Consolas,monospace"
  ].join(";");
  function mount() { if (document.body && !box.parentNode) document.body.appendChild(box); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  function render() {
    var t = now();
    var st = (window.MVHERO && window.MVHERO.stats) || {};
    // ventana del reveal: hasta el gesto (así un congelamiento del scroll no cuenta doble)
    var revEnd = revealAt === null ? null : Math.min(revealAt + 3000, gestureAt === null ? Infinity : gestureAt);
    var rv = revealAt === null ? null : maxIn(gaps, revealAt - 300, revEnd);
    var w0 = gestureAt, w1 = gestureAt === null ? null : gestureAt + 2500;
    var sc = w0 === null ? null : maxIn(gaps, w0, w1);
    // qué pasaba durante el peor hueco del primer scroll
    var a = (sc && sc.ms) ? sc.start - 50 : w0, b = w1;
    var hb = w0 === null ? null : maxIn(hbGaps, a, b).ms;
    var tk = w0 === null ? null : maxIn(slowTicks, a, b).ms;
    var hf = w0 === null ? null : maxIn(st.slow || [], a, b).ms;
    var rf = w0 === null ? null : maxIn(refreshes, a, b).ms;

    if (!recorded && revealAt !== null && t - last < 100 &&
        ((gestureAt !== null && t > gestureAt + 2500) || t > revealAt + 12000)) {
      recorded = true;
      var run = {
        m: mode, c: cond, rg: Math.round(rv ? rv.ms : 0), sg: sc ? Math.round(sc.ms) : null,
        sb: scrollBeforeReveal, y0: y0, w: Math.round(worst),
        fs: (sc && sc.ms) ? Math.round(sc.start - revealAt) : null,
        td: touchDelay == null ? null : Math.round(touchDelay),
        hb: hb == null ? null : Math.round(hb), tk: tk == null ? null : Math.round(tk),
        hf: hf == null ? null : Math.round(hf), rf: rf == null ? null : Math.round(rf)
      };
      record(run);
      // bisección: solo una corrida LIMPIA avanza a la siguiente condición
      if (auto) { try { localStorage.setItem(CKEY, isClean(run) ? nextCond(cond) : cond); } catch (e) {} }
    }

    var L = [];
    L.push("MV sonda · " + (auto ? "BISECCIÓN · " + (LABEL[cond] || cond)
      : "modo " + (legacy ? "LEGACY (antes)" : "2a") + (cond !== "base" ? " · " + cond : "")));
    L.push("reveal " + (revealAt === null ? "—" : (revealAt / 1000).toFixed(2) + " s") +
      (scrollBeforeReveal ? "  ⚠ scroll ANTES del reveal (no cuenta)" : (y0 ? "  ⚠ no empezó arriba (no cuenta)" : "")));
    L.push("reveal:     " + (rv ? ms(rv.ms) + "  " + verdict(rv.ms) : "—"));
    L.push("1er scroll: " + (sc ? ms(sc.ms) + "  " + verdict(sc.ms) : "—  (desliza después del título)"));
    if (sc && sc.ms >= 250) {
      L.push("  empieza " + rel(sc.start) + " · tu toque " + rel(gestureAt) +
        (touchDelay > 100 ? " (el JS lo vio " + ms(touchDelay) + " tarde)" : ""));
      L.push("  hilo principal: " + (hb >= sc.ms * 0.6 ? "BLOQUEADO " + ms(hb) : "libre (máx " + ms(hb) + ") → composición/GPU"));
      L.push("  JS: ticker " + ms(tk) + " · partículas " + ms(hf) + " · refresh " + ms(rf));
    }
    L.push("nav vidrio " + rel(navAt) + " · canvas " + (st.reallocs || 0) + " realloc · k " + (st.k ? st.k.toFixed(3) : "1"));
    L.push("resizes: " + (resizes.length ? resizes.map(function (r) { return rel(r[0]) + "→" + r[1]; }).join(" ") : "ninguno") +
      " · refresh: " + (refreshes.length ? refreshes.map(function (r) { return rel(r[0] - r[1]) + "(" + Math.round(r[1]) + ")"; }).join(" ") : "—"));

    var h = history();
    if (auto) {
      L.push("── ronda (corridas limpias) ──");
      PLAN.forEach(function (c) {
        var rs = h.filter(function (r) { return r.m === "auto" && r.c === c && isClean(r); });
        var fz = rs.filter(function (r) { return Math.max(r.rg || 0, r.sg || 0) >= 1000; }).length;
        var pk = rs.reduce(function (x, r) { return Math.max(x, r.rg || 0, r.sg || 0); }, 0);
        L.push(pad(LABEL[c], 20) + (rs.length ? rs.length + " · " + fz + " congel · peor " + pk : "pendiente"));
      });
      var nx = null; try { nx = localStorage.getItem(CKEY); } catch (e) {}
      L.push(recorded ? "✓ guardada. Recarga → " + (LABEL[nx] || nx) : "…recarga cuando diga ✓ guardada");
    } else {
      var runs = h.filter(function (r) { return r.m === mode; });
      var clean = runs.filter(isClean);
      var fz2 = clean.filter(function (r) { return Math.max(r.rg || 0, r.sg || 0) >= 1000; }).length;
      var pk2 = clean.reduce(function (x, r) { return Math.max(x, r.rg || 0, r.sg || 0); }, 0);
      L.push("HISTORIAL " + mode + ": " + runs.length + " corridas · " + clean.length + " limpias · " +
        fz2 + " congel. (en limpias) · peor " + ms(pk2));
    }
    box.textContent = L.join("\n");
  }
  setInterval(render, 400);
})();
