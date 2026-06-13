/* ============================================================
   UCAR — Profesyonel araç çizimi (arkadan görünüm)
   Hem tarayıcıda (window.UcarCar) hem Node'da (require) çalışır.
   Parça parça inşa: gölge → tekerlek → gövde → cam → stoplar →
   tampon → difüzör/egzoz → plaka → detaylar.
   ============================================================ */
(function (root) {
  'use strict';

  function hexToRgb(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }
  function toRgb(c) { return `rgb(${clamp(c.r)},${clamp(c.g)},${clamp(c.b)})`; }
  // Renk tonu: l>0 açar, l<0 koyar (algısal yumuşak)
  function shade(hex, l) {
    const c = hexToRgb(hex);
    if (l >= 0) return toRgb({ r: c.r + (255 - c.r) * l, g: c.g + (255 - c.g) * l, b: c.b + (255 - c.b) * l });
    return toRgb({ r: c.r * (1 + l), g: c.g * (1 + l), b: c.b * (1 + l) });
  }
  function mix(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return toRgb({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ----------------------------------------------------------------
  // Tek bir tekerlek (arkadan): lastik + alaşım jant + fren diski izi
  function drawWheel(ctx, cx, baseY, ww, wh) {
    const x = cx - ww / 2, y = baseY - wh;
    // kontak gölgesi
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(cx, baseY, ww * 0.62, wh * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    // lastik gövdesi: yuvarlak omuz, DÜZ taban (yere oturma)
    const rTop = ww * 0.42, rBot = ww * 0.16;
    function tirePath() {
      ctx.beginPath();
      ctx.moveTo(x, y + rTop);
      ctx.arcTo(x, y, x + rTop, y, rTop);
      ctx.lineTo(x + ww - rTop, y);
      ctx.arcTo(x + ww, y, x + ww, y + rTop, rTop);
      ctx.lineTo(x + ww, baseY - rBot);
      ctx.arcTo(x + ww, baseY, x + ww - rBot, baseY, rBot);
      ctx.lineTo(x + rBot, baseY);
      ctx.arcTo(x, baseY, x, baseY - rBot, rBot);
      ctx.closePath();
    }
    const tg = ctx.createLinearGradient(x, 0, x + ww, 0);
    tg.addColorStop(0, '#04060a'); tg.addColorStop(0.22, '#23262c');
    tg.addColorStop(0.5, '#32363d'); tg.addColorStop(0.78, '#191c21'); tg.addColorStop(1, '#040609');
    ctx.fillStyle = tg; tirePath(); ctx.fill();
    // lastik dişi (görünen alt kısımda ince yatay çizgiler)
    ctx.save(); tirePath(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(0.6, ww * 0.03);
    for (let i = 1; i <= 3; i++) {
      const ly = baseY - wh * (0.06 + i * 0.10);
      ctx.beginPath(); ctx.moveTo(x + ww * 0.08, ly); ctx.lineTo(x + ww * 0.92, ly); ctx.stroke();
    }
    ctx.restore();
    // omuz parlaması
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, x + ww * 0.22, y + wh * 0.05, ww * 0.46, wh * 0.09, ww * 0.12); ctx.fill();
    // jant
    const hubR = Math.min(ww, wh) * 0.34;
    const rim = ctx.createRadialGradient(cx - hubR * 0.3, baseY - wh * 0.55 - hubR * 0.3, hubR * 0.1,
                                         cx, baseY - wh * 0.55, hubR);
    rim.addColorStop(0, '#f4f6f9'); rim.addColorStop(0.5, '#b3bac3');
    rim.addColorStop(0.82, '#6f757e'); rim.addColorStop(1, '#33373d');
    const hy = baseY - wh * 0.55;
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.ellipse(cx, hy, hubR * 0.82, hubR, 0, 0, Math.PI * 2); ctx.fill();
    // 5 kollu jant deseni
    ctx.fillStyle = 'rgba(40,44,50,0.85)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, hy);
      ctx.lineTo(cx + Math.cos(a - 0.16) * hubR * 0.74, hy + Math.sin(a - 0.16) * hubR * 0.92);
      ctx.lineTo(cx + Math.cos(a + 0.16) * hubR * 0.74, hy + Math.sin(a + 0.16) * hubR * 0.92);
      ctx.closePath(); ctx.fill();
    }
    // göbek
    ctx.fillStyle = '#5b616b';
    ctx.beginPath(); ctx.ellipse(cx, hy, hubR * 0.26, hubR * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(cx - hubR * 0.1, hy - hubR * 0.12, hubR * 0.1, hubR * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ----------------------------------------------------------------
  function drawProCar(ctx, cx, baseY, width, opts) {
    opts = opts || {};
    const body = opts.body || '#c0392b';
    const brake = !!opts.brake;
    const w = width, half = w / 2;

    // ---- Dikey seviyeler (baseY = zemin) ----
    const yGlassTop = baseY - w * 0.635;
    const yRoof     = baseY - w * 0.615;
    const yGlassBot = baseY - w * 0.445;
    const yShoulder = baseY - w * 0.405;   // en geniş bel hattı (haunch)
    const yTailTop  = baseY - w * 0.335;
    const yTailBot  = baseY - w * 0.245;
    const yBumper   = baseY - w * 0.215;
    const ySill     = baseY - w * 0.115;

    // ---- Yarı genişlikler ----
    const wShoulder = half * 1.00;
    const wDeck     = half * 0.965;
    const wSill     = half * 0.90;
    const wGlassBot = half * 0.70;
    const wRoof     = half * 0.52;

    // ---- 1) Zemin gölgesi ----
    const sh = ctx.createRadialGradient(cx, baseY + w * 0.01, w * 0.06, cx, baseY + w * 0.01, w * 0.62);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0.3)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(cx, baseY + w * 0.03, w * 0.6, w * 0.10, 0, 0, Math.PI * 2); ctx.fill();

    // ---- 2) Tekerlekler (geniş, planlanmış duruş) ----
    const tireW = w * 0.20, tireH = w * 0.27;
    const wheelX = half * 0.86;
    drawWheel(ctx, cx - wheelX, baseY, tireW, tireH);
    drawWheel(ctx, cx + wheelX, baseY, tireW, tireH);

    // ---- 3) Gövde silüeti yolu ----
    function bodyPath() {
      const dY = ySill - yShoulder;
      ctx.beginPath();
      ctx.moveTo(cx - wSill, ySill);
      // sol: alt -> çamurluk şişkinliği (en geniş omuz hattında bombe)
      ctx.bezierCurveTo(cx - wShoulder * 1.05, ySill - dY * 0.42, cx - wShoulder * 1.05, yShoulder + dY * 0.30, cx - wShoulder, yShoulder);
      // omuz -> cam tabanı
      ctx.lineTo(cx - wDeck * 0.96, yGlassBot);
      // C-direği -> tavan
      ctx.bezierCurveTo(cx - wGlassBot, yGlassBot, cx - wRoof * 1.06, yRoof, cx - wRoof, yGlassTop);
      // tavan kavisi
      ctx.quadraticCurveTo(cx, yGlassTop - w * 0.03, cx + wRoof, yGlassTop);
      ctx.bezierCurveTo(cx + wRoof * 1.06, yRoof, cx + wGlassBot, yGlassBot, cx + wDeck * 0.96, yGlassBot);
      ctx.lineTo(cx + wShoulder, yShoulder);
      ctx.bezierCurveTo(cx + wShoulder * 1.05, yShoulder + dY * 0.30, cx + wShoulder * 1.05, ySill - dY * 0.42, cx + wSill, ySill);
      ctx.closePath();
    }

    // ---- 4) Boya (parlak, kavisli metal) ----
    ctx.save();
    bodyPath(); ctx.clip();
    const paint = ctx.createLinearGradient(0, yGlassTop, 0, baseY);
    paint.addColorStop(0.00, mix(body, '#dff0ff', 0.55));   // tavan: gökyüzü
    paint.addColorStop(0.10, mix(body, '#dff0ff', 0.22));
    paint.addColorStop(0.24, shade(body, 0.20));
    paint.addColorStop(0.40, shade(body, 0.04));
    paint.addColorStop(0.52, body);
    paint.addColorStop(0.70, shade(body, -0.18));
    paint.addColorStop(0.88, shade(body, -0.42));
    paint.addColorStop(1.00, shade(body, -0.62));
    ctx.fillStyle = paint;
    ctx.fillRect(cx - half - 6, yGlassTop - 6, w + 12, w + 12);

    // shoulder boyunca parlak yansıma çizgisi
    const shine = ctx.createLinearGradient(0, yShoulder - w * 0.05, 0, yShoulder + w * 0.03);
    shine.addColorStop(0, 'rgba(255,255,255,0)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0.30)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(cx - half, yShoulder - w * 0.05, w, w * 0.08);

    // kenar koyulaşması (yuvarlaklık)
    const side = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.40)');
    side.addColorStop(0.14, 'rgba(0,0,0,0)');
    side.addColorStop(0.86, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = side;
    ctx.fillRect(cx - half, yGlassTop, w, w);
    ctx.restore();

    // gövde dış hattı
    bodyPath();
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();

    // jant davı gölgesi — tekerleklerin gövdeye oturması (derinlik)
    for (const s of [-1, 1]) {
      const ax = cx + s * wheelX;
      const ag = ctx.createRadialGradient(ax, ySill, tireW * 0.2, ax, ySill, tireW * 0.85);
      ag.addColorStop(0, 'rgba(0,0,0,0.55)');
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.ellipse(ax, ySill + w * 0.005, tireW * 0.78, tireW * 0.5, 0, Math.PI, 0); ctx.fill();
    }

    // ---- 5) Arka cam ----
    const gbW = wGlassBot * 0.92, gtW = wRoof * 0.86;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - gbW, yGlassBot - w * 0.005);
    ctx.bezierCurveTo(cx - gbW, yGlassBot, cx - gtW * 1.1, yRoof + w * 0.01, cx - gtW, yGlassTop + w * 0.02);
    ctx.quadraticCurveTo(cx, yGlassTop - w * 0.005, cx + gtW, yGlassTop + w * 0.02);
    ctx.bezierCurveTo(cx + gtW * 1.1, yRoof + w * 0.01, cx + gbW, yGlassBot, cx + gbW, yGlassBot - w * 0.005);
    ctx.closePath();
    ctx.clip();
    const gg = ctx.createLinearGradient(0, yGlassTop, 0, yGlassBot);
    gg.addColorStop(0, '#10171f'); gg.addColorStop(0.5, '#2c3d4c'); gg.addColorStop(1, '#16202a');
    ctx.fillStyle = gg; ctx.fillRect(cx - half, yGlassTop - 4, w, (yGlassBot - yGlassTop) + 8);
    // diyagonal yansıma
    ctx.fillStyle = 'rgba(220,235,250,0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - gbW * 0.7, yGlassBot); ctx.lineTo(cx - gbW * 0.1, yGlassTop);
    ctx.lineTo(cx + gbW * 0.2, yGlassTop); ctx.lineTo(cx - gbW * 0.4, yGlassBot);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // cam çerçevesi
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.strokeStyle = '#0c0f13';
    ctx.beginPath();
    ctx.moveTo(cx - gbW, yGlassBot);
    ctx.bezierCurveTo(cx - gbW, yGlassBot, cx - gtW * 1.1, yRoof + w * 0.01, cx - gtW, yGlassTop + w * 0.02);
    ctx.quadraticCurveTo(cx, yGlassTop - w * 0.005, cx + gtW, yGlassTop + w * 0.02);
    ctx.bezierCurveTo(cx + gtW * 1.1, yRoof + w * 0.01, cx + gbW, yGlassBot, cx + gbW, yGlassBot);
    ctx.stroke();

    // ---- 6) Bagaj kapağı panel hattı ----
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(0.8, w * 0.005);
    ctx.beginPath(); ctx.moveTo(cx - wDeck * 0.82, yGlassBot + w * 0.01); ctx.lineTo(cx + wDeck * 0.82, yGlassBot + w * 0.01); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(cx - wDeck * 0.82, yGlassBot + w * 0.005); ctx.lineTo(cx + wDeck * 0.82, yGlassBot + w * 0.005); ctx.stroke();

    // ---- 6b) Ducktail spoiler dudağı (sportif rear deck kenarı) ----
    const spW = wDeck * 0.92, spy = yShoulder - w * 0.006;
    const lip = ctx.createLinearGradient(0, spy - w * 0.03, 0, spy + w * 0.012);
    lip.addColorStop(0, shade(body, 0.16));
    lip.addColorStop(1, shade(body, -0.22));
    ctx.fillStyle = lip;
    rr(ctx, cx - spW / 2, spy - w * 0.03, spW, w * 0.038, w * 0.012); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    rr(ctx, cx - spW / 2 + w * 0.012, spy - w * 0.03, spW - w * 0.024, w * 0.006, w * 0.003); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(cx - spW / 2, spy + w * 0.006, spW, w * 0.007);

    // ---- 7) Stop lambaları (sarmalayan LED bar) ----
    const tH = yTailBot - yTailTop;
    drawTail(ctx, cx - wShoulder * 0.96, yTailTop, wShoulder * 0.5, tH, brake, body);
    drawTail(ctx, cx + wShoulder * 0.46, yTailTop, wShoulder * 0.5, tH, brake, body);
    // orta bağlantı şeridi
    if (brake) { ctx.save(); ctx.shadowColor = '#ff2a24'; ctx.shadowBlur = w * 0.05; }
    const cb = ctx.createLinearGradient(0, yTailTop, 0, yTailBot);
    cb.addColorStop(0, brake ? '#ff7a6e' : '#5e1212');
    cb.addColorStop(0.5, brake ? '#ff5046' : '#7c1818');
    cb.addColorStop(1, brake ? '#cc2a22' : '#4a0e0e');
    ctx.fillStyle = cb;
    rr(ctx, cx - wShoulder * 0.46, yTailTop + tH * 0.30, wShoulder * 0.92, tH * 0.40, tH * 0.18); ctx.fill();
    if (brake) ctx.restore();

    // ---- 8) Tampon + difüzör + egzoz ----
    ctx.save();
    rr(ctx, cx - wSill * 1.0, yBumper, wSill * 2.0, (ySill + w * 0.02 - yBumper), w * 0.03); ctx.clip();
    const bg = ctx.createLinearGradient(0, yBumper, 0, ySill);
    bg.addColorStop(0, shade(body, -0.30)); bg.addColorStop(1, shade(body, -0.55));
    ctx.fillStyle = bg; ctx.fillRect(cx - half, yBumper - 4, w, w);
    ctx.restore();
    // alt difüzör
    ctx.fillStyle = '#101216';
    rr(ctx, cx - wSill * 0.55, ySill - w * 0.055, wSill * 1.1, w * 0.075, w * 0.012); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = Math.max(0.6, w * 0.005);
    for (let i = -2; i <= 2; i++) {
      const dx = cx + i * wSill * 0.2;
      ctx.beginPath(); ctx.moveTo(dx, ySill - w * 0.05); ctx.lineTo(dx, ySill - w * 0.005); ctx.stroke();
    }
    // egzozlar
    const exR = w * 0.032;
    for (const ex of [cx - wSill * 0.7, cx + wSill * 0.7]) {
      const eg = ctx.createRadialGradient(ex - exR * 0.3, ySill - exR * 1.3, exR * 0.1, ex, ySill - exR, exR);
      eg.addColorStop(0, '#eef1f4'); eg.addColorStop(0.55, '#9298a0'); eg.addColorStop(1, '#1f2227');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.ellipse(ex, ySill - exR * 0.6, exR, exR * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0b0e';
      ctx.beginPath(); ctx.ellipse(ex, ySill - exR * 0.6, exR * 0.55, exR * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---- 9) Plaka ----
    const plW = w * 0.30, plH = w * 0.085;
    ctx.fillStyle = '#0c0d10';
    rr(ctx, cx - plW / 2 - w * 0.008, yBumper + w * 0.01, plW + w * 0.016, plH + w * 0.016, w * 0.012); ctx.fill();
    ctx.fillStyle = '#edf0e6';
    rr(ctx, cx - plW / 2, yBumper + w * 0.018, plW, plH, w * 0.008); ctx.fill();
    ctx.fillStyle = '#1d4ea8';
    rr(ctx, cx - plW / 2, yBumper + w * 0.018, plW * 0.13, plH, w * 0.008); ctx.fill();
    ctx.fillStyle = '#3a4150';
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - plW * 0.28 + i * plW * 0.14, yBumper + w * 0.036, plW * 0.07, plH * 0.5);
  }

  function drawTail(ctx, x, y, lw, lh, brake, body) {
    if (brake) { ctx.save(); ctx.shadowColor = '#ff2a24'; ctx.shadowBlur = lw * 0.4; }
    // housing
    ctx.fillStyle = '#15090b';
    rr(ctx, x, y, lw, lh, lh * 0.3); ctx.fill();
    // lens
    const lg = ctx.createLinearGradient(0, y, 0, y + lh);
    lg.addColorStop(0, brake ? '#ff8a7e' : '#d23029');
    lg.addColorStop(0.5, brake ? '#ff4438' : '#a51d1d');
    lg.addColorStop(1, brake ? '#c41f18' : '#6e1212');
    ctx.fillStyle = lg;
    rr(ctx, x + lw * 0.07, y + lh * 0.15, lw * 0.86, lh * 0.7, lh * 0.26); ctx.fill();
    if (brake) ctx.restore();
    // LED iç çizgi
    ctx.fillStyle = brake ? 'rgba(255,235,225,0.92)' : 'rgba(255,170,160,0.55)';
    rr(ctx, x + lw * 0.14, y + lh * 0.40, lw * 0.72, lh * 0.16, lh * 0.08); ctx.fill();
    // parlak üst highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, x + lw * 0.1, y + lh * 0.16, lw * 0.5, lh * 0.12, lh * 0.06); ctx.fill();
  }

  const api = { drawProCar, drawWheel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UcarCar = api;
})(typeof window !== 'undefined' ? window : globalThis);
