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
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);   // taban: hiçbir şey saf siyah olmasın
  scene.add(ambient);
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
      { h: 0,  top: '#0c1430', bot: '#16204a', sun: '#4a5a9a', sunI: 0.06, hemiI: 0.40, hs: '#2a3760', hg: '#171c2c', fog: '#16204a', night: 1 },
      { h: 5,  top: '#16285a', bot: '#3a5a8e', sun: '#7a7aaa', sunI: 0.25, hemiI: 0.50, hs: '#3a4a70', hg: '#1c1f18', fog: '#3a5a8e', night: 0.82 },
      { h: 7,  top: '#3a5a9e', bot: '#f0b888', sun: '#ffd0a0', sunI: 1.00, hemiI: 0.75, hs: '#a8bcdc', hg: '#3a4a30', fog: '#f0c098', night: 0.2 },
      { h: 12, top: '#1e4f9e', bot: '#bfe0f5', sun: '#fff1d8', sunI: 1.70, hemiI: 0.95, hs: '#bfe0f5', hg: '#3a6b39', fog: '#bfe0f5', night: 0 },
      { h: 17, top: '#235a9e', bot: '#cfe2ec', sun: '#ffe6c0', sunI: 1.40, hemiI: 0.85, hs: '#cfe2ec', hg: '#3a6b39', fog: '#cfe2ec', night: 0 },
      { h: 19, top: '#2a3f8e', bot: '#f0a060', sun: '#ff8a40', sunI: 0.90, hemiI: 0.62, hs: '#caa0a0', hg: '#34402c', fog: '#e88a60', night: 0.3 },
      { h: 21, top: '#142150', bot: '#33274e', sun: '#7a5aaa', sunI: 0.22, hemiI: 0.48, hs: '#352d52', hg: '#16161a', fog: '#33274e', night: 0.85 },
      { h: 24, top: '#0c1430', bot: '#16204a', sun: '#4a5a9a', sunI: 0.06, hemiI: 0.40, hs: '#2a3760', hg: '#171c2c', fog: '#16204a', night: 1 }
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

    // Gece farı + arabayı görünür kılan yumuşak dolgu ışığı
    const headlight = new THREE.SpotLight(0xfff0d0, 0, 90, Math.PI / 4.2, 0.45, 1.1);
    scene.add(headlight); scene.add(headlight.target);
    const rearFill = new THREE.PointLight(0xbcd0ff, 0, 26, 1.4);   // kameranın yanında, arabanın arkasını aydınlatır
    scene.add(rearFill);

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
      const beam = player.highBeam;                  // uzun far basılı mı
      ambient.intensity = 0.12 + dark * 0.22;        // gece tabanı yükselir (araba görünür)
      headlight.intensity = dark * (beam ? 22 : 12) + (beam ? 2.5 : 0);  // uzun farda daha parlak
      headlight.angle = beam ? Math.PI / 5.2 : Math.PI / 4.2;            // uzun far daha odaklı
      headlight.position.set(px, 1.5, -1.6);
      headlight.target.position.set(px, beam ? 0.5 : 0.2, beam ? -55 : -26);  // uzun far daha uzağa
      rearFill.intensity = dark * 6;
      rearFill.position.set(px, 5, camera.position.z - 1);

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
  // Kısa dalga boyu = hız 95'te birkaç saniyede bir belirgin viraj/tepe (hissedilir eğim).
  const CURVE_AMP = 16, HILL_AMP = 8;
  let curveMul = 1, hillMul = 1;   // bölgeye göre yumuşatılan viraj/yokuş şiddeti
  function curveX(s) { return CURVE_AMP * (Math.sin(s * 0.0042) + 0.4 * Math.sin(s * 0.0091 + 1.3)); }
  function hillY(s) { return HILL_AMP * (Math.sin(s * 0.0072) + 0.4 * Math.sin(s * 0.015 + 0.7)); }
  function offX(z) { return (curveX(dist - z) - curveX(dist)) * curveMul; }
  function offY(z) { return (hillY(dist - z) - hillY(dist)) * hillMul; }

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
  // Köşeleri yuvarlanmış kutu (premium, az keskin) — segmentli kutu + köşeleri küreye it
  function roundedBox(w, h, d, seg) {
    seg = seg || 3;
    const r = Math.min(0.16, 0.45 * Math.min(w, h, d));
    const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const pos = geo.attributes.position;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const cx = Math.max(-hw, Math.min(hw, x)), cy = Math.max(-hh, Math.min(hh, y)), cz = Math.max(-hd, Math.min(hd, z));
      let dx = x - cx, dy = y - cy, dz = z - cz;
      const len = Math.hypot(dx, dy, dz) || 1;
      pos.setXYZ(i, cx + dx / len * r, cy + dy / len * r, cz + dz / len * r);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function buildCar(colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: colorHex, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.3, roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x5c7488, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.05 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.95, roughness: 0.2 });
    const interior = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.85 });

    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(roundedBox(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }

    // alt gövde (geniş, basık)
    box(1.95, 0.55, 4.3, paint, 0, 0.62, 0);
    // üst gövde / omuz
    box(1.92, 0.42, 3.9, paint, 0, 1.0, -0.05);
    // iç döşeme (camlardan görünür, koyu gri)
    box(1.4, 0.34, 1.7, interior, 0, 1.26, -0.15);
    // kabin: saydam cam sera + gövde renginde tavan + ince direkler
    box(1.6, 0.6, 1.92, glass, 0, 1.44, -0.15);           // saydam sera (tüm camlar)
    box(1.52, 0.12, 1.55, paint, 0, 1.75, -0.15);         // gövde renginde tavan
    box(0.1, 0.58, 0.12, paint, 0.79, 1.44, 0.78);        // C direkleri
    box(0.1, 0.58, 0.12, paint, -0.79, 1.44, 0.78);
    box(0.1, 0.58, 0.12, paint, 0.79, 1.44, -1.05);       // A direkleri
    box(0.1, 0.58, 0.12, paint, -0.79, 1.44, -1.05);
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

    // --- panel derz (birleşim) çizgileri: kapı, kaput, bagaj, tampon ---
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
    function seam(w, h, d, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat);
      m.position.set(x, y, z); g.add(m);
    }
    seam(1.5, 0.03, 0.045, 0, 1.225, 0.86);      // bagaj kapağı ön derzi
    seam(0.045, 0.03, 1.0, 0.72, 1.225, 1.4);    // bagaj yan derzleri
    seam(0.045, 0.03, 1.0, -0.72, 1.225, 1.4);
    seam(1.5, 0.03, 0.045, 0, 1.225, -1.18);     // kaput arka derzi
    seam(0.045, 0.03, 0.8, 0.72, 1.225, -1.6);
    seam(0.045, 0.03, 0.8, -0.72, 1.225, -1.6);
    seam(1.74, 0.035, 0.03, 0, 0.52, 2.16);      // arka tampon derzi
    seam(1.74, 0.035, 0.03, 0, 0.52, -2.16);     // ön tampon derzi
    seam(0.03, 0.55, 0.04, 0.985, 0.7, 0.1);     // kapı bölme çizgisi (sağ)
    seam(0.03, 0.55, 0.04, -0.985, 0.7, 0.1);    // (sol)
    seam(0.03, 0.04, 3.4, 0.985, 0.92, -0.05);   // yan karakter/bel hattı (sağ)
    seam(0.03, 0.04, 3.4, -0.985, 0.92, -0.05);  // (sol)

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
    const paint = new THREE.MeshPhysicalMaterial({ color: colorHex, metalness: 0.45, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.16 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0.3, roughness: 0.7 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x5c7488, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.05 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd6dbe2, metalness: 0.95, roughness: 0.18 });
    const head = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, metalness: 0.6, roughness: 0.2, emissive: 0x223044, emissiveIntensity: 0.5 });
    const interior = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.85 });

    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(roundedBox(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }

    // 3-box gövde (uzun, dik)
    box(1.94, 0.64, 4.78, paint, 0, 0.68, 0);          // alt gövde
    box(1.9, 0.32, 4.5, paint, 0, 1.02, 0);            // omuz şeridi
    // iç döşeme (camlardan görünür)
    box(1.42, 0.4, 2.2, interior, 0, 1.28, -0.05);
    // kabin: saydam cam sera + gövde renginde tavan + ince direkler
    box(1.62, 0.72, 2.5, glass, 0, 1.46, -0.05);       // saydam sera (tüm camlar)
    box(1.54, 0.12, 2.05, paint, 0, 1.8, -0.05);       // gövde renginde tavan
    box(0.1, 0.7, 0.14, paint, 0.81, 1.46, -1.28);     // A direkleri
    box(0.1, 0.7, 0.14, paint, -0.81, 1.46, -1.28);
    box(0.1, 0.7, 0.14, paint, 0.81, 1.46, 1.15);      // C direkleri
    box(0.1, 0.7, 0.14, paint, -0.81, 1.46, 1.15);
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

    // --- panel derz (birleşim) çizgileri ---
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.9 });
    function seam(w, h, d, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat);
      m.position.set(x, y, z); g.add(m);
    }
    seam(1.5, 0.03, 0.045, 0, 1.19, 1.24);       // bagaj kapağı derzi
    seam(0.045, 0.03, 1.0, 0.7, 1.19, 1.82);
    seam(0.045, 0.03, 1.0, -0.7, 1.19, 1.82);
    seam(1.5, 0.03, 0.045, 0, 1.19, -1.34);      // kaput derzi
    seam(0.045, 0.03, 0.9, 0.7, 1.19, -1.88);
    seam(0.045, 0.03, 0.9, -0.7, 1.19, -1.88);
    seam(1.72, 0.035, 0.03, 0, 0.5, 2.4);        // arka tampon derzi
    seam(1.72, 0.035, 0.03, 0, 0.5, -2.4);       // ön tampon derzi
    seam(0.03, 0.6, 0.04, 0.985, 0.78, -0.5);    // ön kapı (sağ)
    seam(0.03, 0.6, 0.04, -0.985, 0.78, -0.5);
    seam(0.03, 0.6, 0.04, 0.985, 0.78, 0.62);    // arka kapı (sağ)
    seam(0.03, 0.6, 0.04, -0.985, 0.78, 0.62);
    seam(0.03, 0.04, 3.7, 0.985, 1.07, -0.02);   // yan bel hattı
    seam(0.03, 0.04, 3.7, -0.985, 1.07, -0.02);

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

  // Tır / kamyon (kabin + kargo kasa, 6 teker)
  function buildTruck(colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: colorHex, metalness: 0.4, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const cargo = new THREE.MeshStandardMaterial({ color: 0xe2e6ea, metalness: 0.1, roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0.3, roughness: 0.7 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x5c7488, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(roundedBox(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    }
    box(2.0, 1.95, 1.7, paint, 0, 1.55, -2.4);    // kabin (ön = -z)
    box(1.8, 0.66, 0.1, glass, 0, 2.05, -3.22);   // ön cam
    box(2.22, 2.6, 5.3, cargo, 0, 1.9, 0.7);      // kargo kasa
    box(2.24, 2.55, 0.12, dark, 0, 1.9, 3.36);    // arka kapı
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xd61f1f, emissive: 0xc01010, emissiveIntensity: 0.55 });
    box(0.42, 0.3, 0.06, tailMat, 0.85, 0.6, 3.4);
    box(0.42, 0.3, 0.06, tailMat, -0.85, 0.6, 3.4);
    // panel derzleri (kasa kapı çizgisi + tampon)
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.85 });
    const sBox = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat); m.position.set(x, y, z); g.add(m); };
    sBox(0.05, 2.5, 0.04, 0, 1.9, 3.43);          // kasa arka kapı orta çizgisi
    sBox(2.2, 0.05, 0.04, 0, 1.9, 3.43);          // yatay
    sBox(0.04, 2.4, 0.05, 1.12, 1.9, 0.7);        // kasa yan derz (sağ)
    sBox(0.04, 2.4, 0.05, -1.12, 1.9, 0.7);       // (sol)
    const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 18); wg.rotateZ(Math.PI / 2);
    const tire = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.85 });
    const wheels = [];
    for (const [wx, wz] of [[1.02, -2.0], [-1.02, -2.0], [1.02, 1.4], [-1.02, 1.4], [1.02, 2.8], [-1.02, 2.8]]) {
      const wheel = new THREE.Group();
      const tt = new THREE.Mesh(wg, tire); tt.castShadow = true; wheel.add(tt);
      wheel.position.set(wx, 0.55, wz); g.add(wheel); wheels.push(wheel);
    }
    g.userData = { tailMat, wheels, paint };
    return g;
  }

  // ----------------------------- Ağaç / Dağ -----------------------------
  // Bölgesel bitki örtüsü malzemeleri (yeniden kullanılır)
  const VEG = {
    trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }),
    trunkDark: new THREE.MeshStandardMaterial({ color: 0x4f3620, roughness: 1 }),
    pine: new THREE.MeshStandardMaterial({ color: 0x2f8a3c, roughness: 1 }),
    lush: new THREE.MeshStandardMaterial({ color: 0x1f7a2c, roughness: 1 }),
    steppe: new THREE.MeshStandardMaterial({ color: 0x9aa24e, roughness: 1 }),
    maki: new THREE.MeshStandardMaterial({ color: 0x6f8a52, roughness: 1 })
  };
  // kind: 'mixed' (Marmara çam), 'lush' (Karadeniz ulu ağaç), 'steppe' (İç Anadolu bozkır), 'maki' (Akdeniz maki)
  function buildVeg(kind) {
    const g = new THREE.Group();
    if (kind === 'lush') {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 2.8, 7), VEG.trunkDark);
      tr.position.y = 1.4; tr.castShadow = true; g.add(tr);
      for (const [x, y, r] of [[0, 3.7, 2.1], [-1.0, 3.2, 1.5], [1.0, 3.3, 1.5], [0, 4.9, 1.35]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), VEG.lush); b.position.set(x, y, 0); b.castShadow = true; g.add(b);
      }
    } else if (kind === 'steppe') {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.7, 6), VEG.trunk);
      tr.position.y = 0.35; g.add(tr);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.85, 7, 5), VEG.steppe);
      b.position.y = 1.0; b.scale.y = 0.7; b.castShadow = true; g.add(b);
    } else if (kind === 'maki') {
      for (const [x, z, r] of [[0, 0, 0.95], [0.75, 0.3, 0.6], [-0.65, -0.2, 0.55]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), VEG.maki);
        b.position.set(x, r * 0.65, z); b.scale.y = 0.6; b.castShadow = true; g.add(b);
      }
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7), VEG.trunk);
      trunk.position.y = 0.8; trunk.castShadow = true; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * 0.35, 1.6, 8), VEG.pine);
        cone.position.y = 1.8 + i * 0.9; cone.castShadow = true; g.add(cone);
      }
    }
    return g;
  }

  const mountainItems = [];   // { node, side } -> sahil bölgesinde deniz tarafı gizlenir
  function addMountains() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5d76a3, roughness: 1, flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 1, flatShading: true });
    const grp = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const node = new THREE.Group();
      const h = 30 + Math.random() * 55;
      const r = 22 + Math.random() * 26;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
      const side = i < 8 ? -1 : 1;
      m.position.set((40 + Math.random() * 120) * side, h / 2 - 4, -260 - Math.random() * 160);
      node.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.28, 5), snow);
      cap.position.set(m.position.x, m.position.y + h * 0.36, m.position.z);
      node.add(cap);
      grp.add(node); mountainItems.push({ node, side });
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
  const player = { x: 0, vx: 0, lane: 1, speed: 0, chosen: 0, steer: 0, grip: 0.35, highBeam: false, model: null, modelType: 0, countryIdx: 0, plateText: '34 UCAR' };
  const BUILDERS = [buildCar, buildSedan];

  // ----------------------------- Plaka (ülke + bayrak) -----------------------------
  const PLATE_COUNTRIES = [
    { code: 'TR', name: 'Türkiye', emoji: '🇹🇷', bg: '#f3f4f6', fg: '#111' },
    { code: 'DE', name: 'Almanya', emoji: '🇩🇪', bg: '#f3f4f6', fg: '#111' },
    { code: 'FR', name: 'Fransa', emoji: '🇫🇷', bg: '#f3f4f6', fg: '#111' },
    { code: 'IT', name: 'İtalya', emoji: '🇮🇹', bg: '#f3f4f6', fg: '#111' },
    { code: 'GB', name: 'İngiltere', emoji: '🇬🇧', bg: '#f4d11a', fg: '#111' },
    { code: 'ES', name: 'İspanya', emoji: '🇪🇸', bg: '#f3f4f6', fg: '#111' },
    { code: 'US', name: 'ABD', emoji: '🇺🇸', bg: '#eef2f7', fg: '#16306b' }
  ];
  function drawFlag(g, code, x, y, w, h) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (code === 'TR') { g.fillStyle = '#e30a17'; g.fillRect(x, y, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w * 0.42, y + h / 2, h * 0.3, 0, 7); g.fill(); g.fillStyle = '#e30a17'; g.beginPath(); g.arc(x + w * 0.48, y + h / 2, h * 0.24, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w * 0.62, y + h / 2, h * 0.12, 0, 7); g.fill(); }
    else if (code === 'DE') { const b = h / 3; g.fillStyle = '#000'; g.fillRect(x, y, w, b); g.fillStyle = '#d00'; g.fillRect(x, y + b, w, b); g.fillStyle = '#fc0'; g.fillRect(x, y + 2 * b, w, b); }
    else if (code === 'FR') { const s = w / 3; g.fillStyle = '#0050a4'; g.fillRect(x, y, s, h); g.fillStyle = '#fff'; g.fillRect(x + s, y, s, h); g.fillStyle = '#ef4135'; g.fillRect(x + 2 * s, y, s, h); }
    else if (code === 'IT') { const s = w / 3; g.fillStyle = '#008c45'; g.fillRect(x, y, s, h); g.fillStyle = '#fff'; g.fillRect(x + s, y, s, h); g.fillStyle = '#cd212a'; g.fillRect(x + 2 * s, y, s, h); }
    else if (code === 'ES') { g.fillStyle = '#aa151b'; g.fillRect(x, y, w, h); g.fillStyle = '#f1bf00'; g.fillRect(x, y + h * 0.25, w, h * 0.5); }
    else if (code === 'GB') { g.fillStyle = '#012169'; g.fillRect(x, y, w, h); g.strokeStyle = '#fff'; g.lineWidth = h * 0.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke(); g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.16; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = h * 0.34; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke(); g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke(); }
    else { g.fillStyle = '#3c3b6e'; g.fillRect(x, y, w, h); for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(x, y + i * h / 7, w, h / 7); } g.fillStyle = '#3c3b6e'; g.fillRect(x, y, w * 0.42, h * 0.55); }
    g.restore();
  }
  function makePlateTexture(country, text) {
    const W = 512, H = 116, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = country.bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#111'; g.lineWidth = 7; g.strokeRect(4, 4, W - 8, H - 8);
    const bw = 86;                                   // sol mavi bant
    g.fillStyle = '#0b3aa0'; g.fillRect(8, 8, bw, H - 16);
    drawFlag(g, country.code, 22, 16, bw - 28, 40);
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(country.code, 8 + bw / 2, H - 28);
    g.fillStyle = country.fg; g.textBaseline = 'middle';
    const area = W - bw - 44; let fs = 74;
    do { g.font = '900 ' + fs + 'px Arial, sans-serif'; fs -= 3; } while (g.measureText(text || '').width > area && fs > 22);
    g.fillText(text || '', 8 + bw + (W - 16 - bw) / 2, H / 2 + 3);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
  }
  const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
  function applyPlate() {
    const tex = makePlateTexture(PLATE_COUNTRIES[player.countryIdx], player.plateText);
    if (plateMat.map) plateMat.map.dispose();
    plateMat.map = tex; plateMat.needsUpdate = true;
  }

  let score = 0, best = Number(localStorage.getItem('ucar3d_best') || 0);
  let level = 1, dist = 0, speedBoost = 1, trafficDensity = 1;
  let nearStreak = 0, nearTimer = 0;   // yakın geçiş combo

  // Oyuncu arabası (model değiştirilebilir)
  function rebuildPlayer() {
    const oldX = player.model ? player.model.position.x : 0;
    if (player.model) scene.remove(player.model);
    player.model = BUILDERS[player.modelType](CAR_COLORS[player.chosen].hex);
    player.model.position.x = oldX;
    // plakayı arkaya tak
    const pz = player.modelType === 1 ? 2.43 : 2.18;
    const py = player.modelType === 1 ? 0.72 : 0.64;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.25), plateMat);
    plate.position.set(0, py, pz); player.model.add(plate);
    scene.add(player.model);
  }
  rebuildPlayer();
  applyPlate();

  // Trafik havuzu
  const traffic = [];
  const CAR_LEN = 4.3;
  const MIN_GAP = CAR_LEN + 1.6;   // aynı şeritte iki araç arası min. mesafe
  // Tır şerit tercihi: çoğunlukla en sağ (LANES-1), bazen orta, en sol şeride çok çok nadir
  function truckLane() { const r = Math.random(); return r < 0.02 ? 0 : (r < 0.34 ? 1 : LANES - 1); }
  // Dönüş sinyali ışıkları (ön+arka köşeler, sol/sağ ayrı malzeme)
  const BLINK_GEO = new THREE.BoxGeometry(0.17, 0.15, 0.17);
  function attachBlinkers(model, kind) {
    const mk = () => new THREE.MeshStandardMaterial({ color: 0x4a2f00, emissive: 0xff9500, emissiveIntensity: 0, roughness: 0.4 });
    const matL = mk(), matR = mk();
    const W = kind === 'truck' ? 1.32 : 0.98;
    const rz = kind === 'truck' ? 3.3 : (kind === 'sedan' ? 2.35 : 2.05);
    const fz = kind === 'truck' ? -2.4 : (kind === 'sedan' ? -2.3 : -2.0);
    const y = kind === 'truck' ? 0.95 : 0.62;
    for (const [x, z, mat] of [[-W, fz, matL], [-W, rz, matL], [W, fz, matR], [W, rz, matR]]) {
      const mesh = new THREE.Mesh(BLINK_GEO, mat); mesh.position.set(x, y, z); model.add(mesh);
    }
    model.userData.blinkL = matL; model.userData.blinkR = matR;
  }
  function spawnTraffic() {
    for (const t of traffic) scene.remove(t.model);
    traffic.length = 0;
    const n = Math.round(7 * trafficDensity);
    const laneNext = [-50, -50, -50];   // her şeritte bir sonraki boş z
    for (let i = 0; i < n; i++) {
      const hex = TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0];
      const r = Math.random();
      const kind = r < 0.22 ? 'truck' : (r < 0.6 ? 'sedan' : 'car');
      const m = kind === 'truck' ? buildTruck(hex) : (kind === 'sedan' ? buildSedan(hex) : buildCar(hex));
      scene.add(m); attachBlinkers(m, kind);
      const isTruck = kind === 'truck';
      const lane = isTruck ? truckLane() : (i % LANES);  // tır: sağ/orta ağırlıklı
      const z = laneNext[lane] - Math.random() * 30;
      const half = isTruck ? 3.4 : 2.15;            // araç yarı-uzunluğu
      laneNext[lane] = z - (half + 36 + Math.random() * 50);
      const car = { model: m, lane, laneF: lane, z, passed: false, kind, half, colLat: isTruck ? 1.95 : 1.7,
        boost: 0, laneCool: 1 + Math.random() * 3, canLC: true,
        laneMin: isTruck ? 1 : 0, homeLane: isTruck ? LANES - 1 : -1, blinker: 0, useBlinker: Math.random() < 0.6,
        cruise: MAX_SPEED * (isTruck ? 0.26 + Math.random() * 0.14 : 0.32 + Math.random() * 0.22), spd: 0,
        rageMax: MAX_SPEED * (isTruck ? 0.42 + Math.random() * 0.12 : 0.6 + Math.random() * 0.18), anger: 0 };
      car.spd = car.cruise;
      car.model.position.set(laneX(car.lane), 0, car.z);
      traffic.push(car);
    }
  }
  // Geçilen aracı ileri (uzağa) taşı: yeni şeritteki en öndeki aracın da ilerisine koy
  function recycleTraffic(car) {
    car.lane = car.kind === 'truck' ? truckLane() : ((Math.random() * LANES) | 0);
    let frontMost = -180;
    for (const o of traffic) if (o !== car && o.lane === car.lane) frontMost = Math.min(frontMost, o.z);
    car.z = frontMost - (car.half + 32 + Math.random() * 100);
    car.anger = 0; car.spd = car.cruise; car.passed = false;
    car.laneF = car.lane; car.boost = 0; car.laneCool = 1 + Math.random() * 3;
    car.blinker = 0; car.useBlinker = Math.random() < 0.6;
    const isTruck = car.kind === 'truck';
    car.cruise = MAX_SPEED * (isTruck ? 0.26 + Math.random() * 0.14 : 0.32 + Math.random() * 0.22);
    car.rageMax = MAX_SPEED * (isTruck ? 0.42 + Math.random() * 0.12 : 0.6 + Math.random() * 0.18);
    car.model.userData.paint.color.setHex(TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0]);
  }
  // Yeni araç ekle (seviye atlayınca mevcutları değiştirmeden, uzağa yerleştir)
  function addTrafficCar() {
    const hex = TRAFFIC_HEX[(Math.random() * TRAFFIC_HEX.length) | 0];
    const r = Math.random();
    const kind = r < 0.22 ? 'truck' : (r < 0.6 ? 'sedan' : 'car');
    const m = kind === 'truck' ? buildTruck(hex) : (kind === 'sedan' ? buildSedan(hex) : buildCar(hex));
    scene.add(m); attachBlinkers(m, kind);
    const isTruck = kind === 'truck';
    const car = { model: m, lane: 0, laneF: 0, z: -300, passed: false, kind, half: isTruck ? 3.4 : 2.15,
      colLat: isTruck ? 1.95 : 1.7, boost: 0, laneCool: 1 + Math.random() * 3, canLC: true,
      laneMin: isTruck ? 1 : 0, homeLane: isTruck ? LANES - 1 : -1, blinker: 0, useBlinker: Math.random() < 0.6,
      cruise: 1, spd: 1, rageMax: 1, anger: 0 };
    traffic.push(car);
    recycleTraffic(car);   // boş şeride, uzağa yerleştir + hız/renk ata
  }

  // Ağaçlar (kaydırılan)
  // ----------------------------- Bölgeler & Rota (il plakaları) -----------------------------
  // sea: 0 yok, -1 sol, +1 sağ.  curve/hill: yol karakteri çarpanı.  density: ağaç yoğunluğu.
  const REGIONS = {
    marmara:   { label: 'Marmara',          ground: 0x4f9a4a, tree: 'mixed',  density: 1.0,  curve: 1.0,  hill: 0.9,  sea: 0 },
    karadeniz: { label: 'Karadeniz',        ground: 0x2f7d30, tree: 'lush',   density: 1.7,  curve: 1.15, hill: 1.35, sea: 0 },
    ksahil:    { label: 'Karadeniz Sahili', ground: 0x2f7d30, tree: 'lush',   density: 1.3,  curve: 1.1,  hill: 1.0,  sea: -1 },
    icanadolu: { label: 'İç Anadolu',       ground: 0xc2ac63, tree: 'steppe', density: 0.45, curve: 0.22, hill: 0.3,  sea: 0 },
    akdeniz:   { label: 'Akdeniz',          ground: 0x8a9c4a, tree: 'maki',   density: 1.15, curve: 1.95, hill: 1.45, sea: -1 }
  };
  const ROUTE = [
    { name: 'İstanbul', plate: '34', region: 'marmara' },
    { name: 'Sakarya', plate: '54', region: 'marmara' },
    { name: 'Bolu', plate: '14', region: 'karadeniz' },
    { name: 'Düzce', plate: '81', region: 'karadeniz' },
    { name: 'Zonguldak', plate: '67', region: 'ksahil' },
    { name: 'Kastamonu', plate: '37', region: 'karadeniz' },
    { name: 'Amasya', plate: '05', region: 'karadeniz' },
    { name: 'Çorum', plate: '19', region: 'icanadolu' },
    { name: 'Çankırı', plate: '18', region: 'icanadolu' },
    { name: 'Ankara', plate: '06', region: 'icanadolu' },
    { name: 'Konya', plate: '42', region: 'icanadolu' },
    { name: 'Antalya', plate: '07', region: 'akdeniz' },
    { name: 'Mersin', plate: '33', region: 'akdeniz' }
  ];
  const PROV_LEN = 2600;                 // her ilin yol uzunluğu
  let routeIdx = -1;
  let curRegion = REGIONS.marmara;

  const trees = [];
  function setTreeVeg(tr, kind) {
    if (tr.kind === kind) return;
    tr.kind = kind;
    if (tr.veg) tr.group.remove(tr.veg);
    tr.veg = buildVeg(kind); tr.group.add(tr.veg);
  }
  function placeTree(tr) {               // geri dönüştürülünce bölgeye göre yerleştir
    tr.z -= (200 / curRegion.density) + Math.random() * 60;
    const land = curRegion.sea ? -curRegion.sea : (Math.random() < 0.5 ? -1 : 1);
    tr.x = land * (ROAD_W / 2 + 4 + Math.random() * 14);
    setTreeVeg(tr, curRegion.tree);
    tr.group.visible = Math.random() < Math.min(1, curRegion.density);
    const s = (0.8 + Math.random() * 0.7) * (curRegion.tree === 'lush' ? 1.25 : curRegion.tree === 'maki' ? 0.7 : 1);
    tr.group.scale.setScalar(s);
  }
  for (let i = 0; i < 24; i++) {
    const group = new THREE.Group(); scene.add(group);
    const side = i % 2 ? 1 : -1;
    const tr = { group, veg: null, kind: null, z: -i * 24 - Math.random() * 20, x: side * (ROAD_W / 2 + 4 + Math.random() * 14) };
    setTreeVeg(tr, 'mixed');
    group.position.set(tr.x, 0, tr.z); group.scale.setScalar(0.9 + Math.random() * 0.6);
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

  // ----------------------------- Radar (hız kamerası) -----------------------------
  // Önce MUTLAKA "RADAR" uyarı tabelası belirir; her uyarıda radar çıkmaz,
  // ama radar çıkacaksa kesinlikle önce uyarı tabelası gelir.
  function makeSignTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    // beyaz yuvarlak köşe pano + kırmızı kenar (uyarı)
    g.fillStyle = '#fff'; g.strokeStyle = '#d11'; g.lineWidth = 18;
    g.beginPath();
    if (g.roundRect) g.roundRect(16, 16, 224, 224, 28); else g.rect(16, 16, 224, 224);
    g.fill(); g.stroke();
    // kamera ikonu
    g.fillStyle = '#222';
    g.fillRect(70, 96, 90, 54); g.fillRect(150, 108, 26, 30);
    g.beginPath(); g.arc(108, 123, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(108, 123, 10, 0, Math.PI * 2); g.fill();
    // yazı
    g.fillStyle = '#d11'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
    g.fillText('RADAR', 128, 210);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  function makeSign() {
    const grp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.5 }));
    post.position.y = 1.7; post.castShadow = true; grp.add(post);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshStandardMaterial({ map: makeSignTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.6 }));
    panel.position.set(0, 3.2, 0); panel.castShadow = true; grp.add(panel);
    return grp;
  }
  function makeRadar() {
    const grp = new THREE.Group();
    const grey = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 10), grey);
    pole.position.y = 1.8; pole.castShadow = true; grp.add(pole);
    const arm = new THREE.Mesh(roundedBox(1.2, 0.16, 0.16), grey); arm.position.set(-0.55, 3.4, 0); arm.castShadow = true; grp.add(arm);
    const housing = new THREE.Mesh(roundedBox(0.7, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.5, roughness: 0.5 }));
    housing.position.set(-1.05, 3.4, 0); housing.castShadow = true; grp.add(housing);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.3, roughness: 0.2 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(-1.05, 3.4, 0.32); grp.add(lens);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }));
    bulb.position.set(-1.05, 3.7, 0.3); grp.add(bulb); grp.userData = { bulb };
    return grp;
  }
  const RADAR = (function () {
    const SIDE = ROAD_W / 2 + 2.8;
    const sign = makeSign(); sign.visible = false; scene.add(sign);
    const cam = makeRadar(); cam.visible = false; scene.add(cam);
    const LIMIT = MAX_SPEED * 0.6;     // ~%60 üstü ceza
    let signOn = false, signZ = 0, radOn = false, radZ = 0, radDone = false;
    let timer = 10 + Math.random() * 12;
    // beyaz deklanşör flaşı (DOM)
    const cf = document.createElement('div');
    cf.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.95),rgba(255,255,255,.25) 60%,transparent);opacity:0;pointer-events:none;z-index:29;';
    document.getElementById('game-shell').appendChild(cf);
    function shutter() { cf.style.transition = 'none'; cf.style.opacity = '0.85'; requestAnimationFrame(() => { cf.style.transition = 'opacity .3s ease-out'; cf.style.opacity = '0'; }); }
    function trigger() {
      signOn = true; signZ = -270;
      radOn = Math.random() < 0.6;        // her uyarı radar değil
      radZ = -420; radDone = false;
      pushPop('⚠️ RADAR UYARISI');
    }
    function update(dt, sp) {
      if (!signOn && !radOn) { timer -= dt; if (timer <= 0) { trigger(); timer = 20 + Math.random() * 22; } }
      if (signOn) {
        signZ += sp * dt; sign.visible = true;
        sign.position.set(SIDE + offX(signZ), 1.6 + offY(signZ), signZ);
        if (signZ > 16) { signOn = false; sign.visible = false; }
      }
      if (radOn) {
        radZ += sp * dt; cam.visible = true;
        cam.position.set(SIDE + offX(radZ), offY(radZ), radZ);
        if (!radDone && radZ > -1) {
          radDone = true;
          const over = sp - LIMIT;
          if (over > 0) {
            const fine = Math.round(80 + (over / MAX_SPEED) * 500);
            score = Math.max(0, score - fine);
            pushPop('📷 RADAR CEZASI! -' + fine); Audio.camera(); shutter();
            cam.userData.bulb.material.emissiveIntensity = 3;
          } else { pushPop('📷 RADAR ✓ limitte'); Audio.coin(); }
        }
        if (radZ > 18) { radOn = false; cam.visible = false; cam.userData.bulb.material.emissiveIntensity = 0.4; }
      }
    }
    function reset() { signOn = false; radOn = false; sign.visible = false; cam.visible = false; timer = 10 + Math.random() * 12; }
    return { update, reset };
  })();

  // ----------------------------- Deniz (sahil bölgeleri) -----------------------------
  const sea = (function () {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#2f74b3'); grad.addColorStop(1, '#0f3e6b');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
    for (let i = 0; i < 46; i++) { const y = Math.random() * 256; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y - 3, 44, y + 3, 64, y); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 34);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(380, 1200), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(-210, -0.04, -300); m.visible = false; scene.add(m);
    return { mesh: m, mat, tex, op: 0 };
  })();
  function applyMountains() { for (const it of mountainItems) it.node.visible = !(curRegion.sea && it.side === curRegion.sea); }
  function updateSea(dt) {
    const target = curRegion.sea ? 0.92 : 0;
    sea.op += (target - sea.op) * Math.min(1, dt * 1.2);
    sea.mat.opacity = sea.op; sea.mesh.visible = sea.op > 0.02;
    if (curRegion.sea) sea.mesh.position.x = curRegion.sea * 210;
    sea.tex.offset.y -= dt * 0.05;
  }

  // ----------------------------- İl giriş levhası -----------------------------
  function makeProvinceTex(name, plate) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#0b7a33';
    if (g.roundRect) { g.beginPath(); g.roundRect(8, 8, 496, 240, 18); g.fill(); } else g.fillRect(8, 8, 496, 240);
    g.lineWidth = 8; g.strokeStyle = '#fff';
    if (g.roundRect) { g.beginPath(); g.roundRect(18, 18, 476, 220, 14); g.stroke(); } else g.strokeRect(18, 18, 476, 220);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 62px sans-serif'; g.fillText(name, 256, 96);
    g.fillStyle = '#fff'; g.fillRect(186, 132, 140, 76);
    g.fillStyle = '#0b3aa0'; g.fillRect(186, 132, 34, 76);
    g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText('TR', 203, 174);
    g.fillStyle = '#111'; g.font = '900 52px Arial, sans-serif'; g.fillText(plate, 276, 178);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  const provSign = (function () {
    const grp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6 }));
    post.position.y = 2.1; grp.add(post);
    const mat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.7 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), mat); panel.position.y = 4.3; grp.add(panel);
    grp.visible = false; scene.add(grp);
    return { grp, mat, z: 0, on: false };
  })();
  function showProvinceSign(name, plate) {
    if (provSign.mat.map) provSign.mat.map.dispose();
    provSign.mat.map = makeProvinceTex(name, plate); provSign.mat.needsUpdate = true;
    provSign.z = -255; provSign.on = true; provSign.grp.visible = true;
  }
  function updateProvinceSign(dt, sp) {
    if (!provSign.on) return;
    provSign.z += sp * dt;
    const SIDE = ROAD_W / 2 + 4.2;
    provSign.grp.position.set(SIDE + offX(provSign.z), offY(provSign.z), provSign.z);
    if (provSign.z > 18) { provSign.on = false; provSign.grp.visible = false; }
  }

  // ----------------------------- Yol kenarı: benzinlik & göl -----------------------------
  function buildGasStation() {
    const g = new THREE.Group();
    g.add(meshBox(10, 0.1, 8, 0xbfc3c8, 0, 0.05, 0));
    const b = meshBox(4, 2.6, 3, 0xeef2f5, -2.6, 1.3, -1.6); b.castShadow = true; g.add(b);
    const roof = meshBox(7.4, 0.35, 5.2, 0xd83838, 1.4, 3.3, 0.4); roof.castShadow = true; g.add(roof);
    for (const x of [-1.6, 4.4]) g.add(meshCyl(0.12, 3.2, 0xcccccc, x, 1.65, 2.6));
    for (const x of [0.4, 2.6]) g.add(meshBox(0.5, 1.1, 0.5, 0x2b6cb0, x, 0.65, 0.4));
    g.add(meshCyl(0.1, 5, 0x888888, 5.3, 2.5, -2.2));
    const sign = meshBox(2.4, 1.1, 0.2, 0xffcf33, 5.3, 5.0, -2.2);
    sign.material.emissive = new THREE.Color(0xffcf33); sign.material.emissiveIntensity = 0.35; g.add(sign);
    return g;
  }
  function buildLake() {
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.CircleGeometry(9, 22), new THREE.MeshStandardMaterial({ color: 0x2f7fb5, roughness: 0.2, metalness: 0.1 }));
    w.rotation.x = -Math.PI / 2; w.position.y = 0.02; g.add(w);
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28; g.add(meshCone(0.3, 1.4, VEG.steppe.color.getHex(), Math.cos(a) * 8, 0.7, Math.sin(a) * 8)); }
    return g;
  }
  function meshBox(w, h, d, col, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 })); m.position.set(x, y, z); return m; }
  function meshCyl(r, h, col, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 7), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); m.position.set(x, y, z); return m; }
  function meshCone(r, h, col, x, y, z) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 1 })); m.position.set(x, y, z); return m; }
  const PROPS = (function () {
    const gas = buildGasStation(); gas.visible = false; gas.rotation.y = -0.25; scene.add(gas);
    const lake = buildLake(); lake.visible = false; scene.add(lake);
    let gz = 0, gon = false, gt = 12 + Math.random() * 14;
    let lz = 0, lon = false, lt = 24 + Math.random() * 22, lside = -1;
    function update(dt, sp) {
      if (!gon) { gt -= dt; if (gt <= 0) { gon = true; gz = -300; gt = 24 + Math.random() * 28; } }
      if (gon) { gz += sp * dt; gas.visible = true; gas.position.set((ROAD_W / 2 + 9) + offX(gz), offY(gz), gz); if (gz > 32) { gon = false; gas.visible = false; } }
      if (!lon) { lt -= dt; if (lt <= 0) { if (!curRegion.sea) { lon = true; lz = -320; lside = curRegion.sea ? -curRegion.sea : (Math.random() < 0.5 ? -1 : 1); } lt = 30 + Math.random() * 28; } }
      if (lon) { lz += sp * dt; lake.visible = true; lake.position.set(lside * (ROAD_W / 2 + 14) + offX(lz), -0.01 + offY(lz), lz); if (lz > 36) { lon = false; lake.visible = false; } }
    }
    function reset() { gon = false; lon = false; gas.visible = false; lake.visible = false; gt = 12 + Math.random() * 14; lt = 24 + Math.random() * 22; }
    return { update, reset };
  })();

  // ----------------------------- Rota ilerlemesi (il + bölge) -----------------------------
  const grassCol = new THREE.Color(0x4f9a4a);
  const targetGround = new THREE.Color(0x4f9a4a);
  let routeEl = null;
  function ensureRouteEl() { if (!routeEl) { routeEl = document.createElement('div'); routeEl.id = 'route3d'; const sh = document.getElementById('game-shell'); if (sh && sh.appendChild) sh.appendChild(routeEl); } }
  function updateRoute(dt, sp) {
    const idx = ((Math.floor(dist / PROV_LEN) % ROUTE.length) + ROUTE.length) % ROUTE.length;
    if (idx !== routeIdx && ROUTE[idx]) {
      routeIdx = idx; const p = ROUTE[idx]; curRegion = REGIONS[p.region];
      targetGround.set(curRegion.ground); applyMountains();
      showProvinceSign(p.name, p.plate);
      ensureRouteEl(); if (routeEl) routeEl.textContent = '📍 ' + p.name + ' ' + p.plate;
      pushPop('🛣️ ' + p.name + ' ' + p.plate + ' • ' + curRegion.label);
      Audio.coin();
    }
    curveMul += (curRegion.curve - curveMul) * Math.min(1, dt * 0.5);
    hillMul += (curRegion.hill - hillMul) * Math.min(1, dt * 0.5);
    grassCol.lerp(targetGround, Math.min(1, dt * 0.8)); grassRibbon.material.color.copy(grassCol);
    updateSea(dt); updateProvinceSign(dt, sp);
    PROPS.update(dt, sp);
    SIDEFX.update(dt, sp);
  }

  // ----------------------------- Yan olaylar: arıza (dörtlü) & kavşak -----------------------------
  let junctionActive = false, junctionZ = 999;   // trafik bu civarda sol şeritte dikkatli gider
  function makeTriSignTex() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
    g.beginPath(); g.moveTo(128, 22); g.lineTo(238, 214); g.lineTo(18, 214); g.closePath(); g.fillStyle = '#d11'; g.fill();
    g.beginPath(); g.moveTo(128, 56); g.lineTo(210, 198); g.lineTo(46, 198); g.closePath(); g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(128, 190); g.lineTo(128, 118); g.stroke();
    g.beginPath(); g.moveTo(128, 146); g.lineTo(88, 110); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  function makeLeftArrowTex() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 256);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(82, 232); g.lineTo(82, 120); g.lineTo(34, 120); g.stroke();
    g.beginPath(); g.moveTo(50, 96); g.lineTo(18, 120); g.lineTo(50, 144); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  function signOnPost(tex, w, h) {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6 }));
    post.position.y = 1.7; group.add(post);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7 }));
    panel.position.y = 3.3; group.add(panel);
    group.visible = false; scene.add(group); return group;
  }
  const JTOWNS = ['Gölköy', 'Yeşilyurt', 'Çamlıca', 'Akpınar', 'Karaören', 'Pınarbaşı', 'Söğütlü', 'Ovacık', 'Kızılca', 'Bağlıca', 'Dereköy', 'Taşpınar'];
  function makeBlueSignTex(name) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 150; const g = c.getContext('2d');
    g.fillStyle = '#0b56b0'; if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 312, 142, 14); g.fill(); } else g.fillRect(4, 4, 312, 142);
    g.lineWidth = 6; g.strokeStyle = '#fff'; if (g.roundRect) { g.beginPath(); g.roundRect(12, 12, 296, 126, 10); g.stroke(); } else g.strokeRect(12, 12, 296, 126);
    g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(74, 120); g.lineTo(74, 70); g.lineTo(44, 70); g.stroke();
    g.beginPath(); g.moveTo(56, 50); g.lineTo(28, 70); g.lineTo(56, 90); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 38px sans-serif'; g.fillText(name, 200, 90);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  function makeGiveWayTex() {   // ters üçgen "YOL VER"
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
    g.beginPath(); g.moveTo(18, 44); g.lineTo(238, 44); g.lineTo(128, 234); g.closePath(); g.fillStyle = '#d11'; g.fill();
    g.beginPath(); g.moveTo(60, 68); g.lineTo(196, 68); g.lineTo(128, 192); g.closePath(); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 33px sans-serif'; g.fillText('YOL', 128, 108); g.fillText('VER', 128, 144);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  // Bağlantılı T-kavşak: yan yol + ağız + bordür + çizgiler + DUR çizgisi + sol dönüş oku + mavi yön levhası + YOL VER + bekleyen araç + dönen araç
  function buildJunction() {
    const grp = new THREE.Group();
    const EDGE = ROAD_W / 2 + 0.9;
    const asph = new THREE.MeshStandardMaterial({ color: 0x474b52, roughness: 0.96 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xeceeee, roughness: 0.7 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, roughness: 0.85 });
    function flat(w, d, mat, x, z, y) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); grp.add(m); return m; }
    flat(36, 7.2, asph, -EDGE - 18, 0, 0.016);                 // yan yol gövdesi
    flat(8, 13, asph, -EDGE - 3, 0, 0.014);                    // ağız (ana yola bağlanır)
    for (const z of [-3.95, 3.95]) { const cb = new THREE.Mesh(new THREE.BoxGeometry(34, 0.22, 0.34), curbMat); cb.position.set(-EDGE - 18, 0.11, z); grp.add(cb); }   // bordürler
    for (let x = -EDGE - 7; x > -EDGE - 33; x -= 4.2) flat(2.1, 0.34, paint, x, 0, 0.02);   // yan yol orta çizgileri
    flat(0.72, 7.0, paint, -EDGE - 0.7, 0, 0.022);             // DUR/stop çizgisi (ağızda)
    for (let z = -7.5; z <= 7.5; z += 3) flat(0.18, 1.7, paint, -EDGE + 0.15, z, 0.02);     // ana yol sol kenar (kesik)
    const arr = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.4), new THREE.MeshStandardMaterial({ map: makeLeftArrowTex(), transparent: true, roughness: 0.7 }));
    arr.rotation.x = -Math.PI / 2; arr.position.set(laneX(0), 0.024, 5.6); grp.add(arr);    // sol dönüş oku
    // mavi yön levhası (sağ omuz, sürücüye bakar)
    const blueMat = new THREE.MeshStandardMaterial({ map: makeBlueSignTex('Yeşilyurt'), transparent: true, roughness: 0.55 });
    const bluePanel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.6), blueMat); bluePanel.position.set(EDGE + 2.7, 3.0, -5); grp.add(bluePanel);
    const bluePost = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.2, 6), curbMat); bluePost.position.set(EDGE + 2.7, 1.5, -5); grp.add(bluePost);
    // YOL VER (yan yol ağzında, yan yoldaki araca bakar)
    const yv = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshStandardMaterial({ map: makeGiveWayTex(), transparent: true, roughness: 0.6 }));
    yv.position.set(-EDGE - 1.6, 2.4, 4.7); yv.rotation.y = -Math.PI / 2; grp.add(yv);
    const yvPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6), curbMat); yvPost.position.set(-EDGE - 1.6, 1.25, 4.7); grp.add(yvPost);
    // bekleyen araç (ana yola katılmak için DUR çizgisinde, fren ışıkları)
    const wait = buildCar(0x3a6ea5); wait.position.set(-EDGE - 4, 0, 3.0); wait.rotation.y = Math.PI / 2; grp.add(wait);
    // dönen araç (ana yoldan yan yola)
    const turner = buildCar(0xdedede); attachBlinkers(turner, 'car'); grp.add(turner);
    grp.visible = false; scene.add(grp);
    return { grp, blueMat, wait, turner, EDGE };
  }
  const SIDEFX = (function () {
    // --- Arızalı/duran araç (sağ banket) + uyarı üçgeni, dörtlüler yanar ---
    const haz = buildCar(0xb43c3c); attachBlinkers(haz, 'car'); haz.visible = false; scene.add(haz);
    const triHaz = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: makeTriSignTex(), transparent: true, side: THREE.DoubleSide }));
    triHaz.position.y = 0.5; const triGrp = new THREE.Group(); triGrp.add(triHaz); triGrp.visible = false; scene.add(triGrp);
    let hz = 0, hon = false, ht = 14 + Math.random() * 16, hblink = 0;
    // --- Kavşak (sol): bağlantılı T-kavşak + levhalar + bekleyen/dönen araç ---
    const warn = signOnPost(makeTriSignTex(), 1.7, 1.7);
    const J = buildJunction();
    const ED = -J.EDGE;
    let jz = 0, jon = false, jt = 16 + Math.random() * 16, jblink = 0;
    function update(dt, sp) {
      // ---- arıza ----
      hblink += dt;
      if (!hon) { ht -= dt; if (ht <= 0) { hon = true; hz = -300; ht = 20 + Math.random() * 24; } }
      if (hon) {
        hz += sp * dt; haz.visible = true; triGrp.visible = true;
        const X = ROAD_W / 2 + 2.3;
        haz.position.set(X + offX(hz), offY(hz), hz);
        haz.rotation.y = -Math.atan2(offX(hz - 4) - offX(hz), 4);
        triGrp.position.set(X + offX(hz + 5), offY(hz + 5), hz + 5);
        const on = (hblink % 0.64) < 0.32;
        haz.userData.blinkL.emissiveIntensity = on ? 2.4 : 0;
        haz.userData.blinkR.emissiveIntensity = on ? 2.4 : 0;
        if (hz > 26) { hon = false; haz.visible = false; triGrp.visible = false; }
      }
      // ---- kavşak ----
      if (!jon) {
        jt -= dt;
        if (jt <= 0) {
          jon = true; jz = -340; jblink = 0;
          if (J.blueMat.map) J.blueMat.map.dispose();
          J.blueMat.map = makeBlueSignTex(JTOWNS[(Math.random() * JTOWNS.length) | 0]); J.blueMat.needsUpdate = true;
          jt = 22 + Math.random() * 24;
        }
      }
      if (jon) {
        jblink += dt; jz += sp * dt;
        junctionActive = jz > -95 && jz < 28; junctionZ = jz;   // bu civarda sol şerit dikkatli
        // tüm kavşak yol hizasında ve eğimde
        J.grp.visible = true;
        J.grp.position.set(offX(jz), offY(jz), jz);
        J.grp.rotation.y = -Math.atan2(offX(jz - 6) - offX(jz), 6);
        // uyarı üçgeni kavşaktan önce gelir
        const wz = jz - 120;
        warn.visible = wz < 22 && wz > -360;
        warn.position.set((ROAD_W / 2 + 4.2) + offX(wz), offY(wz), wz);
        warn.rotation.y = -Math.atan2(offX(wz - 6) - offX(wz), 6);
        // bekleyen araç: fren ışıkları yanık, ana yola katılmak için hafif kıpırdar
        J.wait.userData.tailMat.emissiveIntensity = 2.0;
        J.wait.position.x = ED - 4 + Math.max(0, Math.sin(jblink * 0.8)) * 0.55;
        // dönen araç: yumuşak yay ile sola döner (yaklaşırken fren+sol sinyal, sonra yan yolda uzaklaşır)
        const u = Math.max(0, Math.min(1, (jz + 70) / 92));
        const L0 = laneX(0); let lx, lz, ry, brake;
        if (u < 0.45) { const a = u / 0.45; lx = L0; lz = 8 - a * 6.4; ry = 0; brake = true; }
        else if (u < 0.8) {
          const a = (u - 0.45) / 0.35, mt = 1 - a;
          const P0x = L0, P0z = 1.6, Cx = L0, Cz = -2.2, P1x = ED - 6, P1z = 0;
          lx = mt * mt * P0x + 2 * mt * a * Cx + a * a * P1x;
          lz = mt * mt * P0z + 2 * mt * a * Cz + a * a * P1z;
          const dx = 2 * mt * (Cx - P0x) + 2 * a * (P1x - Cx);
          const dz = 2 * mt * (Cz - P0z) + 2 * a * (P1z - Cz);
          ry = Math.atan2(dx, -dz); brake = true;
        } else { const a = (u - 0.8) / 0.2; lx = (ED - 6) - a * 26; lz = 0; ry = -Math.PI / 2; brake = false; }
        J.turner.visible = u < 0.98;
        J.turner.position.set(lx, 0, lz); J.turner.rotation.y = ry;
        J.turner.userData.tailMat.emissiveIntensity = brake ? 2.2 : 0.6;
        const ton = u < 0.86 && (jblink % 0.6) < 0.3;
        J.turner.userData.blinkL.emissiveIntensity = ton ? 2.6 : 0;
        J.turner.userData.blinkR.emissiveIntensity = 0;
        if (jz > 36) { jon = false; junctionActive = false; junctionZ = 999; J.grp.visible = false; warn.visible = false; }
      }
    }
    function reset() {
      hon = false; jon = false; junctionActive = false; junctionZ = 999;
      haz.visible = false; triGrp.visible = false; warn.visible = false; J.grp.visible = false;
      ht = 14 + Math.random() * 16; jt = 16 + Math.random() * 16;
    }
    return { update, reset };
  })();

  // ----------------------------- Girişler -----------------------------
  const keys = { left: false, right: false, gas: false, brake: false };
  const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;          // plaka kutusuna yazarken oyun kontrolleri devre dışı
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = true; e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': keys.brake = true; e.preventDefault(); break;
      case 'p': case 'P': case 'Escape': togglePause(); break;
      case 'f': case 'F': setHighBeam(true); e.preventDefault(); break;
      case 'h': case 'H': if (state === State.PLAY) Audio.horn(); break;
      case ' ': if (state === State.MENU || state === State.OVER) startGame(); else setHighBeam(true); e.preventDefault(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (typing(e)) return;
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = false; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
      case 'ArrowUp': case 'w': case 'W': keys.gas = false; break;
      case 'ArrowDown': case 's': case 'S': keys.brake = false; break;
      case 'f': case 'F': case ' ': setHighBeam(false); break;
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
    const press = (e) => { e.preventDefault(); Audio.init(); flashBtn.classList.add('pressed'); setHighBeam(true); };
    const rel = () => { flashBtn.classList.remove('pressed'); setHighBeam(false); };
    flashBtn.addEventListener('touchstart', press, { passive: false });
    flashBtn.addEventListener('touchend', (e) => { e.preventDefault(); rel(); }, { passive: false });
    flashBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); rel(); }, { passive: false });
    flashBtn.addEventListener('mousedown', press);
    window.addEventListener('mouseup', rel);
  }

  // Selektör ışığı (öne doğru parlama)
  const flashLight = new THREE.PointLight(0xfff4d0, 0, 60, 1.5);
  flashLight.position.set(0, 1.2, -3);
  scene.add(flashLight);

  // Öndeki trafiği sinirlendir (selektör)
  function angerAhead() {
    let any = 0;
    for (const car of traffic) {
      if (car.z < 0 && car.z > -130 && Math.abs(laneX(car.lane) - player.x) < LANE_W * 1.6) { car.anger = 7; any++; }
    }
    return any;
  }
  // Selektör basılı tutuldukça uzun far açık kalır; bırakınca normale döner
  function setHighBeam(on) {
    if (state !== State.PLAY) { player.highBeam = false; return; }
    if (on === player.highBeam) return;
    player.highBeam = on;
    if (on) { Audio.flash(); if (angerAhead()) { pushPop('SELEKTÖR!'); Audio.horn(); } }
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
    function whoosh() {   // yakın geçiş "vınn" sesi
      ensure(); if (!A || !enabled) return;
      const ns = A.createBufferSource(); const buf = A.createBuffer(1, A.sampleRate * 0.3, A.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      ns.buffer = buf;
      const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, A.currentTime); bp.frequency.exponentialRampToValueAtTime(2200, A.currentTime + 0.25);
      const g = A.createGain(); g.gain.value = 0.3; g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.3);
      ns.connect(bp); bp.connect(g); g.connect(master); ns.start(); ns.stop(A.currentTime + 0.3);
    }
    function camera() { blip(2600, 0.04, 'square', 0.18); setTimeout(() => blip(1700, 0.05, 'square', 0.14), 55); }
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
    return { init: () => { ensure(); if (A && A.state === 'suspended') A.resume(); }, startEngine, stopEngine, engine, coin, crash, level, ui, flash, horn, whoosh, camera, rain, toggle: () => { enabled = !enabled; return enabled; } };
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

  // Ülke seçimi
  const countriesEl = document.getElementById('countries');
  if (countriesEl) PLATE_COUNTRIES.forEach((co, i) => {
    const b = document.createElement('button');
    b.className = 'country-btn' + (i === 0 ? ' selected' : '');
    b.innerHTML = '<span class="flag">' + co.emoji + '</span>' + co.code;
    b.addEventListener('click', () => {
      player.countryIdx = i;
      document.querySelectorAll('.country-btn').forEach((el, j) => el.classList.toggle('selected', j === i));
      applyPlate(); Audio.init(); Audio.ui();
    });
    countriesEl.appendChild(b);
  });
  // Plaka metni (normal plaka uzunluğu: harf/rakam/boşluk, en çok 9)
  const plateInput = document.getElementById('plate-input');
  if (plateInput) {
    plateInput.value = player.plateText;
    plateInput.addEventListener('input', () => {
      let v = plateInput.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 9);
      plateInput.value = v;
      player.plateText = v.trim() || ' ';
      applyPlate();
    });
  }

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
    level = 1; dist = 0; speedBoost = 1; trafficDensity = 1; score = 0; nearStreak = 0; nearTimer = 0;
    player.x = 0; player.vx = 0; player.lane = 1; player.speed = 0; player.steer = 0; player.grip = 0.35; player.highBeam = false;
    player.model.userData.paint.color.setHex(CAR_COLORS[player.chosen].hex);
    player.model.rotation.set(0, 0, 0); player.model.position.y = 0;
    ENV.reset(); RADAR.reset(); PROPS.reset(); SIDEFX.reset();
    routeIdx = -1; curRegion = REGIONS.marmara;
    curveMul = curRegion.curve; hillMul = curRegion.hill;
    grassCol.set(curRegion.ground); targetGround.set(curRegion.ground);
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
    player.grip = Math.min(1, 0.35 + (level - 1) * 0.13);   // araba gelişir: yol tutuşu artar
    // Mevcut trafiği DEĞİŞTİRME; sadece gerekirse uzağa yeni araç ekle (ani değişim yok)
    const want = Math.round(7 * trafficDensity);
    while (traffic.length < want) addTrafficCar();
    if (levelEl) levelEl.textContent = level; Audio.level();
    pushPop('ARABA GELİŞTİ! · Yol tutuşu ↑');
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

  function explode(px, f) {           // f = darbe şiddeti 0..~1.5
    const colorHex = CAR_COLORS[player.chosen].hex;
    const nDeb = Math.round(6 + f * 30);
    for (let i = 0; i < nDeb; i++) {
      const kind = i % 3;  // 0: kıvılcım, 1: gövde parçası, 2: koyu parça
      let mat, geo;
      if (kind === 0) { mat = new THREE.MeshStandardMaterial({ color: 0xffc24a, emissive: 0xff7a10, emissiveIntensity: 2.4 }); geo = debrisGeo; }
      else { mat = new THREE.MeshStandardMaterial({ color: kind === 1 ? colorHex : 0x23262c, metalness: 0.55, roughness: 0.5 }); geo = i % 2 ? shardGeo : debrisGeo; }
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(kind === 0 ? 0.35 + Math.random() * 0.3 : 0.5 + Math.random() * 0.9);
      m.position.set(px + (Math.random() - 0.5) * 1.4, 0.9 + Math.random() * 0.6, 0.4 + (Math.random() - 0.5) * 1.2);
      m.castShadow = kind !== 0;
      scene.add(m);
      const ang = Math.random() * Math.PI * 2, spd = (2 + Math.random() * 9) * (0.4 + f);
      debris.push({ m, vx: Math.cos(ang) * spd * 0.55, vy: (2 + Math.random() * 8) * (0.4 + f), vz: Math.sin(ang) * spd * 0.4 + 1.5 * f,
        rx: (Math.random() - 0.5) * 14, ry: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14, life: 0, max: 1.1 + Math.random() * 0.7 });
    }
    const nSmoke = Math.round(2 + f * 6);
    for (let i = 0; i < nSmoke; i++) {
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
    const f = Math.min(1.5, player.speed / MAX_SPEED);   // darbe şiddeti
    crash.timer = 1.0 + f * 0.6; crash.shake = 0.3 + f * 0.9; crash.ended = false;
    crash.worldSpd = player.speed;
    crash.vy = 1.2 + f * 9;                               // yavaşta küçük sıçrama, hızlıda havalanır
    crash.rx = (Math.random() - 0.5) * f * 7;             // yavaşta neredeyse hiç dönmez (yere girmez)
    crash.rz = (Math.random() - 0.5) * f * 8;
    player.highBeam = false;
    explode(player.x, f);
    Audio.stopEngine(); Audio.crash(); if (f > 0.35) Audio.horn();
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
    for (const tr of trees) { tr.z += ws * dt; if (tr.z > 25) placeTree(tr); tr.group.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z); }

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
    if (nearTimer > 0) nearTimer -= dt; else nearStreak = 0;
    if (player.highBeam) angerAhead();   // basılı tutuldukça öndeki trafik tedirgin

    const grade = Math.atan2(offY(-9), 9);    // + = yokuş yukarı, - = iniş
    if (keys.gas) player.speed += effMax / 4 * dt;
    else if (keys.brake) player.speed -= effMax / 1.4 * dt;
    else player.speed -= effMax / 6 * dt;
    player.speed -= grade * effMax * 0.7 * dt;   // yokuş yukarı zorlar/yavaşlatır, iniş hızlandırır
    player.speed = Math.max(0, Math.min(player.speed, effMax * 1.06));

    // ---- Yatay hareket: yol tutuşlu/savrulmalı model ----
    // Yüksek hızda tutuş düşer; düşük grip => geç tepki + kayma (momentum kalır)
    const spd01 = player.speed / effMax;
    const gripEff = player.grip * (1 - spd01 * 0.45);            // hızda tutuş azalır
    const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const maxVx = LANE_W * 2.3;
    const want = steerInput * maxVx;
    const resp = 1.2 + gripEff * 7;                             // tepkisellik (grip arttıkça keskin)
    player.vx += (want - player.vx) * Math.min(1, dt * resp);
    // yüksek hız + düşük tutuşta hafif balıkkuyruğu (savrulma)
    if (player.speed > effMax * 0.55) player.vx += Math.sin(dist * 0.6) * (1 - gripEff) * spd01 * 5 * dt;
    player.x += player.vx * dt;
    const lim = ROAD_W / 2 - 0.9;
    if (player.x < -lim - 1.4) { player.x = -lim - 1.4; player.vx *= -0.3; }
    if (player.x > lim + 1.4) { player.x = lim + 1.4; player.vx *= -0.3; }
    // yol dışı (banket) yavaşlama
    if (Math.abs(player.x) > lim) player.speed -= effMax / 1.6 * dt * 0.6;
    if (player.speed < 0) player.speed = 0;   // negatif hıza düşmesin (geri gitmez)

    player.steer += (steerInput - player.steer) * Math.min(1, dt * 9);

    const sp = player.speed;
    dist += sp * dt;
    if (dist > level * 3000) advanceLevel();
    score += sp * dt * 0.05;
    updateRoute(dt, sp);     // il/bölge geçişi, deniz, benzinlik, kavşak, arıza

    // yol dokusu kaydır + yolu/çimeni eğriye göre büker
    roadTex.offset.y -= sp * dt / SEG_WORLD;
    updateRibbons();

    // ağaçlar / coinler dünyayla birlikte yaklaşsın (+z), eğriyi takip eder
    for (const tr of trees) {
      tr.z += sp * dt;
      if (tr.z > 25) placeTree(tr);
      tr.group.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z);
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
      if (car.boost > 0) car.boost -= dt;
      const fast = car.anger > 0 || car.boost > 0;
      // kavşak yakınında sol şeritte dikkatli/yavaş gider
      const cautious = junctionActive && car.lane === 0 && Math.abs(car.z - junctionZ) < 34;
      let target = fast ? car.rageMax : car.cruise;
      if (cautious) target = Math.min(target, car.cruise * 0.55);
      const rate = (fast ? 0.9 : 0.4) * MAX_SPEED;
      car.spd += Math.sign(target - car.spd) * Math.min(Math.abs(target - car.spd), rate * dt);
      car.z += (sp - car.spd) * dt;
      if (car.z > 24) recycleTraffic(car);     // geçildi -> ileri taşı
      if (car.z < -400) car.z = -220;
    }
    // trafik — 1b) ŞERİT DEĞİŞTİRME + SOLLAMA: öndeki yavaşsa boş şeride geçip hızlan
    const plLane = Math.round(player.x / LANE_W + (LANES - 1) / 2);
    for (const car of traffic) {
      if (car.laneCool > 0) car.laneCool -= dt;
      if (!car.canLC || car.laneCool > 0 || Math.abs(car.laneF - car.lane) > 0.08) continue;
      // öndeki yavaş araç var mı?
      let blocked = false;
      for (const o of traffic) {
        if (o === car || o.lane !== car.lane) continue;
        const d = car.z - o.z;                       // o öndeyse d>0
        if (d > 0 && d < car.half + o.half + 11 && o.spd < car.spd - 1.5) { blocked = true; break; }
      }
      let cands;
      if (blocked) cands = [car.lane - 1, car.lane + 1];           // sollama: önce sol şerit
      else if (car.homeLane >= 0 && car.lane !== car.homeLane)     // tır: yol açıksa sağ şeride dön
        cands = [car.lane + Math.sign(car.homeLane - car.lane)];
      else continue;
      for (const cand of cands) {
        if (cand < car.laneMin || cand >= LANES) continue;          // tır en sol şeride girmez
        let clear = true;
        for (const o of traffic) {
          if (o === car) continue;
          if (o.lane === cand || Math.round(o.laneF) === cand) {
            if (Math.abs(o.z - car.z) < car.half + o.half + 7) { clear = false; break; }
          }
        }
        if (clear && cand === plLane && Math.abs(car.z) < car.half + 7) clear = false;  // oyuncuya geçme
        if (clear) {
          if (car.useBlinker) car.blinker = Math.sign(cand - car.lane) || 1;            // sinyal veren araçlar
          car.lane = cand; car.laneCool = 2.5 + Math.random() * 2; if (blocked) car.boost = 2.8;
          break;
        }
      }
    }
    // trafik — 2) araç-takip: aynı şeritte görünür boşluk bırak (dip dibe gitmesinler)
    for (let ln = 0; ln < LANES; ln++) {
      const arr = traffic.filter((c) => c.lane === ln).sort((a, b) => a.z - b.z); // önden (en -z) arkaya
      for (let i = 1; i < arr.length; i++) {
        const front = arr[i - 1], back = arr[i];
        const gap = front.half + back.half + 3.2;       // bagaj-bagaj görünür boşluk
        const minZ = front.z + gap;
        if (back.z < minZ) {                             // sert sınır: içiçe/dip dibe olmaz
          back.z = minZ; back.spd = Math.min(back.spd, front.spd * 0.96);
        } else if (back.z < minZ + 8 && back.spd > front.spd) {
          back.spd = front.spd;                          // erkenden yavaşla, öne ramlamaz
        }
      }
    }
    // trafik — 3) modeli yerleştir, teker, çarpışma
    for (const car of traffic) {
      car.laneF += (car.lane - car.laneF) * Math.min(1, dt * 2.6);   // yumuşak şerit geçişi
      const cx = laneX(car.laneF);
      car.model.position.set(cx + offX(car.z), offY(car.z), car.z);
      car.model.rotation.y = -Math.atan2(offX(car.z - 4) - offX(car.z), 4) - (car.lane - car.laneF) * 0.35;  // viraj + şerit yönü
      // dönüş sinyali: geçiş bitince kapan; sinyal verenlerde köşe ışıkları yanıp söner
      if (car.blinker && Math.abs(car.lane - car.laneF) < 0.05) car.blinker = 0;
      if (car.model.userData.blinkL) {
        const on = (performance.now() % 640) < 320;
        car.model.userData.blinkL.emissiveIntensity = (car.blinker < 0 && on) ? 2.2 : 0;
        car.model.userData.blinkR.emissiveIntensity = (car.blinker > 0 && on) ? 2.2 : 0;
      }
      const roll = (sp - car.spd) * dt / 0.46;
      for (const wgrp of car.model.userData.wheels) wgrp.children[0].rotation.x += roll;
      const lat = Math.abs(cx - player.x);
      if (Math.abs(car.z) < car.half + 1.45 && lat < car.colLat && sp > MAX_SPEED * 0.1) { doCrash(); break; }
      // Yakın geçiş bonusu: aracı geçip arkanda bırakınca, yakınsa ödül (combo'lu)
      if (!car.passed && car.z > 0.6 && sp > car.spd + 4) {
        car.passed = true;
        if (lat < 2.9) {
          nearStreak = nearTimer > 0 ? nearStreak + 1 : 1; nearTimer = 2.5;
          const mult = Math.min(5, nearStreak);
          const closeness = Math.max(0, (2.9 - lat) / 1.2);          // 0..1 (yakınlık)
          const bonus = Math.round((12 + closeness * 48) * mult);
          score += bonus;
          pushPop('YAKIN GEÇİŞ! +' + bonus + (mult > 1 ? '  x' + mult : ''));
          Audio.whoosh();
        }
      }
    }

    RADAR.update(dt, sp);

    // oyuncu model güncelle
    const bank = Math.atan2(offX(-9), 9);      // viraj yönü (yola göre)
    const drift = Math.max(-1, Math.min(1, player.vx / (LANE_W * 2.3)));   // kayma açısı
    player.model.position.x = player.x;
    player.model.rotation.y = -player.steer * 0.10 - bank * 1.1 - drift * 0.32;  // burun yola/kaymaya döner
    player.model.rotation.z = -player.steer * 0.06 - bank * 0.8 + drift * 0.05;  // virajda yana yatar
    player.model.rotation.x = -grade * 1.9;                                      // yokuşta burun kalkar / inişte iner
    const wr = sp * dt / 0.46;
    for (const wgrp of player.model.userData.wheels) wgrp.children[0].rotation.x -= wr;
    // hafif zıplama
    player.model.position.y = Math.sin(dist * 0.5) * 0.02 * (sp / effMax);

    // fren stop parlaması
    player.model.userData.tailMat.emissiveIntensity = keys.brake ? 2.2 : 0.6;

    // selektör ışığı (basılı tutuldukça açık)
    flashLight.position.x = player.x;
    flashLight.intensity = player.highBeam ? 4.5 : 0;

    // kamera takip (viraj ve yokuşa göre belirgin yatar/eğilir)
    const curveAng = Math.atan2(offX(-22), 22);
    camera.position.x += ((player.x * 0.5 + offX(9) * 0.85) - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += ((4.3 + offY(9) * 1.25) - camera.position.y) * 0.12;
    camera.position.z = 9;
    camera.lookAt(player.x * 0.3 + offX(-20) * 1.1, 1.5 + offY(-20) * 1.1, -20);
    camera.rotation.z += ((-player.steer * 0.04 - curveAng * 1.1) - camera.rotation.z) * 0.12;
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
    for (const tr of trees) { tr.z += 30 * dt; if (tr.z > 25) placeTree(tr); tr.group.position.set(tr.x + offX(tr.z), offY(tr.z), tr.z); }
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
