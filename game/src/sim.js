// The simulation: rounds, economy, movement, firing and win conditions.
// One job: the whole game state at a fixed 60 Hz tick. Rendering reads it;
// input writes into it through the small methods below.
import { ROUND, WEAPONS, GRENADES, ARMOR, BOT_NAMES, PLAYER_NAME } from './config.js';
import { angleDiff, clamp, dist2d, segmentBlocked } from './utils.js';
import { fireWeapon, startReload, finishReload } from './combat.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createBots } from './bots.js';

const STEP = 1 / 60;

function makeFighter(id, team, name, isBot) {
  return {
    id, team, name, isBot,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    velY: 0, grounded: true, crouch: false, sprinting: false, moving: false,
    moveX: 0, moveZ: 0,
    hp: 100, armor: 0, helmet: false, hasKit: false, alive: true,
    money: ROUND.startMoney,
    weapons: { primary: null, pistol: 'p250' },
    weapon: 'p250',
    ammo: { p250: { mag: 12, reserve: 36 } },
    grenades: [],
    kills: 0, deaths: 0, assists: 0, roundKills: 0,
    reloading: 0, nextShotAt: 0, bloom: 0, recoilPitch: 0,
    lastShotAt: -99, lastDamageAt: -99, lastAttacker: null,
    planting: false, defusing: false, triggerQueued: false,
    flashUntil: 0, flashAmount: 0,
    bot: null,
  };
}

