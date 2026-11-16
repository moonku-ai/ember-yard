// Rendering: dusk sky, sun + lamps, fighter meshes, the viewmodel gun.
// One job: turn sim state into a picture each frame. No sim logic here.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { clamp, lerp } from './utils.js';

export function createRender(scene, camera) {
  // Dusk sky dome: gradient shader, sun disc low on the horizon.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x2a1840) }, mid: { value: new THREE.Color(0x7a3a52) }, low: { value: new THREE.Color(0xff7a2a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), skyMat);
  scene.add(sky);
  // Sun disc + glow.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
  sun.position.set(-120, 26, -60);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  scene.fog = new THREE.Fog(0x4a2c33, 30, 130);

  // Sun light (warm, low) + hemisphere (purple sky / brown ground).
  const sunLight = new THREE.DirectionalLight(0xffb060, 2.6);
  sunLight.position.set(-40, 34, -20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -45; sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 45; sunLight.shadow.camera.bottom = -45;
  sunLight.shadow.camera.far = 120;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x6a4a7a, 0x3a2a20, 0.9));

  // --- fighter meshes (low-poly, team trim) ---
  const bodyGeo = new THREE.BoxGeometry(0.62, 0.85, 0.34);
  const headGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.26);
  const armGeo = new THREE.BoxGeometry(0.16, 0.7, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.09, 0.14, 0.85);
  const meshes = new Map();
  function fighterMesh(f) {
    const trim = f.team === 'A' ? 0xffb347 : 0x7fd4ff;
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: f.team === 'A' ? 0x4a3a28 : 0x2a3444, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, emissive: trim, emissiveIntensity: 0.35 });
    const torso = new THREE.Mesh(bodyGeo, cloth); torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.38), trimMat); vest.position.y = 1.15; g.add(vest);
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.62; head.castShadow = true; g.add(head);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), cloth); helm.position.y = 1.78; g.add(helm);
    const legL = new THREE.Mesh(legGeo, cloth); legL.position.set(-0.16, 0.4, 0); g.add(legL);
    const legR = new THREE.Mesh(legGeo, cloth); legR.position.set(0.16, 0.4, 0); g.add(legR);
    const armL = new THREE.Mesh(armGeo, cloth); armL.position.set(-0.4, 1.05, 0.1); armL.rotation.x = -0.9; g.add(armL);
    const armR = new THREE.Mesh(armGeo, cloth); armR.position.set(0.4, 1.05, 0.1); armR.rotation.x = -0.9; g.add(armR);
    const gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.4, metalness: 0.6 }));
    gun.position.set(0.12, 1.25, -0.4); g.add(gun);
    g.userData = { legL, legR, armL, armR, gun, torso, head };
    scene.add(g);
    return g;
  }

  // --- viewmodel gun (attached to the camera) ---
  const vm = new THREE.Group();
  const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.62), new THREE.MeshStandardMaterial({ color: 0x242428, roughness: 0.35, metalness: 0.65 }));
  vm.add(vmBody);
  const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.3, metalness: 0.7 }));
  vmBarrel.rotation.x = Math.PI / 2; vmBarrel.position.set(0, 0.02, -0.42); vm.add(vmBarrel);
  const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 }));
  vmMag.position.set(0, -0.16, -0.05); vm.add(vmMag);
  const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
  vmSight.position.set(0, 0.11, -0.28); vm.add(vmSight);
  vm.position.set(0.28, -0.26, -0.5);
  camera.add(vm);
  // Muzzle flash quad at the barrel tip.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
  flashQuad.position.set(0, 0.02, -0.6);
  vm.add(flashQuad);

  // --- the bomb (small blinking box) ---
  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.5 }));
  bombMesh.add(bombBody);
  const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  bombLight.position.set(0.12, 0.14, 0); bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  let bobPhase = 0;
  let fovCur = 74;
  let adsCur = 0;

  function update(sim, dt, now) {
    const p = sim.player();
    if (!p) return; // no fighters yet (menu before the first match starts)
    // Camera at the player's eye; death-cam follows a living teammate.
    let eye = p;
    let spectating = null;
    if (!p.alive && sim.phase === 'live') {
      spectating = sim.fighters.find((f) => f.alive && f.team === 'A' && f.id !== 0);
      if (spectating) eye = spectating;
    }
    const eyeY = eye.y + (eye.crouch ? 1.0 : 1.55);
    camera.position.set(eye.x, eyeY, eye.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = eye.yaw;
    camera.rotation.x = eye.pitch;
    camera.rotation.z = 0;
    // ADS: right mouse zooms the FOV and centers the gun.
    const w = WEAPONS[p.weapon];
    const adsTarget = sim.adsHeld && w.zoom > 1 ? 1 : 0;
    adsCur = lerp(adsCur, adsTarget, Math.min(1, dt * 10));
    const targetFov = 74 / (1 + (w.zoom - 1) * adsCur * 0.75);
    fovCur = lerp(fovCur, targetFov, Math.min(1, dt * 12));
    camera.fov = fovCur;
    camera.updateProjectionMatrix();
    // Viewmodel: bob with movement, kick with recoil, center when ADS.
    if (p.moving && p.grounded) bobPhase += dt * (p.sprinting ? 11 : 8);
    const bob = p.moving ? Math.sin(bobPhase) * 0.012 : 0;
    const bobY = p.moving ? Math.abs(Math.cos(bobPhase)) * 0.01 : 0;
    vm.position.set(
      lerp(0.28, 0, adsCur),
      lerp(-0.26 + bobY, -0.2, adsCur),
      -0.5 - p.recoilPitch * 1.6,
    );
    vm.rotation.x = p.recoilPitch * 1.4 + bob * 0.4;
    vm.rotation.z = bob * 0.6;
    vm.visible = p.alive;
    // Muzzle flash follows the last shot.
    const sinceShot = now - (p.lastShotAt ?? -99);
    flashMat.opacity = sinceShot < 0.06 ? 0.95 : 0;
    // Fighter meshes.
    for (const f of sim.fighters) {
      if (f.id === 0) continue; // first person: no body mesh
      let g = meshes.get(f.id);
      if (!g) { g = fighterMesh(f); meshes.set(f.id, g); }
      g.visible = f.alive;
      if (!f.alive) continue;
      g.position.set(f.x, f.y, f.z);
      g.rotation.y = f.yaw + Math.PI; // model faces -z; rotate to face yaw
      const u = g.userData;
      const swing = f.moving ? Math.sin(now * 9 + f.id) * 0.5 : 0;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -0.9; u.armR.rotation.x = -0.9;
      u.torso.scale.y = f.crouch ? 0.8 : 1;
      u.head.position.y = f.crouch ? 1.3 : 1.62;
    }
    // Bomb mesh.
    const bomb = sim.bomb.bomb;
    if (bomb.state === 'planted') {
      bombMesh.visible = true;
      bombMesh.position.set(bomb.x, 0.12, bomb.z);
      bombLight.material.color.setHex(Math.floor(now * 3) % 2 === 0 ? 0xff2222 : 0x550000);
    } else if (bomb.state === 'dropped') {
      bombMesh.visible = true;
      bombMesh.position.set(bomb.x, 0.12, bomb.z);
      bombLight.material.color.setHex(0xffa500);
    } else {
      bombMesh.visible = false;
    }
  }

  return { update };
}
