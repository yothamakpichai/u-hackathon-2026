// Penny landing scene: a small low-poly floating town drawn with Three.js (MIT, vendored in /vendor/three).
// Everything is procedural (no external models or textures), so there is nothing to license and nothing to fetch.
// The camera eases between focus points as the visitor scrolls; reduced motion snaps and stops the idle motion.
import * as THREE from '../vendor/three/three.module.min.js';

const GOLD = 0xf2b33d;
const COLORS = {
  grass: 0x2f9a63,
  grassDark: 0x237a4e,
  earth: 0x6b4a33,
  rock: 0x4a3a2e,
  cream: 0xf3e6c8,
  red: 0xd9544d,
  navy: 0x24435c,
  green: 0x19c37d,
  loss: 0xe5534b,
  lavender: 0xc9b6f2,
  purple: 0x6b4fbf,
  barn: 0xc8553d,
  barnRoof: 0x7a2e22,
  pink: 0xf28ca0,
  dome: 0xd7dee4,
  scaffold: 0xe39b3b,
  trunk: 0x6b4a33,
  leaf: 0x2f8f5b,
  mint: 0x7fd9b6,
};

// Building anchors on the island (x, z) and where the camera sits when it looks at each one.
const SPOTS = {
  school: { x: -6.2, z: 3.2 },
  market: { x: -1.2, z: -6.4 },
  future: { x: 5.6, z: -3.4 },
  money: { x: 5.4, z: 4.6 },
  research: { x: -0.4, z: 7.4 },
};

const FOCUS = {
  hero: { pos: [0, 15, 36], look: [0, 2.5, 0] },
  problem: { pos: [-22, 24, 32], look: [0, 1, 0] },
  school: lookAt('school'),
  market: lookAt('market'),
  future: lookAt('future'),
  money: lookAt('money'),
  research: lookAt('research'),
  ai: { pos: [0, 14, 27], look: [0, 7, 0] },
  wide: { pos: [30, 30, 38], look: [0, 0, 0] },
};

function lookAt(key) {
  const s = SPOTS[key];
  const len = Math.hypot(s.x, s.z) || 1;
  const dx = s.x / len;
  const dz = s.z / len;
  return { pos: [s.x + dx * 17, 11, s.z + dz * 17], look: [s.x, 2.2, s.z] };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
}

function mesh(geo, material, { x = 0, y = 0, z = 0, ry = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function jitter(geo, amount, rand) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (rand() - 0.5) * amount, p.getY(i) + (rand() - 0.5) * amount * 0.6, p.getZ(i) + (rand() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pennyFace() {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    const grad = g.createLinearGradient(0, 0, 0, w);
    grad.addColorStop(0, '#FFD466');
    grad.addColorStop(1, '#F5A524');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(255,240,199,0.9)';
    g.lineWidth = 18;
    g.beginPath();
    g.arc(c, c, w * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.65)';
    g.lineWidth = 26;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(c, c, w * 0.36, Math.PI * 1.08, Math.PI * 1.36);
    g.stroke();
    g.fillStyle = '#0F1C17';
    for (const ex of [-0.12, 0.12]) {
      g.beginPath();
      g.ellipse(c + ex * w, c - 0.02 * w, 22, 29, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#FFFFFF';
    for (const ex of [-0.105, 0.135]) {
      g.beginPath();
      g.arc(c + ex * w, c - 0.045 * w, 8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(239,122,90,0.5)';
    for (const ex of [-0.2, 0.2]) {
      g.beginPath();
      g.ellipse(c + ex * w, c + 0.08 * w, 27, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#0F1C17';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(c - 0.09 * w, c + 0.08 * w);
    g.quadraticCurveTo(c, c + 0.17 * w, c + 0.09 * w, c + 0.08 * w);
    g.stroke();
  });
}

function clockFace() {
  return canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#FFF8E7';
    g.beginPath();
    g.arc(c, c, c - 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6B4FBF';
    g.lineWidth = 10;
    g.stroke();
    g.fillStyle = '#3C2C7A';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.arc(c + Math.cos(a) * (c - 30), c + Math.sin(a) * (c - 30), i % 3 === 0 ? 8 : 4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#3C2C7A';
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c, c - 70);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + 50, c + 20);
    g.stroke();
  });
}

function buildSchool() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.2, 2.6), mat(COLORS.cream), { y: 1.1 }));
  const roof = mesh(new THREE.ConeGeometry(2.6, 1.7, 4), mat(COLORS.red), { y: 3.05, ry: Math.PI / 4 });
  roof.scale.set(1.05, 1, 0.8);
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), mat(0x8a5a3c), { y: 0.6, z: 1.33 }));
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), mat(COLORS.cream), { y: 4.2 }));
  g.add(mesh(new THREE.ConeGeometry(0.75, 0.9, 4), mat(COLORS.red), { y: 5.2, ry: Math.PI / 4 }));
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(GOLD, { metalness: 0.3, roughness: 0.4, emissive: 0x4a2a00 }), { y: 4.2, z: 0.5 }));
  return g;
}

