// 大喵桌宠 · 预加载脚本（安全桥接）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  platform: process.platform,
  setPos: (x, y) => ipcRenderer.send('pet:set-pos', { x, y }),
  getPos: () => ipcRenderer.invoke('pet:get-pos'),
  setHover: (isOver) => ipcRenderer.send('pet:hover', isOver),
  ipLocation: () => ipcRenderer.invoke('pet:ip-location'),
  toggleClickThrough: () => ipcRenderer.send('pet:toggle-click-through')
});
