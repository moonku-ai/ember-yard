// Keyboard + mouse + pointer lock. One job: raw input state, no game logic.
// The sim reads `keys`, `look` deltas and edge-triggered `pressed` each tick.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let locked = false;
  let wheel = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!locked) return;
    lookX += e.movementX || 0;
    lookY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    mouseDown = true;
    mouseClicked = true;
  }
  function onMouseUp(e) { if (e.button === 0) mouseDown = false; }
  function onWheel(e) { wheel += Math.sign(e.deltaY); }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel);
  document.addEventListener('pointerlockchange', onLock);

  return {
    keys,
    get locked() { return locked; },
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // Consume this frame's deltas; call once per rendered frame.
    consumeFrame() {
      const out = { lookX, lookY, clicked: mouseClicked, wheel };
      lookX = 0; lookY = 0; mouseClicked = false; wheel = 0;
      return out;
    },
    get firing() { return mouseDown; },
    // Edge-triggered keys, consumed once per sim tick batch.
    wasPressed(code) { return pressed.has(code); },
    endTick() { pressed.clear(); },
  };
}
