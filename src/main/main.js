console.log('[STARTUP] Application starting...');

const { app, BrowserWindow, BrowserView, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Telegram modules - will be loaded inside startTelegramBot after app is ready
let TelegramClient, Api, StringSession, NewMessage;

// Database and Gmail modules
console.log('[STARTUP] Loading database and gmail modules...');
let db, gmail;

try {
    db = require('./database');
    console.log('[STARTUP] Database module loaded.');
} catch (e) {
    console.error('[STARTUP] Failed to load database module:', e);
}

// db = null; // Disable DB for now

try {
    gmail = require('./gmail');
    console.log('[STARTUP] Gmail module loaded.');
} catch (e) {
    console.error('[STARTUP] Failed to load Gmail module:', e);
}

// gmail = null; // Disable Gmail for now

console.log('[STARTUP] Modules processing complete. Determining categories...');

// Site to color category mapping
const SITE_CATEGORIES = {
    jojobet: 'blue',
    matbet: 'red',
    holiganbet: 'yellow',
    turboslot: 'black'
};

// View to account assignment tracking
const viewAccountMap = new Map(); // viewId -> accountId

// Increase renderer process limit for 100-150+ browser views
// Increase renderer process limit for 100-150+ browser views
// app.commandLine.appendSwitch('renderer-process-limit', '150');
// app.commandLine.appendSwitch('disable-renderer-backgrounding');
// app.commandLine.appendSwitch('disable-background-timer-throttling');
// app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');
// app.commandLine.appendSwitch('disable-site-isolation-trials');
// app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
// Anti-bot important flags - REMOVED
// app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Diverse User-Agents to bypass Cloudflare bot detection
const USER_AGENTS = [
    // Chrome Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    // Chrome Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    // Firefox Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    // Firefox Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Safari Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    // Edge Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    // Mobile User Agents
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
];

let userAgentIndex = 0;
function getNextUserAgent() {
    const ua = USER_AGENTS[userAgentIndex % USER_AGENTS.length];
    userAgentIndex++;
    return ua;
}

// Proxy configuration (set your proxies here)
// Format: { host: 'proxy.example.com', port: 8080, username: 'user', password: 'pass' }
let PROXY_LIST = [];
let proxyIndex = 0;
function getNextProxy() {
    if (PROXY_LIST.length === 0) return null;
    const proxy = PROXY_LIST[proxyIndex % PROXY_LIST.length];
    proxyIndex++;
    return proxy;
}

let mainWindow;
let tray;
let isQuitting = false;
const views = new Map(); // id -> { view: BrowserView, category: string, userAgent: string }

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    // Increase max listeners for 100-150+ browser views
    mainWindow.setMaxListeners(200);

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('resize', () => {
        // Handled by renderer now
    });
}

function createTray() {
    // Note: You might want to add a real icon file in the future. 
    // For now, it will look for a default or empty icon if not provided.
    // Replace 'path/to/icon' with a valid png/ico file path.
    tray = new Tray(path.join(__dirname, '../../assets/icon.png')); // Make sure this path exists or use a dummy
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        {
            label: 'Exit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Telegram UserBot Browser');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.show();
    });
}

