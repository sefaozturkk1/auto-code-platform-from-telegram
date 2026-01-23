const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const views = new Map(); // id -> BrowserView

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

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('resize', () => {
        updateGridLayout();
    });
}

function createBrowserTab(url) {
    const id = Date.now().toString();
    const partition = `persist:account_${id}`;

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition // Session isolation fix
        }
    });

    views.set(id, view);
    mainWindow.addBrowserView(view);
    view.webContents.loadURL(url);

    updateGridLayout();

    return id;
}

function updateGridLayout() {
    if (!mainWindow || views.size === 0) return;

    const bounds = mainWindow.getContentBounds();
    const TOP_OFFSET = 180; // Space for the header and sync bar
    const containerWidth = bounds.width;
    const containerHeight = bounds.height - TOP_OFFSET;

    const count = views.size;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const itemWidth = Math.floor(containerWidth / cols);
    const itemHeight = Math.floor(containerHeight / rows);

    let index = 0;
    const sortedIds = Array.from(views.keys()).sort();

    for (const id of sortedIds) {
        const view = views.get(id);
        const col = index % cols;
        const row = Math.floor(index / cols);

        view.setBounds({
            x: col * itemWidth,
            y: TOP_OFFSET + (row * itemHeight),
            width: itemWidth,
            height: itemHeight
        });

        // Ensure it's attached and visible
        // Electron 23+ autoResizing might need specific handling but setBounds is primary
        view.setAutoResize({ width: true, height: true });

        index++;
    }
}

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
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
    const id = createBrowserTab(url);
    event.reply('tab-created', id);
});

ipcMain.on('sync-value', (event, value) => {
    views.forEach((view) => {
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
        view.webContents.executeJavaScript(script).catch(console.error);
    });
});

ipcMain.on('global-click', (event) => {
    views.forEach((view) => {
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
        view.webContents.executeJavaScript(script).catch(console.error);
    });
});

ipcMain.on('close-tab', (event, id) => {
    const view = views.get(id);
    if (view) {
        mainWindow.removeBrowserView(view);
        view.webContents.destroy();
        views.delete(id);
        updateGridLayout();
    }
});
// Telegram Integration (GramJS)
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input'); // For terminal input during login

// --- USER CONFIGURATION ---
const apiId = 10637839; // Replace with your API ID (Integer)
const apiHash = 'c1a267916b74fe6ffe2d0d81b823acf2'; // Replace with your API Hash (String)
const targetChat = 'BONUS UZMANI |FORUMBANKO'; // e.g., 'my_group' or -100123456789
// ---------------------------

const SESSION_FILE_PATH = path.join(app.getPath('userData'), 'telegram_session.txt');

let sessionString = "";
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionString = fs.readFileSync(SESSION_FILE_PATH, 'utf8').trim();
    console.log("Existing session found and loaded.");
}

const stringSession = new StringSession(sessionString);

(async () => {
    try {
        console.log("Loading Telegram client...");
        const client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });

        await client.start({
            phoneNumber: async () => await input.text("Please enter your number: "),
            password: async () => await input.text("Please enter your password: "),
            phoneCode: async () => await input.text("Please enter the code you received: "),
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

                // --- Peer Identification ---
                const chat = await message.getChat();
                if (!chat) return;

                const chatUsername = (chat.username || "").toLowerCase();
                const chatTitle = (chat.title || "").toLowerCase();
                const chatId = chat.id.toString();
                const target = targetChat.toLowerCase();

                console.log(`Incoming message from: "${chat.title}" (@${chat.username || 'no-username'}) [ID: ${chatId}]`);

                // Match by username, title, or ID
                let isTarget = false;
                if (chatUsername === target.replace('@', '') ||
                    chatTitle === target ||
                    chatId === target) {
                    isTarget = true;
                }

                if (!isTarget) return;

                console.log(`Target chat matched! checking keywords...`);

                // Filter by keywords MAT or JOJO
                if (text.includes('MAT') || text.includes('JOJO')) {
                    console.log(`Matched message in target chat: ${text}`);

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
    }
})();

ipcMain.on('switch-tab', (event, id) => {
    // In grid mode, we don't switch, but we could highlight the selected one
});
