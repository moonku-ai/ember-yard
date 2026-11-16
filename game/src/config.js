// Game tuning: weapons, grenades, economy and round rules.
// One job: every number the sim balances on, in one place.
export const ROUND = {
  buySeconds: 15,
  liveSeconds: 100,
  plantSeconds: 3.5,
  defuseSeconds: 5,
  defuseKitSeconds: 2.5,
  bombSeconds: 35,
  roundEndSeconds: 5,
  winRounds: 7,
  maxRounds: 13,
  overtimeLead: 2,
  startMoney: 800,
  winMoney: 3250,
  lossMoney: 1900,
  lossStreakBonus: 500,
  lossStreakMax: 1500,
  killMoney: 300,
  plantMoney: 300,
  mvpBonus: 300,
};

export const WEAPONS = {
  p250: { name: 'P250', kind: 'pistol', price: 0, damage: 34, headMult: 4, rpm: 400, mag: 12, reserve: 36, auto: false, spread: 0.011, moveSpread: 0.03, recoil: 0.011, range: 40, zoom: 1, reload: 2.2, speed: 1.0, tracer: 0xffd27a },
  mp5: { name: 'MP5', kind: 'smg', price: 1500, damage: 26, headMult: 4, rpm: 750, mag: 30, reserve: 120, auto: true, spread: 0.014, moveSpread: 0.026, recoil: 0.008, range: 34, zoom: 1, reload: 2.6, speed: 1.0, tracer: 0xffe9a8 },
  nova: { name: 'Nova', kind: 'shotgun', price: 1050, damage: 26, headMult: 2, rpm: 68, mag: 5, reserve: 30, auto: false, spread: 0.055, moveSpread: 0.07, recoil: 0.05, range: 16, zoom: 1, reload: 3.1, speed: 0.97, pellets: 8, tracer: 0xffc46b },
  ak47: { name: 'AK-47', kind: 'rifle', price: 2700, damage: 36, headMult: 4, rpm: 600, mag: 30, reserve: 90, auto: true, spread: 0.009, moveSpread: 0.028, recoil: 0.014, range: 55, zoom: 1, reload: 2.5, speed: 0.96, tracer: 0xffb347 },
  m4a1: { name: 'M4A1', kind: 'rifle', price: 3100, damage: 33, headMult: 4, rpm: 666, mag: 30, reserve: 90, auto: true, spread: 0.007, moveSpread: 0.024, recoil: 0.011, range: 55, zoom: 1, reload: 3.1, speed: 0.95, tracer: 0xfff2c0 },
  dmr: { name: 'DMR', kind: 'dmr', price: 3800, damage: 55, headMult: 2, rpm: 180, mag: 10, reserve: 40, auto: false, spread: 0.004, moveSpread: 0.03, recoil: 0.03, range: 70, zoom: 2, reload: 3.3, speed: 0.94, tracer: 0xd8f7ff },
  awp: { name: 'AWP', kind: 'sniper', price: 4750, damage: 110, headMult: 2, rpm: 41, mag: 5, reserve: 25, auto: false, spread: 0.001, moveSpread: 0.06, recoil: 0.07, range: 90, zoom: 4, reload: 3.7, speed: 0.9, tracer: 0xbfefff },
};

export const WEAPON_ORDER = ['p250', 'mp5', 'nova', 'ak47', 'm4a1', 'dmr', 'awp'];

export const GRENADES = {
  he: { name: 'HE Grenade', price: 300, key: '4', desc: 'Explodes for up to 90 damage in a 5 m radius.' },
  flash: { name: 'Flashbang', price: 200, key: '5', desc: 'Blinds anyone looking at the pop.' },
  smoke: { name: 'Smoke', price: 300, key: '6', desc: 'Blocks sight for 18 s. Cross it to push a site.' },
  molotov: { name: 'Molotov', price: 400, key: '7', desc: 'Burning ground: 40 dps for 7 s. Flushes holders.' },
};

export const ARMOR = {
  vest: { name: 'Kevlar Vest', price: 650 },
  helmet: { name: 'Helmet', price: 350 },
  kit: { name: 'Defuse Kit', price: 400 },
};

export const BOT_NAMES = {
  A: ['Sable', 'Cinder', 'Rust', 'Ember', 'Dusty'],
  B: ['Harbor', 'Ferro', 'Crane', 'Vega', 'Onyx'],
};

export const PLAYER_NAME = 'You';
