// Synthesized sound effects + microphone level
import { cfg, S, clamp, rnd } from './state.js';

let actx = null, master = null, analyser = null, timeBuf = null, noiseBuf = null, micSrc = null;
let laserGain, engGain, ambGain, sirenA, sirenP;

function noiseLoop(){ const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; }

export function initAudio(){
  if (actx) return;
  actx = new AudioContext();
  master = actx.createGain(); master.gain.value = cfg.volume;
  const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp).connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 3, actx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // laser hum
  laserGain = actx.createGain(); laserGain.gain.value = 0; laserGain.connect(master);
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 5; lp.connect(laserGain);
  const o1 = actx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 95;
  const o2 = actx.createOscillator(); o2.type = 'square'; o2.frequency.value = 190.5;
  const lfo = actx.createOscillator(); lfo.frequency.value = 11; const lfoG = actx.createGain(); lfoG.gain.value = 25;
  lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);
  const og2 = actx.createGain(); og2.gain.value = 0.5; o2.connect(og2).connect(lp); o1.connect(lp);
  const wh = actx.createOscillator(); wh.frequency.value = 1600; const whL = actx.createOscillator(); whL.frequency.value = 30;
  const whLG = actx.createGain(); whLG.gain.value = 200; whL.connect(whLG).connect(wh.frequency);
  const whG = actx.createGain(); whG.gain.value = 0.06; wh.connect(whG).connect(laserGain);
  const ln = noiseLoop(); const lnF = actx.createBiquadFilter(); lnF.type = 'bandpass'; lnF.frequency.value = 3500; lnF.Q.value = 1.5;
  const lnG = actx.createGain(); lnG.gain.value = 0.25; ln.connect(lnF).connect(lnG).connect(laserGain);
  [o1, o2, lfo, wh, whL].forEach(o => o.start());

  // tank engine
  engGain = actx.createGain(); engGain.gain.value = 0; engGain.connect(master);
  const eLp = actx.createBiquadFilter(); eLp.type = 'lowpass'; eLp.frequency.value = 230; eLp.connect(engGain);
  const eo = actx.createOscillator(); eo.type = 'sawtooth'; eo.frequency.value = 42;
  const elfo = actx.createOscillator(); elfo.frequency.value = 6; const elg = actx.createGain(); elg.gain.value = 6;
  elfo.connect(elg).connect(eo.frequency); eo.connect(eLp); eo.start(); elfo.start();
  const en = noiseLoop(); const enLp = actx.createBiquadFilter(); enLp.type = 'lowpass'; enLp.frequency.value = 150;
  const enG = actx.createGain(); enG.gain.value = 0.7; en.connect(enLp).connect(enG).connect(engGain);

  // battlefield rumble
  ambGain = actx.createGain(); ambGain.gain.value = 0; ambGain.connect(master);
  const an = noiseLoop(); const anLp = actx.createBiquadFilter(); anLp.type = 'lowpass'; anLp.frequency.value = 90;
  an.connect(anLp).connect(ambGain);

  // air-raid siren: slow rising and falling wail
  sirenA = actx.createGain(); sirenA.gain.value = 0; sirenA.connect(master);
  const saF = actx.createBiquadFilter(); saF.type = 'lowpass'; saF.frequency.value = 1800; saF.connect(sirenA);
  const sa = actx.createOscillator(); sa.type = 'sawtooth'; sa.frequency.value = 560;
  const sa2 = actx.createOscillator(); sa2.type = 'square'; sa2.frequency.value = 561.5;
  const saL = actx.createOscillator(); saL.frequency.value = 1 / 6; const saLG = actx.createGain(); saLG.gain.value = 260;
  saL.connect(saLG); saLG.connect(sa.frequency); saLG.connect(sa2.frequency);
  const sa2g = actx.createGain(); sa2g.gain.value = 0.3; sa.connect(saF); sa2.connect(sa2g).connect(saF);
  // police siren: two alternating tones
  sirenP = actx.createGain(); sirenP.gain.value = 0; sirenP.connect(master);
  const spF = actx.createBiquadFilter(); spF.type = 'lowpass'; spF.frequency.value = 2600; spF.connect(sirenP);
  const sp = actx.createOscillator(); sp.type = 'sawtooth'; sp.frequency.value = 512;
  const spL = actx.createOscillator(); spL.type = 'square'; spL.frequency.value = 0.75; const spLG = actx.createGain(); spLG.gain.value = 72;
  spL.connect(spLG).connect(sp.frequency); sp.connect(spF);
  [sa, sa2, saL, sp, spL].forEach(o => o.start());

  analyser = actx.createAnalyser(); analyser.fftSize = 1024;
  timeBuf = new Float32Array(analyser.fftSize);
}

export function connectMic(stream){
  if (micSrc) micSrc.disconnect();
  micSrc = stream ? actx.createMediaStreamSource(stream) : null;
  if (micSrc) micSrc.connect(analyser);
}
export const hasMic = () => !!micSrc;
export function resumeAudio(){ if (actx && actx.state === 'suspended') actx.resume(); }
export function setVolume(){ if (master) master.gain.setTargetAtTime(cfg.volume, actx.currentTime, 0.05); }

