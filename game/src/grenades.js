// Thrown grenades: HE, flash, smoke, molotov. One job: flight, bounce, fuse,
// and each type's area effect. Smoke spheres also block bot sight (see bots.js).
import { clamp, dist2d } from './utils.js';
import { applyDamage } from './combat.js';

export function createGrenades(sim) {
  const list = []; // {kind, x,y,z, vx,vy,vz, fuse, owner, state}
  const smokes = []; // {x,y,z, r, until}
  const fires = []; // {x,z, r, until}

  function throwGrenade(fighter, kind) {
    const dir = { x: -Math.sin(fighter.yaw) * Math.cos(fighter.pitch), y: Math.sin(fighter.pitch) + 0.35, z: -Math.cos(fighter.yaw) * Math.cos(fighter.pitch) };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    const speed = 13;
    list.push({
      kind,
      x: fighter.x, y: fighter.y + 1.45, z: fighter.z,
      vx: (dir.x / len) * speed, vy: (dir.y / len) * speed + 1.5, vz: (dir.z / len) * speed,
      fuse: kind === 'flash' ? 1.6 : kind === 'he' ? 1.8 : kind === 'smoke' ? 1.4 : 1.2,
      owner: fighter, state: 'fly',
    });
    return true;
  }

  function bounce(g, dt) {
    g.vy -= 14 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    // Ground.
    if (g.y < 0.12) { g.y = 0.12; g.vy = Math.abs(g.vy) > 1.2 ? -g.vy * 0.35 : 0; g.vx *= 0.6; g.vz *= 0.6; }
    // Walls: simple AABB push-out with velocity reflect.
    for (const b of sim.map.colliders) {
      if (g.x > b.minX && g.x < b.maxX && g.y > b.minY - 0.2 && g.y < b.maxY && g.z > b.minZ && g.z < b.maxZ) {
        const dxl = g.x - b.minX, dxr = b.maxX - g.x, dzl = g.z - b.minZ, dzr = b.maxZ - g.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) { g.x = b.minX - 0.05; g.vx = -Math.abs(g.vx) * 0.4; }
        else if (m === dxr) { g.x = b.maxX + 0.05; g.vx = Math.abs(g.vx) * 0.4; }
        else if (m === dzl) { g.z = b.minZ - 0.05; g.vz = -Math.abs(g.vz) * 0.4; }
        else { g.z = b.maxZ + 0.05; g.vz = Math.abs(g.vz) * 0.4; }
      }
    }
  }

  function detonate(g, events) {
    if (g.kind === 'he') {
      events.push({ type: 'explosion', at: { x: g.x, y: g.y, z: g.z } });
      for (const f of sim.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, f.y + 0.9 - g.y, f.z - g.z);
        if (d < 5.5) {
          const dmg = 90 * clamp(1 - d / 5.5, 0.15, 1);
          events.push({ type: 'hit', target: f, shooter: g.owner, damage: dmg, head: false, at: { x: f.x, y: f.y + 1, z: f.z } });
          applyDamage(f, dmg, g.owner, sim, events);
        }
      }
      events.push({ type: 'noise', x: g.x, z: g.z, team: g.owner.team, radius: 34, kind: 'explosion' });
    } else if (g.kind === 'flash') {
      events.push({ type: 'flashpop', at: { x: g.x, y: g.y, z: g.z }, owner: g.owner });
    } else if (g.kind === 'smoke') {
      smokes.push({ x: g.x, y: Math.max(1, g.y), z: g.z, r: 4.5, until: sim.time + 18 });
      events.push({ type: 'smoke', at: { x: g.x, y: Math.max(1, g.y), z: g.z } });
    } else if (g.kind === 'molotov') {
      fires.push({ x: g.x, z: g.z, r: 3.6, until: sim.time + 7 });
      events.push({ type: 'molotov', at: { x: g.x, y: 0.3, z: g.z } });
      events.push({ type: 'noise', x: g.x, z: g.z, team: g.owner.team, radius: 20, kind: 'fire' });
    }
  }

  function update(dt, events) {
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      g.fuse -= dt;
      bounce(g, dt);
      if (g.fuse <= 0) { detonate(g, events); list.splice(i, 1); }
    }
    // Molotov burn damage.
    for (const f of sim.fighters) {
      if (!f.alive) continue;
      for (const fire of fires) {
        if (sim.time < fire.until && dist2d(f.x, f.z, fire.x, fire.z) < fire.r) {
          f.hp -= 40 * dt;
          if (f.hp <= 0) { f.hp = 0; f.alive = false; f.deaths += 1; events.push({ type: 'death', fighter: f }); }
        }
      }
    }
    // Expire smoke/fire records.
    for (let i = smokes.length - 1; i >= 0; i--) if (sim.time > smokes[i].until) smokes.splice(i, 1);
    for (let i = fires.length - 1; i >= 0; i--) if (sim.time > fires[i].until) fires.splice(i, 1);
  }

  // Is the line of sight between two points cut by a live smoke cloud?
  function smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of smokes) {
      // Sample the segment; a cloud blocks when a sample lands inside it.
      for (let t = 0.25; t < 1; t += 0.25) {
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
        if (Math.hypot(x - s.x, y - s.y, z - s.z) < s.r) return true;
      }
    }
    return false;
  }

  return { list, smokes, fires, throwGrenade, update, smokeBlocks };
}
