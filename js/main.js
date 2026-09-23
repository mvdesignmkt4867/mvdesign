/* ============================================================
   MV DESIGN · WEB — Orquestación
   Lenis (smooth) + GSAP ScrollTrigger (pin/scrub) + reveals.
   Timings y easings del DS: dur-3 380ms entradas, ease-out.
   ============================================================ */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Sonda de arranque (?debug=1): mide en el teléfono real si el reveal se traba.
     Nunca se carga sin ?debug; con ?debug tampoco se envía analítica (MV_TRACK). */
  if (/[?&]debug=/.test(location.search)) {
    var probe = document.createElement("script");
    probe.async = false;
    probe.src = "js/probe.js?v=4";
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

  var EASE = "power3.out"; // ≈ cubic-bezier(.20,.80,.25,1) del DS

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

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.getAttribute("data-open") === "true";
      navLinks.setAttribute("data-open", String(!open));
      navToggle.setAttribute("aria-expanded", String(!open));
      document.body.setAttribute("data-nav-open", String(!open));
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.setAttribute("data-open", "false");
        navToggle.setAttribute("aria-expanded", "false");
        document.body.setAttribute("data-nav-open", "false");
      });
    });
  }

  /* ---------- Split de palabras (preserva .grad) ---------- */
  function splitWords(el) {
    var nodes = Array.prototype.slice.call(el.childNodes);
    el.textContent = "";
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (chunk) {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { el.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span");
          w.className = "w"; w.textContent = chunk;
          el.appendChild(w);
        });
      } else if (node.nodeType === 1) {
        var w2 = document.createElement("span");
        w2.className = "w";
        w2.appendChild(node);
        el.appendChild(w2);
      }
    });
    return el.querySelectorAll(".w");
  }

  var wordSets = [];
  document.querySelectorAll("[data-words]").forEach(function (el) {
    wordSets.push({ el: el, words: splitWords(el) });
  });

  /* ---------- Sin GSAP (o reduced): todo visible y fuera ----------
     OJO: aquí 'pre' todavía no existe (se declara más abajo) e introHero necesita
     GSAP, así que no se llama introHero: se quita el velo directo. Antes el velo
     se quedaba encima y bloqueaba TODOS los clics, incluido WhatsApp. */
  if (typeof gsap === "undefined" || reduced) {
    docEl.classList.add("no-motion"); // títulos y reveals visibles por CSS aunque falte GSAP
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
    if (window.MVHERO) window.MVHERO.setProgress(1);
    var preEl = document.querySelector("[data-preloader]");
    if (preEl) preEl.classList.add("is-done");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

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
     celular era un parche contra el congelamiento (causa real: el blur de .cosmos,
     fase 2c). Los shaders igual se compilan antes (readPixels en hero3d.js). */
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
  var heroTitleWords = wordSets.length ? wordSets[0].words : [];

  function introHero(instant) {
    var d = instant ? 0 : 0.9;
    var hv = { y: 0, duration: instant ? 0 : d, ease: EASE, stagger: instant ? 0 : 0.07, delay: instant ? 0 : 0.05 };
    // móvil: reveal por opacity (compositor); desktop: el wipe original con clip-path
    if (phoneMode) { hv.opacity = 1; } else { hv.clipPath = "inset(0 0 -10% 0)"; }
    gsap.to(heroTitleWords, hv);
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
      scrollTrigger: { trigger: el, start: "top 86%" }
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
      x: -dist, ease: "none",
      scrollTrigger: {
        trigger: svcSection,
        start: "top top",
        end: "+=" + dist,
        scrub: 0.6,
        pin: svcPin,
        anticipatePin: 1,
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

  /* ---------- Casos: video de fondo — play/pause por viewport (no competir
       con el WebGL del cometa) y respeto a prefers-reduced-motion ---------- */
  (function () {
    var vids = document.querySelectorAll(".case__video");
    if (!vids.length) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      vids.forEach(function (v) { v.removeAttribute("autoplay"); v.pause(); });
      return; // se queda el poster fijo
    }
    if (!("IntersectionObserver" in window)) {
      vids.forEach(function (v) { v.play().catch(function () {}); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.play().catch(function () {}); }
        else { e.target.pause(); }
      });
    }, { threshold: 0.15 });
    vids.forEach(function (v) { io.observe(v); });
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

  /* ---------- Cards 3D: tilt con el cursor + brillo que lo sigue ---------- */
  function addTilt(sel, maxDeg) {
    document.querySelectorAll(sel).forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        var r = card.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width * 2 - 1;
        var ny = (e.clientY - r.top) / r.height * 2 - 1;
        card.style.setProperty("--ty", (nx * maxDeg).toFixed(2) + "deg");
        card.style.setProperty("--tx", (-ny * maxDeg * 0.7).toFixed(2) + "deg");
        card.style.setProperty("--mx", ((nx + 1) * 50).toFixed(1) + "%");
        card.style.setProperty("--my", ((ny + 1) * 50).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--ty", "0deg");
        card.style.setProperty("--tx", "0deg");
      });
    });
  }
  addTilt(".svc", 7);
  addTilt(".case", 4.5);
  addTilt(".tier", 4);
  addTilt(".mft", 5);

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

  /* ---------- Recalcular triggers con el layout FINAL ----------
     El pin de servicios agrega ~2400px de spacer; los triggers creados
     antes guardan posiciones viejas si no se refresca explícitamente. */
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
    // seguro extra: layouts tardíos (fuentes, restauración de scroll)
    setTimeout(function () { ScrollTrigger.refresh(); }, 1500);
    setTimeout(function () { ScrollTrigger.refresh(); }, 3500);
  });
})();
