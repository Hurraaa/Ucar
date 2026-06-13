/* ============================================================
   UCAR — Sonsuz Yol
   Arabanın arkasından (third-person) perspektifli sürüş oyunu.
   - Pseudo-3D segment tabanlı yol (virajlar + tepeler)
   - 3 şerit, takip edilebilir yol, trafik araçları
   - Katmanlı dağlar, gökyüzü, güneş, bulutlar (parallax)
   - Detaylı araç çizimi + yumuşak gölgeler
   ============================================================ */
(() => {
  'use strict';

  // --------------------------- Canvas ---------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------- Yol / Kamera ayarı --------------------
  const SEG_LEN = 200;          // segment uzunluğu
  const RUMBLE_LEN = 3;         // şerit kenar deseni
  const ROAD_WIDTH = 2200;      // yol yarı genişliği (dünya birimi)
  const LANES = 3;
  const FOV = 100;
  const CAM_HEIGHT = 1000;
  const CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
  const DRAW_DIST = 240;        // kaç segment çizilecek
  const FOG_DENSITY = 5;

  const MAX_SPEED = SEG_LEN * 60;       // birim/sn
  const ACCEL = MAX_SPEED / 4.5;
  const BRAKE = -MAX_SPEED / 1.6;
  const DECEL = -MAX_SPEED / 6;
  const OFFROAD_DECEL = -MAX_SPEED / 1.5;
  const CENTRIFUGAL = 0.32;     // virajda savrulma

  // Renk paleti (gündüz, sıcak ton)
  const COL = {
    skyTop: '#2a5db0', skyMid: '#6aa6e6', skyLow: '#bfe0f5',
    sun: '#fff4d6',
    light: { road: '#6b6f7a', grass: '#3fa34d', rumble: '#e8e8ee', lane: '#f4f4f8' },
    dark:  { road: '#62666f', grass: '#379145', rumble: '#c33b3b', lane: '#62666f' },
    start: { road: '#dddddd', grass: '#3fa34d', rumble: '#dddddd', lane: '#dddddd' },
    finish:{ road: '#222', grass: '#3fa34d', rumble: '#222', lane: '#222' },
    fog: '#cfe6f2'
  };

  // ------------------------ Yol segmentleri ---------------------
  let segments = [];
  let trackLength = 0;

  function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y; }

  function addSegment(curve, y) {
    const n = segments.length;
    const prevY = lastY();
    segments.push({
      index: n,
      curve: curve,
      p1: { world: { x: 0, y: prevY, z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: y,   z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
      cars: [],
      color: Math.floor(n / RUMBLE_LEN) % 2 ? COL.dark : COL.light
    });
  }

  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

  function addRoad(enter, hold, leave, curve, height) {
    const startY = lastY();
    const endY = startY + height * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold;  n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }

  function buildTrack() {
    segments = [];
    // Rastgele ama akıcı bir sonsuz yol kuralım
    const R = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    addRoad(40, 40, 40, 0, 0); // düz başlangıç
    for (let i = 0; i < 40; i++) {
      const len = [
        [25, 30, 25], [30, 40, 30], [20, 25, 20], [40, 60, 40]
      ][Math.floor(R() * 4)];
      const curve = (R() - 0.5) * 6;            // -3..3
      const hill = (R() - 0.4) * 40;            // tepeler
      addRoad(len[0], len[1], len[2], curve, hill);
    }
    addRoad(30, 30, 30, 0, 0);

    // Başlangıç / kontrol çizgisi rengi
    for (let n = 0; n < 6; n++) segments[n].color = COL.start;

    trackLength = segments.length * SEG_LEN;
    placeTraffic(R);
    placeCoins(R);
  }

  // Yol boyunca toplanabilir altınlar (şerit üzerinde dizili)
  function placeCoins(R) {
    coins = [];
    const total = segments.length;
    let z = 50;
    while (z < total - 30) {
      z += 8 + Math.floor(R() * 14);
      // boş bir şerit seç (mümkünse trafiğin olmadığı)
      const lane = Math.floor(R() * LANES);
      // küçük zincirler halinde 1-4 altın
      const chain = 1 + Math.floor(R() * 4);
      for (let k = 0; k < chain && z + k < total - 30; k++) {
        coins.push({ seg: (z + k) % total, offset: laneToOffset(lane), z: ((z + k) % total) * SEG_LEN, taken: false });
      }
      z += chain;
    }
  }

  function findSegment(z) { return segments[Math.floor(z / SEG_LEN) % segments.length]; }

  // --------------------------- Trafik ---------------------------
  const CARS = [
    { body: '#e63946', accent: '#b71c2b', name: 'Kırmızı' },
    { body: '#2d7dd2', accent: '#1c4f8a', name: 'Mavi' },
    { body: '#f4a300', accent: '#c47e00', name: 'Sarı' },
    { body: '#2a9d8f', accent: '#1d6e64', name: 'Yeşil' },
    { body: '#e9ecef', accent: '#9aa0a6', name: 'Beyaz' },
    { body: '#3a3f47', accent: '#1c1f24', name: 'Siyah' }
  ];
  const TRAFFIC_COLORS = ['#d65a31', '#3066be', '#4caf50', '#9b5de5', '#f9c74f', '#577590', '#bcc0c4', '#2b2d34'];

  let traffic = [];
  function placeTraffic(R) {
    traffic = [];
    const total = segments.length;
    let z = 80;
    const gap = Math.max(7, 26 / trafficDensity); // yoğunluk arttıkça aralık daralır
    while (z < total - 40) {
      z += Math.max(6, Math.floor((12 + R() * gap)));
      const lane = Math.floor(R() * LANES); // 0..LANES-1
      traffic.push({
        seg: z % total,
        offset: laneToOffset(lane),
        lane,
        color: TRAFFIC_COLORS[Math.floor(R() * TRAFFIC_COLORS.length)],
        speed: (0.45 + R() * 0.35), // oyuncuya göre yavaş
        z: (z % total) * SEG_LEN
      });
    }
  }

  function laneToOffset(lane) {
    // 3 şerit -> -0.62, 0, 0.62 (yol yarı genişliği oranı)
    const span = 1.24;
    return -span / 2 + (lane / (LANES - 1)) * span;
  }

  // -------------------------- Oyun durumu -----------------------
  const State = { MENU: 0, PLAY: 1, OVER: 2, PAUSE: 3 };
  let state = State.MENU;

  const player = {
    x: 0,            // -1..1 yol üzerinde yatay konum
    z: 0,            // yol üzerindeki ilerleme
    speed: 0,
    chosen: 0,       // seçili araba
    steer: 0,        // görsel yatış
    targetLane: 1
  };

  let score = 0;
  let coinsCollected = 0;
  let best = Number(localStorage.getItem('ucar_best') || 0);
  let bgOffset = 0;  // dağ/gökyüzü parallax
  let hillOffset = 0;

  // Zorluk / seviye
  let level = 1;
  let laps = 0;
  let speedBoost = 1;       // lap geçtikçe artan üst hız çarpanı
  let trafficDensity = 1;   // lap geçtikçe artan trafik yoğunluğu
  let coins = [];
  const pops = [];          // toplama efektleri

  // --------------------------- Girişler -------------------------
  const keys = { left: false, right: false, gas: false, brake: false };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = true; e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': keys.brake = true; e.preventDefault(); break;
      case 'p': case 'P': case 'Escape': togglePause(); break;
      case ' ': if (state === State.MENU) startGame(); else if (state === State.OVER) startGame(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = false; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = false; break;
      case 'ArrowDown': case 's': case 'S': keys.brake = false; break;
    }
  });

  // Dokunmatik kontroller
  document.querySelectorAll('.ctrl-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    const set = (v) => {
      keys[dir] = v;
      btn.classList.toggle('pressed', v);
    };
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); set(true); }, { passive: false });
    btn.addEventListener('touchend',   (e) => { e.preventDefault(); set(false); }, { passive: false });
    btn.addEventListener('touchcancel',(e) => { e.preventDefault(); set(false); }, { passive: false });
    btn.addEventListener('mousedown', () => set(true));
    btn.addEventListener('mouseup', () => set(false));
    btn.addEventListener('mouseleave', () => set(false));
  });

  // --------------------------- Ses (WebAudio) -------------------
  const Audio = (() => {
    let ctxA = null, master = null;
    let engOsc = null, engOsc2 = null, engGain = null, engFilter = null;
    let enabled = true, started = false;

    function ensure() {
      if (ctxA) return;
      try {
        ctxA = new (window.AudioContext || window.webkitAudioContext)();
        master = ctxA.createGain();
        master.gain.value = 0.6;
        master.connect(ctxA.destination);
      } catch (e) { enabled = false; }
    }

    function resume() { if (ctxA && ctxA.state === 'suspended') ctxA.resume(); }

    function startEngine() {
      ensure(); if (!ctxA || started) return;
      started = true;
      engFilter = ctxA.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 700;
      engGain = ctxA.createGain();
      engGain.gain.value = 0.0;
      engOsc = ctxA.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 60;
      engOsc2 = ctxA.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 90;
      engOsc.connect(engFilter); engOsc2.connect(engFilter);
      engFilter.connect(engGain); engGain.connect(master);
      engOsc.start(); engOsc2.start();
    }
    function stopEngine() {
      if (engGain) engGain.gain.setTargetAtTime(0.0001, ctxA.currentTime, 0.05);
    }
    function engine(speedPct, accel) {
      if (!ctxA || !engOsc) return;
      const base = 55 + speedPct * 240;
      engOsc.frequency.setTargetAtTime(base, ctxA.currentTime, 0.06);
      engOsc2.frequency.setTargetAtTime(base * 1.5, ctxA.currentTime, 0.06);
      engFilter.frequency.setTargetAtTime(500 + speedPct * 2200, ctxA.currentTime, 0.08);
      const vol = (0.05 + speedPct * 0.18) * (accel ? 1.2 : 0.85);
      engGain.gain.setTargetAtTime(enabled ? vol : 0, ctxA.currentTime, 0.1);
    }

    function blip(freq, dur, type, vol, slideTo) {
      ensure(); if (!ctxA || !enabled) return;
      const o = ctxA.createOscillator(); const g = ctxA.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctxA.currentTime + dur);
      g.gain.value = vol || 0.2;
      g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctxA.currentTime + dur);
    }

    function coin() { blip(880, 0.08, 'triangle', 0.25); blip(1320, 0.12, 'triangle', 0.2); }
    function crash() {
      ensure(); if (!ctxA || !enabled) return;
      const o = ctxA.createOscillator(); const g = ctxA.createGain();
      o.type = 'sawtooth'; o.frequency.value = 180;
      o.frequency.exponentialRampToValueAtTime(40, ctxA.currentTime + 0.5);
      g.gain.value = 0.5; g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + 0.5);
      // gürültü
      const buf = ctxA.createBuffer(1, ctxA.sampleRate * 0.4, ctxA.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ns = ctxA.createBufferSource(); ns.buffer = buf;
      const ng = ctxA.createGain(); ng.gain.value = 0.4;
      ns.connect(ng); ng.connect(master);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctxA.currentTime + 0.5); ns.start();
    }
    function level() { blip(523, 0.1, 'square', 0.25); setTimeout(() => blip(784, 0.16, 'square', 0.25), 90); }
    function ui() { blip(440, 0.06, 'sine', 0.15, 660); }

    return {
      init: () => { ensure(); resume(); },
      startEngine, stopEngine, engine, coin, crash, level, ui,
      toggle: () => { enabled = !enabled; return enabled; },
      get enabled() { return enabled; }
    };
  })();

  // --------------------------- UI / Menü ------------------------
  const overlay = document.getElementById('overlay');
  const gameover = document.getElementById('gameover');
  const touchControls = document.getElementById('touch-controls');
  const pauseBtn = document.getElementById('pause-btn');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const speedEl = document.getElementById('speed');
  const swatchesEl = document.getElementById('swatches');

  bestEl.textContent = best;

  // Araba seçici oluştur
  CARS.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (i === player.chosen ? ' selected' : '');
    s.style.background = `radial-gradient(circle at 35% 30%, ${c.body}, ${c.accent})`;
    s.title = c.name;
    s.addEventListener('click', () => {
      player.chosen = i;
      document.querySelectorAll('.swatch').forEach((el, j) => el.classList.toggle('selected', j === i));
    });
    swatchesEl.appendChild(s);
  });

  document.getElementById('play-btn').addEventListener('click', startGame);
  document.getElementById('retry-btn').addEventListener('click', startGame);
  document.getElementById('menu-btn').addEventListener('click', toMenu);
  pauseBtn.addEventListener('click', togglePause);

  // Ses aç/kapa
  const soundBtn = document.getElementById('sound-btn');
  soundBtn.addEventListener('click', () => {
    Audio.init();
    const on = Audio.toggle();
    document.getElementById('sound-on').classList.toggle('hidden', !on);
    document.getElementById('sound-off').classList.toggle('hidden', on);
    Audio.ui();
  });

  function startGame() {
    // Zorluğu sıfırla
    level = 1; laps = 0; speedBoost = 1; trafficDensity = 1; coinsCollected = 0;
    pops.length = 0;
    buildTrack();
    player.x = 0; player.z = 0; player.speed = 0; player.steer = 0;
    score = 0; bgOffset = 0; hillOffset = 0;
    state = State.PLAY;
    overlay.classList.add('hidden');
    gameover.classList.add('hidden');
    touchControls.classList.add('active');
    pauseBtn.classList.remove('hidden');
    updateLevelHud();
    Audio.init(); Audio.startEngine(); Audio.ui();
  }

  function toMenu() {
    state = State.MENU;
    Audio.stopEngine();
    overlay.classList.remove('hidden');
    gameover.classList.add('hidden');
    touchControls.classList.remove('active');
    pauseBtn.classList.add('hidden');
  }

  function gameOver() {
    state = State.OVER;
    Audio.stopEngine(); Audio.crash();
    if (score > best) { best = score; localStorage.setItem('ucar_best', best); }
    document.getElementById('go-score').textContent = Math.floor(score);
    document.getElementById('go-best').textContent = Math.floor(best);
    bestEl.textContent = Math.floor(best);
    gameover.classList.remove('hidden');
    touchControls.classList.remove('active');
    pauseBtn.classList.add('hidden');
  }

  function togglePause() {
    if (state === State.PLAY) { state = State.PAUSE; pauseBtn.classList.add('hidden'); Audio.stopEngine(); }
    else if (state === State.PAUSE) { state = State.PLAY; pauseBtn.classList.remove('hidden'); Audio.startEngine(); }
  }

  const levelEl = document.getElementById('level');
  function updateLevelHud() { if (levelEl) levelEl.textContent = level; }

  // Lap tamamlandığında zorluğu yükselt
  function advanceLevel() {
    laps++;
    level++;
    speedBoost = Math.min(1.8, 1 + laps * 0.12);
    trafficDensity = Math.min(3.2, 1 + laps * 0.35);
    updateLevelHud();
    Audio.level();
    // Yolu yeni yoğunlukla yeniden kur (oyuncu konumunu koru)
    const keepZ = player.z, keepX = player.x;
    buildTrack();
    player.z = keepZ % trackLength; player.x = keepX;
  }

  // ------------------------- Projeksiyon ------------------------
  function project(p, camX, camY, camZ, width, height, roadW) {
    const t = p.world;
    p.camera.x = (t.x || 0) - camX;
    p.camera.y = (t.y || 0) - camY;
    p.camera.z = (t.z || 0) - camZ;
    const scale = CAM_DEPTH / p.camera.z;
    p.screen.scale = scale;
    p.screen.x = Math.round(width / 2 + scale * p.camera.x * width / 2);
    p.screen.y = Math.round(height / 2 - scale * p.camera.y * height / 2);
    p.screen.w = Math.round(scale * roadW * width / 2);
  }

  // ------------------------ Güncelleme --------------------------
  function update(dt) {
    const startPos = player.z;
    const effMax = MAX_SPEED * speedBoost;

    // Hızlanma / frenleme
    if (keys.gas) player.speed += ACCEL * dt;
    else if (keys.brake) player.speed += BRAKE * dt;
    else player.speed += DECEL * dt;

    // Şerit değişimi (yumuşak, yol takipli)
    const laneStep = 1.5 * dt * (0.4 + player.speed / effMax);
    if (keys.left)  player.x -= laneStep;
    if (keys.right) player.x += laneStep;

    player.speed = Math.max(0, Math.min(player.speed, effMax));

    const playerSeg = findSegment(player.z);
    const speedPercent = player.speed / effMax;

    // Virajda merkezkaç savrulması
    player.x -= playerSeg.curve * speedPercent * CENTRIFUGAL * dt;

    // Hedef yatış (görsel)
    let steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.steer += ((steerInput - playerSeg.curve * speedPercent * 0.5) - player.steer) * Math.min(1, dt * 8);

    // Yol dışı yavaşlama
    if ((player.x < -1 || player.x > 1) && player.speed > MAX_SPEED / 6) {
      player.speed += OFFROAD_DECEL * dt;
    }
    player.x = Math.max(-1.6, Math.min(1.6, player.x));

    // İlerle (+ lap tamamlandığında seviye atla)
    player.z += player.speed * dt;
    if (player.z >= trackLength) { player.z -= trackLength; advanceLevel(); }
    while (player.z < 0) player.z += trackLength;

    // Parallax arka plan kaydır
    bgOffset += playerSeg.curve * speedPercent * dt * 0.6;
    hillOffset = playerSeg.p1.world.y;

    // Skor (mesafe + hız bonusu)
    score += player.speed * dt * 0.01;
    scoreEl.textContent = Math.floor(score);
    speedEl.innerHTML = Math.floor(player.speed / MAX_SPEED * 260) + '<small>km/s</small>';

    // Motor sesi
    Audio.engine(speedPercent, keys.gas);

    // Toplama efektlerini güncelle
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt;
      if (pops[i].t > 0.6) pops.splice(i, 1);
    }

    // Altın toplama
    updateCoins();

    // Trafik güncelle + çarpışma
    updateTraffic(dt, playerSeg, startPos);
  }

  function updateCoins() {
    const pSeg = Math.floor(player.z / SEG_LEN);
    for (const c of coins) {
      if (c.taken) continue;
      const cSeg = Math.floor(c.z / SEG_LEN);
      const diff = (cSeg - pSeg + segments.length) % segments.length;
      if (diff <= 1 && Math.abs(player.x - c.offset) < 0.34) {
        c.taken = true;
        coinsCollected++;
        score += 25;
        Audio.coin();
        pops.push({ t: 0, text: '+25' });
      }
    }
  }

  function updateTraffic(dt, playerSeg, startPos) {
    for (const car of traffic) {
      car.z += player.speed * car.speed * dt * 0.0; // sabit kalsın, oyuncu yaklaşsın
      // (Sabit araçlar daha net engel oluşturur)
    }
    // Çarpışma kontrolü: oyuncunun geçtiği aralıkta
    const pSeg = Math.floor(player.z / SEG_LEN);
    for (const car of traffic) {
      const cSeg = Math.floor(car.z / SEG_LEN);
      const diff = (cSeg - pSeg + segments.length) % segments.length;
      if (diff <= 2) {
        // yatay çakışma?
        const carX = car.offset;
        if (Math.abs(player.x - carX) < 0.42) {
          // çarpışma
          if (player.speed > MAX_SPEED * 0.08) { gameOver(); return; }
        }
      }
    }
  }

  // -------------------------- Çizim -----------------------------
  function render() {
    const baseSeg = findSegment(player.z);
    const basePercent = (player.z % SEG_LEN) / SEG_LEN;
    const playerY = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
    const camZ = player.z;
    const camY = CAM_HEIGHT + playerY;

    // Gökyüzü + dağlar
    drawBackground(baseSeg, playerY);

    let x = 0;
    let dx = -(baseSeg.curve * basePercent);
    let maxy = H;

    const camX = player.x * ROAD_WIDTH;

    // Çizilecek segmentleri sakla (araç çizimi için ileri-geri)
    const visible = [];

    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segments[(baseSeg.index + n) % segments.length];
      const looped = seg.index < baseSeg.index;
      const fog = fogFactor(n / DRAW_DIST);

      project(seg.p1, camX - x, camY, camZ - (looped ? trackLength : 0), W, H, ROAD_WIDTH);
      project(seg.p2, camX - x - dx, camY, camZ - (looped ? trackLength : 0), W, H, ROAD_WIDTH);

      x += dx;
      dx += seg.curve;

      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;

      drawSegment(seg, fog);
      seg._visible = { fog };
      visible.push(seg);
      maxy = seg.p2.screen.y;
    }

    // Altınlar + araçlar (uzaktan yakına çiz)
    for (let n = visible.length - 1; n >= 0; n--) {
      const seg = visible[n];
      for (const c of coins) {
        if (!c.taken && Math.floor(c.z / SEG_LEN) % segments.length === seg.index) {
          drawCoin(seg, c, seg._visible.fog);
        }
      }
      for (const car of traffic) {
        if (Math.floor(car.z / SEG_LEN) % segments.length === seg.index) {
          drawTrafficCar(seg, car, seg._visible.fog);
        }
      }
    }

    // Oyuncu arabası (ekranın altında, sabit)
    drawPlayerCar();

    // Toplama efektleri (yüzen yazı)
    drawPops();

    // Vinyet
    drawVignette();
  }

  function drawCoin(seg, c, fog) {
    const p = seg.p1.screen;
    if (!p.scale || p.scale <= 0 || !p.w) return;
    const r = Math.max(2, p.w * 0.08);
    const cx = p.x + (c.offset * p.w);
    const bob = Math.sin(performance.now() * 0.005 + c.z * 0.01) * r * 0.6;
    const cy = p.y - r * 1.6 + bob;
    if (r < 2) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, fog);
    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, p.y, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // madeni para (parıltılı disk)
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, '#ffcf33'); g.addColorStop(1, '#e6a000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.62, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b87800'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.18, cy - r * 0.3, r * 0.12, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPops() {
    if (!pops.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 26px ' + getComputedStyle(document.body).fontFamily;
    for (const p of pops) {
      const a = 1 - p.t / 0.6;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#ffd84d';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
      const y = H * 0.62 - p.t * 80;
      ctx.strokeText(p.text, W / 2, y);
      ctx.fillText(p.text, W / 2, y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function fogFactor(p) { return 1 / Math.exp(p * p * FOG_DENSITY); }

  // Trapez (yol parçası) çiz
  function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  }

  function drawSegment(seg, fog) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const c = seg.color;

    // Çimen (tüm genişlik)
    ctx.fillStyle = c.grass;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);

    // Kenar şeritleri (rumble)
    const r1 = p1.w / 3.4, r2 = p2.w / 3.4;
    polygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, c.rumble);
    polygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, c.rumble);

    // Yol asfaltı
    polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);

    // Şerit çizgileri (3 şerit -> 2 ayraç)
    if (c.lane !== c.road) {
      const lw1 = p1.w / 26, lw2 = p2.w / 26;
      for (let i = 1; i < LANES; i++) {
        const lx1 = p1.x - p1.w + (2 * p1.w) * (i / LANES);
        const lx2 = p2.x - p2.w + (2 * p2.w) * (i / LANES);
        polygon(lx1 - lw1, p1.y, lx1 + lw1, p1.y, lx2 + lw2, p2.y, lx2 - lw2, p2.y, c.lane);
      }
    }

    // Mesafe sisi
    if (fog < 1) {
      ctx.globalAlpha = 1 - fog;
      ctx.fillStyle = COL.fog;
      ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
      ctx.globalAlpha = 1;
    }
  }

  // ----------------------- Arka plan ----------------------------
  let mountains = null;
  function buildMountains() {
    // Deterministik dağ silüetleri
    const make = (count, seedStart) => {
      let s = seedStart;
      const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const pts = [];
      for (let i = 0; i <= count; i++) pts.push(r());
      return pts;
    };
    mountains = {
      far: make(14, 777),
      near: make(20, 1313)
    };
  }
  buildMountains();

  function drawBackground(baseSeg, playerY) {
    // Gökyüzü gradyanı
    const horizon = H * 0.52 - playerY * 0.00002 * H + hillShift();
    const g = ctx.createLinearGradient(0, 0, 0, horizon + 40);
    g.addColorStop(0, COL.skyTop);
    g.addColorStop(0.55, COL.skyMid);
    g.addColorStop(1, COL.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 60);

    // Güneş + parıltı
    const sunX = W * 0.7 - bgOffset * 6;
    const sunY = horizon - H * 0.22;
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, H * 0.32);
    sg.addColorStop(0, 'rgba(255,250,230,0.95)');
    sg.addColorStop(0.15, 'rgba(255,236,180,0.7)');
    sg.addColorStop(0.5, 'rgba(255,220,150,0.18)');
    sg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, horizon + 60);
    ctx.fillStyle = COL.sun;
    ctx.beginPath(); ctx.arc(sunX, sunY, H * 0.045, 0, Math.PI * 2); ctx.fill();

    // Bulutlar
    drawClouds(horizon);

    // Dağlar (iki katman, parallax + kar tepeleri)
    drawMountainLayer(mountains.far, horizon, H * 0.20, '#5b7aa8', '#7d96bd', bgOffset * 8, false);
    drawMountainLayer(mountains.near, horizon, H * 0.30, '#3f5d8a', '#557099', bgOffset * 16, true);
  }

  function hillShift() {
    // Tepelere göre ufuk çizgisini hafif kaydır
    return Math.sin(player.z * 0.0001) * 8;
  }

  function drawClouds(horizon) {
    const cloud = (cx, cy, s, a) => {
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 1.8, s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 1.3, cy + s * 0.2, s * 1.2, s * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - s * 1.3, cy + s * 0.25, s, s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const off = (bgOffset * 4) % (W + 400);
    cloud((W * 0.18 - off + W + 400) % (W + 400) - 200, horizon - H * 0.30, 26, 0.85);
    cloud((W * 0.55 - off + W + 400) % (W + 400) - 200, horizon - H * 0.38, 34, 0.78);
    cloud((W * 0.85 - off + W + 400) % (W + 400) - 200, horizon - H * 0.26, 22, 0.8);
  }

  function drawMountainLayer(pts, horizon, height, colDark, colLight, offset, snow) {
    const n = pts.length - 1;
    const span = W * 1.6;
    const step = span / n;
    const ox = -((offset % step) + step) % step - (W * 0.3);

    const grad = ctx.createLinearGradient(0, horizon - height, 0, horizon);
    grad.addColorStop(0, colLight);
    grad.addColorStop(1, colDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ox - step, horizon + 4);
    const peaks = [];
    for (let i = 0; i <= n; i++) {
      const px = ox + i * step;
      const py = horizon - pts[i] * height;
      ctx.lineTo(px, py);
      peaks.push({ px, py });
    }
    ctx.lineTo(ox + (n + 1) * step, horizon + 4);
    ctx.closePath();
    ctx.fill();

    // Kar tepeleri
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const pk of peaks) {
        if (horizon - pk.py > height * 0.55) {
          const capH = (horizon - pk.py) * 0.22;
          ctx.beginPath();
          ctx.moveTo(pk.px, pk.py);
          ctx.lineTo(pk.px - capH * 0.9, pk.py + capH);
          ctx.lineTo(pk.px - capH * 0.3, pk.py + capH * 0.7);
          ctx.lineTo(pk.px + capH * 0.2, pk.py + capH);
          ctx.lineTo(pk.px + capH * 0.9, pk.py + capH * 0.75);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // ----------------------- Araç çizimi --------------------------
  // Arkadan görünüm: gövde, kabin, arka cam, stoplar, tampon, tekerler, gölge
  function drawCarSprite(cx, baseY, width, body, accent, brake) {
    const w = width;
    const h = w * 0.82;
    const x = cx - w / 2;
    const y = baseY - h;

    // Yumuşak zemin gölgesi
    ctx.save();
    const sg = ctx.createRadialGradient(cx, baseY, 2, cx, baseY, w * 0.62);
    sg.addColorStop(0, 'rgba(0,0,0,0.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + h * 0.04, w * 0.62, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tekerlekler
    const tireW = w * 0.16, tireH = h * 0.34;
    ctx.fillStyle = '#15171c';
    roundRect(x - tireW * 0.2, y + h * 0.52, tireW, tireH, 4); ctx.fill();
    roundRect(x + w - tireW * 0.8, y + h * 0.52, tireW, tireH, 4); ctx.fill();

    // Alt gövde gölgesi
    ctx.fillStyle = accent;
    roundRect(x, y + h * 0.42, w, h * 0.5, w * 0.12); ctx.fill();

    // Ana gövde (dikey gradyan ile hacim)
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, shade(body, 18));
    bg.addColorStop(0.45, body);
    bg.addColorStop(1, shade(body, -28));
    ctx.fillStyle = bg;
    roundRect(x, y + h * 0.30, w, h * 0.55, w * 0.13); ctx.fill();

    // Kabin / tavan
    const roofW = w * 0.74, roofX = cx - roofW / 2;
    const rg = ctx.createLinearGradient(0, y, 0, y + h * 0.4);
    rg.addColorStop(0, shade(body, 30));
    rg.addColorStop(1, shade(body, -10));
    ctx.fillStyle = rg;
    roundRect(roofX, y + h * 0.05, roofW, h * 0.42, w * 0.12); ctx.fill();

    // Arka cam
    const glassW = roofW * 0.82, glassX = cx - glassW / 2;
    const gg = ctx.createLinearGradient(0, y + h * 0.1, 0, y + h * 0.34);
    gg.addColorStop(0, '#2b3848');
    gg.addColorStop(1, '#5b7388');
    ctx.fillStyle = gg;
    roundRect(glassX, y + h * 0.11, glassW, h * 0.22, w * 0.06); ctx.fill();
    // Cam yansıması
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(glassX + glassW * 0.06, y + h * 0.13, glassW * 0.4, h * 0.07, 3); ctx.fill();

    // Gövde üst highlight çizgisi
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.34);
    ctx.lineTo(x + w * 0.92, y + h * 0.34);
    ctx.stroke();

    // Tampon
    ctx.fillStyle = shade(body, -40);
    roundRect(x + w * 0.02, y + h * 0.78, w * 0.96, h * 0.12, w * 0.05); ctx.fill();

    // Stop lambaları
    const lampY = y + h * 0.58, lampH = h * 0.16, lampW = w * 0.2;
    const lampColor = brake ? '#ff3b30' : '#c01818';
    const glow = brake ? 22 : 6;
    drawLamp(x + w * 0.08, lampY, lampW, lampH, lampColor, glow);
    drawLamp(x + w * 0.72, lampY, lampW, lampH, lampColor, glow);

    // Plaka
    ctx.fillStyle = '#eef1e0';
    roundRect(cx - w * 0.14, y + h * 0.80, w * 0.28, h * 0.08, 2); ctx.fill();
  }

  function drawLamp(x, y, w, h, color, glow) {
    if (glow > 8) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    roundRect(x, y, w, h, h * 0.4); ctx.fill();
    if (glow > 8) ctx.restore();
    // iç parlama
    ctx.fillStyle = 'rgba(255,200,200,0.5)';
    roundRect(x + w * 0.2, y + h * 0.25, w * 0.6, h * 0.3, 2); ctx.fill();
  }

  function drawPlayerCar() {
    const car = CARS[player.chosen];
    const baseY = H - Math.max(40, H * 0.10);
    const width = Math.min(W * 0.34, 260);
    const sway = player.steer * width * 0.10;
    const bounce = Math.sin(player.z * 0.02) * (player.speed / MAX_SPEED) * 3;

    ctx.save();
    ctx.translate(W / 2 + sway, 0);
    ctx.rotate(player.steer * 0.04);
    drawCarSprite(0, baseY + bounce, width, car.body, car.accent, keys.brake);
    ctx.restore();
  }

  function drawTrafficCar(seg, car, fog) {
    const p = seg.p1.screen;
    if (!p.scale || p.scale <= 0 || !p.w) return;
    // Bir araç yaklaşık 0.8 şerit genişliği = yol yarı-genişliğinin ~%55'i
    const width = p.w * 0.55;
    if (width < 6) return;
    const destX = p.x + (car.offset * p.w);
    const destY = p.y;

    ctx.save();
    ctx.globalAlpha = Math.max(0.15, fog);
    drawCarSprite(destX, destY, width, car.color, shade(car.color, -34), false);
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --------------------------- Yardımcılar ----------------------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, amt) {
    const c = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
  }
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // --------------------------- Döngü ----------------------------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // büyük sıçramaları sınırla

    if (state === State.PLAY) {
      update(dt);
      render();
    } else if (state === State.PAUSE) {
      render();
      drawPauseOverlay();
    } else if (state === State.MENU) {
      // Menüde de canlı arka plan göster
      buildTrackOnce();
      idleScroll(dt);
      render();
    } else if (state === State.OVER) {
      render();
    }
    requestAnimationFrame(loop);
  }

  let trackReady = false;
  function buildTrackOnce() { if (!trackReady) { buildTrack(); trackReady = true; } }
  function idleScroll(dt) {
    player.speed = MAX_SPEED * 0.35;
    player.z += player.speed * dt;
    while (player.z >= trackLength) player.z -= trackLength;
    const seg = findSegment(player.z);
    bgOffset += seg.curve * 0.4 * dt;
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(4,6,15,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '900 42px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.fillText('DURAKLATILDI', W / 2, H / 2 - 10);
    ctx.font = '600 16px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#9fb0d0';
    ctx.fillText('Devam için P / ESC', W / 2, H / 2 + 24);
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(loop);
})();
