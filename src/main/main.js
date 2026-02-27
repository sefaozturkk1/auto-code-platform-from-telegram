console.log('[STARTUP] Application starting...');

const { app, BrowserWindow, BrowserView, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Telegram modules - will be loaded inside startTelegramBot after app is ready
let TelegramClient, Api, StringSession, NewMessage, EditedMessage;

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
// Active account sessions tracking (persists while program runs)
const activeAccountSessions = new Map(); // accountId -> viewId
// Views currently performing auto-login (to pause anti-idle)
const viewsInAutoLogin = new Set(); // viewId

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

let PROXY_LIST = [];
let proxyIndex = 0;

// Read local proxies from file
function loadProxiesFromFile() {
    try {
        const proxyFilePath = path.join(app.getPath('userData'), 'proxies.txt');
        if (fs.existsSync(proxyFilePath)) {
            const lines = fs.readFileSync(proxyFilePath, 'utf8').split('\n');
            const newProxies = [];
            for (const line of lines) {
                const trimmed = line.trim();
                // Expected format: IP:PORT:USER:PASS or IP:PORT
                if (trimmed && !trimmed.startsWith('#')) {
                    const parts = trimmed.split(':');
                    if (parts.length >= 2) {
                        newProxies.push({
                            host: parts[0],
                            port: parseInt(parts[1], 10),
                            username: parts[2] || undefined,
                            password: parts[3] || undefined
                        });
                    }
                }
            }
            PROXY_LIST = newProxies;
            console.log(`[PROXY] Loaded ${PROXY_LIST.length} proxies from proxies.txt`);
        } else {
            // Create a template file if it doesn't exist
            fs.writeFileSync(proxyFilePath, '# Add your proxies here (One per line)\n# Format: IP:PORT:USERNAME:PASSWORD\n# Example: 192.168.1.1:8080:user1:pass123\n');
            console.log(`[PROXY] Created template proxies.txt at ${proxyFilePath}`);
        }
    } catch (err) {
        console.error('[PROXY] Error loading proxies from file', err);
    }
}

// Map of accountId to proxy index
const accountProxyMap = new Map();

function getProxyForAccount(accountId, accountIndexInSite) {
    if (PROXY_LIST.length === 0) return null;

    // As per user rule: every 5 accounts gets same proxy, across sites. 
    // Jojobet 1-5 = proxy 0, Matbet 1-5 = proxy 0
    const proxyGroupIndex = Math.floor(accountIndexInSite / 5);
    const proxyObject = PROXY_LIST[proxyGroupIndex % PROXY_LIST.length];

    return proxyObject;
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

    // Open DevTools to catch UI crash explicitly
    mainWindow.webContents.openDevTools();

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
            // Skip views that are currently performing auto-login
            if (viewsInAutoLogin.has(viewId)) {
                console.log(`[ANTI-IDLE] Skipping view ${viewId} (Auto-Login in progress)`);
                return;
            }

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

function createBrowserTab(url, category = 'jojobet', accountId = null, accountIndexInSite = 0) {
    const id = Date.now().toString();

    // Assign proxy and partition based on account index instead of random
    let partition = `persist:account_${id}`;
    let proxyRules = null;

    if (accountId !== null) {
        const proxyDetails = getProxyForAccount(accountId, accountIndexInSite);
        if (proxyDetails) {
            const proxyGroupIndex = Math.floor(accountIndexInSite / 5);
            partition = `persist:proxy_group_${proxyGroupIndex}_${category}`;
            proxyRules = `http=${proxyDetails.host}:${proxyDetails.port};https=${proxyDetails.host}:${proxyDetails.port}`;
            console.log(`[PROXY ASSIGN] Account ${accountId} (Index ${accountIndexInSite}) assigned to Proxy Group ${proxyGroupIndex} -> ${proxyDetails.host}:${proxyDetails.port}`);
        }
    }

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

    if (proxyRules) {
        const session = view.webContents.session;
        session.setProxy({ proxyRules }).then(() => {
            console.log(`[SESSION] Proxy rules applied to partition -> ${partition}`);
        });
    }

    // Start off-screen until renderer calculates correct position
    view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });



    // Hide webdriver property for stealth (lighter version than full UA spoofing)
    view.webContents.on('dom-ready', async () => {
        await view.webContents.executeJavaScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        `).catch(() => { });
    });

    // Store view data
    views.set(id, { view, category, colorCategory, accountId });
    if (accountId !== null) {
        viewAccountMap.set(id, accountId);
        activeAccountSessions.set(accountId, id);
    }

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

    // Load Proxies
    loadProxiesFromFile();

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

    // --- Bonus Detection System ---
    // 15-minute scanner to detect bonuses and flag accounts
    function startBonusScanner() {
        console.log('[BONUS-SCANNER] Starting 15-minute bonus detection scanner...');

        setInterval(async () => {
            console.log('[BONUS-SCANNER] Checking all views for bonuses...');

            for (const [viewId, viewData] of views) {
                try {
                    const hasBonus = await viewData.view.webContents.executeJavaScript(`
                        (function() {
                            const bonusElement = document.querySelector('ul.BonusDetailsInfo');
                            return bonusElement !== null;
                        })();
                    `);

                    if (hasBonus) {
                        const accountId = viewAccountMap.get(viewId);
                        if (accountId) {
                            console.log(`[BONUS-SCANNER] ⚠️ Bonus detected for account ${accountId}! Setting flag...`);
                            if (db && db.setBonusFlag) {
                                db.setBonusFlag(accountId);
                                console.log(`[BONUS-SCANNER] ✅ Account ${accountId} flagged successfully`);

                                // TELEGRAM NOTIFICATION
                                try {
                                    if (client) {
                                        // Fetch account details to get username
                                        // Since we don't have getAccountById, we filter from getAllAccounts
                                        // Ideally we should cache accounts or add getAccountById but this is fine for infrequent scanner
                                        const allAccounts = db.getAllAccounts();
                                        const account = allAccounts.find(a => a.id === accountId);
                                        const username = account ? account.username : `ID: ${accountId}`;

                                        const telegramChatId = '5271912466';
                                        const bonusMsg = `⚠️ **Bonus/Çevrim Tespit Edildi (Otomatik Tarama)**\n\n` +
                                            `👤 Kullanıcı: ${username}\n` +
                                            `🚫 Durum: Bonus flagged olarak işaretlendi.\n` +
                                            `🔍 Kaynak: .BonusDetailsInfo elementi tespit edildi.`;

                                        await client.sendMessage(telegramChatId, { message: bonusMsg });
                                        console.log('[BONUS-SCANNER] Telegram notification sent.');
                                    }
                                } catch (tgErr) {
                                    console.warn('[BONUS-SCANNER] Failed to send Telegram notification:', tgErr.message);
                                }
                            }
                        }
                    }
                } catch (error) {
                    // Silently skip views that are closed or not ready
                    if (!error.message.includes('destroyed')) {
                        console.log(`[BONUS-SCANNER] Error scanning view ${viewId}:`, error.message);
                    }
                }
            }
        }, 15 * 60 * 1000); // Every 15 minutes
    }

    // Daily reset logic: Auto-clear flags older than the most recent 03:00 AM
    function performStartupFlagCleanup() {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setHours(3, 0, 0, 0);

        // If it's before 03:00 AM, the last reset point was yesterday 03:00 AM
        if (now < cutoff) {
            cutoff.setDate(cutoff.getDate() - 1);
        }

        console.log(`[BONUS-RESET] Startup cleanup: Clearing flags older than ${cutoff.toLocaleString()}`);
        if (db && db.clearOldBonusFlags) {
            db.clearOldBonusFlags(cutoff.getTime());
        }
    }

    // Schedule next daily reset at 03:00
    function scheduleDailyReset() {
        const now = new Date();
        const next3AM = new Date();
        next3AM.setHours(3, 0, 0, 0);

        if (now > next3AM) {
            next3AM.setDate(next3AM.getDate() + 1); // Tomorrow at 03:00
        }

        const msUntil3AM = next3AM - now;
        const hoursUntil = Math.floor(msUntil3AM / (1000 * 60 * 60));

        console.log(`[BONUS-RESET] Next active reset scheduled in ${hoursUntil} hours at 03:00`);

        setTimeout(() => {
            console.log('[BONUS-RESET] 🔄 Resetting all bonus flags at 03:00...');
            if (db && db.clearAllBonusFlags) {
                const cleared = db.clearAllBonusFlags();
                console.log(`[BONUS-RESET] ✅ Reset complete! ${cleared} accounts cleared.`);
            }
            scheduleDailyReset(); // Schedule next reset for tomorrow
        }, msUntil3AM);
    }

    // Start bonus systems
    performStartupFlagCleanup(); // Run immediately on successful startup
    startBonusScanner();
    scheduleDailyReset();

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

ipcMain.on('sync-value', (event, { value, category }) => {
    console.log(`[SYNC-VALUE] Received value for category: "${category}"`);
    views.forEach((viewData, viewId) => {
        console.log(`[SYNC-VALUE] View ${viewId}: category="${viewData.category}" colorCategory="${viewData.colorCategory}" | match=${viewData.category === category}`);
        // If category is specified, only sync to views with matching category
        if (category && viewData.category !== category) {
            return;
        }

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

ipcMain.on('global-click', (event, category) => {
    console.log(`[GLOBAL-CLICK] Received click for category: "${category}"`);
    views.forEach((viewData, viewId) => {
        console.log(`[GLOBAL-CLICK] View ${viewId}: category="${viewData.category}" | match=${viewData.category === category}`);
        if (category && viewData.category !== category) {
            return;
        }
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
        // Free up the account associated with this view
        const accountId = viewAccountMap.get(id);
        if (accountId) {
            activeAccountSessions.delete(accountId);
            viewAccountMap.delete(id);
            console.log(`[SESSION] Freed account ${accountId} from closed view ${id}`);
        }

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

// --- Active Code Tracking (for edit support) ---
// Maps messageId -> { category, text } so edits can replace old codes
const activeCodeMap = new Map();

// --- Message Processing Logic (Refactored for reuse) ---
async function processMessage(message, isEdit = false) {
    if (!message) return;

    try {
        const text = message.message || "";
        const entities = message.entities || [];
        const messageId = message.id;

        const upperText = text.toUpperCase();
        let detectedCategory = null;

        if (upperText.includes('JOJO')) {
            detectedCategory = 'jojobet';
        } else if (upperText.includes('MAT')) {
            detectedCategory = 'matbet';
        }

        if (!detectedCategory) return;

        console.log(`[TG MSG] ${isEdit ? 'EDITED' : 'NEW'} MATCHED (${detectedCategory}). Text: ${text.substring(0, 80)}...`);

        // Monospaced text ZORUNLU - backtick ile yazılmış kısım yoksa pas geç
        const codeEntity = entities.find(e =>
            e.className === 'MessageEntityCode' ||
            e.className === 'MessageEntityPre' ||
            (e.constructor && (e.constructor.name === 'MessageEntityCode' || e.constructor.name === 'MessageEntityPre'))
        );

        if (!codeEntity) {
            console.log(`[TG MSG] No monospaced text found, SKIPPING message ${messageId}.`);
            return;
        }

        const extractedText = text.substring(codeEntity.offset, codeEntity.offset + codeEntity.length);
        console.log(`[TG MSG] Extracted monospaced text: "${extractedText}" (msgId: ${messageId})`);

        // If this is an edit, log the replacement
        if (isEdit && activeCodeMap.has(messageId)) {
            const oldData = activeCodeMap.get(messageId);
            console.log(`[TG EDIT] Replacing old code "${oldData.text}" with new code "${extractedText}" for ${detectedCategory}`);
        }

        // Track the active code for this message
        activeCodeMap.set(messageId, { category: detectedCategory, text: extractedText });

        // Clean up old entries (keep last 50)
        if (activeCodeMap.size > 50) {
            const firstKey = activeCodeMap.keys().next().value;
            activeCodeMap.delete(firstKey);
        }

        if (mainWindow) {
            mainWindow.webContents.send('telegram-message', { text: extractedText, category: detectedCategory, messageId, isEdit });
        }
    } catch (err) {
        console.error("Error in processMessage:", err);
    }
}

async function startTelegramBot() {
    // Load Telegram modules with a small delay to ensure main window is ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('[TELEGRAM] Loading Telegram modules...');
    let loaded = false;
    let retries = 0;
    while (!loaded && retries < 5) {
        try {
            const tg = require('telegram');
            const tgSessions = require('telegram/sessions');
            const tgEvents = require('telegram/events');
            const tgEditedMessage = require('telegram/events/EditedMessage');

            TelegramClient = tg.TelegramClient;
            Api = tg.Api;
            StringSession = tgSessions.StringSession;
            NewMessage = tgEvents.NewMessage;
            EditedMessage = tgEditedMessage.EditedMessage;
            console.log('[TELEGRAM] Telegram modules loaded successfully (including EditedMessage).');
            loaded = true;
        } catch (e) {
            retries++;
            if (e.code === 'EINTR' || (e.message && e.message.includes('EINTR'))) {
                console.log(`[TELEGRAM] Module load interrupted (EINTR). Retrying ${retries}/5...`);
                // Sleep sync
                const end = Date.now() + 500;
                while (Date.now() < end);
            } else {
                console.error('[TELEGRAM] Failed to load Telegram modules:', e);
                return;
            }
        }
    }
    if (!loaded) return;

    SESSION_FILE_PATH = path.join(app.getPath('userData'), 'telegram_session.txt');

    let sessionString = "";
    if (fs.existsSync(SESSION_FILE_PATH)) {
        let readRetries = 0;
        let readSuccess = false;
        while (!readSuccess && readRetries < 5) {
            try {
                sessionString = fs.readFileSync(SESSION_FILE_PATH, 'utf8').trim();
                readSuccess = true;
            } catch (err) {
                readRetries++;
                if (err.code === 'EINTR' || err.message.includes('EINTR')) {
                    const end = Date.now() + 100;
                    while (Date.now() < end);
                } else {
                    console.error('[TELEGRAM] Session read error:', err);
                    break;
                }
            }
        }
        if (readSuccess) console.log("Existing session found and loaded.");
    }

    const localStringSession = new StringSession(sessionString);

    try {
        console.log("Loading Telegram client...");
        client = new TelegramClient(localStringSession, apiId, apiHash, {
            connectionRetries: 50,
            retryDelay: 3000,
            timeout: 15000,
            autoReconnect: true,
            useWSS: true
        });

        await client.start({
            phoneNumber: async () => await getGUIInput('phoneNumber'),
            password: async () => await getGUIInput('password'),
            phoneCode: async () => await getGUIInput('phoneCode'),
            onError: (err) => console.log('[TELEGRAM ERROR]', err),
        });

        console.log("Telegram client connected!");

        // ── LOG ALL GROUPS/CHANNELS ──
        console.log('[TELEGRAM] ═══════════════════════════════════════');
        console.log('[TELEGRAM] Fetching ALL dialogs to log groups...');
        const dialogs = await client.getDialogs({});
        console.log(`[TELEGRAM] Total dialogs: ${dialogs.length}`);
        console.log('[TELEGRAM] ───────────────────────────────────────');

        let targetEntity = null;

        dialogs.forEach((dialog, idx) => {
            const title = dialog.title || dialog.name || 'N/A';
            const id = dialog.id ? dialog.id.toString() : 'N/A';
            const isGroup = dialog.isGroup || false;
            const isChannel = dialog.isChannel || false;
            const type = isChannel ? 'CHANNEL' : isGroup ? 'GROUP' : 'CHAT';
            console.log(`[TELEGRAM] [${idx}] ${type} | ID: ${id} | Title: "${title}"`);

            // Find the "bonus uzmanı" group (case-insensitive)
            if (title.toLowerCase().includes('bonus uzman')) {
                targetEntity = dialog;
                console.log(`[TELEGRAM] ★★★ TARGET GROUP FOUND: "${title}" (ID: ${id}) ★★★`);
            }
        });

        console.log('[TELEGRAM] ═══════════════════════════════════════');

        const savedSession = client.session.save();
        fs.writeFileSync(SESSION_FILE_PATH, savedSession, 'utf8');
        console.log("Session saved to file.");

        if (!targetEntity) {
            console.error('[TELEGRAM] ❌ Could not find group with "bonus uzmanı" in name! Polling will NOT start.');
            console.error('[TELEGRAM] Check the group list above and update the search term.');
            return;
        }

        // ── POLLING SETUP for target group ──
        const targetPeer = targetEntity.inputEntity;
        console.log(`[TELEGRAM] Starting polling for group: "${targetEntity.title}"`);

        // Track processed message IDs to avoid duplicates
        const processedMessageIds = new Set();
        let lastMaxId = 0;
        let consecutiveErrors = 0;
        let pollCount = 0;

        // ── 5-MINUTE STARTUP LOG ──
        const startupLogEnd = Date.now() + (5 * 60 * 1000); // 5 dakika
        console.log('[TG POLL] 5-minute startup logging active until', new Date(startupLogEnd).toLocaleTimeString());

        // Timeout wrapper - prevents getMessages from hanging forever
        function withTimeout(promise, ms) {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
            ]);
        }

        // Polling function with timeout and reconnection
        async function pollMessages() {
            pollCount++;

            // Heartbeat log every ~30 seconds (10 polls at 3s interval)
            if (pollCount % 10 === 0) {
                console.log(`[TG POLL] ♥ Heartbeat - poll #${pollCount}, errors: ${consecutiveErrors}, lastMaxId: ${lastMaxId}`);
            }

            // Check if client is still connected
            if (!client.connected) {
                console.warn('[TG POLL] Client disconnected! Attempting reconnect...');
                try {
                    await withTimeout(client.connect(), 15000);
                    console.log('[TG POLL] Reconnected successfully.');
                    consecutiveErrors = 0;
                } catch (reconErr) {
                    console.error('[TG POLL] Reconnect failed:', reconErr.message);
                    consecutiveErrors++;
                    return;
                }
            }

            try {
                // 15 second timeout on getMessages
                const messages = await withTimeout(
                    client.getMessages(targetPeer, {
                        limit: 10,
                        minId: lastMaxId
                    }),
                    15000
                );

                consecutiveErrors = 0; // Reset on success

                if (messages.length > 0) {
                    // Update lastMaxId to the highest message ID
                    const maxId = Math.max(...messages.map(m => m.id));
                    if (maxId > lastMaxId) lastMaxId = maxId;

                    for (const msg of messages) {
                        // 5-minute startup log
                        if (Date.now() < startupLogEnd) {
                            console.log(`[TG LOG] MsgID: ${msg.id} | Text: "${(msg.message || '').substring(0, 100)}" | Entities: ${JSON.stringify((msg.entities || []).map(e => e.className || e.constructor?.name))}`);
                        }

                        if (!processedMessageIds.has(msg.id)) {
                            processedMessageIds.add(msg.id);
                            await processMessage(msg, false);
                        }
                    }

                    // Keep processedMessageIds from growing forever (last 500)
                    if (processedMessageIds.size > 500) {
                        const arr = Array.from(processedMessageIds);
                        for (let i = 0; i < arr.length - 500; i++) {
                            processedMessageIds.delete(arr[i]);
                        }
                    }
                }
            } catch (pollErr) {
                consecutiveErrors++;
                console.error(`[TG POLL] Error #${consecutiveErrors}: ${pollErr.message}`);

                // After 5 consecutive errors, try to reconnect
                if (consecutiveErrors >= 5) {
                    console.warn('[TG POLL] Too many errors, forcing reconnect...');
                    try {
                        await client.disconnect();
                        await new Promise(r => setTimeout(r, 2000));
                        await withTimeout(client.connect(), 15000);
                        console.log('[TG POLL] Force reconnect successful.');
                        consecutiveErrors = 0;
                    } catch (reconErr) {
                        console.error('[TG POLL] Force reconnect failed:', reconErr.message);
                    }
                }
            }
        }

        // Initial poll to set lastMaxId (don't process old messages)
        try {
            const initMsgs = await client.getMessages(targetPeer, { limit: 1 });
            if (initMsgs.length > 0) {
                lastMaxId = initMsgs[0].id;
                console.log(`[TG POLL] Initial lastMaxId set to: ${lastMaxId}`);
            }
        } catch (initErr) {
            console.error('[TG POLL] Initial fetch error:', initErr.message);
        }

        // Start polling every 2 seconds
        setInterval(pollMessages, 2000);
        console.log('[TG POLL] Polling started (every 2 seconds) with timeout & auto-reconnect');

        // ── EDITED MESSAGE HANDLER ──
        // EditedMessage events work via the Telegram update stream (real-time)
        client.addEventHandler(async (event) => {
            try {
                if (event.message) {
                    const msg = event.message;
                    // Only process edits from our target group
                    const chatId = msg.chatId ? msg.chatId.toString() : '';
                    const targetId = targetEntity.id ? targetEntity.id.toString() : '';

                    if (chatId === targetId || chatId === '-' + targetId) {
                        console.log(`[TG EDIT] Message ${msg.id} was edited in target group`);
                        // Re-process as edit (will replace old code)
                        await processMessage(msg, true);
                    }
                }
            } catch (err) {
                console.error('[TG EDIT] Error in edit handler:', err);
            }
        }, new EditedMessage({}));
        console.log('[TG EDIT] EditedMessage handler registered.');

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
    if (!db) return { success: false, error: 'DB not available' };
    try {
        const id = db.addAccount(site, username, password);
        return { success: true, id };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-all-accounts', async () => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        const accounts = db.getAllAccounts();
        return { success: true, accounts };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-account', async (event, id) => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        db.deleteAccount(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-account-details', async (event, { id, site, username, password, bonusFlagged }) => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        db.updateAccount(id, site, username, password);
        db.updateBonusFlagValue(id, bonusFlagged);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-gmail-config', async () => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        const config = db.getGmailConfig();
        return { success: true, config };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('set-gmail-config', async (event, { email, appPassword }) => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        db.setGmailConfig(email, appPassword);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-site-settings', async (event, site) => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        const config = db.getSiteSettings(site);
        return { success: true, withdrawalAccount: config };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('set-site-settings', async (event, { site, withdrawalAccount }) => {
    if (!db) return { success: false, error: 'DB not available' };
    try {
        db.setSiteSettings(site, withdrawalAccount);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ============================================
// WITHDRAW LOGIC
// ============================================

async function performWithdraw(viewId, account, targetAccountName) {
    const viewData = views.get(viewId);
    if (!viewData) return { success: false, error: 'View not found' };

    const { view } = viewData;
    const webContents = view.webContents;

    // Fix: Define sendStatus locally as it is not global
    const sendStatus = (status, message) => {
        if (mainWindow) {
            mainWindow.webContents.send('auto-login-status', { viewId, status, message });
        }
    };

    try {
        console.log(`[WITHDRAW] Starting withdrawal for ${account.username} (View ${viewId})`);
        sendStatus('started', `${account.username} için çekim başlatılıyor...`);

        // Step 1: Navigate to /new-withdraw
        const currentUrl = webContents.getURL();
        const withdrawUrl = new URL('/new-withdraw', currentUrl).toString();
        await webContents.loadURL(withdrawUrl);

        // Wait for page load
        await new Promise(resolve => {
            const listener = () => {
                webContents.removeListener('did-finish-load', listener);
                resolve();
            };
            webContents.on('did-finish-load', listener);
            // Timeout 15s
            setTimeout(() => {
                webContents.removeListener('did-finish-load', listener);
                resolve();
            }, 15000);
        });

        await new Promise(r => setTimeout(r, 2000)); // Extra wait

        // Step 2: Click Pay Icon & Fill Form
        const formResult = await webContents.executeJavaScript(`
            (async () => {
                const TARGET_ACCOUNT_NAME = "${targetAccountName}";
                function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
                
                // 0. DIAGNOSTIC: Check for 403 or Error Page
                if (document.title.includes('403') || document.body.innerText.includes('Forbidden') || document.body.innerText.includes('Access Denied')) {
                    return { success: false, error: 'BLOCKED: 403 Forbidden detected. Title: ' + document.title };
                }

                // Helper: Recursive Shadow DOM Search
                function queryDeep(selector, root = document) {
                    if (!root) return null;
                    
                    // 1. Check in current root
                    const el = root.querySelector(selector);
                    if (el) return el;
                    
                    // 2. Recursive check in all shadow roots
                    // We must iterate all elements to find those with shadowRoot
                    const elements = root.querySelectorAll('*');
                    for (const element of elements) {
                        if (element.shadowRoot) {
                            const found = queryDeep(selector, element.shadowRoot);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                // Helper: Wait for element with robust polling (Deep Shadow DOM support)
                async function waitForElement(selector, timeout = 15000) {
                    const start = Date.now();
                    while (Date.now() - start < timeout) {
                        const el = queryDeep(selector);
                        if (el) return el;
                        
                        // Scroll to trigger lazy load
                        window.scrollBy(0, 100);
                        await sleep(500);
                    }
                    return null;
                }

                // 1. Click Pay Icon
                let payIcon = null;
                let payImg = null;

                // Search via Deep Query (Shadow DOM) using Alt Text
                payImg = await waitForElement('img[alt="Para Gönder"]');
                
                if (!payImg) {
                    // Fallback: Title or generic
                    payImg = await waitForElement('img[title*="Para Gönder"], img[alt*="Para Gönder"]');
                }
                
                if (payImg) {
                    // Traverse up to find the wrapper (Handles Shadow DOM context)
                    // Note: 'closest' works within the same shadow tree. 
                    // If wrapper is outside shadow root, we might need host, but usually wrapper is inside.
                    payIcon = payImg.closest('.SelectorWrapper') || payImg.closest('div.Checked') || payImg.parentElement.parentElement; 
                }

                if (!payIcon) {
                     // Debug: Get full HTML again
                     const bodyText = document.body.innerText.substring(0, 500); // Increased dump size
                     return { 
                        success: false, 
                        error: 'P2P icon not found after waiting. Title: ' + document.title + ' Body: ' + bodyText,
                        htmlDump: document.documentElement.outerHTML
                     };
                }
                
                // Scroll into view before clicking
                payIcon.scrollIntoView({ block: 'center' });
                await sleep(500);
                payIcon.click();
                await sleep(2000);

                // 2. Read Balance - Simple approach using queryDeep
                console.log('[WITHDRAW] Reading balance...');
                
                function parseBalance(text) {
                    if (!text) return NaN;
                    // Strip everything except digits, dots, and commas
                    var clean = '';
                    for (var i = 0; i < text.length; i++) {
                        var ch = text.charCodeAt(i);
                        // 0-9 = 48-57, dot = 46, comma = 44
                        if ((ch >= 48 && ch <= 57) || ch === 46 || ch === 44) {
                            clean += text[i];
                        }
                    }
                    if (!clean) return NaN;
                    // Turkish: dots are thousands, comma is decimal
                    // Remove dots first, then replace comma with dot
                    clean = clean.split('.').join('');
                    clean = clean.replace(',', '.');
                    return parseFloat(clean);
                }
                
                var balance = NaN;
                var rawAmountDebug = 'NOT_FOUND';
                
                // Try 1: queryDeep for FormattedAmount (works with Shadow DOM)
                var amountEl = queryDeep('span.FormattedAmount');
                if (amountEl) {
                    rawAmountDebug = amountEl.innerText || amountEl.textContent || '';
                    console.log('[WITHDRAW] Found FormattedAmount: "' + rawAmountDebug + '"');
                    balance = parseBalance(rawAmountDebug);
                    console.log('[WITHDRAW] Parsed: ' + balance);
                }
                
                // Try 2: If first span was 0 or NaN, try all FormattedAmount spans
                if (isNaN(balance) || balance === 0) {
                    var allAmounts = document.querySelectorAll('span.FormattedAmount');
                    console.log('[WITHDRAW] Trying all FormattedAmount spans: ' + allAmounts.length);
                    for (var i = 0; i < allAmounts.length; i++) {
                        var txt = (allAmounts[i].innerText || allAmounts[i].textContent || '').trim();
                        console.log('[WITHDRAW] Span[' + i + ']: "' + txt + '"');
                        var val = parseBalance(txt);
                        if (!isNaN(val) && val > 0) {
                            balance = val;
                            rawAmountDebug = txt;
                            break;
                        }
                    }
                }
                
                // Try 3: Search shadow DOMs manually
                if (isNaN(balance) || balance === 0) {
                    var hosts = document.querySelectorAll('*');
                    for (var i = 0; i < hosts.length; i++) {
                        if (hosts[i].shadowRoot) {
                            var shadowSpans = hosts[i].shadowRoot.querySelectorAll('span.FormattedAmount, .FormattedAmount');
                            for (var j = 0; j < shadowSpans.length; j++) {
                                var txt = (shadowSpans[j].innerText || shadowSpans[j].textContent || '').trim();
                                console.log('[WITHDRAW] Shadow span: "' + txt + '"');
                                var val = parseBalance(txt);
                                if (!isNaN(val) && val > 0) {
                                    balance = val;
                                    rawAmountDebug = txt;
                                    break;
                                }
                            }
                            if (!isNaN(balance) && balance > 0) break;
                        }
                    }
                }
                
                // Try 4: Last resort - scan body text for number pattern
                if (isNaN(balance) || balance === 0) {
                    var bodyText = document.body.innerText;
                    var match = bodyText.match(/([0-9][0-9.,]*[0-9])/);
                    if (match) {
                        rawAmountDebug = match[1];
                        balance = parseBalance(match[1]);
                        console.log('[WITHDRAW] Body scan fallback: "' + match[1] + '" -> ' + balance);
                    }
                }
                
                console.log('[WITHDRAW] FINAL balance: ' + balance + ' raw: "' + rawAmountDebug + '"');
                
                if (isNaN(balance)) return { success: false, error: 'Could not parse balance. Raw: "' + rawAmountDebug + '"' };
                
                // CHECK MIN BALANCE
                if (balance < 60) return { success: false, error: 'LOW_BALANCE', balance };
                
                const withdrawAmount = balance - 10;
                
                // 3. Fill Amount
                const amountInput = await waitForElement('input.FieldInput.Amount[type="number"]', 5000);
                if (!amountInput) return { success: false, error: 'Amount input not found', htmlDump: document.documentElement.outerHTML };
                
                // Convert to string with Turkish format (comma as decimal separator)
                const withdrawAmountStr = withdrawAmount.toFixed(2).replace('.', ',');
                
                // React/Angular often needs correct event dispatch
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(amountInput, withdrawAmountStr);
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
                amountInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                await sleep(500);

                // 4. Fill Account Name
                const nameInput = await waitForElement('input.FieldInput.Amount[type="text"]', 5000);
                if (!nameInput) return { success: false, error: 'Name input not found', htmlDump: document.documentElement.outerHTML };
                
                nativeInputValueSetter.call(nameInput, TARGET_ACCOUNT_NAME);
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                await sleep(500);

                // 5. Click Submit
                const submitBtn = await waitForElement('.PrimaryButton', 5000);
                if (!submitBtn) return { success: false, error: 'Submit button not found', htmlDump: document.documentElement.outerHTML };
                submitBtn.click();
                
                return { success: true, amount: withdrawAmount };
            })();
        `);

        if (!formResult.success) {
            if (formResult.error === 'LOW_BALANCE') {
                sendStatus('step', `Bakiye yetersiz (${formResult.balance} < 60). Geçiliyor...`);
                return { success: false, error: 'USER_SKIP' };
            }
            throw new Error(formResult.error);
        }

        sendStatus('step', `Form dolduruldu. Tutar: ${formResult.amount}. 2FA bekleniyor...`);
        await new Promise(r => setTimeout(r, 2000));

        // Step 3: Handle 2FA Selection
        const twoFaResult = await webContents.executeJavaScript(`
            (async () => {
                function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
                
                // ── Truly Recursive Deep Search ──
                // Enters every shadowRoot it finds (querySelectorAll-based, NOT TreeWalker)
                function findDeep(selector, root = document) {
                    try {
                        let el = root.querySelector(selector);
                        if (el) return el;
                    } catch(e) {}
                    
                    const allNodes = root.querySelectorAll('*');
                    for (const node of allNodes) {
                        if (node.shadowRoot) {
                            const found = findDeep(selector, node.shadowRoot);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                
                // ── Collect all shadow hosts for debug ──
                function collectShadowHosts(root = document, depth = 0, results = []) {
                    const allNodes = root.querySelectorAll('*');
                    for (const node of allNodes) {
                        if (node.shadowRoot) {
                            results.push({ tag: node.tagName.toLowerCase(), depth });
                            collectShadowHosts(node.shadowRoot, depth + 1, results);
                        }
                    }
                    return results;
                }
                
                // ── Wait helper with deep search ──
                async function waitDeep(selectorOrFn, timeout = 20000) {
                    const start = Date.now();
                    while (Date.now() - start < timeout) {
                        let el;
                        if (typeof selectorOrFn === 'function') {
                            el = selectorOrFn();
                        } else {
                            el = findDeep(selectorOrFn);
                        }
                        if (el) return el;
                        await sleep(500);
                    }
                    return null;
                }
                
                console.log('── 2FA Step: Starting email selection ──');
                
                // 1. Find "email" radio input (wait up to 20s)
                let radioInput = await waitDeep(() => {
                    let target = findDeep('input[type="radio"][value="email"]');
                    if (!target) target = findDeep('input[name="channel"][value="email"]');
                    return target;
                }, 20000);
                
                if (radioInput) {
                    console.log('✅ Found email radio input:', radioInput.tagName, radioInput.value);
                    
                    // Click the input itself
                    radioInput.click();
                    await sleep(300);
                    
                    // Click parent label if exists
                    const label = radioInput.closest('label');
                    if (label) {
                        console.log('  → Clicking parent label');
                        label.click();
                        await sleep(200);
                    }
                    
                    // Click .RadioIndicator sibling if exists
                    const prev = radioInput.previousElementSibling;
                    if (prev && prev.classList && prev.classList.contains('RadioIndicator')) {
                        console.log('  → Clicking RadioIndicator');
                        prev.click();
                        await sleep(200);
                    }
                } else {
                    console.warn('❌ Email radio NOT found after 20s.');
                    
                    // Debug: list all shadow hosts
                    const hosts = collectShadowHosts();
                    console.log('Shadow hosts found:', JSON.stringify(hosts));
                    
                    // Debug: find ALL radio inputs anywhere
                    const allRadios = [];
                    function findAllRadios(root = document) {
                        root.querySelectorAll('input[type="radio"]').forEach(r => {
                            allRadios.push({ name: r.name, value: r.value, id: r.id });
                        });
                        root.querySelectorAll('*').forEach(n => {
                            if (n.shadowRoot) findAllRadios(n.shadowRoot);
                        });
                    }
                    findAllRadios();
                    console.log('All radios in DOM:', JSON.stringify(allRadios));
                    
                    // Debug: find ALL buttons anywhere
                    const allButtons = [];
                    function findAllButtons(root = document) {
                        root.querySelectorAll('button').forEach(b => {
                            allButtons.push({ text: (b.textContent || '').trim().substring(0, 50), cls: b.className });
                        });
                        root.querySelectorAll('*').forEach(n => {
                            if (n.shadowRoot) findAllButtons(n.shadowRoot);
                        });
                    }
                    findAllButtons();
                    console.log('All buttons in DOM:', JSON.stringify(allButtons));
                    
                    return { success: false, error: '2FA email radio not found', debugHosts: hosts, debugRadios: allRadios, debugButtons: allButtons };
                }
                
                // 2. Click "Kodu Gönder" button
                // Wait 2s after radio click for possible re-render
                await sleep(2000);
                
                // Debug: What root is the radio in?
                if (radioInput) {
                    const rRoot = radioInput.getRootNode();
                    console.log('Radio root type:', rRoot.constructor.name, '| host:', rRoot.host ? rRoot.host.tagName : 'none');
                    
                    // Log all elements in radio's root
                    const allInRoot = rRoot.querySelectorAll('*');
                    console.log('Total elements in radio root:', allInRoot.length);
                    
                    // Log all buttons and clickable things
                    const btns = rRoot.querySelectorAll('button, [role="button"], .PrimaryBtn, .Btn');
                    console.log('Buttons in radio root:', btns.length);
                    btns.forEach((b, i) => {
                        console.log('  btn[' + i + ']:', b.tagName, '| class:', b.className, '| text:', (b.textContent||'').trim().substring(0, 30));
                    });
                }
                
                // Use the EXACT same findDeep + waitDeep pattern as the radio
                // The button class is OtpButton (confirmed from debug scan)
                let sendBtn = await waitDeep(() => {
                    let btn = findDeep('button.OtpButton');
                    if (!btn) btn = findDeep('.OtpButton');
                    return btn;
                }, 20000);
                
                if (sendBtn) {
                    const rect = sendBtn.getBoundingClientRect();
                    console.log('✅ Found Send button:', (sendBtn.textContent || '').trim(), '| tag:', sendBtn.tagName, '| class:', sendBtn.className, '| rect:', JSON.stringify({x: rect.x, y: rect.y, w: rect.width, h: rect.height}));
                    
                    // Scroll into view
                    sendBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                    await sleep(500);
                    
                    // Get coordinates AFTER scrolling
                    const r = sendBtn.getBoundingClientRect();
                    return { 
                        success: true, 
                        clickX: Math.round(r.x + r.width / 2), 
                        clickY: Math.round(r.y + r.height / 2),
                        text: (sendBtn.textContent || '').trim(),
                        tag: sendBtn.tagName,
                        cls: sendBtn.className
                    };
                } else {
                    console.warn('❌ Send Code button NOT found after 20s');
                    // Final debug: dump ALL buttons in ALL shadow roots
                    const allBtns = [];
                    function dumpButtons(root = document, depth = 0) {
                        root.querySelectorAll('button, [role="button"]').forEach(b => {
                            allBtns.push({ depth, tag: b.tagName, cls: b.className, txt: (b.textContent||'').trim().substring(0, 30) });
                        });
                        root.querySelectorAll('*').forEach(n => {
                            if (n.shadowRoot) dumpButtons(n.shadowRoot, depth + 1);
                        });
                    }
                    dumpButtons();
                    console.log('ALL buttons everywhere:', JSON.stringify(allBtns));
                    return { success: false, error: '2FA Send button not found', allButtons: allBtns };
                }
                
                console.log('── 2FA Step: Email selected & code sent ──');
                return { success: true };
            })();
        `);

        if (!twoFaResult || !twoFaResult.success) {
            const errMsg = twoFaResult?.error || '2FA selection failed';
            sendStatus('error', errMsg);
            if (twoFaResult?.allButtons) console.log('[2FA DEBUG] All buttons:', JSON.stringify(twoFaResult.allButtons));
            throw new Error(errMsg);
        }

        // Native Electron click at the button's coordinate
        if (twoFaResult.clickX && twoFaResult.clickY) {
            console.log(`[2FA] Native click at (${twoFaResult.clickX}, ${twoFaResult.clickY}) on "${twoFaResult.text}" [${twoFaResult.tag}.${twoFaResult.cls}]`);

            // mouseDown
            webContents.sendInputEvent({
                type: 'mouseDown',
                x: twoFaResult.clickX,
                y: twoFaResult.clickY,
                button: 'left',
                clickCount: 1
            });
            await new Promise(r => setTimeout(r, 100));

            // mouseUp
            webContents.sendInputEvent({
                type: 'mouseUp',
                x: twoFaResult.clickX,
                y: twoFaResult.clickY,
                button: 'left',
                clickCount: 1
            });
            await new Promise(r => setTimeout(r, 500));

            console.log('[2FA] Native click sent successfully');
        }

        sendStatus('step', "Gmail'den kod bekleniyor...");
        const gmailConfig = db.getGmailConfig();
        if (!gmailConfig) {
            sendStatus('error', 'Gmail ayarları bulunamadı!');
            return { success: false, error: 'Gmail config missing' };
        }

        // Wait for code (Reuse existing auto-login logic if possible or duplicate getLatestGmailCode)
        // Since we are adding this function in main.js scope, we can assume access to imports
        // BUT getLatestGmailCode might not be exposed. I'll rely on the one I saw earlier or implement inline if needed.
        // Assuming getLatestGmailCode is available in scope or needs to be duplicated. 
        // Checking previous file content, it seemed to be a standalone function or part of logic.
        // I'll call it assuming it's available.

        // Wait for code using gmail module directly
        const code = await gmail.waitForVerificationCode(
            gmailConfig.email,
            gmailConfig.app_password,
            22, // max attempts (45s)
            2000 // interval ms
        );

        if (!code) {
            sendStatus('error', 'Doğrulama kodu alınamadı!');
            throw new Error('Gmail code timeout');
        }

        sendStatus('step', `Kod bulundu: ${code}. Giriliyor...`);

        // Step 4: Enter Code (Digit by Digit) & Final Submit
        const codeEntryResult = await webContents.executeJavaScript(`
            (async () => {
                try {
                    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
                    
                    // Helper: Recursive Deep Search (Same as used before)
                    function findDeep(selector, root = document) {
                        try {
                            let el = root.querySelector(selector);
                            if (el) return el;
                        } catch(e) {}
                        const allNodes = root.querySelectorAll('*');
                        for (const node of allNodes) {
                            if (node.shadowRoot) {
                                const found = findDeep(selector, node.shadowRoot);
                                if (found) return found;
                            }
                        }
                        return null;
                    }

                    const code = "${code}";
                    console.log('[CODE ENTRY] Starting, code length:', code.length);
                    
                    // Enter digits
                    let enteredCount = 0;
                    for (let i = 0; i < code.length; i++) {
                        // Use findDeep because inputs are in Shadow DOM (depth 2)
                        let input = findDeep('#otp-input-' + i);
                        if (!input) {
                            console.warn('[CODE ENTRY] Input not found for index ' + i);
                            // Fallback: try class based if IDs change
                            input = findDeep('.otp-box:nth-of-type(' + (i + 1) + ')');
                        }
                        
                        if (input) {
                            console.log('[CODE ENTRY] Found input ' + i);
                            input.focus();
                            await sleep(50);
                            
                            // Set value directly
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                            nativeInputValueSetter.call(input, code[i]);
                            
                            // Dispatch events to trigger framework (Svelte/React) bindings
                            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            
                            // Simulate key press just in case
                            input.dispatchEvent(new KeyboardEvent('keydown', { key: code[i], code: 'Digit'+code[i], bubbles: true, composed: true }));
                            input.dispatchEvent(new KeyboardEvent('keyup', { key: code[i], code: 'Digit'+code[i], bubbles: true, composed: true }));
                            
                            enteredCount++;
                            await sleep(150);
                        }
                    }
                    
                    console.log('[CODE ENTRY] Entered', enteredCount, 'of', code.length, 'digits');
                    
                    // Wait longer for validation/state updates (button might be disabled initially)
                    console.log('[BUTTON] Waiting 2.5s for validation...');
                    await sleep(2500);
                    
                    // Click "Gönder" / "Onayla" (Final OtpButton)
                    console.log('[BUTTON] Searching for final button...');
                    const allOtpBtns = [];
                    function collectOtpBtns(root, depth = 0) {
                        root.querySelectorAll('.OtpButton, button.OtpButton').forEach(b => {
                            const txt = (b.textContent || '').trim();
                            const r = b.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) {
                                allOtpBtns.push({ btn: b, text: txt, depth: depth });
                            }
                        });
                        root.querySelectorAll('*').forEach(n => {
                            if (n.shadowRoot) collectOtpBtns(n.shadowRoot, depth + 1);
                        });
                    }
                    collectOtpBtns(document);
                    
                    console.log('[BUTTON] Found OtpButtons:', allOtpBtns.map(b => b.text).join(', '));
                    
                    // Find "Gönder" (but NOT "Kodu gönder" or "Tekrar gönder"), or "Onayla", or "Doğrula"
                let target = null;
                for (const item of allOtpBtns) {
                    const t = item.text.toLowerCase();
                    // Must contain one of the target words AND must NOT contain exclusions
                    const hasTargetWord = t.includes('gönder') || t.includes('onayla') || t.includes('doğrula');
                    const hasExclusion = t.includes('kodu') || t.includes('tekrar') || t.includes('bekle');
                    
                    if (hasTargetWord && !hasExclusion) {
                        target = item;
                        break;
                    }
                }
                    
                    // Fallback: pick last button
                    if (!target && allOtpBtns.length > 0) {
                        target = allOtpBtns[allOtpBtns.length - 1];
                        console.log('[BUTTON] Using last OtpButton:', target.text);
                    }

                    if (target) {
                        const btn = target.btn;
                        console.log('[BUTTON] Target:', target.text, 'Disabled:', btn.disabled);
                        
                        // Wait for button to be enabled (max 5 seconds)
                        let waited = 0;
                        while (btn.disabled && waited < 5000) {
                            console.log('[BUTTON] Disabled, waiting...');
                            await sleep(500);
                            waited += 500;
                        }
                        
                        if (btn.disabled) {
                            console.warn('[BUTTON] Still disabled after 5s, trying anyway...');
                        } else {
                            console.log('[BUTTON] Enabled! Clicking...');
                        }
                        
                        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                        await sleep(300);
                        
                        // Simple click first
                        btn.click();
                        await sleep(200);
                        
                        // Then mouse events
                        const opts = { bubbles: true, cancelable: true, composed: true, view: window };
                        btn.dispatchEvent(new MouseEvent('mousedown', opts));
                        await sleep(50);
                        btn.dispatchEvent(new MouseEvent('mouseup', opts));
                        await sleep(50);
                        btn.dispatchEvent(new MouseEvent('click', opts));
                        
                        console.log('[BUTTON] Click events dispatched');
                        return { success: true, buttonText: target.text, digitsEntered: enteredCount };
                    } else {
                        console.error('[BUTTON] Not found!');
                        return { success: false, error: 'Button not found', digitsEntered: enteredCount };
                    }
                } catch (error) {
                    console.error('[FATAL ERROR]', error);
                    return { success: false, error: error.toString(), stack: error.stack };
                }
            })();
        `);

        console.log('[WITHDRAW] Code entry result:', JSON.stringify(codeEntryResult, null, 2));

        // Wait for the final button click and any modal transitions
        await new Promise(r => setTimeout(r, 2000));

        // ── TELEGRAM NOTIFICATIONS ──
        try {
            if (client) {
                const telegramChatId = '5271912466'; // Group ID provided by user

                // 1. Send Success Notification
                if (formResult && formResult.amount) {
                    const message = `✅ **Çekim Başarılı**\n\n` +
                        `👤 Kullanıcı: ${account.username}\n` +
                        `💰 Çekilen Miktar: ${formResult.amount}\n\n` +
                        `📋 Log:\n` +
                        `• Kod girişi: ${codeEntryResult.digitsEntered || 6} rakam\n` +
                        `• Son buton: "${codeEntryResult.buttonText || 'N/A'}"`;

                    await client.sendMessage(telegramChatId, { message });
                    console.log('[TELEGRAM] Withdraw success notification sent.');
                }
            }
        } catch (telegramErr) {
            console.warn('[TELEGRAM] Failed to send notification:', telegramErr.message);
        }

        sendStatus('success', 'Çekim işlemi tamamlandı!');
        return { success: true };

    } catch (err) {
        console.error(`[WITHDRAW] Error for view ${viewId}: `, err);
        sendStatus('error', `Hata: ${err.message} `);
        return { success: false, error: err.message };
    }
}

ipcMain.on('trigger-withdraw', async (event, category) => {
    // Prevent multiple parallel runs if needed, using locks similar to auto-login
    if (autoLoginLocks.has(category)) {
        console.log(`[WITHDRAW] Process already running for ${category}`);
        return;
    }
    autoLoginLocks.add(category);

    try {
        console.log(`[WITHDRAW] Triggered for category: ${category} `);

        // 1. Get Accounts for this category/site
        const siteName = category; // Assuming category maps 1:1 to site name in DB
        const accounts = db.getAccountsBySite(siteName);

        if (accounts.length === 0) {
            sendStatus('error', 'Bu kategori için hesap bulunamadı!');
            return;
        }

        // 2. Get Views for this category
        const categoryViews = [];
        views.forEach((v, id) => {
            if (v.category === category) categoryViews.push({ viewId: id });
        });

        if (categoryViews.length === 0) {
            sendStatus('error', 'Bu kategori için açık pencere yok!');
            return;
        }

        const numToProcess = Math.min(categoryViews.length, accounts.length);

        for (let i = 0; i < numToProcess; i++) {
            const { viewId } = categoryViews[i];
            const account = accounts[i];

            // Perform withdraw
            const result = await performWithdraw(viewId, account);

            if (!result.success) {
                if (result.htmlDump) {
                    const dumpPath = path.join(app.getPath('desktop'), `withdraw_error_${viewId}.html`);
                    fs.writeFileSync(dumpPath, result.htmlDump);
                    console.log(`[WITHDRAW] HTML Dump saved to: ${dumpPath} `);
                    sendStatus('error', `Hata! HTML dökümü masaüstüne kaydedildi: withdraw_error_${viewId}.html`);
                }

                if (result.error === 'USER_SKIP') {
                    console.log(`[WITHDRAW] Skipping account ${account.username} (Low Balance)`);
                    continue;
                }
            }
        }

    } catch (err) {
        console.error('[WITHDRAW] Trigger error:', err);
    } finally {
        autoLoginLocks.delete(category);
    }
});


// ============================================
// AUTO-LOGIN FUNCTIONALITY
// ============================================

async function performAutoLogin(viewId, account) {
    const viewData = views.get(viewId);
    if (!viewData) {
        console.error(`[AUTO - LOGIN] View ${viewId} not found`);
        return { success: false, error: 'View not found' };
    }

    // Add to auto-login set to pause anti-idle
    viewsInAutoLogin.add(viewId);
    console.log(`[AUTO - LOGIN] Anti - Idle paused for view ${viewId}`);

    const webContents = viewData.view.webContents;

    const sendStatus = (status, message) => {
        if (mainWindow) {
            mainWindow.webContents.send('auto-login-status', { viewId, status, message });
        }
    };

    try {
        sendStatus('started', `Giriş başlatılıyor: ${account.username} `);

        // Step 1: Click login button
        sendStatus('step', 'Login butonuna tıklanıyor...');
        await webContents.executeJavaScript(`
            (function () {
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
            (function () {
                const usernameInput = document.querySelector('.cs-user-Id, input[name="user-Id"], input[name="username"], input[type="text"][placeholder*="kullanıcı"]');
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
            (function () {
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
            (function () {
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

        // POLLING LOOP for 2FA Screen or Errors
        // Poll every 1s for up to 30s
        let pollingSeconds = 0;
        const MAX_POLLING_SECONDS = 30;
        let detectionResult = null; // '2FA', 'IP_LIMIT', 'LOGIN_FAILED'

        while (pollingSeconds < MAX_POLLING_SECONDS) {
            await new Promise(r => setTimeout(r, 1000));
            pollingSeconds++;

            const checks = await webContents.executeJavaScript(`
            (function () {
                const result = { type: null };

                // 1. Check 2FA Container
                const twoFaContainer = document.querySelector('.TwoFaSelectorContainer');
                if (twoFaContainer) {
                    return { type: '2FA' };
                }

                // Fallback: Check Title (just in case class changes but text remains)
                const title = document.querySelector('div.Title');
                if (title && title.innerText.includes("2FA’yı Etkinleştirme Yönteminizi Seçin")) {
                    return { type: '2FA' };
                }

                // 2. Check Errors (Message Error)
                const errorMsg = document.querySelector('p.Message.Error');
                if (errorMsg) {
                    if (errorMsg.innerText.includes("Aynı IP üzerinden maksimum 5")) {
                        return { type: 'IP_LIMIT' };
                    }
                    if (errorMsg.innerText.includes("Giriş başarısız") || errorMsg.innerText.includes("hatalı")) {
                        return { type: 'LOGIN_FAILED', text: errorMsg.innerText };
                    }
                }

                return { type: null };
            })();
        `);

            if (checks.type === '2FA') {
                console.log('[AUTO-LOGIN] 2FA Screen detected!');
                detectionResult = '2FA';
                break;
            } else if (checks.type === 'IP_LIMIT') {
                console.log('[AUTO-LOGIN] IP Limit detected!');
                detectionResult = 'IP_LIMIT';
                break;
            } else if (checks.type === 'LOGIN_FAILED') {
                console.log('[AUTO-LOGIN] Login failed detected:', checks.text);
                detectionResult = 'LOGIN_FAILED';
                break;
            }

            sendStatus('waiting', `Kontrol ediliyor... (${pollingSeconds}/${MAX_POLLING_SECONDS})`);
        }

        if (detectionResult === 'IP_LIMIT') {
            // ... IP Limit handling ...
            // We can reuse the existing IP limit logic but refactored to be cleaner or just jump to it.
            // Since I need to "wait for user to change IP", I will enter a loop here.

            let ipLimitRetries = 0;
            const MAX_IP_RETRIES = 100;

            while (ipLimitRetries < MAX_IP_RETRIES) {
                sendStatus('waiting', `IP limiti! Lütfen IP değiştirin... (${ipLimitRetries})`);
                await new Promise(r => setTimeout(r, 15000));

                // Refresh
                await webContents.reload();
                await new Promise(r => setTimeout(r, 3000));

                // Retry Login (Recursively or Iteratively? Iteratively is safer here to avoid deep stack)
                // Actually, if we refresh, we need to re-enter credentials.
                // It's better to just return a special status or handle re-login in this block.

                // Minimal re-login logic here to keep it contained:
                // ... Re-enter creds ...
                // This duplicates code. ideally `performAutoLogin` would be recursive but that's complex with state.
                // Let's just try to re-enter credentials and click login again.

                await webContents.executeJavaScript(`
        // ... Click login, enter user, enter pass, click submit ...
        // (Simplified for brevity in implementation plan, but full code needed here)
        const loginBtn = document.querySelector('.ButtonLogin'); if (loginBtn) loginBtn.click();
        `);
                await new Promise(r => setTimeout(r, 2000));
                // ... enter user/pass ...
                // To avoid massive code duplication, I will just assume the user fixes IP and manually retries? 
                // No, requirement is "wait for me".

                // Let's just loop the outer function? No. I will copy the login steps here for the retry.

                // Step 1-3 repeated
                await webContents.executeJavaScript(`
        const usernameInput = document.querySelector('.cs-user-Id, input[name="username"]');
        if (usernameInput) { usernameInput.value = '${account.username}'; usernameInput.dispatchEvent(new Event('input', { bubbles: true })); }
        `);
                await new Promise(r => setTimeout(r, 500));
                await webContents.executeJavaScript(`
        const passwordInput = document.querySelector('.cs-password, input[type="password"]');
        if (passwordInput) { passwordInput.value = '${account.password}'; passwordInput.dispatchEvent(new Event('input', { bubbles: true })); }
        `);
                await new Promise(r => setTimeout(r, 500));
                await webContents.executeJavaScript(`
        const submitBtn = document.getElementById('LoginButton-Url') || document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
        `);

                await new Promise(r => setTimeout(r, 5000)); // Wait for result

                // Check IP error again
                const stillIpError = await webContents.executeJavaScript(`
        document.querySelector('p.Message.Error')?.innerText.includes("Aynı IP")
            `);

                if (!stillIpError) {
                    // Check if successful (2FA screen)
                    const success = await webContents.executeJavaScript(`
        document.querySelector('div.Title')?.innerText.includes("2FA")
            `);
                    if (success) {
                        detectionResult = '2FA';
                        break;
                    }
                    // Or check if login failed
                    const failed = await webContents.executeJavaScript(`
        document.querySelector('p.Message.Error')?.innerText.includes("Giriş başarısız")
            `);
                    if (failed) {
                        throw new Error('USER_SKIP: Login failed after IP retry');
                    }
                }

                ipLimitRetries++;
            }
        }
        else if (detectionResult === 'LOGIN_FAILED') {
            throw new Error('USER_SKIP: Login failed (Wrong credentials)');
        }
        else if (detectionResult !== '2FA') {
            // Timeout or unknown state
            console.log('[AUTO-LOGIN] Timeout waiting for 2FA or Error. Retrying page...');
            await webContents.reload();
            return { success: false, error: 'Timeout waiting for response' };
            // In trigger loop, this return false will cause retry next time or we can handle it.
            // Requirement: "eğer giriş işlemi 30 saniyeyi geçerse sayfayı yenileyip tekrar denesin"
            // So I should return failure here, but maybe trigger-auto-login needs to know to RETRY this account?
            // "bu hesabı atlayıp diğer hesaba geçsin" is for LOGIN_FAILED.
            // For others, "sayfayı yenileyip tekrar denesin".
            throw new Error('RETRY: Timeout');
        }

        // If we are here, detectionResult === '2FA'

        // Step 4: Click "E-posta kodu" button (Find by text content)
        sendStatus('step', 'E-posta seçeneği aranıyor...');

        await webContents.executeJavaScript(`
            (function () {
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
            (function () {
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
        sendStatus('step', "Gmail'den kod bekleniyor...");
        const gmailConfig = db.getGmailConfig();
        if (!gmailConfig) {
            sendStatus('error', 'Gmail ayarları bulunamadı!');
            return { success: false, error: 'Gmail config not found' };
        }

        const code = await gmail.waitForVerificationCode(
            gmailConfig.email,
            gmailConfig.app_password,
            22, // max attempts (22 * 2s = 44s ≈ 45s timeout)
            2000 // interval ms
        );

        if (!code) {
            sendStatus('error', 'Doğrulama kodu alınamadı!');
            return { success: false, error: 'Verification code not received' };
        }

        sendStatus('step', `Kod alındı: ${code} `);

        // Step 6: Enter verification code (Simulate Typing)
        sendStatus('step', 'Kod giriliyor (Tek tek yazılıyor)...');
        await webContents.executeJavaScript(`
            (function () {
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
                        bubbles: true, cancelable: true, key: code[code.length - 1], char: code[code.length - 1]
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

        // Mark account as active in session tracker
        activeAccountSessions.set(account.id, viewId);
        console.log(`[SESSION] Account ${account.id} (${account.username}) is now active in view ${viewId} `);

        return { success: true };

    } catch (err) {
        console.error(`[AUTO - LOGIN] Error for view ${viewId}: `, err);

        if (err.message.includes('USER_SKIP')) {
            throw err; // Re-throw to be handled by trigger-auto-login
        }

        if (err.message.includes('RETRY')) {
            throw err; // Re-throw to be handled by trigger-auto-login
        }

        sendStatus('error', `Hata: ${err.message} `);
        return { success: false, error: err.message };
    } finally {
        // Remove from auto-login set to resume anti-idle
        viewsInAutoLogin.delete(viewId);
        console.log(`[AUTO - LOGIN] Anti - Idle resumed for view ${viewId}`);
    }
}

// Lock to prevent concurrent auto-login triggers for the same category
const autoLoginLocks = new Set();

ipcMain.on('trigger-auto-login', async (event, category) => {
    if (autoLoginLocks.has(category)) {
        console.log(`[AUTO - LOGIN] Already running for category ${category}.Ignoring.`);
        return;
    }

    autoLoginLocks.add(category);
    console.log(`[AUTO - LOGIN] Triggered sequentially for category: ${category} `);

    try {
        // Get accounts for this category (site)
        const allAccounts = db.getAccountsBySite(category);
        console.log(`[AUTO - LOGIN] Found ${allAccounts.length} total accounts for ${category}`);

        if (allAccounts.length === 0) {
            if (mainWindow) {
                mainWindow.webContents.send('auto-login-status', {
                    status: 'error',
                    message: `${category} için kayıtlı hesap bulunamadı!`
                });
            }
            return;
        }

        // Filter out accounts that are already logged in OR flagged for bonus
        const availableAccounts = allAccounts.filter(account => {
            // Check if account is active in session
            const isActive = activeAccountSessions.has(account.id);
            if (isActive) {
                console.log(`[SESSION] Skipping account ${account.username} (ID: ${account.id}) - already logged in view ${activeAccountSessions.get(account.id)} `);
                return false;
            }

            // Check if account has bonus flag
            if (account.bonus_flagged && account.bonus_flagged > 0) {
                console.log(`[AUTO - LOGIN] Skipping account ${account.username} (ID: ${account.id}) - Valid Bonus Flag detected(Flagged at ${new Date(account.bonus_flagged).toLocaleString()})`);
                return false;
            }

            return true;
        });

        console.log(`[AUTO - LOGIN] ${availableAccounts.length} accounts available(${allAccounts.length - availableAccounts.length} already logged in)`);

        if (availableAccounts.length === 0) {
            if (mainWindow) {
                mainWindow.webContents.send('auto-login-status', {
                    status: 'error',
                    message: `${category} için tüm hesaplar zaten giriş yapmış!`
                });
            }
            return;
        }

        // Get views for this category that don't have an account yet
        const categoryViews = [];
        views.forEach((viewData, viewId) => {
            // Map site names to color categories
            const colorCategory = SITE_CATEGORIES[category] || category;
            if (viewData.category === colorCategory || viewData.category === category) {
                // Only include views that don't have an account assigned yet
                if (!viewAccountMap.has(viewId)) {
                    categoryViews.push({ viewId, viewData });
                } else {
                    console.log(`[SESSION] Skipping view ${viewId} - already has account assigned`);
                }
            }
        });

        console.log(`[AUTO - LOGIN] Found ${categoryViews.length} available views for category ${category}.Processing sequentially.`);

        if (categoryViews.length === 0) {
            if (mainWindow) {
                mainWindow.webContents.send('auto-login-status', {
                    status: 'error',
                    message: `${category} kategorisinde giriş yapılacak yeni sayfa yok!`
                });
            }
            return;
        }

        // Assign available accounts to views and log in SEQUENTIALLY
        const numToProcess = Math.min(categoryViews.length, availableAccounts.length);
        for (let i = 0; i < numToProcess; i++) {
            const { viewId } = categoryViews[i];
            const account = availableAccounts[i];

            viewAccountMap.set(viewId, account.id);
            console.log(`[AUTO - LOGIN] Starting login ${i + 1}/${numToProcess}: Account ${account.username} on view ${viewId}`);

            // Perform login one by one to avoid Gmail 2FA conflicts
            let retryCount = 0;
            const MAX_RETRIES = 2; // TRY 2 times for timeout/transient errors
            let loginResult = { success: false };

            while (retryCount < MAX_RETRIES) {
                try {
                    loginResult = await performAutoLogin(viewId, account);
                    if (loginResult.success) break;

                    // If simple error, we might have logged it, but if it was skipped locally, proceed.
                    // But if performAutoLogin threw USER_SKIP, we catch it below.
                    // If it returned {success:false}, check error.
                    if (loginResult.error && loginResult.error.includes('USER_SKIP')) {
                        throw new Error(loginResult.error);
                    }
                    else {
                        // Regular error, maybe retry?
                        console.log(`[AUTO-LOGIN] Login attempt ${retryCount + 1} failed: ${loginResult.error}`);
                        retryCount++;
                        if (retryCount < MAX_RETRIES) {
                            console.log('[AUTO-LOGIN] Retrying in 3 seconds...');
                            await new Promise(r => setTimeout(r, 3000));
                        }
                    }

                } catch (e) {
                    if (e && e.message && e.message.includes('USER_SKIP')) {
                        console.log(`[AUTO-LOGIN] SKIPPING account ${account.username} due to critical error: ${e.message}`);
                        // Send status update to UI
                        if (mainWindow) {
                            mainWindow.webContents.send('auto-login-status', {
                                viewId, status: 'error',
                                message: `Hesap ATLANDI: ${account.username} (${e.message.replace('USER_SKIP: ', '')})`
                            });
                        }
                        break; // BREAK the retry loop, proceed to next account
                    }
                    else if (e && e.message && e.message.includes('RETRY')) {
                        console.log(`[AUTO-LOGIN] Retry requested for ${account.username}: ${e.message}`);
                        retryCount++;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    else {
                        console.error(`[AUTO-LOGIN] Unexpected error for ${account.username}:`, e);
                        retryCount++;
                    }
                }
            }

            console.log(`[AUTO-LOGIN] Finished processing ${account.username} (Success: ${loginResult.success})`);

            // Optional: small delay between accounts to let things settle
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) {
        console.error('[AUTO-LOGIN] Trigger error:', err);
    } finally {
        autoLoginLocks.delete(category);
    }
});

// ============================================
// GRID VIEW MANUAL CONTROLS
// ============================================

ipcMain.on('hide-views', () => {
    isViewsHiddenByDB = true;
    views.forEach(v => {
        v.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
    });
});

ipcMain.on('show-views', () => {
    isViewsHiddenByDB = false;
    if (mainWindow) {
        mainWindow.webContents.send('request-grid-layout');
    }
});

ipcMain.on('reload-view', (event, viewId) => {
    const viewRecord = views.get(viewId); // Use .get() for Map
    if (viewRecord && viewRecord.view && viewRecord.view.webContents) {
        viewRecord.view.webContents.reloadIgnoringCache();
        console.log(`[GRID] Reloading view: ${viewId}`);
    }
});

ipcMain.handle('toggle-bonus-flag', async (event, viewId) => {
    const viewRecord = views.get(viewId); // Use .get() for Map
    const accountId = viewAccountMap.get(viewId); // Look up from viewAccountMap
    if (viewRecord && accountId) {
        // Toggle the flag logic
        try {
            // First get current state
            const accounts = db.getAllAccounts();
            const account = accounts.find(a => a.id === accountId);
            let newState = true;
            if (account && account.bonus_flagged > 0) {
                newState = false; // Turn it off
            }

            const success = db.updateBonusFlagValue(accountId, newState);
            if (success) {
                console.log(`[GRID] Toggled bonus flag for account ${account ? account.username : accountId} to ${newState ? 'ON' : 'OFF'}`);
                return { success: true, isFlagged: newState };
            }
        } catch (err) {
            console.error('[GRID] Failed to toggle bonus flag:', err);
            return { success: false, error: err.message };
        }
    }
    return { success: false, error: 'Account not linked to view or view not found' };
});
