// The bomb: plant, beep, defuse, detonate. One job: the objective state machine.
// The sim owns the clock; this module owns the rules of the bomb itself.
import { ROUND } from './config.js';

export function createBomb(sim) {
  const bomb = {
    state: 'carried', // carried | planted | exploded | defused
    carrier: null,
    site: null,
    x: 0, z: 0,
    plantedAt: 0,
    plantProgress: 0, // 0..1 while a planter holds E
    planter: null,
    defuseProgress: 0,
    defuser: null,
    beepAt: 0,
  };

  function reset(carrier) {
    bomb.state = 'carried';
    bomb.carrier = carrier;
    bomb.site = null;
    bomb.plantProgress = 0;
    bomb.planter = null;
    bomb.defuseProgress = 0;
    bomb.defuser = null;
    bomb.beepAt = 0;
  }

  function siteAt(x, z) {
    for (const key of ['A', 'B']) {
      const s = sim.map.sites[key];
      if (Math.hypot(x - s.x, z - s.z) < s.r) return key;
    }
    return null;
  }

  // Called every tick with the current plant/defuse intents.
  function update(dt, events) {
    if (bomb.state === 'carried') {
      const carrier = bomb.carrier;
      if (!carrier || !carrier.alive) {
        // Carrier died: drop the bomb where they fell; a living teammate
        // who walks over it picks it up.
        if (carrier) { bomb.x = carrier.x; bomb.z = carrier.z; }
        bomb.state = 'dropped';
        bomb.carrier = null;
      }
      return;
    }
    if (bomb.state === 'dropped') {
      for (const f of sim.fighters) {
        if (f.alive && f.team === 'A' && Math.hypot(f.x - bomb.x, f.z - bomb.z) < 1.2) {
          bomb.carrier = f; bomb.state = 'carried';
          events.push({ type: 'bombPickup', fighter: f });
          break;
        }
      }
      return;
    }
    if (bomb.state === 'planted') {
      const left = ROUND.bombSeconds - (sim.time - bomb.plantedAt);
      // Accelerating beeps.
      const interval = left > 20 ? 1.0 : left > 10 ? 0.6 : 0.3;
      if (sim.time >= bomb.beepAt) {
        bomb.beepAt = sim.time + interval;
        events.push({ type: 'beep', at: { x: bomb.x, y: 0.5, z: bomb.z } });
      }
      if (left <= 0) {
        bomb.state = 'exploded';
        events.push({ type: 'explosion', at: { x: bomb.x, y: 0.5, z: bomb.z }, big: true });
        events.push({ type: 'bombExploded' });
      }
    }
  }

  // A fighter holding E inside a site plants; a defender holding E on the
  // planted bomb defuses. Progress pauses when they move off or let go.
  function progress(dt, events) {
    if (bomb.state === 'carried' || bomb.state === 'dropped') {
      const f = bomb.carrier;
      if (f && f.alive && f.planting) {
        const site = siteAt(f.x, f.z);
        if (site) {
          bomb.planter = f;
          bomb.plantProgress += dt / ROUND.plantSeconds;
          if (bomb.plantProgress >= 1) {
            bomb.state = 'planted';
            bomb.site = site;
            bomb.x = f.x; bomb.z = f.z;
            bomb.plantedAt = sim.time;
            bomb.plantProgress = 0;
            bomb.planter = null;
            f.money = Math.min(16000, f.money + ROUND.plantMoney);
            sim.stats.plants += 1;
            events.push({ type: 'bombPlanted', site, fighter: f });
            events.push({ type: 'noise', x: f.x, z: f.z, team: f.team, radius: 30, kind: 'plant' });
          }
          return;
        }
      }
      bomb.plantProgress = 0;
      bomb.planter = null;
      return;
    }
    if (bomb.state === 'planted') {
      const f = bomb.defuser;
      if (f && f.alive && f.defusing && Math.hypot(f.x - bomb.x, f.z - bomb.z) < 1.6) {
        const need = f.hasKit ? ROUND.defuseKitSeconds : ROUND.defuseSeconds;
        bomb.defuseProgress += dt / need;
        if (bomb.defuseProgress >= 1) {
          bomb.state = 'defused';
          bomb.defuser = null;
          sim.stats.defuses += 1;
          events.push({ type: 'bombDefused', fighter: f });
        }
        return;
      }
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 0.5);
      bomb.defuser = null;
    }
  }

  return { bomb, reset, update, progress, siteAt };
}
