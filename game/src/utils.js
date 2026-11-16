// Shared helpers: seeded RNG, math, and tiny allocation-free pools.
// One job: pure functions every other module can rely on.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Shortest signed angle difference, in radians.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// 2D distance on the ground plane.
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Ray vs axis-aligned box (slab test). Returns the hit distance along the ray
// or Infinity when there is no hit before maxDist. dir must be normalized.
export function rayAabb(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [b.minX, b.minY, b.minZ];
  const mx = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Does the segment (ax,ay,az)->(bx,by,bz) cross any box in `boxes`?
// Boxes are plain {minX..maxZ} objects; checked with a sampled slab walk.
export function segmentBlocked(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const inv = 1 / len;
  for (const b of boxes) {
    const t = rayAabb(ax, ay, az, dx * inv, dy * inv, dz * inv, b, len);
    if (t !== Infinity && t < len) return true;
  }
  return false;
}

// Fixed-size ring pool: preallocated slots, no per-frame allocation.
export function makePool(size, make) {
  const items = [];
  for (let i = 0; i < size; i++) items.push(make(i));
  let cursor = 0;
  return {
    items,
    next() {
      const it = items[cursor];
      cursor = (cursor + 1) % size;
      return it;
    },
    forEach(fn) { for (const it of items) fn(it); },
  };
}
