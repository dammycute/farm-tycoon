// All game content and layout as plain data. Positions are [x, z] on the ground (x → right, z → toward camera).

export const ITEMS = {
  wheat:  { name: 'Wheat',  emoji: '🌾', price: 2 },
  corn:   { name: 'Corn',   emoji: '🌽', price: 4 },
  egg:    { name: 'Eggs',   emoji: '🥚', img: 'assets/egg.png', price: 6 },
  milk:   { name: 'Milk',   emoji: '🥛', price: 10 },
  bread:  { name: 'Bread',  emoji: '🍞', price: 14 },
  cheese: { name: 'Cheese', emoji: '🧀', price: 24 },
};

// Crops regrow on their own after harvest; grow is in seconds.
export const FIELDS = {
  wheat1: { crop: 'wheat', pos: [-8, 0],   grow: 6 },
  wheat2: { crop: 'wheat', pos: [-8, -7],  grow: 6 },
  corn1:  { crop: 'corn',  pos: [-15, 0],  grow: 9 },
  corn2:  { crop: 'corn',  pos: [-15, -7], grow: 9 },
};
export const FIELD_GRID = { cols: 3, rows: 3, size: 1.7, gap: 0.3 };

// Animals eat feed from the trough and drop products in the tray. time = seconds per product per animal.
export const PENS = {
  coop:   { name: 'Chicken Coop', animal: 'chicken', count: 4, feed: 'wheat', product: 'egg',  time: 7,  pos: [4, -1],  size: [6, 4.4] },
  cowpen: { name: 'Cow Pasture',  animal: 'cow',     count: 3, feed: 'corn',  product: 'milk', time: 10, pos: [13, -1], size: [6.4, 4.4] },
};

// Machines turn `need` inputs into one output.
export const MACHINES = {
  bakery: { name: 'Bakery', input: 'wheat', need: 2, output: 'bread',  time: 2, pos: [2, -10],  look: { wall: '#f8d9a8', roofColor: '#b5482f', sign: '🍞' } },
  dairy:  { name: 'Dairy',  input: 'milk',  need: 2, output: 'cheese', time: 2.5, pos: [12, -10], look: { wall: '#dfeaf3', roofColor: '#4f7fb5', sign: '🧀' } },
};

export const SHELVES = { wheat: [-6, 7.5], egg: [-3, 7.5], corn: [0, 7.5], milk: [3, 7.5], bread: [6, 7.5], cheese: [9, 7.5] };
// Customers pay as they take goods: coins pile up beside each stall at this offset.
export const STALL_COINS = [1.5, -0.35];
export const COLLECTOR_HOME = [12, 4.6];
export const TRUCK = [-14, 12.2];
export const ROAD_Z = 13;
export const PLAYER_START = [0, 3];
export const WORKER_HOME = [-3, 3.5];
export const BOUNDS = { minX: -19.5, maxX: 19.5, minZ: -14, maxZ: 11.2 };

export const CAPS = { shelf: 12, feed: 10, tray: 12, machineIn: 20, machineOut: 16 };

// Unlock zones: stand on one to pour coins in. A zone appears once the zone in `after` is done.
export const ZONES = [
  { id: 'coop',        cost: 30,  after: null,         unlock: 'pen:coop',       label: '🐔 Chicken Coop',     at: [4, -1] },
  { id: 'eggShelf',    cost: 20,  after: 'coop',       unlock: 'shelf:egg',      label: '🥚 Egg Stand',        at: [-3, 7.5] },
  { id: 'truck',       cost: 50,  after: 'coop',       unlock: 'truck',          label: '🚚 Order Truck',      at: [-14, 9.4] },
  { id: 'loader1',     cost: 100, after: 'truck',      unlock: 'hire:loader1',   label: '🚚 Hire Truck Loader', at: [-10.5, 9.6] },
  { id: 'hand1',       cost: 80,  after: 'eggShelf',   unlock: 'hire:hand1',     label: '🌾 Hire Harvester',   at: [-3, 3.5] },
  { id: 'wheat2',      cost: 60,  after: 'eggShelf',   unlock: 'field:wheat2',   label: '🌾 Wheat Field',      at: [-8, -7] },
  { id: 'cashier',     cost: 120, after: 'hand1',      unlock: 'hire:cashier',   label: '💰 Hire Coin Collector', at: [12, 4.6] },
  { id: 'corn1',       cost: 150, after: 'truck',      unlock: 'field:corn1',    label: '🌽 Corn Field',       at: [-15, 0] },
  { id: 'cornShelf',   cost: 80,  after: 'corn1',      unlock: 'shelf:corn',     label: '🌽 Corn Stand',       at: [0, 7.5] },
  { id: 'cowpen',      cost: 250, after: 'corn1',      unlock: 'pen:cowpen',     label: '🐄 Cow Pasture',      at: [13, -1] },
  { id: 'milkShelf',   cost: 120, after: 'cowpen',     unlock: 'shelf:milk',     label: '🥛 Milk Stand',       at: [3, 7.5] },
  { id: 'hand2',       cost: 300, after: 'cashier',    unlock: 'hire:hand2',     label: '🐔 Hire Animal Keeper', at: [9.2, 3.9] },
  { id: 'corn2',       cost: 300, after: 'cowpen',     unlock: 'field:corn2',    label: '🌽 Corn Field',       at: [-15, -7] },
  { id: 'bakery',      cost: 400, after: 'milkShelf',  unlock: 'machine:bakery', label: '🥖 Bakery',           at: [2, -10] },
  { id: 'factory1',    cost: 250, after: 'bakery',     unlock: 'hire:factory1',  label: '🏭 Hire Factory Worker', at: [6.2, -6.8] },
  { id: 'breadShelf',  cost: 200, after: 'bakery',     unlock: 'shelf:bread',    label: '🍞 Bread Stand',      at: [6, 7.5] },
  { id: 'dairy',       cost: 700, after: 'breadShelf', unlock: 'machine:dairy',  label: '🧀 Dairy',            at: [12, -10] },
  { id: 'cheeseShelf', cost: 350, after: 'dairy',      unlock: 'shelf:cheese',   label: '🧀 Cheese Stand',     at: [9, 7.5] },
];
export const START_UNLOCKED = ['field:wheat1', 'shelf:wheat'];

