// The 3D farm: scene, follow camera, stations built from data, per-frame visual sync and flying-item effects.
import * as THREE from 'three';
import {
  FIELDS, FIELD_GRID, PENS, MACHINES, SHELVES, STALL_COINS, TRUCK, ROAD_Z, ZONES, CAPS, ITEMS,
} from './data.js';
import * as M from './models.js';
import * as Sim from './sim.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

export function plotPos(field, i) {
  const f = FIELDS[field], { cols, size, gap } = FIELD_GRID;
  return V(f.pos[0] + ((i % cols) - 1) * (size + gap), f.pos[1] + (Math.floor(i / cols) - 1) * (size + gap));
}

// Interaction pads: where a character stands to drop off or pick up.
function buildPads() {
  const pads = [];
  for (const [id, p] of Object.entries(PENS)) {
    const [x, z] = p.pos, [w, d] = p.size;
    pads.push({ kind: 'penIn', id, key: `pen:${id}`, item: p.feed, pos: V(x - w / 4, z + d / 2 + 1.25), emoji: ITEMS[p.feed].emoji });
    pads.push({ kind: 'penOut', id, key: `pen:${id}`, item: p.product, pos: V(x + w / 4, z + d / 2 + 1.25), emoji: '🫳' });
  }
  for (const [id, m] of Object.entries(MACHINES)) {
    const [x, z] = m.pos;
    pads.push({ kind: 'machIn', id, key: `machine:${id}`, item: m.input, pos: V(x - 1.3, z + 2.7), emoji: ITEMS[m.input].emoji });
    pads.push({ kind: 'machOut', id, key: `machine:${id}`, item: m.output, pos: V(x + 1.3, z + 2.7), emoji: '🫳' });
  }
  for (const [item, [x, z]] of Object.entries(SHELVES)) {
    pads.push({ kind: 'shelf', id: item, key: `shelf:${item}`, item, pos: V(x, z - 1.35), emoji: '' });
    pads.push({ kind: 'cash', id: item, key: `shelf:${item}`, item, pos: V(x + STALL_COINS[0], z + STALL_COINS[1]), emoji: '', size: 1.3 });
  }
  pads.push({ kind: 'truck', key: 'truck', pos: V(TRUCK[0], TRUCK[1] - 2.3), emoji: '📦' });
  return pads;
}

// A grid of identical meshes that grows in layers, used for every pile in the game.
class Pile {
  constructor(parent, make, { cols = 3, rows = 2, dx = 0.48, dz = 0.34, dy = M.ITEM_H, max = 24, origin = V(0, 0) } = {}) {
    Object.assign(this, { parent, make, cols, rows, dx, dz, dy, max, origin, meshes: [] });
  }
  set(n) {
    n = Math.min(n, this.max);
    while (this.meshes.length < n) {
      const i = this.meshes.length, per = this.cols * this.rows, k = i % per;
      const m = this.make();
      m.position.set(
        this.origin.x + ((k % this.cols) - (this.cols - 1) / 2) * this.dx,
        this.origin.y + Math.floor(i / per) * this.dy,
        this.origin.z + (Math.floor(k / this.cols) - (this.rows - 1) / 2) * this.dz,
      );
      this.parent.add(m);
      this.meshes.push(m);
    }
    this.meshes.forEach((m, i) => (m.visible = i < n));
  }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#bfe6ff');
    scene.fog = new THREE.Fog('#bfe6ff', 45, 90);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camTarget = V(0, 3);
    this.zoom = 1;