export function createSim(map, rng) {
  const sim = {
    map, rng,
    time: 0,
    phase: 'menu', // menu | buy | live | round_end | match_end
    phaseT: 0,
    round: 0,
    score: { A: 0, B: 0 },
    plan: 'rushA',
    lossStreak: { A: 0, B: 0 },
    fighters: [],
    events: [],
    noiseLog: [],
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    mvp: null,
    roundStartKills: {},
    stats: { plants: 0, defuses: 0 },
    roundHistory: [],
  };
  sim.grenades = createGrenades(sim);
  sim.bomb = createBomb(sim);
  sim.bots = createBots(sim);

  function spawnFighter(f, idx) {
    const spawn = map.spawns[f.team][idx % 5];
    f.x = spawn[0] + (rng() - 0.5) * 1.2;
    f.z = spawn[1] + (rng() - 0.5) * 1.2;
    f.y = map.groundAt(f.x, f.z);
    f.yaw = f.team === 'A' ? -Math.PI / 2 : Math.PI / 2;
    f.pitch = 0;
    f.hp = 100; f.alive = true; f.velY = 0;
    f.reloading = 0; f.bloom = 0; f.recoilPitch = 0;
    f.planting = false; f.defusing = false;
    f.grenades = [];
    f.roundKills = 0;
  }

  function botAutoBuy(f) {
    const isA = f.team === 'A';
    const rifle = isA ? 'ak47' : 'm4a1';
    if (f.money >= WEAPONS[rifle].price && (!f.weapons.primary || f.weapons.primary !== rifle)) {
      buyWeapon(f, rifle);
    } else if (!f.weapons.primary && f.money >= 1500) buyWeapon(f, 'mp5');
    if (f.money >= ARMOR.vest.price && f.armor < 50) { f.money -= ARMOR.vest.price; f.armor = 100; }
    if (f.money >= ARMOR.helmet.price && !f.helmet) { f.money -= ARMOR.helmet.price; f.helmet = true; }
    if (f.team === 'B' && f.money >= ARMOR.kit.price && !f.hasKit) { f.money -= ARMOR.kit.price; f.hasKit = true; }
    const want = isA ? ['smoke', 'flash'] : ['flash', 'he'];
    for (const g of want) {
      if (f.money >= GRENADES[g].price && !f.grenades.includes(g)) { f.money -= GRENADES[g].price; f.grenades.push(g); }
    }
    if (isA && f.money >= GRENADES.molotov.price && rng() < 0.5 && !f.grenades.includes('molotov')) {
      f.money -= GRENADES.molotov.price; f.grenades.push('molotov');
    }
  }

  function buyWeapon(f, id) {
    const w = WEAPONS[id];
    if (!w || f.money < w.price) return false;
    f.money -= w.price;
    f.ammo[id] = { mag: w.mag, reserve: w.reserve };
    if (w.kind === 'pistol') { f.weapons.pistol = id; }
    else { f.weapons.primary = id; }
    f.weapon = id;
    return true;
  }

  function buyItem(f, id) {
    if (sim.phase !== 'buy') return { ok: false, why: 'Buy phase is over' };
    if (WEAPONS[id]) {
      if (f.weapons.primary === id || f.weapons.pistol === id) return { ok: false, why: 'Already owned' };
      if (f.money < WEAPONS[id].price) return { ok: false, why: 'Not enough money' };
      buyWeapon(f, id);
      sim.events.push({ type: 'buy', fighter: f, id });
      return { ok: true };
    }
    if (GRENADES[id]) {
      if (f.grenades.includes(id)) return { ok: false, why: 'Already carrying one' };
      if (f.money < GRENADES[id].price) return { ok: false, why: 'Not enough money' };
      f.money -= GRENADES[id].price;
      f.grenades.push(id);
      sim.events.push({ type: 'buy', fighter: f, id });
      return { ok: true };
    }
    if (id === 'vest') {
      if (f.armor >= 100) return { ok: false, why: 'Armor full' };
      if (f.money < ARMOR.vest.price) return { ok: false, why: 'Not enough money' };
      f.money -= ARMOR.vest.price; f.armor = 100;
      sim.events.push({ type: 'buy', fighter: f, id });
      return { ok: true };
    }
    if (id === 'helmet') {
      if (f.helmet) return { ok: false, why: 'Already owned' };
      if (f.money < ARMOR.helmet.price) return { ok: false, why: 'Not enough money' };
      f.money -= ARMOR.helmet.price; f.helmet = true;
      sim.events.push({ type: 'buy', fighter: f, id });
      return { ok: true };
    }
    if (id === 'kit') {
      if (f.hasKit) return { ok: false, why: 'Already owned' };
      if (f.money < ARMOR.kit.price) return { ok: false, why: 'Not enough money' };
      f.money -= ARMOR.kit.price; f.hasKit = true;
      sim.events.push({ type: 'buy', fighter: f, id });
      return { ok: true };
    }
    return { ok: false, why: 'Unknown item' };
  }

  function startMatch() {
    sim.fighters = [];
    for (let i = 0; i < 5; i++) sim.fighters.push(makeFighter(i, 'A', i === 0 ? PLAYER_NAME : BOT_NAMES.A[i - 1], i !== 0));
    for (let i = 0; i < 5; i++) sim.fighters.push(makeFighter(5 + i, 'B', BOT_NAMES.B[i], true));
    sim.score = { A: 0, B: 0 };
    sim.lossStreak = { A: 0, B: 0 };
    sim.round = 0;
    sim.matchWinner = null;
    // Give every bot its brain now, so startRound can assign roles.
    sim.fighters.forEach((f) => { if (f.isBot) sim.bots.initBot(f); });
    startRound();
  }

  function startRound() {
    sim.round += 1;
    const plans = ['rushA', 'rushB', 'mid', 'split', 'fake'];
    sim.plan = plans[Math.floor(rng() * plans.length)];
    // Roles.
    const attackers = sim.fighters.filter((f) => f.team === 'A');
    const defenders = sim.fighters.filter((f) => f.team === 'B');
    attackers.forEach((f, i) => { if (f.bot) f.bot.role = ['carrier', 'entry', 'support', 'support', 'flex'][i]; });
    defenders.forEach((f, i) => { if (f.bot) f.bot.role = ['holdA', 'holdA', 'holdB', 'holdB', 'flex'][i]; });
    // Carrier: a random attacker (player sometimes carries).
    const carrier = attackers[Math.floor(rng() * attackers.length)];
    sim.fighters.forEach((f, i) => spawnFighter(f, f.team === 'A' ? sim.fighters.filter((x) => x.team === 'A').indexOf(f) : sim.fighters.filter((x) => x.team === 'B').indexOf(f)));
    sim.fighters.forEach((f) => {
      if (f.isBot) botAutoBuy(f);
      if (f.bot) {
        f.bot.path = []; f.bot.pathI = 0; f.bot.target = null; f.bot.state = 'push';
        f.bot.utility = { smoke: false, flash: false, molotov: false };
        f.bot.investigate = null;
      }
    });
    sim.bomb.reset(carrier);
    sim.noiseLog = [];
    sim.phase = 'buy';
    sim.phaseT = ROUND.buySeconds;
    sim.roundWinner = null;
    sim.roundReason = '';
    sim.roundStartKills = {};
    sim.fighters.forEach((f) => { sim.roundStartKills[f.id] = f.kills; });
    sim.events.push({ type: 'roundStart', round: sim.round, plan: sim.plan });
  }

  function awardRound(winner, reason) {
    sim.roundWinner = winner;
    sim.roundReason = reason;
    sim.score[winner] += 1;
    const loser = winner === 'A' ? 'B' : 'A';
    sim.lossStreak[winner] = 0;
    sim.lossStreak[loser] += 1;
    const lossBonus = ROUND.lossMoney + Math.min(ROUND.lossStreakMax, (sim.lossStreak[loser] - 1) * ROUND.lossStreakBonus);
    let mvp = null; let best = -1;
    for (const f of sim.fighters) {
      const rk = f.kills - (sim.roundStartKills[f.id] || 0);
      if (f.team === winner && rk > best) { best = rk; mvp = f; }
      if (f.team === winner) f.money += ROUND.winMoney;
      else f.money += lossBonus;
      f.money = Math.min(16000, f.money);
    }
    if (mvp && best > 0) { mvp.money = Math.min(16000, mvp.money + ROUND.mvpBonus); sim.mvp = mvp; }
    else sim.mvp = null;
    sim.roundHistory.push({ round: sim.round, winner, reason, score: { ...sim.score } });
    sim.phase = 'round_end';
    sim.phaseT = ROUND.roundEndSeconds;
    sim.events.push({ type: 'roundEnd', winner, reason, score: { ...sim.score } });
  }

  function endMatchIfDecided() {
    const { A, B } = sim.score;
    const lead = Math.abs(A - B);
    if (sim.round < ROUND.maxRounds) {
      if (A >= ROUND.winRounds || B >= ROUND.winRounds) {
        sim.matchWinner = A > B ? 'A' : 'B';
        sim.phase = 'match_end';
        sim.events.push({ type: 'matchEnd', winner: sim.matchWinner, score: { ...sim.score } });
        return true;
      }
    } else {
      // Overtime past round 12: first to lead by 2, or most rounds at 18.
      if (lead >= ROUND.overtimeLead || sim.round >= 18) {
        sim.matchWinner = A === B ? null : A > B ? 'A' : 'B';
        sim.phase = 'match_end';
        sim.events.push({ type: 'matchEnd', winner: sim.matchWinner, score: { ...sim.score } });
        return true;
      }
    }
    return false;
  }

  function checkWin() {
    const bomb = sim.bomb.bomb;
    if (bomb.state === 'exploded') { awardRound('A', 'Bomb detonated'); return; }
    if (bomb.state === 'defused') { awardRound('B', 'Bomb defused'); return; }
    const aAlive = sim.fighters.some((f) => f.team === 'A' && f.alive);
    const bAlive = sim.fighters.some((f) => f.team === 'B' && f.alive);
    if (bomb.state === 'planted') return; // only the explosion or a defuse decides now
    if (!aAlive) { awardRound('B', 'Attackers eliminated'); return; }
    if (!bAlive) { awardRound('A', 'Defenders eliminated'); return; }
    if (sim.phaseT <= 0 && bomb.state !== 'planted') { awardRound('B', 'Time expired'); }
  }

  // --- movement: axis-separated AABB slide with a 0.55 m step-up ---
  // Colliders live in an 8 m grid so each move tests a handful of boxes,
  // not the whole map (the sim runs tens of thousands of ticks per match).
  const GRID = 8;
  const grid = new Map();
  for (const b of map.colliders) {
    const x0 = Math.floor(b.minX / GRID), x1 = Math.floor(b.maxX / GRID);
    const z0 = Math.floor(b.minZ / GRID), z1 = Math.floor(b.maxZ / GRID);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = cx + ',' + cz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      }
    }
  }
  let stampCounter = 0;

  function moveFighter(f, dt) {
    const w = WEAPONS[f.weapon];
    let speed = 4.3 * (w ? w.speed : 1);
    if (f.crouch) speed *= 0.52;
    else if (f.sprinting) speed *= 1.32;
    const len = Math.hypot(f.moveX, f.moveZ);
    f.moving = len > 0.01;
    if (f.moving) {
      const nx = f.moveX / len; const nz = f.moveZ / len;
      tryAxis(f, nx * speed * dt, 0);
      tryAxis(f, 0, nz * speed * dt);
    }
    // Vertical: gravity + walkable ground (only tops near the feet count,
    // so standing under the bridge does not snap the fighter onto it).
    f.velY -= 16 * dt;
    f.y += f.velY * dt;
    const ground = map.groundAt(f.x, f.z, f.y + 0.6);
    if (f.y <= ground) { f.y = ground; f.velY = 0; f.grounded = true; }
    else f.grounded = f.velY === 0;
  }

  function bodyOverlaps(f, b) {
    const h = f.crouch ? 1.15 : 1.7;
    return f.x + 0.35 > b.minX && f.x - 0.35 < b.maxX &&
      f.y < b.maxY && f.y + h > b.minY &&
      f.z + 0.35 > b.minZ && f.z - 0.35 < b.maxZ;
  }

  function tryAxis(f, dx, dz) {
    const ox = f.x; const oz = f.z;
    f.x += dx; f.z += dz;
    const cx = Math.floor(f.x / GRID); const cz = Math.floor(f.z / GRID);
    const stamp = ++stampCounter;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const cell = grid.get(gx + ',' + gz);
        if (!cell) continue;
        for (const b of cell) {
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          if (!bodyOverlaps(f, b)) continue;
          // Step-up: tops within 0.55 m of the feet are walkable, not walls.
          if (b.maxY <= f.y + 0.55) continue;
          f.x = ox; f.z = oz;
          return;
        }
      }
    }
  }

  function tickPlayer(f, dt, input, ev) {
    if (!f.alive) return;
    // Look.
    f.yaw -= input.lookX * 0.0022 * (input.sens || 1);
    f.pitch = clamp(f.pitch - input.lookY * 0.0022 * (input.sens || 1), -1.45, 1.45);
    // Move (WASD relative to yaw).
    const k = input.keys;
    let fx = 0; let fz = 0;
    if (k.has('KeyW')) fz -= 1;
    if (k.has('KeyS')) fz += 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    const s = Math.sin(f.yaw); const c = Math.cos(f.yaw);
    // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
    f.moveX = (-s) * -fz + c * fx;
    f.moveZ = (-c) * -fz + (-s) * fx;
    f.crouch = k.has('ControlLeft') || k.has('KeyC');
    f.sprinting = k.has('ShiftLeft') && fz < 0 && !f.crouch;
    if ((k.has('Space')) && f.grounded) { f.velY = 5.6; f.grounded = false; }
    f.planting = k.has('KeyE') && sim.bomb.bomb.carrier === f;
    f.defusing = k.has('KeyE') && sim.bomb.bomb.state === 'planted';
    if (f.defusing) sim.bomb.bomb.defuser = f;
    // Fire.
    const w = WEAPONS[f.weapon];
    const ammo = f.ammo[f.weapon];
    if (f.reloading > 0) {
      f.reloading -= dt;
      if (f.reloading <= 0) finishReload(f);
    } else if (sim.time >= f.nextShotAt && sim.phase === 'live') {
      const wantFire = w.auto ? input.firing : f.triggerQueued;
      if (wantFire && ammo && ammo.mag > 0 && sim.time >= f.flashUntil) {
        fireWeapon(f, f.weapon, sim, ev);
        f.nextShotAt = sim.time + 60 / w.rpm;
      } else if (wantFire && ammo && ammo.mag === 0) {
        startReload(f, sim);
        f.nextShotAt = sim.time + 0.3;
      }
    }
    f.triggerQueued = false;
    f.bloom = Math.max(0, f.bloom - dt * 0.09);
    f.recoilPitch = Math.max(0, f.recoilPitch - dt * 0.22);
  }

  function tickBotFighter(f, dt) {
    if (f.reloading > 0) {
      f.reloading -= dt;
      if (f.reloading <= 0) finishReload(f);
    }
    f.bloom = Math.max(0, f.bloom - dt * 0.09);
    f.recoilPitch = Math.max(0, f.recoilPitch - dt * 0.22);
  }

  let inputState = { keys: new Set(), lookX: 0, lookY: 0, firing: false, sens: 1 };

  function tick(dt, input) {
    if (input) inputState = input;
    if (sim.phase === 'menu' || sim.phase === 'match_end') return;
    sim.time += dt;
    const player = sim.fighters[0];
    if (sim.phase === 'buy') {
      sim.phaseT -= dt;
      // Bots idle in spawn; player may look around but not move.
      if (player && player.alive) {
        player.yaw -= inputState.lookX * 0.0022 * (inputState.sens || 1);
        player.pitch = clamp(player.pitch - inputState.lookY * 0.0022 * (inputState.sens || 1), -1.45, 1.45);
      }
      inputState.lookX = 0; inputState.lookY = 0;
      if (sim.phaseT <= 0) { sim.phase = 'live'; sim.phaseT = ROUND.liveSeconds; }
      return;
    }
    if (sim.phase === 'round_end') {
      sim.phaseT -= dt;
      if (sim.phaseT <= 0) {
        if (!endMatchIfDecided()) startRound();
      }
      return;
    }
    // Live.
    sim.phaseT -= dt;
    // One event buffer per tick: the frame loop drains sim.events, so a tick
    // must never scan the whole accumulated array (that was O(n^2) over a
    // fast-forwarded match). Noise events feed the hearing log here.
    const ev = [];
    sim.bots.update(dt, ev);
    if (player) tickPlayer(player, dt, inputState, ev);
    inputState.lookX = 0; inputState.lookY = 0;
    for (const f of sim.fighters) {
      if (!f.alive) continue;
      if (f.isBot) tickBotFighter(f, dt);
      moveFighter(f, dt);
    }
    sim.grenades.update(dt, ev);
    sim.bomb.update(dt, ev);
    sim.bomb.progress(dt, ev);
    for (const e of ev) {
      if (e.type === 'noise') sim.noiseLog.push({ x: e.x, z: e.z, team: e.team, radius: e.radius, at: sim.time });
      if (e.type === 'flashpop') applyFlash(e);
    }
    // Hand the tick's events to the frame loop (capped: a halted frame loop
    // during fast-forward must not grow this without bound).
    if (sim.events.length < 4000) sim.events.push(...ev);
    sim.noiseLog = sim.noiseLog.filter((n) => sim.time - n.at < 5);
    checkWin();
  }

  function applyFlash(e) {
    for (const f of sim.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - e.at.x, f.y + 1.5 - e.at.y, f.z - e.at.z);
      if (d > 30) continue;
      const yawTo = Math.atan2(-(e.at.x - f.x), -(e.at.z - f.z));
      const facing = Math.abs(angleDiff(f.yaw, yawTo)) < 1.2;
      const blocked = segmentBlocked(f.x, f.y + 1.5, f.z, e.at.x, e.at.y, e.at.z, map.colliders);
      let amount = clamp(1 - d / 30, 0.15, 1) * (facing ? 1 : 0.35) * (blocked ? 0.25 : 1);
      if (amount > 0.1) {
        f.flashUntil = sim.time + amount * 2.6;
        f.flashAmount = Math.max(f.flashAmount, amount);
        if (f.bot) f.bot.target = null;
      }
    }
  }

  // --- test hooks / public API ---
  sim.startMatch = startMatch;
  sim.startRound = startRound;
  sim.tick = tick;
  sim.buyItem = buyItem;
  sim.buyWeapon = buyWeapon;
  sim.player = () => sim.fighters[0];
  sim.kills = () => sim.fighters.reduce((a, f) => a + f.kills, 0);
  sim.plants = () => sim.events.filter((e) => e.type === 'bombPlanted').length;
  sim.fastForward = (seconds) => {
    const steps = Math.ceil(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      if (sim.phase === 'match_end') break;
      tick(STEP); // reuses the last live input state, so held keys keep working
      sim.events.length = 0; // headless fast-forward: nobody drains these
    }
    return { phase: sim.phase, round: sim.round, score: { ...sim.score }, time: sim.time };
  };
  sim.drainEvents = () => {
    const out = sim.events;
    sim.events = [];
    return out;
  };
  sim.switchWeapon = (f, id) => {
    if (!f.ammo[id]) return false;
    f.weapon = id;
    return true;
  };
  sim.throwGrenade = (f, kind) => {
    if (!f.grenades.includes(kind) || sim.phase !== 'live') return false;
    f.grenades.splice(f.grenades.indexOf(kind), 1);
    sim.grenades.throwGrenade(f, kind);
    return true;
  };
  return sim;
}
