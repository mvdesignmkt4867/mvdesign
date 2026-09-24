/* ============================================================
   MV Design · Lab — sonido galáctico generado en vivo (Web Audio)
   Sin archivos: todo se sintetiza en el navegador y reacciona al recorrido.
   Ondas y vibraciones, luminoso y en calma (re mayor, colores suspendidos y lidios):
   · Pad de ondas: acorde de la escena en senos y triángulos, bajo un filtro suave que sube y baja
     como marea, con un flanger ligero (nave que pasa a lo lejos). Las voces se deslizan de un
     acorde al otro.
   · Dron: raíz y quinta en pares apenas desafinados que "laten" despacio (el aire vibra).
   · Brisa galáctica: aire claro que barre y viaja de un lado a otro.
   · Destellos: agudos que aparecen y se desvanecen, sin ataque.
   Efectos: soplo de aire que sigue la velocidad de la cámara; "piu" de bláster en cada clic (el clic
   en el vacío dispara la explosión con un "whoom" suave); onda con vibrato al pasar el mouse;
   llegada, holograma y proceso como ondas que crecen; en el cierre, el pad se ilumina despacio.
   Sin campanas, sin notas rápidas, sin sierras rasposas.
   Los navegadores sólo dejan sonar tras un toque, clic o tecla: `unlock()` se llama ahí.
   Encendido por omisión; si alguien lo apaga, se recuerda (localStorage).
   ============================================================ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// acordes por escena (5 voces), raíz del dron y brillo del filtro
const CHORDS = [
  { v: [50, 57, 64, 66, 73], root: 50, bright: 1.0 },   // 0 La firma · Dmaj9
  { v: [43, 50, 57, 59, 66], root: 43, bright: 1.0 },   // 1 Manifiesto · Gmaj9
  { v: [45, 52, 57, 59, 64], root: 45, bright: 1.1 },   // 2 Servicios · Asus2
  { v: [43, 50, 59, 61, 66], root: 43, bright: 1.05 },  // 3 Proceso · Gmaj7(#11)
  { v: [42, 54, 57, 62, 64], root: 42, bright: 1.1 },   // 4 Casos · D(add9)/F#
  { v: [45, 52, 59, 61, 64], root: 45, bright: 1.05 },  // 5 Paquetes · A(add9)
  { v: [50, 57, 64, 66, 73], root: 50, bright: 1.2 }    // 6 Contacto · Dmaj9
];
const PROC_NOTES = [74, 78, 81, 83, 86];             // proceso: una onda por etapa, subiendo (pentatónica de re)
const KEY = "mv-sound";
const VOL = 0.9;                                      // volumen general (el compresor cuida los picos)

export function createSound({ reduced = false } = {}) {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  let ctx = null, started = false, scene = 0, lastHover = 0, lastSpeedSet = 0, lastPew = 0;
  let master, music, fx, rev, echoIn, padFilter, padGain, droneOscs, shimmer, shimmerBus, airGain, airFilter, noise;
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
  // ruido rosado (más suave que el blanco: aire, no siseo)
  function noiseBuf(sec) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
    }
    return buf;
  }
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
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    // espacio: reverb larga y clara
    rev = ctx.createConvolver(); rev.buffer = impulse(5.5, 2.6);
    const revTone = ctx.createBiquadFilter(); revTone.type = "lowpass"; revTone.frequency.value = 6500;
    const revLow = ctx.createBiquadFilter(); revLow.type = "highpass"; revLow.frequency.value = 180;   // la cola no embarra los graves
    const revOut = ctx.createGain(); revOut.gain.value = 0.62;
    rev.connect(revTone); revTone.connect(revLow); revLow.connect(revOut); revOut.connect(master);
    // eco lento para los efectos (se esparcen por el espacio)
    echoIn = ctx.createGain();
    const dL = ctx.createDelay(1.5), fb = ctx.createGain(), echoTone = ctx.createBiquadFilter(), echoOut = ctx.createGain();
    dL.delayTime.value = 0.46; fb.gain.value = 0.32; echoTone.type = "lowpass"; echoTone.frequency.value = 3800; echoOut.gain.value = 0.32;
    echoIn.connect(dL); dL.connect(echoTone); echoTone.connect(fb); fb.connect(dL); echoTone.connect(echoOut); echoOut.connect(rev); echoOut.connect(master);
    music = ctx.createGain(); music.gain.value = 0.62; music.connect(master);
    const musicRev = ctx.createGain(); musicRev.gain.value = 0.85; music.connect(musicRev); musicRev.connect(rev);
    fx = ctx.createGain(); fx.gain.value = 0.85; fx.connect(master);
    const fxRev = ctx.createGain(); fxRev.gain.value = 0.5; fx.connect(fxRev); fxRev.connect(rev);
    noise = noiseBuf(3);

    // pad de ondas: 5 voces (seno + triángulo, desafinados) → filtro suave que sube y baja como marea
    // → flanger ligero → volumen que respira
    padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 1500; padFilter.Q.value = 0.9;
    lfo(0.07, 700, padFilter.frequency);                                   // la marea del brillo (~14 s)
    const flDelay = ctx.createDelay(0.05), flFb = ctx.createGain(), flWet = ctx.createGain();
    flDelay.delayTime.value = 0.007; flFb.gain.value = 0.28; flWet.gain.value = 0.35;
    lfo(0.08, 0.004, flDelay.delayTime);
    padGain = ctx.createGain(); padGain.gain.value = 0;
    const swell = ctx.createGain(); swell.gain.value = 1;
    lfo(0.1, 0.25, swell.gain);                                            // respira (~10 s)
    padFilter.connect(swell); swell.connect(padGain);
    swell.connect(flDelay); flDelay.connect(flFb); flFb.connect(flDelay); flDelay.connect(flWet); flWet.connect(padGain);
    padGain.connect(music);
    CHORDS[scene].v.forEach((m, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.07 : 0.055;
      const oscs = [["sine", -5], ["triangle", 5]].map(([type, cents]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = cents;
        o.connect(g); o.start(); return o;
      });
      lfo(0.13 + i * 0.037, 5, oscs[1].detune);                            // cada voz ondula a su ritmo
      const p = panner((i / 4 - 0.5) * 0.9); g.connect(p); p.connect(padFilter);
      voices.push({ oscs, g });
    });
    // dron suave: raíz y quinta, cada una en par apenas desafinado → vibración lenta
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.045;
    droneGain.connect(music);
    droneOscs = [[0, 0], [0, 0.19], [7, 0], [7, 0.27]].map(([iv, beat]) => {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.value = mtof(CHORDS[scene].root + iv) + beat;
      o.connect(droneGain); o.start();
      return { o, iv, beat };
    });
    // brisa galáctica: aire claro que barre (pasabanda ancho) y viaja de un lado a otro
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 2200; wf.Q.value = 0.8;
    lfo(0.045, 1100, wf.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.018; lfo(0.06, 0.012, wg.gain);
    const wp = panner(0); if (wp.pan) lfo(0.05, 0.8, wp.pan);
    wind.connect(wf); wf.connect(wg); wg.connect(wp); wp.connect(music); wind.start();
    // destellos: agudos que aparecen y se desvanecen (sin ataque), viajando en el estéreo
    shimmerBus = ctx.createGain(); shimmerBus.gain.value = 1; shimmerBus.connect(music);
    shimmer = [0, 1, 2].map((k) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(CHORDS[scene].v[k + 2] + 24);
      const g = ctx.createGain(); g.gain.value = 0.006; lfo(0.07 + k * 0.05, 0.006, g.gain);
      const p = panner(0); if (p.pan) lfo(0.03 + k * 0.02, 0.9, p.pan);
      o.connect(g); g.connect(p); p.connect(shimmerBus); o.start();
      return { o, k };
    });
    // soplo de viaje: aire claro que crece con la velocidad de la cámara (sin motor ni tono que suba)
    const air = ctx.createBufferSource(); air.buffer = noise; air.loop = true;
    airFilter = ctx.createBiquadFilter(); airFilter.type = "bandpass"; airFilter.frequency.value = 900; airFilter.Q.value = 0.6;
    const airHp = ctx.createBiquadFilter(); airHp.type = "highpass"; airHp.frequency.value = 350;
    airGain = ctx.createGain(); airGain.gain.value = 0;
    air.connect(airHp); airHp.connect(airFilter); airFilter.connect(airGain); airGain.connect(fx); air.start();
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
    padFilter.frequency.setTargetAtTime(1500 * c.bright, now, 2);
  }

  /* ---------- efectos ---------- */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function airSweep({ from = 600, to = 3000, dur = 0.6, gain = 0.03, t = ctx.currentTime } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.7;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
  // bláster "piu": dos tonos que caen en picada por un pasabanda
  function pew(k = 1, gain = 0.16) {
    if (!live()) return;
    const t = ctx.currentTime;
    if (t - lastPew < 0.05) return;
    lastPew = t;
    const r = k * (0.9 + Math.random() * 0.2);
    const mk = (type, f0, f1, dur, g0, delay = 0) => {
      const tt = t + delay, o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * r, tt); o.frequency.exponentialRampToValueAtTime(f1 * r, tt + dur);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3;
      bp.frequency.setValueAtTime(f0 * r * 1.2, tt); bp.frequency.exponentialRampToValueAtTime(f1 * r * 1.6, tt + dur);
      const g = ctx.createGain(); env(g, tt, 0.003, g0, dur);
      o.connect(bp); bp.connect(g); g.connect(fx); g.connect(echoIn);
      o.start(tt); o.stop(tt + dur + 0.05);
    };
    mk("sawtooth", 1900, 220, 0.2, gain);
    mk("triangle", 2600, 320, 0.15, gain * 0.4, 0.012);
  }
  const chordNote = (k) => CHORDS[scene].v[k % 5] + 24;
  return {
    get on() { return on; },
    get playing() { return !!(ctx && started && on && ctx.state === "running"); },
    get debug() { return { ctx, master }; },               // (pruebas: ?debug)
    onChange(f) { listeners.add(f); },
    unlock,
    toggle() { if (on && !started) { unlock(); return; } setOn(!on); if (on) setTimeout(() => pew(1.1, 0.1), 80); },
    scene: setScene,
    // velocidad real de la cámara (u/s): un soplo de aire claro que crece y se aclara (sin tono)
    speed(v) {
      if (!ctx || !started) return;
      const now = ctx.currentTime;
      if (now - lastSpeedSet < 0.05) return;
      lastSpeedSet = now;
      const k = Math.max(0, Math.min(1, (v - 1.5) / 18));
      airGain.gain.setTargetAtTime(k * 0.075, now, 0.25);
      airFilter.frequency.setTargetAtTime(900 + k * 2600, now, 0.3);
    },
    // llegar a una escena: una onda muy suave con el acorde nuevo (en el cierre, sólo el pad)
    arrive() {
      if (!live() || scene === CHORDS.length - 1) return;
      [2, 4].forEach((k, i) => wave(chordNote(k) - 12, { gain: 0.008, attack: 0.9, release: 2.6, when: i * 0.2, depth: 7, vib: 4 }));
    },
    // clic en el vacío: el disparo (piu) y un "whoom" grave y suave
    blast() {
      if (!live()) return;
      pew(0.85, 0.18);
      const t = ctx.currentTime + 0.03, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.7);
      const g = ctx.createGain(); env(g, t, 0.04, 0.16, 0.8);
      o.connect(g); g.connect(fx); o.start(t); o.stop(t + 1);
      airSweep({ from: 2800, to: 700, dur: 0.7, gain: 0.025, t });
    },
    pew: () => pew(1, 0.14),
    // pasar el mouse: una onda suave con vibrato (textos agudos; botones un poco más graves, que suben)
    hover(kind = "text") {
      if (!live()) return;
      const t = ctx.currentTime;
      if (t - lastHover < 0.09) return;
      lastHover = t;
      if (kind === "ui") wave(chordNote(1) - 12, { gain: 0.02, attack: 0.05, release: 0.45, glide: 0.1, vib: 6, depth: 12 });
      else wave(chordNote(Math.floor(Math.random() * 5)), { gain: 0.011, attack: 0.06, release: 0.6, vib: 6, depth: 16 });
    },
    tick() { this.hover("ui"); },
    // la espiral pasa una ficha: un pulso suave
    detent() {
      if (!live()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(190, t + 0.18);
      const g = ctx.createGain(); env(g, t, 0.02, 0.035, 0.22); o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.3);
    },
    // abrir / cerrar paneles: holograma que sube o baja como onda (tono suave + aire claro)
    ui(kind) {
      if (!live()) return;
      const t = ctx.currentTime, up = kind === "open";
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(up ? 330 : 880, t); o.frequency.exponentialRampToValueAtTime(up ? 880 : 330, t + 0.5);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.5; vg.gain.value = 14; v.connect(vg); vg.connect(o.detune);
      const g = ctx.createGain(); env(g, t, 0.14, 0.035, 0.45);
      o.connect(g); g.connect(fx); g.connect(echoIn); o.start(t); v.start(t); o.stop(t + 0.7); v.stop(t + 0.7);
      airSweep({ from: up ? 700 : 3000, to: up ? 3000 : 700, dur: 0.55, gain: 0.02 });
    },
    // proceso: una onda por etapa que enciende el hilo
    note(k) { wave(PROC_NOTES[Math.max(0, Math.min(4, k))] - 12, { gain: 0.022, attack: 0.2, release: 1.6, pan: (k / 4 - 0.5) * 0.8, vib: 5, depth: 9 }); },
    // cierre: la M se arma → el pad se ilumina despacio y los destellos crecen un poco (sin golpe)
    resolve() {
      if (!live()) return;
      const t = ctx.currentTime;
      padFilter.frequency.cancelScheduledValues(t);
      padFilter.frequency.setTargetAtTime(2600, t, 1.4);
      padFilter.frequency.setTargetAtTime(1500 * CHORDS[6].bright, t + 4, 2.5);
      shimmerBus.gain.cancelScheduledValues(t);
      shimmerBus.gain.setTargetAtTime(1.8, t, 1.2);
      shimmerBus.gain.setTargetAtTime(1, t + 4, 2.5);
    }
  };
}
