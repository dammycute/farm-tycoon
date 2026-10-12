// Characters: the player-controlled farmer, hired workers and walk-in customers.
import * as THREE from 'three';
import * as M from './models.js';
import * as Sim from './sim.js';
import {
  FIELDS, PENS, MACHINES, SHELVES, COUNTER, COIN_PILE, ZONES, BOUNDS, ITEMS, CAPS, ROAD_Z,
  WORKER_LOOKS, WORKER_HOME, PLAYER_START, CUSTOMERS, playerSpeed, workerSpeed,
} from './data.js';
import { plotPos } from './world.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const HARVEST_R = 0.95;

// A character that can carry a stack of items in its arms.
class Carrier {
  constructor(world, look) {
    this.world = world;
    this.obj = M.makePerson(look);
    this.pos = this.obj.position;
    world.scene.add(this.obj);
    this.stackGroup = new THREE.Group();
    this.stackGroup.position.set(0, 0.82, 0.42);
    this.obj.add(this.stackGroup);
    this.stackMeshes = [];
    this.walking = 0;
    this.cool = 0;
  }

  face(dx, dz, dt) {
    const want = Math.atan2(dx, dz);
    let d = want - this.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.obj.rotation.y += d * Math.min(1, dt * 14);
  }

  // Walk straight toward a point; returns true on arrival.
  walkTo(target, speed, dt) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { this.walking = 0; return true; }
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.face(dx, dz, dt);
    this.walking = 1;
    return d - step < 0.05;
  }

  syncStack(stack, time) {
    while (this.stackMeshes.length > stack.length) this.stackGroup.remove(this.stackMeshes.pop().m);
    stack.forEach((id, i) => {
      if (this.stackMeshes[i]?.id === id) return;
      if (this.stackMeshes[i]) this.stackGroup.remove(this.stackMeshes[i].m);
      const m = M.makeItem(id);
      m.rotation.y = Math.PI / 2;
      this.stackGroup.add(m);
      this.stackMeshes[i] = { id, m };
    });
    // Taller stacks sway a little while walking.
    this.stackMeshes.forEach(({ m }, i) => {
      m.position.set(Math.sin(time * 6) * 0.012 * i * this.walking, i * M.ITEM_H, -Math.cos(time * 6) * 0.006 * i * this.walking);
    });
  }

  animate(time, carrying) {
    M.animatePerson(this.obj, this.walking, time, carrying);
  }

  get stackTop() {
    return this.pos.clone().add(new THREE.Vector3(0, 1.0 + this.stackMeshes.length * M.ITEM_H, 0));
  }
}

// ---------- shared station actions ----------
// Try one transfer at a pad. Returns an event { item|coins, from, to } or null.
function padAction(S, world, owner, pad, who) {
  const top = who.stackTop, at = pad.pos.clone().setY(0.6);
  let item;
  switch (pad.kind) {
    case 'penIn': item = Sim.feedPen(S, owner, pad.id); return item && { item, from: top, to: at, sound: 'drop' };
    case 'penOut': item = Sim.takeFromPen(S, owner, pad.id); return item && { item, from: at, to: top, sound: 'pick' };
    case 'machIn': item = Sim.feedMachine(S, owner, pad.id); return item && { item, from: top, to: at, sound: 'drop' };
    case 'machOut': item = Sim.takeFromMachine(S, owner, pad.id); return item && { item, from: at, to: top, sound: 'pick' };
    case 'shelf': item = Sim.stockShelf(S, owner, pad.item); return item && { item, from: top, to: V(...SHELVES[pad.item]).setY(1), sound: 'drop' };
    case 'truck': {
      const r = Sim.loadTruck(S, owner);
      return r && { item: r.item, from: top, to: world.truck.position.clone().setY(1.4), sound: 'drop', truckReward: r.reward };
    }
  }
  return null;
}

