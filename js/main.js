/* ============================================================
   MV DESIGN · WEB — Orquestación
   Lenis (smooth) + GSAP ScrollTrigger (pin/scrub) + reveals.
   Timings y easings del DS: dur-3 380ms entradas, ease-out.
   ============================================================ */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var osReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // "Pausar movimiento" (WCAG 2.2.2): la elección se recuerda y lleva a la versión estática
  var motionOff = docEl.classList.contains("motion-off");
  var reduced = osReduced || motionOff;

  /* Sonda de arranque (?debug=1): mide en el teléfono real si el reveal se traba.
     Nunca se carga sin ?debug; con ?debug tampoco se envía analítica (MV_TRACK). */
  if (/[?&]debug=/.test(location.search)) {
    var probe = document.createElement("script");
    probe.async = false;
    probe.src = "js/probe.js?v=8";
    document.head.appendChild(probe);
  }
  function announceReveal() {
    window.MV_REVEAL_AT = performance.now(); // por si la sonda carga después del reveal
    try { window.dispatchEvent(new Event("mv:reveal")); } catch (e) {}
  }
  if (reduced) docEl.classList.add("no-motion");

  /* Forzar la carga de las fuentes de los títulos AHORA (durante el loader). El
     título está oculto (opacity:0), así que el navegador DIFIERE cargar su fuente
     hasta que se ve (al revelar) — y "vendes" es itálica (archivo aparte). Si esa
     fuente carga al revelar → dispara document.fonts.ready → ScrollTrigger.refresh
     (recalcula 41 triggers + hero pineado = 1-2s) JUSTO en la animación del título
     = el freeze en móvil. Pidiéndolas ya, cargan detrás del loader y el refresh
     ocurre ahí, no al revelar. */
  if (document.fonts && document.fonts.load) {
    try {
      document.fonts.load("700 1em Montserrat");
      document.fonts.load("italic 700 1em Montserrat");
      document.fonts.load("600 1em Montserrat");
      document.fonts.load("italic 600 1em Montserrat");
    } catch (e) {}
  }

  var EASE = "mv-out"; // cubic-bezier(.20,.80,.25,1) del DS (registrada abajo)

  /* ---------- Año ---------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Nav ---------- */
  var nav = document.querySelector("[data-nav]");
  var navLinks = document.querySelector("[data-nav-links]");
  var navToggle = document.querySelector("[data-nav-toggle]");
  var lastY = 0;

  function onScrollNav(y) {
    nav.setAttribute("data-scrolled", y > 40 ? "true" : "false");
    var goingDown = y > lastY && y > window.innerHeight * 0.8;
    nav.setAttribute("data-hidden", goingDown && document.body.getAttribute("data-nav-open") !== "true" ? "true" : "false");
    lastY = y;
  }

  /* Menú móvil accesible (DS 2.0): Escape cierra, el resto de la página queda
     inerte mientras está abierto, el scroll se detiene y el foco vuelve al botón. */
  var menuInert = [document.querySelector("main"), document.querySelector(".footer"), document.querySelector("[data-wa-float]"), document.querySelector(".nav__brand"), document.querySelector(".skip-link")];
  function setMenu(open, returnFocus) {
    if (!navToggle || !navLinks) return;
    navLinks.setAttribute("data-open", String(open));
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    document.body.setAttribute("data-nav-open", String(open));
    menuInert.forEach(function (el) {
      if (!el) return;
      if (open) { el.setAttribute("inert", ""); el.setAttribute("data-menu-inert", ""); }
      else if (el.hasAttribute("data-menu-inert")) {
        el.removeAttribute("data-menu-inert");
        // el flotante maneja su propio inert (visible/oculto): no se lo quitamos si lo tenía
        if (!(el.hasAttribute("data-wa-float") && !el.classList.contains("is-visible"))) el.removeAttribute("inert");
      }
    });
    if (window.__lenis) { if (open) window.__lenis.stop(); else window.__lenis.start(); }
    if (open) { var first = navLinks.querySelector("a"); if (first) first.focus({ preventScroll: true }); }
    else if (returnFocus) navToggle.focus({ preventScroll: true });
  }
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setMenu(navLinks.getAttribute("data-open") !== "true", true);
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { if (navLinks.getAttribute("data-open") === "true") setMenu(false, false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navLinks.getAttribute("data-open") === "true") setMenu(false, true);
    });
    // si el menú está abierto y la ventana pasa de 860 px (girar el iPad), se cierra
    var mqMenu = window.matchMedia("(max-width: 860px)");
    var onMqMenu = function (e) { if (!e.matches && navLinks.getAttribute("data-open") === "true") setMenu(false, false); };
    if (mqMenu.addEventListener) mqMenu.addEventListener("change", onMqMenu); else if (mqMenu.addListener) mqMenu.addListener(onMqMenu);
  }

  /* "Pausar movimiento": estado del botón y cambio (recarga a la versión estática) */
  // El nombre del botón dice la acción ("Pausar…" / "Reanudar…"); sin aria-pressed
  // para que el lector no anuncie un estado contradictorio.
  document.querySelectorAll("[data-motion-toggle]").forEach(function (btn) {
    if (osReduced) { btn.hidden = true; return; } // el sistema ya pidió menos movimiento
    var label = btn.querySelector(".motion-toggle__label") || btn;
    label.textContent = motionOff ? "Reanudar movimiento" : "Pausar movimiento";
    if (btn.classList.contains("motion-toggle")) btn.title = label.textContent;
    btn.addEventListener("click", function () {
      var ok = true;
      try {
        if (motionOff) localStorage.removeItem("mv-motion"); else localStorage.setItem("mv-motion", "off");
      } catch (e) { ok = false; }
      try { sessionStorage.setItem("mv-motion-focus", btn.classList.contains("footer__motion") ? "footer" : "nav"); } catch (e) {}
      // si el navegador no deja guardar (p. ej. Safari privado), la elección viaja en la URL
      var u = new URL(location.href);
      if (motionOff) u.searchParams.delete("motion"); else if (!ok) u.searchParams.set("motion", "off");
      if (u.href !== location.href) location.replace(u.href); else location.reload();
    });
  });
  // tras recargar, el foco vuelve al botón que se usó
  try {
    var mf = sessionStorage.getItem("mv-motion-focus");
    if (mf) {
      sessionStorage.removeItem("mv-motion-focus");
      var mt = mf === "footer" ? document.querySelector(".footer__motion")
        : (window.matchMedia("(max-width: 860px)").matches ? navToggle : document.querySelector(".motion-toggle"));
      if (mt && !mt.hidden) mt.focus({ preventScroll: true });
    }
  } catch (e) {}

  /* Correo: en desktop, además de abrir el cliente de correo, se copia al
     portapapeles y se avisa "Correo copiado" (mucha gente no tiene cliente). */
  (function () {
    if (!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches)) return;
    if (!(navigator.clipboard && navigator.clipboard.writeText)) return;
    // la región viva existe (vacía) desde el inicio: así el lector sí anuncia el aviso
    var toast = document.createElement("div");
    toast.className = "toast"; toast.setAttribute("role", "status"); toast.setAttribute("aria-atomic", "true");
    document.body.appendChild(toast);
    var hideT = null, sayT = null;
    function say(msg) {
      clearTimeout(sayT); clearTimeout(hideT);
      toast.textContent = "";
      sayT = setTimeout(function () {
        toast.textContent = msg; toast.classList.add("is-on");
        hideT = setTimeout(function () { toast.classList.remove("is-on"); toast.textContent = ""; }, 1800);
      }, 100);
    }
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (!a) return;
      var mail = a.getAttribute("href").replace(/^mailto:/, "").split("?")[0];
      navigator.clipboard.writeText(mail).then(function () {
        say("Correo copiado: " + mail);
        if (typeof gtag === "function") gtag("event", "copy_contact", { method: "Correo", cta_location: a.getAttribute("data-cta") || "sin-etiqueta" });
      }, function () {});
    });
  })();

  /* traza un ícono una sola vez y lo deja fijo al terminar */
  function drawIcon(ico) {
    if (ico.classList.contains("is-drawn")) return;
    ico.classList.add("is-drawn");
    var left = ico.querySelectorAll("svg *").length;
    ico.addEventListener("animationend", function onEnd(ev) {
      if (ev.animationName !== "icoDrawFast") return;
      if (--left <= 0) { ico.classList.add("is-done"); ico.removeEventListener("animationend", onEnd); }
    });
    setTimeout(function () { ico.classList.add("is-done"); }, 2000); // respaldo
  }

  /* ---------- Split de palabras (preserva .grad) ---------- */
  // inner = true: cada palabra lleva un .wi adentro que se desliza dentro de la
  // máscara estática del .w (máscara de línea en CSS, ver el h1 del hero)
  function splitWords(el, inner) {
    var nodes = Array.prototype.slice.call(el.childNodes);
    el.textContent = "";
    var n = 0;
    function word(content) {
      var w = document.createElement("span");
      w.className = "w";
      var host = w;
      if (inner) {
        host = document.createElement("span"); host.className = "wi";
        w.appendChild(host); w.style.setProperty("--i", n);
      }
      if (typeof content === "string") host.textContent = content; else host.appendChild(content);
      el.appendChild(w); n++;
    }
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (chunk) {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { el.appendChild(document.createTextNode(" ")); return; }
          word(chunk);
        });
      } else if (node.nodeType === 1) {
        word(node);
      }
    });
    return el.querySelectorAll(".w");
  }

  var wordSets = [];
  document.querySelectorAll("[data-words]").forEach(function (el) {
    wordSets.push({ el: el, words: splitWords(el, el.classList.contains("hero__title")) });
  });
  docEl.classList.add("mv-split"); // el h1 ya está partido: el CSS deja de ocultarlo

  /* ---------- Nav: pastilla que marca el capítulo en el que estás (desktop) ----------
     Va antes de la rama estática: aria-current funciona también sin movimiento. */
  (function () {
    var links = navLinks ? Array.prototype.slice.call(navLinks.querySelectorAll('.nav__link[href^="#"]')) : [];
    if (!links.length || !("IntersectionObserver" in window)) return;
    var pill = document.createElement("span");
    pill.className = "nav__pill"; pill.setAttribute("aria-hidden", "true");
    navLinks.insertBefore(pill, navLinks.firstChild);
    var current = null;
    function place(a) {
      if (a === current) return;
      links.forEach(function (l) { if (l === a) l.setAttribute("aria-current", "location"); else l.removeAttribute("aria-current"); });
      current = a;
      if (!a) { pill.classList.remove("is-on"); return; }
      pill.style.setProperty("--px", (a.offsetLeft - 14) + "px");
      pill.style.setProperty("--pw", (a.offsetWidth + 28) + "px");
      pill.classList.add("is-on");
    }
    var bySection = {};
    links.forEach(function (a) { var s = document.querySelector(a.getAttribute("href")); if (s) bySection[s.id] = a; });
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var active = null;
      links.forEach(function (a) { var id = a.getAttribute("href").slice(1); if (visible[id]) active = a; });
      place(active);
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(bySection).forEach(function (id) { io.observe(document.getElementById(id)); });
    window.addEventListener("resize", function () { var a = current; current = null; place(a); });
  })();

  /* ---------- Sin GSAP (o reduced): todo visible y fuera ----------
     OJO: aquí 'pre' todavía no existe (se declara más abajo) e introHero necesita
     GSAP, así que no se llama introHero: se quita el velo directo. Antes el velo
     se quedaba encima y bloqueaba TODOS los clics, incluido WhatsApp. */
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined" || reduced) {
    docEl.classList.add("no-motion"); // títulos y reveals visibles por CSS aunque falte GSAP
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
    if (window.MVHERO) window.MVHERO.setProgress(1);
    var preEl = document.querySelector("[data-preloader]");
    if (preEl) preEl.classList.add("is-done");
    // versión estática: el nav toma fondo al hacer scroll (sin ocultarse)
    if (nav) {
      var onStaticScroll = function () { nav.setAttribute("data-scrolled", window.scrollY > 40 ? "true" : "false"); };
      window.addEventListener("scroll", onStaticScroll, { passive: true });
      onStaticScroll();
    }
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* Curvas del DS 2.0 compartidas con el CSS (tokens.css --ease-mv-*): GSAP usa
     exactamente las mismas cubic-bezier, sin plugins extra. */
  function cubicBezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function curve(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {              // Newton-Raphson
        var s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break;
        t -= (curve(t, x1, x2) - x) / s;
      }
      if (t < 0 || t > 1 || Math.abs(curve(t, x1, x2) - x) > 1e-4) { // respaldo: bisección
        var lo = 0, hi = 1; t = x;
        for (var j = 0; j < 30; j++) { var v = curve(t, x1, x2); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      }
      return curve(t, y1, y2);
    };
  }
  var MV_EASES = {
    "mv-out": [.20, .80, .25, 1], "mv-expo": [.16, 1, .3, 1], "mv-in": [.55, 0, .75, .20],
    "mv-move": [.65, 0, .35, 1], "mv-drift": [.37, 0, .63, 1]
  };
  Object.keys(MV_EASES).forEach(function (k) {
    var p = MV_EASES[k];
    if (gsap.registerEase) gsap.registerEase(k, cubicBezier(p[0], p[1], p[2], p[3]));
  });
  gsap.defaults({ ease: EASE });

  /* ---------- Lenis ---------- */
  var lenis = null;
  if (typeof Lenis !== "undefined") {
    // lento y cinematográfico: las animaciones se aprecian
    lenis = new Lenis({
      duration: 1.75,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.4,
      easing: function (t) { return 1 - Math.pow(1 - t, 3); }
    });
    lenis.on("scroll", function (e) {
      ScrollTrigger.update();
      onScrollNav(e.scroll);
    });
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis; // control programático (dev / deep-links)

    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var id = a.getAttribute("href");
        if (id.length > 1 && document.querySelector(id)) {
          ev.preventDefault();
          lenis.scrollTo(id, { offset: -70 });
          // el foco va al destino (lector de pantalla y teclado siguen desde ahí)
          var tgt = document.querySelector(id);
          if (!tgt.matches("a, button, input, select, textarea, [tabindex]")) tgt.setAttribute("tabindex", "-1");
          tgt.focus({ preventScroll: true });
        }
      });
    });
  } else {
    window.addEventListener("scroll", function () { onScrollNav(window.scrollY); }, { passive: true });
  }

  /* ---------- ScrollTrigger: ignorar el resize de la barra de URL del navegador
     móvil (iOS/Android). Es la causa del "salto" al cambiar de dirección de scroll:
     la barra aparece/desaparece → cambia el alto del viewport → ScrollTrigger
     recalcula scrubs/pines. Con esto los ignora y el scroll se queda en su sitio. */
  if (typeof ScrollTrigger !== "undefined") {
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ---------- Preloader (intro) ----------
     La M se escribe en CSS (~1 s, index.html + components.css). El velo se va en
     cuanto el cometa pintó su primer cuadro Y el trazo terminó; cualquier toque,
     tecla o scroll lo termina antes. Sin espera forzada: el mínimo de 5 s del
     celular era un parche contra el congelamiento (causa real: el blur de .cosmos).
     Los shaders se compilan en el setup de hero3d.js (compile + primer render) y
     'mvhero:painted' espera a que la GPU termine ese cuadro (fence WebGL2, tope
     1.5 s; sin WebGL2 avisa en el primer frame). */
  var pre = document.querySelector("[data-preloader]");
  var preDone = false;
  var phoneMode = !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  var INTRO_INPUTS = ["touchstart", "pointerdown", "wheel", "keydown", "scroll"];

  function finishPreloader(instant) {
    if (preDone || !pre) return;
    preDone = true;
    INTRO_INPUTS.forEach(function (ev) { window.removeEventListener(ev, onIntroInput, true); });
    // celular: abrir con las partículas ya en reposo (no espera nada: syncFx fija
    // el objetivo según el scroll y settleNow clava shown = target en este instante)
    if (phoneMode && window.MVHERO && window.MVHERO.settleNow) { syncFx(); window.MVHERO.settleNow(); }
    if (instant) pre.classList.add("is-instant");
    pre.classList.add("is-done");
    announceReveal();
    if (instant) introHero(true);
    else setTimeout(introHero, 250);
  }
  function onIntroInput() { finishPreloader(false); }

  var cometReady = !window.MVHERO || !!window.MVHERO.painted; // sin WebGL no hay cometa que esperar
  var traced = false;
  function tryFinish() {
    if (cometReady && traced) setTimeout(function () { finishPreloader(false); }, 150);
  }
  function onTraced() { if (!traced) { traced = true; tryFinish(); } }
  if (!cometReady) {
    window.addEventListener("mvhero:painted", function () { cometReady = true; tryFinish(); }, { once: true });
  }
  // fin del trazo: la animación del último punto (puede haber terminado antes de este script)
  var lastStroke = pre && pre.querySelector("[data-pl-last]");
  var strokeAnims = (lastStroke && lastStroke.getAnimations) ? lastStroke.getAnimations() : [];
  if (strokeAnims.length && strokeAnims[0].finished) strokeAnims[0].finished.then(onTraced, onTraced);
  else if (lastStroke) lastStroke.addEventListener("animationend", onTraced, { once: true });
  setTimeout(onTraced, 1800);                                            // si la animación no corre
  window.addEventListener("load", function () { setTimeout(function () { finishPreloader(false); }, 3000); }); // red de seguridad
  INTRO_INPUTS.forEach(function (ev) { window.addEventListener(ev, onIntroInput, { passive: true, capture: true }); });

  /* ---------- Hero: intro + scrub de ensamble ---------- */

  function introHero(instant) {
    // el h1 entra en CSS (keyframes de transform en el compositor, fase 2f): aunque
    // el hilo principal se trabe, el título no se congela. Mismo gesto en celular y desktop.
    var h1 = document.querySelector(".hero__title");
    if (h1) h1.classList.add(instant ? "is-instant" : "is-in");
    gsap.to(".hero [data-reveal]", {
      opacity: 1, y: 0, duration: instant ? 0 : 0.8, ease: EASE, stagger: 0.12, delay: instant ? 0 : 0.35
    });
  }

  var heroBar = document.querySelector("[data-hero-bar]");
  var heroPhase = document.querySelector("[data-hero-phase]");

  function fx(state) { if (window.MVHERO && window.MVHERO.setState) window.MVHERO.setState(state); }

  /* Hero — dos vueltas continuas hacia la derecha:
     0→55%: se ensambla durante la 1ª vuelta
     55→84%: 2ª vuelta ya formado
     84→100%: al 75% de la 2ª vuelta se disuelve en línea wavy */
  function heroMap(p) {
    return {
      // arranca ya al 40% ensamblado y completa lento (cinemático)
      asm: Math.min(0.4 + (p / 0.62) * 0.6, 1),
      spn: p,
      wvh: Math.max(0, (p - 0.84) / 0.16) * 0.7
    };
  }
  var stHero = ScrollTrigger.create({
    trigger: "[data-hero]",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: function (st) {
      var p = st.progress;
      var m = heroMap(p);
      if (heroBar) heroBar.style.transform = "scaleX(" + p + ")";
      if (heroPhase) {
        heroPhase.textContent =
          m.asm < 1 ? "ENSAMBLANDO · " + String(Math.round(m.asm * 100)).padStart(3, "0") + "%"
          : p < 0.84 ? "ÓRBITA · SEGUNDA VUELTA"
          : "DISOLVIENDO · EN RUTA";
      }
    }
  });

  /* Fase 3 (manifiesto): completa la disolución iniciada en el hero */
  var stWave = ScrollTrigger.create({
    trigger: "#manifiesto",
    start: "top 98%",
    end: "top 45%",
    scrub: 0.4
  });

  /* Fase 4 (journey): la RUTA del cometa — visita los elementos reales,
     serpenteando (dx/dy en fracción de viewport) para guiar la lectura */
  if (window.MVHERO && window.MVHERO.setRoute) {
    var q1 = function (s) { return document.querySelector(s); };
    var qa1 = function (s) { return document.querySelectorAll(s); };
    var steps = qa1("[data-step]");
    var cases = qa1(".case");
    window.MVHERO.setRoute([
      // parada 0: el lugar EXACTO donde el M se disuelve (sin saltos)
      { el: q1(".hero__stage"), dx: window.innerWidth < 860 ? 0 : 0.28, dy: -0.03 },
      { el: q1("#manifiesto .eyebrow"), dx: 0.30, dy: -0.05 },
      { el: q1("#manifiesto .manifesto__line"), dx: 0.30, dy: 0.05 },
      { el: q1(".manifesto__foot"), dx: -0.18, dy: 0.04 },
      { el: q1("#servicios .services__head .h2"), dx: 0.26 },
      { el: q1("[data-services-track]"), dx: 0, dy: 0.10 },
      // El Método: el cometa se ENTRELAZA con las cinco etapas (zigzag)
      { el: q1("#proceso .process__head .h2"), dx: 0.28, dy: -0.02 },
      { el: steps[0], dx: 0.18 },
      { el: steps[1], dx: -0.20 },
      { el: steps[2], dx: 0.22 },
      { el: steps[3], dx: -0.18 },
      { el: steps[4], dx: 0.20 },
      { el: q1("#casos .work__head .h2"), dx: 0.24, dy: -0.02 },
      { el: q1(".case--wide"), dx: -0.12, dy: 0.02 },
      { el: cases[2] || cases[0], dx: 0.18 },
      { el: q1("#paquetes .tiers__head .h2"), dx: 0.26, dy: -0.02 },
      { el: q1(".tier--featured"), dx: -0.02, dy: -0.04 },
      { el: q1("[data-cta-anchor]"), dx: 0, dy: 0 }
    ]);
  }
  var stJourney = ScrollTrigger.create({
    trigger: "#manifiesto",
    start: "top 60%",
    endTrigger: "#contacto",
    end: "top 45%",
    scrub: 0.6
  });

  /* Fase 5 (CTA): el enjambre se re-arma ANCLADO a la sección — completa
     cuando el bloque queda a la vista y de ahí scrollea con la página */
  if (window.MVHERO && window.MVHERO.setCtaAnchor) {
    window.MVHERO.setCtaAnchor(document.querySelector("[data-cta-anchor]"));
  }
  /* el ensamble final se VE completo: el progreso sale del rect VIVO de la
     sección (ScrollTrigger no compensa bien el spacer del pin para este
     trigger — medido: 1,527px de error que ningún refresh corrige) */
  var ctaSection = document.querySelector("#contacto");
  function reformProgress() {
    var top = ctaSection.getBoundingClientRect().top;
    var vh = window.innerHeight;
    // 0 cuando la sección asoma al 55% del viewport · 1 cuando llega al 4%
    return Math.max(0, Math.min(1, (0.55 * vh - top) / (0.51 * vh)));
  }

  /* Sincroniza los estados FX con la posición real del scroll.
     Se llama en CADA tick (los onUpdate por sí solos se quedan con
     valores viejos si la página carga ya scrolleada o tras un refresh
     que recalcula los pins). Leer .progress es barato. */
  function syncFx() {
    var m = heroMap(stHero.progress);
    fx({
      assemble: m.asm,
      spin: m.spn,
      // la disolución arranca en la cola del hero y la completa el manifiesto
      wave: Math.max(m.wvh, stWave.progress),
      journey: stJourney.progress,
      reform: reformProgress()
    });
  }
  if (lenis) lenis.on("scroll", syncFx);
  else window.addEventListener("scroll", syncFx, { passive: true });
  ScrollTrigger.addEventListener("refresh", function () { requestAnimationFrame(syncFx); });
  window.addEventListener("load", function () { setTimeout(syncFx, 250); });

  /* ---------- Reveals genéricos ---------- */
  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    if (el.closest(".hero")) return; // el hero tiene su intro propia
    var delay = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
    gsap.to(el, {
      opacity: 1, y: 0, duration: 0.8, ease: EASE, delay: delay,
      scrollTrigger: { trigger: el, start: "top 86%" },
      // el ícono se traza junto con la entrada de su card (no mientras sigue invisible)
      onStart: function () { el.querySelectorAll(".mft__ico, .svc__ico").forEach(drawIcon); }
    });
  });

  /* ---------- Títulos por palabras (fuera del hero) ---------- */
  wordSets.forEach(function (set, idx) {
    if (idx === 0) return;
    var sv = { y: 0, duration: 0.85, ease: EASE, stagger: 0.06, scrollTrigger: { trigger: set.el, start: "top 84%" } };
    if (phoneMode) { sv.opacity = 1; } else { sv.clipPath = "inset(0 0 -10% 0)"; }
    gsap.to(set.words, sv);
  });

  /* ---------- Servicios: horizontal pinned ---------- */
  var svcSection = document.querySelector("[data-services]");
  var svcPin = document.querySelector("[data-services-pin]");
  var svcTrack = document.querySelector("[data-services-track]");
  var svcBar = document.querySelector("[data-services-bar]");

  function setupHorizontal() {
    if (!svcSection || window.innerWidth < 860) return null;
    var dist = svcTrack.scrollWidth - window.innerWidth;
    if (dist <= 0) return null;
    return gsap.to(svcTrack, {
      x: function () { return -(svcTrack.scrollWidth - window.innerWidth); }, ease: "none",
      scrollTrigger: {
        trigger: svcSection,
        start: "top top",
        end: function () { return "+=" + (svcTrack.scrollWidth - window.innerWidth); },
        scrub: 0.6,
        pin: svcPin,
        anticipatePin: 1,
        // enciende el orden por posición en cada refresh: los triggers de más abajo
        // (Proceso, Casos, Paquetes, Contacto) suman el espacio del pin. Sin esto sus
        // entradas ocurrían ~2,150 px antes, fuera de pantalla (desktop)
        refreshPriority: 0,
        invalidateOnRefresh: true,
        onUpdate: function (st) {
          if (svcBar) svcBar.style.transform = "scaleX(" + st.progress + ")";
          fx({ flow: st.progress }); // la corriente fluye con el scroll horizontal
          svcScrollPose();           // y las fichas giran según su posición
        }
      }
    });
  }
  var horizTween = setupHorizontal();

  var lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    if (Math.abs(window.innerWidth - lastW) < 80) return;
    lastW = window.innerWidth;
    if (horizTween) { horizTween.scrollTrigger.kill(); horizTween.kill(); gsap.set(svcTrack, { x: 0 }); }
    horizTween = setupHorizontal();
    ScrollTrigger.refresh();
  });

  /* ---------- Proceso: riel + nodos ---------- */
  var rail = document.querySelector("[data-process-rail]");
  var processList = document.querySelector("[data-process]");
  if (rail && processList) {
    gsap.fromTo(rail, { scaleY: 0 }, {
      scaleY: 1, ease: "none",
      scrollTrigger: { trigger: processList, start: "top 72%", end: "bottom 55%", scrub: 0.4 }
    });
    document.querySelectorAll("[data-step]").forEach(function (step) {
      ScrollTrigger.create({
        trigger: step, start: "top 62%",
        onEnter: function () { step.classList.add("is-active"); },
        onLeaveBack: function () { step.classList.remove("is-active"); }
      });
    });
  }

  /* ---------- Casos: parallax sutil ---------- */
  document.querySelectorAll("[data-parallax]").forEach(function (media) {
    gsap.fromTo(media, { yPercent: -6 }, {
      yPercent: 6, ease: "none",
      scrollTrigger: { trigger: media.closest(".case"), start: "top bottom", end: "bottom top", scrub: 0.5 }
    });
  });

  /* ---------- Casos: video de fondo diferido (fase 2c) ----------
     Sin autoplay ni precarga: nadie descarga los MB del video hasta acercarse a
     Casos (a 400 px empieza a bajar; se reproduce con el 15% a la vista y se pausa
     al salir). Con "reducir movimiento" o sin JS se queda el póster. */
  (function () {
    var vids = document.querySelectorAll(".case__video");
    if (!vids.length) return;
    if (!("IntersectionObserver" in window)) {
      vids.forEach(function (v) { v.preload = "auto"; v.play().catch(function () {}); });
      return;
    }
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.preload = "auto"; // pasar de none a auto ya inicia la descarga
        near.unobserve(e.target);
      });
    }, { rootMargin: "400px 0px" });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.play().catch(function () {}); }
        else { e.target.pause(); }
      });
    }, { threshold: 0.15 });
    vids.forEach(function (v) { near.observe(v); io.observe(v); });
  })();

  /* ---------- Brandstrip (logos): solo corre cuando está en viewport ----------
     El cometa ya tiene 2 canvas WebGL; no vale la pena gastar el slider cuando
     no se ve. (La máscara es estática; esto solo pausa el transform.) */
  (function () {
    var strips = document.querySelectorAll(".brandstrip");
    if (!strips.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var svg = e.target.querySelector(".brandstrip__svg");
        // "" deja que mande el CSS (corre, salvo :hover); "paused" cuando no se ve
        if (svg) svg.style.animationPlayState = e.isIntersecting ? "" : "paused";
      });
    }, { rootMargin: "150px 0px" });
    strips.forEach(function (s) { io.observe(s); });
  })();

  /* ---------- Cards: brillo en el borde que sigue al cursor (DS 2.0) ----------
     Solo con mouse o trackpad. El tilt 3D quedó solo en Casos (3°): el tilt en
     todas las familias de cards se descartó por cliché. */
  var finePointer = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  function addSpotlight(sel, maxDeg) {
    if (!finePointer) return;
    document.querySelectorAll(sel).forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width * 2 - 1;
        var ny = (e.clientY - r.top) / r.height * 2 - 1;
        if (maxDeg) {
          card.style.setProperty("--ty", (nx * maxDeg).toFixed(2) + "deg");
          card.style.setProperty("--tx", (-ny * maxDeg * 0.7).toFixed(2) + "deg");
        }
        card.style.setProperty("--mx", ((nx + 1) * 50).toFixed(1) + "%");
        card.style.setProperty("--my", ((ny + 1) * 50).toFixed(1) + "%");
      });
      if (maxDeg) card.addEventListener("pointerleave", function () {
        card.style.setProperty("--ty", "0deg");
        card.style.setProperty("--tx", "0deg");
      });
    });
  }
  addSpotlight(".svc", 0);
  addSpotlight(".case", 3);
  addSpotlight(".tier", 0);
  addSpotlight(".mft", 0);

  /* ---------- Imán sutil en 3 CTAs (DS 2.0): hero, Contacto y flotante ----------
     Solo con mouse; 7 px como máximo. Se mueve el contenido, nunca el <a>. */
  if (finePointer) {
    document.querySelectorAll("[data-magnet]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        gsap.to(el, { "--mgx": (dx * 7).toFixed(1) + "px", "--mgy": (dy * 5).toFixed(1) + "px", duration: 0.35, overwrite: "auto" });
      });
      el.addEventListener("pointerleave", function () {
        gsap.to(el, { "--mgx": "0px", "--mgy": "0px", duration: 0.5, overwrite: "auto" });
      });
    });
  }
  // iOS solo aplica :active (estado presionado) si la página escucha touchstart
  document.addEventListener("touchstart", function () {}, { passive: true });

  /* ---------- Íconos: se trazan UNA vez al entrar en pantalla (DS 2.0) ----------
     Los que están dentro de una card con reveal se trazan con su entrada (onStart
     arriba); el resto, al verse. Al terminar quedan fijos (is-done): el hover los
     vuelve a trazar, pero al salir no se redibujan desde cero. */
  (function () {
    var icons = document.querySelectorAll(".svc__ico, .mft__ico");
    if (!icons.length) return;
    if (!("IntersectionObserver" in window)) { icons.forEach(drawIcon); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        drawIcon(e.target); io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    icons.forEach(function (i) { var r = i.closest("[data-reveal]"); if (!r || r.closest(".hero")) io.observe(i); });
  })();

  /* Servicios: las fichas giran sutilmente según su posición durante el scroll */
  var svcCards = Array.prototype.slice.call(document.querySelectorAll(".svc"));
  function svcScrollPose() {
    if (!svcCards) return; // el ST puede disparar antes de la asignación
    var cx = window.innerWidth / 2;
    svcCards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      if (r.right < -100 || r.left > window.innerWidth + 100) return;
      var c = (r.left + r.width / 2 - cx) / window.innerWidth;
      card.style.setProperty("--sry", (c * 16).toFixed(2) + "deg");
    });
  }

  /* ---------- Sin intro si llegas a una sección (#servicios) o regresas con "Atrás" ---------- */
  (function () {
    var nav = (window.performance && performance.getEntriesByType) ? performance.getEntriesByType("navigation")[0] : null;
    var deepLink = false;
    if (location.hash.length > 1) { try { deepLink = !!document.querySelector(location.hash); } catch (e) {} }
    if (deepLink || (nav && nav.type === "back_forward")) finishPreloader(true);
  })();

  /* ---------- Recalcular triggers solo cuando el layout cambia (fase 2b) ----------
     Antes: refresh en load + fuentes + a los 1.5 y 3.5 s "por si acaso" (5 en los
     primeros segundos, y los tardíos podían caer con el usuario ya scrolleando).
     Ahora ScrollTrigger hace su refresh propio en load y, después, solo se
     recalcula si el alto de la página cambió de verdad (fuentes, imágenes),
     nunca con un scroll en curso y como máximo uno cada 2 s. */
  (function () {
    var mainEl = document.querySelector("main") || document.body;
    var lastRefresh = 0, timer = null, lastScrollAt = 0, hAtRefresh = -1, force = false, fontsAt = -1;
    window.addEventListener("scroll", function () { lastScrollAt = performance.now(); }, { passive: true });
    function run() {
      if (force && lastRefresh > fontsAt) force = false; // un refresh posterior ya midió con las fuentes
      // otro refresh ya midió este layout (el del pin, el de load, el de resize): nada que hacer
      if (!force && mainEl.offsetHeight === hAtRefresh) { timer = null; return; }
      var now = performance.now();
      // 700 ms > el scrub más largo (0.6 s): no se interrumpe un scrub en curso
      if (now - lastScrollAt < 700 || now - lastRefresh < 2000) { timer = setTimeout(run, 250); return; }
      timer = null; force = false; lastRefresh = now;
      ScrollTrigger.refresh();
    }
    function safeRefresh(forced) { if (forced) force = true; if (!timer) timer = setTimeout(run, 250); }
    ScrollTrigger.addEventListener("refresh", function () { lastRefresh = performance.now(); hAtRefresh = mainEl.offsetHeight; });
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () { safeRefresh(false); }).observe(mainEl);
    }
    // si las fuentes terminaron DESPUÉS del último refresh, pueden cambiar anchos sin cambiar el alto
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fontsAt = performance.now(); safeRefresh(true); });
    }
  })();
})();
