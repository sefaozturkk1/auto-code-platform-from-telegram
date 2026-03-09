const { chromium } = require('playwright');

(async () => {
    console.log('Starting Playwright test via Mobile Proxy: http://tr1.saglamproxy.net:8161');
    const proxyConfig = {
        server: 'http://tr1.saglamproxy.net:8161',
        username: 'sefaozturkk1',
        password: 'Ss34576809'
    };

    const startTime = Date.now();
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            proxy: proxyConfig,
            args: ['--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            proxy: proxyConfig
        });

        const page = await context.newPage();

        console.log('Navigating to http://dub.is/jojoguncel ...');
        const navStart = Date.now();

        const response = await page.goto('http://dub.is/jojoguncel', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const navEnd = Date.now();

        console.log(`Navigation finished in ${navEnd - navStart} ms.`);
        console.log(`Status Code: ${response.status()}`);
        console.log(`Current URL after redirect: ${page.url()}`);

        const title = await page.title();
        console.log(`Page Title: ${title}`);

        await browser.close();
        console.log(`Total execution time: ${Date.now() - startTime} ms`);
    } catch (e) {
        if (browser) await browser.close();
        console.error('Error during test:', e);
    }
})();