// ---------- player ----------
export class Player extends Carrier {
  constructor(world) {
    super(world, { shirt: '#d9534f', pants: '#3f6fb5', hat: 'straw', overalls: true });
    this.pos.copy(V(...PLAYER_START));
    this.maxLabel = M.labelSprite('MAX', 0.5, { bg: '#e0533d', fg: '#ffffff', border: '#ffffff' });
    world.scene.add(this.maxLabel);
  }

  update(S, dt, time, input, fx) {
    const speed = playerSpeed(S.upgrades.speed);
    const len = Math.hypot(input.x, input.z);
    if (len > 0.05) {
      const k = Math.min(1, len);
      this.pos.x += (input.x / len) * k * speed * dt;
      this.pos.z += (input.z / len) * k * speed * dt;
      this.face(input.x, input.z, dt);
      this.walking = k;
    } else {
      this.walking = 0;
    }
    this.world.collide(S, this.pos);
    this.pos.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, this.pos.x));
    this.pos.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, this.pos.z));

    this.cool -= dt;
    this.manning = false;
    this.interact(S, dt, fx);

    this.syncStack(S.stack, time);
    this.animate(time, S.stack.length > 0);
    const full = S.stack.length >= Sim.capOf(S, S);
    this.maxLabel.visible = full;
    this.maxLabel.position.copy(this.stackTop).setY(this.stackTop.y + 0.3);
  }

  interact(S, dt, fx) {
    const pad = this.world.padAt(S, this.pos);
    if (pad?.kind === 'register') this.manning = true;
    if (this.cool > 0) return;

    // Harvest any ripe plot you walk across.
    for (const id of Object.keys(S.plots)) {
      for (let i = 0; i < Sim.plotCount(); i++) {
        const p = plotPos(id, i);
        if (Math.abs(p.x - this.pos.x) > HARVEST_R || Math.abs(p.z - this.pos.z) > HARVEST_R) continue;
        const item = Sim.harvest(S, S, id, i);
        if (item) {
          this.cool = 0.03;
          fx({ item, from: p.setY(0.6), to: this.stackTop, sound: 'pick' });
          return;
        }
      }
    }

    const zone = this.world.zoneAt(S, this.pos);
    if (zone) {
      const r = Sim.payZone(S, zone, Math.max(1, Math.ceil(zone.cost / 45)));
      if (r.paid) {
        this.cool = 0.035;
        fx({ coin: true, from: this.pos.clone().setY(1.2), to: V(...zone.at).setY(0.2), sound: 'pay', unlocked: r.unlocked });
      }
      return;
    }

    if (!pad) return;
    if (pad.kind === 'coins') {
      if (S.pile <= 0) return;
      const amt = Math.max(1, Math.ceil(S.pile / 12));
      S.pile -= amt;
      S.coins += amt;
      this.cool = 0.04;
      fx({ coin: true, from: V(...COIN_PILE).setY(0.3), to: this.pos.clone().setY(1.2), sound: 'coin', coins: amt });
      return;
    }
    const ev = padAction(S, this.world, S, pad, this);
    if (ev) {
      this.cool = 0.07;
      fx(ev);
    }
  }
}

// ---------- workers ----------
// Where an item can go right now, nearest first.
function destinations(S, world, item) {
  const out = [];
  if ((S.shelves[item] ?? CAPS.shelf) < CAPS.shelf) out.push(world.pad('shelf', item));
  for (const [id, p] of Object.entries(S.pens)) if (PENS[id].feed === item && p.feed < CAPS.feed) out.push(world.pad('penIn', id));
  for (const [id, m] of Object.entries(S.machines)) if (MACHINES[id].input === item && m.in < CAPS.machineIn) out.push(world.pad('machIn', id));
  if (Sim.truckNeeds(S, item)) out.push(world.pad('truck'));
  return out;
}

class Farmhand extends Carrier {
  constructor(world, data, i) {
    super(world, WORKER_LOOKS[data.id]);
    this.data = data;
    this.home = V(WORKER_HOME[0] + i * 1.2, WORKER_HOME[1]);
    this.pos.copy(this.home);
    this.mode = 'gather';
    this.target = null;
  }

