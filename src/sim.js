// Game rules: production timers, item transfers between stacks and stations, unlocks.
// Every transfer takes an `owner` ({ stack: [] }) so the player and workers share the same rules.
import {
  ITEMS, FIELDS, FIELD_GRID, PENS, MACHINES, SHELVES, CAPS, ZONES, UPGRADES,
  playerCap, workerCap, TRUCK_AWAY,
} from './data.js';

// Game clock for timers. Equals wall-clock time unless a test fast-forwards it with skipTime().
let clockOffset = 0;
export const now = () => Date.now() + clockOffset;
export const skipTime = ms => { clockOffset += ms; };

export const isUnlocked = (S, key) => S.unlocked.includes(key);
export const plotCount = () => FIELD_GRID.cols * FIELD_GRID.rows;
export const growMs = (S, field) => FIELDS[field].grow * 1000 * 0.85 ** S.upgrades.growth;
export const priceOf = (S, item) => Math.round(ITEMS[item].price * (1 + 0.2 * S.upgrades.price));
export const capOf = (S, owner) => (owner === S ? playerCap(S.upgrades.capacity) : workerCap(S.upgrades.workerCap));
export const hasRoom = (S, owner) => owner.stack.length < capOf(S, owner);

// Create runtime records for everything that is unlocked.
export function ensure(S) {
  // Older saves had a single coin pile at a till; bank it.
  if (S.pile) S.coins += S.pile;
  delete S.pile;
  S.stallCoins ||= {};
  for (const w of S.workers) if (w.kind === 'cashier') w.kind = 'collector';
  // Drop stall records for stalls that aren't actually unlocked (or got corrupted).
  for (const rec of [S.shelves, S.stallCoins]) {
    for (const k of Object.keys(rec)) {
      if (!isUnlocked(S, `shelf:${k}`)) delete rec[k];
      else if (!Number.isFinite(rec[k])) rec[k] = 0;
    }
  }
  if (S.truck?.order && Object.keys(S.truck.order).some(k => !isUnlocked(S, `shelf:${k}`))) S.truck.order = null;

  for (const key of S.unlocked) {
    const [kind, id] = key.split(':');
    if (kind === 'field') S.plots[id] ||= Array(plotCount()).fill(0);
    if (kind === 'pen') S.pens[id] ||= { feed: 0, out: 0, progress: 0 };
    if (kind === 'machine') S.machines[id] ||= { in: 0, out: 0, progress: 0 };
    if (kind === 'shelf') { S.shelves[id] ??= 0; S.stallCoins[id] ??= 0; }
    if (kind === 'hire' && !S.workers.some(w => w.id === id)) {
      S.workers.push({ id, kind: id === 'cashier' ? 'collector' : 'farmhand', stack: [] });
    }
    if (kind === 'truck' && !S.truck) S.truck = { order: null, loaded: {}, awayUntil: 0 };
  }
}

// Advance pens, machines and the truck by dt seconds.
export function tick(S, dt) {
  for (const [id, p] of Object.entries(S.pens)) {
    const def = PENS[id];
    if (p.feed <= 0 || p.out >= CAPS.tray) continue;
    p.progress += (dt * def.count) / def.time;
    while (p.progress >= 1 && p.feed > 0 && p.out < CAPS.tray) {
      p.progress -= 1;
      p.feed--;
      p.out++;
    }
    if (p.feed <= 0) p.progress = Math.min(p.progress, 0.99);
  }
  for (const [id, m] of Object.entries(S.machines)) {
    const def = MACHINES[id];
    if (m.in < def.need || m.out >= CAPS.machineOut) continue;
    m.progress += dt / def.time;
    if (m.progress >= 1) {
      m.progress = 0;
      m.in -= def.need;
      m.out++;
    }
  }
  const tr = S.truck;
  if (tr && !tr.order && now() >= tr.awayUntil) newTruckOrder(S);
}

// Time passes while the game is closed: run production for up to two hours.
export function catchUp(S) {
  const secs = Math.min(7200, Math.max(0, (Date.now() - (S.savedAt || Date.now())) / 1000));
  for (let t = 0; t < secs; t += 1) tick(S, 1);
  return secs;
}

// ---------- stack helpers ----------
function takeItem(owner, item) {
  const i = owner.stack.lastIndexOf(item);
  if (i < 0) return false;
  owner.stack.splice(i, 1);
  return true;
}

// ---------- transfers (each moves one item; returns the item id or null) ----------
export function isRipe(S, field, i) {
  return now() >= S.plots[field][i];
}

export function harvest(S, owner, field, i) {
  if (!hasRoom(S, owner) || !isRipe(S, field, i)) return null;
  S.plots[field][i] = now() + growMs(S, field);
  const crop = FIELDS[field].crop;
  owner.stack.push(crop);
  return crop;
}

