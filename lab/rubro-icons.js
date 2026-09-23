/* ============================================================
   MV Design · Lab — íconos animados de los rubros (motion graphics)
   Cada draw(g, s, t) pinta en un lienzo s×s transparente (canvas 2D),
   en loop perfecto; lab.js lo sube como textura a la esquina superior
   derecha de su ficha. Con movimiento reducido se dibuja t = 0.8.
   ============================================================ */
export const ICON_DRAW = {
  // ab
  ab:
  function draw_ab(g, s, t) {
    // A&B: taza de café con vapor que asciende ondulando (loop de 3.2 s)
    var P = 3.2, u = (t % P) / P, TAU = Math.PI * 2;
    var gr = g.createLinearGradient(0, s, s, 0);
    gr.addColorStop(0, '#9E43B8'); gr.addColorStop(0.3, '#625CD9');
    gr.addColorStop(0.65, '#4892D9'); gr.addColorStop(1, '#2BCCD9');
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = gr;
  
    // --- Vapor: 3 volutas; la onda viaja hacia arriba ---
    var cx = s * 0.42;
    g.lineWidth = s * 0.045;
    for (var i = 0; i < 3; i++) {
      var x0 = cx + (i - 1) * s * 0.12;
      var y0 = s * 0.445, y1 = s * (i === 1 ? 0.12 : 0.19);
      // respiración suave: la voluta se alarga y encoge un poco
      y1 += s * 0.025 * Math.sin(TAU * u + i * 2.1);
      g.beginPath();
      for (var j = 0; j <= 14; j++) {
        var v = j / 14;
        var y = y0 + (y1 - y0) * v;
        var a = s * (0.008 + 0.032 * v); // más ondulación al subir
        var x = x0 + a * Math.sin(TAU * (v * 1.1 - u) + i * 0.9);
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // desvanecer el vapor arriba y en su nacimiento (sólo toca la franja del vapor)
    var m = g.createLinearGradient(0, s * 0.08, 0, s * 0.47);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(0.18, 'rgba(0,0,0,.85)');
    m.addColorStop(0.55, 'rgba(0,0,0,0)');
    m.addColorStop(0.82, 'rgba(0,0,0,0)');
    m.addColorStop(1, 'rgba(0,0,0,.75)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = m;
    g.fillRect(0, 0, s, s * 0.47);
    g.globalCompositeOperation = 'source-over';
  
    // --- Taza ---
    g.lineWidth = s * 0.055;
    g.beginPath();
    g.moveTo(s * 0.20, s * 0.50);
    g.lineTo(s * 0.64, s * 0.50);
    g.lineTo(s * 0.64, s * 0.60);
    g.bezierCurveTo(s * 0.64, s * 0.72, s * 0.56, s * 0.78, s * 0.42, s * 0.78);
    g.bezierCurveTo(s * 0.28, s * 0.78, s * 0.20, s * 0.72, s * 0.20, s * 0.60);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fill();
    g.stroke();
    // asa
    g.beginPath();
    g.moveTo(s * 0.655, s * 0.555);
    g.bezierCurveTo(s * 0.80, s * 0.53, s * 0.81, s * 0.71, s * 0.615, s * 0.715);
    g.stroke();
    // plato
    g.beginPath();
    g.moveTo(s * 0.16, s * 0.865);
    g.lineTo(s * 0.68, s * 0.865);
    g.stroke();
    // brillo blanco sutil en el cuerpo
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = s * 0.03;
    g.beginPath();
    g.moveTo(s * 0.29, s * 0.58);
    g.quadraticCurveTo(s * 0.29, s * 0.67, s * 0.34, s * 0.70);
    g.stroke();
  },
  // corp
  corp:
  function draw_corp(g, s, t) {
    // Torre corporativa + edificio anexo: las ventanas se encienden piso a piso
    // (de abajo hacia arriba) y luego se apagan suave; la baliza late una vez por ciclo.
    var P = 3.2;
    var u = ((((t + 1.06) % P) + P) % P) / P; // desfase: en t=0.8 todo está encendido
  
    var gr = g.createLinearGradient(0, s, s, 0);
    gr.addColorStop(0, '#9E43B8');
    gr.addColorStop(0.3, '#625CD9');
    gr.addColorStop(0.65, '#4892D9');
    gr.addColorStop(1, '#2BCCD9');
  
    function sm(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
  
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = s * 0.05;
    g.strokeStyle = gr;
  
    // Silueta: torre con remate escalonado + anexo + suelo + antena (un solo trazo)
    g.beginPath();
    g.moveTo(s * 0.22, s * 0.86);
    g.lineTo(s * 0.22, s * 0.30);
    g.lineTo(s * 0.31, s * 0.30);
    g.lineTo(s * 0.31, s * 0.19);
    g.lineTo(s * 0.51, s * 0.19);
    g.lineTo(s * 0.51, s * 0.30);
    g.lineTo(s * 0.60, s * 0.30);
    g.lineTo(s * 0.60, s * 0.86);
    g.moveTo(s * 0.60, s * 0.52);
    g.lineTo(s * 0.78, s * 0.52);
    g.lineTo(s * 0.78, s * 0.86);
    g.moveTo(s * 0.15, s * 0.86);
    g.lineTo(s * 0.85, s * 0.86);
    g.moveTo(s * 0.41, s * 0.19);
    g.lineTo(s * 0.41, s * 0.135);
    g.stroke();
  
    // Ventanas en orden de encendido (piso a piso, en zigzag)
    var tl = 0.285, tr = 0.435, an = 0.65;          // columnas x
    var f0 = 0.71, f1 = 0.595, f2 = 0.48, f3 = 0.365; // pisos y
    var win = [
      [tl, f0, 0.10], [tr, f0, 0.10], [an, f0, 0.075],
      [an, f1, 0.075], [tr, f1, 0.10], [tl, f1, 0.10],
      [tl, f2, 0.10], [tr, f2, 0.10],
      [tr, f3, 0.10], [tl, f3, 0.10]
    ];
    var H = s * 0.075, R = s * 0.02, pad = s * 0.016;
    for (var k = 0; k < win.length; k++) {
      var x = s * win[k][0], y = s * win[k][1], W = s * win[k][2];
      var on = 0.04 + k * 0.042, off = 0.66 + k * 0.02;
      var b = sm((u - on) / 0.1) * (1 - sm((u - off) / 0.13));
  
      if (b < 0.97) {                        // ventana apagada (vidrio tenue)
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.07)';
        rr(x, y, W, H, R);
        g.fill();
      }
      if (b > 0.004) {
        g.fillStyle = gr;
        g.globalAlpha = 0.2 * b;             // halo suave
        rr(x - pad, y - pad, W + pad * 2, H + pad * 2, R + pad);
        g.fill();
        g.globalAlpha = b;                   // luz encendida
        rr(x, y, W, H, R);
        g.fill();
        g.fillStyle = '#fff';                // brillo cálido de la luz
        g.globalAlpha = 0.2 * b;
        g.fill();
      }
    }
  
    // Baliza de la antena: late una vez por ciclo (máximo con todo encendido)
    var pb = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
    g.globalAlpha = 0.2 + 0.7 * pb;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s * 0.41, s * 0.135, s * 0.024, 0, Math.PI * 2);
    g.fill();
  
    g.restore();
  },
  // ind
  ind:
  function draw_ind(g, s, t) {
    // Industrial / Inmobiliaria: casa a dos aguas con un engrane que gira dentro.
    var P = 3.2, TAU = Math.PI * 2;
    var u = (t % P) / P;
    var k = s / 160;
    g.save();
    g.scale(k, k);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    var grad = g.createLinearGradient(0, 160, 160, 0);
    grad.addColorStop(0, '#9E43B8');
    grad.addColorStop(0.3, '#625CD9');
    grad.addColorStop(0.65, '#4892D9');
    grad.addColorStop(1, '#2BCCD9');
    var W = 8;
  
    // Geometría (unidades de un lienzo de 160)
    var ax = 80, ay = 25;        // cumbrera
    var ex = 22, ey = 72;        // alero (izq.); el derecho es simétrico
    var wl = 39, wr = 121;       // muros
    var fy = 137;                // piso
    var sl = (ey - ay) / (ax - ex);
    var wy = ey - (wl - ex) * sl; // donde el muro toca el techo
  
    // Relleno muy sutil del volumen de la casa
    g.beginPath();
    g.moveTo(wl, wy); g.lineTo(ax, ay); g.lineTo(wr, wy);
    g.lineTo(wr, fy); g.lineTo(wl, fy); g.closePath();
    g.globalAlpha = 0.09;
    g.fillStyle = grad;
    g.fill();
    g.globalAlpha = 1;
  
    g.strokeStyle = grad;
    g.lineWidth = W;
  
    // Techo a dos aguas (con alero)
    g.beginPath();
    g.moveTo(ex, ey); g.lineTo(ax, ay); g.lineTo(160 - ex, ey);
    g.stroke();
  
    // Muros + piso
    g.beginPath();
    g.moveTo(wl, wy + 2); g.lineTo(wl, fy); g.lineTo(wr, fy); g.lineTo(wr, wy + 2);
    g.stroke();
  
    // Engrane de 8 dientes: gira 45° por periodo (loop perfecto por simetría).
    // Velocidad con respiración suave: nunca se detiene, acelera al centro del ciclo.
    var rot = (Math.PI / 4) * (u - 0.55 * Math.sin(TAU * u) / TAU);
    var cx = 80, cy = 99, Ro = 25, Ri = 17.5;
    var d = Math.PI / 180;
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var b = rot + i * Math.PI / 4 - Math.PI / 2;
      g.arc(cx, cy, Ri, b - 22.5 * d, b - 11 * d);
      g.arc(cx, cy, Ro, b - 4.5 * d, b + 4.5 * d);
      g.arc(cx, cy, Ri, b + 11 * d, b + 22.5 * d);
    }
    g.closePath();
    g.globalAlpha = 0.12;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  
    // Eje del engrane
    g.beginPath();
    g.arc(cx, cy, 4.2, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fill();
  
    // Brillo que recorre el techo de alero a alero (entra y sale en alfa 0)
    var half = 0.09;                 // media longitud del destello (fracción del techo)
    var q = -half + u * (1 + 2 * half);
    function pt(v) {
      v = Math.max(0, Math.min(1, v));
      if (v <= 0.5) { var f = v * 2; return [ex + (ax - ex) * f, ey + (ay - ey) * f]; }
      var h = (v - 0.5) * 2; return [ax + (160 - ex - ax) * h, ay + (ey - ay) * h];
    }
    var q0 = q - half, q1 = q + half;
    if (q1 > 0 && q0 < 1) {
      var a = Math.sin(Math.PI * u);
      var p0 = pt(q0), p1 = pt(q1);
      g.beginPath();
      g.moveTo(p0[0], p0[1]);
      if (q0 < 0.5 && q1 > 0.5) g.lineTo(ax, ay);
      g.lineTo(p1[0], p1[1]);
      g.strokeStyle = 'rgba(255,255,255,' + (0.55 * a * a).toFixed(3) + ')';
      g.lineWidth = W * 0.42;
      g.stroke();
    }
    g.restore();
  },
  // salud
  salud:
  function draw_salud(g, s, t) {
    // Salud / Estética: el pulso (ECG) se traza y se borra; el destello de 4 puntas late cuando el trazo cruza el pico
    var P = 3.2, TAU = Math.PI * 2;
    var u = ((t + 0.96) % P) / P;          // fase 0..1 (desfase: en t=0.8 la línea está completa)
    function ease(x) { x = Math.max(0, Math.min(1, x)); return 0.5 - 0.5 * Math.cos(Math.PI * x); }
  
    // degradado de marca, esquina inf-izq -> sup-der
    var gr = g.createLinearGradient(0, s, s, 0);
    gr.addColorStop(0, '#9E43B8');
    gr.addColorStop(0.3, '#625CD9');
    gr.addColorStop(0.65, '#4892D9');
    gr.addColorStop(1, '#2BCCD9');
    g.lineCap = 'round';
    g.lineJoin = 'round';
  
    // trazo ECG (normalizado)
    var pts = [[0.12, 0.66], [0.31, 0.66], [0.37, 0.72], [0.45, 0.31], [0.53, 0.83], [0.59, 0.66], [0.88, 0.66]];
    var cum = [0], L = 0, i;
    for (i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(L);
    }
    function at(f) {                        // punto a una fracción f del recorrido
      var d = Math.max(0, Math.min(1, f)) * L, k = 1;
      while (k < pts.length - 1 && d > cum[k]) k++;
      var r = (d - cum[k - 1]) / (cum[k] - cum[k - 1]);
      return [(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * r) * s,
              (pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * r) * s];
    }
    function seg(a, b) {                    // sub-trazo entre fracciones a y b
      var p = at(a);
      g.beginPath();
      g.moveTo(p[0], p[1]);
      for (var k = 1; k < pts.length - 1; k++) {
        var f = cum[k] / L;
        if (f > a && f < b) g.lineTo(pts[k][0] * s, pts[k][1] * s);
      }
      p = at(b);
      g.lineTo(p[0], p[1]);
    }
  
    // fases: trazar 0–.5 · sostener .5–.62 · borrar .62–.95 · reposo
    var head = ease(u / 0.5);
    var tail = ease((u - 0.62) / 0.33);
  
    // 1) pista tenue (siempre legible)
    g.strokeStyle = gr;
    g.lineWidth = s * 0.052;
    g.globalAlpha = 0.28;
    seg(0, 1); g.stroke();
  
    // 2) trazo vivo
    if (head - tail > 0.002) {
      g.globalAlpha = 1;
      seg(tail, head); g.stroke();
    }
  
    // punta brillante: aparece al arrancar, se queda al final y se apaga en el sostén
    var dotA = u < 0.5 ? Math.min(1, u * 14) : Math.max(0, 1 - (u - 0.5) / 0.12);
    if (dotA > 0) {
      var hp = at(head);
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.16 * dotA;
      g.beginPath(); g.arc(hp[0], hp[1], s * 0.07, 0, TAU); g.fill();
      g.globalAlpha = 0.95 * dotA;
      g.beginPath(); g.arc(hp[0], hp[1], s * 0.03, 0, TAU); g.fill();
    }
  
    // 3) destello de 4 puntas: late justo después de que el trazo cruza el pico
    var fPk = cum[3] / L;
    var uPk = 0.5 * Math.acos(1 - 2 * fPk) / Math.PI;
    var dt = u - uPk - 0.02;
    var beat = dt > 0 ? Math.exp(-dt * 7) * Math.min(1, dt * 25) : 0;
    var breathe = 0.5 - 0.5 * Math.cos(TAU * u);
    var sc = 0.92 + 0.05 * breathe + 0.18 * beat;
    var cx = s * 0.72, cy = s * 0.29, R = s * 0.118 * sc, w = R * 0.2;
    var rot = 0.1 * Math.sin(TAU * u);
  
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    g.moveTo(0, -R);
    g.quadraticCurveTo(w, -w, R, 0);
    g.quadraticCurveTo(w, w, 0, R);
    g.quadraticCurveTo(-w, w, -R, 0);
    g.quadraticCurveTo(-w, -w, 0, -R);
    g.closePath();
    g.restore();
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.08 + 0.2 * beat;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = s * 0.042;
    g.stroke();
  
    // núcleo: chispa blanca que sólo se enciende con el latido
    if (beat > 0.02) {
      g.globalAlpha = 0.9 * beat;
      g.beginPath(); g.arc(cx, cy, s * 0.022 * (0.6 + 0.4 * beat), 0, TAU); g.fill();
    }
  
    // cruz satélite (guiño clínico), titila en contrafase
    var tw = 0.5 + 0.5 * Math.cos(TAU * u);
    var mx = s * 0.85, my = s * 0.5, m = s * (0.026 + 0.014 * tw);
    g.globalAlpha = 0.35 + 0.5 * tw;
    g.lineWidth = s * 0.03;
    g.beginPath();
    g.moveTo(mx, my - m); g.lineTo(mx, my + m);
    g.moveTo(mx - m, my); g.lineTo(mx + m, my);
    g.stroke();
  
    g.globalAlpha = 1;
  },
  // life
  life:
  function draw_life(g, s, t) {
    // Lifestyle / Travel: avión de papel en vuelo sobre un sol en el horizonte,
    // estela punteada que se queda en el aire y se desvanece. Loop P = 3.6 s.
    var P = 3.6, W = 2 * Math.PI / P, TAU = 2 * Math.PI;
    var tt = t % P;
    var lw = s * 0.05;
  
    var gr = g.createLinearGradient(0, s, s, 0);
    gr.addColorStop(0, '#9E43B8');
    gr.addColorStop(0.3, '#625CD9');
    gr.addColorStop(0.65, '#4892D9');
    gr.addColorStop(1, '#2BCCD9');
  
    g.lineCap = 'round';
    g.lineJoin = 'round';
  
    // --- horizonte + sol ---
    var hy = s * 0.74, sx = s * 0.40, sr = s * 0.155;
    var breathe = 0.5 + 0.5 * Math.sin(W * tt - 1.2);
    g.beginPath();
    g.arc(sx, hy, sr, Math.PI, TAU);
    g.closePath();
    g.globalAlpha = 0.10 + 0.05 * breathe;
    g.fillStyle = gr;
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(sx, hy, sr, Math.PI, TAU);
    g.strokeStyle = gr;
    g.lineWidth = lw;
    g.stroke();
  
    g.beginPath();
    g.moveTo(s * 0.13, hy);
    g.lineTo(s * 0.87, hy);
    g.stroke();
  
    // rayos cortos que respiran
    var r0 = sr + s * 0.06, r1 = r0 + s * (0.04 + 0.018 * breathe);
    g.lineWidth = lw * 0.8;
    g.beginPath();
    for (var q = 0; q < 5; q++) {
      var a = Math.PI + (q + 1) * Math.PI / 6;
      g.moveTo(sx + Math.cos(a) * r0, hy + Math.sin(a) * r0);
      g.lineTo(sx + Math.cos(a) * r1, hy + Math.sin(a) * r1);
    }
    g.stroke();
  
    // reflejos en el agua (se deslizan suave)
    var drift = s * 0.018 * Math.sin(W * tt);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = lw * 0.7;
    g.beginPath();
    g.moveTo(sx - s * 0.12 + drift, hy + s * 0.075);
    g.lineTo(sx + s * 0.12 + drift, hy + s * 0.075);
    g.moveTo(sx - s * 0.06 - drift, hy + s * 0.14);
    g.lineTo(sx + s * 0.06 - drift, hy + s * 0.14);
    g.stroke();
  
    // --- trayectoria del avión (vaivén periódico) ---
    var cx = s * 0.67, cy = s * 0.28, ay = s * 0.02, ax = s * 0.006;
    function px(T) { return cx + ax * Math.sin(W * T + 1.6); }
    function py(T) { return cy + ay * Math.sin(W * T); }
    // la "cámara" avanza: lo emitido se va a la izquierda y abajo (arco de ascenso)
    var L = 2.4, vx = s * 0.44 / L, c1 = s * 0.09 / L, k = s * 0.11 / (L * L);
    var tailX = -s * 0.085, tailY = s * 0.012;
  
    // estela punteada: un punto cada d segundos (d divide a P -> loop exacto)
    var d = 0.3, N = 8;
    var j = Math.floor(tt / d);
    g.fillStyle = gr;
    for (var i = 0; i < N; i++) {
      var T = (j - i) * d;
      var age = tt - T;
      var an = age / L;
      if (an <= 0 || an >= 1) continue;
      var x = px(T) + tailX - vx * age;
      var y = py(T) + tailY + c1 * age + k * age * age;
      var fin = Math.min(1, age / 0.35);
      g.globalAlpha = fin * Math.pow(1 - an, 1.3) * 0.95;
      g.beginPath();
      g.arc(x, y, s * 0.026 * (1 - 0.5 * an), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  
    // --- avión de papel (vista 3/4, apunta a la derecha) ---
    var X = px(tt), Y = py(tt);
    var dl = 0.2;
    var hx = X - (px(tt - dl) - vx * dl);
    var hyy = Y - (py(tt - dl) + c1 * dl + k * dl * dl);
    // cabeceo amortiguado alrededor del ángulo de ascenso medio
    var ang = -0.2 + 0.6 * (Math.atan2(hyy, hx) + 0.2);
    var ca = Math.cos(ang), sa = Math.sin(ang), R = s * 0.17;
    function pt(u, v) { return [X + (u * ca - v * sa) * R, Y + (u * sa + v * ca) * R]; }
    var N0 = pt(1, 0), Wg = pt(-0.78, -0.66), K = pt(-0.36, 0.05), Lk = pt(-0.56, 0.5);
  
    // relleno sutil: ala lejana más clara que la quilla
    g.beginPath();
    g.moveTo(N0[0], N0[1]); g.lineTo(Wg[0], Wg[1]); g.lineTo(K[0], K[1]); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.fill();
    g.beginPath();
    g.moveTo(N0[0], N0[1]); g.lineTo(K[0], K[1]); g.lineTo(Lk[0], Lk[1]); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fill();
  
    g.strokeStyle = gr;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(N0[0], N0[1]); g.lineTo(Wg[0], Wg[1]); g.lineTo(K[0], K[1]);
    g.lineTo(Lk[0], Lk[1]); g.closePath();
    g.stroke();
    // pliegue central
    g.lineWidth = lw * 0.75;
    g.beginPath();
    g.moveTo(N0[0], N0[1]); g.lineTo(K[0], K[1]);
    g.stroke();
  },
  // serv
  serv:
  function draw_serv(g, s, t) {
    // Campana de mostrador: se presiona el botón, la campana se mece y salen 2 ondas por lado
    var P = 3.2, u = (t % P) / P, PI = Math.PI;
    var cx = s * 0.5, baseY = s * 0.77, cy = s * 0.675, R = s * 0.265;
    var lw = s * 0.052;
    g.save();
    var gr = g.createLinearGradient(0, s, s, 0);
    gr.addColorStop(0, '#9E43B8'); gr.addColorStop(0.3, '#625CD9');
    gr.addColorStop(0.65, '#4892D9'); gr.addColorStop(1, '#2BCCD9');
    g.lineCap = 'round'; g.lineJoin = 'round';
  
    // botón: baja y sube suave al inicio del ciclo
    var pr = u < 0.12 ? Math.sin(PI * u / 0.12) : 0;
    pr *= pr;
    // mecida: seno amortiguado, empieza y termina en reposo (sin salto en el loop)
    var v = (u - 0.05) / 0.6, tilt = 0;
    if (v > 0 && v < 1) tilt = 0.17 * Math.sin(PI * 5 * v) * Math.sin(PI * v) * (1 - v);
  
    // ondas de sonido (fijas en el aire, no giran con la campana)
    var wy = cy - R * 0.15;
    for (var i = 0; i < 2; i++) {
      var w = (u - 0.04 - i * 0.1) / 0.5;
      if (w <= 0 || w >= 1) continue;
      var e = 1 - Math.pow(1 - w, 2);              // ease-out del radio
      var r = R * (1.2 + 0.42 * e);
      var a = Math.pow(Math.sin(PI * w), 1.4);     // aparece y se desvanece
      g.globalAlpha = a * (i ? 0.7 : 1);
      g.strokeStyle = gr; g.lineWidth = lw * (0.9 - 0.25 * w);
      g.beginPath(); g.arc(cx, wy, r, -0.78 - 0.34, -0.78 + 0.34); g.stroke();
      g.beginPath(); g.arc(cx, wy, r, PI + 0.78 - 0.34, PI + 0.78 + 0.34); g.stroke();
    }
    g.globalAlpha = 1;
  
    // base (fija)
    g.strokeStyle = gr; g.lineWidth = lw;
    g.beginPath(); g.moveTo(cx - s * 0.36, baseY); g.lineTo(cx + s * 0.36, baseY); g.stroke();
  
    // campana (gira sobre el centro del borde)
    g.save();
    g.translate(cx, cy); g.rotate(tilt); g.translate(-cx, -cy);
    g.beginPath(); g.arc(cx, cy, R, PI, 2 * PI); g.closePath();
    g.globalAlpha = 0.13; g.fillStyle = gr; g.fill();
    g.globalAlpha = 1; g.stroke();
    // brillo interior
    g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = lw * 0.55;
    g.beginPath(); g.arc(cx, cy, R * 0.66, PI + 0.42, PI + 1.0); g.stroke();
    // vástago y botón
    var ky = cy - R - s * 0.075 + pr * s * 0.035;
    g.strokeStyle = gr; g.lineWidth = lw;
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, ky); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.06, ky); g.lineTo(cx + s * 0.06, ky); g.stroke();
    g.restore();
    g.restore();
  },
};