function buildMarket(state) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.8, 5.2, 2.8), mat(COLORS.navy), { y: 2.6 }));
  const glass = mat(0x8fd3ff, { emissive: 0x2b6f9a, emissiveIntensity: 0.6, roughness: 0.3 });
  for (let row = 0; row < 4; row++) {
    for (const x of [-0.7, 0, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.4, 0.55, 0.05), glass, { x, y: 1.1 + row * 1.05, z: 1.42, cast: false }));
  }
  const bars = [
    [1.0, COLORS.green],
    [1.6, COLORS.loss],
    [1.2, COLORS.green],
    [2.1, COLORS.green],
    [1.4, COLORS.loss],
  ];
  state.candles = [];
  bars.forEach(([h, color], i) => {
    const m = mesh(new THREE.BoxGeometry(0.34, h, 0.34), mat(color, { emissive: color, emissiveIntensity: 0.35 }), { x: -1 + i * 0.5, y: 5.2 + h / 2, z: 0 });
    m.userData.base = h;
    state.candles.push(m);
    g.add(m);
  });
  return g;
}

function buildFuture() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.25, 1.45, 6, 8), mat(COLORS.lavender), { y: 3 }));
  g.add(mesh(new THREE.ConeGeometry(1.7, 2.2, 8), mat(COLORS.purple), { y: 7.1 }));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.6 }));
  face.position.set(0, 4.7, 1.32);
  g.add(face);
  return g;
}

function buildMoney() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 2.6), mat(COLORS.barn), { y: 1.1 }));
  const roof = mesh(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 3), mat(COLORS.barnRoof), { y: 2.75 });
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.75);
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(1.1, 1.4, 0.1), mat(COLORS.cream), { y: 0.7, z: 1.33 }));
  const pig = new THREE.Group();
  pig.add(mesh(new THREE.SphereGeometry(0.75, 10, 8), mat(COLORS.pink)));
  pig.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 10), mat(0xe8738c), { z: 0.75 }));
  pig.children[1].rotation.x = Math.PI / 2;
  pig.add(mesh(new THREE.ConeGeometry(0.2, 0.35, 4), mat(COLORS.pink), { x: -0.35, y: 0.7 }));
  pig.add(mesh(new THREE.ConeGeometry(0.2, 0.35, 4), mat(COLORS.pink), { x: 0.35, y: 0.7 }));
  pig.position.set(2.5, 0.8, 1.2);
  g.add(pig);
  const coin = mat(GOLD, { metalness: 0.3, roughness: 0.4, emissive: 0x4a2a00 });
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 18), coin, { x: -2.3, y: 0.07 + i * 0.15, z: 1.3 }));
  return g;
}

function buildResearch() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(2, 2.1, 1.1, 12), mat(COLORS.dome), { y: 0.55 }));
  g.add(mesh(new THREE.SphereGeometry(1.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(COLORS.dome), { y: 1.1 }));
  const s = mat(COLORS.scaffold);
  for (const x of [-2.3, 2.3]) for (const z of [-2.3, 2.3]) g.add(mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), s, { x, y: 1.6, z }));
  for (const y of [1.2, 2.6]) {
    g.add(mesh(new THREE.BoxGeometry(4.7, 0.1, 0.12), s, { y, z: 2.3 }));
    g.add(mesh(new THREE.BoxGeometry(4.7, 0.1, 0.12), s, { y, z: -2.3 }));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 4.7), s, { x: 2.3, y }));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 4.7), s, { x: -2.3, y }));
  }
  return g;
}

