// Battlefield background, war events, particles
import { cfg, S, clamp, lerp, rnd, easeBack, mulberry32, HZ } from './state.js';
import { sfxGunshot, sfxExplosion, sfxClank } from './audio.js';

let ctx = null, W = 1280, H = 720;
export function initScene(c){ ctx = c; }
const dims = () => { W = S.W; H = S.H; };

/* ---------- world (procedural, seeded) ---------- */
const ruins = [], trees = [], fires = [];
(function genWorld(){
  const R = mulberry32(1914);
  let x = -0.03;
  while (x < 1.03) {
    const w = R() * 0.08 + 0.04, h = R() * 0.2 + 0.06;
    const steps = 3 + Math.floor(R() * 4), pts = [];
    for (let i = 0; i <= steps; i++) pts.push([x + w * i / steps, -h * (0.55 + R() * 0.45)]);
    const wins = [];
    for (let k = 0; k < 7; k++) if (R() < 0.55) wins.push([x + w * 0.1 + R() * w * 0.75, -(0.02 + R() * h * 0.45), R() < 0.3]);
    ruins.push({ x, w, pts, wins });
    x += w + R() * 0.06;
  }
  for (let i = 0; i < 6; i++) {
    const br = []; const n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) br.push([0.3 + R() * 0.6, (R() < 0.5 ? -1 : 1) * (0.2 + R() * 0.5), 0.2 + R() * 0.3]);
    trees.push({ x: R(), h: 0.1 + R() * 0.12, br });
  }
  for (let i = 0; i < 6; i++) fires.push({ x: 0.05 + R() * 0.9, s: 0.6 + R() * 0.8, ph: R() * 10 });
})();

export const bgParts = [], fgParts = [];
const booms = [], flashes = [], tracers = [];
export const tank = { st: 'off', x: 0, fire: 3, recoil: 0, wheel: 0, moving: false, pres: 0, clank: 0, muzzle: { x: 0, y: 0 } };
const rise = (s, l) => { const t = clamp((S.build - s) / l); return t <= 0 ? 0 : easeBack(t); };
export const sx = x => clamp((x / S.W) * 2 - 1, -1, 1); // stereo pan from screen x

