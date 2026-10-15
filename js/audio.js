// Small synthesized sound effects. No audio files, nothing to download.

let ctx = null;
let master = null;
let enabled = true;
const last = {};

const SOUNDS = {
  shot: { f: 880, f2: 660, d: 0.04, type: 'square', v: 0.025, gap: 0.07 },
  pop: { f: 320, f2: 120, d: 0.08, type: 'triangle', v: 0.06, gap: 0.05 },
  buy: { f: 660, f2: 990, d: 0.07, type: 'sine', v: 0.08, gap: 0.03 },
  wave: { f: 523, f2: 784, d: 0.18, type: 'sine', v: 0.07, gap: 0.3 },
  boss: { f: 110, f2: 70, d: 0.6, type: 'sawtooth', v: 0.08, gap: 1 },
  bossDie: { f: 200, f2: 40, d: 0.5, type: 'sawtooth', v: 0.09, gap: 0.5 },
  perk: { f: 587, f2: 1175, d: 0.25, type: 'sine', v: 0.08, gap: 0.2 },
  perkReady: { f: 784, f2: 1046, d: 0.2, type: 'triangle', v: 0.06, gap: 0.5 },
  gem: { f: 1318, f2: 1760, d: 0.15, type: 'sine', v: 0.07, gap: 0.2 },
  heal: { f: 440, f2: 660, d: 0.15, type: 'sine', v: 0.05, gap: 0.2 },
  zap: { f: 1500, f2: 300, d: 0.08, type: 'sawtooth', v: 0.03, gap: 0.08 },
  boom: { f: 150, f2: 50, d: 0.18, type: 'triangle', v: 0.08, gap: 0.08 },
  uw: { f: 300, f2: 900, d: 0.3, type: 'sawtooth', v: 0.05, gap: 0.2 },
  defeat: { f: 330, f2: 82, d: 1.2, type: 'sawtooth', v: 0.1, gap: 1 },
  click: { f: 1000, f2: 900, d: 0.03, type: 'sine', v: 0.04, gap: 0.02 },
};

export function setSound(on) {
  enabled = on;
}

// Browsers only allow audio after a user gesture.
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
}

export function play(name) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const s = SOUNDS[name];
  if (!s) return;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < s.gap) return;
  last[name] = now;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = s.type;
  o.frequency.setValueAtTime(s.f, now);
  o.frequency.exponentialRampToValueAtTime(s.f2, now + s.d);
  g.gain.setValueAtTime(s.v, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + s.d);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + s.d + 0.02);
}
