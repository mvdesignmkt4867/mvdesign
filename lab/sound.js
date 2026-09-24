/* ============================================================
   MV Design · Lab — sonido celestial generado en vivo (Web Audio)
   Sin archivos: todo se sintetiza en el navegador y reacciona al recorrido.
   · Coro etéreo: voces "aah" (sierras en ensamble por un banco de formantes, con vocales que se
     transforman despacio), en registro alto y mucha reverberación.
   · Todo flota sobre un re fijo (modo lidio, el más luminoso): nunca hay caídas de tono. Al cambiar
     de escena el acorde nuevo ENTRA por encima mientras el anterior se desvanece (fundido cruzado,
     sin deslizar las voces).
   · Brillos: tonos altos que aparecen y se desvanecen muy despacio (sin ataque: no son campanas).
   · Viajar ilumina: con la velocidad de la cámara el coro se abre y los brillos suben.
   · Sin compresor que bombee: sólo un limitador suave para los picos.
   Efectos: "piu" de bláster en cada clic (el clic en el vacío suma una estela de polvo de estrellas);
   onda suave con vibrato al pasar el mouse; holograma al abrir/cerrar; una onda por etapa del
   proceso; en el cierre, el coro se ilumina despacio.
   Los navegadores sólo dejan sonar tras un toque, clic o tecla: `unlock()` se llama ahí.
   Encendido por omisión; si alguien lo apaga, se recuerda (localStorage).
   ============================================================ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// el coro canta una progresión sobre un re que nunca se mueve (así no hay bajones):
// I · IV/I · vi/I · V/I, con fundido cruzado entre voces. Avanza CON EL SCROLL, no con el tiempo:
// cada paso (escena o ficha de la espiral) mueve la melodía una nota; cada dos pasos cambia el acorde
const PROG = [
  [62, 69, 73, 76, 78],   // Dmaj9
  [62, 67, 71, 74, 78],   // G/D (Gmaj7)
  [62, 66, 69, 71, 76],   // Bm9/D
  [62, 64, 69, 73, 76]    // A/D (Aadd9)
];
// soprano: una melodía lenta encima (dos notas por acorde); el do# final resuelve subiendo al re
const MELODY = [74, 78, 79, 78, 76, 78, 76, 73];
const STEP_MIN = 0.9;                                 // s entre pasos (un scroll rápido no amontona cambios)
const CHORDS = PROG;                                  // (efectos: notas del acorde que suena)
const SPARK = [[86, 88, 90], [86, 88, 90], [85, 88, 92], [85, 88, 90], [86, 88, 90], [85, 88, 92], [85, 90, 93]];
const PROC_NOTES = [74, 76, 78, 81, 83];             // proceso: una onda por etapa, subiendo
const VOWELS = { a: [730, 1090, 2440], o: [570, 840, 2410] };   // "aah" ↔ "ooh"
const KEY = "mv-sound";
const VOL = 0.85;

export function createSound({ reduced = false } = {}) {
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  let ctx = null, started = false, scene = 0, lastHover = 0, lastSpeedSet = 0, lastPew = 0, bankIdx = 0;
  let progIdx = 0, melIdx = 0, lastStepT = -9, pendingDir = 0, stepTimer = 0, sop = null;
  let master, music, fx, rev, echoIn, choirIn, choirOut, formants, sparkBus, sparkGlow, sparks, airGain;
  const banks = [];
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
  function pinkBuf(sec) {
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
    // sólo un limitador para los picos (un compresor que bombea hacía "bajones" al entrar los efectos)
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(lim); lim.connect(ctx.destination);
    // catedral: reverb muy larga y clara
    rev = ctx.createConvolver(); rev.buffer = impulse(7, 2.2);
    const revLow = ctx.createBiquadFilter(); revLow.type = "highpass"; revLow.frequency.value = 220;
    const revOut = ctx.createGain(); revOut.gain.value = 0.7;
    rev.connect(revLow); revLow.connect(revOut); revOut.connect(master);
    echoIn = ctx.createGain();
    const dL = ctx.createDelay(1.5), fb = ctx.createGain(), echoTone = ctx.createBiquadFilter(), echoOut = ctx.createGain();
    dL.delayTime.value = 0.5; fb.gain.value = 0.3; echoTone.type = "lowpass"; echoTone.frequency.value = 4500; echoOut.gain.value = 0.3;
    echoIn.connect(dL); dL.connect(echoTone); echoTone.connect(fb); fb.connect(dL); echoTone.connect(echoOut); echoOut.connect(rev); echoOut.connect(master);
    music = ctx.createGain(); music.gain.value = 0.7; music.connect(master);
    const musicRev = ctx.createGain(); musicRev.gain.value = 1.1; music.connect(musicRev); musicRev.connect(rev);
    fx = ctx.createGain(); fx.gain.value = 0.8; fx.connect(master);
    const fxRev = ctx.createGain(); fxRev.gain.value = 0.55; fx.connect(fxRev); fxRev.connect(rev);
    const pink = pinkBuf(3);

    // coro: bancos de voces → banco de formantes (vocal que se transforma despacio) → brillo → salida
    choirIn = ctx.createGain(); choirIn.gain.value = 1;
    choirOut = ctx.createGain(); choirOut.gain.value = 0;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 3000; tone.Q.value = 0.5;   // (un poco más oscuro)
    formants = VOWELS.a.map((f, k) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = [7, 9, 11][k];
      bp.frequency.value = VOWELS.o[k] + (f - VOWELS.o[k]) * 0.35;          // vocal más cerca de "ooh" que de "aah"
      const g = ctx.createGain(); g.gain.value = [3.4, 2.0, 0.75][k];
      choirIn.connect(bp); bp.connect(g); g.connect(tone);
      // la vocal respira entre "aah" y "ooh" (cada formante a su ritmo)
      lfo(0.043 + k * 0.011, (VOWELS.a[k] - VOWELS.o[k]) * 0.35, bp.frequency);
      return bp;
    });
    const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 900;   // cuerpo cálido debajo de las vocales
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.35; choirIn.connect(body); body.connect(bodyG); bodyG.connect(tone);
    tone.connect(choirOut);
    const breathe = ctx.createGain(); breathe.gain.value = 1; lfo(0.09, 0.1, breathe.gain);   // respira muy poco (sin bajones)
    choirOut.connect(breathe); breathe.connect(music);
    // tres bancos de voces (el acorde nuevo entra en uno mientras el anterior se desvanece)
    const vib = ctx.createOscillator(), vibG = ctx.createGain(); vib.frequency.value = 4.6; vibG.gain.value = 7; vib.connect(vibG); vib.start();
    for (let b = 0; b < 3; b++) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(choirIn);
      const vs = PROG[0].map((m, i) => {
        const p = panner((i / 4 - 0.5) * 0.9); p.connect(g);
        return [-7, 7].map((c) => {                                   // dos voces por nota, apenas desafinadas (ensamble)
          const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = c + (Math.random() - 0.5) * 4;
          vibG.connect(o.detune);
          const og = ctx.createGain(); og.gain.value = 0.026; o.connect(og); og.connect(p); o.start();
          return o;
        });
      });
      banks.push({ g, vs });
    }
    // soprano: una voz sola del coro (mismos formantes) que canta la melodía, ligada
    const sopG = ctx.createGain(); sopG.gain.value = 0; sopG.connect(choirIn);
    const sopOscs = [-6, 6].map((c) => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(MELODY[0]); o.detune.value = c;
      vibG.connect(o.detune);
      const og = ctx.createGain(); og.gain.value = 0.028; o.connect(og); og.connect(sopG); o.start();
      return o;
    });
    sop = { g: sopG, oscs: sopOscs };
    // pedal de re, muy suave y quieto (calidez sin peso)
    const ped = ctx.createOscillator(); ped.type = "sine"; ped.frequency.value = mtof(50);
    const pedG = ctx.createGain(); pedG.gain.value = 0.03; ped.connect(pedG); pedG.connect(music); ped.start();
    const ped2 = ctx.createOscillator(); ped2.type = "sine"; ped2.frequency.value = mtof(57);
    const ped2G = ctx.createGain(); ped2G.gain.value = 0.014; ped2.connect(ped2G); ped2G.connect(music); ped2.start();
    // brillos celestiales: tonos altos que aparecen y se desvanecen muy despacio, viajando en el estéreo
    sparkBus = ctx.createGain(); sparkBus.gain.value = 1;
    sparkGlow = ctx.createGain(); sparkGlow.gain.value = 1;              // (el cierre los ilumina aparte de la velocidad)
    sparkBus.connect(sparkGlow); sparkGlow.connect(music); sparkGlow.connect(echoIn);
    sparks = SPARK[scene].map((m, k) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = mtof(m);
      const g = ctx.createGain(); g.gain.value = 0.0034; lfo(0.05 + k * 0.03, 0.0034, g.gain);
      const p = panner(0); if (p.pan) lfo(0.025 + k * 0.017, 0.9, p.pan);
      o.connect(g); g.connect(p); p.connect(sparkBus); o.start();
      return o;
    });
    // aire muy lejano (arriba), casi imperceptible; crece un poco al viajar
    const air = ctx.createBufferSource(); air.buffer = pink; air.loop = true;
    const airHp = ctx.createBiquadFilter(); airHp.type = "highpass"; airHp.frequency.value = 2500;
    airGain = ctx.createGain(); airGain.gain.value = 0.006;
    const ap = panner(0); if (ap.pan) lfo(0.04, 0.7, ap.pan);
    air.connect(airHp); airHp.connect(airGain); airGain.connect(ap); ap.connect(music); air.start();
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
    choirOut.gain.setValueAtTime(0, now);
    choirOut.gain.linearRampToValueAtTime(1, now + 5);
    banks[0].g.gain.setValueAtTime(1, now);
    setScene(scene, true);
    sop.g.gain.setValueAtTime(0, now); sop.g.gain.linearRampToValueAtTime(1, now + 7);   // la soprano entra después del coro
  }
  // el coro cambia de acorde (fundido cruzado entre bancos: ninguna voz desliza su tono)
  function choirTo(chord, now) {
    const old = banks[bankIdx];
    bankIdx = (bankIdx + 1) % banks.length;
    const nb = banks[bankIdx], audible = nb.g.gain.value > 0.02;
    const tr = now + (audible ? 0.15 : 0.01);
    if (audible) { nb.g.gain.cancelScheduledValues(now); nb.g.gain.setTargetAtTime(0, now, 0.04); }
    nb.vs.forEach((pair, v) => pair.forEach((o) => { o.frequency.cancelScheduledValues(now); o.frequency.setValueAtTime(mtof(chord[v]), tr); }));
    nb.g.gain.setTargetAtTime(1, tr, 0.8);                       // entra
    old.g.gain.cancelScheduledValues(now); old.g.gain.setTargetAtTime(0, now + 0.3, 1.1);   // el anterior se queda un poco y se desvanece
  }
  // la soprano pasa a su siguiente nota: ligado corto y una leve rearticulación (como una cantante)
  function sing(m, now) {
    sop.oscs.forEach((o) => { o.frequency.cancelScheduledValues(now); o.frequency.setTargetAtTime(mtof(m), now, 0.06); });
    sop.g.gain.cancelScheduledValues(now);
    sop.g.gain.setTargetAtTime(0.72, now, 0.05);
    sop.g.gain.setTargetAtTime(1, now + 0.1, 0.45);
  }
  // un paso del scroll: la melodía avanza (o retrocede) una nota; al cruzar de par cambia el acorde
  function goMel(i, now) {
    melIdx = (i + MELODY.length) % MELODY.length;
    const c = Math.floor(melIdx / 2);
    if (c !== progIdx) { progIdx = c; choirTo(PROG[progIdx], now); }
    sing(MELODY[melIdx], now + 0.05);
    lastStepT = now;
  }
  function stepMusic(dir) {
    if (!live() || !dir) return;
    const now = ctx.currentTime, wait = STEP_MIN - (now - lastStepT);
    if (wait <= 0) { goMel(melIdx + Math.sign(dir), now); return; }
    pendingDir = Math.sign(dir);                             // (demasiado seguido: se aplica uno al terminar la espera)
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => { if (pendingDir && live()) goMel(melIdx + pendingDir, ctx.currentTime); pendingDir = 0; }, wait * 1000);
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
  // escena: el acorde nuevo entra en otro banco mientras el anterior se desvanece (sin deslizar tonos)
  function setScene(a, instant = false) {
    const prev = scene;
    scene = Math.max(0, Math.min(CHORDS.length - 1, a));
    if (!ctx || !started) return;
    const now = ctx.currentTime;
    sparks.forEach((o, k) => { o.frequency.cancelScheduledValues(now); o.frequency.setValueAtTime(mtof(SPARK[scene][k]), now + 0.02); });
    if (instant) {
      banks.forEach((b, i) => { b.vs.forEach((pair, v) => pair.forEach((o) => o.frequency.setValueAtTime(mtof(PROG[progIdx][v]), now))); b.g.gain.setValueAtTime(i === bankIdx ? 1 : 0, now); });
      return;
    }
    if (prev === scene) return;
    stepMusic(scene - prev);                                  // cada cambio de escena es un paso del coro
  }

  /* ---------- efectos ---------- */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  // una onda: tono suave con vibrato que crece y se desvanece (sin golpe)
  function wave(m, { gain = 0.02, attack = 0.15, release = 1.2, vib = 5.5, depth = 10, type = "sine", pan = (Math.random() - 0.5) * 0.8, glide = 0, when = 0 } = {}) {
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
  function pew(k = 1, gain = 0.14) {
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
    mk("sawtooth", 1900, 240, 0.2, gain);
    mk("triangle", 2600, 340, 0.15, gain * 0.4, 0.012);
  }
  const chordNote = (k) => PROG[progIdx][k % 5];
  return {
    get on() { return on; },
    get playing() { return !!(ctx && started && on && ctx.state === "running"); },
    get debug() { return { ctx, master }; },               // (pruebas: ?debug)
    onChange(f) { listeners.add(f); },
    unlock,
    toggle() { if (on && !started) { unlock(); return; } setOn(!on); if (on) setTimeout(() => pew(1.1, 0.1), 80); },
    scene: setScene,
    step: stepMusic,                                         // (espiral: cada ficha que pasa es un paso del coro)
    // viajar ilumina: con la velocidad de la cámara el coro abre sus vocales, los brillos y el aire suben
    speed(v) {
      if (!ctx || !started) return;
      const now = ctx.currentTime;
      if (now - lastSpeedSet < 0.05) return;
      lastSpeedSet = now;
      const k = Math.max(0, Math.min(1, (v - 1.5) / 18));
      sparkBus.gain.setTargetAtTime(1 + k * 1.6, now, 0.4);
      airGain.gain.setTargetAtTime(0.006 + k * 0.03, now, 0.35);
      choirIn.gain.setTargetAtTime(1 + k * 0.25, now, 0.5);
    },
    arrive() {},                                             // (la llegada ya la hace el acorde que entra)
    // clic en el vacío: el disparo (piu) y una estela de polvo de estrellas que sube y se desvanece
    blast() {
      if (!live()) return;
      pew(0.85, 0.16);
      SPARK[scene].forEach((m, i) => wave(m - 12, { gain: 0.009, attack: 0.12 + i * 0.05, release: 1.4, when: 0.05, depth: 8, vib: 5 }));
    },
    pew: () => pew(1, 0.13),
    // pasar el mouse: una onda suave con vibrato (textos agudos; botones un poco más graves, que suben)
    hover(kind = "text") {
      if (!live()) return;
      const t = ctx.currentTime;
      if (t - lastHover < 0.09) return;
      lastHover = t;
      if (kind === "ui") wave(chordNote(2), { gain: 0.016, attack: 0.05, release: 0.45, glide: 0.08, vib: 6, depth: 10 });
      else wave(chordNote(1 + Math.floor(Math.random() * 4)) + 12, { gain: 0.009, attack: 0.07, release: 0.6, vib: 6, depth: 12 });
    },
    tick() { this.hover("ui"); },
    // la espiral pasa una ficha: un pulso suave
    detent() {
      if (!live()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(mtof(74), t); o.frequency.exponentialRampToValueAtTime(mtof(69), t + 0.2);
      const g = ctx.createGain(); env(g, t, 0.02, 0.022, 0.25); o.connect(g); g.connect(fx); o.start(t); o.stop(t + 0.3);
    },
    // abrir / cerrar paneles: holograma que sube o baja como onda
    ui(kind) {
      if (!live()) return;
      const t = ctx.currentTime, up = kind === "open";
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(mtof(up ? 69 : 81), t); o.frequency.exponentialRampToValueAtTime(mtof(up ? 81 : 69), t + 0.5);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.5; vg.gain.value = 10; v.connect(vg); vg.connect(o.detune);
      const g = ctx.createGain(); env(g, t, 0.15, 0.028, 0.5);
      o.connect(g); g.connect(fx); g.connect(echoIn); o.start(t); v.start(t); o.stop(t + 0.75); v.stop(t + 0.75);
    },
    // proceso: una onda por etapa que enciende el hilo
    note(k) { wave(PROC_NOTES[Math.max(0, Math.min(4, k))], { gain: 0.016, attack: 0.22, release: 1.8, pan: (k / 4 - 0.5) * 0.8, vib: 5, depth: 8 }); },
    // cierre: la M se arma → el coro y los brillos se iluminan despacio (sin golpe)
    resolve() {
      if (!live()) return;
      const t = ctx.currentTime;
      if (melIdx !== 0) goMel(0, t);                         // el coro llega a casa (re)
      sparkGlow.gain.cancelScheduledValues(t);
      sparkGlow.gain.setTargetAtTime(2.2, t, 1.4);
      sparkGlow.gain.setTargetAtTime(1, t + 5, 2.5);
    }
  };
}
