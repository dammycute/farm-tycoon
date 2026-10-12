// Characters: the player-controlled farmer, hired workers and walk-in customers.
import * as THREE from 'three';
import * as M from './models.js';
import * as Sim from './sim.js';
import {
  FIELDS, PENS, MACHINES, SHELVES, STALL_COINS, BOUNDS, ITEMS, CAPS, ROAD_Z,
  WORKER_LOOKS, EXTRA_LOOKS, WORKER_HOME, COLLECTOR_HOME, PLAYER_START, CUSTOMERS, playerSpeed, workerSpeed, buyCost,
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
    this.interact(S, dt, fx);

    this.syncStack(S.stack, time);
    this.animate(time, S.stack.length > 0);
    const full = S.stack.length >= Sim.capOf(S, S);
    this.maxLabel.visible = full;
    this.maxLabel.position.copy(this.stackTop).setY(this.stackTop.y + 0.3);
  }

  interact(S, dt, fx) {
    const pad = this.world.padAt(S, this.pos);
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

    const buy = this.world.buyAt(S, this.pos);
    if (buy) {
      const r = Sim.payBuy(S, buy, Math.max(1, Math.ceil(buyCost(buy, S.extra[buy.id] || 0) / 45)));
      if (r.paid) {
        this.cool = 0.035;
        fx({ coin: true, from: this.pos.clone().setY(1.2), to: V(...buy.at).setY(0.2), sound: 'pay', bought: r.bought, count: r.count });
      }
      return;
    }

    if (!pad) return;
    if (pad.kind === 'cash') {
      const amt = Sim.collectStall(S, pad.item);
      if (amt) {
        this.cool = 0.04;
        fx({ coin: true, from: pad.pos.clone().setY(0.3), to: this.pos.clone().setY(1.2), sound: 'coin', coins: amt });
      }
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

// How badly a drop-off spot needs goods: multiplies the (squared) distance, so lower wins.
// Empty troughs come first so animals never sit idle, then stalls with customers waiting.
function urgency(S, pad, demand, keeper) {
  switch (pad.kind) {
    case 'penIn': {
      const f = S.pens[pad.id].feed;
      return (f === 0 ? 0.03 : f < 4 ? 0.25 : 1) * (keeper ? 0.3 : 1);
    }
    case 'machIn': {
      const m = S.machines[pad.id];
      return (m.in < MACHINES[pad.id].need ? 0.12 : m.in < 6 ? 0.5 : 1) * (keeper ? 0.3 : 1);
    }
    case 'shelf': return demand.has(pad.item) ? 0.1 : S.shelves[pad.item] < 3 ? 0.4 : 1;
    default: return 0.7;
  }
}

class Farmhand extends Carrier {
  constructor(world, data, i) {
    const num = Number(data.id.replace('hand', '')) || 1;
    super(world, WORKER_LOOKS[data.id] || EXTRA_LOOKS[(num - 3) % EXTRA_LOOKS.length]);
    this.data = data;
    // Every second farmhand is an animal keeper: prefers troughs, trays and machines.
    this.keeper = num % 2 === 0;
    this.home = V(WORKER_HOME[0] + (i % 4) * 1.2, WORKER_HOME[1] - Math.floor(i / 4) * 1.2);
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
          const d = pad.pos.distanceToSquared(this.pos) * urgency(S, pad, demand, this.keeper);
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
    const consider = (key, pos, t, item, boost = 1) => {
      if (taken.has(key)) return;
      const d = pos.distanceToSquared(this.pos) * (demand.has(item) ? 0.1 : 1) * boost;
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
        // A full tray stops the animals, so fuller trays get picked up sooner.
        const pad = this.world.pad('penOut', id);
        const boost = (p.out >= CAPS.tray * 0.6 ? 0.2 : 0.6) * (this.keeper ? 0.4 : 1);
        consider(`penOut:${id}`, pad.pos.clone(), { kind: 'pad', pad }, PENS[id].product, boost);
      }
    }
    for (const [id, m] of Object.entries(S.machines)) {
      if (m.out > 0 && destinations(S, this.world, MACHINES[id].output).length) {
        const pad = this.world.pad('machOut', id);
        const boost = (m.out >= CAPS.machineOut * 0.6 ? 0.2 : 0.6) * (this.keeper ? 0.4 : 1);
        consider(`machOut:${id}`, pad.pos.clone(), { kind: 'pad', pad }, MACHINES[id].output, boost);
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

// Walks between stalls picking up the coins customers leave, so you don't have to.
class Collector extends Carrier {
  constructor(world, data) {
    super(world, WORKER_LOOKS[data.id]);
    this.data = data;
    this.home = V(...COLLECTOR_HOME);
    this.pos.copy(this.home);
    this.target = null;
  }

  update(S, dt, time, fx) {
    this.cool -= dt;
    if (!this.target || !(S.stallCoins[this.target.item] > 0)) {
      // Head for the stall with the most coins, discounted by distance.
      let best = null, bs = -Infinity;
      for (const [item, n] of Object.entries(S.stallCoins)) {
        if (n <= 0) continue;
        const pad = this.world.pad('cash', item);
        const score = n - pad.pos.distanceTo(this.pos) * 0.6;
        if (score > bs) { bs = score; best = pad; }
      }
      this.target = best;
    }
    const goal = this.target ? this.target.pos : this.home;
    const arrived = this.walkTo(goal, workerSpeed(S.upgrades.workerSpeed) * 1.2, dt);
    if (this.target && arrived && this.cool <= 0) {
      const amt = Sim.collectStall(S, this.target.item);
      if (amt) {
        this.cool = 0.06;
        fx({ coin: true, from: this.target.pos.clone().setY(0.3), to: this.pos.clone().setY(1.2), quiet: true, coins: amt });
      }
    }
    if (!this.target && arrived) this.face(0, 1, dt);
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
      // Two customers can shop a stall side by side; the rest wait in pairs behind them.
      const line = crowd.filter(c => c.state === 'toShelf' && c.item === this.item);
      const k = line.indexOf(this);
      const [sx, sz] = SHELVES[this.item];
      const spot = V(sx + (k % 2 ? 0.45 : -0.45), sz + 1.25 + Math.floor(k / 2) * 0.8);
      // First walk along the road, then step up to our place in line (which moves up as it shortens).
      const offRoad = this.pos.z < ROAD_Z;
      if ((!this.path.length || offRoad) && (!this.path.length || this.path[0].distanceTo(spot) > 0.1) && (this.pos.distanceTo(spot) > 0.06)) {
        this.path = [spot];
      }
      if (k < 2 && !this.path.length) {
        this.face(0, -1, dt);
        const paid = this.cool <= 0 && Sim.buyFromShelf(S, this.item);
        if (paid) {
          // Pay as we go: the coins drop beside the stall.
          this.got++;
          this.carry.push(this.item);
          this.cool = 0.35;
          this.waited = 0;
          const cash = V(sx + STALL_COINS[0], sz + STALL_COINS[1]);
          fx({ item: this.item, from: V(sx, sz).setY(1), to: this.stackTop, quiet: true });
          fx({ coin: true, from: this.pos.clone().setY(1.1), to: cash.setY(0.3), sound: 'cash', paid, at: this.pos.clone().setY(2.3) });
          if (this.got >= this.qty) this.leave();
        } else if ((this.waited = (this.waited || 0) + dt) > CUSTOMERS.patience) {
          this.sad = !this.got;
          this.leave();
        }
      }
    }

    this.syncStack(this.carry, time);
    this.animate(time, this.carry.length > 0);
    const label = this.state === 'toShelf' ? `${ITEMS[this.item].emoji} ${this.got}/${this.qty}` : this.sad ? '😞' : '😊';
    M.setLabel(this.bubble, label);
    this.bubble.position.copy(this.pos).setY(1.9 + this.carry.length * M.ITEM_H * 0.3);
    return this.state === 'leave' && !this.path.length;
  }

  leave() {
    this.state = 'leave';
    this.path = [V(this.pos.x, ROAD_Z + 0.4), V(this.side * 30, ROAD_Z + 0.4)];
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
      const A = w.kind === 'collector' ? new Collector(this.world, w) : new Farmhand(this.world, w, this.workers.length);
      this.workers.push(A);
    }

    // Items customers are standing at an empty stall for: workers rush these first.
    this.workers.demand = new Set(this.customers.filter(c => c.state === 'toShelf' && !S.shelves[c.item]).map(c => c.item));
    this.player.update(S, dt, time, input, this.fx);
    for (const w of this.workers) w.update(S, dt, time, this.fx, this.workers);

    // Customers
    const shelves = Sim.available(S);
    this.spawnT -= dt;
    const active = this.customers.filter(c => c.state !== 'leave').length;
    const room = Math.min(CUSTOMERS.max, CUSTOMERS.base + CUSTOMERS.perStall * shelves.length);
    if (this.spawnT <= 0 && active < room && shelves.length) {
      const every = Math.max(0.7, CUSTOMERS.every - 0.15 * shelves.length);
      this.spawnT = every * (0.6 + this.rand() * 0.8);
      // Stalls that have stock attract more shoppers.
      const stocked = shelves.filter(k => S.shelves[k] > 0);
      const pool = stocked.length && this.rand() < 0.75 ? stocked : shelves;
      const item = pool[Math.floor(this.rand() * pool.length)];
      const qty = 1 + Math.floor(this.rand() * (ITEMS[item].price <= 4 ? 4 : 3));
      this.customers.push(new Customer(this.world, item, qty, this.rand));
    }
    const crowd = this.customers;
    this.customers = crowd.filter(c => {
      const gone = c.update(S, dt, time, crowd, this.fx);
      if (gone) c.dispose();
      return !gone;
    });
  }
}