function startAntiIdle() {
    console.log("Anti-Idle mechanism started (1m interval - aggressive mode)");

    // Ana anti-idle döngüsü - 1 dakikada bir
    setInterval(() => {
        if (views.size === 0) return;
        console.log(`[ANTI-IDLE] Triggering keep-alive actions on ${views.size} views...`);

        views.forEach((viewData, viewId) => {
            const script = `
                (function() {
                    try {
                        // 1. Random mouse move event
                        const randomX = Math.floor(Math.random() * window.innerWidth);
                        const randomY = Math.floor(Math.random() * window.innerHeight);
                        const mouseMoveEvent = new MouseEvent('mousemove', {
                            bubbles: true,
                            cancelable: true,
                            clientX: randomX,
                            clientY: randomY
                        });
                        document.dispatchEvent(mouseMoveEvent);
                        
                        // 2. Focus event on document
                        document.dispatchEvent(new Event('focus', { bubbles: true }));
                        window.dispatchEvent(new Event('focus'));
                        
                        // 3. Visibility change simulation (page visible)
                        if (document.hidden) {
                            Object.defineProperty(document, 'hidden', { value: false, writable: true });
                            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
                            document.dispatchEvent(new Event('visibilitychange'));
                        }
                        
                        // 4. Keyboard activity simulation (harmless key)
                        const keyEvent = new KeyboardEvent('keydown', {
                            bubbles: true,
                            cancelable: true,
                            key: 'Shift',
                            code: 'ShiftLeft',
                            keyCode: 16,
                            which: 16
                        });
                        document.dispatchEvent(keyEvent);
                        setTimeout(() => {
                            document.dispatchEvent(new KeyboardEvent('keyup', {
                                bubbles: true,
                                cancelable: true,
                                key: 'Shift',
                                code: 'ShiftLeft',
                                keyCode: 16,
                                which: 16
                            }));
                        }, 50);
                        
                        // 5. Tiny scroll and back
                        const currentScroll = window.scrollY;
                        window.scrollBy(0, 1);
                        setTimeout(() => window.scrollTo(0, currentScroll), 100);
                        
                        // 6. Touch/pointer events for mobile-responsive sites
                        const pointerEvent = new PointerEvent('pointermove', {
                            bubbles: true,
                            cancelable: true,
                            clientX: randomX,
                            clientY: randomY,
                            pointerType: 'mouse'
                        });
                        document.dispatchEvent(pointerEvent);
                        
                        // 7. Periodic click on body (not on buttons/links)
                        const bodyClick = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            clientX: 10,
                            clientY: 10
                        });
                        // Only click on body itself, not interactive elements
                        if (document.body) {
                            document.body.dispatchEvent(bodyClick);
                        }
                        
                        // 8. Activity timestamp update (for sites that check this)
                        window.__lastActivity = Date.now();
                        sessionStorage.setItem('__antiIdleTimestamp', Date.now().toString());
                        
                        console.log('[ANTI-IDLE] Keep-alive actions executed at ' + new Date().toLocaleTimeString());
                        return true;
                    } catch (e) {
                        console.error('[ANTI-IDLE] Error:', e.message);
                        return false;
                    }
                })();
            `;
            viewData.view.webContents.executeJavaScript(script).catch((err) => {
                console.log(`[ANTI-IDLE] Script execution failed for view ${viewId}:`, err.message);
            });
        });
    }, 60 * 1000); // 1 dakika

    // Ek: Her 30 saniyede bir hafif aktivite (bazı siteler daha kısa timeout kullanır)
    setInterval(() => {
        if (views.size === 0) return;
        views.forEach((viewData) => {
            viewData.view.webContents.executeJavaScript(`
                document.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true, clientX: Math.random() * 100, clientY: Math.random() * 100
                }));
                window.dispatchEvent(new Event('focus'));
            `).catch(() => { });
        });
    }, 30 * 1000); // 30 saniye

    // Ek: Network activity simulation - her 2 dakikada bir (cookie refresh için)
    setInterval(() => {
        if (views.size === 0) return;
        console.log(`[ANTI-IDLE] Triggering session refresh...`);
        views.forEach((viewData) => {
            viewData.view.webContents.executeJavaScript(`
                (function() {
                    // Trigger any heartbeat mechanisms the site might have
                    if (typeof window.onbeforeunload === 'function') {
                        // Site has unload handler, likely has session management
                    }
                    // Force cookie access to refresh timestamps
                    document.cookie;
                    // Touch localStorage to trigger any watchers
                    try {
                        const dummy = localStorage.getItem('__antiIdlePing');
                        localStorage.setItem('__antiIdlePing', Date.now().toString());
                    } catch(e) {}
                    console.log('[ANTI-IDLE] Session refresh at ' + new Date().toLocaleTimeString());
                })();
            `).catch(() => { });
        });
    }, 2 * 60 * 1000); // 2 dakika

    // Ek: Her 10 dakikada bir /casino path'ine gidip geri dön (gerçek navigasyon ile anti-idle)
    setInterval(() => {
        if (views.size === 0) return;
        console.log(`[ANTI-IDLE] Triggering page navigation anti-idle on ${views.size} views...`);

        views.forEach((viewData, viewId) => {
            const currentUrl = viewData.view.webContents.getURL();

            try {
                const urlObj = new URL(currentUrl);
                const originalPath = urlObj.pathname;

                // /casino path'ine git
                urlObj.pathname = '/casino';
                const casinoUrl = urlObj.toString();

                console.log(`[ANTI-IDLE] View ${viewId}: Navigating from ${currentUrl} to ${casinoUrl}`);
                viewData.view.webContents.loadURL(casinoUrl);

                // 5 saniye sonra eski URL'e geri dön
                setTimeout(() => {
                    console.log(`[ANTI-IDLE] View ${viewId}: Returning to original URL: ${currentUrl}`);
                    viewData.view.webContents.loadURL(currentUrl);
                }, 5000);

            } catch (err) {
                console.log(`[ANTI-IDLE] Could not parse URL for view ${viewId}:`, err.message);
            }
        });
    }, 10 * 60 * 1000); // 10 dakika
}

