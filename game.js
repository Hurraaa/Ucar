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
  const DRAW_DIST = 300;        // kaç segment çizilecek (uzağı görmek için)
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
    light: { road: '#73767f', grass: '#46ab53', soil: '#9c7a4d', rumble: '#eef0f4', lane: '#f4f4f8' },
    dark:  { road: '#6b6e77', grass: '#3c9a47', soil: '#8f6f44', rumble: '#cf3a3a', lane: '#6b6e77' },
    start: { road: '#d8d8d8', grass: '#46ab53', soil: '#9c7a4d', rumble: '#d8d8d8', lane: '#d8d8d8' },
    finish:{ road: '#222',    grass: '#46ab53', soil: '#9c7a4d', rumble: '#222',    lane: '#222' },
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
      scn: [], coinz: [],
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
    placeScenery(R);
  }

  // Yol kenarı manzara: ağaç, çalı, kaya — geçtikçe derinlik ve hız hissi verir
  let scenery = [];
  function placeScenery(R) {
    scenery = [];
    const total = segments.length;
    for (let i = 8; i < total - 4; i++) {
      if (R() < 0.12) {
        const side = R() < 0.5 ? -1 : 1;
        const t = R();
        const type = t < 0.62 ? 'tree' : (t < 0.86 ? 'bush' : 'rock');
        const obj = {
          seg: i, side,
          dist: 1.35 + R() * 1.7,      // yol kenarından uzaklık (p.w katı)
          h: 0.85 + R() * 0.7,         // boy çarpanı
          tint: R(),                   // yeşil ton varyasyonu
          z: i * SEG_LEN, type
        };
        scenery.push(obj);
        segments[i].scn.push(obj);
      }
    }
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
        const idx = (z + k) % total;
        const coin = { seg: idx, offset: laneToOffset(lane), z: idx * SEG_LEN, taken: false };
        coins.push(coin);
        segments[idx].coinz.push(coin);
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
    let z = 120;
    // Çok daha seyrek: araçlar arası geniş boşluk (yoğunlukla bir miktar azalır)
    const gap = Math.max(55, 130 / trafficDensity);
    while (z < total - 60) {
      z += Math.floor(gap * (0.7 + R() * 0.6));
      const lane = Math.floor(R() * LANES); // 0..LANES-1
      const cruise = MAX_SPEED * (0.30 + R() * 0.26);  // normal seyir hızı
      traffic.push({
        offset: laneToOffset(lane),
        lane,
        color: TRAFFIC_COLORS[Math.floor(R() * TRAFFIC_COLORS.length)],
        cruise,
        spd: cruise,
        // Sinirlenince çıkabileceği üst hız — DAİMA oyuncununkinden düşük
        // (MAX_SPEED * 0.62..0.84), böylece her zaman geçebiliriz.
        rageMax: MAX_SPEED * (0.62 + R() * 0.22),
        anger: 0,          // sn cinsinden öfke sayacı (>0 ise gaza basar)
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
  let flashTimer = 0;       // selektör görsel parlaması (sn)
  let flashCooldown = 0;    // selektör tekrar basma beklemesi

  // Selektör (high-beam) at: öndeki yakın araçları sinirlendirir, yarışmaya çalışırlar
  function doFlash() {
    if (state !== State.PLAY || flashCooldown > 0) return;
    flashTimer = 0.4;
    flashCooldown = 0.45;
    Audio.flash();
    let angered = 0;
    for (const car of traffic) {
      const dz = wrapDelta(car.z - player.z);
      // önümüzde (dz>0), makul mesafede ve yakın şeritte olanlar tepki verir
      if (dz > 0 && dz < SEG_LEN * 70 && Math.abs(player.x - car.offset) < 0.95) {
        car.anger = 7;          // 7 sn boyunca gaza basar
        angered++;
      }
    }
    if (angered > 0) pops.push({ t: 0, text: 'SELEKTÖR!' });
  }

  // --------------------------- Girişler -------------------------
  const keys = { left: false, right: false, gas: false, brake: false };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = true; e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': keys.brake = true; e.preventDefault(); break;
      case 'p': case 'P': case 'Escape': togglePause(); break;
      case 'f': case 'F': doFlash(); e.preventDefault(); break;
      case ' ':
        if (state === State.MENU) startGame();
        else if (state === State.OVER) startGame();
        else doFlash();
        e.preventDefault();
        break;
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

  // Dokunmatik kontroller — TEK kapsayıcıda çoklu-dokunuş (multitouch) takibi.
  // Her parmağı id'siyle izleyip altındaki butona eşleriz; böylece aynı anda
  // birden fazla butona (örn. gaz + sağa) basılabilir.
  const ctrlButtons = {};
  const ctrlList = Array.from(document.querySelectorAll('.ctrl-btn'));
  ctrlList.forEach((btn) => { ctrlButtons[btn.dataset.dir] = btn; });

  function setKey(dir, v) {
    if (!dir) return;
    keys[dir] = v;
    const b = ctrlButtons[dir];
    if (b) b.classList.toggle('pressed', v);
  }

  // Dokunma noktasını bir butona eşle. Doğrudan üstünde değilse, çevresinde
  // bir tolerans (görünmez halo) ile EN YAKIN butona sayar — böylece parmak
  // biraz kayınca bile yön tuşu algılanır.
  const HIT_TOL = 46;
  function dirFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const direct = el && el.closest ? el.closest('.ctrl-btn') : null;
    if (direct) return direct.dataset.dir;
    let best = null, bestD = Infinity;
    for (const b of ctrlList) {
      const r = b.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return (best && bestD <= HIT_TOL) ? best.dataset.dir : null;
  }

  const tc = document.getElementById('touch-controls');
  const touchDir = {}; // touch.identifier -> dir

  tc.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Audio.init();
    for (const t of e.changedTouches) {
      const dir = dirFromPoint(t.clientX, t.clientY);
      if (dir) { touchDir[t.identifier] = dir; setKey(dir, true); }
    }
  }, { passive: false });

  tc.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const prev = touchDir[t.identifier];
      const next = dirFromPoint(t.clientX, t.clientY);
      if (prev !== next) {
        if (prev) setKey(prev, false);
        if (next) { setKey(next, true); touchDir[t.identifier] = next; }
        else delete touchDir[t.identifier];
      }
    }
  }, { passive: false });

  function endTouch(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const dir = touchDir[t.identifier];
      if (dir) { setKey(dir, false); delete touchDir[t.identifier]; }
    }
  }
  tc.addEventListener('touchend', endTouch, { passive: false });
  tc.addEventListener('touchcancel', endTouch, { passive: false });

  // Masaüstü fare (tek işaretçi)
  document.querySelectorAll('.ctrl-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); setKey(dir, true); });
    btn.addEventListener('mouseleave', () => setKey(dir, false));
  });

  // Selektör butonu (anlık tetik)
  const flashBtn = document.getElementById('flash-btn');
  const flashPress = (e) => {
    e.preventDefault();
    Audio.init();
    flashBtn.classList.add('pressed');
    doFlash();
  };
  const flashRelease = () => flashBtn.classList.remove('pressed');
  flashBtn.addEventListener('touchstart', flashPress, { passive: false });
  flashBtn.addEventListener('touchend', (e) => { e.preventDefault(); flashRelease(); }, { passive: false });
  flashBtn.addEventListener('mousedown', flashPress);
  window.addEventListener('mouseup', flashRelease);
  window.addEventListener('mouseup', () => {
    for (const dir in ctrlButtons) setKey(dir, false);
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
    function flash() { blip(1200, 0.05, 'square', 0.12, 1800); }

    return {
      init: () => { ensure(); resume(); },
      startEngine, stopEngine, engine, coin, crash, level, ui, flash,
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
    trafficDensity = Math.min(2.0, 1 + laps * 0.18);
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
    const effMax = MAX_SPEED * speedBoost;

    // Selektör sayaçları
    if (flashTimer > 0) flashTimer -= dt;
    if (flashCooldown > 0) flashCooldown -= dt;

    // Hızlanma / frenleme
    if (keys.gas) player.speed += ACCEL * dt;
    else if (keys.brake) player.speed += BRAKE * dt;
    else player.speed += DECEL * dt;

    // Şerit değişimi — düşük hızda da çabuk tepki versin (daha duyarlı direksiyon)
    const laneStep = 2.4 * dt * (0.55 + 0.45 * (player.speed / effMax));
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
    updateTraffic(dt);
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

  // Halka üzerinde en kısa işaretli mesafe
  function wrapDelta(d) {
    while (d > trackLength / 2) d -= trackLength;
    while (d < -trackLength / 2) d += trackLength;
    return d;
  }

  function updateTraffic(dt) {
    for (const car of traffic) {
      // Öfke (selektör yedikten sonra) azalır; bitince normale döner
      if (car.anger > 0) car.anger -= dt;
      // Hedef hız: sinirliyse öfke üst hızına gaza basar, değilse seyir hızına döner
      const target = car.anger > 0 ? car.rageMax : car.cruise;
      const rate = (car.anger > 0 ? 0.9 : 0.4) * MAX_SPEED; // ivme
      if (car.spd < target) car.spd = Math.min(target, car.spd + rate * dt);
      else car.spd = Math.max(target, car.spd - rate * dt);

      car.z += car.spd * dt;
      if (car.z >= trackLength) car.z -= trackLength;
    }
    // Çarpışma: oyuncuya göre boyuna ve yanal örtüşme
    for (const car of traffic) {
      const dz = wrapDelta(car.z - player.z);
      if (Math.abs(dz) < SEG_LEN * 1.4 && Math.abs(player.x - car.offset) < 0.42) {
        if (player.speed > MAX_SPEED * 0.08) { gameOver(); return; }
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

    // Manzara + altın + araçlar (uzaktan yakına çiz)
    for (let n = visible.length - 1; n >= 0; n--) {
      const seg = visible[n];
      const fog = seg._visible.fog;
      for (const obj of seg.scn) drawScenery(seg, obj, fog);
      for (const c of seg.coinz) { if (!c.taken) drawCoin(seg, c, fog); }
      for (const car of traffic) {
        if (Math.floor(car.z / SEG_LEN) % segments.length === seg.index) {
          drawTrafficCar(seg, car, fog);
        }
      }
    }

    // Selektör ışık huzmeleri (öne doğru)
    if (flashTimer > 0) drawFlashBeams();

    // Oyuncu arabası (ekranın altında, sabit)
    drawPlayerCar();

    // Toplama efektleri (yüzen yazı)
    drawPops();

    // Yüksek hızda hız çizgileri
    drawSpeedLines(player.speed / MAX_SPEED);

    // Vinyet
    drawVignette();
  }

  function drawFlashBeams() {
    const k = Math.max(0, flashTimer / 0.4);
    const flick = Math.sin(performance.now() * 0.09) * 0.5 + 0.5;
    const a = k * (0.45 + flick * 0.55);
    const ox = W / 2 + player.steer * 28;
    const topY = H * 0.50, botY = H * 0.86;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) {
      const baseX = ox + s * W * 0.045;
      const g = ctx.createLinearGradient(0, botY, 0, topY);
      g.addColorStop(0, `rgba(255,248,210,${0.38 * a})`);
      g.addColorStop(1, 'rgba(255,248,210,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(baseX - W * 0.018, botY);
      ctx.lineTo(baseX + W * 0.018, botY);
      ctx.lineTo(ox + s * W * 0.11, topY);
      ctx.lineTo(ox + s * W * 0.035, topY);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawSpeedLines(pct) {
    if (pct < 0.5) return;
    const a = Math.min(1, (pct - 0.5) / 0.5);
    const cx = W / 2, cy = H * 0.5;
    const t = performance.now() * 0.018;
    ctx.save();
    ctx.globalAlpha = a * 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + (i % 2 ? 0.12 : 0);
      const ph = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5);
      const r1 = H * (0.26 + ph * 0.12);
      const r2 = r1 + H * 0.16 * a;
      ctx.lineWidth = Math.max(1, 2.5 * a);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.82);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2 * 0.82);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Yol kenarı nesnesi: ağaç / çalı / kaya
  function drawScenery(seg, obj, fog) {
    const p = seg.p1.screen;
    if (!p.scale || p.scale <= 0 || !p.w) return;
    const unit = p.w * 0.9;             // derinliğe göre boyut
    if (unit < 4) return;
    const bx = p.x + obj.side * (p.w * obj.dist);
    const by = p.y;
    if (bx < -unit * 3 || bx > W + unit * 3) return;

    ctx.save();
    // Solgun/hayalet görünümü kaldır: ekran boyutuna bağlı KISA bir geçişle
    // hızla TAM OPAK olurlar (uzakta belirsizce oluşmazlar).
    ctx.globalAlpha = Math.min(1, (unit - 4) / 7);

    // Zemin gölgesi (hepsi için)
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(bx, by, unit * 0.4, unit * 0.12, 0, 0, Math.PI * 2); ctx.fill();

    if (obj.type === 'tree') {
      const th = unit * (1.3 * obj.h);          // ağaç boyu
      const trunkW = unit * 0.14;
      // gövde
      const tg = ctx.createLinearGradient(bx - trunkW, 0, bx + trunkW, 0);
      tg.addColorStop(0, '#5a3b21'); tg.addColorStop(0.5, '#7a5230'); tg.addColorStop(1, '#3f2815');
      ctx.fillStyle = tg;
      roundRect(bx - trunkW / 2, by - th * 0.42, trunkW, th * 0.42, trunkW * 0.3); ctx.fill();
      // yaprak kümeleri (3 daire, gradyanlı)
      const green1 = obj.tint < 0.5 ? '#2f7d33' : '#3c8f3a';
      const green2 = obj.tint < 0.5 ? '#1f5a25' : '#276b28';
      const cy = by - th * 0.62, cr = unit * 0.5;
      const blob = (ox, oy, r) => {
        const fg = ctx.createRadialGradient(bx + ox - r * 0.3, cy + oy - r * 0.3, r * 0.1, bx + ox, cy + oy, r);
        fg.addColorStop(0, green1); fg.addColorStop(1, green2);
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(bx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
      };
      blob(-cr * 0.55, cr * 0.35, cr * 0.72);
      blob(cr * 0.55, cr * 0.35, cr * 0.72);
      blob(0, -cr * 0.3, cr * 0.95);
      // üst ışık
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(bx - cr * 0.25, cy - cr * 0.5, cr * 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (obj.type === 'bush') {
      const r = unit * 0.42 * obj.h;
      const cy = by - r * 0.7;
      const fg = ctx.createRadialGradient(bx - r * 0.3, cy - r * 0.3, r * 0.1, bx, cy, r * 1.2);
      fg.addColorStop(0, '#4ca64f'); fg.addColorStop(1, '#2c6f30');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(bx - r * 0.6, cy + r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.arc(bx + r * 0.6, cy + r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.arc(bx, cy - r * 0.2, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    } else { // rock
      const r = unit * 0.34 * obj.h;
      const cy = by - r * 0.5;
      const rg = ctx.createLinearGradient(bx, cy - r, bx, cy + r);
      rg.addColorStop(0, '#9aa0a6'); rg.addColorStop(1, '#5b6066');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(bx - r, cy + r * 0.6);
      ctx.lineTo(bx - r * 0.5, cy - r * 0.6);
      ctx.lineTo(bx + r * 0.3, cy - r * 0.8);
      ctx.lineTo(bx + r, cy + r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.5, cy - r * 0.6);
      ctx.lineTo(bx + r * 0.3, cy - r * 0.8);
      ctx.lineTo(bx - r * 0.1, cy - r * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawCoin(seg, c, fog) {
    const p = seg.p1.screen;
    if (!p.scale || p.scale <= 0 || !p.w) return;
    const r = Math.max(2, p.w * 0.08);
    const cx = p.x + (c.offset * p.w);
    const bob = Math.sin(performance.now() * 0.005 + c.z * 0.01) * r * 0.6;
    const cy = p.y - r * 1.6 + bob;
    if (r < 1.5) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fog * 1.15);
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
    const group = Math.floor(seg.index / RUMBLE_LEN) % 2;

    // Çimen (tüm genişlik, hafif şeritli ton)
    ctx.fillStyle = c.grass;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);

    // Toprak banket (yol ile çimen arası geçiş)
    const s1 = p1.w / 2.4, s2 = p2.w / 2.4;
    polygon(p1.x - p1.w - s1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - s2, p2.y, c.soil);
    polygon(p1.x + p1.w + s1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + s2, p2.y, c.soil);

    // Kenar bordürü (kırmızı/beyaz rumble)
    const r1 = p1.w / 4.5, r2 = p2.w / 4.5;
    polygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, c.rumble);
    polygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, c.rumble);

    // Yol asfaltı
    polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);

    if (c.lane !== c.road) {
      // Kenar (devamlı beyaz) çizgiler — yolun iç kenarında
      const ew1 = p1.w * 0.028, ew2 = p2.w * 0.028;
      const ei1 = p1.w * 0.93, ei2 = p2.w * 0.93;
      const edge = '#eef1f6';
      polygon(p1.x - ei1 - ew1, p1.y, p1.x - ei1 + ew1, p1.y, p2.x - ei2 + ew2, p2.y, p2.x - ei2 - ew2, p2.y, edge);
      polygon(p1.x + ei1 - ew1, p1.y, p1.x + ei1 + ew1, p1.y, p2.x + ei2 + ew2, p2.y, p2.x + ei2 - ew2, p2.y, edge);

      // Kesik (dashed) orta şerit ayraçları — sadece her ikinci grupta çiz
      if (group === 0) {
        const lw1 = p1.w * 0.022, lw2 = p2.w * 0.022;
        for (let i = 1; i < LANES; i++) {
          const lx1 = p1.x - p1.w + (2 * p1.w) * (i / LANES);
          const lx2 = p2.x - p2.w + (2 * p2.w) * (i / LANES);
          polygon(lx1 - lw1, p1.y, lx1 + lw1, p1.y, lx2 + lw2, p2.y, lx2 - lw2, p2.y, '#f2f3d8');
        }
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

    // Zemin tabanı: ufkun ALTINI da tamamen doldur.
    // Böylece gökyüzü (0..horizon) + zemin (horizon..H) birlikte tüm ekranı
    // her karede yeniden boyar ve geçilen yolun izi (hayalet) kalmaz.
    const grd = ctx.createLinearGradient(0, horizon, 0, H);
    grd.addColorStop(0, '#3f9a4a');
    grd.addColorStop(1, '#2c7536');
    ctx.fillStyle = grd;
    ctx.fillRect(0, horizon - 1, W, H - horizon + 2);

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
  // Gerçekçi (GTA tarzı) arkadan görünüm: kavisli parlak gövde, gökyüzü
  // yansıması, modern LED stoplar, difüzör/egzoz, tinted cam, alaşım jant.
  function drawCarSprite(cx, baseY, width, body, accent, brake) {
    const w = width;
    const h = w * 0.70;        // arkadan bakışta araç enli, basık
    const half = w / 2;

    // Dikey seviyeler (baseY = zemin/teker teması)
    const ySill    = baseY - h * 0.12;   // marşpiyel / gövde alt
    const yBumper  = baseY - h * 0.30;
    const yHaunch  = baseY - h * 0.50;    // en geniş yer (arka çamurluk omzu)
    const yShould  = baseY - h * 0.60;
    const yRoof    = baseY - h * 0.90;
    const yTop     = baseY - h * 0.99;

    // Yarı genişlikler
    const sillHalf  = half * 0.86;
    const bodyHalf  = half * 0.99;
    const roofHalf  = half * 0.60;

    // ---- 1) Zemin gölgesi (sıkı, yumuşak AO) ----
    ctx.save();
    const sg = ctx.createRadialGradient(cx, baseY + h * 0.02, w * 0.05, cx, baseY + h * 0.02, w * 0.6);
    sg.addColorStop(0, 'rgba(0,0,0,0.5)');
    sg.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + h * 0.05, w * 0.6, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- 2) Tekerlekler (gövdenin arkasında, köşelerde) ----
    const tireW = w * 0.20, tireH = h * 0.42;
    const tireY = baseY - tireH;
    drawWheel(cx - half * 0.84 - tireW / 2, tireY, tireW, tireH);
    drawWheel(cx + half * 0.84 - tireW / 2, tireY, tireW, tireH);

    // ---- 3) Ana gövde silüeti (kavisli path) ----
    function bodyPath() {
      ctx.beginPath();
      ctx.moveTo(cx - sillHalf, ySill);
      ctx.quadraticCurveTo(cx - bodyHalf * 1.03, yBumper, cx - bodyHalf, yHaunch);   // sol çamurluk şişkinliği
      ctx.quadraticCurveTo(cx - bodyHalf * 0.99, yShould, cx - roofHalf, yRoof);      // sol C-direği
      ctx.quadraticCurveTo(cx, yTop, cx + roofHalf, yRoof);                            // tavan kavisi
      ctx.quadraticCurveTo(cx + bodyHalf * 0.99, yShould, cx + bodyHalf, yHaunch);     // sağ C-direği
      ctx.quadraticCurveTo(cx + bodyHalf * 1.03, yBumper, cx + sillHalf, ySill);       // sağ çamurluk
      ctx.lineTo(cx - sillHalf, ySill);
      ctx.closePath();
    }

    // Boya gradyanı — üstte gökyüzü yansıması, ortada renk, altta karanlık
    ctx.save();
    bodyPath();
    ctx.clip();
    const paint = ctx.createLinearGradient(0, yTop, 0, baseY);
    paint.addColorStop(0.00, mix(body, '#cfe2f5', 0.6));  // tavan: açık gökyüzü yansıması
    paint.addColorStop(0.14, mix(body, '#cfe2f5', 0.25));
    paint.addColorStop(0.30, shade(body, 22));
    paint.addColorStop(0.46, body);
    paint.addColorStop(0.66, shade(body, -16));
    paint.addColorStop(0.85, shade(body, -42));
    paint.addColorStop(1.00, shade(body, -66));
    ctx.fillStyle = paint;
    ctx.fillRect(cx - half - 4, yTop - 4, w + 8, h + 8);

    // Yatay specular bant (ufuk yansıması) — bel hizasında parlak şerit
    const spec = ctx.createLinearGradient(0, yHaunch - h * 0.10, 0, yHaunch + h * 0.06);
    spec.addColorStop(0, 'rgba(255,255,255,0)');
    spec.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(cx - half, yHaunch - h * 0.10, w, h * 0.16);

    // Yanlardaki koyu ortam gölgesi (kenarlara doğru kararma — yuvarlaklık hissi)
    const sideShade = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    sideShade.addColorStop(0, 'rgba(0,0,0,0.34)');
    sideShade.addColorStop(0.16, 'rgba(0,0,0,0)');
    sideShade.addColorStop(0.84, 'rgba(0,0,0,0)');
    sideShade.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(cx - half, yTop, w, h);
    ctx.restore();

    // Gövde kenar çizgisi (keskinlik)
    ctx.save();
    bodyPath();
    ctx.lineWidth = Math.max(1, w * 0.01);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.restore();

    // ---- 4) Yan aynalar ----
    ctx.fillStyle = shade(body, -18);
    roundRect(cx - bodyHalf - w * 0.05, yShould + h * 0.02, w * 0.085, h * 0.085, w * 0.025); ctx.fill();
    roundRect(cx + bodyHalf - w * 0.035, yShould + h * 0.02, w * 0.085, h * 0.085, w * 0.025); ctx.fill();
    ctx.fillStyle = '#46586c';
    roundRect(cx - bodyHalf - w * 0.04, yShould + h * 0.03, w * 0.055, h * 0.05, w * 0.02); ctx.fill();
    roundRect(cx + bodyHalf - w * 0.025, yShould + h * 0.03, w * 0.055, h * 0.05, w * 0.02); ctx.fill();

    // ---- 5) Arka cam (tinted, gradyan + yansıma) ----
    const gw = roofHalf * 1.7, gx = cx - gw / 2;
    const gTop = yRoof + h * 0.03, gBot = yShould + h * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - gw * 0.5, gBot);
    ctx.quadraticCurveTo(cx - gw * 0.52, gTop, cx - gw * 0.38, gTop);
    ctx.lineTo(cx + gw * 0.38, gTop);
    ctx.quadraticCurveTo(cx + gw * 0.52, gTop, cx + gw * 0.5, gBot);
    ctx.closePath();
    ctx.clip();
    const gg = ctx.createLinearGradient(0, gTop, 0, gBot);
    gg.addColorStop(0, '#1a2733');
    gg.addColorStop(0.5, '#33485b');
    gg.addColorStop(1, '#21303d');
    ctx.fillStyle = gg;
    ctx.fillRect(gx - 4, gTop - 4, gw + 8, (gBot - gTop) + 8);
    // diyagonal cam yansıması
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(gx, gBot); ctx.lineTo(gx + gw * 0.4, gTop);
    ctx.lineTo(gx + gw * 0.62, gTop); ctx.lineTo(gx + gw * 0.18, gBot);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // cam çerçevesi (krom)
    ctx.lineWidth = Math.max(1, w * 0.008);
    ctx.strokeStyle = 'rgba(20,24,30,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx - gw * 0.5, gBot);
    ctx.quadraticCurveTo(cx - gw * 0.52, gTop, cx - gw * 0.38, gTop);
    ctx.lineTo(cx + gw * 0.38, gTop);
    ctx.quadraticCurveTo(cx + gw * 0.52, gTop, cx + gw * 0.5, gBot);
    ctx.stroke();

    // ---- 6) Bagaj/panel dikiş çizgileri ----
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(0.6, w * 0.006);
    ctx.beginPath();  // bagaj kapağı yatay hattı
    ctx.moveTo(cx - bodyHalf * 0.86, yHaunch + h * 0.02);
    ctx.lineTo(cx + bodyHalf * 0.86, yHaunch + h * 0.02);
    ctx.stroke();

    // ---- 7) Stop lambaları (modern LED, yatay, sarmalayan) ----
    const lampY = yHaunch + h * 0.06, lampH = h * 0.13;
    const lampColor = brake ? '#ff3b30' : '#cc1f1f';
    drawTailLight(cx - bodyHalf * 0.92, lampY, bodyHalf * 0.46, lampH, lampColor, brake, false);
    drawTailLight(cx + bodyHalf * 0.46, lampY, bodyHalf * 0.46, lampH, lampColor, brake, true);
    // Ortada bağlayan ince LED şeridi
    if (brake) { ctx.save(); ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = w * 0.06; }
    const bar = ctx.createLinearGradient(cx - bodyHalf * 0.46, 0, cx + bodyHalf * 0.46, 0);
    bar.addColorStop(0, brake ? '#ff5a4a' : '#6e1414');
    bar.addColorStop(0.5, brake ? '#ff8a7a' : '#8a1a1a');
    bar.addColorStop(1, brake ? '#ff5a4a' : '#6e1414');
    ctx.fillStyle = bar;
    roundRect(cx - bodyHalf * 0.46, lampY + lampH * 0.28, bodyHalf * 0.92, lampH * 0.32, lampH * 0.16); ctx.fill();
    if (brake) ctx.restore();

    // ---- 8) Arka tampon + difüzör + egzoz ----
    const bumpTop = yBumper + h * 0.04;
    const bg2 = ctx.createLinearGradient(0, bumpTop, 0, ySill);
    bg2.addColorStop(0, shade(body, -30));
    bg2.addColorStop(1, shade(body, -55));
    ctx.fillStyle = bg2;
    roundRect(cx - sillHalf * 1.02, bumpTop, sillHalf * 2.04, (ySill - bumpTop), w * 0.04); ctx.fill();
    // difüzör (siyah, dikey kanatlar)
    ctx.fillStyle = '#15171b';
    roundRect(cx - sillHalf * 0.5, ySill - h * 0.07, sillHalf, h * 0.07, w * 0.02); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(0.6, w * 0.006);
    for (let i = -2; i <= 2; i++) {
      const dx = cx + i * sillHalf * 0.18;
      ctx.beginPath(); ctx.moveTo(dx, ySill - h * 0.065); ctx.lineTo(dx, ySill - h * 0.008); ctx.stroke();
    }
    // egzoz uçları (krom)
    const exR = w * 0.035;
    for (const ex of [cx - sillHalf * 0.66, cx + sillHalf * 0.66]) {
      const eg = ctx.createRadialGradient(ex - exR * 0.3, ySill - exR * 1.2, exR * 0.1, ex, ySill - exR, exR);
      eg.addColorStop(0, '#e8edf2'); eg.addColorStop(0.6, '#9aa0a8'); eg.addColorStop(1, '#2b2e33');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.ellipse(ex, ySill - exR * 0.6, exR, exR * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0c0d10';
      ctx.beginPath(); ctx.ellipse(ex, ySill - exR * 0.6, exR * 0.55, exR * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---- 9) Plaka (girintili) ----
    ctx.fillStyle = '#15171b';
    roundRect(cx - w * 0.15, yBumper - h * 0.02, w * 0.30, h * 0.10, w * 0.015); ctx.fill();
    ctx.fillStyle = '#eef1e6';
    roundRect(cx - w * 0.135, yBumper - h * 0.008, w * 0.27, h * 0.076, w * 0.012); ctx.fill();
    ctx.fillStyle = '#2f5fae';
    roundRect(cx - w * 0.135, yBumper - h * 0.008, w * 0.035, h * 0.076, w * 0.012); ctx.fill();
    ctx.fillStyle = '#7a8190';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(cx - w * 0.08 + i * w * 0.035, yBumper + h * 0.018, w * 0.02, h * 0.04);
    }
  }

  // Modern LED stop lambası: gövde + parlayan iç + krom çerçeve
  function drawTailLight(lx, ly, lw, lh, color, brake, mirror) {
    if (brake) { ctx.save(); ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = lw * 0.35; }
    // dış kasa (koyu)
    ctx.fillStyle = '#1c1216';
    roundRect(lx, ly, lw, lh, lh * 0.35); ctx.fill();
    // kırmızı lens (gradyan)
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, shade(color, brake ? 40 : 18));
    lg.addColorStop(0.5, color);
    lg.addColorStop(1, shade(color, -30));
    ctx.fillStyle = lg;
    roundRect(lx + lw * 0.06, ly + lh * 0.16, lw * 0.88, lh * 0.68, lh * 0.3); ctx.fill();
    if (brake) ctx.restore();
    // iç LED parıltısı (yatay çizgi)
    ctx.fillStyle = brake ? 'rgba(255,220,210,0.9)' : 'rgba(255,160,150,0.5)';
    roundRect(lx + lw * 0.14, ly + lh * 0.36, lw * 0.72, lh * 0.18, lh * 0.09); ctx.fill();
  }

  // 3B tekerlek: silindirik gövde gölgelemesi + metalik jant + bijonlar
  function drawWheel(wx, wy, ww, wh) {
    const r = Math.min(ww, wh) * 0.5;
    const ccx = wx + ww / 2, ccy = wy + wh / 2;

    // Zemin teması (kontak gölgesi)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(ccx, wy + wh * 0.98, ww * 0.62, wh * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lastik gövdesi — yatay gradyan ile silindirik hacim
    const tg = ctx.createLinearGradient(wx, 0, wx + ww, 0);
    tg.addColorStop(0, '#000');
    tg.addColorStop(0.18, '#2c2f36');
    tg.addColorStop(0.45, '#3a3e46');
    tg.addColorStop(0.62, '#23262c');
    tg.addColorStop(1, '#050608');
    ctx.fillStyle = tg;
    roundRect(wx, wy, ww, wh, Math.min(ww, wh) * 0.42); ctx.fill();

    // Üst sırt parlaması (lastik omuzu)
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(wx + ww * 0.18, wy + wh * 0.04, ww * 0.5, wh * 0.10, ww * 0.2); ctx.fill();

    // Lastik dişleri (ince yatay çizgiler)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(0.6, ww * 0.04);
    for (let i = 1; i <= 3; i++) {
      const ly = wy + wh * (0.2 + i * 0.18);
      ctx.beginPath(); ctx.moveTo(wx + ww * 0.12, ly); ctx.lineTo(wx + ww * 0.88, ly); ctx.stroke();
    }

    // Metalik jant (radyal gradyan disk)
    const hubR = r * 0.62;
    const rim = ctx.createRadialGradient(ccx - hubR * 0.3, ccy - hubR * 0.3, hubR * 0.1, ccx, ccy, hubR);
    rim.addColorStop(0, '#f2f4f7');
    rim.addColorStop(0.45, '#b9c0c9');
    rim.addColorStop(0.8, '#7c828c');
    rim.addColorStop(1, '#3c4047');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.ellipse(ccx, ccy, hubR * 0.78, hubR, 0, 0, Math.PI * 2); ctx.fill();

    // Jant göbeği + bijonlar
    ctx.fillStyle = '#5a5f68';
    ctx.beginPath(); ctx.ellipse(ccx, ccy, hubR * 0.34, hubR * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2e34';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const bx = ccx + Math.cos(a) * hubR * 0.5;
      const by = ccy + Math.sin(a) * hubR * 0.62;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(0.8, hubR * 0.1), 0, Math.PI * 2); ctx.fill();
    }
    // Göbek parlaması
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(ccx - hubR * 0.22, ccy - hubR * 0.26, hubR * 0.12, hubR * 0.16, 0, 0, Math.PI * 2); ctx.fill();
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
    if (width < 2) return;
    const destX = p.x + (car.offset * p.w);
    const destY = p.y;

    // Pus + yakın kenar yumuşatması: uzakta neredeyse görünmez başlar, yaklaştıkça
    // netleşir. Böylece araçlar "bir anda" belirmez.
    ctx.save();
    ctx.globalAlpha = Math.min(1, fog * 1.15);

    // Sinirli (selektör yemiş) araç gaza basınca egzoz dumanı
    if (car.anger > 0 && width > 14) {
      const t = performance.now() * 0.004;
      for (let i = 0; i < 3; i++) {
        const ph = (t + i * 0.7) % 1;
        const px = destX + Math.sin((t + i) * 4) * width * 0.12;
        const py = destY + width * 0.08 + ph * width * 0.4;
        const pr = width * (0.10 + ph * 0.22);
        ctx.fillStyle = `rgba(60,60,66,${0.32 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      }
    }

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
  // İki rengi t oranında karıştır (0 = a, 1 = b)
  function mix(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const f = (x, y) => Math.round(x + (y - x) * t);
    return `rgb(${f(ca.r, cb.r)},${f(ca.g, cb.g)},${f(ca.b, cb.b)})`;
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
