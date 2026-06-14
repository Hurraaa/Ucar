/* ============================================================
   UCAR 3D — Three.js ile gerçek 3B sürüş
   Arabanın arkasından kamera · 3 şerit · trafik · selektör
   · gerçek ışık/gölge · gradyan gökyüzü · dağlar · ağaçlar
   ============================================================ */
(() => {
  'use strict';
  if (typeof THREE === 'undefined') { console.error('THREE yüklenemedi'); return; }

  // ----------------------------- Sahne -----------------------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#bfe0f5');
  scene.fog = new THREE.Fog(HORIZON, 70, 430);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  camera.position.set(0, 4.3, 9);

  // Gökyüzü (gradyan, scene.background)
  scene.background = makeSkyTexture();

  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, '#1e4f9e');
    grd.addColorStop(0.45, '#5a93d8');
    grd.addColorStop(0.75, '#9cc6ec');
    grd.addColorStop(1.0, '#bfe0f5');
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ----------------------------- Işık -----------------------------
  const hemi = new THREE.HemisphereLight(0xbfe0f5, 0x3a6b39, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.7);
  sun.position.set(-26, 40, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // ----------------------------- Yol -----------------------------
  const LANES = 3;
  const LANE_W = 3.4;
  const ROAD_W = LANE_W * LANES;          // asfalt genişliği
  const ROAD_LEN = 640;
  const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;  // şerit merkez x

  // Çimen zemini
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(600, ROAD_LEN + 200),
    new THREE.MeshStandardMaterial({ color: 0x4aa84f, roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.z = -(ROAD_LEN / 2) + 30;
  grass.receiveShadow = true;
  scene.add(grass);

  // Yol (kaydırılan dokulu plane)
  const roadTex = makeRoadTexture();
  roadTex.wrapS = THREE.ClampToEdgeWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const SEG_WORLD = 16;                    // bir doku tekrarının dünya uzunluğu
  roadTex.repeat.set(1, ROAD_LEN / SEG_WORLD);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_W + 1.6, ROAD_LEN),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -(ROAD_LEN / 2) + 30);
  road.receiveShadow = true;
  scene.add(road);

  function makeRoadTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;   // genişlik = yol enine, yükseklik = boyuna bir segment
    const g = c.getContext('2d');
    // asfalt
    g.fillStyle = '#54585f'; g.fillRect(0, 0, 256, 256);
    // hafif doku
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const total = ROAD_W + 1.6;
    const px = (worldX) => ((worldX + total / 2) / total) * 256;
    // toprak banket kenarları
    g.fillStyle = '#8f6f44';
    g.fillRect(0, 0, px(-ROAD_W / 2) - 6, 256);
    g.fillRect(px(ROAD_W / 2) + 6, 0, 256, 256);
    // beyaz kenar çizgileri
    g.fillStyle = '#eef1f6';
    g.fillRect(px(-ROAD_W / 2) + 2, 0, 4, 256);
    g.fillRect(px(ROAD_W / 2) - 6, 0, 4, 256);
    // kesik orta şerit çizgileri (2 ayraç)
    g.fillStyle = '#f3f4d9';
    for (let i = 1; i < LANES; i++) {
      const x = px(-ROAD_W / 2 + LANE_W * i) - 2;
      g.fillRect(x, 30, 4, 90);     // kesik
      g.fillRect(x, 166, 4, 90);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // ----------------------------- Araba modeli -----------------------------
  function buildCar(colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.55, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.3, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a35, metalness: 0.5, roughness: 0.12 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.9, roughness: 0.25 });

    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }

    // alt gövde (geniş, basık)
    box(1.95, 0.55, 4.3, paint, 0, 0.62, 0);
    // üst gövde / omuz
    box(1.92, 0.42, 3.9, paint, 0, 1.0, -0.05);
    // kabin (coupe, hafif arkaya kaçık)
    const cabin = box(1.66, 0.62, 1.95, paint, 0, 1.42, -0.15);
    cabin.scale.z = 1;
    // camlar (kabinin biraz içinde, koyu)
    box(1.5, 0.5, 0.12, glass, 0, 1.45, 0.83);   // arka cam
    box(1.5, 0.5, 0.12, glass, 0, 1.45, -1.12);  // ön cam
    box(0.12, 0.45, 1.7, glass, 0.8, 1.45, -0.15);
    box(0.12, 0.45, 1.7, glass, -0.8, 1.45, -0.15);
    // ördek-kuyruğu spoiler
    box(1.8, 0.1, 0.4, paint, 0, 1.28, 1.85);

    // stop lambaları (arka = +z)
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff1a14, emissiveIntensity: 0.6 });
    box(1.7, 0.16, 0.06, tailMat, 0, 0.95, 2.16);           // tam genişlik LED şerit
    // farlar (ön = -z)
    box(0.45, 0.18, 0.06, chrome, 0.6, 0.85, -2.16);
    box(0.45, 0.18, 0.06, chrome, -0.6, 0.85, -2.16);
    // egzozlar
    box(0.16, 0.16, 0.1, dark, 0.55, 0.35, 2.18);
    box(0.16, 0.16, 0.1, dark, -0.55, 0.35, 2.18);

    // tekerlekler
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 0.9, roughness: 0.3 });
    const wheels = [];
    for (const [wx, wz] of [[0.98, 1.42], [-0.98, 1.42], [0.98, -1.42], [-0.98, -1.42]]) {
      const wheel = new THREE.Group();
      const t = new THREE.Mesh(wheelGeo, tireMat); t.castShadow = true; wheel.add(t);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10), rimMat);
      rim.rotation.z = Math.PI / 2; wheel.add(rim);
      wheel.position.set(wx, 0.46, wz);
      g.add(wheel); wheels.push(wheel);
    }

    g.userData = { tailMat, wheels, paint };
    return g;
  }

  // ----------------------------- Ağaç / Dağ -----------------------------
  function buildTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }));
    trunk.position.y = 0.8; trunk.castShadow = true; g.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3c, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * 0.35, 1.6, 8), leafMat);
      cone.position.y = 1.8 + i * 0.9; cone.castShadow = true; g.add(cone);
    }
    return g;
  }

  function addMountains() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5d76a3, roughness: 1, flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 1, flatShading: true });
    const grp = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const h = 30 + Math.random() * 55;
      const r = 22 + Math.random() * 26;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
      const side = i < 8 ? -1 : 1;
      m.position.set((40 + Math.random() * 120) * side, h / 2 - 4, -260 - Math.random() * 160);
      grp.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.28, 5), snow);
      cap.position.set(m.position.x, m.position.y + h * 0.36, m.position.z);
      grp.add(cap);
    }
    scene.add(grp);
  }
  addMountains();

  // ----------------------------- Oyun durumu -----------------------------
  const State = { MENU: 0, PLAY: 1, OVER: 2, PAUSE: 3 };
  let state = State.MENU;

  const CAR_COLORS = [
    { hex: 0xe63946, name: 'Kırmızı' }, { hex: 0x2d7dd2, name: 'Mavi' },
    { hex: 0xf4a300, name: 'Sarı' }, { hex: 0x2a9d8f, name: 'Yeşil' },
    { hex: 0xe9ecef, name: 'Beyaz' }, { hex: 0x33373e, name: 'Siyah' }
  ];
  const TRAFFIC_HEX = [0xd65a31, 0x3066be, 0x4caf50, 0x9b5de5, 0xf9c74f, 0x577590, 0xbcc0c4, 0x2b2d34];

  const MAX_SPEED = 95;          // birim/sn (~ görsel hız)
  const player = { x: 0, lane: 1, speed: 0, chosen: 0, steer: 0, model: null };

  let score = 0, best = Number(localStorage.getItem('ucar3d_best') || 0);
  let level = 1, dist = 0, speedBoost = 1, trafficDensity = 1;
  let flashTimer = 0, flashCooldown = 0;
  const sun_dummy = 0;

  // Oyuncu arabası
  player.model = buildCar(CAR_COLORS[0].hex);
  scene.add(player.model);

  // Trafik havuzu
  const traffic = [];
  function spawnTraffic() {
    for (const t of traffic) scene.remove(t.model);
    traffic.length = 0;
    const n = Math.round(7 * trafficDensity);
    for (let i = 0; i < n; i++) {
      const hex = TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0];
      const m = buildCar(hex);
      scene.add(m);
      const car = { model: m, lane: (Math.random() * LANES) | 0, z: -60 - i * (70 / trafficDensity) - Math.random() * 40,
        cruise: MAX_SPEED * (0.32 + Math.random() * 0.22), spd: 0, rageMax: MAX_SPEED * (0.6 + Math.random() * 0.18), anger: 0 };
      car.spd = car.cruise;
      car.model.position.set(laneX(car.lane), 0, car.z);
      traffic.push(car);
    }
  }

  // Ağaçlar (kaydırılan)
  const trees = [];
  for (let i = 0; i < 22; i++) {
    const t = buildTree();
    scene.add(t);
    const side = i % 2 ? 1 : -1;
    const tr = { model: t, z: -i * 26 - Math.random() * 20, x: side * (ROAD_W / 2 + 4 + Math.random() * 14) };
    t.position.set(tr.x, 0, tr.z);
    t.scale.setScalar(0.8 + Math.random() * 0.7);
    trees.push(tr);
  }

  // Coinler (kaydırılan, dönen)
  const coins = [];
  const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcf33, metalness: 0.85, roughness: 0.3, emissive: 0x5a4000, emissiveIntensity: 0.4 });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(coinGeo, coinMat); m.castShadow = true;
    scene.add(m);
    const co = { model: m, z: -40 - i * 30, lane: (Math.random() * LANES) | 0, taken: false };
    m.position.set(laneX(co.lane), 1.1, co.z);
    coins.push(co);
  }
  function recycleCoin(co) {
    co.lane = (Math.random() * LANES) | 0;
    co.z -= 30 * coins.length / 1;
    co.taken = false; co.model.visible = true;
    co.model.position.x = laneX(co.lane);
  }

  // ----------------------------- Girişler -----------------------------
  const keys = { left: false, right: false, gas: false, brake: false };
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = true; e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': keys.brake = true; e.preventDefault(); break;
      case 'p': case 'P': case 'Escape': togglePause(); break;
      case 'f': case 'F': doFlash(); e.preventDefault(); break;
      case ' ': if (state === State.MENU || state === State.OVER) startGame(); else doFlash(); e.preventDefault(); break;
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

  // Dokunmatik (multitouch)
  const ctrlButtons = {};
  const ctrlList = Array.from(document.querySelectorAll('.ctrl-btn'));
  ctrlList.forEach((b) => { ctrlButtons[b.dataset.dir] = b; });
  function setKey(dir, v) { if (!dir) return; keys[dir] = v; const b = ctrlButtons[dir]; if (b) b.classList.toggle('pressed', v); }
  function dirFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const d = el && el.closest ? el.closest('.ctrl-btn') : null;
    if (d) return d.dataset.dir;
    let best = null, bd = Infinity;
    for (const b of ctrlList) {
      const r = b.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
      const dd = Math.hypot(dx, dy);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best && bd <= 46 ? best.dataset.dir : null;
  }
  const tc = document.getElementById('touch-controls');
  const touchDir = {};
  if (tc) {
    tc.addEventListener('touchstart', (e) => { e.preventDefault(); Audio.init(); for (const t of e.changedTouches) { const d = dirFromPoint(t.clientX, t.clientY); if (d) { touchDir[t.identifier] = d; setKey(d, true); } } }, { passive: false });
    tc.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) { const p = touchDir[t.identifier], n = dirFromPoint(t.clientX, t.clientY); if (p !== n) { if (p) setKey(p, false); if (n) { setKey(n, true); touchDir[t.identifier] = n; } else delete touchDir[t.identifier]; } } }, { passive: false });
    const end = (e) => { e.preventDefault(); for (const t of e.changedTouches) { const d = touchDir[t.identifier]; if (d) { setKey(d, false); delete touchDir[t.identifier]; } } };
    tc.addEventListener('touchend', end, { passive: false });
    tc.addEventListener('touchcancel', end, { passive: false });
  }
  ctrlList.forEach((b) => {
    const dir = b.dataset.dir;
    b.addEventListener('mousedown', (e) => { e.preventDefault(); setKey(dir, true); });
    b.addEventListener('mouseleave', () => setKey(dir, false));
  });
  window.addEventListener('mouseup', () => { for (const d in ctrlButtons) setKey(d, false); });

  const flashBtn = document.getElementById('flash-btn');
  if (flashBtn) {
    const press = (e) => { e.preventDefault(); Audio.init(); flashBtn.classList.add('pressed'); doFlash(); };
    const rel = () => flashBtn.classList.remove('pressed');
    flashBtn.addEventListener('touchstart', press, { passive: false });
    flashBtn.addEventListener('touchend', (e) => { e.preventDefault(); rel(); }, { passive: false });
    flashBtn.addEventListener('mousedown', press);
    window.addEventListener('mouseup', rel);
  }

  // Selektör ışığı (öne doğru parlama)
  const flashLight = new THREE.PointLight(0xfff4d0, 0, 60, 1.5);
  flashLight.position.set(0, 1.2, -3);
  scene.add(flashLight);

  function doFlash() {
    if (state !== State.PLAY || flashCooldown > 0) return;
    flashTimer = 0.4; flashCooldown = 0.45;
    Audio.flash();
    let any = 0;
    for (const car of traffic) {
      const dz = car.z; // oyuncu z=0, önümüzdekiler dz<0
      if (dz < 0 && dz > -130 && Math.abs(laneX(car.lane) - player.x) < LANE_W * 1.6) { car.anger = 7; any++; }
    }
    if (any) pushPop('SELEKTÖR!');
  }

  // ----------------------------- Ses -----------------------------
  const Audio = (() => {
    let A = null, master = null, engOsc, engOsc2, engGain, engFilter, started = false, enabled = true;
    function ensure() { if (A) return; try { A = new (window.AudioContext || window.webkitAudioContext)(); master = A.createGain(); master.gain.value = 0.6; master.connect(A.destination); } catch (e) { enabled = false; } }
    function startEngine() { ensure(); if (!A || started) return; started = true; engFilter = A.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 700; engGain = A.createGain(); engGain.gain.value = 0; engOsc = A.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 60; engOsc2 = A.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 90; engOsc.connect(engFilter); engOsc2.connect(engFilter); engFilter.connect(engGain); engGain.connect(master); engOsc.start(); engOsc2.start(); }
    function stopEngine() { if (engGain) engGain.gain.setTargetAtTime(0.0001, A.currentTime, 0.05); }
    function engine(p, gas) { if (!A || !engOsc) return; const base = 55 + p * 240; engOsc.frequency.setTargetAtTime(base, A.currentTime, 0.06); engOsc2.frequency.setTargetAtTime(base * 1.5, A.currentTime, 0.06); engFilter.frequency.setTargetAtTime(500 + p * 2200, A.currentTime, 0.08); engGain.gain.setTargetAtTime(enabled ? (0.05 + p * 0.18) * (gas ? 1.2 : 0.85) : 0, A.currentTime, 0.1); }
    function blip(f, d, type, v, slide) { ensure(); if (!A || !enabled) return; const o = A.createOscillator(), g = A.createGain(); o.type = type || 'sine'; o.frequency.value = f; if (slide) o.frequency.exponentialRampToValueAtTime(slide, A.currentTime + d); g.gain.value = v || 0.2; g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + d); o.connect(g); g.connect(master); o.start(); o.stop(A.currentTime + d); }
    function coin() { blip(880, 0.08, 'triangle', 0.25); blip(1320, 0.12, 'triangle', 0.2); }
    function crash() { ensure(); if (!A || !enabled) return; const o = A.createOscillator(), g = A.createGain(); o.type = 'sawtooth'; o.frequency.value = 180; o.frequency.exponentialRampToValueAtTime(40, A.currentTime + 0.5); g.gain.value = 0.5; g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.5); const buf = A.createBuffer(1, A.sampleRate * 0.4, A.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const ns = A.createBufferSource(); ns.buffer = buf; const ng = A.createGain(); ng.gain.value = 0.4; ns.connect(ng); ng.connect(master); o.connect(g); g.connect(master); o.start(); o.stop(A.currentTime + 0.5); ns.start(); }
    function level() { blip(523, 0.1, 'square', 0.25); setTimeout(() => blip(784, 0.16, 'square', 0.25), 90); }
    function ui() { blip(440, 0.06, 'sine', 0.15, 660); }
    function flash() { blip(1200, 0.05, 'square', 0.12, 1800); }
    return { init: () => { ensure(); if (A && A.state === 'suspended') A.resume(); }, startEngine, stopEngine, engine, coin, crash, level, ui, flash, toggle: () => { enabled = !enabled; return enabled; } };
  })();

  // ----------------------------- HUD / Menü -----------------------------
  const overlay = document.getElementById('overlay');
  const gameover = document.getElementById('gameover');
  const touchControls = document.getElementById('touch-controls');
  const pauseBtn = document.getElementById('pause-btn');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const speedEl = document.getElementById('speed');
  const levelEl = document.getElementById('level');
  const swatchesEl = document.getElementById('swatches');
  if (bestEl) bestEl.textContent = best;

  if (swatchesEl) CAR_COLORS.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (i === 0 ? ' selected' : '');
    const hex = '#' + c.hex.toString(16).padStart(6, '0');
    s.style.background = `radial-gradient(circle at 35% 30%, ${hex}, #000)`;
    s.title = c.name;
    s.addEventListener('click', () => {
      player.chosen = i;
      document.querySelectorAll('.swatch').forEach((el, j) => el.classList.toggle('selected', j === i));
      player.model.userData.paint.color.setHex(c.hex);
    });
    swatchesEl.appendChild(s);
  });

  const pops = [];
  function pushPop(text) { pops.push({ text, t: 0 }); refreshPops(); }
  let popEl = null;
  function refreshPops() {
    if (!popEl) { popEl = document.createElement('div'); popEl.id = 'pop3d'; document.getElementById('game-shell').appendChild(popEl); }
  }

  document.getElementById('play-btn').addEventListener('click', startGame);
  document.getElementById('retry-btn').addEventListener('click', startGame);
  document.getElementById('menu-btn').addEventListener('click', toMenu);
  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
  const soundBtn = document.getElementById('sound-btn');
  if (soundBtn) soundBtn.addEventListener('click', () => { Audio.init(); const on = Audio.toggle(); document.getElementById('sound-on').classList.toggle('hidden', !on); document.getElementById('sound-off').classList.toggle('hidden', on); Audio.ui(); });

  function startGame() {
    level = 1; dist = 0; speedBoost = 1; trafficDensity = 1; score = 0;
    player.x = 0; player.lane = 1; player.speed = 0; player.steer = 0;
    player.model.userData.paint.color.setHex(CAR_COLORS[player.chosen].hex);
    spawnTraffic();
    for (const co of coins) { co.taken = false; co.model.visible = true; co.z = -40 - Math.random() * 200; co.lane = (Math.random() * LANES) | 0; co.model.position.x = laneX(co.lane); }
    state = State.PLAY;
    overlay.classList.add('hidden'); gameover.classList.add('hidden');
    if (touchControls) touchControls.classList.add('active');
    if (pauseBtn) pauseBtn.classList.remove('hidden');
    if (levelEl) levelEl.textContent = level;
    Audio.init(); Audio.startEngine(); Audio.ui();
  }
  function toMenu() {
    state = State.MENU; Audio.stopEngine();
    overlay.classList.remove('hidden'); gameover.classList.add('hidden');
    if (touchControls) touchControls.classList.remove('active');
    if (pauseBtn) pauseBtn.classList.add('hidden');
  }
  function gameOver() {
    state = State.OVER; Audio.stopEngine(); Audio.crash();
    if (score > best) { best = score; localStorage.setItem('ucar3d_best', Math.floor(best)); }
    document.getElementById('go-score').textContent = Math.floor(score);
    document.getElementById('go-best').textContent = Math.floor(best);
    if (bestEl) bestEl.textContent = Math.floor(best);
    gameover.classList.remove('hidden');
    if (touchControls) touchControls.classList.remove('active');
    if (pauseBtn) pauseBtn.classList.add('hidden');
  }
  function togglePause() {
    if (state === State.PLAY) { state = State.PAUSE; if (pauseBtn) pauseBtn.classList.add('hidden'); Audio.stopEngine(); }
    else if (state === State.PAUSE) { state = State.PLAY; if (pauseBtn) pauseBtn.classList.remove('hidden'); Audio.startEngine(); }
  }
  function advanceLevel() {
    level++; speedBoost = Math.min(1.8, 1 + (level - 1) * 0.1); trafficDensity = Math.min(2, 1 + (level - 1) * 0.16);
    if (levelEl) levelEl.textContent = level; Audio.level(); spawnTraffic();
  }

  // ----------------------------- Güncelleme -----------------------------
  function update(dt) {
    const effMax = MAX_SPEED * speedBoost;
    if (flashTimer > 0) flashTimer -= dt;
    if (flashCooldown > 0) flashCooldown -= dt;

    if (keys.gas) player.speed += effMax / 4 * dt;
    else if (keys.brake) player.speed -= effMax / 1.4 * dt;
    else player.speed -= effMax / 6 * dt;
    player.speed = Math.max(0, Math.min(player.speed, effMax));

    // şerit/yatay
    const steerSpeed = LANE_W * 1.4 * dt * (0.6 + 0.6 * player.speed / effMax);
    if (keys.left) player.x -= steerSpeed;
    if (keys.right) player.x += steerSpeed;
    const lim = ROAD_W / 2 - 0.9;
    player.x = Math.max(-lim - 1.4, Math.min(lim + 1.4, player.x));
    // yol dışı yavaşlama
    if (Math.abs(player.x) > lim) player.speed -= effMax / 1.6 * dt * 0.6;

    const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.steer += (steerInput - player.steer) * Math.min(1, dt * 9);

    const sp = player.speed;
    dist += sp * dt;
    if (dist > level * 3000) advanceLevel();
    score += sp * dt * 0.05;

    // yol dokusu kaydır
    roadTex.offset.y -= sp * dt / SEG_WORLD;

    // ağaçlar / coinler dünyayla birlikte yaklaşsın (+z)
    for (const tr of trees) {
      tr.z += sp * dt;
      if (tr.z > 25) { tr.z -= 22 * trees.length / 2 + Math.random() * 30; tr.model.position.x = (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 4 + Math.random() * 14); }
      tr.model.position.z = tr.z;
    }
    for (const co of coins) {
      co.z += sp * dt;
      if (co.z > 14) { co.z -= 30 * coins.length; co.taken = false; co.model.visible = true; co.lane = (Math.random() * LANES) | 0; co.model.position.x = laneX(co.lane); }
      co.model.position.z = co.z;
      co.model.rotation.z += dt * 4;
      if (!co.taken && Math.abs(co.z) < 1.8 && Math.abs(laneX(co.lane) - player.x) < 1.4) {
        co.taken = true; co.model.visible = false; score += 25; Audio.coin(); pushPop('+25');
      }
    }

    // trafik
    for (const car of traffic) {
      if (car.anger > 0) car.anger -= dt;
      const target = car.anger > 0 ? car.rageMax : car.cruise;
      const rate = (car.anger > 0 ? 0.9 : 0.4) * MAX_SPEED;
      car.spd += Math.sign(target - car.spd) * Math.min(Math.abs(target - car.spd), rate * dt);
      car.z += (sp - car.spd) * dt;
      // geçildi -> ileri taşı
      if (car.z > 22) { car.z = -200 - Math.random() * 120; car.lane = (Math.random() * LANES) | 0; car.anger = 0; car.spd = car.cruise; }
      if (car.z < -360) car.z = -200;
      car.model.position.set(laneX(car.lane), 0, car.z);
      // tekerlek dönüşü
      const roll = (sp - car.spd) * dt / 0.46;
      for (const wgrp of car.model.userData.wheels) wgrp.children[0].rotation.x += roll;
      // çarpışma
      if (Math.abs(car.z) < 3.6 && Math.abs(laneX(car.lane) - player.x) < 1.7 && sp > MAX_SPEED * 0.1) { gameOver(); }
    }

    // oyuncu model güncelle
    player.model.position.x = player.x;
    player.model.rotation.y = -player.steer * 0.12;
    player.model.rotation.z = -player.steer * 0.05;
    const wr = sp * dt / 0.46;
    for (const wgrp of player.model.userData.wheels) wgrp.children[0].rotation.x -= wr;
    // hafif zıplama
    player.model.position.y = Math.sin(dist * 0.5) * 0.02 * (sp / effMax);

    // fren stop parlaması
    player.model.userData.tailMat.emissiveIntensity = keys.brake ? 2.2 : 0.6;

    // selektör ışığı
    flashLight.position.x = player.x;
    flashLight.intensity = flashTimer > 0 ? (3.5 * (flashTimer / 0.4)) * (0.6 + 0.4 * Math.sin(performance.now() * 0.08)) : 0;

    // kamera takip
    camera.position.x += (player.x * 0.55 - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (4.3 - camera.position.y) * 0.1;
    camera.position.z = 9;
    camera.lookAt(player.x * 0.35, 1.4, -14);
    camera.rotation.z += (-player.steer * 0.03 - camera.rotation.z) * 0.1;
    sun.target.position.set(player.x, 0, -6); sun.position.set(player.x - 26, 40, 18);

    // motor sesi
    Audio.engine(sp / MAX_SPEED, keys.gas);

    // HUD
    if (scoreEl) scoreEl.textContent = Math.floor(score);
    if (speedEl) speedEl.innerHTML = Math.floor(sp / MAX_SPEED * 260) + '<small>km/s</small>';

    updatePops(dt);
  }

  // Menüde sahneyi canlı tut (yavaş ilerle)
  function idle(dt) {
    roadTex.offset.y -= 30 * dt / SEG_WORLD;
    for (const tr of trees) { tr.z += 30 * dt; if (tr.z > 25) tr.z -= 22 * trees.length / 2; tr.model.position.z = tr.z; }
    camera.position.x += (Math.sin(performance.now() * 0.0003) * 1.5 - camera.position.x) * 0.02;
    camera.lookAt(0, 1.4, -14);
    player.model.position.x = 0;
  }

  function updatePops(dt) {
    if (!popEl) return;
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.8) pops.splice(i, 1); }
    if (pops.length) { const p = pops[pops.length - 1]; popEl.textContent = p.text; popEl.style.opacity = String(Math.max(0, 1 - p.t / 0.8)); popEl.style.transform = `translate(-50%,-50%) translateY(${-p.t * 60}px)`; }
    else popEl.style.opacity = '0';
  }

  // ----------------------------- Döngü -----------------------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    if (state === State.PLAY) update(dt);
    else if (state === State.MENU) idle(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
