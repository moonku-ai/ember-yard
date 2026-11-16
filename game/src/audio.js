// Procedural sound: every effect is synthesized with WebAudio, no audio files.
// One job: a small synth kit the sim calls; silent when audio is unavailable.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let volume = 0.8;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      return false;
    }
    return true;
  }

  function noise(dur, filterFreq, gainVal, type = 'lowpass', when = 0) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const shots = {
    p250: () => { noise(0.09, 2400, 0.5, 'bandpass'); tone(190, 0.07, 0.25, 'square', 70); },
    mp5: () => { noise(0.07, 3000, 0.4, 'bandpass'); tone(220, 0.05, 0.18, 'square', 90); },
    nova: () => { noise(0.22, 1400, 0.7, 'lowpass'); tone(120, 0.16, 0.35, 'sawtooth', 45); },
    ak47: () => { noise(0.12, 1800, 0.6, 'bandpass'); tone(150, 0.09, 0.3, 'sawtooth', 60); },
    m4a1: () => { noise(0.1, 2200, 0.55, 'bandpass'); tone(170, 0.08, 0.26, 'sawtooth', 70); },
    dmr: () => { noise(0.14, 2600, 0.55, 'bandpass'); tone(240, 0.08, 0.22, 'square', 90); },
    awp: () => { noise(0.3, 1100, 0.8, 'lowpass'); tone(100, 0.22, 0.4, 'sawtooth', 38); },
  };

  return {
    unlock() { ensure(); },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    setEnabled(v) { enabled = v; },
    shot(kind, distant = false) {
      const fn = shots[kind] || shots.ak47;
      if (distant) { noise(0.16, 700, 0.12, 'lowpass'); return; }
      fn();
    },
    dryFire() { tone(900, 0.03, 0.12, 'square'); },
    reload() { tone(500, 0.05, 0.12, 'square', 300); tone(700, 0.05, 0.12, 'square', 400, 0.35); tone(420, 0.06, 0.14, 'square', 260, 0.8); },
    hit() { tone(1200, 0.05, 0.16, 'sine', 900); },
    kill() { tone(880, 0.07, 0.18, 'sine'); tone(1320, 0.09, 0.18, 'sine', 0, 0.07); },
    hurt() { noise(0.12, 500, 0.25, 'lowpass'); tone(140, 0.12, 0.2, 'sawtooth', 70); },
    step(run) { noise(0.05, run ? 900 : 600, run ? 0.09 : 0.06, 'lowpass'); },
    bounce() { tone(300, 0.05, 0.1, 'sine', 180); },
    pin() { tone(2000, 0.03, 0.1, 'square'); },
    flashPop() { noise(0.5, 4000, 0.5, 'highpass'); tone(3000, 0.4, 0.12, 'sine', 2000); },
    explosion() { noise(0.9, 300, 0.9, 'lowpass'); tone(60, 0.8, 0.5, 'sine', 30); noise(0.4, 2000, 0.3, 'bandpass', 0.05); },
    beep(final = false) { tone(final ? 1500 : 1000, final ? 0.16 : 0.09, 0.2, 'square'); },
    plantStart() { tone(660, 0.1, 0.15, 'square'); tone(880, 0.1, 0.15, 'square', 0, 0.12); },
    roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 0.16, 'triangle', 0, i * 0.12)); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.18, 0.14, 'triangle', 0, i * 0.13)); },
    buy() { tone(990, 0.06, 0.12, 'sine'); tone(1320, 0.08, 0.12, 'sine', 0, 0.06); },
    denied() { tone(220, 0.12, 0.16, 'square', 160); },
    molotov() { noise(0.7, 900, 0.4, 'bandpass'); noise(1.2, 400, 0.3, 'lowpass', 0.1); },
    smoke() { noise(0.8, 1200, 0.15, 'bandpass'); },
  };
}
