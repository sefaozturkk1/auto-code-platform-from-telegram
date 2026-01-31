const { app, BrowserWindow, BrowserView, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

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
    console.log("Anti-Idle mechanism started (5m interval)");
    setInterval(() => {
        if (views.size === 0) return;
        console.log("Triggering anti-idle action in active views...");
        views.forEach((viewData) => {
            // Simulate a tiny scroll to prevent timeout
            viewData.view.webContents.executeJavaScript(`
                window.scrollBy(0, 1);
                setTimeout(() => window.scrollBy(0, -1), 100);
            `).catch(() => { });
        });
    }, 5 * 60 * 1000); // 5 minutes
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
        const savedSession = client.session.save();
        fs.writeFileSync(SESSION_FILE_PATH, savedSession, 'utf8');
        console.log("Session saved to file.");

        // We listen to all messages and filter manually inside to avoid ResolveUsername errors
        client.addEventHandler(async (event) => {
            try {
                const message = event.message;
                const text = message.message || "";
                const entities = message.entities || [];

                // --- Peer Identification (Logging Only) ---
                const chat = await message.getChat();
                const chatId = chat ? (chat.id ? chat.id.toString() : "") : "unknown";
                const chatTitle = chat ? (chat.title || "") : "unknown";

                console.log(`[TG DEBUG] Incoming from: "${chatTitle}" [ID: ${chatId}]. Checking keywords in: ${text}`);

                // Filter by keywords MAT or JOJO (Case-Insensitive)
                const upperText = text.toUpperCase();
                if (upperText.includes('MAT') || upperText.includes('JOJO')) {
                    console.log(`[TG DEBUG] Matched Keywords!`);

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
                console.error("Error in message handler:", err);
            }
        }, new NewMessage({})); // Listen to everything, filter inside

    } catch (err) {
        console.error("Failed to start Telegram client:", err);
        throw err;
    }
}

ipcMain.on('switch-tab', (event, id) => {
    // In grid mode, we don't switch, but we could highlight the selected one
});
