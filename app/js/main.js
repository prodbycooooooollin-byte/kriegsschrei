// Kriegsschrei – renderer: camera, tracking, render loop, UI, OBS
import { FilesetResolver, FaceLandmarker, ImageSegmenter } from '../../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
import { cfg, DEF, save, S, drawing, saveDrawing, clamp, lerp, rnd, easeBack, hexToRgb } from './state.js';
import { initAudio, connectMic, hasMic, readRaw, resumeAudio, setVolume, updateLoops, sfxPoof, sfxHeadOpen } from './audio.js';
import { initSiren, captureLid, eraseDome, drawCavity, drawHeadOpen, sirenBurst } from './siren.js';
import { initScene, drawScene, sceneEvents, clearSceneFx, drawFG, tank } from './scene.js';
import { initFace, faceGeom, toLocal, drawOutfit, drawNose, renderStrokes, poofAt, PRESETS, drawLaserFx, drawLasers } from './face.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const isApp = !!window.ks;
function toast(msg, ms = 4500){ const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', ms); }
function setMsg(el, text, kind = ''){ el.textContent = text; el.className = 'msg ' + kind; }

/* ---------------- canvases ---------------- */
const cv = document.createElement('canvas'), ctx = cv.getContext('2d');          // final output (goes to OBS)
const rc = document.createElement('canvas'), rctx = rc.getContext('2d');         // camera after rotate/zoom
const pc = document.createElement('canvas'), pctx = pc.getContext('2d');         // cut-out person
const mc = document.createElement('canvas'), mctx = mc.getContext('2d', { willReadFrequently: true }); // segmentation mask
const pv = $('#preview'), pvx = pv.getContext('2d');                             // on-screen preview
initScene(ctx); initFace(ctx); initSiren(ctx);
const video = document.createElement('video'); video.playsInline = true; video.muted = true;

let hasCam = false, hasMask = false, maskImg = null, face = null, seg = null, trackingState = 'wait';
let camStream = null, micStream = null, camError = '', lastG = null, obsClients = 0, obsUrl = '';

/* ---------------- output size + camera transform ---------------- */
function outDims(){
  if (cfg.outRes !== 'auto') return cfg.outRes.split('x').map(Number);
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  return Number(cfg.rotate) % 180 ? [vh, vw] : [vw, vh];
}
function setupDims(){
  const [w, h] = outDims();
  if (w === S.W && h === S.H && cv.width === w) return;
  S.W = w; S.H = h;
  for (const c of [cv, rc, pc]) { c.width = w; c.height = h; }
  if (!ED.active) { pv.width = w; pv.height = h; }
  S.F = null; hasMask = false; maskImg = null;
  $('#outSizeTxt').textContent = `${w} × ${h}`;
}
function drawRotated(){
  const W = S.W, H = S.H, vw = video.videoWidth, vh = video.videoHeight;
  const rotDeg = Number(cfg.rotate), swap = rotDeg % 180 !== 0;
  const bw = swap ? vh : vw, bh = swap ? vw : vh, s0 = Math.max(W / bw, H / bh);
  const fine = cfg.fineRot * Math.PI / 180, c = Math.abs(Math.cos(fine)), s = Math.abs(Math.sin(fine));
  const sf = Math.max((W * c + H * s) / W, (W * s + H * c) / H); // extra zoom so fine rotation leaves no black corners
  rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.filter = 'none';
  rctx.fillStyle = '#000'; rctx.fillRect(0, 0, W, H);
  if (cfg.brightness !== 1 || cfg.contrast !== 1 || cfg.saturation !== 1)
    rctx.filter = `brightness(${cfg.brightness}) contrast(${cfg.contrast}) saturate(${cfg.saturation})`;
  rctx.translate(W / 2 + cfg.panX * W * 0.5, H / 2 + cfg.panY * H * 0.5);
  rctx.rotate(rotDeg * Math.PI / 180 + fine);
  const sc = s0 * sf * cfg.zoom; rctx.scale(sc, sc);
  rctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.filter = 'none';
}
const mirrorT = c => { if (cfg.mirror) { c.translate(S.W, 0); c.scale(-1, 1); } };

/* ---------------- tracking ---------------- */
const IDX = { le: 468, re: 473, nose: 1, fore: 10, chin: 152, lc: 234, rc: 454, br: 168 };
function updateFace(r){
  const lm = r && r.faceLandmarks && r.faceLandmarks[0];
  if (!lm) return;
  S.faceSeen = S.T;
  const P = i => ({ x: (cfg.mirror ? 1 - lm[i].x : lm[i].x) * S.W, y: lm[i].y * S.H });
  const avg = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const nf = {};
  for (const k in IDX) nf[k] = lm.length > IDX[k] ? P(IDX[k]) : null;
  if (!nf.le) { nf.le = avg(P(33), P(133)); nf.re = avg(P(263), P(362)); }
  if (!S.F) S.F = nf;
  else for (const k in nf) { S.F[k].x = lerp(S.F[k].x, nf[k].x, 0.6); S.F[k].y = lerp(S.F[k].y, nf[k].y, 0.6); }
}
function updateMask(m){
  const w = m.width, h = m.height, data = m.getAsFloat32Array();
  if (!maskImg || mc.width !== w || mc.height !== h) { mc.width = w; mc.height = h; maskImg = mctx.createImageData(w, h); maskImg.data.fill(255); }
  const d = maskImg.data, inv = cfg.invertMask;
  for (let i = 0, j = 3; i < data.length; i++, j += 4) {
    let v = inv ? 1 - data[i] : data[i];
    v = (v - 0.3) * 2.5;
    d[j] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
  }
  mctx.putImageData(maskImg, 0, 0);
  hasMask = true;
}
async function createTask(Cls, vision, model, o){
  try { return await Cls.createFromOptions(vision, { ...o, baseOptions: { modelAssetPath: model, delegate: 'GPU' } }); }
  catch (e) { return await Cls.createFromOptions(vision, { ...o, baseOptions: { modelAssetPath: model, delegate: 'CPU' } }); }
}
async function loadModels(){
  trackingState = 'loading';
  try {
    const vision = await FilesetResolver.forVisionTasks(new URL('../../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url).href);
    face = await createTask(FaceLandmarker, vision, new URL('../models/face_landmarker.task', import.meta.url).href, { runningMode: 'VIDEO', numFaces: 1 });
    seg = await createTask(ImageSegmenter, vision, new URL('../models/selfie_segmenter.tflite', import.meta.url).href, { runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
    trackingState = 'ok';
  } catch (e) { console.error(e); trackingState = 'fail'; toast('Gesichtserkennung konnte nicht starten. Effekte laufen ohne Tracking.'); }
}

/* ---------------- devices ---------------- */
async function openCam(){
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null; hasCam = false; camError = '';
  const [rw, rh] = cfg.camRes.split('x').map(Number);
  const v = { width: { ideal: rw }, height: { ideal: rh } };
  if (cfg.camId) v.deviceId = { exact: cfg.camId };
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
  catch (e) {
    if (cfg.camId && e.name === 'OverconstrainedError') { cfg.camId = ''; save(); return openCam(); }
    camError = e.name === 'NotReadableError'
      ? 'Die Kamera wird schon benutzt, meistens von deiner alten Kamera-Quelle in OBS. Die in OBS ausblenden (Auge-Symbol), dann hier die Kamera neu wählen.'
      : (e.name === 'NotAllowedError' ? 'Zugriff auf die Kamera wurde verweigert.' : 'Keine Kamera gefunden.');
    return;
  }
  video.srcObject = camStream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
  hasCam = true; S.W = 0; setupDims();
}
async function openMic(){
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null; connectMic(null);
  const a = { echoCancellation: cfg.echoCancellation, noiseSuppression: cfg.noiseSuppression, autoGainControl: false };
  if (cfg.micId) a.deviceId = { exact: cfg.micId };
  try { micStream = await navigator.mediaDevices.getUserMedia({ audio: a }); }
  catch (e) { if (cfg.micId && e.name === 'OverconstrainedError') { cfg.micId = ''; save(); return openMic(); } return; }
  connectMic(micStream);
}
async function fillDevices(){
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) {}
  const fill = (sel, kind, cur) => {
    sel.innerHTML = ''; sel.add(new Option('Standard', ''));
    devs.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default').forEach((d, i) => sel.add(new Option(d.label || `Gerät ${i + 1}`, d.deviceId)));
    sel.value = cur || '';
    if (sel.value !== (cur || '')) sel.value = '';
  };
  fill($('#camSel'), 'videoinput', cfg.camId); fill($('#micSel'), 'audioinput', cfg.micId);
}

/* ---------------- state per frame ---------------- */
let wantDrawPrev = false, wantSirenPrev = false;
function updateState(dt){
  let raw = readRaw(); S.raw = raw;
  if (raw < cfg.gate) raw = 0;
  if (S.simLoud) raw = Math.max(raw, 0.97);
  const k = v => 1 - Math.pow(1 - clamp(v, 0.001, 1), dt * 60);
  S.lvl = raw > S.lvl ? lerp(S.lvl, raw, k(cfg.attack)) : lerp(S.lvl, raw, k(cfg.release));
  if (S.lvl > cfg.threshold) S.loudT = cfg.hold; else S.loudT -= dt;
  const loud = S.loudT > 0; S.loud = loud;
  const over = loud ? clamp(0.5 + (S.lvl - cfg.threshold) / (1 - cfg.threshold + 1e-3)) : 0;
  // rage meter: fills while screaming (~8 s to full at default speed), drains when quiet
  S.build = clamp(S.build + (loud ? 0.12 * cfg.buildSpeed * (0.6 + over) : -0.1 * cfg.coolSpeed) * dt);
  const s2 = cfg.stage2At, s3 = Math.max(cfg.stage3At, s2 + 0.05);
  S.stage = (S.build < 0.002 && !loud) ? 0 : S.build < s2 ? 1 : S.build < s3 ? 2 : 3;
  const sceneStart = cfg.sceneStage === 1 ? 0 : cfg.sceneStage === 2 ? s2 : s3;
  S.sb = sceneStart >= 1 ? 0 : clamp((S.build - sceneStart) / (1 - sceneStart));
  // stage 1: laser
  S.laserAmt = lerp(S.laserAmt, (loud && cfg.lasers) ? 0.6 + 0.4 * over : 0, 1 - Math.exp(-dt * (loud ? 18 : 8)));
  // stage 2: nose, veteran look, drawing
  const wantOutfit = cfg.outfit === 'always' || (cfg.outfit === 'loud' && S.build >= s2);
  S.outfitAmt = lerp(S.outfitAmt, wantOutfit ? 1 : 0, 1 - Math.exp(-dt * 4));
  S.noseAmt = lerp(S.noseAmt, cfg.nose ? clamp((S.build - s2) / 0.15) : 0, 1 - Math.exp(-dt * 3));
  const wantDraw = drawing.strokes.length > 0 && (cfg.drawMode === 'always' || (cfg.drawMode === 'loud' && S.build >= s2));
  // stage 3: head opens, siren comes out
  const wantSiren = cfg.siren && S.build >= s3;
  if (wantSiren && !wantSirenPrev && S.sirenAmt < 0.05 && lastG) { sfxHeadOpen(); sirenBurst(lastG); }
  wantSirenPrev = wantSiren;
  S.sirenAmt = clamp(S.sirenAmt + (wantSiren ? dt / 1.6 : -dt / 0.9));
  if (wantDraw && !wantDrawPrev && lastG && cfg.drawMode === 'loud') { poofAt(lastG); sfxPoof(); }
  wantDrawPrev = wantDraw;
  S.drawAmt = lerp(S.drawAmt, wantDraw ? 1 : 0, 1 - Math.exp(-dt * (wantDraw ? 7 : 3)));
  S.shake *= Math.exp(-dt * 6); S.flash *= Math.exp(-dt * 5);
  if (loud) S.shake = Math.max(S.shake, S.laserAmt * 0.2);
  sceneEvents(dt);
  updateLoops(tank.pres, clamp((S.sirenAmt - 0.3) / 0.6));
}

/* ---------------- render ---------------- */
function faceOvalMask(c, G){
  const mx = x => cfg.mirror ? S.W - x : x;
  const cx = mx(G.F.nose.x), cy = G.F.nose.y, r = G.fw;
  c.save(); c.translate(cx, cy + r * 0.25); c.scale(1, 1.45);
  const g = c.createRadialGradient(0, 0, r * 0.45, 0, 0, r * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
  const g2 = c.createRadialGradient(cx, cy + r * 1.9, r * 0.4, cx, cy + r * 1.9, r * 1.6);
  g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g2; c.fillRect(cx - r * 1.6, cy + r * 0.3, r * 3.2, r * 3.2);
}
function drawPerson(G, siren){
  pctx.globalCompositeOperation = 'copy'; pctx.drawImage(rc, 0, 0);
  pctx.globalCompositeOperation = 'destination-in';
  if (hasMask) { pctx.filter = cfg.cutoutSoft > 0 ? `blur(${cfg.cutoutSoft}px)` : 'none'; pctx.drawImage(mc, 0, 0, S.W, S.H); }
  else if (G) faceOvalMask(pctx, G);
  pctx.filter = 'none'; pctx.globalCompositeOperation = 'source-over';
  if (siren && G) { captureLid(G, pc); eraseDome(pctx, G); }
  S.personFilter = `sepia(${0.35 * S.sb}) contrast(${1 + 0.15 * S.sb}) saturate(${1 - 0.3 * S.sb})`;
  ctx.save(); mirrorT(ctx); ctx.filter = S.personFilter; ctx.drawImage(pc, 0, 0); ctx.restore();
}
function render(dt){
  const W = S.W, H = S.H;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  const sh = S.shake * cfg.shakeAmt * W * 0.012; ctx.translate(rnd(-sh, sh), rnd(-sh, sh));
  if (hasCam) { ctx.save(); mirrorT(ctx); ctx.drawImage(rc, 0, 0); ctx.restore(); }
  else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2a2a'); g.addColorStop(1, '#121212'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const faceVis = S.F && S.T - S.faceSeen < 0.4;
  const G = faceVis ? faceGeom() : null;
  let sceneA = cfg.scene ? clamp(S.sb * 3.5) : 0;
  const canCut = hasCam && (hasMask || G);
  if (hasCam && !canCut) sceneA = Math.min(sceneA, 0.45);
  const siren = !!G && S.sirenAmt > 0.001;
  // the opened skull must reveal the battlefield, so make it opaque at least as far as the lid is open
  if (siren && cfg.scene && canCut) sceneA = Math.max(sceneA, clamp(S.sirenAmt * 2.2));
  S.personFilter = 'none';
  const cutDrawn = sceneA > 0.001 && canCut;
  if (sceneA > 0.001) { drawScene(sceneA, dt); if (canCut) drawPerson(G, siren); }
  else clearSceneFx(dt);
  if (siren && !cutDrawn) { captureLid(G, hasCam ? rc : cv); drawCavity(G); }
  if (G) {
    if (cfg.nose && S.noseAmt > 0.01 && hasCam) drawNose(G, S.noseAmt, rc);
    if (S.drawAmt > 0.01 && drawing.strokes.length) renderStrokes(ctx, G, clamp(S.drawAmt), 0.75 + 0.25 * easeBack(clamp(S.drawAmt)), drawing.strokes);
    if (siren) drawHeadOpen(G);
    if (S.outfitAmt > 0.01) drawOutfit(G, S.outfitAmt);
  }
  drawLaserFx(dt);
  if (G && S.laserAmt > 0.02) drawLasers(G, S.laserAmt, dt);
  drawFG(dt, hexToRgb(cfg.laserColor));
  ctx.restore();
  lastG = G;
}

/* ---------------- drawing editor ---------------- */
const ED = { active: false, snap: document.createElement('canvas'), G: null, tool: 'hair', color: '#3b2414', size: 0.06, alpha: 0.9, cur: null, hover: null };
function drawPreview(){
  if (!ED.active) { if (pv.width !== S.W || pv.height !== S.H) { pv.width = S.W; pv.height = S.H; } pvx.drawImage(cv, 0, 0); return; }
  pvx.setTransform(1, 0, 0, 1, 0, 0);
  pvx.drawImage(ED.snap, 0, 0);
  renderStrokes(pvx, ED.G, 1, 1, ED.cur ? [...drawing.strokes, ED.cur] : drawing.strokes);
  if (ED.hover) {
    const r = Math.max(2, ED.size * ED.G.fw / 2);
    pvx.lineWidth = 2; pvx.strokeStyle = '#000'; pvx.beginPath(); pvx.arc(ED.hover.x, ED.hover.y, r + 1, 0, Math.PI * 2); pvx.stroke();
    pvx.strokeStyle = '#fff'; pvx.lineWidth = 1; pvx.beginPath(); pvx.arc(ED.hover.x, ED.hover.y, r, 0, Math.PI * 2); pvx.stroke();
  }
}
function toCanvas(e){
  const r = pv.getBoundingClientRect(), s = Math.min(r.width / pv.width, r.height / pv.height);
  const ox = (r.width - pv.width * s) / 2, oy = (r.height - pv.height * s) / 2;
  return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
}
const r4 = v => Math.round(v * 10000) / 10000;
function startEditor(){
  if (!lastG) { setMsg($('#drawMsg'), 'Kein Gesicht erkannt. Schau gerade in die Kamera und versuch es nochmal.', 'err'); return; }
  ED.snap.width = S.W; ED.snap.height = S.H;
  const sx = ED.snap.getContext('2d');
  sx.save(); if (cfg.mirror) { sx.translate(S.W, 0); sx.scale(-1, 1); } sx.drawImage(rc, 0, 0); sx.restore();
  ED.G = lastG; ED.active = true;
  pv.width = S.W; pv.height = S.H;
  $('#drawIntro').classList.add('hidden'); $('#drawTools').classList.remove('hidden');
  $('#editBar').classList.remove('hidden'); pv.classList.add('drawing');
  setMsg($('#drawMsg'), '');
}
function stopEditor(){
  ED.active = false; ED.cur = null; ED.hover = null;
  $('#drawIntro').classList.remove('hidden'); $('#drawTools').classList.add('hidden');
  $('#editBar').classList.add('hidden'); pv.classList.remove('drawing');
}
pv.addEventListener('pointerdown', e => {
  if (!ED.active) return;
  pv.setPointerCapture(e.pointerId);
  const p = toCanvas(e), [u, v] = toLocal(ED.G, p.x, p.y);
  ED.cur = { tool: ED.tool, color: ED.color, size: ED.size, alpha: ED.alpha, pts: [r4(u), r4(v)] };
});
pv.addEventListener('pointermove', e => {
  if (!ED.active) return;
  const p = toCanvas(e); ED.hover = p;
  if (!ED.cur) return;
  const [u, v] = toLocal(ED.G, p.x, p.y), pts = ED.cur.pts;
  if (Math.hypot(u - pts[pts.length - 2], v - pts[pts.length - 1]) > 0.004) pts.push(r4(u), r4(v));
});
const endStroke = () => { if (ED.cur) { drawing.strokes.push(ED.cur); ED.cur = null; saveDrawing(); } };
pv.addEventListener('pointerup', endStroke);
pv.addEventListener('pointercancel', endStroke);
pv.addEventListener('pointerleave', () => { ED.hover = null; });

$('#drawStart').addEventListener('click', startEditor);
$('#drawDone').addEventListener('click', stopEditor);
$('#drawUndo').addEventListener('click', () => { drawing.strokes.pop(); saveDrawing(); });
const clearDrawing = () => { if (drawing.strokes.length && confirm('Die ganze Zeichnung löschen?')) { drawing.strokes.length = 0; saveDrawing(); } };
$('#drawClear').addEventListener('click', clearDrawing);
$('#drawClear2').addEventListener('click', clearDrawing);
$$('#toolSeg button').forEach(b => b.addEventListener('click', () => { ED.tool = b.dataset.t; $$('#toolSeg button').forEach(x => x.classList.toggle('on', x === b)); }));
function setDrawColor(c){ ED.color = c; $('#drawColor').value = c; $$('#drawSw button').forEach(x => x.classList.toggle('on', x.dataset.v === c)); if (ED.tool === 'erase') $$('#toolSeg button')[0].click(); }
$$('#drawSw button').forEach(b => b.addEventListener('click', () => setDrawColor(b.dataset.v)));
$('#drawColor').addEventListener('input', e => setDrawColor(e.target.value));
const sizeLbl = () => { $('#drawSizeV').textContent = Math.round(ED.size * 500); $('#drawAlphaV').textContent = Math.round(ED.alpha * 100) + '%'; };
$('#drawSize').addEventListener('input', e => { ED.size = parseFloat(e.target.value); sizeLbl(); });
$('#drawAlpha').addEventListener('input', e => { ED.alpha = parseFloat(e.target.value); sizeLbl(); });
$$('.presets button').forEach(b => b.addEventListener('click', () => { drawing.strokes.push(...PRESETS[b.dataset.p](ED.color)); saveDrawing(); }));
setDrawColor(ED.color); sizeLbl();

/* ---------------- settings UI binding ---------------- */
const FMT = {
  pct: v => Math.round(v * 100) + '%',
  x: v => (Math.round(v * 100) / 100) + '×',
  deg: v => (v > 0 ? '+' : '') + v + '°',
  s: v => v.toFixed(2) + ' s',
  px: v => v + ' px',
  speed: v => v < 0.15 ? 'langsam' : v < 0.45 ? 'mittel' : 'schnell',
  rage: v => `${Math.round(v * 100)} % (ca. ${(v / (0.12 * cfg.buildSpeed * 1.25)).toFixed(1)} s schreien)`
};
const setEl = (el, v) => { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
function refreshAll(){
  $$('[data-k]').forEach(el => { if (document.activeElement !== el) setEl(el, cfg[el.dataset.k]); });
  $$('b[data-v]').forEach(b => { const inp = document.querySelector(`[data-k="${b.dataset.v}"][data-fmt]`); if (inp) b.textContent = FMT[inp.dataset.fmt](cfg[b.dataset.v]); });
  $$('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(cfg[seg.dataset.seg]) === b.dataset.v)));
  $$('[data-swatch]').forEach(sw => sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(cfg[sw.dataset.swatch]).toLowerCase() === b.dataset.v)));
}
function onCfg(k){
  if (k === 'volume') setVolume();
  if (k === 'camId' || k === 'camRes') openCam().then(() => { if (hasCam && !face && trackingState !== 'loading') loadModels(); });
  if (k === 'micId' || k === 'echoCancellation' || k === 'noiseSuppression') openMic();
}
$$('[data-k]').forEach(el => {
  const k = el.dataset.k;
  el.addEventListener('input', () => {
    let v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? parseFloat(el.value) : el.value;
    if (k === 'outFps') v = Number(v);
    cfg[k] = v; save(); refreshAll(); onCfg(k);
  });
});
$$('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  const k = seg.dataset.seg, v = b.dataset.v;
  cfg[k] = isNaN(Number(v)) ? v : Number(v); save(); refreshAll(); onCfg(k);
})));
$$('[data-swatch]').forEach(sw => sw.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cfg[sw.dataset.swatch] = b.dataset.v; save(); refreshAll(); })));
$('#camReset').addEventListener('click', () => {
  for (const k of ['rotate', 'fineRot', 'zoom', 'panX', 'panY', 'mirror', 'brightness', 'contrast', 'saturation', 'outRes', 'cutoutSoft', 'invertMask']) cfg[k] = DEF[k];
  save(); refreshAll();
});
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
}));
refreshAll();