function createBrowserTab(url, category = 'jojobet') {
    const id = Date.now().toString();
    const partition = `persist:account_${id}`;

    // Legacy mapping for UI compatibility
    const colorCategory = SITE_CATEGORIES[category] || 'blue';

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });

    // Start off-screen until renderer calculates correct position
    view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });

    // Store view data
    // Note: The old code didn't store 'userAgent' or use 'colorCategory' in the same way, 
    // but we need 'colorCategory' for the UI to work properly with the new renderer.
    views.set(id, { view, category, colorCategory });
    mainWindow.addBrowserView(view);
    view.webContents.loadURL(url);

    updateGridLayout();

    return { id, category, colorCategory };
}

function updateGridLayout() {
    // Legacy function - positions are now managed via update-view-bounds
}

console.log('[STARTUP] Waiting for app.whenReady...');

app.whenReady().then(() => {
    console.log('[STARTUP] App is ready.');

    // Initialize database
    if (db) {
        try {
            db.initDatabase();
            console.log('[APP] Database initialized');
        } catch (e) {
            console.error('[STARTUP] Database initialization failed:', e);
        }
    } else {
        console.error('[STARTUP] Database module not available, skipping initialization.');
    }

    createMainWindow();
    try {
        createTray();
    } catch (e) {
        console.log("Tray icon failed to load (check assets/icon.png path):", e.message);
    }
    startAntiIdle();

    // Start Telegram Bot after app is ready
    startTelegramBot().catch(err => console.error("Telegram Bot initialization failed:", err));

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
        else {
            if (mainWindow) mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Handle SSL certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.log(`Certificate error for ${url}: ${error}`);
    // If you want to automatically ignore these errors (use with caution):
    // event.preventDefault();
    // callback(true);
});

// IPC Handlers
ipcMain.on('new-tab', (event, url) => {
    const result = createBrowserTab(url);
    event.reply('tab-created', result.id);
});

// NEW: Create tab with category
ipcMain.on('new-tab-with-category', (event, { url, category }) => {
    const result = createBrowserTab(url, category);
    event.reply('tab-created-with-category', {
        id: result.id,
        category: result.category,
        colorCategory: result.colorCategory
    });
});

ipcMain.on('update-view-bounds', (event, boundsList) => {
    boundsList.forEach(({ id, bounds }) => {
        const viewData = views.get(id);
        if (viewData) {
            viewData.view.setBounds(bounds);
        }
    });
});

ipcMain.on('sync-value', (event, value) => {
    views.forEach((viewData) => {
        const script = `
            (function() {
                const inputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
                inputs.forEach(input => {
                    input.value = \`${value.replace(/`/g, '\\`')}\`;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            })();
        `;
        viewData.view.webContents.executeJavaScript(script).catch(console.error);
    });
});

