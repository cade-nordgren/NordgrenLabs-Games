// Optional sound effects, off by default: tiny WebAudio blips, no audio files. Only after a tap (browser rule).
import { prefs } from './prefs.js';

let ctx = null;
const audio = () => {
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
function tone(freq, at, len, type = 'sine', gain = 0.08) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + len + 0.02);
}
function noise(at, len, gain = 0.05) {
  const a = audio();
  if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 2400;
  g.gain.value = gain;
  s.buffer = b;
  s.connect(f).connect(g).connect(a.destination);
  s.start(a.currentTime + at);
}
const SOUNDS = {
  play: () => noise(0, 0.06, 0.07),
  trick: () => { tone(520, 0, 0.12); tone(660, 0.08, 0.16); },
  shuffle: () => { for (let i = 0; i < 6; i++) noise(i * 0.05, 0.04, 0.04); },
  round: () => { tone(523, 0, 0.2); tone(659, 0.12, 0.2); tone(784, 0.24, 0.3); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.07)),
};
export function sound(name) {
  if (prefs.sound !== 'on' || navigator.userActivation?.hasBeenActive === false) return;
  SOUNDS[name]?.();
}