// raw mic level 0..1 (dB mapped), before smoothing
export function readRaw(){
  if (!micSrc) return 0;
  analyser.getFloatTimeDomainData(timeBuf);
  let s = 0; for (let i = 0; i < timeBuf.length; i++) s += timeBuf[i] * timeBuf[i];
  const rms = Math.sqrt(s / timeBuf.length) * cfg.gain;
  return clamp((20 * Math.log10(rms + 1e-7) + 55) / 50);
}

export function updateLoops(tankPres, sirenLvl = 0){
  if (!actx) return;
  const now = actx.currentTime, on = cfg.sounds ? 1 : 0;
  const sv = on * sirenLvl * 0.15 * cfg.volSiren;
  sirenA.gain.setTargetAtTime(cfg.sirenStyle === 'police' ? 0 : sv, now, 0.1);
  sirenP.gain.setTargetAtTime(cfg.sirenStyle === 'police' ? sv : 0, now, 0.1);
  laserGain.gain.setTargetAtTime(on * S.laserAmt * 0.16 * cfg.volLaser, now, 0.05);
  engGain.gain.setTargetAtTime(on * tankPres * 0.4 * cfg.volTank, now, 0.15);
  ambGain.gain.setTargetAtTime(on * clamp(S.build - 0.3) * 0.5 * cfg.volBooms, now, 0.3);
}

const on = () => actx && cfg.sounds;
function panner(pan){ const p = actx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(master); return p; }

export function sfxGunshot(pan = 0, vol = 0.6, dist = 0){
  if (!on() || cfg.volShots <= 0) return;
  const t = actx.currentTime, p = panner(pan), v = vol * (1 - dist * 0.7) * cfg.volShots;
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = rnd(0.8, 1.2);
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(6500 - dist * 5000, t); f.frequency.exponentialRampToValueAtTime(250, t + 0.25);
  const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16 + dist * 0.35);
  n.connect(f).connect(g).connect(p); n.start(t, rnd(0, 2), 0.7);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  const og = actx.createGain(); og.gain.setValueAtTime(v * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  o.connect(og).connect(p); o.start(t); o.stop(t + 0.15);
}
export function sfxExplosion(pan = 0, size = 1){
  if (!on() || cfg.volBooms <= 0) return;
  const t = actx.currentTime, p = panner(pan), v = size * cfg.volBooms;
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 0.55;
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(1300 * size + 300, t); f.frequency.exponentialRampToValueAtTime(70, t + 1.3);
  const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4 + size);
  n.connect(f).connect(g).connect(p); n.start(t, rnd(0, 0.5), 2.6);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.6);
  const og = actx.createGain(); og.gain.setValueAtTime(v * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  o.connect(og).connect(p); o.start(t); o.stop(t + 1);
}
export function sfxClank(pan){
  if (!on() || cfg.volTank <= 0) return;
  const t = actx.currentTime;
  const n = actx.createBufferSource(); n.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(1800, 2600); f.Q.value = 9;
  const g = actx.createGain(); g.gain.setValueAtTime(0.18 * cfg.volTank, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f).connect(g).connect(panner(pan)); n.start(t, rnd(0, 2), 0.08);
}
// sizzle where the laser burns into something
export function sfxSizzle(pan){
  if (!on() || cfg.volLaser <= 0) return;
  const t = actx.currentTime;
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = rnd(1.2, 1.8);
  const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
  const g = actx.createGain(); g.gain.setValueAtTime(0.12 * cfg.volLaser, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  n.connect(f).connect(g).connect(panner(pan)); n.start(t, rnd(0, 2), 0.15);
}
// head opens: servo whine, pneumatic hiss, clank
export function sfxHeadOpen(){
  if (!on()) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.7);
  const of = actx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 1400;
  const og = actx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.14, t + 0.08); og.gain.setValueAtTime(0.14, t + 0.6); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(of).connect(og).connect(master); o.start(t); o.stop(t + 0.85);
  const n = actx.createBufferSource(); n.buffer = noiseBuf;
  const nf = actx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500;
  const ng = actx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.3, t + 0.12); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  n.connect(nf).connect(ng).connect(master); n.start(t, rnd(0, 1), 1.2);
  const c = actx.createBufferSource(); c.buffer = noiseBuf;
  const cf = actx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 900; cf.Q.value = 6;
  const cg = actx.createGain(); cg.gain.setValueAtTime(0.0001, t + 0.74); cg.gain.exponentialRampToValueAtTime(0.5, t + 0.75); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  c.connect(cf).connect(cg).connect(master); c.start(t + 0.74, rnd(0, 1), 0.2);
}
// "poof" when the drawn beard appears
export function sfxPoof(){
  if (!on()) return;
  const t = actx.currentTime;
  const n = actx.createBufferSource(); n.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25); f.Q.value = 2;
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  n.connect(f).connect(g).connect(master); n.start(t, rnd(0, 2), 0.4);
}
