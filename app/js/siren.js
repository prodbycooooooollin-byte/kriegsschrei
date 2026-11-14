// Stage 3: the top of the head flips open like a lid and a siren extends out of it
import { cfg, S, clamp, easeBack, rnd } from './state.js';
import { fgParts } from './scene.js';

let ctx = null;
export function initSiren(c){ ctx = c; }

// face-local geometry (origin between the eyes, unit = face width, y down)
const CUT = -0.3, RX = 0.58, RY = 0.85, HOLE = 0.13;
const lid = document.createElement('canvas'), lctx = lid.getContext('2d');
let lidReady = false;

export const openAmt = () => clamp(S.sirenAmt * 2.2);          // lid opens first …
const riseAmt = () => clamp((S.sirenAmt - 0.3) / 0.6);           // … then the siren comes out
const cutCenter = G => ({ x: G.O.x + G.ey.x * CUT * G.fw, y: G.O.y + G.ey.y * CUT * G.fw });
const at = (G, u, v) => ({ x: G.O.x + (G.ex.x * u + G.ey.x * v) * G.fw, y: G.O.y + (G.ex.y * u + G.ey.y * v) * G.fw });

function domePath(c, G, grow = 1.04){
  const C = cutCenter(G);
  c.save(); c.translate(C.x, C.y); c.rotate(G.ang);
  c.beginPath(); c.ellipse(0, 0, RX * G.fw * grow, RY * G.fw * grow, 0, Math.PI, Math.PI * 2); c.closePath();
  c.restore();
}

// copy the skull cap (from the cut-out person or the raw camera) into the lid canvas
export function captureLid(G, src){
  const fw = G.fw, Lw = Math.ceil(fw * RX * 2 + 8), Lh = Math.ceil(fw * RY + 4);
  if (lid.width !== Lw || lid.height !== Lh) { lid.width = Lw; lid.height = Lh; }
  const C = cutCenter(G);
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, Lw, Lh);
  lctx.translate(Lw / 2, Lh); lctx.rotate(-G.ang); lctx.translate(-C.x, -C.y);
  if (cfg.mirror) { lctx.translate(S.W, 0); lctx.scale(-1, 1); }
  lctx.drawImage(src, 0, 0);
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'destination-in';
  lctx.beginPath(); lctx.ellipse(Lw / 2, Lh, RX * fw, RY * fw, 0, Math.PI, Math.PI * 2); lctx.closePath(); lctx.fill();
  lctx.globalCompositeOperation = 'source-over';
  lidReady = true;
}
// remove the skull cap from the person layer (rc space) so the background shows where it was
export function eraseDome(pc2, G){
  pc2.save();
  if (cfg.mirror) { pc2.translate(S.W, 0); pc2.scale(-1, 1); }
  pc2.globalCompositeOperation = 'destination-out';
  domePath(pc2, G); pc2.fill();
  pc2.restore();
}
// without a cut-out there is no clean background, so the head just looks hollow
export function drawCavity(G){
  if (openAmt() < 0.02) return;
  ctx.fillStyle = '#0b0605'; domePath(ctx, G, 1.0); ctx.fill();
}

export function sirenBurst(G){
  const C = cutCenter(G);
  for (let i = 0; i < 22; i++) {
    const u = rnd(-RX, RX), p = at(G, u, CUT);
    fgParts.push({ kind: 'smoke', x: p.x, y: p.y, vx: rnd(-60, 60), vy: -rnd(80, 200), life: rnd(0.8, 1.5), max: 1.5, size: G.fw * 0.12, grow: G.fw * 0.5, col: '235,235,235', a: 0.55 });
    fgParts.push({ kind: 'spark', x: C.x, y: C.y, vx: rnd(-500, 500), vy: -rnd(200, 600), g: 900, life: rnd(0.3, 0.6), max: 0.6, size: 2, col: [255, 230, 170] });
  }
}

const COLORS = { alarm: [255, 40, 20], police: [40, 120, 255] };

