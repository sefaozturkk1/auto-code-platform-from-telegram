const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    newTab: (url) => ipcRenderer.send('new-tab', url),
    switchTab: (id) => ipcRenderer.send('switch-tab', id),
    syncValue: (value) => ipcRenderer.send('sync-value', value),
    closeTab: (id) => ipcRenderer.send('close-tab', id),
    globalClick: () => ipcRenderer.send('global-click'),
    onTabCreated: (callback) => ipcRenderer.on('tab-created', (event, id) => callback(id)),
    onTelegramMessage: (callback) => ipcRenderer.on('telegram-message', (event, data) => callback(data))
});