export function createScene(canvas, { reduced = false, lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d2b2d, 45, 120);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xcdeeff, 0x1d2b1f, 1.0));
  const sun = new THREE.DirectionalLight(0xffe2a8, 2.4);
  sun.position.set(18, 30, 14);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fd9b6, 0.8);
  rim.position.set(-20, 10, -20);
  scene.add(rim);

  const rand = rng(20261016);
  const world = new THREE.Group();
  scene.add(world);

  // Island: grass cap, earth band and a rocky underside.
  world.add(mesh(jitter(new THREE.CylinderGeometry(13.6, 13.2, 0.9, 11, 1), 0.35, rand), mat(COLORS.grass), { y: -0.45, cast: false, receive: true }));
  world.add(mesh(jitter(new THREE.CylinderGeometry(13.2, 10.5, 2.4, 11, 2), 0.5, rand), mat(COLORS.earth), { y: -2.1, cast: false }));
  const under = mesh(jitter(new THREE.ConeGeometry(10.4, 9, 11, 3), 0.9, rand), mat(COLORS.rock), { y: -7.8, cast: false });
  under.rotation.x = Math.PI;
  world.add(under);

  // Paths: flat light strips from the centre to each building.
  const pathMat = mat(0xe9dcb8, { roughness: 1 });
  for (const s of Object.values(SPOTS)) {
    const len = Math.hypot(s.x, s.z);
    const p = mesh(new THREE.BoxGeometry(0.9, 0.05, len), pathMat, { x: s.x / 2, y: 0.02, z: s.z / 2, cast: false, receive: true });
    p.rotation.y = Math.atan2(s.x, s.z);
    world.add(p);
  }
  world.add(mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.06, 20), pathMat, { y: 0.03, cast: false, receive: true }));

  const state = {};
  const builders = { school: buildSchool, market: () => buildMarket(state), future: buildFuture, money: buildMoney, research: buildResearch };
  const buildings = {};
  for (const [key, build] of Object.entries(builders)) {
    const b = build();
    const s = SPOTS[key];
    b.position.set(s.x, 0, s.z);
    b.rotation.y = Math.atan2(s.x, s.z);
    world.add(b);
    buildings[key] = b;
  }

  // Focus ring under the building the visitor is reading about.
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.6, 48), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  world.add(ring);

  // Trees, placed deterministically away from the buildings and paths.
  const leaf = mat(COLORS.leaf);
  const leaf2 = mat(COLORS.grassDark);
  const trunk = mat(COLORS.trunk);
  let placed = 0;
  for (let i = 0; i < 400 && placed < (lowPower ? 14 : 24); i++) {
    const a = rand() * Math.PI * 2;
    const r = 3 + rand() * 9.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Object.values(SPOTS).some((s) => Math.hypot(s.x - x, s.z - z) < 3.4)) continue;
    const h = 1.2 + rand() * 1.4;
    world.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5), trunk, { x, y: 0.3, z }));
    world.add(mesh(new THREE.ConeGeometry(0.55 + rand() * 0.3, h, 6), rand() > 0.5 ? leaf : leaf2, { x, y: 0.6 + h / 2, z, ry: rand() * 3 }));
    placed++;
  }

  // Penny: a big friendly coin floating over the square.
  const faceTex = pennyFace();
  const goldSide = new THREE.MeshStandardMaterial({ color: 0xe59a1c, metalness: 0.3, roughness: 0.4, emissive: 0x3a2200 });
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.25, roughness: 0.45 });
  const penny = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.5, 56), [goldSide, faceMat, faceMat]);
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  penny.add(coin);
  const sprout = mat(0x0da678);
  const l1 = mesh(new THREE.SphereGeometry(0.5, 8, 6), sprout, { x: -0.45, y: 2.75 });
  l1.scale.set(1.3, 0.45, 0.6);
  l1.rotation.z = 0.5;
  const l2 = mesh(new THREE.SphereGeometry(0.5, 8, 6), mat(0x14b886), { x: 0.45, y: 2.8 });
  l2.scale.set(1.3, 0.45, 0.6);
  l2.rotation.z = -0.5;
  penny.add(l1, l2, mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), mat(0x076b4d), { y: 2.45 }));
  penny.position.set(0, 9.2, 0);
  scene.add(penny);
  const glow = new THREE.PointLight(0xffc35a, 30, 18, 2);
  glow.position.set(0, 9.2, 2.5);
  scene.add(glow);

  // Orbiting coins (instanced) and a field of soft dust.
  const n = lowPower ? 28 : 70;
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 16), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.3, roughness: 0.35, emissive: 0x5a3300 }), n);
  const orbits = Array.from({ length: n }, () => ({ r: 10 + rand() * 13, h: -1 + rand() * 12, s: (0.08 + rand() * 0.18) * (rand() > 0.5 ? 1 : -1), p: rand() * Math.PI * 2, spin: 1 + rand() * 2 }));
  scene.add(coins);
  const dummy = new THREE.Object3D();

  const dustCount = lowPower ? 250 : 700;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 30 + rand() * 70;
    const t = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    dustPos.set([r * Math.sin(ph) * Math.cos(t), r * Math.cos(ph) * 0.6 + 10, r * Math.sin(ph) * Math.sin(t)], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dotTex = canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe3a3, map: dotTex, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // Camera state.
  const cam = { pos: new THREE.Vector3(0, 46, 96), look: new THREE.Vector3(0, 0, 0) };
  const want = { pos: new THREE.Vector3(...FOCUS.hero.pos), look: new THREE.Vector3(...FOCUS.hero.look) };
  let focusKey = 'hero';
  let ringTarget = 0;
  const pointer = { x: 0, y: 0 };
  let zoom = 1;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    zoom = camera.aspect < 0.75 ? 1.55 : camera.aspect < 1.1 ? 1.25 : 1;
    camera.updateProjectionMatrix();
  }

  // On wide screens the text sits on one side, so the camera slides to put the subject on the other side.
  const SIDE = { hero: -1, school: -1, market: 1, future: -1, money: 1, research: -1 };
  function setFocus(key) {
    const f = FOCUS[key] || FOCUS.hero;
    focusKey = key;
    want.pos.set(...f.pos);
    want.look.set(...f.look);
    const side = SIDE[key];
    if (side && camera.aspect > 1.1) {
      const fwd = want.look.clone().sub(want.pos).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const shift = right.multiplyScalar(side * (key === 'hero' ? 10 : 6));
      want.pos.add(shift);
      want.look.add(shift);
    }
    // Phones: lift the island into the top half so the hero text below stays readable.
    if (key === 'hero' && camera.aspect < 0.9) {
      want.pos.y -= 8;
      want.look.y -= 8;
    }
    const s = SPOTS[key];
    if (s) {
      ring.position.x = s.x;
      ring.position.z = s.z;
      ringTarget = 0.85;
    } else {
      ringTarget = 0;
    }
    if (reduced) {
      cam.pos.copy(want.pos);
      cam.look.copy(want.look);
      ring.material.opacity = ringTarget;
      renderOnce();
    }
  }

  function placeCamera() {
    const centre = cam.look;
    const offset = cam.pos.clone().sub(centre).multiplyScalar(zoom);
    camera.position.copy(centre).add(offset);
    if (!reduced) {
      camera.position.x += pointer.x * 1.6;
      camera.position.y += pointer.y * 0.9;
    }
    camera.lookAt(centre);
  }

  function renderOnce() {
    placeCamera();
    renderer.render(scene, camera);
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let running = false;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 1.9);
    cam.pos.lerp(want.pos, k);
    cam.look.lerp(want.look, k);
    ring.material.opacity += (ringTarget - ring.material.opacity) * k;
    ring.rotation.z += dt * 0.4;

    penny.position.y = 9.2 + Math.sin(t * 1.3) * 0.35;
    penny.rotation.y = Math.sin(t * 0.55) * 0.5 + (focusKey === 'ai' ? 0 : 0);
    glow.intensity = 26 + Math.sin(t * 2) * 6;
    world.rotation.y = Math.sin(t * 0.08) * 0.06;

    if (state.candles) {
      state.candles.forEach((m, i) => {
        const s = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 1.3));
        m.scale.y = s;
        m.position.y = 5.2 + (m.userData.base * s) / 2;
      });
    }

    for (let i = 0; i < n; i++) {
      const o = orbits[i];
      const a = o.p + t * o.s;
      dummy.position.set(Math.cos(a) * o.r, o.h + Math.sin(t * 0.7 + o.p) * 0.6, Math.sin(a) * o.r);
      dummy.rotation.set(Math.PI / 2 + Math.sin(t + o.p) * 0.4, t * o.spin, 0);
      dummy.updateMatrix();
      coins.setMatrixAt(i, dummy.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
    dust.rotation.y = t * 0.012;

    placeCamera();
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    clock.getDelta();
    frame();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Static first frame for reduced motion: place every instanced coin once.
  for (let i = 0; i < n; i++) {
    const o = orbits[i];
    dummy.position.set(Math.cos(o.p) * o.r, o.h, Math.sin(o.p) * o.r);
    dummy.rotation.set(Math.PI / 2, o.p, 0);
    dummy.updateMatrix();
    coins.setMatrixAt(i, dummy.matrix);
  }

  resize();
  setFocus('hero');
  window.addEventListener('resize', () => {
    resize();
    if (reduced) renderOnce();
  });
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  if (reduced) {
    cam.pos.copy(want.pos);
    cam.look.copy(want.look);
    renderOnce();
  } else {
    start();
  }

  return { setFocus, start, stop };
}
