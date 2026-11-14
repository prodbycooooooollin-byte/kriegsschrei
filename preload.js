const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ks', {
  sendFrame: ab => ipcRenderer.send('frame', ab),
  obsInfo: () => ipcRenderer.invoke('obs-info'),
  onClients: cb => ipcRenderer.on('obs-clients', (e, n) => cb(n)),
  copy: text => ipcRenderer.invoke('copy', text),
  openExternal: url => ipcRenderer.invoke('open-external', url)
});
