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
  renderer.setClearColor(0x0d1430, 1);

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#bfe0f5');
  scene.fog = new THREE.Fog(HORIZON, 70, 430);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  camera.position.set(0, 4.3, 9);

  // Gökyüzü: zamanla renk değiştiren shader gök kubbe (gradyan)
  const skyUniforms = {
    topColor: { value: new THREE.Color('#1e4f9e') },
    bottomColor: { value: new THREE.Color('#bfe0f5') },
    exponent: { value: 0.7 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 14),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; uniform float exponent; varying vec3 vP; void main(){ float h = normalize(vP).y; float t = pow(max(h,0.0), exponent); gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0); }'
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Yıldızlar (gece görünür)
  const starGeo = new THREE.BufferGeometry();
  const starArr = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const u = Math.random(), v = Math.random() * 0.5;   // üst yarıküre
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const r = 850;
    starArr[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starArr[i * 3 + 1] = r * Math.cos(ph);
    starArr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

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

  // ----------------------------- Çevre: gece-gündüz + hava -----------------------------
  // HUD saat & hava kartları
  let clockEl = null, wxEl = null;
  {
    const hudEl = document.getElementById('hud');
    if (hudEl) {
      const c1 = document.createElement('div'); c1.className = 'hud-card';
      c1.innerHTML = '<span class="hud-label">SAAT</span><span class="hud-value" id="clock">--:--</span>';
      hudEl.appendChild(c1); clockEl = c1.querySelector('#clock');
      const c2 = document.createElement('div'); c2.className = 'hud-card';
      c2.innerHTML = '<span class="hud-label">HAVA</span><span class="hud-value" id="wx">☀️</span>';
      hudEl.appendChild(c2); wxEl = c2.querySelector('#wx');
    }
  }

  const ENV = (function () {
    const KEYS = [
      { h: 0,  top: '#070b1a', bot: '#0d1430', sun: '#3a4a7a', sunI: 0.04, hemiI: 0.16, hs: '#10182f', hg: '#0a0f08', fog: '#0d1430', night: 1 },
      { h: 5,  top: '#13204a', bot: '#33507e', sun: '#6a6a9a', sunI: 0.20, hemiI: 0.32, hs: '#2a3552', hg: '#16180f', fog: '#33507e', night: 0.82 },
      { h: 7,  top: '#3a5a9e', bot: '#f0b888', sun: '#ffd0a0', sunI: 1.00, hemiI: 0.70, hs: '#a8bcdc', hg: '#3a4a30', fog: '#f0c098', night: 0.2 },
      { h: 12, top: '#1e4f9e', bot: '#bfe0f5', sun: '#fff1d8', sunI: 1.70, hemiI: 0.95, hs: '#bfe0f5', hg: '#3a6b39', fog: '#bfe0f5', night: 0 },
      { h: 17, top: '#235a9e', bot: '#cfe2ec', sun: '#ffe6c0', sunI: 1.40, hemiI: 0.85, hs: '#cfe2ec', hg: '#3a6b39', fog: '#cfe2ec', night: 0 },
      { h: 19, top: '#2a3f8e', bot: '#f0a060', sun: '#ff8a40', sunI: 0.90, hemiI: 0.60, hs: '#caa0a0', hg: '#34402c', fog: '#e88a60', night: 0.3 },
      { h: 21, top: '#101a3a', bot: '#2a2444', sun: '#5a4a8a', sunI: 0.18, hemiI: 0.30, hs: '#241f3a', hg: '#0f0f10', fog: '#241f3a', night: 0.85 },
      { h: 24, top: '#070b1a', bot: '#0d1430', sun: '#3a4a7a', sunI: 0.04, hemiI: 0.16, hs: '#10182f', hg: '#0a0f08', fog: '#0d1430', night: 1 }
    ];
    const top = new THREE.Color(), bot = new THREE.Color(), sunC = new THREE.Color(), hsC = new THREE.Color(), hgC = new THREE.Color(), fogC = new THREE.Color();
    const A = new THREE.Color();
    const cur = { sunI: 1, hemiI: 0.9, night: 0 };
    function sample(h) {
      let i = 0; while (i < KEYS.length - 1 && h >= KEYS[i + 1].h) i++;
      const k0 = KEYS[i], k1 = KEYS[Math.min(i + 1, KEYS.length - 1)];
      const span = (k1.h - k0.h) || 1, t = Math.min(1, Math.max(0, (h - k0.h) / span));
      top.set(k0.top).lerp(A.set(k1.top), t);
      bot.set(k0.bot).lerp(A.set(k1.bot), t);
      sunC.set(k0.sun).lerp(A.set(k1.sun), t);
      hsC.set(k0.hs).lerp(A.set(k1.hs), t);
      hgC.set(k0.hg).lerp(A.set(k1.hg), t);
      fogC.set(k0.fog).lerp(A.set(k1.fog), t);
      cur.sunI = k0.sunI + (k1.sunI - k0.sunI) * t;
      cur.hemiI = k0.hemiI + (k1.hemiI - k0.hemiI) * t;
      cur.night = k0.night + (k1.night - k0.night) * t;
    }

    let tod = Math.random() * 24;        // rastgele başlangıç saati
    const DAY_LEN = 360;                 // tam gün ~6 dk (kademeli)
    const weather = { wet: 0, target: 0, timer: 12 + Math.random() * 15 };

    // Yağmur (eğik çizgiler)
    const RN = 420, rainPos = new Float32Array(RN * 2 * 3), drop = [];
    for (let i = 0; i < RN; i++) drop.push({ x: (Math.random() - 0.5) * 60, y: Math.random() * 42, z: -50 + Math.random() * 64, v: 40 + Math.random() * 24 });
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd2ec, transparent: true, opacity: 0, fog: false });
    const rainObj = new THREE.LineSegments(rainGeo, rainMat); rainObj.frustumCulled = false; scene.add(rainObj);
    function updateRain(dt) {
      if (weather.wet < 0.03) { rainObj.visible = false; return; }
      rainObj.visible = true; rainMat.opacity = weather.wet * 0.6;
      rainObj.position.set(camera.position.x, 0, camera.position.z);
      for (let i = 0; i < RN; i++) {
        const d = drop[i]; d.y -= d.v * dt; if (d.y < 0) { d.y = 42; d.x = (Math.random() - 0.5) * 60; d.z = -50 + Math.random() * 64; }
        const o = i * 6;
        rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
        rainPos[o + 3] = d.x + 1.2; rainPos[o + 4] = d.y - 2.6; rainPos[o + 5] = d.z;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // Gece farı
    const headlight = new THREE.SpotLight(0xfff0d0, 0, 80, Math.PI / 5, 0.5, 1.2);
    scene.add(headlight); scene.add(headlight.target);

    function update(dt) {
      tod = (tod + dt * 24 / DAY_LEN) % 24;
      weather.timer -= dt;
      if (weather.timer <= 0) { weather.target = Math.random() < 0.4 ? 1 : 0; weather.timer = 25 + Math.random() * 40; }
      weather.wet += (weather.target - weather.wet) * Math.min(1, dt * 0.25);
      const wet = weather.wet, cloud = 1 - wet * 0.45;
      sample(tod);

      skyUniforms.topColor.value.copy(top).multiplyScalar(cloud);
      skyUniforms.bottomColor.value.copy(bot).multiplyScalar(cloud);
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      starMat.opacity = cur.night * (1 - wet) * 0.9;

      sun.color.copy(sunC); sun.intensity = cur.sunI * cloud;
      hemi.color.copy(hsC); hemi.groundColor.copy(hgC); hemi.intensity = cur.hemiI * cloud;
      const px = player.model ? player.model.position.x : 0;
      const elev = Math.sin((tod - 6) / 12 * Math.PI), az = (tod - 6) / 12 * Math.PI;
      sun.position.set(px + Math.cos(az) * -44, Math.max(3, elev * 60 + 6), 18 + Math.sin(az) * 10);

      scene.fog.color.copy(fogC).multiplyScalar(cloud);
      scene.fog.near = 60;
      scene.fog.far = 430 - cur.night * 120 - wet * 150;

      const dark = Math.max(cur.night, wet * 0.4);
      headlight.intensity = dark * 5.5;
      headlight.position.set(px, 1.4, -1);
      headlight.target.position.set(px, 0.2, -24);

      if (typeof roadRibbon !== 'undefined' && roadRibbon) {
        roadRibbon.material.color.setScalar(1 - wet * 0.32);
        roadRibbon.material.roughness = 0.85 - wet * 0.4;
      }
      Audio.rain(wet);

      if (clockEl) { const hh = Math.floor(tod), mm = Math.floor((tod % 1) * 60); clockEl.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
      if (wxEl) wxEl.textContent = wet > 0.5 ? '🌧️' : (cur.night > 0.6 ? '🌙' : (cur.night > 0.25 ? '🌆' : '☀️'));

      updateRain(dt);
    }
    function reset() { tod = Math.random() * 24; weather.wet = 0; weather.target = 0; weather.timer = 12 + Math.random() * 15; }
    return { update, reset };
  })();

  // ----------------------------- Yol -----------------------------
  const LANES = 3;
  const LANE_W = 3.4;
  const ROAD_W = LANE_W * LANES;          // asfalt genişliği
  const ROAD_LEN = 640;
  const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;  // şerit merkez x

  // ---- Viraj & yokuş eğrileri: mesafeye göre yatay (offX) / dikey (offY) ofset ----
  // Oyuncu hep dünya merkezinde; yol etrafında kıvrılıp alçalır/yükselir.
  const CURVE_AMP = 17, HILL_AMP = 6;
  function curveX(s) { return CURVE_AMP * (Math.sin(s * 0.0021) + 0.45 * Math.sin(s * 0.00105 + 1.3)); }
  function hillY(s) { return HILL_AMP * (Math.sin(s * 0.0016) + 0.55 * Math.sin(s * 0.00072 + 0.7)); }
  function offX(z) { return curveX(dist - z) - curveX(dist); }
  function offY(z) { return hillY(dist - z) - hillY(dist); }

  const SEG_WORLD = 16;                    // bir doku tekrarının dünya uzunluğu
  const RIBBON_Z0 = 26, RIBBON_Z1 = -486;  // şeridin yakın/uzak ucu (viewZ)

  // Bükülen şerit: düz geometri kur, her kare vertexleri eğriye göre kaydır
  function buildRibbon(width, mat, yBase, lenSegs) {
    const geo = new THREE.PlaneGeometry(width, RIBBON_Z0 - RIBBON_Z1, 1, lenSegs);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (RIBBON_Z0 + RIBBON_Z1) / 2);
    const pos = geo.attributes.position;
    const baseX = new Float32Array(pos.count), baseZ = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { baseX[i] = pos.getX(i); baseZ[i] = pos.getZ(i); }
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
    mesh.userData = { baseX, baseZ, yBase };
    scene.add(mesh); return mesh;
  }
  function updateRibbon(mesh) {
    const u = mesh.userData, pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const z = u.baseZ[i]; pos.setX(i, u.baseX[i] + offX(z)); pos.setY(i, u.yBase + offY(z)); }
    pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
  }

  // Çimen + yol şeritleri
  const grassRibbon = buildRibbon(240, new THREE.MeshStandardMaterial({ color: 0x4aa84f, roughness: 1 }), -0.02, 48);
  const roadTex = makeRoadTexture();
  roadTex.wrapS = THREE.ClampToEdgeWrapping; roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1, (RIBBON_Z0 - RIBBON_Z1) / SEG_WORLD);
  const roadRibbon = buildRibbon(ROAD_W + 1.6, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }), 0.02, 96);
  function updateRibbons() { updateRibbon(grassRibbon); updateRibbon(roadRibbon); }

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

  // BMW tarzı beyaz sedan (klasik 3-box, böbrek ızgara, yuvarlak farlar)
  function buildSedan(colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.45, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0.3, roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x202d38, metalness: 0.5, roughness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd6dbe2, metalness: 0.95, roughness: 0.2 });
    const head = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, metalness: 0.6, roughness: 0.2, emissive: 0x223044, emissiveIntensity: 0.5 });

    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }

    // 3-box gövde (uzun, dik)
    box(1.94, 0.64, 4.78, paint, 0, 0.68, 0);          // alt gövde
    box(1.9, 0.32, 4.5, paint, 0, 1.02, 0);            // omuz şeridi
    box(1.66, 0.74, 2.55, paint, 0, 1.46, -0.05);      // kabin (dik greenhouse)
    // camlar (geniş, dik)
    box(1.52, 0.62, 0.1, glass, 0, 1.49, -1.33);       // ön cam (ön = -z)
    box(1.52, 0.56, 0.1, glass, 0, 1.49, 1.2);         // arka cam
    box(0.1, 0.5, 2.15, glass, 0.82, 1.5, -0.05);
    box(0.1, 0.5, 2.15, glass, -0.82, 1.5, -0.05);
    // bagaj dudağı
    box(1.7, 0.07, 0.22, paint, 0, 1.1, 2.32);

    // --- ön: BMW böbrek ızgara + farlar ---
    box(0.94, 0.36, 0.05, chrome, 0, 0.78, -2.37);     // ızgara çerçevesi
    box(0.34, 0.3, 0.07, dark, -0.21, 0.78, -2.41);    // sol böbrek
    box(0.34, 0.3, 0.07, dark, 0.21, 0.78, -2.41);     // sağ böbrek
    box(0.66, 0.2, 0.06, head, 0.66, 0.86, -2.38);     // sağ far
    box(0.66, 0.2, 0.06, head, -0.66, 0.86, -2.38);    // sol far
    box(1.5, 0.16, 0.05, dark, 0, 0.44, -2.39);        // ön tampon girişi

    // --- arka: klasik köşe stop lambaları ---
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xd61f1f, emissive: 0xc01010, emissiveIntensity: 0.55 });
    box(0.6, 0.26, 0.06, tailMat, 0.66, 0.94, 2.39);
    box(0.6, 0.26, 0.06, tailMat, -0.66, 0.94, 2.39);
    box(1.5, 0.16, 0.05, dark, 0, 0.46, 2.39);         // arka tampon
    // çift egzoz
    box(0.18, 0.16, 0.1, dark, 0.6, 0.36, 2.42);
    box(0.18, 0.16, 0.1, dark, -0.6, 0.36, 2.42);

    // kaput rozeti (roundel)
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a6cc4, metalness: 0.7, roughness: 0.3 }));
    badge.rotation.x = Math.PI / 2; badge.position.set(0, 1.0, -2.05); g.add(badge);

    // tekerlekler (uzun aks)
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 18); wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd3, metalness: 0.9, roughness: 0.28 });
    const wheels = [];
    for (const [wx, wz] of [[0.99, 1.55], [-0.99, 1.55], [0.99, -1.55], [-0.99, -1.55]]) {
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
  const State = { MENU: 0, PLAY: 1, OVER: 2, PAUSE: 3, CRASH: 4 };
  let state = State.MENU;

  const CAR_COLORS = [
    { hex: 0xe63946, name: 'Kırmızı' }, { hex: 0x2d7dd2, name: 'Mavi' },
    { hex: 0xf4a300, name: 'Sarı' }, { hex: 0x2a9d8f, name: 'Yeşil' },
    { hex: 0xe9ecef, name: 'Beyaz' }, { hex: 0x33373e, name: 'Siyah' }
  ];
  const TRAFFIC_HEX = [0xd65a31, 0x3066be, 0x4caf50, 0x9b5de5, 0xf9c74f, 0x577590, 0xbcc0c4, 0x2b2d34];

  const MAX_SPEED = 95;          // birim/sn (~ görsel hız)
  const player = { x: 0, lane: 1, speed: 0, chosen: 0, steer: 0, model: null, modelType: 0 };
  const BUILDERS = [buildCar, buildSedan];

  let score = 0, best = Number(localStorage.getItem('ucar3d_best') || 0);
  let level = 1, dist = 0, speedBoost = 1, trafficDensity = 1;
  let flashTimer = 0, flashCooldown = 0;
  const sun_dummy = 0;

  // Oyuncu arabası (model değiştirilebilir)
  function rebuildPlayer() {
    const oldX = player.model ? player.model.position.x : 0;
    if (player.model) scene.remove(player.model);
    player.model = BUILDERS[player.modelType](CAR_COLORS[player.chosen].hex);
    player.model.position.x = oldX;
    scene.add(player.model);
  }
  rebuildPlayer();

  // Trafik havuzu
  const traffic = [];
  const CAR_LEN = 4.3;
  const MIN_GAP = CAR_LEN + 1.6;   // aynı şeritte iki araç arası min. mesafe
  function spawnTraffic() {
    for (const t of traffic) scene.remove(t.model);
    traffic.length = 0;
    const n = Math.round(7 * trafficDensity);
    const laneNext = [-50, -50, -50];   // her şeritte bir sonraki boş z
    for (let i = 0; i < n; i++) {
      const hex = TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0];
      const m = buildCar(hex);
      scene.add(m);
      const lane = i % LANES;                       // şeritlere sırayla dağıt
      const z = laneNext[lane] - Math.random() * 30;
      laneNext[lane] = z - (40 + Math.random() * 50);
      const car = { model: m, lane, z,
        cruise: MAX_SPEED * (0.32 + Math.random() * 0.22), spd: 0, rageMax: MAX_SPEED * (0.6 + Math.random() * 0.18), anger: 0 };
      car.spd = car.cruise;
      car.model.position.set(laneX(car.lane), 0, car.z);
      traffic.push(car);
    }
  }
  // Geçilen aracı ileri (uzağa) taşı: yeni şeritteki en öndeki aracın da ilerisine koy
  function recycleTraffic(car) {
    car.lane = (Math.random() * LANES) | 0;
    let frontMost = -180;
    for (const o of traffic) if (o !== car && o.lane === car.lane) frontMost = Math.min(frontMost, o.z);
    car.z = frontMost - (MIN_GAP + 30 + Math.random() * 100);
    car.anger = 0; car.spd = car.cruise;
    car.cruise = MAX_SPEED * (0.32 + Math.random() * 0.22);
    car.rageMax = MAX_SPEED * (0.6 + Math.random() * 0.18);
    car.model.userData.paint.color.setHex(TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0]);
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
      case 'h': case 'H': if (state === State.PLAY) Audio.horn(); break;
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
    if (any) { pushPop('SELEKTÖR!'); Audio.horn(); }   // sinirlenen trafik korna çalar
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
    function horn() {
      ensure(); if (!A || !enabled) return;
      const dur = 0.55;
      [330, 415].forEach((f) => {            // iki tonlu klasik korna
        const o = A.createOscillator(), g = A.createGain();
        o.type = 'sawtooth'; o.frequency.value = f;
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.2, A.currentTime + 0.03);
        g.gain.setValueAtTime(0.2, A.currentTime + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + dur);
        const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
        o.connect(lp); lp.connect(g); g.connect(master); o.start(); o.stop(A.currentTime + dur);
      });
    }
    let rainSrc = null, rainGain = null;
    function rain(level) {
      ensure(); if (!A) return;
      if (!rainSrc) {
        const buf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        rainSrc = A.createBufferSource(); rainSrc.buffer = buf; rainSrc.loop = true;
        const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
        rainGain = A.createGain(); rainGain.gain.value = 0;
        rainSrc.connect(bp); bp.connect(rainGain); rainGain.connect(master); rainSrc.start();
      }
      rainGain.gain.setTargetAtTime(enabled ? level * 0.16 : 0, A.currentTime, 0.4);
    }
    return { init: () => { ensure(); if (A && A.state === 'suspended') A.resume(); }, startEngine, stopEngine, engine, coin, crash, level, ui, flash, horn, rain, toggle: () => { enabled = !enabled; return enabled; } };
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

  // Model seçici (Spor Coupe / BMW Sedan)
  function selectSwatch(i) { player.chosen = i; document.querySelectorAll('.swatch').forEach((el, j) => el.classList.toggle('selected', j === i)); }
  document.querySelectorAll('.model-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      player.modelType = +btn.dataset.model;
      document.querySelectorAll('.model-btn').forEach((b) => b.classList.toggle('selected', b === btn));
      if (player.modelType === 1) selectSwatch(4);   // BMW => beyaz varsayılan
      rebuildPlayer();
      Audio.init(); Audio.ui();
    });
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
    player.model.rotation.set(0, 0, 0); player.model.position.y = 0;
    ENV.reset();
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
    state = State.OVER; Audio.stopEngine();
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

  // ----------------------------- Çarpışma efekti -----------------------------
  const crash = { timer: 0, shake: 0, vy: 0, rx: 0, rz: 0, worldSpd: 0, ended: false };
  const debris = [];   // { m, vx, vy, vz, rx, ry, rz, life, max, ground }
  const smoke = [];    // { m, vy, grow, life, max }
  const debrisGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const shardGeo = new THREE.TetrahedronGeometry(0.32);
  const smokeGeo = new THREE.SphereGeometry(0.7, 8, 8);

  // ekran flaşı (DOM)
  let flashDiv = document.getElementById('crash-flash');
  if (!flashDiv) {
    flashDiv = document.createElement('div');
    flashDiv.id = 'crash-flash';
    document.getElementById('game-shell').appendChild(flashDiv);
  }

  function explode(px) {
    const colorHex = CAR_COLORS[player.chosen].hex;
    for (let i = 0; i < 34; i++) {
      const kind = i % 3;  // 0: kıvılcım, 1: gövde parçası, 2: koyu parça
      let mat, geo;
      if (kind === 0) { mat = new THREE.MeshStandardMaterial({ color: 0xffc24a, emissive: 0xff7a10, emissiveIntensity: 2.4 }); geo = debrisGeo; }
      else { mat = new THREE.MeshStandardMaterial({ color: kind === 1 ? colorHex : 0x23262c, metalness: 0.55, roughness: 0.5 }); geo = i % 2 ? shardGeo : debrisGeo; }
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(kind === 0 ? 0.35 + Math.random() * 0.3 : 0.5 + Math.random() * 0.9);
      m.position.set(px + (Math.random() - 0.5) * 1.4, 1.0 + Math.random() * 0.7, 0.4 + (Math.random() - 0.5) * 1.2);
      m.castShadow = kind !== 0;
      scene.add(m);
      const ang = Math.random() * Math.PI * 2, spd = 4 + Math.random() * 11;
      debris.push({ m, vx: Math.cos(ang) * spd * 0.55, vy: 5 + Math.random() * 10, vz: Math.sin(ang) * spd * 0.4 + 2.5,
        rx: (Math.random() - 0.5) * 14, ry: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14, life: 0, max: 1.1 + Math.random() * 0.7 });
    }
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a4d52, transparent: true, opacity: 0.72 });
      const m = new THREE.Mesh(smokeGeo, mat);
      m.position.set(px + (Math.random() - 0.5) * 1.6, 1 + Math.random() * 0.6, 0.4 + (Math.random() - 0.5) * 1.4);
      scene.add(m);
      smoke.push({ m, vy: 1.4 + Math.random() * 2.2, grow: 1.2 + Math.random() * 1.4, life: 0, max: 1.3 + Math.random() * 0.6 });
    }
  }

  function doCrash() {
    if (state === State.CRASH || state === State.OVER) return;
    state = State.CRASH;
    crash.timer = 1.4; crash.shake = 1.0; crash.ended = false;
    crash.worldSpd = player.speed;
    crash.vy = 7 + player.speed / MAX_SPEED * 5;          // araba havalanır
    crash.rx = (Math.random() - 0.5) * 6; crash.rz = (Math.random() - 0.5) * 7;
    explode(player.x);
    Audio.stopEngine(); Audio.crash(); Audio.horn();
    if (flashDiv) { flashDiv.style.transition = 'none'; flashDiv.style.opacity = '0.9'; requestAnimationFrame(() => { flashDiv.style.transition = 'opacity .5s ease-out'; flashDiv.style.opacity = '0'; }); }
    if (touchControls) touchControls.classList.remove('active');
    if (pauseBtn) pauseBtn.classList.add('hidden');
  }

  function updateCrash(dt) {
    crash.timer -= dt;
    crash.shake *= Math.pow(0.02, dt);   // ~0.92/16ms civarı sönüm
    // dünya yavaşlayarak dursun
    crash.worldSpd *= Math.pow(0.06, dt);
    const ws = crash.worldSpd;
    roadTex.offset.y -= ws * dt / SEG_WORLD;
    for (const tr of trees) { tr.z += ws * dt; if (tr.z > 25) tr.z -= 22 * trees.length / 2; tr.model.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z); }

    // oyuncu arabası savrulur
    crash.vy -= 24 * dt;
    player.model.position.y += crash.vy * dt;
    if (player.model.position.y < 0.15) { player.model.position.y = 0.15; crash.vy *= -0.35; crash.rx *= 0.6; }
    player.model.rotation.x += crash.rx * dt;
    player.model.rotation.z += crash.rz * dt;
    player.model.rotation.y += crash.rz * 0.3 * dt;

    // parçacık fiziği
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.life += dt; d.vy -= 24 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      if (d.m.position.y < 0.16) { d.m.position.y = 0.16; d.vy *= -0.4; d.vx *= 0.7; d.vz *= 0.7; }
      d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt; d.m.rotation.z += d.rz * dt;
      if (d.life > d.max) { scene.remove(d.m); d.m.material.dispose(); debris.splice(i, 1); }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i]; s.life += dt; s.m.position.y += s.vy * dt;
      s.m.scale.setScalar(1 + s.life * s.grow); s.m.material.opacity = 0.72 * Math.max(0, 1 - s.life / s.max);
      if (s.life > s.max) { scene.remove(s.m); s.m.material.dispose(); smoke.splice(i, 1); }
    }

    // kamera: çarpışmaya bak + sarsıntı
    camera.position.x += (player.x * 0.4 - camera.position.x) * 0.06;
    camera.position.z += (10.5 - camera.position.z) * 0.05;
    camera.lookAt(player.x, 1.2, -2);
    const sh = crash.shake * 0.6;
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y = 4.3 + (Math.random() - 0.5) * sh;
    camera.rotation.z += (Math.random() - 0.5) * sh * 0.04;

    ENV.update(dt);

    if (crash.timer <= 0 && !crash.ended) {
      crash.ended = true;
      // kalan parçacıkları temizle
      for (const d of debris) { scene.remove(d.m); d.m.material.dispose(); }
      for (const s of smoke) { scene.remove(s.m); s.m.material.dispose(); }
      debris.length = 0; smoke.length = 0;
      player.model.rotation.set(0, 0, 0); player.model.position.y = 0;
      gameOver();
    }
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

    // yol dokusu kaydır + yolu/çimeni eğriye göre büker
    roadTex.offset.y -= sp * dt / SEG_WORLD;
    updateRibbons();

    // ağaçlar / coinler dünyayla birlikte yaklaşsın (+z), eğriyi takip eder
    for (const tr of trees) {
      tr.z += sp * dt;
      if (tr.z > 25) { tr.z -= 22 * trees.length / 2 + Math.random() * 30; tr.x = (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 4 + Math.random() * 14); }
      tr.model.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z);
    }
    for (const co of coins) {
      co.z += sp * dt;
      if (co.z > 14) { co.z -= 30 * coins.length; co.taken = false; co.model.visible = true; co.lane = (Math.random() * LANES) | 0; }
      co.model.position.set(laneX(co.lane) + offX(co.z), 1.1 + offY(co.z), co.z);
      co.model.rotation.z += dt * 4;
      if (!co.taken && Math.abs(co.z) < 1.8 && Math.abs(laneX(co.lane) - player.x) < 1.4) {
        co.taken = true; co.model.visible = false; score += 25; Audio.coin(); pushPop('+25');
      }
    }

    // trafik — 1) hareket
    for (const car of traffic) {
      if (car.anger > 0) car.anger -= dt;
      const target = car.anger > 0 ? car.rageMax : car.cruise;
      const rate = (car.anger > 0 ? 0.9 : 0.4) * MAX_SPEED;
      car.spd += Math.sign(target - car.spd) * Math.min(Math.abs(target - car.spd), rate * dt);
      car.z += (sp - car.spd) * dt;
      if (car.z > 24) recycleTraffic(car);     // geçildi -> ileri taşı
      if (car.z < -400) car.z = -220;
    }
    // trafik — 2) araç-takip: aynı şeritte min. mesafeyi koru (içiçe geçmeyi önler)
    for (let ln = 0; ln < LANES; ln++) {
      const arr = traffic.filter((c) => c.lane === ln).sort((a, b) => a.z - b.z); // önden (en -z) arkaya
      for (let i = 1; i < arr.length; i++) {
        const front = arr[i - 1], back = arr[i];
        const minZ = front.z + MIN_GAP;
        if (back.z < minZ) {                    // çok yaklaştı -> geri it ve öne uydur
          back.z = minZ;
          if (back.spd > front.spd) back.spd = front.spd;
        }
      }
    }
    // trafik — 3) modeli yerleştir, teker, çarpışma
    for (const car of traffic) {
      car.model.position.set(laneX(car.lane) + offX(car.z), offY(car.z), car.z);
      car.model.rotation.y = -Math.atan2(offX(car.z - 4) - offX(car.z), 4);  // viraja göre yönelim
      const roll = (sp - car.spd) * dt / 0.46;
      for (const wgrp of car.model.userData.wheels) wgrp.children[0].rotation.x += roll;
      if (Math.abs(car.z) < 3.6 && Math.abs(laneX(car.lane) - player.x) < 1.7 && sp > MAX_SPEED * 0.1) { doCrash(); break; }
    }

    // oyuncu model güncelle
    const bank = Math.atan2(offX(-8), 8);      // viraj eğimi
    const pitch = Math.atan2(offY(-5), 5);     // yokuş eğimi
    player.model.position.x = player.x;
    player.model.rotation.y = -player.steer * 0.12 - bank * 0.5;
    player.model.rotation.z = -player.steer * 0.05 - bank * 0.3;
    player.model.rotation.x = -pitch * 0.8;
    const wr = sp * dt / 0.46;
    for (const wgrp of player.model.userData.wheels) wgrp.children[0].rotation.x -= wr;
    // hafif zıplama
    player.model.position.y = Math.sin(dist * 0.5) * 0.02 * (sp / effMax);

    // fren stop parlaması
    player.model.userData.tailMat.emissiveIntensity = keys.brake ? 2.2 : 0.6;

    // selektör ışığı
    flashLight.position.x = player.x;
    flashLight.intensity = flashTimer > 0 ? (3.5 * (flashTimer / 0.4)) * (0.6 + 0.4 * Math.sin(performance.now() * 0.08)) : 0;

    // kamera takip (viraj ve yokuşa göre yönelir)
    camera.position.x += ((player.x * 0.5 + offX(9) * 0.6) - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += ((4.3 + offY(9)) - camera.position.y) * 0.12;
    camera.position.z = 9;
    camera.lookAt(player.x * 0.3 + offX(-16), 1.5 + offY(-16) * 0.9, -16);
    camera.rotation.z += ((-player.steer * 0.03 - Math.atan2(offX(-20), 20) * 0.25) - camera.rotation.z) * 0.1;
    sun.target.position.set(player.x, 0, -6); sun.position.set(player.x - 26, 40, 18);

    // motor sesi
    Audio.engine(sp / MAX_SPEED, keys.gas);

    // HUD
    if (scoreEl) scoreEl.textContent = Math.floor(score);
    if (speedEl) speedEl.innerHTML = Math.floor(sp / MAX_SPEED * 260) + '<small>km/s</small>';

    updatePops(dt);
    ENV.update(dt);
  }

  // Menüde sahneyi canlı tut (yavaş ilerle)
  function idle(dt) {
    dist += 30 * dt;
    roadTex.offset.y -= 30 * dt / SEG_WORLD;
    updateRibbons();
    for (const tr of trees) { tr.z += 30 * dt; if (tr.z > 25) tr.z -= 22 * trees.length / 2; tr.model.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z); }
    for (const co of coins) { co.model.position.set(laneX(co.lane) + offX(co.z), 1.1 + offY(co.z), co.z); co.model.rotation.z += dt * 3; }
    camera.position.x += ((offX(9) * 0.6) - camera.position.x) * 0.04;
    camera.position.y += ((4.3 + offY(9)) - camera.position.y) * 0.06;
    camera.lookAt(offX(-16), 1.5 + offY(-16) * 0.9, -16);
    player.model.position.set(0, 0, 0); player.model.rotation.set(0, 0, 0);
    ENV.update(dt);
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
    else if (state === State.CRASH) updateCrash(dt);
    else if (state === State.MENU) idle(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
