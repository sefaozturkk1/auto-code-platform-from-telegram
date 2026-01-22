const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

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
    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    const id = Date.now().toString();
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
/* Note: switchTab is no longer needed in grid mode, but kept for compatibility if needed */
ipcMain.on('switch-tab', (event, id) => {
    // In grid mode, we don't switch, but we could highlight the selected one
});
