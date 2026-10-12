import * as THREE from 'three';
import { ZONES, UPGRADES, ROLES, playerCap } from './data.js';
import { load, save, wipe, newState } from './state.js';
import * as Sim from './sim.js';
import { World, plotPos } from './world.js';
import { Agents } from './agents.js';
import { Input } from './input.js';

let S = load();
Sim.ensure(S);
const awaySecs = Sim.catchUp(S);

const $ = sel => document.querySelector(sel);
const el = {
  canvas: $('#world'), coins: $('#coins'), coinStat: $('.stat.coins'), progFill: $('#prog-fill'), progText: $('#prog-text'),
  basket: $('#basket'), joy: $('#joy'), modal: $('#modal'), toast: $('#toast'), mute: $('#mute'), hint: $('#hint'),
};

// ---------- sound ----------
let actx, lastTone = 0;
function tone(f, d = 0.08, type = 'triangle', delay = 0, vol = 0.05) {
  if (S.muted) return;
  try {
    actx ||= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    const t0 = actx.currentTime + delay;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + d);
  } catch {}
}
const throttled = fn => () => { const n = performance.now(); if (n - lastTone > 45) { lastTone = n; fn(); } };
const sfx = {
  pick: throttled(() => tone(700 + Math.random() * 200, 0.06)),
  drop: throttled(() => tone(480 + Math.random() * 80, 0.06)),
  pay: throttled(() => tone(1100, 0.03, 'sine', 0, 0.03)),
  coin: throttled(() => tone(1300 + Math.random() * 200, 0.05, 'sine', 0, 0.04)),
  cash: throttled(() => { tone(1320, 0.06, 'square', 0, 0.018); tone(1760, 0.08, 'square', 0.06, 0.018); }),
  unlock: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.09, 0.06)),
  truck: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.08, 0.06)),
  err: () => tone(180, 0.15, 'square', 0, 0.03),
};

// ---------- feedback ----------
let toastTimer;
function toast(msg, ms = 2400) {
  el.toast.innerHTML = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function float(x, y, html, cls = '') {
  const n = document.createElement('div');
  n.className = `float ${cls}`;
  n.innerHTML = html;
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1300);
}

function confetti() {
  const bits = ['🎉', '✨', '⭐', '🌟', '🎊'];
  for (let i = 0; i < 18; i++) {
    const n = document.createElement('div');
    n.className = 'confetti';
    n.textContent = bits[i % bits.length];
    n.style.left = `${10 + Math.random() * 80}vw`;
    n.style.animationDelay = `${Math.random() * 0.4}s`;
    n.style.fontSize = `${18 + Math.random() * 18}px`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2200);
  }
}

const pulse = node => { node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse'); };

// Every visible effect of a game event goes through here.
function fx(ev) {
  if (ev.item) world.fly(ev.item, ev.from, ev.to);
  if (ev.coin) world.fly('coin', ev.from, ev.to);
  if (!ev.quiet && ev.sound) sfx[ev.sound]?.();
  if (ev.coins) pulse(el.coinStat);
  if (ev.paid) {
    const p = world.screenPos(ev.at);
    float(p.x, p.y, `+${ev.paid} 🪙`, 'small');
  }
  if (ev.truckReward) {
    const p = world.screenPos(world.truck.position.clone().setY(3));
    float(p.x, p.y, `+${ev.truckReward} 🪙`, 'big');
    toast(`🚚 Order delivered! <b>+${ev.truckReward} 🪙</b>`);
    sfx.truck();
    pulse(el.coinStat);
  }
  if (ev.bought) {
    const what = ev.bought.role ? `${ROLES[ev.bought.role].icon} New ${ROLES[ev.bought.role].name} hired!` : { coop: 'New chicken!', cowpen: 'New cow!' }[ev.bought.id];
    toast(`🎉 <b>${what}</b> (${ev.count}/${ev.bought.max})`, 2400);
    sfx.unlock();
    save(S);
  }
  if (ev.unlocked) {
    toast(`🎉 <b>${ev.unlocked.label}</b> unlocked!`, 3000);
    sfx.unlock();
    confetti();
    save(S);
  }
}

// ---------- world & loop ----------
const world = new World(el.canvas);
const agents = new Agents(world, () => S, fx);
const input = new Input(el.canvas, el.joy, f => { world.zoom = Math.min(1.5, Math.max(0.65, world.zoom * f)); });
world.follow(agents.player.pos, 0, true);

let last = performance.now(), hudT = 0;
function step(dt, t, move) {
  Sim.tick(S, dt);
  agents.update(dt, t, move);
  world.sync(S, dt, t);
  guide();
  world.follow(agents.player.pos, dt);
}
world.renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt, now / 1000, input.vector);
  world.render();
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.1; renderHud(); }
});

// ---------- HUD ----------
const zonesDone = () => ZONES.filter(z => Sim.zoneDone(S, z)).length;
let shownCoins = S.coins;