ipcMain.on('global-click', (event) => {
    views.forEach((viewData) => {
        const script = `
            (function() {
                const btn = document.querySelector('.ComponentButton.InstanceActiveBonuses.Button');
                if (btn) {
                    btn.click();
                } else {
                    console.log('Button not found in this view');
                }
            })();
        `;
        viewData.view.webContents.executeJavaScript(script).catch(console.error);
    });
});

ipcMain.on('close-tab', (event, id) => {
    const viewData = views.get(id);
    if (viewData) {
        mainWindow.removeBrowserView(viewData.view);
        viewData.view.webContents.destroy();
        views.delete(id);
        updateGridLayout();
    }
});

// NEW: Navigate single view to new URL
ipcMain.on('navigate-view', (event, { id, url }) => {
    const viewData = views.get(id);
    if (viewData) {
        viewData.view.webContents.loadURL(url);
    }
});

// NEW: Navigate all views in a category to URL
ipcMain.on('navigate-category', (event, { category, url }) => {
    views.forEach((viewData, id) => {
        if (viewData.category === category) {
            viewData.view.webContents.loadURL(url);
        }
    });
});

// NEW: Set proxy list
ipcMain.on('set-proxy-list', (event, proxies) => {
    // proxies should be array of { host, port, username?, password? }
    PROXY_LIST = proxies;
    console.log(`[PROXY] Proxy list updated with ${proxies.length} proxies`);
});

// NEW: Get current view count and info
ipcMain.handle('get-view-info', () => {
    const info = [];
    views.forEach((viewData, id) => {
        info.push({
            id,
            category: viewData.category,
            userAgent: viewData.userAgent?.substring(0, 50) + '...'
        });
    });
    return info;
});
// --- USER CONFIGURATION ---
const apiId = 10637839; // Replace with your API ID (Integer)
const apiHash = 'c1a267916b74fe6ffe2d0d81b823acf2'; // Replace with your API Hash (String)
// ---------------------------

// --- Moved inside startTelegramBot for safety ---
let SESSION_FILE_PATH;
let stringSession;
let client;

// Helper for waiting for GUI input
let authResolver = null;
ipcMain.on('tg-auth-response', (event, value) => {
    if (authResolver) {
        authResolver(value);
        authResolver = null;
    }
});

async function getGUIInput(type) {
    return new Promise((resolve) => {
        authResolver = resolve;
        if (mainWindow) {
            mainWindow.webContents.send('tg-auth-request', type);
        }
    });
}

// --- Message Processing Logic (Refactored for reuse) ---
async function processMessage(message) {
    if (!message) return;

    try {
        const text = message.message || "";
        const entities = message.entities || [];

        // --- Peer Identification (Logging Only) ---
        let chat = null;
        let chatId = "unknown";
        let chatTitle = "unknown";

        try {
            // This might fail or hang if cache is missing
            chat = await message.getChat();
            chatId = chat ? (chat.id ? chat.id.toString() : "") : "unknown";
            chatTitle = chat ? (chat.title || "") : "unknown";
        } catch (chatErr) {
            // console.log("[TG DEBUG] Could not resolve chat entity:", chatErr.message);
        }

        const upperText = text.toUpperCase();
        // Log only if it matches keywords to reduce noise
        if (upperText.includes('MAT') || upperText.includes('JOJO')) {
            console.log(`[TG MSG] MATCHED in: "${chatTitle}" [ID: ${chatId}]. Text: ${text.substring(0, 50)}...`);

            let extractedText = text;

            const codeEntity = entities.find(e =>
                e.className === 'MessageEntityCode' ||
                e.className === 'MessageEntityPre' ||
                (e.constructor && (e.constructor.name === 'MessageEntityCode' || e.constructor.name === 'MessageEntityPre'))
            );

            if (codeEntity) {
                extractedText = text.substring(codeEntity.offset, codeEntity.offset + codeEntity.length);
                console.log(`Extracted monospaced text: ${extractedText}`);
            }

            if (mainWindow) {
                mainWindow.webContents.send('telegram-message', extractedText);
            }
        }
    } catch (err) {
        console.error("Error in processMessage:", err);
    }
}

