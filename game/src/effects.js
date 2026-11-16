// Pooled visual effects: tracers, impact puffs, shell casings, muzzle light.
// One job: everything transient on screen; nothing allocates per frame.
import * as THREE from 'three';
import { makePool } from './utils.js';

export function createEffects(scene) {
  // Tracers: thin stretched boxes, one pooled mesh each.
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  const tracers = makePool(24, () => {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m); return { mesh: m, life: 0 };
  });
  // Impact puffs: small sprites that grow and fade.
  const puffGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const puffs = makePool(48, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xd8c8b0, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m); return { mesh: m, life: 0, vx: 0, vy: 0, vz: 0 };
  });
  // Shell casings: tiny brass boxes with gravity.
  const caseGeo = new THREE.BoxGeometry(0.03, 0.03, 0.07);
  const cases = makePool(32, () => {
    const m = new THREE.Mesh(caseGeo, new THREE.MeshBasicMaterial({ color: 0xd8a020 }));
    m.visible = false; scene.add(m); return { mesh: m, life: 0, vx: 0, vy: 0, vz: 0 };
  });
  // Smoke clouds: big soft spheres, pooled per grenade.
  const smokeGeo = new THREE.SphereGeometry(1, 12, 9);
  const smokes = makePool(40, () => {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0xbfc4c8, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; scene.add(m); return { mesh: m, life: 0, maxLife: 1 };
  });
  // Fire patches for molotovs.
  const fireGeo = new THREE.CylinderGeometry(1, 1.15, 0.5, 12);
  const fires = makePool(12, () => {
    const m = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m); return { mesh: m, life: 0 };
  });
  const muzzle = new THREE.PointLight(0xffc46b, 0, 9, 2);
  scene.add(muzzle);

  function spawnTracer(from, to, color) {
    const t = tracers.next();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, Math.max(0.1, len));
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.07;
  }
  function spawnPuff(p, color, count = 4, spread = 1.6) {
    for (let i = 0; i < count; i++) {
      const pf = puffs.next();
      pf.mesh.position.copy(p);
      pf.mesh.material.color.setHex(color);
      pf.mesh.material.opacity = 0.75;
      pf.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      pf.mesh.visible = true;
      pf.life = 0.35 + Math.random() * 0.25;
      pf.vx = (Math.random() - 0.5) * spread;
      pf.vy = Math.random() * spread * 0.8;
      pf.vz = (Math.random() - 0.5) * spread;
    }
  }
  function spawnCase(p, yaw) {
    const c = cases.next();
    c.mesh.position.copy(p);
    c.mesh.visible = true;
    c.life = 1.2;
    const s = Math.sin(yaw), co = Math.cos(yaw);
    c.vx = co * 1.2 + (Math.random() - 0.5);
    c.vy = 1.6 + Math.random();
    c.vz = -s * 1.2 + (Math.random() - 0.5);
  }
  function spawnSmoke(p, life) {
    const s = smokes.next();
    s.mesh.position.set(p.x, p.y, p.z);
    s.mesh.scale.setScalar(2.2 + Math.random() * 1.2);
    s.mesh.material.opacity = 0.55;
    s.mesh.visible = true;
    s.life = life; s.maxLife = life;
    return s;
  }
  function spawnFire(x, z, life) {
    const f = fires.next();
    f.mesh.position.set(x, 0.25, z);
    f.mesh.scale.set(2.2, 1, 2.2);
    f.mesh.material.opacity = 0.85;
    f.mesh.visible = true;
    f.life = life;
    return f;
  }

  function update(dt) {
    tracers.forEach((t) => {
      if (!t.mesh.visible) return;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; return; }
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    });
    puffs.forEach((p) => {
      if (!p.mesh.visible) return;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; return; }
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.scale.multiplyScalar(1 + dt * 2.2);
      p.mesh.material.opacity = Math.max(0, p.life / 0.6) * 0.75;
    });
    cases.forEach((c) => {
      if (!c.mesh.visible) return;
      c.life -= dt;
      if (c.life <= 0 || c.mesh.position.y < 0.03) { c.mesh.visible = false; return; }
      c.vy -= 9.8 * dt;
      c.mesh.position.x += c.vx * dt; c.mesh.position.y += c.vy * dt; c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += dt * 9; c.mesh.rotation.z += dt * 7;
    });
    smokes.forEach((s) => {
      if (!s.mesh.visible) return;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.mesh.material.opacity = 0; return; }
      s.mesh.material.opacity = 0.55 * Math.min(1, s.life / 2);
      s.mesh.position.y += Math.sin(s.life * 0.8) * dt * 0.1;
    });
    fires.forEach((f) => {
      if (!f.mesh.visible) return;
      f.life -= dt;
      if (f.life <= 0) { f.mesh.visible = false; f.mesh.material.opacity = 0; return; }
      f.mesh.material.opacity = 0.5 + Math.random() * 0.35;
      f.mesh.scale.y = 0.8 + Math.random() * 0.5;
    });
    if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 220);
  }

  return {
    spawnTracer, spawnPuff, spawnCase, spawnSmoke, spawnFire,
    flash(p, intensity = 26) { muzzle.position.copy(p); muzzle.intensity = intensity; },
    update,
  };
}