  update(S, dt, time, fx, others) {
    const speed = workerSpeed(S.upgrades.workerSpeed);
    const cap = Sim.capOf(S, this.data);
    this.cool -= dt;

    if (!this.target) this.plan(S, cap, others);
    if (this.target) {
      const arrived = this.walkTo(this.target.pos, speed, dt);
      if (arrived && this.cool <= 0) this.work(S, cap, fx, others);
    } else {
      this.walkTo(this.home, speed, dt);
    }
    this.syncStack(this.data.stack, time);
    this.animate(time, this.data.stack.length > 0);
  }

  plan(S, cap, others) {
    const stack = this.data.stack;
    if (stack.length && (stack.length >= cap || this.mode === 'deliver')) {
      this.mode = 'deliver';
      let best = null, bd = Infinity;
      const demand = others.demand || new Set();
      for (const item of new Set(stack)) {
        for (const pad of destinations(S, this.world, item)) {
          const d = pad.pos.distanceToSquared(this.pos) * (pad.kind === 'shelf' && demand.has(item) ? 0.1 : 1);
          if (d < bd) { bd = d; best = { kind: 'pad', pad, pos: pad.pos.clone() }; }
        }
      }
      this.target = best;
      return;
    }
    this.mode = 'gather';
    const taken = new Set(others.filter(o => o !== this && o.target?.key).map(o => o.target.key));
    const demand = others.demand || new Set();
    let best = null, bd = Infinity;
    // Nearest source wins, but anything customers are waiting for counts as much closer.
    const consider = (key, pos, t, item) => {
      if (taken.has(key)) return;
      const d = pos.distanceToSquared(this.pos) * (demand.has(item) ? 0.1 : 1);
      if (d < bd) { bd = d; best = { ...t, key, pos }; }
    };
    for (const id of Object.keys(S.plots)) {
      const crop = FIELDS[id].crop;
      if (!destinations(S, this.world, crop).length) continue;
      for (let i = 0; i < Sim.plotCount(); i++) {
        if (Sim.isRipe(S, id, i)) consider(`plot:${id}:${i}`, plotPos(id, i), { kind: 'plot', id, i }, crop);
      }
    }
    for (const [id, p] of Object.entries(S.pens)) {
      if (p.out > 0 && destinations(S, this.world, PENS[id].product).length) {
        const pad = this.world.pad('penOut', id);
        consider(`penOut:${id}`, pad.pos.clone(), { kind: 'pad', pad }, PENS[id].product);
      }
    }
    for (const [id, m] of Object.entries(S.machines)) {
      if (m.out > 0 && destinations(S, this.world, MACHINES[id].output).length) {
        const pad = this.world.pad('machOut', id);
        consider(`machOut:${id}`, pad.pos.clone(), { kind: 'pad', pad }, MACHINES[id].output);
      }
    }
    if (best) { this.target = best; return; }
    // Nothing new to pick: deliver whatever we hold.
    if (stack.length) { this.mode = 'deliver'; this.plan(S, cap, others); }
  }

  work(S, cap, fx, others) {
    const t = this.target, owner = this.data;
    if (t.kind === 'plot') {
      const item = Sim.harvest(S, owner, t.id, t.i);
      if (item) fx({ item, from: t.pos.clone().setY(0.6), to: this.stackTop, quiet: true });
      this.target = null;
      this.cool = 0.15;
      if (owner.stack.length >= cap) this.mode = 'deliver';
      return;
    }
    const ev = padAction(S, this.world, owner, t.pad, this);
    if (ev) {
      fx({ ...ev, quiet: true });
      this.cool = 0.15;
      if (t.pad.kind.endsWith('Out') && owner.stack.length >= cap) { this.target = null; this.mode = 'deliver'; }
      return;
    }
    // Pad has nothing more for us: re-plan.
    this.target = null;
    if (this.mode === 'deliver' && !owner.stack.length) this.mode = 'gather';
    if (t.pad.kind.endsWith('Out')) this.mode = owner.stack.length ? 'deliver' : 'gather';
    this.cool = 0.2;
  }
}

