// Kriegsschrei – Electron main process
// - serves the app from app:// (secure origin → camera + mic allowed, works offline)
// - runs a local MJPEG server so OBS can show the filter as a Browser Source
//   (no window capture needed, the app window may be minimized or hidden in the tray)
const { app, BrowserWindow, protocol, session, ipcMain, Tray, Menu, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// keep rendering while minimized / covered so OBS keeps getting frames
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

if (!app.requestSingleInstanceLock()) { app.quit(); }

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.data': 'application/octet-stream'
};

let win = null, tray = null, quitting = false, trayHintShown = false;

/* ---------------- OBS stream server ---------------- */
const clients = new Set();
let lastFrame = null, port = 0;
const OBS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Kriegsschrei Cam</title>
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}
img{width:100vw;height:100vh;object-fit:contain;display:block}</style></head>
<body><img id="i" src="/stream"><script>
const i=document.getElementById('i');
i.onerror=()=>setTimeout(()=>{i.src='/stream?'+Date.now()},1000);
</script></body></html>`;

function writeFrame(res, buf){
  res.write(`--ksframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
  res.write(buf); res.write('\r\n');
}
function notifyClients(){ if (win && !win.isDestroyed()) win.webContents.send('obs-clients', clients.size); }

const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ksframe',
      'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Connection': 'keep-alive'
    });
    clients.add(res);
    if (lastFrame) writeFrame(res, lastFrame);
    req.on('close', () => { clients.delete(res); notifyClients(); });
    notifyClients();
    return;
  }
  if (u === '/' || u === '/obs') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(OBS_HTML); return;
  }
  res.writeHead(404); res.end();
});
function listen(p){
  server.once('error', e => { if (e.code === 'EADDRINUSE' && p < 7800) listen(p + 1); });
  server.listen(p, '127.0.0.1', () => { port = p; });
}
listen(7777);

ipcMain.on('frame', (e, ab) => {
  lastFrame = Buffer.from(ab);
  for (const c of clients) if (c.writableLength < 3e6) writeFrame(c, lastFrame); // skip slow clients instead of piling up
});
ipcMain.handle('obs-info', () => ({ port, url: `http://127.0.0.1:${port}/obs`, clients: clients.size }));
ipcMain.handle('copy', (e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('open-external', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('app-version', () => app.getVersion());

/* ---------------- auto update (GitHub releases) ---------------- */
let autoUpdater = null;
function sendUpdate(u){ if (win && !win.isDestroyed()) win.webContents.send('update', u); }
function setupUpdater(){
  if (!app.isPackaged) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', i => sendUpdate({ state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', p => sendUpdate({ state: 'progress', percent: p.percent }));
  autoUpdater.on('update-downloaded', i => {
    sendUpdate({ state: 'ready', version: i.version });
    if (tray && tray.displayBalloon) tray.displayBalloon({ title: 'Kriegsschrei-Update bereit', content: `Version ${i.version} wird beim nächsten Neustart installiert.` });
  });
  autoUpdater.on('error', e => sendUpdate({ state: 'error', message: String((e && e.message) || e) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 3 * 60 * 60 * 1000);
}
ipcMain.handle('update-install', () => { if (!autoUpdater) return; quitting = true; autoUpdater.quitAndInstall(true, true); });

/* ---------------- window + tray ---------------- */
async function createTray(){
  try {
    const icon = await app.getFileIcon(process.execPath, { size: 'small' });
    tray = new Tray(icon);
    tray.setToolTip('Kriegsschrei läuft');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Kriegsschrei öffnen', click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      { label: 'Beenden', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { win.show(); win.focus(); });
  } catch (e) { tray = null; }
}

function createWindow(){
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'Kriegsschrei', backgroundColor: '#0d0c09', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true }
  });
  win.loadURL('app://local/app/index.html');
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // closing the window sends the app to the tray, so OBS keeps getting the cam
  win.on('close', e => {
    if (quitting || !tray) return;
    e.preventDefault(); win.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      tray.displayBalloon && tray.displayBalloon({ title: 'Kriegsschrei läuft weiter', content: 'Die Cam läuft im Hintergrund weiter. Zum Beenden: Rechtsklick auf das Symbol unten rechts → Beenden.' });
    }
  });
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  const root = __dirname;
  protocol.handle('app', async req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) { return new Response('not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media');
  await createTray();
  createWindow();
  setupUpdater();
});