// rage test: hold button or space
const rageOn = v => { S.simLoud = v; $('#rageBtn').classList.toggle('on', v); if (v) resumeAudio(); };
$('#rageBtn').addEventListener('pointerdown', () => rageOn(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#rageBtn').addEventListener(ev, () => rageOn(false)));
const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
addEventListener('keydown', e => { resumeAudio(); if (e.code === 'Space' && !typing(e)) { e.preventDefault(); rageOn(true); } });
addEventListener('keyup', e => { if (e.code === 'Space') rageOn(false); });
addEventListener('pointerdown', resumeAudio);

/* ---------------- mic auto calibration ---------------- */
const wait = ms => new Promise(r => setTimeout(r, ms));
async function sample(ms){ const out = [], end = performance.now() + ms; while (performance.now() < end) { out.push(readRaw()); await wait(30); } return out.sort((a, b) => a - b); }
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] || 0;
$('#calib').addEventListener('click', async () => {
  const msg = $('#calibMsg'), btn = $('#calib');
  if (!hasMic()) { setMsg(msg, 'Kein Mikrofon verbunden. Oben ein Mikrofon auswählen.', 'err'); return; }
  btn.disabled = true;
  setMsg(msg, '1/2  Sei jetzt 2 Sekunden still …');
  const quiet = await sample(2000);
  setMsg(msg, '2/2  Jetzt 2 Sekunden RICHTIG LAUT schreien!');
  await wait(300);
  const loudArr = await sample(2200);
  let q = pct(quiet, 0.9), l = pct(loudArr, 0.8);
  if (l < 0.6 && l - q > 0.04) {
    // too quiet: raise the gain so a scream lands around 75 %
    const need = 0.75 - l, g = Math.pow(10, need * 50 / 20);
    cfg.gain = clamp(cfg.gain * g, 0.2, 6);
    const real = 20 * Math.log10(cfg.gain / (cfg.gain / g)) / 50; q = clamp(q + real); l = clamp(l + real);
  }
  if (l - q < 0.08) { setMsg(msg, 'Kaum Unterschied zwischen leise und laut gemessen. Ist das richtige Mikrofon gewählt?', 'err'); btn.disabled = false; return; }
  cfg.gate = clamp(q + 0.03, 0, 0.6);
  cfg.threshold = clamp(q + (l - q) * 0.45, 0.1, 0.95);
  save(); refreshAll();
  setMsg(msg, `Fertig. Schwelle ${Math.round(cfg.threshold * 100)} %, Verstärkung ${Math.round(cfg.gain * 100) / 100}×.`, 'ok');
  btn.disabled = false;
});

/* ---------------- OBS ---------------- */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const sha = async s => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
function obsSession(port, pw){
  return new Promise((resolve, reject) => {
    let ws, identified = false, id = 0;
    const pending = new Map();
    try { ws = new WebSocket(`ws://127.0.0.1:${port}`); } catch (e) { reject(new Error('connect')); return; }
    const timer = setTimeout(() => { reject(new Error('connect')); try { ws.close(); } catch (e) {} }, 6000);
    ws.onclose = e => { if (!identified) { clearTimeout(timer); reject(new Error(e.code === 4009 ? 'auth' : 'connect')); } for (const p of pending.values()) p.reject(new Error('closed')); };
    ws.onmessage = async m => {
      const msg = JSON.parse(m.data);
      if (msg.op === 0) {
        const d = { rpcVersion: 1 }, a = msg.d.authentication;
        if (a) {
          if (!pw) { clearTimeout(timer); identified = true; ws.close(); reject(new Error('needpw')); return; }
          d.authentication = await sha((await sha(pw + a.salt)) + a.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        identified = true; clearTimeout(timer);
        resolve({
          call: (requestType, requestData = {}) => new Promise((res, rej) => {
            const requestId = 'r' + (++id); pending.set(requestId, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
          }),
          close: () => ws.close()
        });
      } else if (msg.op === 7) {
        const p = pending.get(msg.d.requestId); if (p) { pending.delete(msg.d.requestId); p.resolve(msg.d); }
      }
    };
  });
}
let savedPw = ''; try { savedPw = localStorage.getItem('ks2-obspw') || ''; } catch (e) {}
$('#obsPw').value = savedPw;
$('#obsAuto').addEventListener('click', async () => {
  const msg = $('#obsMsg'), btn = $('#obsAuto'), pw = $('#obsPw').value;
  if (!isApp) { setMsg(msg, 'Das geht nur in der Kriegsschrei-App.', 'err'); return; }
  btn.disabled = true; setMsg(msg, 'Verbinde mit OBS …');
  try { localStorage.setItem('ks2-obspw', pw); } catch (e) {}
  try {
    const s = await obsSession(cfg.obsPort, pw);
    const sc = await s.call('GetCurrentProgramScene');
    const sceneName = sc.responseData.currentProgramSceneName || sc.responseData.sceneName;
    const settings = { url: obsUrl, width: S.W, height: S.H, fps_custom: true, fps: Number(cfg.outFps), reroute_audio: false, shutdown: false, restart_when_active: false };
    let r = await s.call('CreateInput', { sceneName, inputName: 'Kriegsschrei Cam', inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
    let what = 'angelegt';
    if (!r.requestStatus.result) {
      if (r.requestStatus.code !== 601) throw new Error('obs:' + (r.requestStatus.comment || r.requestStatus.code));
      await s.call('SetInputSettings', { inputName: 'Kriegsschrei Cam', inputSettings: settings });
      const item = await s.call('GetSceneItemId', { sceneName, sourceName: 'Kriegsschrei Cam' });
      if (!item.requestStatus.result) await s.call('CreateSceneItem', { sceneName, sourceName: 'Kriegsschrei Cam' });
      what = 'aktualisiert';
    }
    const a = await s.call('CreateInput', { sceneName, inputName: 'Kriegsschrei Sound', inputKind: 'wasapi_process_output_capture', inputSettings: { window: 'Kriegsschrei:Chrome_WidgetWin_1:Kriegsschrei.exe', priority: 2 }, sceneItemEnabled: true });
    const soundOk = a.requestStatus.result || a.requestStatus.code === 601;
    let blockers = [];
    if (!hasCam) {
      const il = await s.call('GetInputList', { inputKind: 'dshow_input' });
      blockers = ((il.responseData && il.responseData.inputs) || []).map(i => i.inputName);
    }
    s.close();
    let text = `Fertig! „Kriegsschrei Cam“ wurde in der Szene „${sceneName}“ ${what}.`;
    text += soundOk ? '\nTon kommt über „Kriegsschrei Sound“.' : '\nTon: in OBS „Anwendungsaudio-Aufnahme → Kriegsschrei“ hinzufügen.';
    if (blockers.length) text += `\nAchtung: Blende in OBS deine alte Kamera-Quelle aus („${blockers.join('“, „')}“), damit Kriegsschrei die Kamera bekommt. Danach hier im Tab Kamera die Kamera neu wählen.`;
    setMsg(msg, text, 'ok');
  } catch (e) {
    const m = e.message;
    if (m === 'needpw') { $('#obsDetails').open = true; setMsg(msg, 'OBS will ein Passwort. Trag es unten ein (wo du es findest, steht direkt darüber) und klick nochmal.', 'err'); }
    else if (m === 'auth') { $('#obsDetails').open = true; setMsg(msg, 'Das Passwort stimmt nicht.', 'err'); }
    else if (m === 'connect') setMsg(msg, 'OBS nicht erreichbar. Läuft OBS? In OBS unter Werkzeuge → WebSocket-Servereinstellungen „WebSocket-Server aktivieren“ anhaken.', 'err');
    else setMsg(msg, 'OBS hat abgelehnt: ' + m.replace('obs:', ''), 'err');
  }
  btn.disabled = false;
});
$('#copyUrl').addEventListener('click', async () => { if (isApp) { await window.ks.copy(obsUrl); toast('Link kopiert. In OBS als Browser-Quelle einfügen.'); } });

let frameBusy = false, lastSend = 0;
function pushFrame(now){
  if (!isApp || !obsClients || frameBusy || !S.W) return;
  if (now - lastSend < 1000 / Number(cfg.outFps) - 3) return;
  lastSend = now; frameBusy = true;
  cv.toBlob(b => {
    if (!b) { frameBusy = false; return; }
    b.arrayBuffer().then(ab => { window.ks.sendFrame(ab); frameBusy = false; }, () => { frameBusy = false; });
  }, 'image/jpeg', cfg.outQuality);
}

/* ---------------- status UI ---------------- */
function setCheck(id, ok, label, note = ''){
  const li = $('#' + id); li.className = ok ? 'ok' : (ok === false ? 'bad' : '');
  li.innerHTML = `<span class="ck"></span><span>${label}${note ? `<br><span class="small">${note}</span>` : ''}</span>`;
}
let uiT = 0;
function updateUI(dt){
  uiT -= dt; if (uiT > 0) return; uiT = 0.06;
  const lv = (S.lvl * 100).toFixed(1) + '%';
  $('#hMic').style.width = lv; $('#hThr').style.left = cfg.threshold * 100 + '%'; $('#hRage').style.width = (S.build * 100).toFixed(1) + '%';
  $('#hS2').style.left = cfg.stage2At * 100 + '%'; $('#hS3').style.left = Math.max(cfg.stage3At, cfg.stage2At + 0.05) * 100 + '%';
  const sp = $('#stagePill'); sp.className = 'stage-pill' + (S.stage ? ' s' + S.stage : '');
  sp.textContent = S.stage ? 'STUFE ' + S.stage : 'Ruhig';
  $('#mMic').style.width = lv; $('#mThr').style.left = cfg.threshold * 100 + '%'; $('#mGate').style.left = cfg.gate * 100 + '%';
  const camLabel = camStream ? (camStream.getVideoTracks()[0]?.label || 'Kamera') : '';
  setCheck('stCam', hasCam ? true : (camError ? false : null), 'Kamera', hasCam ? camLabel : camError || 'wird gestartet …');
  const micLabel = micStream ? (micStream.getAudioTracks()[0]?.label || '') : '';
  setCheck('stMic', hasMic() ? true : false, 'Mikrofon', hasMic() ? micLabel : 'kein Mikrofon, nur „Rage testen“ geht');
  const faceOk = S.F && S.T - S.faceSeen < 0.6;
  setCheck('stTrack', trackingState === 'ok' ? (faceOk ? true : null) : (trackingState === 'fail' ? false : null), 'Gesichtserkennung',
    trackingState === 'ok' ? (faceOk ? 'Gesicht erkannt' : 'kein Gesicht im Bild') : trackingState === 'fail' ? 'konnte nicht starten' : trackingState === 'loading' ? 'lädt …' : 'wartet auf die Kamera');
  setCheck('stObs', obsClients > 0 ? true : null, 'In OBS sichtbar', obsClients > 0 ? 'OBS zeigt die Cam' : 'noch nicht in OBS eingebaut');
  $('#pillObs').classList.toggle('ok', obsClients > 0);
  $('#pillObsTxt').textContent = obsClients > 0 ? 'OBS: verbunden' : 'OBS: nicht verbunden';
  $('#stageHint').textContent = hasCam ? '' : (camError || 'Kamera wird gestartet …');
}

/* ---------------- main loop ---------------- */
let last = performance.now(), lastTs = 0;
function loop(){
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; S.T += dt;
  try {
    if (hasCam && video.readyState >= 2 && video.videoWidth) {
      setupDims(); drawRotated();
      const ts = Math.max(now, lastTs + 1); lastTs = ts;
      if (face) { try { updateFace(face.detectForVideo(rc, ts)); } catch (e) {} }
      if (seg && (cfg.scene || cfg.siren)) {
        try { seg.segmentForVideo(rc, ts, res => { const m = res.confidenceMasks; if (m && m.length) updateMask(m[m.length > 1 ? 1 : 0]); }); } catch (e) {}
      }
    } else if (!hasCam) setupDims();
    updateState(dt);
    render(dt);
    drawPreview();
    pushFrame(now);
    updateUI(dt);
  } catch (e) { console.error(e); }
  // setTimeout instead of requestAnimationFrame: keeps running while the window is minimized or in the tray
  setTimeout(loop, Math.max(0, 1000 / 60 - (performance.now() - now)));
}

// test hook for the plain browser preview only (not active in the app)
if (!isApp) window.__ks = { S, cfg, drawing, startEditor, stopEditor };

/* ---------------- start ---------------- */
(async function start(){
  initAudio();
  setupDims();
  loop();
  if (isApp) {
    const info = await window.ks.obsInfo();
    obsUrl = info.url; obsClients = info.clients;
    $('#obsUrl').textContent = obsUrl;
    window.ks.onClients(n => { obsClients = n; });
    // auto update: download runs in the background, the button appears once it's ready
    const ub = $('#updateBtn');
    window.ks.onUpdate(u => {
      if (u.state === 'downloading' || u.state === 'progress') {
        ub.classList.remove('hidden'); ub.classList.add('busy'); ub.disabled = true;
        ub.textContent = u.state === 'progress' ? `Update lädt … ${Math.round(u.percent)} %` : `Update ${u.version} lädt …`;
      } else if (u.state === 'ready') {
        ub.classList.remove('hidden', 'busy'); ub.disabled = false;
        ub.textContent = `Update ${u.version}: jetzt neu starten`;
        toast(`Version ${u.version} ist bereit. Klick oben auf „jetzt neu starten“ oder es wird beim nächsten Beenden installiert.`, 8000);
      } else if (u.state === 'error') { ub.classList.add('hidden'); }
    });
    ub.addEventListener('click', () => window.ks.installUpdate());
    $('#appVersion').textContent = 'Version ' + await window.ks.version();
  } else $('#obsUrl').textContent = 'nur in der App verfügbar';
  await openCam();
  await openMic();
  fillDevices();
  navigator.mediaDevices.addEventListener('devicechange', fillDevices);
  if (hasCam) await loadModels();
})();
