// Bot brains: team plans, routes, vision, hearing, utility use, retakes.
// One job: decide what each bot wants; the sim moves and shoots for them.
import { angleDiff, clamp, dist2d, segmentBlocked } from './utils.js';
import { fireWeapon, startReload } from './combat.js';
import { WEAPONS } from './config.js';

const PLANS = ['rushA', 'rushB', 'mid', 'split', 'fake'];
const SITE_NODE = { A: 4, B: 23 };
const HOLD_NODE = { A: [4, 5, 3], B: [23, 24, 30] };
const ENTRY_NODE = { A: 3, B: 22 };

export function createBots(sim) {
  const map = sim.map;

  function nearestNode(x, z) {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < map.nodes.length; i++) {
      const n = map.nodes[i];
      const d = dist2d(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(map.nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const nb of map.adj[cur]) {
        if (prev[nb] === -1) { prev[nb] = cur; queue.push(nb); }
      }
    }
    if (prev[to] === -1) return [to];
    const path = [];
    let cur = to;
    while (cur !== from) { path.unshift(cur); cur = prev[cur]; }
    return path;
  }

  function initBot(f) {
    f.bot = {
      plan: null, role: 'flex', path: [], pathI: 0,
      target: null, seenAt: 0, reactAt: 0, aimErr: 0,
      thinkAt: sim.time + sim.rng() * 0.3, burstLeft: 0, nextShotAt: 0,
      utility: { smoke: false, flash: false, molotov: false },
      investigate: null, stuckAt: sim.time, lastX: f.x, lastZ: f.z,
      state: 'push', saveSpot: null,
    };
  }

  function setPath(f, destNode) {
    const from = nearestNode(f.x, f.z);
    f.bot.path = findPath(from, destNode);
    f.bot.pathI = 0;
  }

  // Where this bot should be heading right now, as a nav node.
  function destinationFor(f) {
    const b = f.bot;
    const bomb = sim.bomb.bomb;
    if (f.team === 'B') {
      if (bomb.state === 'planted') return SITE_NODE[bomb.site];
      if (b.state === 'rotate') return SITE_NODE[b.rotateSite || 'A'];
      if (b.role === 'holdA') return HOLD_NODE.A[Math.floor(sim.rng() * HOLD_NODE.A.length)];
      if (b.role === 'holdB') return HOLD_NODE.B[Math.floor(sim.rng() * HOLD_NODE.B.length)];
      return b.role === 'flex' ? 14 : 13; // mid flex / connector
    }
    // Attackers.
    if (bomb.state === 'dropped') return nearestNode(bomb.x, bomb.z); // go fetch it
    if (bomb.state === 'planted') {
      // Carrier planted: attackers hold the site, not the spawn.
      return SITE_NODE[bomb.site];
    }
    if (b.state === 'save') return 0; // fall back to spawn
    if (b.investigate) return nearestNode(b.investigate.x, b.investigate.z);
    const plan = sim.plan;
    if (plan === 'rushA' || plan === 'fake') return SITE_NODE.A;
    if (plan === 'rushB') return SITE_NODE.B;
    if (plan === 'mid') return 13;
    if (plan === 'split') return f.bot.role === 'entry' ? SITE_NODE.A : SITE_NODE.B;
    return SITE_NODE.A;
  }

  function canSee(f, e) {
    const d = dist2d(f.x, f.z, e.x, e.z);
    if (d > 46) return false;
    const eyeY = f.y + 1.5;
    const tY = e.y + 1.1;
    const yawTo = Math.atan2(-(e.x - f.x), -(e.z - f.z));
    if (Math.abs(angleDiff(f.yaw, yawTo)) > 1.05 && d > 6) return false;
    if (segmentBlocked(f.x, eyeY, f.z, e.x, tY, e.z, map.sightBlockers)) return false;
    if (sim.grenades.smokeBlocks(f.x, eyeY, f.z, e.x, tY, e.z)) return false;
    return true;
  }

  function nearestVisibleEnemy(f) {
    let best = null; let bd = Infinity;
    for (const e of sim.fighters) {
      if (!e.alive || e.team === f.team) continue;
      const d = dist2d(f.x, f.z, e.x, e.z);
      if (d < bd && canSee(f, e)) { bd = d; best = e; }
    }
    return best ? { enemy: best, dist: bd } : null;
  }

  function think(f, dt, events) {
    const b = f.bot;
    const bomb = sim.bomb.bomb;
    // --- state: save / retake / rotate ---
    const alive = sim.fighters.filter((x) => x.alive);
    const mates = alive.filter((x) => x.team === f.team).length;
    const foes = alive.filter((x) => x.team !== f.team).length;
    if (f.team === 'A' && bomb.state === 'planted') b.state = 'hold';
    else if (f.team === 'B' && bomb.state === 'planted') b.state = 'retake';
    else if (f.team === 'A' && foes >= mates + 2 && sim.roundTimeLeft < 25 && bomb.state !== 'planted') b.state = 'save';
    else if (f.team === 'B' && bomb.state === 'carried') {
      // Rotate when the enemy is loud at the other site.
      const loud = sim.noiseLog.filter((n) => sim.time - n.at < 4 && n.team === 'A');
      if (loud.length) {
        const nearA = loud.some((n) => Math.hypot(n.x - map.sites.A.x, n.z - map.sites.A.z) < 12);
        const nearB = loud.some((n) => Math.hypot(n.x - map.sites.B.x, n.z - map.sites.B.z) < 12);
        if (nearA && b.role === 'holdB') { b.state = 'rotate'; b.rotateSite = 'A'; }
        else if (nearB && b.role === 'holdA') { b.state = 'rotate'; b.rotateSite = 'B'; }
        else b.state = 'hold';
      }
    } else if (b.state === 'save' || b.state === 'retake' || b.state === 'rotate') {
      if (bomb.state === 'carried') b.state = 'push';
    }
    // --- hearing: investigate enemy noises when idle ---
    if (!b.target) {
      for (const n of sim.noiseLog) {
        if (n.team === f.team || sim.time - n.at > 3) continue;
        if (dist2d(f.x, f.z, n.x, n.z) < n.radius * 0.7 && b.state === 'push') {
          b.investigate = { x: n.x, z: n.z, until: sim.time + 5 };
          break;
        }
      }
    }
    if (b.investigate && sim.time > b.investigate.until) b.investigate = null;
    // --- (re)path when needed ---
    const dest = destinationFor(f);
    const needPath = b.path.length === 0 || b.pathI >= b.path.length ||
      (b.state === 'retake' && b.path[b.path.length - 1] !== dest) ||
      (b.state === 'rotate' && b.path[b.path.length - 1] !== dest);
    if (needPath) setPath(f, dest);
    // --- stuck: repath via a detour ---
    if (sim.time - b.stuckAt > 2) {
      b.stuckAt = sim.time;
      const moved = dist2d(f.x, f.z, b.lastX, b.lastZ);
      b.lastX = f.x; b.lastZ = f.z;
      if (moved < 0.4 && (f.moveX !== 0 || f.moveZ !== 0)) {
        const detour = map.adj[nearestNode(f.x, f.z)];
        if (detour.length) setPath(f, detour[Math.floor(sim.rng() * detour.length)]);
        setPath(f, dest);
      }
    }
    // --- utility: smoke the site entry, flash before entry, molotov a holder ---
    if (f.team === 'A' && b.state === 'push') {
      const site = sim.plan === 'rushB' || (sim.plan === 'split' && b.role !== 'entry') ? map.sites.B : map.sites.A;
      const dSite = dist2d(f.x, f.z, site.x, site.z);
      if (dSite < 14 && f.grenades.includes('smoke') && !b.utility.smoke) {
        b.utility.smoke = true;
        f.grenades.splice(f.grenades.indexOf('smoke'), 1);
        sim.grenades.throwGrenade(f, 'smoke');
        events.push({ type: 'botUtility', fighter: f, kind: 'smoke' });
      } else if (dSite < 10 && f.grenades.includes('flash') && !b.utility.flash) {
        b.utility.flash = true;
        f.grenades.splice(f.grenades.indexOf('flash'), 1);
        sim.grenades.throwGrenade(f, 'flash');
        events.push({ type: 'botUtility', fighter: f, kind: 'flash' });
      } else if (dSite < 12 && f.grenades.includes('molotov') && !b.utility.molotov && b.target) {
        b.utility.molotov = true;
        f.grenades.splice(f.grenades.indexOf('molotov'), 1);
        sim.grenades.throwGrenade(f, 'molotov');
        events.push({ type: 'botUtility', fighter: f, kind: 'molotov' });
      }
    }
    // --- plant / defuse intents ---
    f.planting = false;
    f.defusing = false;
    if (f.team === 'A' && bomb.carrier === f && bomb.state === 'carried') {
      const site = sim.bomb.siteAt(f.x, f.z);
      if (site) {
        const enemyNear = sim.fighters.some((e) => e.alive && e.team !== f.team && dist2d(f.x, f.z, e.x, e.z) < 6);
        const mateNear = sim.fighters.some((e) => e.alive && e.team === f.team && e !== f && dist2d(f.x, f.z, e.x, e.z) < 15);
        if (!enemyNear || mateNear) f.planting = true;
      }
    }
    if (f.team === 'B' && bomb.state === 'planted') {
      const dBomb = dist2d(f.x, f.z, bomb.x, bomb.z);
      const enemyNear = sim.fighters.some((e) => e.alive && e.team !== f.team && dist2d(f.x, f.z, e.x, e.z) < 9);
      if (dBomb < 1.6 && !enemyNear) {
        // Only the closest defender defuses; the rest hold angles.
        const closer = sim.fighters.some((e) => e.alive && e.team === 'B' && e !== f && dist2d(e.x, e.z, bomb.x, bomb.z) < dBomb);
        if (!closer) { f.defusing = true; bomb.defuser = f; }
      }
    }
    // --- reload when safe ---
    const ammo = f.ammo[f.weapon];
    if (ammo && ammo.mag === 0 && !f.reloading) startReload(f, sim);
    else if (ammo && ammo.mag < WEAPONS[f.weapon].mag * 0.3 && !b.target && !f.reloading && sim.rng() < 0.5) startReload(f, sim);
  }

  function steer(f, dt, events) {
    const b = f.bot;
    // Vision scan at 8 Hz per bot (staggered), not every tick: the LOS test
    // is the hottest path in the sim and bots do not need it at 60 Hz.
    if (sim.time >= (b.visionAt || 0)) {
      b.visionAt = sim.time + 0.12 + (f.id % 5) * 0.012;
      const seen = nearestVisibleEnemy(f);
      if (seen) {
        if (b.target !== seen.enemy) {
          b.target = seen.enemy;
          b.seenAt = sim.time;
          // Attackers push into held angles, so they react a touch faster and
          // aim a touch truer; defenders hold the angle advantage instead.
          if (f.team === 'A') {
            b.reactAt = sim.time + 0.2 + sim.rng() * 0.3;
            b.aimErr = 0.01 + seen.dist * 0.0007 + sim.rng() * 0.012;
          } else {
            b.reactAt = sim.time + 0.3 + sim.rng() * 0.35;
            b.aimErr = 0.014 + seen.dist * 0.0009 + sim.rng() * 0.014;
          }
        }
      } else if (b.target && sim.time - b.seenAt > 0.8) {
        b.target = null;
      }
    }

    // Face the target while fighting; otherwise face the path.
    let moveX = 0; let moveZ = 0;
    let wantYaw = f.yaw;
    if (b.target && sim.time >= b.reactAt) {
      const t = b.target;
      wantYaw = Math.atan2(-(t.x - f.x), -(t.z - f.z)) + (sim.rng() - 0.5) * b.aimErr;
      f.pitch = clamp(Math.atan2((t.y + 1.1) - (f.y + 1.5), dist2d(f.x, f.z, t.x, t.z)) + (sim.rng() - 0.5) * b.aimErr, -0.5, 0.5);
      const d = dist2d(f.x, f.z, t.x, t.z);
      // Strafe while dueling; close the distance when far.
      if (d > 16) { moveX = -Math.sin(wantYaw); moveZ = -Math.cos(wantYaw); }
      else if (d < 5) { moveX = Math.sin(wantYaw); moveZ = Math.cos(wantYaw); }
      else { const s = Math.sin(sim.time * 1.7 + f.id * 2.1) > 0 ? 1 : -1; moveX = Math.cos(wantYaw) * s; moveZ = -Math.sin(wantYaw) * s; }
      // Fire in bursts.
      const ammoNow = f.ammo[f.weapon];
      if (sim.time >= b.nextShotAt && ammoNow && ammoNow.mag > 0 && !f.reloading && !f.planting && !f.defusing) {
        if (b.burstLeft <= 0) b.burstLeft = f.weapon === 'awp' || f.weapon === 'dmr' ? 1 : 3 + Math.floor(sim.rng() * 3);
        const w = WEAPONS[f.weapon];
        fireWeapon(f, f.weapon, sim, events);
        b.burstLeft -= 1;
        b.nextShotAt = sim.time + 60 / w.rpm + (b.burstLeft <= 0 ? 0.45 + sim.rng() * 0.5 : 0);
      }
    } else if (b.path.length && b.pathI < b.path.length) {
      const node = map.nodes[b.path[b.pathI]];
      const d = dist2d(f.x, f.z, node.x, node.z);
      if (d < 1.2) { b.pathI += 1; }
      else {
        wantYaw = Math.atan2(-(node.x - f.x), -(node.z - f.z));
        moveX = -Math.sin(wantYaw); moveZ = -Math.cos(wantYaw);
      }
    }
    // Planting/defusing bots stand still.
    if (f.planting || f.defusing) { moveX = 0; moveZ = 0; }
    // Smooth the turn.
    f.yaw += angleDiff(f.yaw, wantYaw) * Math.min(1, dt * 9);
    f.moveX = moveX; f.moveZ = moveZ;
    f.sprinting = !b.target && (moveX !== 0 || moveZ !== 0);
  }

  function update(dt, events) {
    for (const f of sim.fighters) {
      if (!f.isBot || !f.alive) continue;
      if (!f.bot) initBot(f);
      if (sim.time >= f.bot.thinkAt) {
        f.bot.thinkAt = sim.time + 0.3;
        think(f, dt, events);
      }
      steer(f, dt, events);
    }
  }

  return { update, initBot, setPath, nearestNode, PLANS };
}