/* ---------- events ---------- */
function shot(x, d){
  const y = lerp(H * 0.88, HZ() + 4, d);
  flashes.push({ x, y, life: 0.07, max: 0.07, s: lerp(1.1, 0.35, d) });
  if (Math.random() < 0.35) tracers.push({ x, y, vx: (Math.random() < 0.5 ? -1 : 1) * W * rnd(1.5, 2.5), vy: -rnd(0, H * 0.4), life: 0.35 });
  sfxGunshot(sx(x), 0.55, d);
}
function mgBurst(){
  const x = rnd(0, W), d = rnd(0.2, 0.9), n = 6 + Math.floor(rnd(0, 7)), gap = rnd(60, 85);
  for (let i = 0; i < n; i++) setTimeout(() => shot(x + rnd(-6, 6), d), i * gap);
}
export function bigBoom(x, y, size, quiet = false){
  dims();
  booms.push({ x, y, t: 0, size });
  sfxExplosion(sx(x), quiet ? size * 0.6 : size);
  S.shake = Math.max(S.shake, 0.45 * size); S.flash = Math.max(S.flash, 0.22 * size);
  if (bgParts.length < 500) {
    for (let i = 0; i < 18 * size + 4; i++) bgParts.push({ kind: 'debris', x, y, vx: rnd(-1, 1) * 220 * size, vy: -rnd(150, 480) * size, g: 650, life: rnd(0.7, 1.5), max: 1.5, size: rnd(2, 5) * W / 1280 });
    for (let i = 0; i < 5; i++) bgParts.push({ kind: 'smoke', x: x + rnd(-20, 20), y: y - rnd(0, 30), vx: rnd(-15, 15) + 12, vy: -rnd(20, 50), life: rnd(3, 5), max: 5, size: W * 0.03 * size, grow: W * 0.02 });
  }
}
function tankFire(){
  tank.recoil = 1; S.shake = Math.max(S.shake, 0.8); S.flash = Math.max(S.flash, 0.3);
  flashes.push({ x: tank.muzzle.x, y: tank.muzzle.y, life: 0.12, max: 0.12, s: 3.5 });
  for (let i = 0; i < 6; i++) bgParts.push({ kind: 'smoke', x: tank.muzzle.x, y: tank.muzzle.y, vx: rnd(30, 120), vy: -rnd(5, 30), life: rnd(1.5, 3), max: 3, size: W * 0.02, grow: W * 0.03 });
  sfxGunshot(sx(tank.muzzle.x), 1.3, 0); sfxExplosion(sx(tank.muzzle.x), 1.2);
  setTimeout(() => bigBoom(rnd(W * 0.6, W * 0.97), HZ() + rnd(0, 12), rnd(0.8, 1.1)), 450);
}
function tankUpdate(dt){
  if (tank.st === 'off' && S.build > 0.78) { tank.st = 'in'; tank.x = -W * 0.36; }
  if ((tank.st === 'in' || tank.st === 'stay') && S.build < 0.4) tank.st = 'out';
  tank.moving = tank.st === 'in' || tank.st === 'out';
  if (tank.st === 'in') { tank.x += W * 0.12 * dt; if (tank.x >= W * 0.04) { tank.st = 'stay'; tank.fire = 1.2; } }
  if (tank.st === 'out') { tank.x += W * 0.16 * dt; if (tank.x > W + 20) tank.st = 'off'; }
  if (tank.st === 'stay') { tank.fire -= dt; if (tank.fire <= 0) { tank.fire = rnd(2.5, 5); tankFire(); } }
  if (tank.moving) {
    tank.wheel += dt * 7;
    tank.clank -= dt; if (tank.clank <= 0) { tank.clank = 0.11; sfxClank(sx(tank.x + W * 0.17)); }
    if (Math.random() < 6 * dt) bgParts.push({ kind: 'smoke', x: tank.x + W * 0.02, y: H * 0.78 - W * 0.34 * 0.27, vx: -rnd(10, 40), vy: -rnd(20, 50), life: 2, max: 2, size: W * 0.012, grow: W * 0.02, dark: true });
  }
  tank.recoil *= Math.exp(-dt * 5);
  tank.pres = lerp(tank.pres, tank.st === 'off' ? 0 : (tank.moving ? 1 : 0.5), 1 - Math.exp(-dt * 3));
}
export function sceneEvents(dt){
  dims();
  if (!cfg.scene) { tank.st = 'off'; tank.pres = lerp(tank.pres, 0, 0.1); return; }
  const b = S.build;
  if (b > 0.4 && Math.random() < (b - 0.4) * 10 * dt) shot(rnd(0, W), rnd(0, 1));
  if (b > 0.6 && Math.random() < 0.5 * dt) mgBurst();
  if (b > 0.55 && Math.random() < (b - 0.5) * 0.9 * dt) bigBoom(rnd(0, W), HZ() + rnd(-6, 18), rnd(0.4, 1));
  if (b > 0.5 && Math.random() < 1.5 * dt && bgParts.length < 500)
    bgParts.push({ kind: 'smoke', x: rnd(0, W), y: HZ() + rnd(-10, 30), vx: rnd(5, 25), vy: -rnd(5, 15), life: rnd(5, 8), max: 8, size: W * 0.05, grow: W * 0.01 });
  tankUpdate(dt);
}

