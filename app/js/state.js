// Shared settings + runtime state for all modules
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const easeBack = t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hexToRgb(h){ const n = parseInt((h || '#ff0000').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const DEF = {
  // camera
  camId: '', camRes: '1280x720', rotate: 0, fineRot: 0, zoom: 1, panX: 0, panY: 0, mirror: true,
  brightness: 1, contrast: 1, saturation: 1,
  // output
  outRes: 'auto', outFps: 30, outQuality: 0.85,
  // microphone
  micId: '', gain: 1, threshold: 0.55, gate: 0.12, attack: 0.6, release: 0.12, hold: 0.3,
  buildSpeed: 1, coolSpeed: 1, noiseSuppression: false, echoCancellation: true,
  // effects
  lasers: true, laserColor: '#ff2a1a', laserWidth: 1, laserImpact: 1, laserAngle: 0.5,
  scene: true, cutoutSoft: 2, invertMask: false,
  nose: true, noseMax: 2.2,
  outfit: 'loud', patch: 'VETERAN',
  drawMode: 'loud',
  shakeAmt: 1,
  // sound
  sounds: true, volume: 0.6, volShots: 1, volBooms: 1, volTank: 1, volLaser: 1,
  // obs
  obsPort: 4455
};

export const cfg = { ...DEF };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('ks2-cfg') || '{}')); } catch (e) {}
let saveT = 0;
export function save(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('ks2-cfg', JSON.stringify(cfg)); } catch (e) {} }, 250); }

// Beard / hair drawing: strokes in face-local coordinates
// (origin between the eyes, x along the eye line, unit = face width)
export const drawing = { strokes: [] };
try { drawing.strokes = JSON.parse(localStorage.getItem('ks2-drawing') || '[]'); } catch (e) {}
export function saveDrawing(){ try { localStorage.setItem('ks2-drawing', JSON.stringify(drawing.strokes)); } catch (e) {} }

export const S = {
  W: 1280, H: 720, T: 0,
  raw: 0, lvl: 0, loudT: 0, loud: false, over: 0, build: 0,
  laserAmt: 0, outfitAmt: 0, noseAmt: 0, drawAmt: 0,
  shake: 0, flash: 0, simLoud: false,
  F: null, faceSeen: -10, personFilter: 'none'
};
export const HZ = () => S.H * 0.64;
