const { app, BrowserWindow, BrowserView, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Increase renderer process limit for 100-150+ browser views
app.commandLine.appendSwitch('renderer-process-limit', '150');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

let mainWindow;
let tray;
let isQuitting = false;
const views = new Map(); // id -> { view: BrowserView, category: string }

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
}

function createBrowserTab(url, category = 'blue') {
    const id = Date.now().toString();
    const partition = `persist:account_${id}`;

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition // Session isolation fix
        }
    });

    // Start off-screen until renderer calculates correct position
    view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });

    views.set(id, { view, category });
    mainWindow.addBrowserView(view);
    view.webContents.loadURL(url);

    updateGridLayout();

    return { id, category };
}

function updateGridLayout() {
    // Legacy function - positions are now managed via update-view-bounds
}

app.whenReady().then(() => {
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
    event.reply('tab-created-with-category', { id: result.id, category: result.category });
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
// Telegram Integration (GramJS)
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

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
    SESSION_FILE_PATH = path.join(app.getPath('userData'), 'telegram_session.txt');

    let sessionString = "";
    if (fs.existsSync(SESSION_FILE_PATH)) {
        sessionString = fs.readFileSync(SESSION_FILE_PATH, 'utf8').trim();
        console.log("Existing session found and loaded.");
    }

    stringSession = new StringSession(sessionString);

    try {
        console.log("Loading Telegram client...");
        client = new TelegramClient(stringSession, apiId, apiHash, {
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
