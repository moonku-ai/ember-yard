// EMBER YARD: a dusk freight yard, 72 x 52 m. One job: geometry, colliders,
// walkable heights, the bot nav graph, sites, spawns and zone callouts.
import * as THREE from 'three';

const PAL = {
  ground: 0x3a3230, wall: 0x4a3f3a, rust: 0xb25a2a, rustDark: 0x7e3d1e,
  teal: 0x2e6b6b, ochre: 0xc98a2e, pale: 0xcbb59a, steel: 0x2c3138,
  silo: 0x9a938a, crane: 0xd8a020, dark: 0x241f1d, lamp: 0xffc46b,
};

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(14, 14, 228, 228);
  g.fillStyle = fg; g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];   // {minX,maxX,minY,maxY,minZ,maxZ}
  const walkables = [];   // {minX,maxX,minZ,maxZ,top} — tops you can stand on
  const shootables = [];  // meshes bullets stop on
  const mats = {};
  for (const [k, v] of Object.entries(PAL)) {
    mats[k] = new THREE.MeshStandardMaterial({ color: v, roughness: 0.9, metalness: 0.08 });
  }
  mats.steel.metalness = 0.55; mats.steel.roughness = 0.5;
  mats.crane.metalness = 0.35; mats.crane.roughness = 0.55;

  function box(w, h, d, x, y, z, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) {
      const b = { minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 };
      colliders.push(b);
      shootables.push(mesh);
      if (opts.walk) walkables.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, top: b.maxY });
    }
    return mesh;
  }
  function cyl(r, h, x, y, z, mat, seg = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const b = { minX: x - r, maxX: x + r, minY: y - h / 2, maxY: y + h / 2, minZ: z - r, maxZ: z + r };
    colliders.push(b);
    shootables.push(mesh);
    return mesh;
  }
  function sign(text, x, y, z, ry, bg, fg, size = 4) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), transparent: false }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    return m;
  }

  // Ground + perimeter walls (h 6).
  box(74, 0.4, 54, 0, -0.2, 0, 'ground', { walk: true });
  box(0.6, 6, 54, -36.3, 3, 0, 'wall');
  box(0.6, 6, 54, 36.3, 3, 0, 'wall');
  box(74, 6, 0.6, 0, 3, -26.3, 'wall');
  box(74, 6, 0.6, 0, 3, 26.3, 'wall');

  // --- Site A: DEPOT (north-west container stacks) ---
  box(6.2, 2.6, 2.6, -26, 1.3, -18, 'rust');
  box(6.2, 2.6, 2.6, -26, 3.9, -18, 'teal');
  box(6.2, 2.6, 2.6, -19, 1.3, -20, 'ochre');
  box(6.2, 2.6, 2.6, -19, 3.9, -20, 'rustDark');
  box(6.2, 2.6, 2.6, -30, 1.3, -11, 'teal');
  box(2.4, 2.4, 2.4, -15, 1.2, -12, 'pale');
  box(1.2, 1.2, 1.2, -22, 0.6, -10, 'ochre');
  box(1.2, 1.2, 1.2, -28, 0.6, -21, 'rust');
  sign('A', -24, 7.5, -23.5, 0, '#1c1410', '#ffb347', 5);
  sign('A', -24, 7.5, -8.6, Math.PI, '#1c1410', '#ffb347', 5);

  // --- Site B: SILO (south-east grain silo + train cars) ---
  cyl(4, 9, 26, 4.5, 18, 'silo', 20);
  box(2, 1.2, 10, 26, 9.6, 18, 'steel'); // silo roof walk
  box(10, 3, 3, 18, 1.5, 22, 'rustDark'); // train car
  box(10, 3, 3, 18, 1.5, 10, 'teal');     // train car
  box(2.4, 2.4, 2.4, 14, 1.2, 17, 'ochre');
  box(1.2, 1.2, 1.2, 30, 0.6, 10, 'teal');
  box(1.2, 1.2, 1.2, 22, 0.6, 22, 'rust');
  sign('B', 24, 7.5, 8.6, Math.PI, '#1c1410', '#7fd4ff', 5);
  sign('B', 24, 7.5, 23.5, 0, '#1c1410', '#7fd4ff', 5);

  // --- Mid: rail cut with two boxcars, crane legs ---
  box(12, 3.2, 3.2, -4, 1.6, 2, 'steel');
  box(12, 3.2, 3.2, 8, 1.6, -3, 'rust');
  box(1.2, 1.2, 1.2, 0, 0.6, -8, 'ochre');
  box(1.2, 1.2, 1.2, 2, 0.6, 8, 'teal');
  box(2.4, 1.2, 2.4, -12, 0.6, 0, 'pale');
  box(2.4, 1.2, 2.4, 12, 0.6, -1, 'pale');

  // --- Crane bridge over mid (vertical play), y deck 4.5, stairs both ends ---
  box(3, 0.4, 26, 0, 4.5, 0, 'crane', { walk: true });
  box(0.4, 1.1, 26, -1.7, 5.2, 0, 'crane');
  box(0.4, 1.1, 26, 1.7, 5.2, 0, 'crane');
  // Stair steps (0.5 rise each, walkable): north end z -13..-22, south end z 13..22.
  for (let i = 0; i < 9; i++) {
    const top = 0.5 * (i + 1);
    box(3, 0.5, 1.1, 0, top - 0.25, -13.5 - i * 1.05, 'steel', { walk: true });
    box(3, 0.5, 1.1, 0, top - 0.25, 13.5 + i * 1.05, 'steel', { walk: true });
  }
  // Crane legs + top beam + big sign.
  box(1, 9, 1, -3, 4.5, -12, 'crane');
  box(1, 9, 1, 3, 4.5, -12, 'crane');
  box(1, 9, 1, -3, 4.5, 12, 'crane');
  box(1, 9, 1, 3, 4.5, 12, 'crane');
  box(9, 1.2, 1.2, 0, 9.4, -12, 'crane');
  box(9, 1.2, 1.2, 0, 9.4, 12, 'crane');
  sign('EMBER YARD', 0, 8.2, -11.3, 0, '#241f1d', '#ffc46b', 7);
  sign('EMBER YARD', 0, 8.2, 11.3, Math.PI, '#241f1d', '#ffc46b', 7);

  // --- Lane cover: A long (north), B long (south), yard centre ---
  box(2.4, 2.4, 2.4, -8, 1.2, -20, 'rust');
  box(1.2, 1.2, 1.2, 4, 0.6, -20, 'teal');
  box(2.4, 2.4, 2.4, 14, 1.2, -18, 'ochre');
  box(2.4, 2.4, 2.4, -14, 1.2, 20, 'teal');
  box(1.2, 1.2, 1.2, -2, 0.6, 20, 'rust');
  box(2.4, 2.4, 2.4, 8, 1.2, 18, 'rustDark');
  box(1.2, 1.2, 1.2, -30, 0.6, 4, 'ochre');
  box(1.2, 1.2, 1.2, 30, 0.6, -4, 'teal');
  box(2.4, 1.2, 2.4, -20, 0.6, 8, 'pale');
  box(2.4, 1.2, 2.4, 20, 0.6, -8, 'pale');

  // Lamp poles (light only, no collide): emissive bulbs.
  const lampMat = new THREE.MeshBasicMaterial({ color: PAL.lamp });
  for (const [lx, lz] of [[-24, -16], [24, 16], [0, 0], [-12, -20], [12, 20]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 8), mats.steel);
    pole.position.set(lx, 2.5, lz); pole.castShadow = true; group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    bulb.position.set(lx, 5.1, lz); group.add(bulb);
    const light = new THREE.PointLight(0xffc46b, 14, 18, 1.8);
    light.position.set(lx, 5, lz); group.add(light);
  }

  // Nav graph: nodes across lanes, sites, mid and the bridge.
  const N = (x, z, y = 0) => ({ x, z, y });
  const nodes = [
    N(-32, 0), N(-26, 0), N(-20, -6), N(-14, -12), N(-24, -16), N(-18, -20), // 0-5 A side
    N(-8, -20), N(2, -20), N(12, -18), N(20, -12), N(28, -6), N(32, 0),     // 6-11 north lane
    N(-10, 0), N(0, 0), N(10, 0), N(0, -8), N(0, 8),                         // 12-16 mid
    N(0, -16, 4.7), N(0, 0, 4.7), N(0, 16, 4.7), N(0, -22, 2.2), N(0, 22, 2.2), // 17-21 bridge
    N(14, 12), N(24, 16), N(18, 20), N(28, 20), N(8, 20), N(-2, 20),        // 22-27 B side
    N(-20, 8), N(-26, 12), N(20, -6), N(-6, -12),                            // 28-31 connectors
  ];
  const E = (a, b) => [a, b];
  const edges = [
    E(0, 1), E(1, 2), E(2, 3), E(3, 4), E(3, 5), E(5, 6), E(6, 7), E(7, 8),
    E(8, 9), E(9, 10), E(10, 11), E(1, 12), E(12, 13), E(13, 14), E(14, 22),
    E(12, 15), E(15, 17), E(17, 18), E(18, 19), E(19, 16), E(16, 22),
    E(22, 23), E(23, 24), E(24, 25), E(25, 26), E(26, 27), E(27, 14),
    E(2, 28), E(28, 29), E(29, 27), E(9, 30), E(30, 14), E(7, 31), E(31, 3),
    E(15, 20), E(20, 21), E(21, 16), E(19, 21), E(17, 20), E(4, 5), E(23, 25),
  ];
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }

  const sites = {
    A: { name: 'DEPOT', x: -24, z: -16, r: 7.5 },
    B: { name: 'SILO', x: 24, z: 16, r: 7.5 },
  };
  // Sight blockers: only boxes tall enough to cut an eye-level sightline.
  // Vision tests run against this short list, not the full collider list.
  const sightBlockers = colliders.filter((b) => b.maxY > 1.35);
  const spawns = {
    A: [[-33, -4], [-33, 0], [-33, 4], [-30, -6], [-30, 6]],
    B: [[33, -4], [33, 0], [33, 4], [30, -6], [30, 6]],
  };

  function zoneAt(x, z) {
    if (Math.hypot(x - sites.A.x, z - sites.A.z) < sites.A.r) return 'A — DEPOT';
    if (Math.hypot(x - sites.B.x, z - sites.B.z) < sites.B.r) return 'B — SILO';
    if (Math.abs(x) < 3 && Math.abs(z) < 24) return 'BRIDGE';
    if (Math.abs(z) < 5 && Math.abs(x) < 14) return 'MID — RAIL CUT';
    if (z < -14) return 'A LONG';
    if (z > 14) return 'B LONG';
    if (x < -26) return 'ATTACKER SPAWN';
    if (x > 26) return 'DEFENDER SPAWN';
    return 'YARD';
  }

  // Highest walkable top under (x,z) at or below `maxY` (feet height).
  function groundAt(x, z, maxY = 99) {
    let g = 0;
    for (const w of walkables) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && w.top <= maxY + 0.01 && w.top > g) g = w.top;
    }
    return g;
  }

  return { group, colliders, walkables, shootables, sightBlockers, nodes, adj, sites, spawns, zoneAt, groundAt };
}
