const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

app.whenReady().then(async () => {
    let success = false;
    let logs = '';

    function addLog(msg) {
        logs += msg + '\n';
        console.log(msg);
    }

    try {
        const proxyRules = 'http://tr1.saglamproxy.net:8161';
        await session.defaultSession.setProxy({ proxyRules });

        app.on('login', (event, webContents, request, authInfo, callback) => {
            if (authInfo.isProxy) {
                addLog('[PROXY] Authenticating...');
                event.preventDefault();
                callback('sefaozturkk1', 'Ss34576809');
            }
        });

        const win = new BrowserWindow({ show: false });
        const startTime = Date.now();
        addLog('Navigating to http://dub.is/jojoguncel ...');

        win.webContents.on('did-start-navigation', (e, url) => {
            addLog(`[START-NAV] ${url} at ${Date.now() - startTime}ms`);
        });

        win.webContents.on('did-navigate', (e, url, httpResponseCode) => {
            addLog(`[NAVIGATE] ${url} (HTTP ${httpResponseCode}) at ${Date.now() - startTime}ms`);

            if (url.includes('jojobet')) {
                addLog('SUCCESS! Reached jojobet.');
                success = true;
                fs.writeFileSync('proxy_output.txt', logs, 'utf8');
                setTimeout(() => app.quit(), 1000);
            }
        });

        win.webContents.on('did-fail-load', (e, errCode, errDesc, url) => {
            addLog(`[FAIL-LOAD] ${url}: ${errCode} - ${errDesc}`);
        });

        win.loadURL('http://dub.is/jojoguncel');

        setTimeout(() => {
            if (!success) {
                addLog('[TIMEOUT] Script ended after 30s');
                fs.writeFileSync('proxy_output.txt', logs, 'utf8');
                app.quit();
            }
        }, 30000);

    } catch (e) {
        addLog('[ERROR] ' + e.message);
        fs.writeFileSync('proxy_output.txt', logs, 'utf8');
        app.quit();
    }
});
