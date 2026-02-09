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

    // Category-based page management
    newTabWithCategory: (url, category) => ipcRenderer.send('new-tab-with-category', { url, category }),
    navigateView: (id, url) => ipcRenderer.send('navigate-view', { id, url }),
    navigateCategoryViews: (category, url) => ipcRenderer.send('navigate-category', { category, url }),
    onTabCreatedWithCategory: (callback) => ipcRenderer.on('tab-created-with-category', (event, data) => callback(data)),

    // Proxy and view info APIs
    setProxyList: (proxies) => ipcRenderer.send('set-proxy-list', proxies),
    getViewInfo: () => ipcRenderer.invoke('get-view-info'),

    // NEW: Account Management APIs
    addAccount: (site, username, password) => ipcRenderer.invoke('add-account', { site, username, password }),
    getAccounts: (site) => ipcRenderer.invoke('get-accounts', site),
    getAllAccounts: () => ipcRenderer.invoke('get-all-accounts'),
    deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),

    // NEW: Gmail Config APIs
    setGmailConfig: (email, appPassword) => ipcRenderer.invoke('set-gmail-config', { email, appPassword }),
    getGmailConfig: () => ipcRenderer.invoke('get-gmail-config'),

    // NEW: Auto Login APIs
    triggerAutoLogin: (category) => ipcRenderer.send('trigger-auto-login', category),
    onAutoLoginStatus: (callback) => ipcRenderer.on('auto-login-status', (event, data) => callback(data)),
});
