const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing APIs
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
    onTelegramAuthRequest: (callback) => ipcRenderer.on('tg-auth-request', (event, type) => callback(type)),

    // NEW: Category-based page management
    newTabWithCategory: (url, category) => ipcRenderer.send('new-tab-with-category', { url, category }),
    navigateView: (id, url) => ipcRenderer.send('navigate-view', { id, url }),
    navigateCategoryViews: (category, url) => ipcRenderer.send('navigate-category', { category, url }),
    onTabCreatedWithCategory: (callback) => ipcRenderer.on('tab-created-with-category', (event, data) => callback(data))
});
