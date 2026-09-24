/* Medidor de rendimiento de la home 3D. Solo se carga con ?perf (usar ?qa=1&perf en producción para no medir en GA4/Meta).
   Mide cada cuadro: en reposo por escena y en los vuelos entre escenas. Guarda la fluidez por minuto (si el celular
   se calienta, baja con el tiempo), los cambios de resolución adaptable, cuándo se levantó el telón, el LCP y si iOS
   apagó el 3D. Un botón copia todo como texto para mandarlo por WhatsApp. */

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const r1 = (v) => Math.round(v * 10) / 10;

export function createPerf({ names, particles, getDpr, mobile }) {
  const t0 = performance.now();
  const buckets = new Map();                          // "reposo · Casos" / "vuelo → Casos"
  const minutes = [];                                 // fps promedio por minuto
  const dprLog = [];
  let minFrames = 0, minTime = 0, minStart = t0, lastDpr = getDpr(), lcp = 0, liftAt = 0, lost = 0, lastBucket = "";

  try {
    new PerformanceObserver((l) => { const e = l.getEntries().pop(); if (e) lcp = e.startTime; })
      .observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {}
  const cv = document.querySelector("[data-gl]");
  cv?.addEventListener("webglcontextlost", () => { lost += 1; });
  dprLog.push([0, r1(lastDpr)]);

  // panel: chico, abajo a la izquierda, sin tapar el WhatsApp
  const box = document.createElement("div");
  box.setAttribute("data-perf", "");
  box.style.cssText = "position:fixed;z-index:30;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));" +
    "font:500 10.5px/1.35 ui-monospace,Menlo,monospace;color:#cfd3e0;background:rgba(7,7,11,.82);border:1px solid rgba(255,255,255,.14);" +
    "border-radius:10px;padding:8px 10px;max-width:230px;pointer-events:auto;-webkit-user-select:none;user-select:none";
  const line = document.createElement("div");
  const btns = document.createElement("div");
  btns.style.cssText = "display:flex;gap:6px;margin-top:6px";
  const mk = (txt) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt;
    b.style.cssText = "font:600 10.5px/1 ui-monospace,Menlo,monospace;color:#07070B;background:#fff;border-radius:6px;padding:7px 8px"; btns.append(b); return b; };
  const copyB = mk("Copiar resultados"), resetB = mk("Reiniciar");
  box.append(line, btns);
  document.body.append(box);

  function report() {
    const rows = [...buckets.entries()].map(([k, b]) => ({
      tramo: k, cuadros: b.ms.length, seg: r1(b.total / 1000),
      fps: r1(b.ms.length / Math.max(0.001, b.total / 1000)), p50_ms: r1(pct(b.ms, 0.5)), p95_ms: r1(pct(b.ms, 0.95)),
      lentos_pct: r1(100 * b.ms.filter((x) => x > 25).length / Math.max(1, b.ms.length)), tirones: b.ms.filter((x) => x > 50).length,
    })).sort((a, b) => b.seg - a.seg);
    return {
      equipo: navigator.userAgent, pantalla: `${innerWidth}x${innerHeight} @${devicePixelRatio}`, celular: mobile,
      particulas: particles(), minutos_medidos: r1((performance.now() - t0) / 60000),
      telon_se_fue_ms: Math.round(liftAt), lcp_ms: Math.round(lcp), contexto_perdido: lost,
      resolucion: dprLog, fps_por_minuto: minutes, tramos: rows,
    };
  }
  copyB.addEventListener("click", () => {
    const txt = "MEDICION MV DESIGN\n" + JSON.stringify(report(), null, 1);
    const done = () => { copyB.textContent = "Copiado ✓"; setTimeout(() => { copyB.textContent = "Copiar resultados"; }, 1600); };
    try { navigator.clipboard.writeText(txt).then(done, () => fallback(txt)); } catch (e) { fallback(txt); }
  });
  function fallback(txt) {                            // (sin permiso de portapapeles: un cuadro para seleccionar a mano)
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;inset:10% 5%;z-index:31;font:11px monospace;background:#fff;color:#000";
    ta.addEventListener("blur", () => ta.remove());
    document.body.append(ta); ta.focus(); ta.select();
  }
  resetB.addEventListener("click", () => { buckets.clear(); minutes.length = 0; minFrames = 0; minTime = 0; minStart = performance.now(); });

  let uiT = 0, winMs = [];
  return {
    lifted() { liftAt = performance.now() - t0; },
    tick(rawSec, moving, scene, hidden) {
      if (hidden || rawSec > 0.5) return;              // pestaña oculta o pausa: no cuenta
      const ms = rawSec * 1000;
      const key = (moving ? "vuelo → " : "reposo · ") + (names[scene] || scene);
      let b = buckets.get(key);
      if (!b) { b = { ms: [], total: 0 }; buckets.set(key, b); }
      if (b.ms.length < 20000) b.ms.push(ms);
      b.total += ms;
      lastBucket = key;
      minFrames += 1; minTime += ms;
      const nowT = performance.now();
      if (nowT - minStart >= 60000) { minutes.push(r1(minFrames / (minTime / 1000))); minFrames = 0; minTime = 0; minStart = nowT; }
      const d = getDpr();
      if (d !== lastDpr) { lastDpr = d; dprLog.push([r1((nowT - t0) / 1000), r1(d)]); }
      winMs.push(ms);
      if (nowT - uiT > 500) {
        const fps = winMs.length / Math.max(0.001, winMs.reduce((a, c) => a + c, 0) / 1000);
        line.textContent = `${Math.round(fps)} fps · p95 ${Math.round(pct(winMs, 0.95))} ms · res ${r1(d)} · ${lastBucket}`;
        winMs = []; uiT = nowT;
      }
    },
  };
}