// Repeatable buy spots: each time one fills you get one more, and the next costs more (up to max).
export const BUYS = [
  { id: 'harvester', role: 'harvester', label: '🌾 Hire Harvester',      needs: 'hire:hand1',    base: 150, growth: 1.7, max: 4, at: [-3, 3.5] },
  { id: 'keeper',    role: 'keeper',    label: '🐔 Hire Animal Keeper',  needs: 'hire:hand2',    base: 200, growth: 1.7, max: 3, at: [9.2, 3.9] },
  { id: 'loader',    role: 'loader',    label: '🚚 Hire Truck Loader',   needs: 'hire:loader1',  base: 180, growth: 1.7, max: 3, at: [-10.5, 9.6] },
  { id: 'factory',   role: 'factory',   label: '🏭 Hire Factory Worker', needs: 'hire:factory1', base: 300, growth: 1.7, max: 3, at: [6.2, -6.8] },
  { id: 'collector', role: 'collector', label: '💰 Hire Coin Collector', needs: 'hire:cashier',  base: 250, growth: 1.8, max: 2, at: [12, 4.6] },
  { id: 'coop',   label: '🐔 +1 Chicken',  needs: 'pen:coop',   base: 40,  growth: 1.45, max: 8, at: [8.5, -1.5] },
  { id: 'cowpen', label: '🐄 +1 Cow',      needs: 'pen:cowpen', base: 120, growth: 1.5,  max: 5, at: [17.4, -1] },
];
export const buyCost = (b, n) => Math.round(b.base * b.growth ** n);

// Each worker has one job, a uniform and an icon over their head.
// harvester: crops → stalls, troughs, bakery · keeper: eggs/milk → stalls, dairy
// factory: bread/cheese → stalls · loader: anything the truck wants → truck · collector: stall coins
export const ROLES = {
  harvester: { name: 'Harvester',      icon: '🌾', look: { shirt: '#5aa04a', pants: '#6b5a3a', hat: 'straw', hatColor: '#e6c86e' } },
  keeper:    { name: 'Animal Keeper',  icon: '🐔', look: { shirt: '#e08a2c', pants: '#5a4632', hat: 'cap', hatColor: '#c0533a' } },
  factory:   { name: 'Factory Worker', icon: '🏭', look: { shirt: '#8e6cc4', pants: '#3f3a4a', hat: 'cap', hatColor: '#ffffff' } },
  loader:    { name: 'Truck Loader',   icon: '🚚', look: { shirt: '#3d7fd9', pants: '#2f3e57', hat: 'cap', hatColor: '#ffd23f' } },
  collector: { name: 'Coin Collector', icon: '💰', look: { shirt: '#2f3e57', pants: '#2f2a26', hat: 'cap', hatColor: '#f4b400' } },
};
// What the first hire from each zone becomes.
export const HIRE_ROLES = { hand1: 'harvester', hand2: 'keeper', loader1: 'loader', factory1: 'factory', cashier: 'collector' };

export const UPGRADES = {
  speed:       { name: 'Farmer speed',    icon: '👟', max: 6, cost: lv => Math.round(40 * 1.9 ** lv) },
  capacity:    { name: 'Farmer basket',   icon: '🧺', max: 8, cost: lv => Math.round(30 * 1.75 ** lv) },
  growth:      { name: 'Faster crops',    icon: '🌱', max: 5, cost: lv => Math.round(80 * 2 ** lv) },
  price:       { name: 'Better prices',   icon: '🏷️', max: 5, cost: lv => Math.round(120 * 2 ** lv) },
  workerSpeed: { name: 'Worker speed',    icon: '🏃', max: 5, cost: lv => Math.round(150 * 1.9 ** lv), needsWorker: true },
  workerCap:   { name: 'Worker basket',   icon: '🧺', max: 5, cost: lv => Math.round(150 * 1.8 ** lv), needsWorker: true },
  factory:     { name: 'Factory speed',   icon: '⚙️', max: 5, cost: lv => Math.round(200 * 1.9 ** lv), needs: 'machine:bakery' },
};
export const playerSpeed = lv => 5 + 0.7 * lv;
export const playerCap = lv => 6 + 3 * lv;
export const workerSpeed = lv => 3.4 + 0.6 * lv;
export const workerCap = lv => 4 + 2 * lv;

// Up to base + perStall per open stall are on the farm at once; patience is seconds at an empty stall.
export const CUSTOMERS = { every: 1.8, base: 5, perStall: 2, max: 18, patience: 25 };
export const TRUCK_AWAY = 20;