async function startTelegramBot() {
    // Load Telegram modules with a small delay to ensure main window is ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('[TELEGRAM] Loading Telegram modules...');
    try {
        const tg = require('telegram');
        const tgSessions = require('telegram/sessions');
        const tgEvents = require('telegram/events');

        TelegramClient = tg.TelegramClient;
        Api = tg.Api;
        StringSession = tgSessions.StringSession;
        NewMessage = tgEvents.NewMessage;
        console.log('[TELEGRAM] Telegram modules loaded successfully.');
    } catch (e) {
        console.error('[TELEGRAM] Failed to load Telegram modules:', e);
        return;
    }

    SESSION_FILE_PATH = path.join(app.getPath('userData'), 'telegram_session.txt');

    let sessionString = "";
    if (fs.existsSync(SESSION_FILE_PATH)) {
        sessionString = fs.readFileSync(SESSION_FILE_PATH, 'utf8').trim();
        console.log("Existing session found and loaded.");
    }

    const localStringSession = new StringSession(sessionString);

    try {
        console.log("Loading Telegram client...");
        client = new TelegramClient(localStringSession, apiId, apiHash, {
            connectionRetries: 5,
        });

        await client.start({
            phoneNumber: async () => await getGUIInput('phoneNumber'),
            password: async () => await getGUIInput('password'),
            phoneCode: async () => await getGUIInput('phoneCode'),
            onError: (err) => console.log(err),
        });

        console.log("Telegram client connected!");

        console.log("Fetching dialogs to populate entity cache...");
        const dialogs = await client.getDialogs({});
        console.log(`Entity cache populated with ${dialogs.length} chats.`);

        const savedSession = client.session.save();
        fs.writeFileSync(SESSION_FILE_PATH, savedSession, 'utf8');
        console.log("Session saved to file.");

        // --- POLLING MECHANISM FOR PROBLEMATIC CHANNELS ---
        const TARGET_CHANNEL_IDS = [
            '-1001904588149', // BONUS UZMANI...

        ];

        console.log(`Starting active polling for ${TARGET_CHANNEL_IDS.length} channels...`);

        let lastMessageIds = new Map(); // Store last processed msg ID to avoid duplicates

        // Serialized Polling Loop to prevent FloodWait
        const DELAY_BETWEEN = 4000; // 4 seconds between requests
        (async () => {
            while (true) {
                for (const channelId of TARGET_CHANNEL_IDS) {
                    try {
                        const messages = await client.getMessages(channelId, { limit: 1 });
                        if (messages && messages.length > 0) {
                            const msg = messages[0];
                            if (!lastMessageIds.has(channelId) || lastMessageIds.get(channelId) !== msg.id) {
                                const now = Math.floor(Date.now() / 1000);
                                if (now - msg.date < 60) {
                                    // LOG CONTENT AS REQUESTED
                                    const preview = msg.message ? msg.message.substring(0, 50).replace(/\n/g, ' ') : "No text";
                                    console.log(`[POLLING] New message in ${channelId}: "${preview}..."`);
                                    processMessage(msg);
                                }
                                lastMessageIds.set(channelId, msg.id);
                            }
                        }
                    } catch (e) {
                        if (e.seconds) {
                            console.log(`[POLLING] Rate limit hit. Waiting ${e.seconds}s...`);
                            await new Promise(r => setTimeout(r, (e.seconds + 1) * 1000));
                        }
                    }
                    // Wait between requests to ensure we don't spam
                    await new Promise(r => setTimeout(r, DELAY_BETWEEN));
                }
            }
        })();
        // --------------------------------------------------

        // We listen to all messages and filter manually inside to avoid ResolveUsername errors
        client.addEventHandler(async (event) => {
            try {
                // Also use standard event listener as fallback/primary for other channels
                if (event.message) {
                    processMessage(event.message);
                }
            } catch (err) {
                console.error("Error in message handler:", err);
            }
        }, new NewMessage());

    } catch (err) {
        console.error("Failed to start Telegram client:", err);
        throw err;
    }
}

ipcMain.on('switch-tab', (event, id) => {
    // In grid mode, we don't switch, but we could highlight the selected one
});

