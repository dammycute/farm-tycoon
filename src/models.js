// Low-poly mesh factories built from primitives, plus sprite/texture helpers.
import * as THREE from 'three';
import { ITEMS } from './data.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}
// Unshared material, for objects whose colour/opacity changes per instance.
export const ownMat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0, ...opts });

export function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
const geoCache = new Map();
const boxGeo = (w, h, d) => {
  const k = `${w},${h},${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
};
export const box = (w, h, d, color, pos) => mesh(boxGeo(w, h, d), typeof color === 'object' ? color : mat(color), pos);

// Seeded random so the decoration layout is the same on every load.
export function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function roof(w, d, h, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(-d / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  return mesh(geo, mat(color));
}

export function makeHouse({ w = 4, d = 3, h = 2.2, wall = '#f3e2c0', roofColor = '#c0533a', trim = '#7a4a2a', roofH = 1.4, chimney = false, sign = null }) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, { y: h / 2 }));
  g.add(box(w + 0.15, 0.25, d + 0.15, trim, { y: 0.12 }));
  const r = roof(w + 0.5, d + 0.6, roofH, roofColor);
  r.position.y = h;
  g.add(r);
  g.add(box(0.9, 1.4, 0.08, trim, { y: 0.7, z: d / 2 + 0.04 }));
  for (const sx of [-1, 1]) {
    g.add(box(0.7, 0.6, 0.06, '#9fd3ff', { x: sx * w * 0.3, y: h * 0.6, z: d / 2 + 0.03 }));
    g.add(box(0.85, 0.1, 0.1, trim, { x: sx * w * 0.3, y: h * 0.6 - 0.35, z: d / 2 + 0.05 }));
  }
  if (chimney) {
    g.add(box(0.5, 1.4, 0.5, '#8d8d8d', { x: w * 0.28, y: h + roofH * 0.55, z: -d * 0.15 }));
    g.userData.chimneyTop = new THREE.Vector3(w * 0.28, h + roofH * 0.55 + 0.8, -d * 0.15);
  }
  if (sign) {
    const s = sprite(emojiTexture(sign), 0.9);
    s.center.set(0.5, 0.5);
    s.position.set(0, h + 0.05, d / 2 + 0.45);
    g.add(s);
  }
  g.userData.top = h + roofH;
  return g;
}

export function makeBarn() {
  const g = makeHouse({ w: 5.5, d: 4.5, h: 3.2, wall: '#c6402f', roofColor: '#7d3a2b', trim: '#fff6e8', roofH: 2 });
  g.add(box(1.8, 2, 0.08, '#8e2d20', { y: 1, z: 2.3 }));
  g.add(box(0.12, 2.6, 0.06, '#fff6e8', { y: 1, z: 2.36, rz: 0.73 }));
  g.add(box(0.12, 2.6, 0.06, '#fff6e8', { y: 1, z: 2.36, rz: -0.73 }));
  return g;
}

export function makeTree(rand) {
  const g = new THREE.Group();
  const s = 0.8 + rand() * 0.7;
  g.add(mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.2 * s, 6), mat('#7a4a2a'), { y: 0.6 * s }));
  const green = ['#4f9e3a', '#5cae45', '#3f8c34'][Math.floor(rand() * 3)];
  g.add(mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), mat(green), { y: 1.7 * s, ry: rand() * 3 }));
  g.add(mesh(new THREE.IcosahedronGeometry(0.6 * s, 0), mat(green), { y: 2.4 * s, x: 0.2 * s, ry: rand() * 3 }));
  return g;
}

export function makeBush(rand) {
  const s = 0.4 + rand() * 0.4;
  return mesh(new THREE.IcosahedronGeometry(s, 0), mat('#5cae45'), { y: s * 0.6, ry: rand() * 3 });
}

export function makeRock(rand) {
  const s = 0.2 + rand() * 0.35;
  return mesh(new THREE.DodecahedronGeometry(s, 0), mat('#a9a39a'), { y: s * 0.4, ry: rand() * 3 });
}

export function makeFlower(rand) {
  const g = new THREE.Group();
  const c = ['#ff6b8b', '#ffd23f', '#ffffff', '#b38cff'][Math.floor(rand() * 4)];
  g.add(box(0.04, 0.25, 0.04, '#5cae45', { y: 0.12, cast: false }));
  g.add(mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(c), { y: 0.27, cast: false }));
  return g;
}

export function makeFence(w, d) {
  const g = new THREE.Group();
  const post = boxGeo(0.15, 0.8, 0.15);
  const wood = mat('#b98a5a');
  const addSide = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      g.add(mesh(post, wood, { x: x1 + ((x2 - x1) * i) / n, y: 0.4, z: z1 + ((z2 - z1) * i) / n }));
    }
    for (const y of [0.3, 0.6]) {
      const rail = mesh(new THREE.BoxGeometry(len, 0.08, 0.06), wood, { x: (x1 + x2) / 2, y, z: (z1 + z2) / 2 });
      rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      g.add(rail);
    }
  };
  const hw = w / 2, hd = d / 2;
  addSide(-hw, -hd, hw, -hd);
  addSide(-hw, hd, hw, hd);
  addSide(-hw, -hd, -hw, hd);
  addSide(hw, -hd, hw, hd);
  return g;
}

export function makePlot(size) {
  const g = new THREE.Group();
  g.add(box(size, 0.2, size, '#8a5a35', { y: 0.1 }));
  for (let k = -1; k <= 1; k++) g.add(box(size * 0.9, 0.05, 0.14, '#6e4527', { y: 0.22, z: (k * size) / 3.3 }));
  return g;
}

// A patch of one crop on a plot. Returns the group plus the material we tint as it ripens.
export function makeCrop(kind, size, rand) {
  const g = new THREE.Group();
  const ripeMat = ownMat(kind === 'wheat' ? '#e8c35a' : '#f2d34b');
  const leaf = ownMat('#6bbf45');
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      if ((r + c) % 2 && kind === 'corn') continue;
      const clump = new THREE.Group();
      clump.position.set((c * size) / 3.3 + (rand() - 0.5) * 0.12, 0.2, (r * size) / 3.3 + (rand() - 0.5) * 0.12);
      clump.rotation.y = rand() * Math.PI;
      if (kind === 'wheat') {
        for (let s = 0; s < 3; s++) {
          const a = (s / 3) * Math.PI * 2;
          const sx = Math.cos(a) * 0.09, sz = Math.sin(a) * 0.09;
          clump.add(mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.6, 4), leaf, { x: sx, y: 0.3, z: sz, cast: false }));
          const head = mesh(new THREE.IcosahedronGeometry(0.08, 0), ripeMat, { x: sx, y: 0.68, z: sz });
          head.scale.y = 2.4;
          clump.add(head);
        }
      } else {
        clump.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5), leaf, { y: 0.55 }));
        for (const a of [0.6, -0.7]) clump.add(mesh(new THREE.ConeGeometry(0.09, 0.7, 3), leaf, { y: 0.5, rz: a, x: a * 0.22 }));
        clump.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.36, 6), ripeMat, { y: 0.72, x: 0.07, rz: -0.2 }));
      }
      g.add(clump);
    }
  }
  g.userData.ripeMat = ripeMat;
  g.userData.ripeColor = ripeMat.color.clone();
  return g;
}

export function makeCow() {
  const g = new THREE.Group();
  const white = mat('#f7f4ee'), black = mat('#2f2a26'), pink = mat('#f1a7a0');
  g.add(box(1.2, 0.65, 0.65, white, { y: 0.75 }));
  g.add(box(0.35, 0.3, 0.67, black, { x: -0.2, y: 0.85 }));
  g.add(box(0.25, 0.25, 0.67, black, { x: 0.3, y: 0.7 }));
  g.add(box(0.45, 0.45, 0.45, white, { x: 0.75, y: 1.05 }));
  g.add(box(0.2, 0.25, 0.4, pink, { x: 1.0, y: 0.95 }));
  for (const z of [-0.18, 0.18]) g.add(box(0.06, 0.15, 0.06, '#e8d8b0', { x: 0.75, y: 1.33, z }));
  for (const x of [-0.45, 0.45]) for (const z of [-0.22, 0.22]) g.add(box(0.15, 0.45, 0.15, black, { x, y: 0.22, z }));
  g.scale.setScalar(0.85);
  return g;
}

export function makeTruck() {
  const g = new THREE.Group();
  g.add(box(3, 0.5, 1.7, '#3d7fd9', { x: -0.4, y: 0.75 }));
  g.add(box(3, 0.5, 0.08, '#2f68b8', { x: -0.4, y: 1.2, z: 0.82 }));
  g.add(box(3, 0.5, 0.08, '#2f68b8', { x: -0.4, y: 1.2, z: -0.82 }));
  g.add(box(0.08, 0.5, 1.7, '#2f68b8', { x: -1.88, y: 1.2 }));
  g.add(box(1.2, 1.3, 1.7, '#2f68b8', { x: 1.7, y: 1.15 }));
  g.add(box(0.06, 0.6, 1.4, '#bfe6ff', { x: 2.31, y: 1.4 }));
  const wheel = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
  for (const x of [-1.3, 0.2, 1.7]) for (const z of [-0.85, 0.85]) g.add(mesh(wheel, mat('#2f2a26'), { x, y: 0.35, z, rx: Math.PI / 2 }));
  g.userData.bed = new THREE.Vector3(-0.4, 1.0, 0);
  return g;
}

// Chunky low-poly person. hat: 'straw' | 'cap' | null.
export function makePerson({ shirt = '#d9534f', pants = '#3f6fb5', skin = '#f1c7a0', hat = null, hatColor = '#e6c86e', hair = '#5a3b22', overalls = false, scale = 1 }) {
  const g = new THREE.Group();
  const legs = [], arms = [];
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.48, 0);
    leg.add(box(0.18, 0.4, 0.2, pants, { y: -0.2 }));
    leg.add(box(0.2, 0.12, 0.27, '#6b4220', { y: -0.42, z: 0.03 }));
    g.add(leg);
    legs.push(leg);
  }
  g.add(box(0.5, 0.5, 0.32, overalls ? pants : shirt, { y: 0.74 }));
  if (overalls) {
    g.add(box(0.5, 0.22, 0.33, shirt, { y: 0.9 }));
    g.add(box(0.36, 0.26, 0.02, pants, { y: 0.84, z: 0.17 }));
    for (const sx of [-0.13, 0.13]) g.add(box(0.07, 0.24, 0.34, pants, { x: sx, y: 0.92 }));
  }
  for (const sx of [-0.31, 0.31]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 0.95, 0);
    arm.add(box(0.14, 0.4, 0.16, shirt, { y: -0.18 }));
    arm.add(box(0.14, 0.12, 0.14, skin, { y: -0.42 }));
    g.add(arm);
    arms.push(arm);
  }
  g.add(mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(skin), { y: 1.29 }));
  for (const sx of [-0.1, 0.1]) g.add(box(0.06, 0.08, 0.03, '#2f2a26', { x: sx, y: 1.32, z: 0.26, cast: false }));
  g.add(box(0.12, 0.03, 0.03, '#a0522d', { y: 1.2, z: 0.26, cast: false }));
  if (hat === 'straw') {
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10), mat(hatColor), { y: 1.48 }));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.24, 10), mat(hatColor), { y: 1.6 }));
    g.add(mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 10), mat('#a0522d'), { y: 1.52 }));
  } else if (hat === 'cap') {
    g.add(mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.18, 10), mat(hatColor), { y: 1.5 }));
    g.add(box(0.32, 0.04, 0.22, hatColor, { y: 1.43, z: 0.26 }));
  } else {
    const h = mesh(new THREE.IcosahedronGeometry(0.29, 1), mat(hair), { y: 1.37, z: -0.03 });
    h.scale.set(1, 0.7, 1);
    g.add(h);
  }
  g.scale.setScalar(scale);
  g.userData = { legs, arms };
  return g;
}

export function animatePerson(g, walk, t, carrying) {
  const { legs, arms } = g.userData;
  const s = Math.sin(t * 12) * 0.7 * walk;
  legs[0].rotation.x = s;
  legs[1].rotation.x = -s;
  if (carrying) {
    arms[0].rotation.x = arms[1].rotation.x = -1.2;
  } else {
    arms[0].rotation.x = -s * 0.8;
    arms[1].rotation.x = s * 0.8;
  }
}

// ---------- items ----------
export const ITEM_H = 0.2; // stacking layer height
export function makeItem(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'wheat':
      g.add(box(0.46, 0.16, 0.26, '#e8c35a', { y: 0.08 }));
      g.add(box(0.08, 0.17, 0.27, '#a0702a', { y: 0.08 }));
      break;
    case 'corn':
      g.add(mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.38, 6), mat('#f2d34b'), { y: 0.09, rz: Math.PI / 2 }));
      g.add(mesh(new THREE.ConeGeometry(0.1, 0.2, 5), mat('#6bbf45'), { x: -0.25, y: 0.09, rz: Math.PI / 2 }));
      break;
    case 'egg':
      g.add(box(0.42, 0.08, 0.3, '#c9a06b', { y: 0.04 }));
      for (const x of [-0.1, 0.1]) for (const z of [-0.07, 0.07]) {
        const e = mesh(new THREE.IcosahedronGeometry(0.075, 1), mat('#fff4e0'), { x, y: 0.13, z });
        e.scale.y = 1.25;
        g.add(e);
      }
      break;
    case 'milk':
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 8), mat('#ffffff'), { y: 0.09, rz: Math.PI / 2 }));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 8), mat('#ffffff'), { x: 0.2, y: 0.09, rz: Math.PI / 2 }));
      g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), mat('#3d7fd9'), { x: 0.27, y: 0.09, rz: Math.PI / 2 }));
      break;
    case 'bread':
      g.add(box(0.42, 0.12, 0.24, '#c98a3c', { y: 0.06 }));
      g.add(box(0.38, 0.07, 0.2, '#b07230', { y: 0.15 }));
      break;
    case 'cheese':
      g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.16, 7), mat('#f5c542'), { y: 0.08 }));
      break;
  }
  return g;
}

const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10);
export const makeCoin = () => mesh(coinGeo, mat('#f6c12b', { emissive: '#7a5200', emissiveIntensity: 0.25 }), { cast: false });

export function makeShelf(item) {
  const g = new THREE.Group();
  g.add(box(1.9, 0.12, 1.1, '#c98f55', { y: 0.72 }));
  for (const x of [-0.85, 0.85]) for (const z of [-0.45, 0.45]) g.add(box(0.1, 0.72, 0.1, '#8e5a35', { x, y: 0.36, z }));
  g.add(box(1.9, 0.5, 0.06, '#e2c08f', { y: 0.45, z: 0.53 }));
  for (const x of [-0.9, 0.9]) g.add(box(0.08, 1.6, 0.08, '#8e5a35', { x, y: 1.5, z: 0.5 }));
  const awning = box(2.1, 0.08, 0.8, '#e0533d', { y: 2.3, z: 0.35, rx: 0.35 });
  g.add(awning);
  const sign = sprite(itemTexture(item), 0.55);
  sign.center.set(0.5, 0.5);
  sign.position.set(0, 1.85, 0.6);
  g.add(sign);
  return g;
}

export function makeCounter() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.9, 1, '#8e5a35', { y: 0.45 }));
  g.add(box(2.5, 0.1, 1.1, '#d9a066', { y: 0.95 }));
  g.add(box(0.6, 0.35, 0.45, '#5f6b73', { x: 0.5, y: 1.17 }));
  g.add(box(0.5, 0.2, 0.05, '#9fd3ff', { x: 0.5, y: 1.3, z: 0.2, rx: -0.4 }));
  const sign = sprite(emojiTexture('💰'), 0.7);
  sign.center.set(0.5, 0.5);
  sign.position.set(-0.6, 1.6, 0);
  g.add(sign);
  return g;
}

export function makeTrough() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.35, 0.6, '#8a5a35', { y: 0.18 }));
  g.add(box(1.25, 0.06, 0.45, '#5a3a20', { y: 0.33 }));
  return g;
}

export function makeTray() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.15, 1.0, '#c9a06b', { y: 0.08 }));
  return g;
}

export function makePuff() {
  return mesh(new THREE.IcosahedronGeometry(0.25, 0), ownMat('#ffffff', { transparent: true, opacity: 0.8 }), { cast: false });
}

export function makeArrow() {
  const g = new THREE.Group();
  const m = ownMat('#ffd23f', { emissive: '#ffb300', emissiveIntensity: 0.6 });
  g.add(mesh(new THREE.ConeGeometry(0.35, 0.6, 4), m, { y: 0.3, rx: Math.PI, cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), m, { y: 0.8, cast: false }));
  return g;
}

// Ground pad: rounded outline with an icon, lying flat. Used for drop/pick-up spots.
export function makePad(emoji, size = 1.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 24);
  ctx.fill();
  ctx.stroke();
  if (emoji) {
    ctx.globalAlpha = 0.85;
    ctx.font = `56px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

// Unlock zone: dashed square with a fill bar and a price label.
export function makeZone(size = 2.2) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.setLineDash([16, 10]);
  ctx.beginPath();
  ctx.roundRect(6, 6, 116, 116, 18);
  ctx.fill();
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const base = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.035;
  g.add(base);
  const fillGeo = new THREE.PlaneGeometry(1, size * 0.86);
  fillGeo.translate(0.5, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#7ed957', transparent: true, opacity: 0.65, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(-size * 0.43, 0.04, 0);
  g.add(fill);
  const label = labelSprite('', 0.75);
  label.position.y = 0.4;
  g.add(label);
  g.userData = { fill, label, size };
  return g;
}

// ---------- textures & sprites ----------
const loader = new THREE.TextureLoader();
const texCache = new Map();

export function imageTexture(url) {
  if (!texCache.has(url)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, t);
  }
  return texCache.get(url);
}

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
export function emojiTexture(emoji) {
  const key = 'emoji:' + emoji;
  if (!texCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = `100px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

export const itemTexture = id => (ITEMS[id].img ? imageTexture(ITEMS[id].img) : emojiTexture(ITEMS[id].emoji));

export function sprite(texture, size, aspect = 1, opts = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, ...opts }));
  s.scale.set(size * aspect, size, 1);
  s.center.set(0.5, 0);
  return s;
}

// Rounded label sprite; call setLabel again to change its text.
export function labelSprite(text, height = 0.9, style = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  s.userData.height = height;
  s.userData.style = style;
  setLabel(s, text);
  return s;
}

export function setLabel(s, text) {
  if (s.userData.text === text) return;
  s.userData.text = text;
  const { bg = 'rgba(255,250,240,.95)', fg = '#3b2f22', border = '#ead9bd' } = s.userData.style;
  const lines = String(text).split('\n');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `600 56px Fredoka, ${EMOJI_FONT}`;
  ctx.font = font;
  const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + 56;
  const h = 24 + lines.length * 64;
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 36);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 46 + i * 64));
  s.material.map?.dispose();
  s.material.map = new THREE.CanvasTexture(c);
  s.material.map.colorSpace = THREE.SRGBColorSpace;
  s.material.needsUpdate = true;
  const lh = s.userData.height * (h / 88);
  s.scale.set((lh * w) / h, lh, 1);
  s.visible = text !== '';
}
