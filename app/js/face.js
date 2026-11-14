// Effects attached to the face: veteran look, growing nose, drawn beard/hair, laser eyes
import { cfg, S, clamp, lerp, rnd, mulberry32, hexToRgb, mixRgb } from './state.js';
import { fgParts, bigBoom, sx } from './scene.js';
import { sfxSizzle } from './audio.js';

let ctx = null;
export function initFace(c){ ctx = c; }

/* ---------- face geometry ---------- */
// screen-space frame: O between the eyes, ex along the eye line (left→right on screen), ey downwards, fw = face width
export function faceGeom(F = S.F){
  const A = F.le.x < F.re.x ? F.le : F.re, B = A === F.le ? F.re : F.le;
  const ex = { x: B.x - A.x, y: B.y - A.y }; const el = Math.hypot(ex.x, ex.y) || 1; ex.x /= el; ex.y /= el;
  const ey = { x: -ex.y, y: ex.x };
  const fw = Math.max(20, Math.hypot(F.rc.x - F.lc.x, F.rc.y - F.lc.y));
  return { A: { ...A }, B: { ...B }, ex, ey, fw, ang: Math.atan2(ex.y, ex.x), O: { ...F.br }, F: JSON.parse(JSON.stringify(F)) };
}
export function toLocal(G, x, y){ const dx = x - G.O.x, dy = y - G.O.y; return [(dx * G.ex.x + dy * G.ex.y) / G.fw, (dx * G.ey.x + dy * G.ey.y) / G.fw]; }

