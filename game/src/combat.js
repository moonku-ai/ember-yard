// Hitscan combat: one job — fire a weapon, find what the bullets hit, apply
// damage with falloff and headshots. Pure sim code, no rendering.
import { WEAPONS } from './config.js';
import { clamp, rayAabb } from './utils.js';

// Fighter body: feet at y, torso 0.3..1.35, head 1.35..1.7 (standing).
// Returns {fighter, dist, head} for the closest fighter hit, or null.
export function rayFighters(ox, oy, oz, dx, dy, dz, fighters, ignore, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const f of fighters) {
    if (!f.alive || f === ignore) continue;
    const h = f.crouch ? 1.15 : 1.7;
    // Body box.
    const body = { minX: f.x - 0.35, maxX: f.x + 0.35, minY: f.y, maxY: f.y + h - 0.35, minZ: f.z - 0.35, maxZ: f.z + 0.35 };
    const tb = rayAabb(ox, oy, oz, dx, dy, dz, body, bestDist);
    if (tb !== Infinity && tb < bestDist) { bestDist = tb; best = { fighter: f, dist: tb, head: false }; }
    // Head box.
    const head = { minX: f.x - 0.22, maxX: f.x + 0.22, minY: f.y + h - 0.35, maxY: f.y + h, minZ: f.z - 0.22, maxZ: f.z + 0.22 };
    const th = rayAabb(ox, oy, oz, dx, dy, dz, head, bestDist);
    if (th !== Infinity && th < bestDist) { bestDist = th; best = { fighter: f, dist: th, head: true }; }
  }
  return best;
}

// Nearest wall hit distance along the ray, or Infinity.
export function rayWalls(ox, oy, oz, dx, dy, dz, colliders, maxDist) {
  let best = maxDist;
  for (const b of colliders) {
    const t = rayAabb(ox, oy, oz, dx, dy, dz, b, best);
    if (t !== Infinity && t < best) best = t;
  }
  return best;
}

// Fire one trigger pull from `shooter`. `events` collects sim events the sim
// and HUD consume (shots, hits, kills, noises). Returns nothing.
export function fireWeapon(shooter, weaponId, sim, events) {
  const w = WEAPONS[weaponId];
  const ammo = shooter.ammo[weaponId];
  if (!w || !ammo || ammo.mag <= 0 || shooter.reloading > 0) return;
  ammo.mag -= 1;
  shooter.lastShotAt = sim.time;
  const spreadBase = w.spread + (shooter.moving ? w.moveSpread : 0) + (shooter.crouch ? -0.003 : 0) + shooter.bloom;
  const pellets = w.pellets || 1;
  const eyeY = shooter.y + (shooter.crouch ? 1.0 : 1.55);
  const muzzle = { x: shooter.x, y: eyeY, z: shooter.z };
  const baseYaw = shooter.yaw;
  const basePitch = shooter.pitch;
  let hitAny = false;
  for (let p = 0; p < pellets; p++) {
    const yaw = baseYaw + (sim.rng() - 0.5) * 2 * spreadBase * 3 + shooter.recoilPitch * 0.4;
    const pitch = basePitch + (sim.rng() - 0.5) * 2 * spreadBase * 3 + shooter.recoilPitch;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    const wallDist = rayWalls(muzzle.x, muzzle.y, muzzle.z, dx, dy, dz, sim.map.colliders, w.range * 2);
    const hit = rayFighters(muzzle.x, muzzle.y, muzzle.z, dx, dy, dz, sim.fighters, shooter, Math.min(wallDist, w.range * 2));
    const endDist = hit ? hit.dist : Math.min(wallDist, w.range * 2);
    const end = { x: muzzle.x + dx * endDist, y: muzzle.y + dy * endDist, z: muzzle.z + dz * endDist };
    events.push({ type: 'tracer', from: { x: muzzle.x + dx * 0.6, y: muzzle.y - 0.08, z: muzzle.z + dz * 0.6 }, to: end, color: w.tracer });
    if (hit) {
      hitAny = true;
      const falloff = clamp(1 - Math.max(0, hit.dist - w.range * 0.5) / w.range, 0.35, 1);
      let dmg = w.damage * falloff * (hit.head ? w.headMult : 1);
      if (hit.fighter.armor > 0) dmg *= hit.head && !hit.fighter.helmet ? 1 : 0.55;
      events.push({ type: 'hit', target: hit.fighter, shooter, damage: dmg, head: hit.head, at: end });
      applyDamage(hit.fighter, dmg, shooter, sim, events);
    } else if (wallDist < w.range * 2) {
      events.push({ type: 'impact', at: end });
    }
  }
  shooter.bloom = Math.min(0.05, shooter.bloom + w.recoil * 0.55);
  shooter.recoilPitch = Math.min(0.09, shooter.recoilPitch + w.recoil);
  events.push({ type: 'shot', shooter, weapon: weaponId, hit: hitAny });
  events.push({ type: 'noise', x: shooter.x, z: shooter.z, team: shooter.team, radius: weaponId === 'awp' ? 40 : 26, kind: 'shot' });
}

export function applyDamage(target, dmg, shooter, sim, events) {
  if (!target.alive) return;
  target.hp -= dmg;
  target.lastDamageAt = sim.time;
  target.lastAttacker = shooter;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    if (shooter) {
      shooter.kills += 1;
      shooter.money = Math.min(16000, shooter.money + 300);
      events.push({ type: 'kill', killer: shooter, victim: target, head: false });
    }
    events.push({ type: 'death', fighter: target });
  }
}

export function startReload(shooter, sim) {
  const w = WEAPONS[shooter.weapon];
  const ammo = shooter.ammo[shooter.weapon];
  if (!w || !ammo || shooter.reloading > 0 || ammo.mag >= w.mag || ammo.reserve <= 0) return false;
  shooter.reloading = w.reload;
  return true;
}

export function finishReload(shooter) {
  const w = WEAPONS[shooter.weapon];
  const ammo = shooter.ammo[shooter.weapon];
  const need = w.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  shooter.reloading = 0;
}