class Cashier extends Carrier {
  constructor(world, data) {
    super(world, WORKER_LOOKS[data.id]);
    this.data = data;
    this.post = world.pad('register').pos.clone();
    this.pos.copy(V(COUNTER[0] - 2.5, COUNTER[1] - 2));
  }
  update(S, dt, time) {
    const atPost = this.walkTo(this.post, workerSpeed(S.upgrades.workerSpeed), dt);
    if (atPost) this.face(0, 1, dt);
    this.manning = atPost;
    this.animate(time, false);
  }
}

// ---------- customers ----------
const SKINS = ['#f1c7a0', '#e0ac7e', '#c68b59', '#8d5a3b', '#f7d7c4'];
const SHIRTS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#9575cd'];
const HAIR = ['#2f2a26', '#5a3b22', '#a0522d', '#d4a64a', '#8d8d8d'];

class Customer extends Carrier {
  constructor(world, item, qty, rand) {
    const pick = a => a[Math.floor(rand() * a.length)];
    super(world, {
      shirt: pick(SHIRTS), pants: pick(['#3f4a5a', '#5a4632', '#2f3e57', '#6b6b6b']),
      skin: pick(SKINS), hair: pick(HAIR), hat: rand() < 0.25 ? 'cap' : null, hatColor: pick(SHIRTS), scale: 0.92,
    });
    this.side = rand() < 0.5 ? -1 : 1;
    this.pos.copy(V(this.side * 26, ROAD_Z + 0.4));
    this.item = item;
    this.qty = qty;
    this.got = 0;
    this.state = 'toShelf';
    this.path = [V(SHELVES[item][0], ROAD_Z + 0.4)];
    this.bubble = M.labelSprite('', 0.5);
    world.scene.add(this.bubble);
    this.carry = [];
  }

  update(S, dt, time, crowd, fx) {
    const speed = 2.6;
    if (this.path.length) {
      if (this.walkTo(this.path[0], speed, dt)) this.path.shift();
    } else {
      this.walking = 0;
    }
    this.cool -= dt;

    if (this.state === 'toShelf') {
      const line = crowd.filter(c => c.state === 'toShelf' && c.item === this.item);
      const k = line.indexOf(this);
      const [sx, sz] = SHELVES[this.item];
      const spot = V(sx + (k % 2 ? 0.45 : -0.45) * Math.min(k, 1), sz + 1.25 + k * 0.8);
      // First walk along the road, then step up to our place in the shelf's line (which moves up as it shortens).
      const offRoad = this.pos.z < ROAD_Z;
      if ((!this.path.length || offRoad) && (!this.path.length || this.path[0].distanceTo(spot) > 0.1) && (this.pos.distanceTo(spot) > 0.06)) {
        this.path = [spot];
      }
      if (k === 0 && !this.path.length) {
        this.face(0, -1, dt);
        if (this.cool <= 0 && Sim.buyFromShelf(S, this.item)) {
          this.got++;
          this.carry.push(this.item);
          this.cool = 0.4;
          this.waited = 0;
          fx({ item: this.item, from: V(sx, sz).setY(1), to: this.stackTop, quiet: true });
          if (this.got >= this.qty) this.state = 'toQueue';
        } else if ((this.waited = (this.waited || 0) + dt) > CUSTOMERS.patience) {
          // Gave up waiting: pay for what we have, or leave unhappy.
          if (this.got) this.state = 'toQueue';
          else { this.state = 'leave'; this.sad = true; this.path = [V(this.pos.x, ROAD_Z + 0.4), V(30, ROAD_Z + 0.4)]; }
        }
      }
    } else if (this.state === 'toQueue') {
      const queue = crowd.filter(c => c.state === 'toQueue');
      const k = queue.indexOf(this);
      const spot = k < 4
        ? V(COUNTER[0], COUNTER[1] + 1.3 + k * 0.85)
        : V(COUNTER[0] - 0.9 * (k - 3), COUNTER[1] + 1.3 + 3 * 0.85);
      if (this.pos.distanceTo(spot) > 0.06 && (!this.path.length || this.path[0].distanceTo(spot) > 0.1)) this.path = [spot];
      if (k === 0 && !this.path.length) {
        this.face(0, -1, dt);
        if (crowd.manned) {
          this.payT = (this.payT || 0) + dt;
          if (this.payT > 0.55) {
            const total = Sim.priceOf(S, this.item) * this.got;
            S.pile += total;
            fx({ coin: true, from: this.pos.clone().setY(1.2), to: V(...COIN_PILE).setY(0.3), sound: 'cash', paid: total, at: this.pos.clone().setY(2.2) });
            this.state = 'leave';
            this.path = [V(this.pos.x + 1.5, ROAD_Z + 0.4), V(30, ROAD_Z + 0.4)];
          }
        }
      }
    }

    this.syncStack(this.carry, time);
    this.animate(time, this.carry.length > 0);
    const label = this.state === 'toShelf' ? `${ITEMS[this.item].emoji} ${this.got}/${this.qty}`
      : this.state === 'toQueue' ? '💵' : this.sad ? '😞' : '😊';
    M.setLabel(this.bubble, label);
    this.bubble.position.copy(this.pos).setY(1.9 + this.carry.length * M.ITEM_H * 0.3);
    return this.state === 'leave' && !this.path.length;
  }