function renderHud() {
  shownCoins += (S.coins - shownCoins) * 0.35;
  if (Math.abs(S.coins - shownCoins) < 1) shownCoins = S.coins;
  el.coins.textContent = Math.round(shownCoins).toLocaleString();
  const done = zonesDone();
  el.progFill.style.width = `${(done / ZONES.length) * 100}%`;
  el.progText.textContent = `Farm ${done}/${ZONES.length}`;
  const cap = playerCap(S.upgrades.capacity);
  el.basket.textContent = `${S.stack.length}/${cap}`;
  el.basket.parentElement.classList.toggle('full', S.stack.length >= cap);
  el.mute.textContent = S.muted ? '🔇' : '🔊';
  el.hint.hidden = input.moved;
}

// Early-game guide arrow: points at the next useful thing to do.
function guide() {
  const done = zonesDone();
  const p = agents.player.pos;
  let target = null;
  const affordable = ZONES.filter(z => Sim.zoneVisible(S, z) && S.coins >= z.cost - (S.zonePaid[z.id] || 0));
  const collector = S.workers.some(w => w.role === 'collector');
  const [richest, coins] = Object.entries(S.stallCoins).sort((a, b) => b[1] - a[1])[0] || [];
  if (!collector && coins && (coins >= 10 || (done < 3 && coins > 0))) target = world.pad('cash', richest).pos;
  else if (affordable.length) target = new THREE.Vector3(affordable[0].at[0], 0, affordable[0].at[1]);
  else if (done < 4) {
    if (S.stack.length) {
      const pad = world.activePads(S).find(pd =>
        (pd.kind === 'shelf' && S.stack.includes(pd.item) && S.shelves[pd.item] < 12)
        || ((pd.kind === 'penIn' || pd.kind === 'machIn') && S.stack.includes(pd.item))
        || (pd.kind === 'truck' && S.stack.some(i => Sim.truckNeeds(S, i))));
      if (pad && S.stack.length >= Math.min(4, playerCap(S.upgrades.capacity))) target = pad.pos;
    }
    if (!target && S.stack.length < playerCap(S.upgrades.capacity)) {
      let bd = Infinity;
      for (const id of Object.keys(S.plots)) {
        for (let i = 0; i < Sim.plotCount(); i++) {
          if (!Sim.isRipe(S, id, i)) continue;
          const pp = plotPos(id, i), d = pp.distanceToSquared(p);
          if (d < bd) { bd = d; target = pp; }
        }
      }
      if (target && bd < 4) target = null;
    }
  }
  world.arrow.visible = !!target && target.distanceTo(p) > 1.2;
  if (target) { world.arrow.position.x = target.x; world.arrow.position.z = target.z; }
}

// ---------- upgrades ----------
function upgradesHtml() {
  const hasHands = S.workers.some(w => w.role && w.role !== 'collector');
  return `<h2>⬆️ Upgrades</h2><div class="ups">${Object.entries(UPGRADES).filter(([, u]) => (!u.needsWorker || hasHands) && (!u.needs || Sim.isUnlocked(S, u.needs))).map(([key, u]) => {
    const lv = S.upgrades[key], max = lv >= u.max, cost = u.cost(lv);
    return `<div class="up">
      <span class="up-icon emo">${u.icon}</span>
      <div class="info"><b>${u.name}</b>
        <div class="pips">${Array.from({ length: u.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</div></div>
      ${max ? '<span class="maxed">MAX</span>' : `<button class="btn gold" data-act="buy" data-key="${key}" ${S.coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`}
    </div>`;
  }).join('')}</div>
  <button class="link" data-act="reset">Start a new farm</button>`;
}

function openModal(html) {
  el.modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}<button class="close" data-act="close" aria-label="Close">✕</button></div>`;
  el.modal.hidden = false;
}
const closeModal = () => { el.modal.hidden = true; el.modal.innerHTML = ''; };

document.addEventListener('click', e => {
  if (e.target === el.modal) return closeModal();
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  switch (t.dataset.act) {
    case 'upgrades': return openModal(upgradesHtml());
    case 'buy': {
      const r = Sim.buyUpgrade(S, t.dataset.key);
      if (r.ok) { sfx.unlock(); save(S); } else { sfx.err(); toast(r.msg); }
      return openModal(upgradesHtml());
    }
    case 'close': return closeModal();
    case 'mute': S.muted = !S.muted; return save(S);
    case 'reset':
      if (confirm('Start a brand new farm? All progress will be lost.')) {
        wipe();
        S = newState();
        save(S);
        location.reload();
      }
  }
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

setInterval(() => save(S), 3000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(S); });

if (awaySecs > 60) toast(`👋 Welcome back! Your farm kept working for ${Math.round(awaySecs / 60)} min.`, 3500);

// Debug handle for the console. farm.walkTo(x, z) steps the simulation while steering the farmer there.
let simT = 1000;
window.farm = {
  world, agents, Sim,
  get state() { return S; },
  run(secs, move = { x: 0, z: 0 }) {
    for (let k = 0; k < secs * 30; k++) { Sim.skipTime(1000 / 30); step(1 / 30, (simT += 1 / 30), move); }
    world.render();
    renderHud();
  },
  walkTo(x, z, maxSecs = 20) {
    const p = agents.player.pos;
    for (let k = 0; k < maxSecs * 30; k++) {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      Sim.skipTime(1000 / 30);
      step(1 / 30, (simT += 1 / 30), { x: dx / Math.max(d, 1), z: dz / Math.max(d, 1) });
    }
    world.render();
    renderHud();
    return [+p.x.toFixed(2), +p.z.toFixed(2)];
  },
};