    scene.add(new THREE.HemisphereLight('#ffffff', '#6db544', 1.6));
    const sun = (this.sun = new THREE.DirectionalLight('#fff3dd', 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    this.pads = buildPads();
    this.flyers = [];
    this.pops = new Map();
    this.obstacles = [];
    this.seen = new Set();
    this.buildGround();
    this.buildStations();
    this.buildZones();
    this.arrow = M.makeArrow();
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // ---------- construction ----------
  buildGround() {
    const s = this.scene;
    s.add(M.mesh(new THREE.PlaneGeometry(200, 200), M.mat('#8fcf63'), { rx: -Math.PI / 2, cast: false }));
    s.add(M.mesh(new THREE.PlaneGeometry(200, 3.4), M.mat('#c9b48a'), { rx: -Math.PI / 2, y: 0.01, z: ROAD_Z, cast: false }));
    for (const z of [ROAD_Z - 1.75, ROAD_Z + 1.75]) s.add(M.mesh(new THREE.PlaneGeometry(200, 0.15), M.mat('#b49c70'), { rx: -Math.PI / 2, y: 0.012, z, cast: false }));
    s.add(M.mesh(new THREE.PlaneGeometry(28, 6.2), M.mat('#e8d9b8'), { rx: -Math.PI / 2, y: 0.011, x: 5, z: 8.4, cast: false }));
    for (const id of Object.keys(FIELDS)) {
      const [x, z] = FIELDS[id].pos;
      s.add(M.mesh(new THREE.PlaneGeometry(6.4, 6.4), M.mat('#7dbb52'), { rx: -Math.PI / 2, y: 0.008, x, z, cast: false }));
    }

    const barn = M.makeBarn();
    barn.position.set(-4, 0, -13.2);
    s.add(barn);
    this.staticObstacles = [{ minX: -6.9, maxX: -1.1, minZ: -15.8, maxZ: -10.8 }];

    const rand = M.rng(11);
    for (let n = 0; n < 140; n++) {
      const x = -45 + rand() * 90, z = -40 + rand() * 70;
      const inside = x > -21 && x < 21 && z > -16 && z < 16.5;
      if (inside || (z > ROAD_Z - 2.5 && z < ROAD_Z + 2.5)) continue;
      const o = rand() < 0.7 ? M.makeTree(rand) : M.makeBush(rand);
      o.position.x += x;
      o.position.z += z;
      s.add(o);
    }
    for (let n = 0; n < 60; n++) {
      const x = -20 + rand() * 40, z = -15 + rand() * 30;
      if (z > 4 && z < 15) continue;
      if (Math.abs(x) < 19 && z > -14.5 && z < 4) {
        const nearSomething = Object.values(FIELDS).some(f => Math.abs(x - f.pos[0]) < 4 && Math.abs(z - f.pos[1]) < 4)
          || Object.values(PENS).some(p => Math.abs(x - p.pos[0]) < 4.5 && Math.abs(z - p.pos[1]) < 5)
          || Object.values(MACHINES).some(m => Math.abs(x - m.pos[0]) < 3.5 && Math.abs(z - m.pos[1]) < 4.5);
        if (nearSomething) continue;
      }
      const o = M.makeFlower(rand);
      o.position.set(x, 0, z);
      s.add(o);
    }
  }

  addEntity(key, group, obstacle) {
    group.visible = false;
    this.scene.add(group);
    this.ent[key] = { group, obstacle };
  }

  buildStations() {
    this.ent = {};
    const rand = M.rng(42);
    const { size } = FIELD_GRID;

    this.fields = {};
    for (const id of Object.keys(FIELDS)) {
      const g = new THREE.Group();
      const plots = [];
      for (let i = 0; i < Sim.plotCount(); i++) {
        const tile = M.makePlot(size);
        tile.position.copy(plotPos(id, i));
        const crop = M.makeCrop(FIELDS[id].crop, size, rand);
        tile.add(crop);
        g.add(tile);
        plots.push({ tile, crop });
      }
      this.addEntity(`field:${id}`, g);
      this.fields[id] = plots;
    }

    this.pens = {};
    for (const [id, p] of Object.entries(PENS)) {
      const [x, z] = p.pos, [w, d] = p.size;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(M.mesh(new THREE.PlaneGeometry(w, d), M.mat(id === 'coop' ? '#e2c995' : '#a9d47a'), { rx: -Math.PI / 2, y: 0.015, cast: false }));
      g.add(M.makeFence(w, d));
      const house = M.makeHouse(id === 'coop'
        ? { w: 3, d: 1.8, h: 1.5, wall: '#f6e7c8', roofColor: '#d0553c', roofH: 1, sign: '🥚' }
        : { w: 4, d: 2, h: 2, wall: '#e9d6b0', roofColor: '#5a7d9a', roofH: 1.3, sign: '🥛' });
      house.position.set(0, 0, -d / 2 - 1.15);
      g.add(house);
      const trough = M.makeTrough();
      trough.position.set(-w / 4, 0, d / 2 - 0.55);
      g.add(trough);
      const tray = M.makeTray();
      tray.position.set(w / 4, 0, d / 2 + 0.35);
      g.add(tray);
      const feedPile = new Pile(g, () => M.makeItem(p.feed), { cols: 3, rows: 1, dx: 0.42, max: CAPS.feed, origin: V(-w / 4, d / 2 - 0.55, 0.36) });
      const outPile = new Pile(g, () => M.makeItem(p.product), { cols: 3, rows: 2, dx: 0.42, dz: 0.34, max: CAPS.tray, origin: V(w / 4, d / 2 + 0.35, 0.16) });
      const hungry = M.sprite(M.itemTexture(p.feed), 0.6, 1, { depthTest: false });
      hungry.renderOrder = 5;
      hungry.position.set(-w / 4, 1.2, d / 2 - 0.55);
      g.add(hungry);
      const animals = [];
      const ar = M.rng(id === 'coop' ? 3 : 5);
      for (let i = 0; i < p.count; i++) {
        const obj = p.animal === 'chicken'
          ? M.sprite(M.imageTexture('assets/chicken.png'), 1.1, 337 / 424, { alphaTest: 0.3 })
          : M.makeCow();
        obj.position.set((ar() - 0.5) * (w - 1.4), 0, (ar() - 0.5) * (d - 1.6) - 0.2);
        g.add(obj);
        animals.push({ obj, target: null, wait: ar() * 2, rand: ar });
      }
      this.addEntity(`pen:${id}`, g, { minX: x - w / 2 - 0.2, maxX: x + w / 2 + 0.2, minZ: z - d / 2 - 2.4, maxZ: z + d / 2 + 0.85 });
      this.pens[id] = { feedPile, outPile, animals, hungry, w, d };
    }

    this.machines = {};
    for (const [id, m] of Object.entries(MACHINES)) {
      const [x, z] = m.pos;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const house = M.makeHouse({ w: 4, d: 3, h: 2.4, chimney: true, ...m.look });
      g.add(house);
      for (const sx of [-1.3, 1.3]) {
        const t = M.makeTray();
        t.position.set(sx, 0, 1.95);
        t.scale.set(0.8, 1, 0.8);
        g.add(t);
      }
      const inPile = new Pile(g, () => M.makeItem(m.input), { cols: 2, rows: 2, dx: 0.45, dz: 0.32, max: CAPS.machineIn, origin: V(-1.3, 1.95, 0.16) });
      const outPile = new Pile(g, () => M.makeItem(m.output), { cols: 2, rows: 2, dx: 0.45, dz: 0.32, max: CAPS.machineOut, origin: V(1.3, 1.95, 0.16) });
      const puffs = Array.from({ length: 4 }, () => { const p = M.makePuff(); g.add(p); return p; });
      this.addEntity(`machine:${id}`, g, { minX: x - 2.3, maxX: x + 2.3, minZ: z - 1.8, maxZ: z + 2.5 });
      this.machines[id] = { inPile, outPile, puffs, top: house.userData.chimneyTop };
    }

    this.shelves = {};
    this.stallCoins = {};
    for (const [item, [x, z]] of Object.entries(SHELVES)) {
      const g = M.makeShelf(item);
      g.position.set(x, 0, z);
      const pile = new Pile(g, () => M.makeItem(item), { cols: 3, rows: 2, dx: 0.5, dz: 0.4, max: CAPS.shelf, origin: V(0, -0.05, 0.08 + 0.72) });
      // Coins customers leave beside the stall.
      this.stallCoins[item] = new Pile(g, M.makeCoin, { cols: 3, rows: 3, dx: 0.34, dz: 0.34, dy: 0.065, max: 54, origin: V(STALL_COINS[0], STALL_COINS[1], 0.04) });
      this.addEntity(`shelf:${item}`, g, { minX: x - 1, maxX: x + 1, minZ: z - 0.6, maxZ: z + 0.6 });
      this.shelves[item] = pile;
    }

    const truck = M.makeTruck();
    truck.position.set(TRUCK[0], 0, TRUCK[1]);
    const tg = new THREE.Group();
    tg.add(truck);
    this.truckLabel = M.labelSprite('', 0.7);
    this.truckLabel.position.set(TRUCK[0], 3, TRUCK[1] - 0.8);
    tg.add(this.truckLabel);
    this.addEntity('truck', tg, { minX: TRUCK[0] - 2.4, maxX: TRUCK[0] + 2.6, minZ: TRUCK[1] - 1.0, maxZ: TRUCK[1] + 1.0 });
    this.truck = truck;
    this.truckLoad = [];

    for (const pad of this.pads) {
      pad.mesh = M.makePad(pad.emoji, pad.size || 1.5);
      pad.mesh.position.x = pad.pos.x;
      pad.mesh.position.z = pad.pos.z;
      pad.mesh.visible = false;
      this.scene.add(pad.mesh);
    }
  }

  buildZones() {
    this.zones = {};
    for (const z of ZONES) {
      const g = M.makeZone();
      g.position.set(z.at[0], 0, z.at[1]);
      g.visible = false;
      this.scene.add(g);
      this.zones[z.id] = g;
    }
  }

  // ---------- queries ----------
  activePads(S) {
    return this.pads.filter(p => Sim.isUnlocked(S, p.key));
  }

  padAt(S, pos) {
    return this.activePads(S).find(p => Math.abs(pos.x - p.pos.x) < (p.size || 1.5) / 2 && Math.abs(pos.z - p.pos.z) < (p.size || 1.5) / 2);
  }

  pad(kind, id) {
    return this.pads.find(p => p.kind === kind && (id === undefined || p.id === id));
  }

  zoneAt(S, pos) {
    return ZONES.find(z => Sim.zoneVisible(S, z) && Math.abs(pos.x - z.at[0]) < 1.1 && Math.abs(pos.z - z.at[1]) < 1.1);
  }

  activeObstacles(S) {
    const list = [...this.staticObstacles];
    for (const [key, e] of Object.entries(this.ent)) {
      if (e.obstacle && Sim.isUnlocked(S, key)) list.push(e.obstacle);
    }
    return list;
  }

  // Push a point out of any obstacle box (circle of radius r vs. AABB).
  collide(S, pos, r = 0.35) {
    for (const o of this.activeObstacles(S)) {
      const cx = Math.max(o.minX, Math.min(pos.x, o.maxX)), cz = Math.max(o.minZ, Math.min(pos.z, o.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-4) {
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        const exits = [[o.minX - r - pos.x, 0], [o.maxX + r - pos.x, 0], [0, o.minZ - r - pos.z], [0, o.maxZ + r - pos.z]];
        const [ex, ez] = exits.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
        pos.x += ex;
        pos.z += ez;
      }
    }
  }

  // ---------- camera ----------
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    // Portrait screens get a wider lens so the farm doesn't feel cramped side to side.
    this.camera.fov = this.camera.aspect < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  follow(pos, dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.camTarget.x += (pos.x - this.camTarget.x) * k;
    this.camTarget.z += (pos.z - this.camTarget.z) * k;
    const portrait = this.camera.aspect < 1;
    const dist = (portrait ? 30 : 21) * this.zoom;
    this.camera.position.set(this.camTarget.x, dist * 0.78, this.camTarget.z + dist * 0.62);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z - (portrait ? 1.5 : 0));
    this.sun.position.set(this.camTarget.x - 14, 30, this.camTarget.z + 12);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
  }

  screenPos(v) {
    const p = v.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  // ---------- effects ----------
  // An item (or coin) arcs from one world point to another.
  fly(kind, from, to, delay = 0) {
    const m = kind === 'coin' ? M.makeCoin() : M.makeItem(kind);
    m.visible = false;
    this.scene.add(m);
    this.flyers.push({ m, from: from.clone(), to: to.clone(), t: -delay, dur: 0.32 });
  }

  pop(key) {
    this.pops.set(key, performance.now());
  }

  // ---------- per-frame sync ----------
  sync(S, dt, time) {
    const now = Sim.now();

    for (const [key, e] of Object.entries(this.ent)) {
      const on = Sim.isUnlocked(S, key);
      e.group.visible = on;
      if (on && !this.seen.has(key)) {
        this.seen.add(key);
        if (this.started) this.pop(key);
      }
    }
    this.started = true;
    for (const pad of this.pads) pad.mesh.visible = Sim.isUnlocked(S, pad.key);
    if (S.truck && !S.truck.order) this.pad('truck').mesh.visible = false;

    // Crops
    for (const [id, plots] of Object.entries(this.fields)) {
      if (!S.plots[id]) continue;
      const grow = Sim.growMs(S, id);
      plots.forEach(({ crop }, i) => {
        const left = S.plots[id][i] - now;
        const prog = Math.min(1, Math.max(0, 1 - left / grow));
        crop.scale.set(1, 0.08 + 0.92 * prog, 1);
        crop.userData.ripeMat.color.set('#7cc24f').lerp(crop.userData.ripeColor, prog * prog);
        crop.rotation.z = prog >= 1 ? Math.sin(time * 2 + i) * 0.04 : 0;
      });
    }

    // Pens
    for (const [id, v] of Object.entries(this.pens)) {
      const p = S.pens[id];
      if (!p) continue;
      v.feedPile.set(p.feed);
      v.outPile.set(p.out);
      v.hungry.visible = p.feed === 0;
      v.hungry.position.y = 1.2 + Math.abs(Math.sin(time * 3)) * 0.25;
      v.animals.forEach(a => this.wander(a, v, dt, time, p.feed > 0, id));
    }

    // Machines
    for (const [id, v] of Object.entries(this.machines)) {
      const m = S.machines[id];
      if (!m) continue;
      v.inPile.set(m.in);
      v.outPile.set(m.out);
      const busy = m.in >= MACHINES[id].need && m.out < CAPS.machineOut;
      v.puffs.forEach((puff, k) => {
        puff.visible = busy;
        if (!busy) return;
        const ph = (time * 0.45 + k / v.puffs.length) % 1;
        puff.position.set(v.top.x + Math.sin(ph * 6 + k) * 0.2, v.top.y + ph * 2.2, v.top.z);
        puff.scale.setScalar(0.5 + ph * 1.2);
        puff.material.opacity = 0.8 * (1 - ph);
      });
    }

    for (const [item, pile] of Object.entries(this.shelves)) pile.set(S.shelves[item] || 0);
    for (const [item, pile] of Object.entries(this.stallCoins)) pile.set(Math.min(S.stallCoins[item] || 0, 54));
    for (const pad of this.pads) if (pad.kind === 'cash') pad.mesh.visible &&= (S.stallCoins[pad.item] || 0) > 0;

    // Truck: drives in when an order appears, drives off along the road when filled.
    if (S.truck) {
      const tr = S.truck;
      if (tr.order) {
        if (!this.truckHere) { this.truckHere = true; this.truckSince = time; }
        const k = Math.min(1, (time - this.truckSince) / 1.6);
        this.truck.position.x = TRUCK[0] - 30 * (1 - k) ** 2;
        const lines = Object.entries(tr.order).map(([k2, q]) => `${ITEMS[k2].emoji} ${tr.loaded[k2] || 0}/${q}`);
        M.setLabel(this.truckLabel, `${lines.join('  ')}\n🪙 ${tr.reward}`);
        const loaded = Object.entries(tr.loaded).flatMap(([k2, q]) => Array(q).fill(k2));
        this.syncTruckLoad(loaded);
      } else {
        if (this.truckHere) { this.truckHere = false; this.truckSince = time; }
        this.truck.position.x = TRUCK[0] + 40 * Math.min(1, ((time - this.truckSince) / 2.5) ** 2);
        const secs = Math.max(0, Math.ceil((tr.awayUntil - now) / 1000));
        M.setLabel(this.truckLabel, `🚚 Next truck ${secs}s`);
        if (time - this.truckSince > 2.5) this.syncTruckLoad([]);
      }
    }

    // Zones
    for (const z of ZONES) {
      const g = this.zones[z.id];
      g.visible = Sim.zoneVisible(S, z);
      if (!g.visible) continue;
      const paid = S.zonePaid[z.id] || 0;
      g.userData.fill.scale.x = Math.max(0.001, (paid / z.cost) * g.userData.size * 0.86);
      M.setLabel(g.userData.label, `${z.label}\n🪙 ${z.cost - paid}`);
      g.userData.label.position.y = 0.4 + Math.sin(time * 2.5) * 0.08;
    }

    // Pop-in for newly unlocked things
    const pnow = performance.now();
    for (const [key, t0] of this.pops) {
      const k = (pnow - t0) / 600;
      const g = this.ent[key].group;
      // Groups sitting at the origin hold absolutely-placed children (fields), so bounce each child instead.
      const targets = g.position.lengthSq() === 0 ? g.children.filter(c => !c.isSprite) : [g];
      const s = k >= 1 ? 1 : Math.min(1, k * 3) * (1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.35);
      for (const o of targets) o.scale.setScalar(s);
      if (k >= 1) this.pops.delete(key);
    }

    // Flying items
    this.flyers = this.flyers.filter(f => {
      f.t += dt;
      if (f.t < 0) return true;
      const k = Math.min(1, f.t / f.dur);
      f.m.visible = true;
      f.m.position.lerpVectors(f.from, f.to, k);
      f.m.position.y += Math.sin(k * Math.PI) * 1.2;
      f.m.rotation.y = k * 4;
      if (k >= 1) { this.scene.remove(f.m); return false; }
      return true;
    });

    if (this.arrow.visible) this.arrow.position.y = 2.2 + Math.abs(Math.sin(time * 4)) * 0.5;
  }

  syncTruckLoad(items) {
    while (this.truckLoad.length > items.length) this.truck.remove(this.truckLoad.pop().m);
    items.forEach((id, i) => {
      if (this.truckLoad[i]?.id === id) return;
      if (this.truckLoad[i]) this.truck.remove(this.truckLoad[i].m);
      const m = M.makeItem(id);
      const per = 12, k = i % per;
      m.position.set(-1.6 + (k % 6) * 0.48, 1.0 + Math.floor(i / per) * M.ITEM_H, -0.4 + Math.floor(k / 6) * 0.8);
      this.truck.add(m);
      this.truckLoad[i] = { id, m };
    });
  }

  wander(a, v, dt, time, fed, id) {
    const pos = a.obj.position;
    if (!fed) { pos.y = 0; return; }
    if (!a.target || pos.distanceTo(a.target) < 0.1) {
      if (a.wait > 0) { a.wait -= dt; pos.y = 0; return; }
      a.target = V((a.rand() - 0.5) * (v.w - 1.4), (a.rand() - 0.5) * (v.d - 1.6) - 0.2);
      a.wait = 0.5 + a.rand() * 2.5;
    }
    const dir = a.target.clone().sub(pos).setY(0);
    const step = Math.min(dir.length(), (id === 'coop' ? 0.8 : 0.45) * dt);
    dir.normalize();
    pos.addScaledVector(dir, step);
    if (id === 'coop') pos.y = Math.abs(Math.sin(time * 9)) * 0.08;
    else a.obj.rotation.y = Math.atan2(-dir.z, dir.x);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