  dispose() {
    this.world.scene.remove(this.obj, this.bubble);
  }
}

// ---------- manager ----------
export class Agents {
  constructor(world, getState, fx) {
    this.world = world;
    this.getState = getState;
    this.fx = fx;
    this.player = new Player(world);
    this.workers = [];
    this.customers = [];
    this.spawnT = 1;
    this.rand = M.rng(Date.now() % 100000 + 1);
  }

  update(dt, time, input) {
    const S = this.getState();
    for (const w of S.workers) {
      if (this.workers.some(a => a.data === w)) continue;
      const A = w.kind === 'cashier' ? new Cashier(this.world, w) : new Farmhand(this.world, w, this.workers.length);
      this.workers.push(A);
    }

    // Items customers are standing at an empty stall for: workers rush these first.
    this.workers.demand = new Set(this.customers.filter(c => c.state === 'toShelf' && !S.shelves[c.item]).map(c => c.item));
    this.player.update(S, dt, time, input, this.fx);
    for (const w of this.workers) w.update(S, dt, time, this.fx, this.workers);

    // Customers
    const shelves = Object.keys(S.shelves);
    this.spawnT -= dt;
    const active = this.customers.filter(c => c.state !== 'leave').length;
    if (this.spawnT <= 0 && active < Math.min(CUSTOMERS.max, CUSTOMERS.base + shelves.length) && shelves.length) {
      const every = Math.max(1.4, CUSTOMERS.every - 0.35 * shelves.length);
      this.spawnT = every * (0.7 + this.rand() * 0.6);
      const item = shelves[Math.floor(this.rand() * shelves.length)];
      const qty = 1 + Math.floor(this.rand() * (ITEMS[item].price <= 4 ? 4 : 3));
      this.customers.push(new Customer(this.world, item, qty, this.rand));
    }
    const crowd = this.customers;
    crowd.manned = this.player.manning || this.workers.some(w => w.manning);
    this.customers = crowd.filter(c => {
      const gone = c.update(S, dt, time, crowd, this.fx);
      if (gone) c.dispose();
      return !gone;
    });
  }

  get waitingToPay() {
    return this.customers.filter(c => c.state === 'toQueue').length;
  }
}