export function drawHeadOpen(G){
  const o = openAmt(), r = riseAmt(), fw = G.fw, C = cutCenter(G), T = S.T;
  const col = COLORS[cfg.sirenStyle] || COLORS.alarm;
  const L = 0.12 + 0.62 * (r > 0 ? easeBack(r) : 0); // how far the siren sticks out
  const phi = T * 7;

  ctx.save(); ctx.translate(C.x, C.y); ctx.rotate(G.ang); ctx.scale(fw, fw);
  // opening (seen slightly from the front)
  let g = ctx.createRadialGradient(0, 0.03, 0, 0, 0, RX);
  g.addColorStop(0, '#040202'); g.addColorStop(1, '#2a100c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, RX * o, HOLE * o, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3d4248'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.ellipse(0, 0, RX * o, HOLE * o, 0, Math.PI, Math.PI * 2); ctx.stroke();

  if (r > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-4, -8, 8, 8); ctx.ellipse(0, 0, RX, HOLE, 0, 0, Math.PI * 2); ctx.clip();
    // telescopic piston
    const pg = ctx.createLinearGradient(-0.07, 0, 0.07, 0);
    pg.addColorStop(0, '#4a4f56'); pg.addColorStop(0.45, '#d5dae0'); pg.addColorStop(1, '#3a3e44');
    ctx.fillStyle = pg; ctx.fillRect(-0.07, -L + 0.02, 0.14, L + 0.1);
    ctx.fillRect(-0.05, -L - 0.02, 0.1, 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.008;
    for (let y = -L + 0.1; y < 0.08; y += 0.09) { ctx.beginPath(); ctx.moveTo(-0.07, y); ctx.lineTo(0.07, y); ctx.stroke(); }
    // base plate
    const bg = ctx.createLinearGradient(0, -L - 0.12, 0, -L);
    bg.addColorStop(0, '#5a5f66'); bg.addColorStop(1, '#22252a');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-0.21, -L - 0.11, 0.42, 0.1, 0.02); ctx.fill();
    // light dome
    const dy = -L - 0.11;
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, dy, 0.17, 0.22, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.fillStyle = `rgb(${col[0] * 0.55 | 0},${col[1] * 0.55 | 0},${col[2] * 0.55 | 0})`; ctx.fillRect(-0.2, dy - 0.25, 0.4, 0.26);
    const band = Math.sin(phi) * 0.17;  // rotating reflector seen through the glass
    g = ctx.createLinearGradient(band - 0.1, 0, band + 0.1, 0);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`); g.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(-0.2, dy - 0.25, 0.4, 0.26);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-0.06, dy - 0.13, 0.04, 0.07, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.ellipse(0, dy, 0.17, 0.22, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // front rim of the opening
  ctx.strokeStyle = '#9aa1a9'; ctx.lineWidth = 0.028; ctx.beginPath(); ctx.ellipse(0, 0, RX * o, HOLE * o, 0, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#c3c8ce';
  for (let k = 1; k < 8; k++) { const a = k * Math.PI / 8; ctx.beginPath(); ctx.arc(Math.cos(a) * RX * o, Math.sin(a) * HOLE * o, 0.012, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // the lid, swinging open on a hinge at the screen-right edge of the cut
  if (lidReady) {
    const h = at(G, RX, CUT);
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(G.ang + o * 1.95);
    ctx.filter = S.personFilter; ctx.drawImage(lid, -(lid.width / 2 + RX * fw), -lid.height); ctx.filter = 'none';
    ctx.scale(fw, fw);
    ctx.strokeStyle = '#9aa1a9'; ctx.lineWidth = 0.028; ctx.beginPath(); ctx.moveTo(-RX * 2, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = '#6b7078'; ctx.beginPath(); ctx.arc(0, 0, 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c3c8ce'; ctx.beginPath(); ctx.arc(0, 0, 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // rotating light beams
  if (r > 0.3) {
    const k = clamp((r - 0.3) / 0.4), dc = at(G, 0, CUT - L - 0.2);
    const right = Math.max(0, Math.sin(phi)), left = Math.max(0, -Math.sin(phi)), front = Math.pow(Math.max(0, Math.cos(phi)), 6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [dir, a] of [[1, right], [-1, left]]) {
      if (a < 0.02) continue;
      const len = Math.max(S.W, S.H) * 1.2, base = G.ang + (dir > 0 ? -0.12 : Math.PI + 0.12), sp = 0.16;
      g = ctx.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, len);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.55 * a * k})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(dc.x, dc.y);
      ctx.lineTo(dc.x + Math.cos(base - sp) * len, dc.y + Math.sin(base - sp) * len);
      ctx.lineTo(dc.x + Math.cos(base + sp) * len, dc.y + Math.sin(base + sp) * len); ctx.closePath(); ctx.fill();
    }
    const fr = fw * (0.4 + 1.4 * front) * k;
    g = ctx.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, fr);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(0.3, `rgba(${col[0]},${col[1]},${col[2]},${0.6 * k})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dc.x, dc.y, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.12 * front * k})`; ctx.fillRect(-60, -60, S.W + 120, S.H + 120);
    ctx.restore();
  }
}