export function feedPen(S, owner, id) {
  const p = S.pens[id], feed = PENS[id].feed;
  if (p.feed >= CAPS.feed || !takeItem(owner, feed)) return null;
  p.feed++;
  return feed;
}

export function takeFromPen(S, owner, id) {
  const p = S.pens[id];
  if (p.out <= 0 || !hasRoom(S, owner)) return null;
  p.out--;
  owner.stack.push(PENS[id].product);
  return PENS[id].product;
}

export function feedMachine(S, owner, id) {
  const m = S.machines[id], input = MACHINES[id].input;
  if (m.in >= CAPS.machineIn || !takeItem(owner, input)) return null;
  m.in++;
  return input;
}

export function takeFromMachine(S, owner, id) {
  const m = S.machines[id];
  if (m.out <= 0 || !hasRoom(S, owner)) return null;
  m.out--;
  owner.stack.push(MACHINES[id].output);
  return MACHINES[id].output;
}

export function stockShelf(S, owner, item) {
  if (S.shelves[item] >= CAPS.shelf || !takeItem(owner, item)) return null;
  S.shelves[item]++;
  return item;
}

// A customer takes one item and drops its price in coins beside the stall. Returns the price, or 0.
export function buyFromShelf(S, item) {
  if (!(S.shelves[item] > 0)) return 0;
  S.shelves[item]--;
  const price = priceOf(S, item);
  S.stallCoins[item] += price;
  return price;
}

// Pick up part of a stall's coin pile (big piles empty in a few grabs). Returns coins taken.
export function collectStall(S, item) {
  const n = S.stallCoins[item] || 0;
  if (n <= 0) return 0;
  const amt = Math.max(1, Math.ceil(n / 8));
  S.stallCoins[item] -= amt;
  S.coins += amt;
  return amt;
}

export function truckNeeds(S, item) {
  const tr = S.truck;
  return !!tr?.order && (tr.order[item] || 0) > (tr.loaded[item] || 0);
}

// Returns { item, reward? } when an item was loaded; reward is set when the order completes.
export function loadTruck(S, owner) {
  const tr = S.truck;
  if (!tr?.order) return null;
  const item = Object.keys(tr.order).find(k => truckNeeds(S, k) && owner.stack.includes(k));
  if (!item) return null;
  takeItem(owner, item);
  tr.loaded[item] = (tr.loaded[item] || 0) + 1;
  const done = Object.entries(tr.order).every(([k, q]) => (tr.loaded[k] || 0) >= q);
  if (!done) return { item };
  const reward = tr.reward;
  S.coins += reward;
  tr.order = null;
  tr.loaded = {};
  tr.awayUntil = now() + TRUCK_AWAY * 1000;
  return { item, reward };
}

// Items the farm can currently produce (used for customers and truck orders).
export function available(S) {
  return Object.keys(S.shelves).filter(k => isUnlocked(S, `shelf:${k}`));
}

function newTruckOrder(S) {
  const pool = available(S).sort(() => Math.random() - 0.5);
  const types = pool.slice(0, Math.min(pool.length, 1 + Math.floor(Math.random() * 2) + (pool.length > 3 ? 1 : 0)));
  const order = {};
  let value = 0;
  for (const k of types) {
    const q = ITEMS[k].price <= 4 ? 6 + Math.floor(Math.random() * 6) : 3 + Math.floor(Math.random() * 4);
    order[k] = q;
    value += priceOf(S, k) * q;
  }
  S.truck.order = order;
  S.truck.loaded = {};
  S.truck.reward = Math.round(value * 2);
}

// ---------- unlock zones ----------
export const zoneDone = (S, z) => isUnlocked(S, z.unlock);
export function zoneVisible(S, z) {
  if (zoneDone(S, z)) return false;
  if (!z.after) return true;
  return zoneDone(S, ZONES.find(o => o.id === z.after));
}

// Pour up to `amount` coins into a zone. Returns { paid, unlocked }.
export function payZone(S, z, amount) {
  const paid = S.zonePaid[z.id] || 0;
  const pay = Math.min(amount, S.coins, z.cost - paid);
  if (pay <= 0) return { paid: 0 };
  S.coins -= pay;
  S.zonePaid[z.id] = paid + pay;
  if (S.zonePaid[z.id] < z.cost) return { paid: pay };
  S.unlocked.push(z.unlock);
  ensure(S);
  return { paid: pay, unlocked: z };
}

export function buyUpgrade(S, key) {
  const u = UPGRADES[key], lv = S.upgrades[key];
  if (lv >= u.max) return { ok: false, msg: 'Fully upgraded' };
  const cost = u.cost(lv);
  if (S.coins < cost) return { ok: false, msg: 'Not enough coins' };
  S.coins -= cost;
  S.upgrades[key]++;
  return { ok: true };
}