/* ---------- veteran look ---------- */
const DIRT = [[-0.32, 0.28, 0.09, 0.35], [0.3, 0.4, 0.07, 0.3], [-0.05, -0.38, 0.1, 0.25], [0.12, 0.62, 0.08, 0.3], [-0.22, 0.55, 0.06, 0.3], [0.38, 0.1, 0.05, 0.25]];
export function drawOutfit(G, a){
  const { ex, ey, fw, ang, F } = G;
  ctx.save(); ctx.globalAlpha = a;
  ctx.save(); ctx.translate(F.br.x, F.br.y); ctx.rotate(ang); ctx.scale(fw, fw);
  for (const [x, y, r, al] of DIRT) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(55,38,20,${al})`); g.addColorStop(1, 'rgba(55,38,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(125,35,30,0.75)'; ctx.lineWidth = 0.018;
  ctx.beginPath(); ctx.moveTo(0.22, 0.04); ctx.quadraticCurveTo(0.31, 0.17, 0.27, 0.34); ctx.stroke();
  ctx.strokeStyle = 'rgba(45,22,15,0.8)'; ctx.lineWidth = 0.008;
  for (let k = 1; k < 5; k++) { const t = k / 5, x = lerp(0.22, 0.27, t) + 0.05 * Math.sin(t * Math.PI), y = lerp(0.04, 0.34, t); ctx.beginPath(); ctx.moveTo(x - 0.03, y); ctx.lineTo(x + 0.03, y + 0.005); ctx.stroke(); }
  ctx.restore();

  const d = { x: F.chin.x - F.fore.x, y: F.chin.y - F.fore.y };
  const cx = (d.x * ex.x + d.y * ex.y) / fw, cy = (d.x * ey.x + d.y * ey.y) / fw;
  // when the head opens (stage 3) the helmet gets launched off
  const k = clamp(S.sirenAmt * 2.5);
  ctx.save();
  ctx.translate(F.fore.x - ey.x * fw * 3 * k + ex.x * fw * 1.4 * k, F.fore.y - ey.y * fw * 3 * k + ex.y * fw * 1.4 * k);
  ctx.rotate(ang + k * 2.6); ctx.scale(fw, fw); ctx.globalAlpha = a * (1 - k);
  ctx.strokeStyle = '#2b2216'; ctx.lineWidth = 0.035; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.56, 0.1); ctx.quadraticCurveTo(-0.5, cy * 0.85, cx, cy + 0.03); ctx.quadraticCurveTo(0.5, cy * 0.85, 0.56, 0.1); ctx.stroke();
  ctx.fillStyle = '#353d20'; ctx.beginPath(); ctx.ellipse(0, 0.08, 0.8, 0.12, 0, 0, Math.PI * 2); ctx.fill();
  let g = ctx.createLinearGradient(-0.6, -0.6, 0.5, 0.1);
  g.addColorStop(0, '#6f7e40'); g.addColorStop(0.5, '#4a5529'); g.addColorStop(1, '#2c331a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0.07, 0.63, 0.64, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3d4624'; ctx.beginPath(); ctx.ellipse(0, 0.08, 0.8, 0.12, 0, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = '#20260f'; ctx.lineWidth = 0.012; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-0.22, -0.32, 0.2, 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.moveTo(0.15, -0.4); ctx.lineTo(0.28, -0.32); ctx.moveTo(-0.35, -0.12); ctx.lineTo(-0.22, -0.2); ctx.moveTo(0.3, -0.1); ctx.lineTo(0.38, -0.18); ctx.stroke();
  ctx.restore();

  const chest = { x: F.chin.x + ey.x * fw * 0.5 - ex.x * fw * 0.2, y: F.chin.y + ey.y * fw * 0.5 - ex.y * fw * 0.2 };
  ctx.save(); ctx.translate(chest.x, chest.y); ctx.rotate(ang); ctx.scale(fw, fw);
  [['#2b4a8a', '#e8d27a', '#2b4a8a'], ['#5a2a2a', '#d9d4c0', '#5a2a2a'], ['#2f5b36', '#c9a640', '#2f5b36']].forEach((cols, i) => {
    const x = i * 0.14;
    cols.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x + k * 0.04, 0, 0.04, 0.07); });
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.006; ctx.strokeRect(x, 0, 0.12, 0.07);
    const mg = ctx.createRadialGradient(x + 0.045, 0.14, 0, x + 0.06, 0.155, 0.05);
    mg.addColorStop(0, '#fff2b0'); mg.addColorStop(0.5, '#d4a93a'); mg.addColorStop(1, '#7a5a14');
    ctx.fillStyle = mg; ctx.beginPath();
    for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.02 : 0.045; ctx.lineTo(x + 0.06 + Math.cos(an) * r, 0.155 + Math.sin(an) * r); }
    ctx.closePath(); ctx.fill();
  });
  ctx.restore();

  const sp = { x: F.chin.x + ex.x * fw * 0.95 + ey.x * fw * 0.7, y: F.chin.y + ex.y * fw * 0.95 + ey.y * fw * 0.7 };
  ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(ang + 0.08); ctx.scale(fw, fw);
  ctx.fillStyle = '#3d4527'; ctx.strokeStyle = '#c9a640'; ctx.lineWidth = 0.014;
  ctx.beginPath(); ctx.roundRect(-0.3, -0.1, 0.6, 0.2, 0.04); ctx.fill(); ctx.stroke();
  const txt = (cfg.patch || '').toUpperCase().slice(0, 14);
  ctx.font = '0.08px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(txt).width, sc = Math.min(1, 0.5 / (tw || 1));
  ctx.save(); ctx.scale(sc, sc); ctx.fillStyle = '#ecdfa8'; ctx.fillText(txt, 0, 0.005 / sc); ctx.restore();
  ctx.restore();
  ctx.restore();
}

/* ---------- growing nose ---------- */
// copies a round patch around the nose tip from the camera image and draws it magnified with soft edges
const nc = document.createElement('canvas'), nctx = nc.getContext('2d');
export function drawNose(G, amt, rc){
  const tip = G.F.nose, R = Math.round(G.fw * 0.2), size = R * 2;
  if (size < 8) return;
  if (nc.width !== size) { nc.width = nc.height = size; }
  nctx.globalCompositeOperation = 'source-over'; nctx.clearRect(0, 0, size, size);
  nctx.save();
  if (cfg.mirror) { nctx.translate(size, 0); nctx.scale(-1, 1); nctx.drawImage(rc, S.W - tip.x - R, tip.y - R, size, size, 0, 0, size, size); }
  else nctx.drawImage(rc, tip.x - R, tip.y - R, size, size, 0, 0, size, size);
  nctx.restore();
  nctx.globalCompositeOperation = 'destination-in';
  const g = nctx.createRadialGradient(R, R, R * 0.42, R, R, R);
  g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  nctx.fillStyle = g; nctx.fillRect(0, 0, size, size);
  const sc = 1 + (cfg.noseMax - 1) * amt;
  const wob = 1 + Math.sin(S.T * 18) * 0.02 * amt;
  const dy = R * (sc - 1) * 0.35;
  ctx.save(); ctx.filter = S.personFilter;
  ctx.translate(tip.x + G.ey.x * dy, tip.y + G.ey.y * dy);
  ctx.drawImage(nc, -R * sc * wob, -R * sc / wob, size * sc * wob, size * sc / wob);
  ctx.restore();
}

/* ---------- drawn beard / hair ---------- */
const dl = document.createElement('canvas'), dctx = dl.getContext('2d');
function strokePath(c, p){
  c.beginPath();
  if (p.length <= 2) { c.moveTo(p[0], p[1]); c.lineTo(p[0] + 0.0001, p[1]); return; }
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length - 2; i += 2) c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  c.lineTo(p[p.length - 2], p[p.length - 1]);
}
function drawStroke(c, s, i){
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.globalCompositeOperation = s.tool === 'erase' ? 'destination-out' : 'source-over';
  if (s.tool === 'hair') {
    const R = mulberry32(i * 7919 + 13);
    c.strokeStyle = s.color;
    c.globalAlpha = s.alpha * 0.35; c.lineWidth = s.size * 0.7; strokePath(c, s.pts); c.stroke();
    for (let k = 0; k < 9; k++) {
      const ox = (R() - 0.5) * s.size, oy = (R() - 0.5) * s.size;
      c.globalAlpha = s.alpha * (0.5 + R() * 0.5); c.lineWidth = s.size * (0.07 + R() * 0.1);
      c.save(); c.translate(ox, oy); strokePath(c, s.pts); c.stroke(); c.restore();
    }
  } else {
    c.globalAlpha = s.tool === 'erase' ? 1 : s.alpha;
    c.strokeStyle = s.color || '#000'; c.lineWidth = s.size;
    strokePath(c, s.pts); c.stroke();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
export function renderStrokes(target, G, alpha, pop, strokes){
  const W = target.canvas.width, H = target.canvas.height;
  if (dl.width !== W || dl.height !== H) { dl.width = W; dl.height = H; }
  dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, W, H);
  const k = G.fw * pop;
  dctx.setTransform(G.ex.x * k, G.ex.y * k, G.ey.x * k, G.ey.y * k, G.O.x, G.O.y);
  strokes.forEach((s, i) => drawStroke(dctx, s, i));
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  target.save(); target.globalAlpha = alpha; target.drawImage(dl, 0, 0); target.restore();
}
export function poofAt(G){
  for (let i = 0; i < 16; i++) {
    const a = rnd(0, Math.PI * 2), r = G.fw * rnd(0.2, 0.6);
    fgParts.push({ kind: 'smoke', x: G.O.x + Math.cos(a) * r, y: G.O.y + G.fw * 0.3 + Math.sin(a) * r, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30, life: 0.8, max: 0.8, size: G.fw * 0.15, grow: G.fw * 0.3, col: '230,225,215', a: 0.6 });
    fgParts.push({ kind: 'spark', x: G.O.x, y: G.O.y + G.fw * 0.3, vx: Math.cos(a) * rnd(200, 500), vy: Math.sin(a) * rnd(200, 500), life: 0.4, max: 0.4, size: 2, col: [255, 240, 200] });
  }
}

// ready-made styles, in face-local units
function arc(n, fx){ const p = []; for (let i = 0; i <= n; i++) { const [x, y] = fx(i / n); p.push(+x.toFixed(4), +y.toFixed(4)); } return p; }
export const PRESETS = {
  vollbart: (c) => {
    const s = [];
    for (let k = 0; k < 6; k++) s.push({ tool: 'hair', color: c, size: 0.075, alpha: 0.95, pts: arc(24, t => { const a = -Math.PI / 2 + t * Math.PI; return [0.47 * Math.sin(a) * (1 - k * 0.07), 0.15 + 0.73 * Math.cos(a) * (1 - k * 0.075)]; }) });
    s.push({ tool: 'hair', color: c, size: 0.07, alpha: 0.95, pts: [-0.22, 0.5, -0.1, 0.42, 0, 0.43, 0.1, 0.42, 0.22, 0.5] });
    return s;
  },
  kinnbart: (c) => {
    const s = [];
    for (let k = 0; k < 4; k++) s.push({ tool: 'hair', color: c, size: 0.06, alpha: 0.95, pts: arc(14, t => { const a = -Math.PI / 2 + t * Math.PI; return [0.15 * Math.sin(a) * (1 - k * 0.15), 0.56 + 0.3 * Math.cos(a) * (1 - k * 0.2)]; }) });
    s.push({ tool: 'hair', color: c, size: 0.055, alpha: 0.95, pts: [-0.18, 0.5, -0.08, 0.43, 0, 0.44, 0.08, 0.43, 0.18, 0.5] });
    return s;
  },
  koteletten: (c) => [-1, 1].flatMap(side => [0, 1, 2].map(k => ({ tool: 'hair', color: c, size: 0.06, alpha: 0.95, pts: [side * (0.47 - k * 0.03), -0.12, side * (0.47 - k * 0.035), 0.08, side * (0.45 - k * 0.04), 0.3] }))),
  schnauzer: (c) => [0, 1, 2].map(k => ({ tool: 'hair', color: c, size: 0.06, alpha: 0.95, pts: [-0.3, 0.56 - k * 0.02, -0.22, 0.46, -0.1, 0.41 + k * 0.015, 0, 0.42, 0.1, 0.41 + k * 0.015, 0.22, 0.46, 0.3, 0.56 - k * 0.02] })),
  irokese: (c) => {
    const s = [];
    for (let i = 0; i < 9; i++) { const x = -0.08 + i * 0.02; s.push({ tool: 'hair', color: c, size: 0.06, alpha: 0.95, pts: [x * 0.8, -0.42, x * 1.2, -0.75, x * 1.6 + (i % 2 ? 0.03 : -0.03), -1.05] }); }
    return s;
  },
  wildehaare: (c) => {
    const s = [], R = mulberry32(42);
    for (let i = 0; i < 46; i++) {
      const a = Math.PI + (i / 45) * Math.PI, r0 = 0.48 + R() * 0.05, r1 = r0 + 0.12 + R() * 0.22;
      const cx = 0, cy = -0.18;
      s.push({ tool: 'hair', color: c, size: 0.05, alpha: 0.9, pts: [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 1.1, cx + Math.cos(a + 0.12) * (r0 + r1) / 2, cy + Math.sin(a + 0.12) * (r0 + r1) / 2 * 1.1, cx + Math.cos(a - 0.05) * r1, cy + Math.sin(a - 0.05) * r1 * 1.1] });
    }
    return s;
  }
};

/* ---------- laser eyes ---------- */
const fx = { rings: [], scorches: [], boomT: 0, sizzleT: 0, ringT: 0, scorchT: 0 };
export function laserDir(G, side){
  const F = G.F;
  const mid = { x: (G.A.x + G.B.x) / 2, y: (G.A.y + G.B.y) / 2 };
  const v = { x: F.nose.x - mid.x, y: F.nose.y - mid.y };
  const lx = (v.x * G.ex.x + v.y * G.ex.y) / G.fw;
  const ly = (v.x * G.ey.x + v.y * G.ey.y) / G.fw - 0.36;
  const px = lx * 6, py = ly * 6, m = Math.min(1, Math.hypot(px, py));
  const spread = cfg.laserAngle;
  let dx = px + side * spread * (1 - m), dy = py + 0.5 * (1 - m);
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  return { x: G.ex.x * dx + G.ey.x * dy, y: G.ex.y * dx + G.ey.y * dy };
}
function impactPoint(o, d){
  const W = S.W, H = S.H; let t = Infinity;
  const gy = H * 0.94;
  if (d.y > 0.1 && o.y < gy) t = Math.min(t, (gy - o.y) / d.y);
  if (d.x > 1e-4) t = Math.min(t, (W - o.x) / d.x); else if (d.x < -1e-4) t = Math.min(t, -o.x / d.x);
  if (d.y > 1e-4) t = Math.min(t, (H - o.y) / d.y); else if (d.y < -1e-4) t = Math.min(t, -o.y / d.y);
  if (!isFinite(t) || t < 0) t = Math.hypot(W, H);
  return { x: o.x + d.x * t, y: o.y + d.y * t, len: t };
}
function lightning(x, y, dx, dy, len, w, col){
  ctx.beginPath(); ctx.moveTo(x, y);
  const n = 6, px = -dy, py = dx;
  for (let i = 1; i <= n; i++) { const t = i / n, j = (Math.random() - 0.5) * len * 0.35 * (1 - t * 0.5); ctx.lineTo(x + dx * len * t + px * j, y + dy * len * t + py * j); }
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}

// scorch marks + shock rings stay visible a moment after the beam moved on
export function drawLaserFx(dt){
  for (let i = fx.scorches.length - 1; i >= 0; i--) { const s = fx.scorches[i]; s.life -= dt; if (s.life <= 0) fx.scorches.splice(i, 1); }
  for (let i = fx.rings.length - 1; i >= 0; i--) { const r = fx.rings[i]; r.life -= dt; if (r.life <= 0) fx.rings.splice(i, 1); }
  if (!fx.scorches.length && !fx.rings.length) return;
  for (const s of fx.scorches) {
    const f = s.life / s.max;
    let g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, `rgba(12,8,6,${0.75 * f})`); g.addColorStop(1, 'rgba(12,8,6,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const s of fx.scorches) {
    const f = Math.pow(s.life / s.max, 3), r = s.r * 0.5;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, `rgba(255,140,40,${0.8 * f})`); g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const r of fx.rings) {
    const p = 1 - r.life / r.max, rad = r.max_r * (0.15 + p);
    ctx.strokeStyle = `rgba(${r.c[0]},${r.c[1]},${r.c[2]},${0.7 * (1 - p)})`; ctx.lineWidth = Math.max(1, r.max_r * 0.06 * (1 - p));
    ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function drawLasers(G, amt, dt){
  const rgb = hexToRgb(cfg.laserColor), mid = mixRgb(rgb, [255, 255, 255], 0.45), imp = cfg.laserImpact;
  const T = S.T;
  fx.boomT -= dt; fx.sizzleT -= dt; fx.ringT -= dt; fx.scorchT -= dt;
  const doRing = fx.ringT <= 0, doScorch = fx.scorchT <= 0, doBoom = fx.boomT <= 0 && imp > 0.05, doSizzle = fx.sizzleT <= 0;
  if (doRing) fx.ringT = 0.12; if (doScorch) fx.scorchT = 0.05; if (doBoom) fx.boomT = 0.5 / Math.max(0.3, imp); if (doSizzle) fx.sizzleT = 0.09;

  for (const [o, side] of [[G.A, -1], [G.B, 1]]) {
    const d = laserDir(G, side), hit = impactPoint(o, d);
    const w = G.fw * cfg.laserWidth * (0.9 + 0.15 * Math.sin(T * 70 + side)) * (0.7 + 0.3 * amt);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [k, c, al] of [[0.6, rgb, 0.07], [0.3, rgb, 0.2], [0.14, mid, 0.6], [0.05, [255, 250, 245], 1]]) {
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${al * amt})`; ctx.lineWidth = w * k;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(hit.x, hit.y); ctx.stroke();
    }
    // energy helix around the beam
    const px = -d.y, py = d.x, n = 60, len = hit.len;
    for (const ph of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n, off = Math.sin(t * len / (G.fw * 0.35) - T * 28 + ph) * w * 0.22;
        const x = o.x + d.x * len * t + px * off, y = o.y + d.y * len * t + py * off;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(${mid[0]},${mid[1]},${mid[2]},${0.55 * amt})`; ctx.lineWidth = Math.max(1, w * 0.03); ctx.stroke();
    }
    // electric arcs crackling off the beam
    if (Math.random() < 0.5 * amt) {
      const t = rnd(0.1, 0.9), bx = o.x + d.x * len * t, by = o.y + d.y * len * t, s = Math.random() < 0.5 ? -1 : 1;
      const ad = { x: d.x * 0.5 + px * s, y: d.y * 0.5 + py * s }, al = Math.hypot(ad.x, ad.y);
      lightning(bx, by, ad.x / al, ad.y / al, G.fw * rnd(0.3, 0.8), Math.max(1, w * 0.025), `rgba(255,255,255,${0.9 * amt})`);
    }
    // eye flare
    let r = G.fw * 0.7 * amt;
    let g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
    g.addColorStop(0, `rgba(255,255,255,${amt})`); g.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.6 * amt})`); g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(o.x - r, o.y - r, r * 2, r * 2);
    ctx.fillStyle = `rgba(${mid[0]},${mid[1]},${mid[2]},${0.45 * amt})`;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, G.fw * 1.4 * amt, G.fw * 0.025, G.ang, 0, Math.PI * 2); ctx.fill();

    // impact
    if (imp > 0.01) {
      r = G.fw * 0.9 * imp * amt * (0.85 + 0.3 * Math.random());
      g = ctx.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, r);
      g.addColorStop(0, `rgba(255,255,255,${amt})`); g.addColorStop(0.2, `rgba(255,230,180,${0.9 * amt})`);
      g.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.55 * amt})`); g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hit.x, hit.y, r, 0, Math.PI * 2); ctx.fill();
      // star streaks
      ctx.strokeStyle = `rgba(255,245,230,${0.7 * amt})`; ctx.lineWidth = Math.max(1, w * 0.04);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 4 + T * 2, l = r * (1.2 + Math.random() * 0.8);
        ctx.beginPath(); ctx.moveTo(hit.x - Math.cos(a) * l, hit.y - Math.sin(a) * l); ctx.lineTo(hit.x + Math.cos(a) * l, hit.y + Math.sin(a) * l); ctx.stroke();
      }
      for (let k = 0; k < 2; k++) if (Math.random() < 0.6) {
        const a = rnd(Math.PI, Math.PI * 2);
        lightning(hit.x, hit.y, Math.cos(a), Math.sin(a), r * rnd(0.8, 1.6), Math.max(1, w * 0.03), `rgba(${mid[0]},${mid[1]},${mid[2]},${0.9 * amt})`);
      }
    }
    ctx.restore();

    // particles from the eyes
    if (fgParts.length < 700 && Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2, s = rnd(100, 380) * S.W / 1280;
      fgParts.push({ kind: 'spark', x: o.x, y: o.y, vx: Math.cos(a) * s + d.x * 200, vy: Math.sin(a) * s + d.y * 200, g: 500, life: rnd(0.2, 0.45), max: 0.45, size: Math.max(1.5, S.W / 800), col: mid });
    }
    if (imp <= 0.01) continue;
    // particles + marks at the impact
    const cnt = Math.round(6 * imp);
    for (let k = 0; k < cnt && fgParts.length < 700; k++) {
      const a = rnd(Math.PI * 1.05, Math.PI * 1.95), s = rnd(200, 700) * S.W / 1280 * imp;
      fgParts.push({ kind: 'spark', x: hit.x, y: hit.y, vx: Math.cos(a) * s - d.x * 100, vy: Math.sin(a) * s, g: 900, life: rnd(0.25, 0.6), max: 0.6, size: Math.max(1.5, S.W / 700), col: [255, 210, 150] });
    }
    if (Math.random() < 0.5 * imp && fgParts.length < 700)
      fgParts.push({ kind: 'molten', x: hit.x, y: hit.y, vx: rnd(-250, 250), vy: -rnd(200, 500), g: 1100, life: rnd(0.5, 1), max: 1, size: G.fw * rnd(0.02, 0.04) });
    if (Math.random() < 0.35 * imp && fgParts.length < 700)
      fgParts.push({ kind: 'smoke', x: hit.x + rnd(-10, 10), y: hit.y, vx: rnd(-20, 20), vy: -rnd(40, 90), life: rnd(1.2, 2), max: 2, size: G.fw * 0.12, grow: G.fw * 0.4, dark: true, a: 0.4 });
    if (doScorch && fx.scorches.length < 160) fx.scorches.push({ x: hit.x + rnd(-4, 4), y: hit.y + rnd(-3, 3), r: G.fw * rnd(0.12, 0.25) * (0.6 + 0.4 * imp), life: 5, max: 5 });
    if (doRing && fx.rings.length < 40) fx.rings.push({ x: hit.x, y: hit.y, max_r: G.fw * 1.4 * imp, life: 0.5, max: 0.5, c: mid });
    if (doSizzle) sfxSizzle(sx(hit.x));
    if (doBoom && side === (Math.random() < 0.5 ? -1 : 1)) bigBoom(hit.x, hit.y, 0.35 * imp, true);
  }
  // colored bloom over the whole picture
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.05 * amt})`; ctx.fillRect(-60, -60, S.W + 120, S.H + 120);
  ctx.restore();
}
