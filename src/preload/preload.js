const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    newTab: (url) => ipcRenderer.send('new-tab', url),
    switchTab: (id) => ipcRenderer.send('switch-tab', id),
    syncValue: (value) => ipcRenderer.send('sync-value', value),
    closeTab: (id) => ipcRenderer.send('close-tab', id),
    updateViewBounds: (bounds) => ipcRenderer.send('update-view-bounds', bounds),
    globalClick: () => ipcRenderer.send('global-click'),
    onTabCreated: (callback) => ipcRenderer.on('tab-created', (event, id) => callback(id)),
    onTelegramMessage: (callback) => ipcRenderer.on('telegram-message', (event, data) => callback(data)),

    // Telegram Login IPCs
    sendTelegramAuth: (data) => ipcRenderer.send('tg-auth-response', data),
    onTelegramAuthRequest: (callback) => ipcRenderer.on('tg-auth-request', (event, type) => callback(type))
});
