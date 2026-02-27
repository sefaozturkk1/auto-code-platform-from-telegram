const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing APIs
    newTab: (url) => ipcRenderer.send('new-tab', url),
    switchTab: (id) => ipcRenderer.send('switch-tab', id),
    syncValue: (value, category) => ipcRenderer.send('sync-value', { value, category }),
    closeTab: (id) => ipcRenderer.send('close-tab', id),
    updateViewBounds: (bounds) => ipcRenderer.send('update-view-bounds', bounds),
    globalClick: (category) => ipcRenderer.send('global-click', category),
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

    // NEW: Site Settings APIs
    setSiteSettings: (site, withdrawalAccount) => ipcRenderer.invoke('set-site-settings', { site, withdrawalAccount }),
    getSiteSettings: (site) => ipcRenderer.invoke('get-site-settings', site),

    // NEW: Detailed Account Updates (including flags)
    updateAccountDetails: (id, site, username, password, bonusFlagged) => ipcRenderer.invoke('update-account-details', { id, site, username, password, bonusFlagged }),

    // NEW: Auto Login APIs
    triggerAutoLogin: (category) => ipcRenderer.send('trigger-auto-login', category),
    onAutoLoginStatus: (callback) => ipcRenderer.on('auto-login-status', (event, data) => callback(data)),
    // NEW: Withdraw APIs
    triggerWithdraw: (category) => ipcRenderer.send('trigger-withdraw', category),
    // NEW: View Visibility Control
    hideViews: () => ipcRenderer.send('hide-views'),
    showViews: () => ipcRenderer.send('show-views'),

    // NEW: Anti-Idle Control
    toggleAntiIdle: (enabled) => ipcRenderer.send('toggle-anti-idle', enabled),

    // NEW: Grid View manual controls
    reloadView: (viewId) => ipcRenderer.send('reload-view', viewId),
    toggleBonusFlag: (viewId) => ipcRenderer.invoke('toggle-bonus-flag', viewId)
});
