// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|buy|play|end with &seed=N stages a deterministic
// frame for a capture, renders it, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { mulberry32, clamp } from './utils.js';
import { createMap } from './map.js';
import { createSim } from './sim.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRender } from './render.js';
import { createEffects } from './effects.js';
import { WEAPONS } from './config.js';
import { startReload } from './combat.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

const map = createMap(scene);
const sim = createSim(map, rng);
const audio = createAudio();
const effects = createEffects(scene);
const render = createRender(scene, camera);

const els = {};
for (const id of ['crosshair', 'hitmarker', 'dmgdir', 'health', 'armor', 'ammoMag', 'ammoReserve', 'ammoBox', 'weaponName', 'money', 'timer', 'scoreA', 'scoreB', 'roundLabel', 'callout', 'bombStatus', 'plantBar', 'plantWrap', 'plantLabel', 'grenades', 'buyMenu', 'scoreboard', 'scoreboardBody', 'killfeed', 'banner', 'hint', 'minimap', 'flashOverlay', 'vignette', 'startScreen', 'playBtn', 'sensSlider', 'volSlider']) {
  els[id] = document.getElementById(id);
}
const hud = createHud(sim, els);

let sens = 1;
let rightHeld = false;
let muted = false;
let frozen = false;
let haltFrame = false;
let started = false;

