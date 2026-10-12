import { START_UNLOCKED } from './data.js';

const KEY = 'farmTycoon.v2';
const VERSION = 2;

export function newState() {
  return {
    version: VERSION,
    coins: 0,
    unlocked: [...START_UNLOCKED],
    zonePaid: {},
    plots: {},
    pens: {},
    machines: {},
    shelves: {},
    pile: 0,
    stack: [],
    workers: [],
    truck: null,
    upgrades: { speed: 0, capacity: 0, growth: 0, price: 0, workerSpeed: 0, workerCap: 0 },
    muted: false,
    savedAt: Date.now(),
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.version === VERSION) return s;
    }
  } catch {}
  return newState();
}

export function save(s) {
  s.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch {}
}