/* ---------- particles ---------- */
export function stepParts(arr, dt){
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.life -= dt;
    if (p.life <= 0) { arr.splice(i, 1); continue; }
    if (p.g) p.vy += p.g * dt;
    if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grow) p.size += p.grow * dt;
  }
}
export function drawParts(arr){
  for (const p of arr) {
    const f = clamp(p.life / p.max);
    if (p.kind === 'smoke') {
      const c = p.dark ? '20,18,16' : (p.col || '55,48,42');
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, `rgba(${c},${(p.a || 0.5) * f})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'debris') {
      ctx.fillStyle = `rgba(22,15,10,${f})`; ctx.fillRect(p.x, p.y, p.size, p.size);
    } else if (p.kind === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const c = p.col || [255, 190, 120];
      ctx.strokeStyle = `rgba(${c[0]},${Math.round(c[1] * (0.6 + 0.4 * f))},${c[2]},${f})`; ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); ctx.restore();
    } else if (p.kind === 'molten') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${Math.round(120 + 120 * f)},${Math.round(60 * f)},${f})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * f), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (p.kind === 'ember') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${120 + 60 * Math.random() | 0},40,${f * (0.5 + 0.5 * Math.random())})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
}

/* ---------- drawing ---------- */
function drawTank(){
  const s = W * 0.34, gy = H * 0.78 + (tank.moving ? Math.sin(S.T * 22) * s * 0.003 : 0);
  const bl = (0.64 + 0.5 - tank.recoil * 0.07);
  tank.muzzle = { x: tank.x + bl * s, y: gy - 0.375 * s };
  ctx.save(); ctx.translate(tank.x, gy); ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#17160f'; ctx.beginPath(); ctx.roundRect(0.01, -0.17, 0.93, 0.17, 0.085); ctx.fill();
  ctx.strokeStyle = '#2c2a20'; ctx.lineWidth = 0.008;
  const off = (tank.wheel * 0.03) % 0.04;
  for (let x = 0.06 + off; x < 0.9; x += 0.04) { ctx.beginPath(); ctx.moveTo(x, -0.17); ctx.lineTo(x, -0.155); ctx.moveTo(x, -0.015); ctx.lineTo(x, 0); ctx.stroke(); }
  for (let i = 0; i < 7; i++) {
    const wx = 0.1 + i * 0.123;
    ctx.fillStyle = '#3b3a2c'; ctx.beginPath(); ctx.arc(wx, -0.085, 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#25241b'; ctx.beginPath(); ctx.arc(wx, -0.085, 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1b1a13'; ctx.lineWidth = 0.008;
    for (let k = 0; k < 4; k++) { const a = tank.wheel + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 0.024, -0.085 + Math.sin(a) * 0.024); ctx.lineTo(wx + Math.cos(a) * 0.05, -0.085 + Math.sin(a) * 0.05); ctx.stroke(); }
  }
  let g = ctx.createLinearGradient(0, -0.31, 0, -0.15); g.addColorStop(0, '#5c6238'); g.addColorStop(1, '#2f331d');
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(-0.02, -0.15); ctx.lineTo(0.96, -0.15); ctx.lineTo(1.02, -0.22); ctx.lineTo(0.92, -0.3); ctx.lineTo(0.07, -0.3); ctx.lineTo(-0.03, -0.23); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1d2012'; ctx.lineWidth = 0.006; ctx.stroke();
  ctx.fillStyle = '#262a17'; ctx.fillRect(-0.02, -0.17, 0.98, 0.025);
  ctx.fillStyle = '#3a3f24'; ctx.fillRect(0.6, -0.392, bl - 0.6, 0.034);
  ctx.fillStyle = '#2a2e19'; ctx.fillRect(bl - 0.05, -0.4, 0.05, 0.05);
  g = ctx.createLinearGradient(0, -0.45, 0, -0.3); g.addColorStop(0, '#6a7142'); g.addColorStop(1, '#3d4226');
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(0.26, -0.3); ctx.lineTo(0.68, -0.3); ctx.lineTo(0.64, -0.42); ctx.lineTo(0.34, -0.445); ctx.lineTo(0.28, -0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#353a20'; ctx.beginPath(); ctx.ellipse(0.42, -0.45, 0.06, 0.018, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(230,225,200,.8)'; ctx.font = '700 0.05px Impact, sans-serif'; ctx.fillText('07', 0.4, -0.335);
  ctx.restore();
}

export function drawScene(a, dt){
  dims();
  const hz = HZ(), T = S.T;
  ctx.save(); ctx.globalAlpha = a;
  let g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#140d0b'); g.addColorStop(0.55, '#3b1d14'); g.addColorStop(1, '#b4532a');
  ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, hz + 60);
  const fl = 0.8 + 0.2 * Math.sin(T * 7) * Math.sin(T * 3.3);
  g = ctx.createRadialGradient(W * 0.65, hz, 0, W * 0.65, hz, Math.max(W, H) * 0.7);
  g.addColorStop(0, `rgba(255,130,50,${0.45 * fl})`); g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, hz + 60);

  const rs = rise(0.3, 0.15);
  if (rs > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [i, bx] of [[0, 0.18], [1, 0.82]]) {
      const ang = -Math.PI / 2 + Math.sin(T * 0.5 + i * 2.7) * 0.6, len = H * 1.1, sp = 0.05;
      const x0 = bx * W, y0 = hz;
      g = ctx.createLinearGradient(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      g.addColorStop(0, `rgba(255,240,200,${0.22 * Math.min(1, rs)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang - sp) * len, y0 + Math.sin(ang - sp) * len);
      ctx.lineTo(x0 + Math.cos(ang + sp) * len, y0 + Math.sin(ang + sp) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const rr = rise(0.12, 0.25);
  if (rr > 0) {
    const off = (1 - rr) * H * 0.45;
    ctx.save(); ctx.translate(0, off);
    for (const b of ruins) {
      ctx.fillStyle = '#120c0a'; ctx.beginPath(); ctx.moveTo(b.x * W, hz + 2);
      for (const [px, py] of b.pts) ctx.lineTo(px * W, hz + py * H);
      ctx.lineTo((b.x + b.w) * W, hz + 2); ctx.closePath(); ctx.fill();
      for (const [wx, wy, lit] of b.wins) {
        ctx.fillStyle = lit ? `rgba(255,${130 + 40 * Math.sin(T * 9 + wx * 50) | 0},40,${0.7 + 0.3 * Math.sin(T * 13 + wx * 90)})` : 'rgba(150,65,30,0.55)';
        ctx.fillRect(wx * W, hz + wy * H, W * 0.008, H * 0.018);
      }
    }
    ctx.strokeStyle = '#0f0a08'; ctx.lineCap = 'round';
    for (const tr of trees) {
      const x = tr.x * W, h = tr.h * H;
      ctx.lineWidth = W * 0.004; ctx.beginPath(); ctx.moveTo(x, hz); ctx.lineTo(x, hz - h); ctx.stroke();
      ctx.lineWidth = W * 0.002;
      for (const [at, dir, len] of tr.br) { const y = hz - h * at; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * h * len, y - h * len * 0.6); ctx.stroke(); }
    }
    ctx.restore();
  }

  g = ctx.createLinearGradient(0, hz, 0, H);
  g.addColorStop(0, '#33241a'); g.addColorStop(1, '#120c08');
  ctx.fillStyle = g; ctx.fillRect(-60, hz, W + 120, H - hz + 60);

  const rf = rise(0.35, 0.15);
  if (rf > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of fires) {
      const x = f.x * W, s = f.s * W * 0.025 * Math.min(1, rf);
      g = ctx.createRadialGradient(x, hz, 0, x, hz, s * 4);
      g.addColorStop(0, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g; ctx.fillRect(x - s * 4, hz - s * 4, s * 8, s * 8);
      for (let k = 0; k < 3; k++) {
        const fh = s * (1.6 + 0.6 * Math.sin(T * (9 + k * 3) + f.ph + k));
        ctx.fillStyle = k === 2 ? 'rgba(255,230,150,0.7)' : 'rgba(255,110,30,0.55)';
        const w = s * (1 - k * 0.25);
        ctx.beginPath(); ctx.moveTo(x - w, hz + 2); ctx.quadraticCurveTo(x - w * 0.3, hz - fh * 0.5, x + Math.sin(T * 5 + k) * w * 0.3, hz - fh); ctx.quadraticCurveTo(x + w * 0.3, hz - fh * 0.5, x + w, hz + 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i]; b.t += dt;
    if (b.t > 0.6) { booms.splice(i, 1); continue; }
    const p = b.t / 0.6, r = b.size * W * 0.09 * (0.4 + p * 1.6);
    g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0, `rgba(255,250,220,${1 - p})`); g.addColorStop(0.3, `rgba(255,150,40,${0.85 * (1 - p)})`); g.addColorStop(1, 'rgba(200,60,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt; if (t.life <= 0) { tracers.splice(i, 1); continue; }
    t.x += t.vx * dt; t.y += t.vy * dt;
    ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = Math.max(1.5, W / 700);
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - t.vx * 0.02, t.y - t.vy * 0.02); ctx.stroke();
  }
  ctx.restore();

  if (tank.st !== 'off') drawTank();
  stepParts(bgParts, dt); drawParts(bgParts);

  const rw = rise(0.4, 0.2);
  if (rw > 0) {
    const y0 = H * 0.82 + (1 - rw) * H * 0.4;
    ctx.strokeStyle = '#1a1512'; ctx.lineWidth = Math.max(1.5, W / 640);
    for (let x = W * 0.04; x < W; x += W / 6) {
      ctx.beginPath(); ctx.moveTo(x - W * 0.012, y0 - H * 0.09); ctx.lineTo(x + W * 0.012, y0);
      ctx.moveTo(x + W * 0.012, y0 - H * 0.09); ctx.lineTo(x - W * 0.012, y0); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, W / 1100);
    for (let x = -W / 60; x < W + W / 60; x += W / 55) { ctx.beginPath(); ctx.ellipse(x, y0 - H * 0.045, W / 60, H * 0.036, 0.35, 0, Math.PI * 2); ctx.stroke(); }
  }
  const rsb = rise(0.5, 0.2);
  if (rsb > 0) {
    const base = H * 1.01 + (1 - rsb) * H * 0.3, bw = W / 11, bh = Math.min(H * 0.07, W * 0.05);
    for (let row = 0; row < 2; row++) {
      const y = base - bh * (row + 1) * 0.92, o = row ? bw / 2 : 0;
      for (let x = -bw + o; x < W + bw; x += bw * 0.96) {
        g = ctx.createLinearGradient(0, y, 0, y + bh); g.addColorStop(0, '#80694a'); g.addColorStop(1, '#43341f');
        ctx.fillStyle = g; ctx.strokeStyle = '#2a2014'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, bh * 0.45); ctx.fill(); ctx.stroke();
      }
    }
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.life -= dt; if (f.life <= 0) { flashes.splice(i, 1); continue; }
    const r = f.s * W * 0.018 * (0.6 + Math.random() * 0.6), al = f.life / f.max;
    ctx.fillStyle = `rgba(255,220,130,${al})`; ctx.beginPath();
    for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6 + Math.random() * 0.3, r2 = k % 2 ? r * 0.35 : r; ctx.lineTo(f.x + Math.cos(an) * r2, f.y + Math.sin(an) * r2); }
    ctx.closePath(); ctx.fill();
    g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.5); g.addColorStop(0, `rgba(255,170,60,${0.5 * al})`); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.fillRect(f.x - r * 2.5, f.y - r * 2.5, r * 5, r * 5);
  }
  ctx.restore();
  ctx.restore();
}
export function clearSceneFx(dt){ stepParts(bgParts, dt); booms.length = 0; flashes.length = 0; tracers.length = 0; }

export function drawFG(dt, laserRgb){
  dims();
  if (S.build > 0.4 && fgParts.length < 500 && Math.random() < S.build * 12 * dt)
    fgParts.push({ kind: 'ember', x: rnd(0, W), y: H + 10, vx: rnd(-20, 30), vy: -rnd(40, 120), life: rnd(3, 6), max: 6, size: rnd(1, 3) * W / 1280 });
  stepParts(fgParts, dt); drawParts(fgParts);
  const vr = 0.35 * S.build + 0.35 * S.laserAmt;
  if (vr > 0.01) {
    const c = laserRgb || [200, 0, 0];
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(${Math.round(lerp(60, c[0] * 0.8, S.laserAmt))},${Math.round(c[1] * 0.3 * S.laserAmt)},${Math.round(c[2] * 0.3 * S.laserAmt)},${vr})`);
    ctx.fillStyle = v; ctx.fillRect(-60, -60, W + 120, H + 120);
  }
  if (S.flash > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,235,210,${S.flash})`; ctx.fillRect(-60, -60, W + 120, H + 120); ctx.restore(); }
}