const input = createInput(renderer.domElement, (locked) => {
  if (!locked && started && sim.phase === 'live') {
    els.startScreen.hidden = false;
    document.getElementById('overlay-title').textContent = 'Paused — Ember Yard';
    document.getElementById('overlay-copy').textContent = 'Click to jump back into the round.';
    els.playBtn.textContent = 'Resume';
  }
});
window.addEventListener('mousedown', (e) => { if (e.button === 2) rightHeld = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 2) rightHeld = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if (e.code === 'Tab') e.preventDefault(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

els.playBtn.addEventListener('click', () => startGame());
els.sensSlider.addEventListener('input', (e) => { sens = Number(e.target.value); });
els.volSlider.addEventListener('input', (e) => { audio.setVolume(Number(e.target.value)); });

function startGame() {
  audio.unlock();
  input.lock();
  els.startScreen.hidden = true;
  if (!started) {
    started = true;
    sim.startMatch();
  }
}

// --- route one sim event to audio / effects / HUD ---
function routeEvent(e) {
  const p = sim.player();
  switch (e.type) {
    case 'shot': {
      const d = Math.hypot(e.shooter.x - p.x, e.shooter.z - p.z);
      audio.shot(e.weapon, e.shooter !== p && d > 18);
      if (e.shooter === p) effects.flash(new THREE.Vector3(p.x - Math.sin(p.yaw) * 0.8, p.y + 1.45, p.z - Math.cos(p.yaw) * 0.8));
      break;
    }
    case 'tracer': {
      effects.spawnTracer(new THREE.Vector3(e.from.x, e.from.y, e.from.z), new THREE.Vector3(e.to.x, e.to.y, e.to.z), e.color);
      break;
    }
    case 'impact': effects.spawnPuff(new THREE.Vector3(e.at.x, e.at.y, e.at.z), 0xd8c8b0, 4); break;
    case 'hit': {
      if (e.shooter === p) {
        els.hitmarker.classList.add('on');
        setTimeout(() => els.hitmarker.classList.remove('on'), 90);
        audio.hit();
      }
      if (e.target === p) {
        audio.hurt();
        // Damage direction: rotate the indicator toward the attacker.
        const ang = Math.atan2(-(e.shooter.x - p.x), -(e.shooter.z - p.z)) - p.yaw;
        els.dmgdir.style.transform = `translate(-50%,-50%) rotate(${(-ang * 180 / Math.PI).toFixed(0)}deg)`;
        els.dmgdir.classList.add('on');
        setTimeout(() => els.dmgdir.classList.remove('on'), 500);
      }
      if (e.target !== p && e.shooter !== p) effects.spawnPuff(new THREE.Vector3(e.at.x, e.at.y, e.at.z), 0xaa3322, 5);
      break;
    }
    case 'kill': if (e.killer === p) audio.kill(); break;
    case 'explosion': audio.explosion(); effects.spawnPuff(new THREE.Vector3(e.at.x, e.at.y, e.at.z), 0xff7a1a, 14, 4); break;
    case 'beep': audio.beep(); break;
    case 'flashpop': audio.flashPop(); break;
    case 'smoke': audio.smoke(); effects.spawnSmoke(new THREE.Vector3(e.at.x, e.at.y, e.at.z), 18); break;
    case 'molotov': audio.molotov(); effects.spawnFire(e.at.x, e.at.z, 7); break;
    case 'buy': if (e.fighter === p) audio.buy(); break;
    case 'roundEnd': if (e.winner === 'A') audio.roundWin(); else audio.roundLose(); break;
    default: break;
  }
}

function drainEvents() {
  const events = sim.drainEvents();
  hud.handleEvents(events);
  for (const e of events) routeEvent(e);
}

// --- test hooks (same surface the playtest drives) ---
window.__game = {
  sim,
  state: sim,
  get phase() { return sim.phase; },
  get player() { return sim.player(); },
  start() { if (!started) { started = true; sim.startMatch(); } },
  fastForward(sec) { return sim.fastForward(sec); },
  buyItem(_state, fighter, id) { return sim.buyItem(fighter, id); },
  kills() { return sim.kills(); },
  plants() { return sim.stats.plants; },
  haltFrame(v) { haltFrame = !!v; },
};

// --- screenshot staging ---
function stageShot() {
  sim.startMatch();
  started = true;
  const p = sim.player();
  if (shot === 'start') {
    p.yaw = -Math.PI / 2 - 0.25;
    p.pitch = 0.02;
    els.startScreen.hidden = true;
  } else if (shot === 'buy') {
    p.money = 9000;
    p.yaw = -Math.PI / 2 + 0.5;
    p.pitch = -0.02;
    els.startScreen.hidden = true;
  } else if (shot === 'play') {
    sim.fastForward(15); // buy phase
    sim.fastForward(22); // into the live round
    // Stage near the action: stand behind the bomb carrier (or the attacker
    // closest to a site) and look at them, so the frame shows the push
    // instead of an empty wall.
    const bomb = sim.bomb.bomb;
    let focus = bomb.carrier && bomb.carrier.alive ? bomb.carrier : null;
    if (!focus) {
      let bd = Infinity;
      for (const f of sim.fighters) {
        if (!f.alive || f.team !== 'A' || f.id === 0) continue;
        const d = Math.min(Math.hypot(f.x - map.sites.A.x, f.z - map.sites.A.z), Math.hypot(f.x - map.sites.B.x, f.z - map.sites.B.z));
        if (d < bd) { bd = d; focus = f; }
      }
    }
    if (focus) {
      const inside = (x, z) => map.colliders.some((b) => x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5 && focus.y + 1.7 > b.minY && focus.y < b.maxY);
      const spots = [[focus.x - 9, focus.z], [focus.x, focus.z - 9], [focus.x + 9, focus.z], [focus.x, focus.z + 9], [0, 0]];
      let spot = spots.find(([x, z]) => !inside(x, z)) || [0, 0];
      p.x = spot[0]; p.z = spot[1];
      p.y = map.groundAt(p.x, p.z, focus.y + 1);
      p.yaw = Math.atan2(-(focus.x - p.x), -(focus.z - p.z));
      p.pitch = 0;
    } else {
      p.x = 0; p.z = 0; p.y = 4.7; p.yaw = 0; p.pitch = -0.02;
    }
    els.startScreen.hidden = true;
  } else if (shot === 'end') {
    for (let i = 0; i < 60 && sim.phase !== 'match_end'; i++) sim.fastForward(30);
    els.startScreen.hidden = true;
    els.scoreboard.hidden = false;
  }
  frozen = true;
  drainEvents();
  hud.update(0);
  render.update(sim, 0, sim.time);
  renderer.render(scene, camera);
  render.update(sim, 0, sim.time + 0.1);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- main loop ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (haltFrame) { last = now; return; } // headless fast-forward: skip rendering
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const f = input.consumeFrame();
  const p = sim.player();
  // Look is applied here, once per rendered frame (the sim reads lookX 0).
  if (p && started && !frozen) {
    p.yaw -= f.lookX * 0.0022 * sens;
    p.pitch = clamp(p.pitch - f.lookY * 0.0022 * sens, -1.45, 1.45);
    if (f.clicked) p.triggerQueued = true;
  }
  // Edge keys.
  if (started && !frozen && p) {
    if (input.wasPressed('KeyR')) startReload(p, sim);
    if (input.wasPressed('Digit1') && p.weapons.primary) sim.switchWeapon(p, p.weapons.primary);
    if (input.wasPressed('Digit2')) sim.switchWeapon(p, 'p250');
    if (input.wasPressed('Digit4')) sim.throwGrenade(p, 'he');
    if (input.wasPressed('Digit5')) sim.throwGrenade(p, 'flash');
    if (input.wasPressed('Digit6')) sim.throwGrenade(p, 'smoke');
    if (input.wasPressed('Digit7')) sim.throwGrenade(p, 'molotov');
    if (input.wasPressed('KeyB')) hud.toggleMinimize();
    if (input.wasPressed('KeyM')) { muted = !muted; audio.setEnabled(!muted); }
  }
  if (input.wasPressed('Tab')) {
    els.scoreboard.hidden = !els.scoreboard.hidden;
    if (!els.scoreboard.hidden) hud.renderScoreboard();
  }
  const inputState = { keys: input.keys, lookX: 0, lookY: 0, firing: input.firing, sens };
  sim.adsHeld = rightHeld;
  if (!frozen && started) {
    acc += dt;
    let n = 0;
    while (acc >= FIXED_STEP && n < 8) { sim.tick(FIXED_STEP, inputState); acc -= FIXED_STEP; n++; }
    if (n === 8) acc = 0;
    drainEvents();
  }
  input.endTick();
  render.update(sim, dt, sim.time);
  effects.update(dt);
  if (started) hud.update(dt);
  renderer.render(scene, camera);
  if (!window.__shotReady && !shot) window.__shotReady = true;
}

if (shot) {
  stageShot();
} else {
  requestAnimationFrame(frame);
  window.__shotReady = false;
}