// ============================================
// ACCOUNT MANAGEMENT IPC HANDLERS
// ============================================

ipcMain.handle('add-account', async (event, { site, username, password }) => {
    try {
        const id = db.addAccount(site, username, password);
        return { success: true, id };
    } catch (err) {
        console.error('[IPC] add-account error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-accounts', async (event, site) => {
    try {
        const accounts = db.getAccountsBySite(site);
        return { success: true, accounts };
    } catch (err) {
        console.error('[IPC] get-accounts error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-all-accounts', async () => {
    try {
        const accounts = db.getAllAccounts();
        return { success: true, accounts };
    } catch (err) {
        console.error('[IPC] get-all-accounts error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-account', async (event, id) => {
    try {
        const success = db.deleteAccount(id);
        return { success };
    } catch (err) {
        console.error('[IPC] delete-account error:', err);
        return { success: false, error: err.message };
    }
});

// ============================================
// GMAIL CONFIG IPC HANDLERS
// ============================================

ipcMain.handle('set-gmail-config', async (event, { email, appPassword }) => {
    try {
        db.setGmailConfig(email, appPassword);
        return { success: true };
    } catch (err) {
        console.error('[IPC] set-gmail-config error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-gmail-config', async () => {
    try {
        const config = db.getGmailConfig();
        return { success: true, config };
    } catch (err) {
        console.error('[IPC] get-gmail-config error:', err);
        return { success: false, error: err.message };
    }
});

// ============================================
// AUTO-LOGIN FUNCTIONALITY
// ============================================

async function performAutoLogin(viewId, account) {
    const viewData = views.get(viewId);
    if (!viewData) {
        console.error(`[AUTO-LOGIN] View ${viewId} not found`);
        return { success: false, error: 'View not found' };
    }

    const webContents = viewData.view.webContents;

    const sendStatus = (status, message) => {
        if (mainWindow) {
            mainWindow.webContents.send('auto-login-status', { viewId, status, message });
        }
    };

    try {
        sendStatus('started', `Giriş başlatılıyor: ${account.username}`);

        // Step 1: Click login button
        sendStatus('step', 'Login butonuna tıklanıyor...');
        await webContents.executeJavaScript(`
            (function() {
                const loginBtn = document.querySelector('.ButtonLogin .AnchorText, .ButtonLogin, [class*="login"], a[href*="login"]');
                if (loginBtn) {
                    loginBtn.click();
                    return true;
                }
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 2000));

        // Step 2: Enter username
        sendStatus('step', 'Kullanıcı adı giriliyor...');
        await webContents.executeJavaScript(`
            (function() {
                const usernameInput = document.querySelector('.cs-user-Id, input[name="username"], input[type="text"][placeholder*="kullanıcı"]');
                if (usernameInput) {
                    usernameInput.value = '${account.username}';
                    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 500));

        // Step 3: Enter password
        sendStatus('step', 'Şifre giriliyor...');
        await webContents.executeJavaScript(`
            (function() {
                const passwordInput = document.querySelector('.cs-password, input[type="password"]');
                if (passwordInput) {
                    passwordInput.value = '${account.password}';
                    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 500));

        // NEW STEP ORDER: Click "Giriş Yap" (Submit) button immediately after password
        sendStatus('step', 'Giriş yapılıyor (2FA ekranı bekleniyor)...');
        await webContents.executeJavaScript(`
            (function() {
                console.log('[AUTO-LOGIN] Looking for submit button...');
                
                // Specific ID provided by user
                const specificBtn = document.getElementById('LoginButton-Url');
                if (specificBtn) {
                     console.log('[AUTO-LOGIN] Clicking specific button #LoginButton-Url:', specificBtn);
                     specificBtn.click();
                     return true;
                }

                // Try various submit button selectors
                let submitBtn = document.getElementById('LoginButton-Url') || 
                               document.querySelector('button[type="submit"], .btn-login, .login-btn, input[type="submit"], .ButtonLogin, [id*="LoginButton"]');
                
                if (!submitBtn) {
                    // Search by text content as fallback
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                    submitBtn = buttons.find(b => b.innerText.includes('Giriş') || b.value?.includes('Giriş'));
                }

                if (submitBtn) {
                    console.log('[AUTO-LOGIN] Clicking submit button:', submitBtn);
                    submitBtn.click();
                    return true;
                }
                
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 4000)); // Wait for 2FA screen to load

        // Step 4: Click "E-posta kodu" button (Find by text content)
        sendStatus('step', 'E-posta seçeneği aranıyor...');
        await webContents.executeJavaScript(`
            (function() {
                // Find all RadioBtn elements
                const radios = document.querySelectorAll('.RadioBtn');
                for (const radio of radios) {
                    if (radio.innerText.includes('E-posta') || radio.innerText.includes('E-Posta') || radio.innerText.includes('Email')) {
                        console.log('[AUTO-LOGIN] Found Email radio button:', radio);
                        radio.click();
                        return true;
                    }
                }
                
                // Fallback: Click the second radio button if 2 exist (usually SMS is first, Email second)
                if (radios.length >= 2) {
                    console.log('[AUTO-LOGIN] Clicking second radio button as fallback');
                    radios[1].click();
                    return true;
                }
                
                console.log('[AUTO-LOGIN] No radio buttons found (Maybe already on code screen?)');
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 1000));

        // NEW STEP: Click "E-posta kodu gönder" (TwoFaSendCodeBtn)
        sendStatus('step', 'Kod gönder butonuna tıklanıyor...');
        await webContents.executeJavaScript(`
            (function() {
                const sendBtn = document.querySelector('.TwoFaSendCodeBtn');
                if (sendBtn) {
                    console.log('[AUTO-LOGIN] Clicking TwoFaSendCodeBtn:', sendBtn);
                    sendBtn.click();
                    return true;
                }
                console.log('[AUTO-LOGIN] TwoFaSendCodeBtn not found');
                return false;
            })();
        `);

        await new Promise(r => setTimeout(r, 3000)); // Wait for code to be sent/page update

        // Step 5: Wait for email code from Gmail
        sendStatus('step', 'Gmail\'den kod bekleniyor...');
        const gmailConfig = db.getGmailConfig();
        if (!gmailConfig) {
            sendStatus('error', 'Gmail ayarları bulunamadı!');
            return { success: false, error: 'Gmail config not found' };
        }

        const code = await gmail.waitForVerificationCode(
            gmailConfig.email,
            gmailConfig.app_password,
            30, // max attempts
            2000 // interval ms
        );

        if (!code) {
            sendStatus('error', 'Doğrulama kodu alınamadı!');
            return { success: false, error: 'Verification code not received' };
        }

        sendStatus('step', `Kod alındı: ${code} `);

        // Step 6: Enter verification code (Simulate Typing)
        sendStatus('step', 'Kod giriliyor (Tek tek yazılıyor)...');
        // Step 6: Enter verification code (Simulate Typing)
        sendStatus('step', 'Kod giriliyor (Tek tek yazılıyor)...');
        await webContents.executeJavaScript(`
            (function() {
                // User provided specific classes: CodeInput cs-sms-otp
                const codeInput = document.querySelector('.CodeInput, .cs-sms-otp, input[name="code"], input[type="text"][placeholder*="kod"]');
                if (codeInput) {
                    console.log('[AUTO-LOGIN] Found code input:', codeInput);
                    codeInput.focus();
                    const code = '${code}';
                    
                    // Clear existing
                    codeInput.value = '';
                    
                    // Simulate typing
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    
                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(codeInput, code);
                    } else {
                        codeInput.value = code;
                    }
                    
                    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    codeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Also try dispatching key events for safety
                    const keyEvent = new KeyboardEvent('keyup', {
                        bubbles: true, cancelable: true, key: code[code.length-1], char: code[code.length-1]
                    });
                    codeInput.dispatchEvent(keyEvent);
                    
                    return true;
                }
                console.log('[AUTO-LOGIN] Code input NOT found');
                return false;
            })();
        `);
        await new Promise(r => setTimeout(r, 500));

        // Step 7: Click verify button
        sendStatus('step', 'Doğrula butonuna tıklanıyor...');
        await webContents.executeJavaScript(`
            (function () {
                console.log('[AUTO-LOGIN] Attempting to click verify button...');
                
                // User provided specific class: TwoFaValidateBtn
                let verifyBtn = document.querySelector('.TwoFaValidateBtn');
                
                if (!verifyBtn) {
                    // Try other common selectors
                    verifyBtn = document.querySelector('button[type="submit"], .verify-btn, .btn-verify, .TwoFaSubmitBtn');
                }
                
                if (!verifyBtn) {
                    // Search by text content (Doğrula / Onayla)
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                    verifyBtn = buttons.find(b => {
                        const txt = (b.innerText || b.value || "").toLowerCase();
                        return txt.includes('doğrula') || txt.includes('onayla') || txt.includes('verify') || txt.includes('confirm');
                    });
                }
                
                if (verifyBtn) {
                    console.log('[AUTO-LOGIN] Found verify button:', verifyBtn);
                    verifyBtn.scrollIntoView();
                    verifyBtn.click();
                    return true;
                }
                
                // Final fallback: click any submit button in the active form
                const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) {
                    console.log('[AUTO-LOGIN] Falling back to generic submit button');
                    submitBtn.click();
                    return true;
                }
                
                console.log('[AUTO-LOGIN] Verify button NOT found in any form');
                return false;
            })();
        `);

        sendStatus('success', 'Giriş tamamlandı!');
        return { success: true };

    } catch (err) {
        console.error(`[AUTO - LOGIN] Error for view ${viewId}: `, err);
        sendStatus('error', `Hata: ${err.message} `);
        return { success: false, error: err.message };
    }
}

// Lock to prevent concurrent auto-login triggers for the same category
const autoLoginLocks = new Set();

ipcMain.on('trigger-auto-login', async (event, category) => {
    if (autoLoginLocks.has(category)) {
        console.log(`[AUTO-LOGIN] Already running for category ${category}. Ignoring.`);
        return;
    }

    autoLoginLocks.add(category);
    console.log(`[AUTO-LOGIN] Triggered sequentially for category: ${category}`);

    try {
        // Get accounts for this category (site)
        const accounts = db.getAccountsBySite(category);
        console.log(`[AUTO-LOGIN] Found ${accounts.length} accounts for ${category}`);

        if (accounts.length === 0) {
            if (mainWindow) {
                mainWindow.webContents.send('auto-login-status', {
                    status: 'error',
                    message: `${category} için kayıtlı hesap bulunamadı!`
                });
            }
            return;
        }

        // Get views for this category
        const categoryViews = [];
        views.forEach((viewData, viewId) => {
            // Map site names to color categories
            const colorCategory = SITE_CATEGORIES[category] || category;
            if (viewData.category === colorCategory || viewData.category === category) {
                categoryViews.push({ viewId, viewData });
            }
        });

        console.log(`[AUTO-LOGIN] Found ${categoryViews.length} views for category ${category}. Processing sequentially.`);

        if (categoryViews.length === 0) {
            if (mainWindow) {
                mainWindow.webContents.send('auto-login-status', {
                    status: 'error',
                    message: `${category} kategorisinde açık sayfa yok!`
                });
            }
            return;
        }

        // Assign accounts to views and log in SEQUENTIALLY
        const numToProcess = Math.min(categoryViews.length, accounts.length);
        for (let i = 0; i < numToProcess; i++) {
            const { viewId } = categoryViews[i];
            const account = accounts[i];

            viewAccountMap.set(viewId, account.id);
            console.log(`[AUTO-LOGIN] Starting login ${i + 1}/${numToProcess}: Account ${account.username} on view ${viewId}`);

            // Perform login one by one to avoid Gmail 2FA conflicts
            await performAutoLogin(viewId, account);

            console.log(`[AUTO-LOGIN] Finished login ${i + 1}/${numToProcess} for account ${account.username}`);

            // Optional: small delay between accounts to let things settle
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) {
        console.error('[AUTO-LOGIN] Trigger error:', err);
    } finally {
        autoLoginLocks.delete(category);
    }
});
