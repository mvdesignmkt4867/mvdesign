/* ============================================================
   MV Design · Lab — sonido galáctico generado en vivo (Web Audio)
   Sin archivos: todo se sintetiza en el navegador y reacciona al recorrido.
   · Música (re menor, 100 BPM): pad espacial de sierras con filtro resonante que barre lento,
     bajo que pulsa en cada tiempo, arpegiador con eco (más denso en el túnel y la espiral)
     y bips de telemetría. Cada escena tiene su acorde; las voces se deslizan al cambiar.
   · Efectos: motor warp que sube con la velocidad de la cámara; "piu" de bláster en cada clic
     (y el disparo que hace estallar las partículas); bip de datos al pasar el mouse por textos
     y chirp en botones; holograma al abrir/cerrar; clic digital por ficha de la espiral;
     secuencia ascendente en las etapas del proceso; power-up cuando la M se arma.
   Los navegadores sólo dejan sonar tras un toque, clic o tecla: `unlock()` se llama ahí.
   Encendido por omisión; si alguien lo apaga, se recuerda (localStorage).
   ============================================================ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// acordes por escena (5 voces) · raíz del bajo · densidad del arpegio (1 corcheas, 2 semicorcheas) · brillo del filtro
const CHORDS = [
  { v: [50, 57, 62, 64, 65], root: 38, arp: 1, bright: 0.9 },   // 0 La firma · Dm(add9)
  { v: [46, 53, 57, 62, 64], root: 34, arp: 1, bright: 0.95 },  // 1 Manifiesto · B♭maj7(#11)
  { v: [43, 50, 58, 62, 69], root: 43, arp: 2, bright: 1.15 },  // 2 Servicios · Gm9 (el túnel acelera)
  { v: [48, 53, 57, 64, 65], root: 41, arp: 2, bright: 1.05 },  // 3 Proceso · Fmaj7/C
  { v: [45, 52, 55, 60, 62], root: 45, arp: 2, bright: 1.1 },   // 4 Casos · Am7(11)
  { v: [46, 53, 57, 60, 62], root: 46, arp: 1, bright: 1.0 },   // 5 Paquetes · B♭maj9
  { v: [50, 57, 62, 64, 69], root: 38, arp: 2, bright: 1.3 }    // 6 Contacto · Dm9 abierto (resuelve)
];
const PROC_NOTES = [65, 69, 72, 76, 81];             // proceso: secuencia ascendente del 01 al 05
const BPM = 100, STEP = 60 / BPM / 4;                 // semicorchea
const KEY = "mv-sound";
const VOL = 0.9;                                      // volumen general (el compresor cuida los picos)

export function createSound({ reduced = false } = {}) {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  let ctx = null, started = false, scene = 0, seqTimer = 0, nextT = 0, stepN = 0, lastHover = 0, lastSpeedSet = 0, lastPew = 0;
  let master, music, fx, rev, echoIn, padFilter, padGain, warpGain, warpFilter, warpOscs, airGain, airFilter, noise;
  const voices = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) {} });
  const live = () => !!(ctx && started && on);

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function noiseBuf(sec) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    // espacio: reverb larga y oscura
    rev = ctx.createConvolver(); rev.buffer = impulse(3.8, 2.2);
    const revTone = ctx.createBiquadFilter(); revTone.type = "lowpass"; revTone.frequency.value = 4200;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    rev.connect(revTone); revTone.connect(revOut); revOut.connect(master);
    // eco ping-pong (corchea con puntillo) para el arpegio y los efectos
    echoIn = ctx.createGain(); echoIn.gain.value = 1;
    const dL = ctx.createDelay(1), dR = ctx.createDelay(1), fb = ctx.createGain(), echoTone = ctx.createBiquadFilter();
    dL.delayTime.value = STEP * 3; dR.delayTime.value = STEP * 3; fb.gain.value = 0.38;
    echoTone.type = "lowpass"; echoTone.frequency.value = 2600;
    const merger = ctx.createChannelMerger(2), echoOut = ctx.createGain(); echoOut.gain.value = 0.42;
    echoIn.connect(dL); dL.connect(echoTone); echoTone.connect(dR); dR.connect(fb); fb.connect(dL);
    dL.connect(merger, 0, 0); dR.connect(merger, 0, 1); merger.connect(echoOut); echoOut.connect(master); echoOut.connect(rev);
    music = ctx.createGain(); music.gain.value = 0.6; music.connect(master);
    const musicRev = ctx.createGain(); musicRev.gain.value = 0.7; music.connect(musicRev); musicRev.connect(rev);
    fx = ctx.createGain(); fx.gain.value = 0.9; fx.connect(master);
    const fxRev = ctx.createGain(); fxRev.gain.value = 0.35; fx.connect(fxRev); fxRev.connect(rev);
    noise = noiseBuf(2);

    // pad espacial: 5 voces × 2 sierras desafinadas, filtro resonante que barre despacio
    padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 700; padFilter.Q.value = 3.2;
    padGain = ctx.createGain(); padGain.gain.value = 0;
    padFilter.connect(padGain); padGain.connect(music);
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.032; lfoAmt.gain.value = 420; lfo.connect(lfoAmt); lfoAmt.connect(padFilter.frequency); lfo.start();
    const vib = ctx.createOscillator(), vibAmt = ctx.createGain();   // chorus lento: las voces "respiran" en afinación
    vib.frequency.value = 0.21; vibAmt.gain.value = 5; vib.connect(vibAmt); vib.start();
    CHORDS[scene].v.forEach((m, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.045 : 0.032;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const oscs = [-9, 9].map((cents) => {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = cents;
        vibAmt.connect(o.detune); o.connect(g); o.start(); return o;
      });
      if (pan) { pan.pan.value = (i / 4 - 0.5) * 0.8; g.connect(pan); pan.connect(padFilter); } else g.connect(padFilter);
      voices.push({ oscs, g });
    });
    // motor warp: dos sierras graves + ruido; tono y filtro suben con la velocidad de la cámara
    warpFilter = ctx.createBiquadFilter(); warpFilter.type = "lowpass"; warpFilter.frequency.value = 140; warpFilter.Q.value = 5;
    warpGain = ctx.createGain(); warpGain.gain.value = 0;
    warpOscs = [0, 7].map((c) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 46; o.detune.value = c; o.connect(warpFilter); o.start(); return o; });
    warpFilter.connect(warpGain); warpGain.connect(fx);
    const air = ctx.createBufferSource(); air.buffer = noise; air.loop = true;
    airFilter = ctx.createBiquadFilter(); airFilter.type = "bandpass"; airFilter.frequency.value = 500; airFilter.Q.value = 1.1;
    airGain = ctx.createGain(); airGain.gain.value = 0;
    air.connect(airFilter); airFilter.connect(airGain); airGain.connect(fx); air.start();
    return true;
  }
  function fadeTo(v, t = 2.5) {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(v, now + t);
  }

  /* ---------- secuenciador: bajo que pulsa, arpegio y telemetría ---------- */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function bass(t) {
    const c = CHORDS[scene], f = mtof(c.root);
    const g = ctx.createGain(); env(g, t, 0.012, 0.16, 0.5);
    const sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = f;
    const saw = ctx.createOscillator(); saw.type = "sawtooth"; saw.frequency.value = f * 2;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.35);
    const sg = ctx.createGain(); sg.gain.value = 0.35;
    sub.connect(g); saw.connect(sg); sg.connect(lp); lp.connect(g); g.connect(music);
    sub.start(t); saw.start(t); sub.stop(t + 0.6); saw.stop(t + 0.6);
  }
  function pluck(m, t, { gain = 0.05, dest = music, dur = 0.16, pan = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = mtof(m) * 1.005;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 8;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(480, t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, gain, dur);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(dest); out.connect(echoIn);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function beeps(t) {
    const n = 2 + Math.floor(Math.random() * 3), base = 1800 + Math.random() * 1400, pan = (Math.random() - 0.5) * 1.4;
    for (let k = 0; k < n; k++) {
      const tt = t + k * 0.07, o = ctx.createOscillator(); o.type = "square";
      o.frequency.value = base * (k % 2 ? 1.25 : 1);
      const g = ctx.createGain(); env(g, tt, 0.002, 0.012, 0.035);
      let out = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
      o.connect(g); out.connect(music); out.connect(echoIn); o.start(tt); o.stop(tt + 0.05);
    }
  }
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1];                // recorrido del acorde (dos octavas)
  function tickSeq() {
    if (!live() || document.hidden || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (nextT < now - 0.2) nextT = now + 0.05;          // (tras una pausa larga, retoma sin ráfaga)
    while (nextT < now + 0.12) {
      const c = CHORDS[scene], s = stepN % 16;
      if (s % 4 === 0) bass(nextT);
      const dens = reduced ? Math.min(1, c.arp) : c.arp;
      if (dens === 2 || (dens === 1 && s % 2 === 0)) {
        const i = ARP[(stepN >> (dens === 2 ? 0 : 1)) % ARP.length], oct = (Math.floor(stepN / 8) % 2) * 12;
        pluck(c.v[i] + 12 + oct, nextT, { gain: 0.032 + (s % 4 === 0 ? 0.012 : 0), pan: (i / 4 - 0.5) * 0.6 });
      }
      if (s === 0 && Math.random() < 0.35) beeps(nextT + STEP * (2 + Math.floor(Math.random() * 8)));
      nextT += STEP; stepN++;
    }
  }
  function startMusic() {
    if (started || !ctx) return;
    started = true;
    const now = ctx.currentTime;
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.85, now + 4);
    nextT = now + 0.6; stepN = 0;
    setScene(scene, true);
    clearInterval(seqTimer); seqTimer = setInterval(tickSeq, 25);
  }
  function unlock() {
    if (!on) return;
    if (!ctx && !build()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    try { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0); } catch (e) {}   // iOS antiguo
    if (!started) { startMusic(); fadeTo(VOL, 2.5); emit(); }
  }
  function setOn(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {}
    if (v) { unlock(); if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); fadeTo(VOL, 1); } }
    else if (ctx) { fadeTo(0, 0.5); setTimeout(() => { if (!on && ctx) ctx.suspend().catch(() => {}); }, 600); }
    emit();
  }
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (on && started) ctx.resume().catch(() => {});
  });
  function setScene(a, instant = false) {
    scene = Math.max(0, Math.min(CHORDS.length - 1, a));
    if (!ctx || !started) return;
    const c = CHORDS[scene], now = ctx.currentTime, tc = instant ? 0.05 : 0.7;
    voices.forEach((v, i) => v.oscs.forEach((o) => o.frequency.setTargetAtTime(mtof(c.v[i]), now, tc)));
    padFilter.frequency.setTargetAtTime(700 * c.bright, now, 1.2);
  }

  /* ---------- efectos ---------- */
  function noiseHit({ from = 300, to = 2400, dur = 0.35, gain = 0.06, type = "bandpass", q = 1.2, t = ctx.currentTime } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(fx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  // bláster "piu": sierra + cuadrada que caen en picada por un pasabanda resonante, con un segundo chirrido de "cable"
  function pew(k = 1, gain = 0.2) {
    if (!live()) return;
    const t = ctx.currentTime;
    if (t - lastPew < 0.05) return;
    lastPew = t;
    const r = k * (0.9 + Math.random() * 0.2);
    const mk = (type, f0, f1, dur, g0, delay = 0) => {
      const tt = t + delay, o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * r, tt); o.frequency.exponentialRampToValueAtTime(f1 * r, tt + dur);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 5;
      bp.frequency.setValueAtTime(f0 * r * 1.3, tt); bp.frequency.exponentialRampToValueAtTime(f1 * r * 1.6, tt + dur);
      const g = ctx.createGain(); env(g, tt, 0.003, g0, dur);
      o.connect(bp); bp.connect(g); g.connect(fx); g.connect(echoIn);
      o.start(tt); o.stop(tt + dur + 0.05);
    };
    mk("sawtooth", 1900, 170, 0.19, gain);
    mk("square", 2600, 260, 0.14, gain * 0.35, 0.012);
    noiseHit({ from: 6000, to: 2500, dur: 0.03, gain: gain * 0.25, type: "highpass", q: 0.7, t });
  }
  function hover(kind = "text") {
    if (!live()) return;
    const t = ctx.currentTime;
    if (t - lastHover < 0.06) return;
    lastHover = t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (kind === "ui") {
      o.type = "square"; o.frequency.setValueAtTime(640, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.05);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
      env(g, t, 0.003, 0.028, 0.06); o.connect(lp); lp.connect(g);
    } else {
      const f = [1318, 1568, 1760, 2093, 2349][Math.floor(Math.random() * 5)];
      o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.26, t + 0.03);
      env(g, t, 0.002, 0.022, 0.045); o.connect(g);
    }
    g.connect(fx); g.connect(echoIn);
    o.start(t); o.stop(t + 0.1);
  }
  return {
    get on() { return on; },
    get playing() { return !!(ctx && started && on && ctx.state === "running"); },
    get debug() { return { ctx, master }; },               // (pruebas: ?debug)
    onChange(f) { listeners.add(f); },
    unlock,
    toggle() { if (on && !started) { unlock(); return; } setOn(!on); if (on) setTimeout(() => pew(1.1, 0.14), 80); },
    scene: setScene,
    // velocidad real de la cámara (u/s): el motor warp sube de tono y se abre; el aire silba
    speed(v) {
      if (!ctx || !started) return;
      const now = ctx.currentTime;
      if (now - lastSpeedSet < 0.05) return;
      lastSpeedSet = now;
      const k = Math.max(0, Math.min(1, (v - 1.5) / 18));
      warpGain.gain.setTargetAtTime(k * 0.22, now, 0.15);
      warpFilter.frequency.setTargetAtTime(140 + k * 1400, now, 0.2);
      warpOscs.forEach((o, i) => o.frequency.setTargetAtTime(46 + k * 60 + i * 0.4, now, 0.3));
      airGain.gain.setTargetAtTime(k * 0.12, now, 0.12);
      airFilter.frequency.setTargetAtTime(500 + k * 3200, now, 0.15);
    },
    // llegar a una escena: confirmación de computadora (dos bips que suben)
    arrive() {
      if (!live()) return;
      const t = ctx.currentTime, c = CHORDS[scene].v;
      pluck(c[3] + 24, t, { gain: 0.03, dest: fx, dur: 0.1 });
      pluck(c[4] + 24, t + 0.08, { gain: 0.03, dest: fx, dur: 0.14 });
    },
    // clic en el vacío: el disparo que hace estallar las partículas (piu + golpe grave)
    blast() {
      if (!live()) return;
      pew(0.85, 0.22);
      const t = ctx.currentTime + 0.02, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.3);
      const g = ctx.createGain(); env(g, t, 0.01, 0.28, 0.38);
      o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.45);
    },
    pew: () => pew(1, 0.17),
    // pasar el mouse: textos = bip de datos; botones, enlaces y fichas = chirp
    hover,
    tick: () => hover("ui"),
    // la espiral pasa una ficha: clic digital
    detent() {
      if (!live()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 2400;
      const g = ctx.createGain(); env(g, t, 0.001, 0.02, 0.012); o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.03);
      const th = ctx.createOscillator(); th.type = "triangle"; th.frequency.setValueAtTime(220, t); th.frequency.exponentialRampToValueAtTime(90, t + 0.05);
      const g2 = ctx.createGain(); env(g2, t, 0.002, 0.05, 0.05); th.connect(g2); g2.connect(fx); th.start(t); th.stop(t + 0.08);
    },
    // abrir / cerrar paneles: holograma
    ui(kind) {
      if (!live()) return;
      const t = ctx.currentTime, up = kind === "open";
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(up ? 220 : 1100, t); o.frequency.exponentialRampToValueAtTime(up ? 1100 : 180, t + 0.28);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 7;
      bp.frequency.setValueAtTime(up ? 400 : 2200, t); bp.frequency.exponentialRampToValueAtTime(up ? 2600 : 300, t + 0.28);
      const g = ctx.createGain(); env(g, t, 0.02, 0.06, 0.28);
      o.connect(bp); bp.connect(g); g.connect(fx); g.connect(echoIn); o.start(t); o.stop(t + 0.35);
      noiseHit({ from: up ? 400 : 3000, to: up ? 3000 : 400, dur: 0.3, gain: 0.035 });
    },
    // proceso: una nota por etapa que enciende el hilo
    note(k) { if (live()) pluck(PROC_NOTES[Math.max(0, Math.min(4, k))], ctx.currentTime, { gain: 0.06, dest: fx, dur: 0.3, pan: (k / 4 - 0.5) * 0.8 }); },
    // contacto: la M se arma → power-up
    resolve() {
      if (!live()) return;
      const t = ctx.currentTime, c = CHORDS[6].v;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
      lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 1.1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      lp.connect(g); g.connect(fx); g.connect(echoIn);
      c.forEach((m) => [0, 6].forEach((d) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m + 12); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + 2.5); }));
      noiseHit({ from: 300, to: 5000, dur: 1.0, gain: 0.03, t });
      padFilter.frequency.cancelScheduledValues(t);
      padFilter.frequency.setTargetAtTime(2200, t, 0.4);
      padFilter.frequency.setTargetAtTime(700 * CHORDS[6].bright, t + 1.8, 1.6);
    }
  };
}
