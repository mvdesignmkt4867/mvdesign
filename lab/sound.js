/* ============================================================
   MV Design · Lab — sonido galáctico generado en vivo (Web Audio)
   Sin archivos: todo se sintetiza en el navegador y reacciona al recorrido.
   Ondas y vibraciones, sin campanas ni notas rápidas:
   · Dron grave: raíz y quinta con pares apenas desafinados que "baten" (el aire vibra despacio).
   · Pad de ondas: acorde de la escena bajo un filtro resonante que sube y baja como marea,
     con un flanger lento (nave que pasa). Las voces se deslizan de un acorde al otro.
   · Viento galáctico: ruido que barre y viaja de un lado a otro.
   · Sub que late lento y destellos agudos que aparecen y se desvanecen (sin ataque).
   Efectos: motor warp con la velocidad de la cámara; "piu" de bláster en cada clic (el clic en
   el vacío dispara la explosión con una onda grave); onda con vibrato al pasar el mouse; llegada,
   holograma, proceso y cierre como ondas que crecen.
   Los navegadores sólo dejan sonar tras un toque, clic o tecla: `unlock()` se llama ahí.
   Encendido por omisión; si alguien lo apaga, se recuerda (localStorage).
   ============================================================ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// acordes por escena (5 voces), raíz del dron y brillo del filtro
const CHORDS = [
  { v: [50, 57, 62, 64, 65], root: 38, bright: 0.9 },   // 0 La firma · Dm(add9)
  { v: [46, 53, 57, 62, 64], root: 34, bright: 0.95 },  // 1 Manifiesto · B♭maj7(#11)
  { v: [43, 50, 58, 62, 69], root: 43, bright: 1.1 },   // 2 Servicios · Gm9
  { v: [48, 53, 57, 64, 65], root: 41, bright: 1.0 },   // 3 Proceso · Fmaj7/C
  { v: [45, 52, 55, 60, 62], root: 45, bright: 1.05 },  // 4 Casos · Am7(11)
  { v: [46, 53, 57, 60, 62], root: 46, bright: 1.0 },   // 5 Paquetes · B♭maj9
  { v: [50, 57, 62, 64, 69], root: 38, bright: 1.25 }   // 6 Contacto · Dm9 abierto (resuelve)
];
const PROC_NOTES = [65, 69, 72, 76, 81];             // proceso: una onda por etapa, subiendo del 01 al 05
const KEY = "mv-sound";
const VOL = 0.9;                                      // volumen general (el compresor cuida los picos)

export function createSound({ reduced = false } = {}) {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  let ctx = null, started = false, scene = 0, lastHover = 0, lastSpeedSet = 0, lastPew = 0;
  let master, music, fx, rev, echoIn, padFilter, padGain, droneOscs, shimmer, warpGain, warpFilter, warpOscs, airGain, airFilter, noise;
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
  // un LFO (onda lenta) conectado a un parámetro
  function lfo(freq, amount, param, type = "sine") {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = amount;
    o.connect(g); g.connect(param); o.start();
    return o;
  }
  function panner(v = 0) { const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = v; return p; }
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    // espacio: reverb larga y oscura
    rev = ctx.createConvolver(); rev.buffer = impulse(5.5, 2.4);
    const revTone = ctx.createBiquadFilter(); revTone.type = "lowpass"; revTone.frequency.value = 3600;
    const revOut = ctx.createGain(); revOut.gain.value = 0.6;
    rev.connect(revTone); revTone.connect(revOut); revOut.connect(master);
    // eco lento para los efectos (se esparcen por el espacio)
    echoIn = ctx.createGain();
    const dL = ctx.createDelay(1.5), fb = ctx.createGain(), echoTone = ctx.createBiquadFilter(), echoOut = ctx.createGain();
    dL.delayTime.value = 0.42; fb.gain.value = 0.35; echoTone.type = "lowpass"; echoTone.frequency.value = 2200; echoOut.gain.value = 0.35;
    echoIn.connect(dL); dL.connect(echoTone); echoTone.connect(fb); fb.connect(dL); echoTone.connect(echoOut); echoOut.connect(rev); echoOut.connect(master);
    music = ctx.createGain(); music.gain.value = 0.62; music.connect(master);
    const musicRev = ctx.createGain(); musicRev.gain.value = 0.8; music.connect(musicRev); musicRev.connect(rev);
    fx = ctx.createGain(); fx.gain.value = 0.85; fx.connect(master);
    const fxRev = ctx.createGain(); fxRev.gain.value = 0.45; fx.connect(fxRev); fxRev.connect(rev);
    noise = noiseBuf(3);

    // pad de ondas: 5 voces (triángulo + sierra desafinadas) → filtro resonante que sube y baja como marea
    // → flanger lento (nave que pasa) → volumen que respira
    padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 620; padFilter.Q.value = 4.5;
    lfo(0.07, 480, padFilter.frequency);                                   // la marea del brillo (~14 s)
    const flDelay = ctx.createDelay(0.05), flFb = ctx.createGain(), flWet = ctx.createGain();
    flDelay.delayTime.value = 0.006; flFb.gain.value = 0.55; flWet.gain.value = 0.6;
    lfo(0.09, 0.0045, flDelay.delayTime);
    padGain = ctx.createGain(); padGain.gain.value = 0;
    const swell = ctx.createGain(); swell.gain.value = 1;
    lfo(0.11, 0.28, swell.gain);                                           // respira (~9 s)
    padFilter.connect(swell); swell.connect(padGain);
    swell.connect(flDelay); flDelay.connect(flFb); flFb.connect(flDelay); flDelay.connect(flWet); flWet.connect(padGain);
    padGain.connect(music);
    CHORDS[scene].v.forEach((m, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.05 : 0.034;
      const oscs = [["triangle", -6], ["sawtooth", 6]].map(([type, cents]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = cents;
        o.connect(g); o.start(); return o;
      });
      lfo(0.13 + i * 0.037, 4, oscs[1].detune);                            // cada voz ondula a su ritmo
      const p = panner((i / 4 - 0.5) * 0.9); g.connect(p); p.connect(padFilter);
      voices.push({ oscs, g });
    });
    // dron: raíz y quinta, cada una en par apenas desafinado → batimiento lento (vibración)
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.085;
    const droneLp = ctx.createBiquadFilter(); droneLp.type = "lowpass"; droneLp.frequency.value = 520;
    droneLp.connect(droneGain); droneGain.connect(music);
    droneOscs = [[0, 0], [0, 0.17], [7, 0], [7, 0.23], [12, 0.11]].map(([iv, beat], k) => {
      const o = ctx.createOscillator(); o.type = k === 4 ? "sine" : "triangle";
      o.frequency.value = mtof(CHORDS[scene].root + iv) + beat;
      const g = ctx.createGain(); g.gain.value = k === 4 ? 0.5 : 0.8; o.connect(g); g.connect(droneLp); o.start();
      return { o, iv, beat };
    });
    // sub que late despacio (una octava abajo)
    const sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = mtof(CHORDS[scene].root - 12);
    const subG = ctx.createGain(); subG.gain.value = 0.07; lfo(0.28, 0.055, subG.gain);
    sub.connect(subG); subG.connect(music); sub.start();
    droneOscs.push({ o: sub, iv: -12, beat: 0 });
    // viento galáctico: ruido que barre (pasabanda) y viaja de un lado a otro
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 900; wf.Q.value = 2.2;
    lfo(0.045, 650, wf.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.045; lfo(0.06, 0.03, wg.gain);
    const wp = panner(0); if (wp.pan) lfo(0.05, 0.8, wp.pan);
    wind.connect(wf); wf.connect(wg); wg.connect(wp); wp.connect(music); wind.start();
    // destellos: agudos que aparecen y se desvanecen (sin ataque), viajando en el estéreo
    shimmer = [0, 1, 2].map((k) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(CHORDS[scene].v[k + 2] + 24);
      const g = ctx.createGain(); g.gain.value = 0.004; lfo(0.07 + k * 0.05, 0.004, g.gain);
      const p = panner(0); if (p.pan) lfo(0.03 + k * 0.02, 0.9, p.pan);
      o.connect(g); g.connect(p); p.connect(music); o.start();
      return { o, k };
    });
    // motor warp: dos sierras graves + ruido; suben con la velocidad de la cámara
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
  function startMusic() {
    if (started || !ctx) return;
    started = true;
    const now = ctx.currentTime;
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.9, now + 5);
    setScene(scene, true);
  }
  function unlock() {
    if (!on) return;
    if (!ctx && !build()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    try { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0); } catch (e) {}   // iOS antiguo
    if (!started) { startMusic(); fadeTo(VOL, 3); emit(); }
  }
  function setOn(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {}
    if (v) { unlock(); if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); fadeTo(VOL, 1.2); } }
    else if (ctx) { fadeTo(0, 0.6); setTimeout(() => { if (!on && ctx) ctx.suspend().catch(() => {}); }, 700); }
    emit();
  }
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (on && started) ctx.resume().catch(() => {});
  });
  // escena: todo se desliza despacio al acorde nuevo (como una onda que cambia de color)
  function setScene(a, instant = false) {
    scene = Math.max(0, Math.min(CHORDS.length - 1, a));
    if (!ctx || !started) return;
    const c = CHORDS[scene], now = ctx.currentTime, tc = instant ? 0.05 : 1.4;
    voices.forEach((v, i) => v.oscs.forEach((o) => o.frequency.setTargetAtTime(mtof(c.v[i]), now, tc)));
    droneOscs.forEach(({ o, iv, beat }) => o.frequency.setTargetAtTime(mtof(c.root + iv) + beat, now, tc * 1.3));
    shimmer.forEach(({ o, k }) => o.frequency.setTargetAtTime(mtof(c.v[k + 2] + 24), now, tc));
    padFilter.frequency.setTargetAtTime(620 * c.bright, now, 2);
  }

  /* ---------- efectos ---------- */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noiseSweep({ from = 300, to = 2400, dur = 0.5, gain = 0.05, q = 1.4, t = ctx.currentTime } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(fx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  // una onda: tono suave con vibrato, que crece y se desvanece (sin golpe)
  function wave(m, { gain = 0.03, attack = 0.15, release = 1.2, vib = 5.5, depth = 12, type = "sine", pan = (Math.random() - 0.5) * 0.8, glide = 0, when = 0 } = {}) {
    if (!live()) return;
    const t = ctx.currentTime + when, f = mtof(m);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * (1 - glide), t);
    if (glide) o.frequency.exponentialRampToValueAtTime(f, t + attack + 0.1);
    const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = vib; vg.gain.value = depth; v.connect(vg); vg.connect(o.detune);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    const p = panner(pan);
    o.connect(g); g.connect(p); p.connect(fx); p.connect(echoIn);
    o.start(t); v.start(t); o.stop(t + attack + release + 0.1); v.stop(t + attack + release + 0.1);
  }
  // bláster "piu": sierra + cuadrada que caen en picada por un pasabanda resonante
  function pew(k = 1, gain = 0.18) {
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
    mk("sawtooth", 1900, 170, 0.2, gain);
    mk("square", 2600, 260, 0.15, gain * 0.3, 0.012);
  }
  const chordNote = (k) => CHORDS[scene].v[k % 5] + 24;
  return {
    get on() { return on; },
    get playing() { return !!(ctx && started && on && ctx.state === "running"); },
    get debug() { return { ctx, master }; },               // (pruebas: ?debug)
    onChange(f) { listeners.add(f); },
    unlock,
    toggle() { if (on && !started) { unlock(); return; } setOn(!on); if (on) setTimeout(() => pew(1.1, 0.12), 80); },
    scene: setScene,
    // velocidad real de la cámara (u/s): el motor warp sube de tono y se abre; el aire silba
    speed(v) {
      if (!ctx || !started) return;
      const now = ctx.currentTime;
      if (now - lastSpeedSet < 0.05) return;
      lastSpeedSet = now;
      const k = Math.max(0, Math.min(1, (v - 1.5) / 18));
      warpGain.gain.setTargetAtTime(k * 0.22, now, 0.2);
      warpFilter.frequency.setTargetAtTime(140 + k * 1200, now, 0.25);
      warpOscs.forEach((o, i) => o.frequency.setTargetAtTime(46 + k * 55 + i * 0.4, now, 0.35));
      airGain.gain.setTargetAtTime(k * 0.1, now, 0.2);
      airFilter.frequency.setTargetAtTime(500 + k * 2600, now, 0.2);
    },
    // llegar a una escena: una onda que crece con el acorde nuevo
    arrive() {
      if (!live()) return;
      [2, 3, 4].forEach((k, i) => wave(chordNote(k) - 12, { gain: 0.014, attack: 0.6, release: 2.4, when: i * 0.12, depth: 8, vib: 4 }));
    },
    // clic en el vacío: el disparo (piu) y una onda grave que vibra
    blast() {
      if (!live()) return;
      pew(0.85, 0.2);
      const t = ctx.currentTime + 0.03, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
      const trem = ctx.createGain(); lfo(9, 0.5, trem.gain); trem.gain.value = 0.6;
      const g = ctx.createGain(); env(g, t, 0.02, 0.26, 1.1);
      o.connect(trem); trem.connect(g); g.connect(fx); o.start(t); o.stop(t + 1.3);
    },
    pew: () => pew(1, 0.15),
    // pasar el mouse: una onda suave con vibrato (textos agudos; botones un poco más graves, que suben)
    hover(kind = "text") {
      if (!live()) return;
      const t = ctx.currentTime;
      if (t - lastHover < 0.09) return;
      lastHover = t;
      if (kind === "ui") wave(chordNote(1) - 12, { gain: 0.022, attack: 0.05, release: 0.45, glide: 0.12, vib: 7, depth: 14, type: "triangle" });
      else wave(chordNote(Math.floor(Math.random() * 5)), { gain: 0.012, attack: 0.06, release: 0.6, vib: 6, depth: 18 });
    },
    tick() { this.hover("ui"); },
    // la espiral pasa una ficha: un pulso grave y suave
    detent() {
      if (!live()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
      const g = ctx.createGain(); env(g, t, 0.015, 0.06, 0.25); o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.3);
    },
    // abrir / cerrar paneles: holograma que sube o baja como onda
    ui(kind) {
      if (!live()) return;
      const t = ctx.currentTime, up = kind === "open";
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(up ? 180 : 720, t); o.frequency.exponentialRampToValueAtTime(up ? 720 : 160, t + 0.55);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 6; vg.gain.value = 20; v.connect(vg); vg.connect(o.detune);
      const g = ctx.createGain(); env(g, t, 0.12, 0.045, 0.5);
      o.connect(g); g.connect(fx); g.connect(echoIn); o.start(t); v.start(t); o.stop(t + 0.7); v.stop(t + 0.7);
      noiseSweep({ from: up ? 300 : 2400, to: up ? 2400 : 300, dur: 0.55, gain: 0.03 });
    },
    // proceso: una onda por etapa que enciende el hilo
    note(k) { wave(PROC_NOTES[Math.max(0, Math.min(4, k))], { gain: 0.03, attack: 0.18, release: 1.6, type: "triangle", pan: (k / 4 - 0.5) * 0.8, vib: 5, depth: 10 }); },
    // contacto: la M se arma → una marea que se abre
    resolve() {
      if (!live()) return;
      const t = ctx.currentTime, c = CHORDS[6].v;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 5;
      lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 1.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      lp.connect(g); g.connect(fx); g.connect(echoIn);
      c.forEach((m) => [0, 7].forEach((d) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m + 12); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + 4.1); }));
      noiseSweep({ from: 250, to: 4000, dur: 1.8, gain: 0.025, t });
      padFilter.frequency.cancelScheduledValues(t);
      padFilter.frequency.setTargetAtTime(1900, t, 0.8);
      padFilter.frequency.setTargetAtTime(620 * CHORDS[6].bright, t + 2.5, 2);
    }
  };
}
