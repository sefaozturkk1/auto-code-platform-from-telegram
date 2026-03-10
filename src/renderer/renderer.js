const urlInput = document.getElementById('url-input');
const newTabBtn = document.getElementById('new-tab-btn');
const gridContainer = document.getElementById('grid-container');

// Category URL section
const categoryUrlInput = document.getElementById('category-url-input');
const categoryButtons = document.querySelectorAll('.category-open-btn');

// Create Modal elements
const createModal = document.getElementById('create-modal');
const createUrlInput = document.getElementById('create-url-input');
const categoryOptions = document.querySelectorAll('.category-option');
const createSubmit = document.getElementById('create-submit');
const createCancel = document.getElementById('create-cancel');

// Edit Modal elements
const editModal = document.getElementById('edit-modal');
const editUrlInput = document.getElementById('edit-url-input');
const editSubmit = document.getElementById('edit-submit');
const editCancel = document.getElementById('edit-cancel');

let views = []; // { id, url, category, element }
let selectedCategory = 'jojobet';
let editingViewId = null;
let isModalOpen = false;

// --- Category Selection in Create Modal ---
categoryOptions.forEach(option => {
    option.addEventListener('click', () => {
        categoryOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedCategory = option.dataset.category;
    });
});

// --- Open Create Modal ---
newTabBtn.onclick = () => {
    isModalOpen = true;
    updateGridStyles(); // Hides views
    createUrlInput.value = urlInput.value.trim() || 'https://';
    createModal.style.display = 'flex';
    createUrlInput.focus();
    createUrlInput.select();
};

// --- Create Modal Actions ---
createSubmit.onclick = () => {
    let url = createUrlInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = `https://${url}`;

    window.electronAPI.newTabWithCategory(url, selectedCategory);
    createModal.style.display = 'none';
    isModalOpen = false;
    updateGridStyles(); // Shows views
};

createCancel.onclick = () => {
    createModal.style.display = 'none';
    isModalOpen = false;
    updateGridStyles(); // Shows views
};

// --- Anti-Idle Toggle logic ---
const antiIdleToggleBtn = document.getElementById('anti-idle-toggle-btn');
let isAntiIdleEnabled = true; // Default state in backend

antiIdleToggleBtn.onclick = () => {
    isAntiIdleEnabled = !isAntiIdleEnabled;
    window.electronAPI.toggleAntiIdle(isAntiIdleEnabled);
    antiIdleToggleBtn.innerText = isAntiIdleEnabled ? '🛡️ Anti-Idle: AÇIK' : '🛡️ Anti-Idle: KAPALI';
    antiIdleToggleBtn.style.background = isAntiIdleEnabled ? '#69db7c' : '#fa5252';
};

// --- Zero Balance Refresh Toggle logic ---
const zeroBalanceToggle = document.getElementById('zero-balance-toggle');
if (zeroBalanceToggle) {
    zeroBalanceToggle.onchange = (e) => {
        window.electronAPI.toggleZeroBalanceRefresh(e.target.checked);
    };
}


// --- DB Management Modal Logic ---
const dbUpdateBtn = document.getElementById('db-update-btn');
const dbModal = document.getElementById('db-modal');
const dbModalClose = document.getElementById('db-modal-close');
const dbAccountList = document.getElementById('db-account-list');

dbUpdateBtn.onclick = async () => {
    dbModal.style.display = 'flex';
    dbAccountList.innerHTML = '<p style="color:#666;text-align:center;">Yükleniyor...</p>';
    window.electronAPI.hideViews();

    try {
        const response = await window.electronAPI.getAllAccounts();
        if (response.success) {
            dbAccountList.innerHTML = '';
            response.accounts.forEach(acc => {
                const item = document.createElement('div');
                item.style.background = '#2c2e33';
                item.style.padding = '10px';
                item.style.marginBottom = '10px';
                item.style.borderRadius = '6px';
                item.innerHTML = `
                    <div style="display:flex;gap:10px;margin-bottom:5px;">
                        <input type="hidden" class="db-acc-id" value="${acc.id}">
                        <input type="text" class="db-acc-site" value="${acc.site}" style="flex:1;background:#1a1b1e;border:1px solid #373a40;color:#fff;padding:5px;border-radius:4px;">
                        <input type="text" class="db-acc-username" value="${acc.username}" style="flex:2;background:#1a1b1e;border:1px solid #373a40;color:#fff;padding:5px;border-radius:4px;">
                        <input type="text" class="db-acc-password" value="${acc.password}" style="flex:2;background:#1a1b1e;border:1px solid #373a40;color:#fff;padding:5px;border-radius:4px;">
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <label style="color:#a6a7ab;font-size:12px;">
                            <input type="checkbox" class="db-acc-flag" ${acc.bonus_flagged > 0 ? 'checked' : ''}> Bonus Flag
                        </label>
                    </div>
                `;
                dbAccountList.appendChild(item);
            });
            if (response.accounts.length === 0) {
                dbAccountList.innerHTML = '<p style="color:#666;text-align:center;">Hesap bulunamadı.</p>';
            }
        } else {
            dbAccountList.innerHTML = `<p style="color:#fa5252;text-align:center;">Hata: ${response.error}</p>`;
        }
    } catch (err) {
        dbAccountList.innerHTML = `<p style="color:#fa5252;text-align:center;">Hata oluştu.</p>`;
    }
};

// Auto-save all accounts and close DB modal
async function closeDbModal() {
    // Save all account rows
    const rows = dbAccountList.querySelectorAll('div[style*="background"]');
    for (const item of rows) {
        const idInput = item.querySelector('.db-acc-id');
        if (!idInput) continue;
        const id = idInput.value;
        const site = item.querySelector('.db-acc-site').value;
        const username = item.querySelector('.db-acc-username').value;
        const password = item.querySelector('.db-acc-password').value;
        const flag = item.querySelector('.db-acc-flag').checked;
        await window.electronAPI.updateAccountDetails(id, site, username, password, flag);
    }
    dbModal.style.display = 'none';
    window.electronAPI.showViews();
}

if (dbModalClose) {
    dbModalClose.onclick = () => closeDbModal();
}

// X button close for DB modal
const dbModalX = document.getElementById('db-modal-x');
if (dbModalX) {
    dbModalX.onclick = () => closeDbModal();
}

// Click outside modal to close
dbModal.addEventListener('click', (e) => {
    if (e.target === dbModal) {
        closeDbModal();
    }
});

// --- Category Batch URL Opening ---
categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        let url = categoryUrlInput.value.trim();
        if (!url) return;
        if (!url.startsWith('http')) url = `https://${url}`;

        const category = btn.dataset.category;
        window.electronAPI.navigateCategoryViews(category, url);
    });
});

// --- Category Bulk Open Buttons ---
const bulkCountInput = document.getElementById('bulk-count-input');
const bulkOpenButtons = document.querySelectorAll('.category-bulk-open-btn');

bulkOpenButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        let url = categoryUrlInput.value.trim();
        const count = parseInt(bulkCountInput.value);

        if (!url) {
            alert('Lütfen bir URL girin!');
            return;
        }

        if (!count || count < 1 || count > 20) {
            alert('Lütfen 1-20 arası bir sayı girin!');
            return;
        }

        if (!url.startsWith('http')) url = `https://${url}`;
        const category = btn.dataset.category;

        // Create multiple tabs
        for (let i = 0; i < count; i++) {
            window.electronAPI.newTabWithCategory(url, category);
        }
    });
});

// --- Create View Placeholder with Category ---
function createViewPlaceholder(id, url, category = 'jojobet', colorCategory = 'blue') {
    const placeholder = document.createElement('div');
    placeholder.className = `grid-placeholder category-${colorCategory}`;
    placeholder.dataset.id = id;
    placeholder.dataset.category = category; // Store site name for login matching

    const header = document.createElement('div');
    header.className = 'grid-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'header-title';

    const categoryIndicator = document.createElement('div');
    categoryIndicator.className = `category-indicator ${colorCategory}`;

    const title = document.createElement('span');
    try {
        title.innerText = new URL(url).hostname;
    } catch {
        title.innerText = url;
    }

    titleContainer.appendChild(categoryIndicator);
    titleContainer.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'header-controls';

    const editBtn = document.createElement('span');
    editBtn.className = 'grid-edit';
    editBtn.innerText = 'DÜZENLE';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openEditModal(id, url);
    };

    const maxBtn = document.createElement('span');
    maxBtn.className = 'grid-maximize';
    maxBtn.innerText = 'BÜYÜT';
    maxBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMaximize(id, placeholder, maxBtn);
    };

    const closeBtn = document.createElement('span');
    closeBtn.className = 'grid-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeView(id);
    };

    const reloadBtn = document.createElement('span');
    reloadBtn.className = 'grid-edit'; // Reusing style
    reloadBtn.innerText = 'YENİLE';
    reloadBtn.style.color = '#339af0';
    reloadBtn.onclick = (e) => {
        e.stopPropagation();
        window.electronAPI.reloadView(id);
    };

    const flagBtn = document.createElement('span');
    flagBtn.className = 'grid-edit'; // Reusing style
    flagBtn.innerText = 'FLAG DEĞİŞ';
    flagBtn.style.color = '#fcc419';
    flagBtn.onclick = async (e) => {
        e.stopPropagation();
        flagBtn.innerText = 'İşleniyor...';
        const res = await window.electronAPI.toggleBonusFlag(id);
        if (res.success) {
            flagBtn.innerText = res.isFlagged ? 'FLAG (AÇIK)' : 'FLAG (KAPALI)';
            flagBtn.style.color = res.isFlagged ? '#fa5252' : '#fcc419';
            setTimeout(() => flagBtn.innerText = 'FLAG DEĞİŞ', 3000);
        } else {
            flagBtn.innerText = 'Hata!';
            setTimeout(() => flagBtn.innerText = 'FLAG DEĞİŞ', 3000);
        }
    };

    controls.appendChild(reloadBtn);
    controls.appendChild(flagBtn);
    controls.appendChild(editBtn);
    controls.appendChild(maxBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleContainer);
    header.appendChild(controls);
    placeholder.appendChild(header);

    gridContainer.appendChild(placeholder);

    views.push({ id, url, category, colorCategory, element: placeholder });

    // Wait for DOM layout to complete before calculating bounds
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            updateGridStyles();
        });
    });
}

// --- Edit Modal Functions ---
function openEditModal(id, currentUrl) {
    editingViewId = id;
    editUrlInput.value = currentUrl;
    editModal.style.display = 'flex';
    isModalOpen = true;
    updateGridStyles(); // Hides views
    editUrlInput.focus();
    editUrlInput.select();
}

editSubmit.onclick = () => {
    let url = editUrlInput.value.trim();
    if (!url || !editingViewId) return;
    if (!url.startsWith('http')) url = `https://${url}`;

    window.electronAPI.navigateView(editingViewId, url);

    // Update local view data
    const view = views.find(v => v.id === editingViewId);
    if (view) {
        view.url = url;
        const title = view.element.querySelector('.header-title span');
        try {
            title.innerText = new URL(url).hostname;
        } catch {
            title.innerText = url;
        }
    }

    editModal.style.display = 'none';
    editingViewId = null;
    isModalOpen = false;
    updateGridStyles(); // Shows views
};

editCancel.onclick = () => {
    editModal.style.display = 'none';
    editingViewId = null;
    isModalOpen = false;
    updateGridStyles(); // Shows views
};

// Track currently maximized view
let maximizedViewId = null;

function toggleMaximize(id, element, btn) {
    const wasMaximized = element.classList.contains('maximized');

    // If clicking on an already maximized view, un-maximize it
    if (wasMaximized) {
        element.classList.remove('maximized');
        btn.innerText = 'BÜYÜT';
        maximizedViewId = null;
        gridContainer.style.overflowY = 'scroll';
    } else {
        // Un-maximize any other maximized view first
        views.forEach(v => {
            if (v.element.classList.contains('maximized')) {
                v.element.classList.remove('maximized');
                const otherBtn = v.element.querySelector('.grid-maximize');
                if (otherBtn) otherBtn.innerText = 'BÜYÜT';
            }
        });

        // Maximize this view
        element.classList.add('maximized');
        btn.innerText = 'KÜÇÜLT';
        maximizedViewId = id;
        gridContainer.style.overflowY = 'hidden';
    }

    updateGridStyles();
}


function updateGridStyles() {
    if (views.length === 0) return;

    // If a modal is open, hide all BrowserViews so they don't cover the HTML modal
    if (isModalOpen) {
        const hiddenBounds = views.map(v => ({
            id: v.id,
            bounds: { x: -9999, y: -9999, width: 0, height: 0 }
        }));
        window.electronAPI.updateViewBounds(hiddenBounds);
        return;
    }

    // If a view is maximized, show only that view fullscreen and hide others
    if (maximizedViewId) {
        const boundsData = views.map(v => {
            if (v.id === maximizedViewId) {
                // Maximized view: full window below header
                const headerHeight = 36; // grid-header height
                return {
                    id: v.id,
                    bounds: {
                        x: 0,
                        y: headerHeight,
                        width: Math.round(window.innerWidth),
                        height: Math.round(window.innerHeight - headerHeight)
                    }
                };
            } else {
                // Hide all other views
                return {
                    id: v.id,
                    bounds: { x: -9999, y: -9999, width: 0, height: 0 }
                };
            }
        });
        window.electronAPI.updateViewBounds(boundsData);
        return;
    }

    const containerRect = gridContainer.getBoundingClientRect();
    const cardHeaderHeight = 36;

    // Minimum Y is the top of the grid container (scrolling area)
    const minY = Math.round(containerRect.top);
    const containerBottom = Math.round(containerRect.bottom);
    const containerLeft = Math.round(containerRect.left);
    const containerRight = Math.round(containerRect.right);

    const boundsData = views.map(v => {
        const rect = v.element.getBoundingClientRect();

        // Card content area (below the header bar)
        const cardContentY = rect.y + cardHeaderHeight;
        const cardContentHeight = rect.height - cardHeaderHeight;

        // Clip to grid container
        let visibleTop = Math.max(cardContentY, minY);
        const visibleBottom = Math.min(cardContentY + cardContentHeight, containerBottom);
        const visibleLeft = Math.max(rect.x, containerLeft);
        const visibleRight = Math.min(rect.x + rect.width, containerRight);

        // ENFORCE: visibleTop must NEVER be less than minY
        visibleTop = Math.max(visibleTop, minY);

        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        if (visibleWidth <= 0 || visibleHeight <= 0) {
            return {
                id: v.id,
                bounds: { x: -9999, y: -9999, width: 0, height: 0 }
            };
        }

        return {
            id: v.id,
            bounds: {
                x: Math.round(visibleLeft),
                y: Math.round(visibleTop),
                width: Math.round(visibleWidth),
                height: Math.round(visibleHeight)
            }
        };
    });

    window.electronAPI.updateViewBounds(boundsData);
}

gridContainer.addEventListener('scroll', () => {
    updateGridStyles();
});

window.addEventListener('resize', updateGridStyles);

function closeView(id) {
    window.electronAPI.closeTab(id);
    const index = views.findIndex(v => v.id === id);
    if (index !== -1) {
        views[index].element.remove();
        views.splice(index, 1);
        updateGridStyles();
    }
}

// --- Handle Tab Created with Category ---
window.electronAPI.onTabCreatedWithCategory(({ id, category, colorCategory }) => {
    const url = createUrlInput.value.trim() || urlInput.value.trim();
    const color = colorCategory || SITE_TO_COLOR[category] || 'blue';
    createViewPlaceholder(id, url, category, color);
});

// Legacy tab created (backwards compat)
window.electronAPI.onTabCreated((id) => {
    createViewPlaceholder(id, urlInput.value, 'jojobet', 'blue');
});

// Telegram Integration
const loginModal = document.getElementById('login-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const phoneStage = document.getElementById('phone-stage');
const codeStage = document.getElementById('code-stage');
const passwordStage = document.getElementById('password-stage');
const phoneInput = document.getElementById('phone-input');
const codeInput = document.getElementById('code-input');
const passwordInput = document.getElementById('password-input');
const modalSubmit = document.getElementById('modal-submit');
const modalCancel = document.getElementById('modal-cancel');

let currentAuthType = null;

window.electronAPI.onTelegramAuthRequest((type) => {
    window.electronAPI.hideViews(); // Hide views for login modal
    currentAuthType = type;
    loginModal.style.display = 'flex';

    phoneStage.classList.add('hidden');
    codeStage.classList.add('hidden');
    passwordStage.classList.add('hidden');

    if (type === 'phoneNumber') {
        modalTitle.innerText = 'Telegram Login';
        modalDesc.innerText = 'Please enter your phone number to sign in.';
        phoneStage.classList.remove('hidden');
        phoneInput.focus();
    } else if (type === 'phoneCode') {
        modalTitle.innerText = 'Verification Code';
        modalDesc.innerText = 'Enter the 5-digit code sent to your Telegram app.';
        codeStage.classList.remove('hidden');
        codeInput.focus();
    } else if (type === 'password') {
        modalTitle.innerText = 'Two-Step Verification';
        modalDesc.innerText = 'Your account has 2FA enabled. Please enter your password.';
        passwordStage.classList.remove('hidden');
        passwordInput.focus();
    }
});

modalSubmit.onclick = () => {
    let value = '';
    if (currentAuthType === 'phoneNumber') value = phoneInput.value;
    else if (currentAuthType === 'phoneCode') value = codeInput.value;
    else if (currentAuthType === 'password') value = passwordInput.value;

    if (!value) return;

    window.electronAPI.sendTelegramAuth(value);
    loginModal.style.display = 'none';
    window.electronAPI.showViews(); // Show views after submit
};

modalCancel.onclick = () => {
    loginModal.style.display = 'none';
    window.electronAPI.sendTelegramAuth(null);
    window.electronAPI.showViews(); // Show views on cancel
};

// --- Code State Management System (Independent site loops) ---
let activeIntervals = {
    jojobet: null,
    matbet: null
};

// Helper references for separated inputs
const jojobetKodInput = document.getElementById('jojobet-kod-input');
const matbetKodInput = document.getElementById('matbet-kod-input');
const btnSyncBlueLogic = document.getElementById('btn-sync-blue');
const btnSyncRedLogic = document.getElementById('btn-sync-red');

if (btnSyncBlueLogic) {
    btnSyncBlueLogic.addEventListener('click', () => {
        const text = jojobetKodInput.value;
        if (text) processJojobetCode(text);
    });
}

if (btnSyncRedLogic) {
    btnSyncRedLogic.addEventListener('click', () => {
        const text = matbetKodInput.value;
        if (text) processMatbetCode(text);
    });
}

// API to receive new codes and edits
window.electronAPI.onTelegramMessage((data) => {
    loginModal.style.display = 'none'; // Ensure login modal is hidden
    const text = typeof data === 'object' ? data.text : data;
    const category = typeof data === 'object' ? data.category : null;
    const isEdit = typeof data === 'object' ? data.isEdit : false;

    console.log(`[STATE] Received ${isEdit ? 'EDITED' : 'new'} code: ${text} for category: ${category}`);

    if (category === 'jojobet') {
        processJojobetCode(text);
    } else if (category === 'matbet') {
        processMatbetCode(text);
    } else {
        // Fallback: apply to both or ignore. Currently we ignore.
        console.warn('Received code without specific target category', text);
    }
});

async function processJojobetCode(text) {
    if (!text) return;

    if (activeIntervals.jojobet) {
        clearTimeout(activeIntervals.jojobet);
        activeIntervals.jojobet = null;
    }

    console.log(`[JOJOBET] Starting/Resetting processing loop for code: ${text}`);

    // Update UI
    if (jojobetKodInput) {
        jojobetKodInput.value = text;
        jojobetKodInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 3. Send to main process immediately.
    window.electronAPI.syncValue(text, 'jojobet');

    // 4. Start JOJOBET logic: 5 tries, 3s intervals (matching backend)
    const TRIES = 5;
    const INTERVAL = 3000;
    let currentTry = 0;

    const executeTry = () => {
        if (activeIntervals.jojobet === null) return; // Aborted

        window.electronAPI.globalClick('jojobet');
        currentTry++;

        if (currentTry < TRIES) {
            activeIntervals.jojobet = setTimeout(executeTry, INTERVAL);
        } else {
            activeIntervals.jojobet = null;
            console.log(`[JOJOBET-FRONTEND] Finished all ${TRIES} tries for: ${text}`);
        }
    };

    // Start first try immediately
    executeTry();
}

async function processMatbetCode(text) {
    if (!text) return;

    if (activeIntervals.matbet) {
        clearTimeout(activeIntervals.matbet);
        activeIntervals.matbet = null;
    }

    console.log(`[MATBET] Starting/Resetting processing loop for code: ${text}`);

    // Update UI
    if (matbetKodInput) {
        matbetKodInput.value = text;
        matbetKodInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 3. Send to main process immediately.
    window.electronAPI.syncValue(text, 'matbet');

    // 4. Start MATBET logic: 16 tries, 3x4s bursts + 30s pause (matching backend)
    const TOTAL_TRIES = 16;
    const TRIES_PER_BURST = 3;
    const INTERVAL = 4000;
    const PAUSE = 30000;

    let currentTry = 0;
    let burstCount = 0;

    const executeTry = () => {
        if (activeIntervals.matbet === null) return; // Aborted

        window.electronAPI.globalClick('matbet');
        currentTry++;
        burstCount++;

        if (currentTry >= TOTAL_TRIES) {
            activeIntervals.matbet = null;
            console.log(`[MATBET-FRONTEND] Finished all ${TOTAL_TRIES} tries for: ${text}`);
            return;
        }

        if (burstCount >= TRIES_PER_BURST) {
            burstCount = 0;
            console.log(`[MATBET-FRONTEND] Burst done. Pausing ${PAUSE}ms`);
            activeIntervals.matbet = setTimeout(executeTry, PAUSE);
        } else {
            activeIntervals.matbet = setTimeout(executeTry, INTERVAL);
        }
    };

    // Start first try immediately
    executeTry();
}

window.onload = () => {
    // App ready - initialize account management
    initAccountManagement();
};

// ============================================
// ACCOUNT MANAGEMENT
// ============================================

// Site to category color mapping
const SITE_TO_COLOR = {
    jojobet: 'blue',
    matbet: 'red',
    holiganbet: 'yellow',
    turboslot: 'black'
};

// Account Modal Elements
const accountModal = document.getElementById('account-modal');
const accountSettingsBtn = document.getElementById('account-settings-btn');
const accountModalClose = document.getElementById('account-modal-close');
const accountSiteSelect = document.getElementById('account-site-select');
const accountUsernameInput = document.getElementById('account-username-input');
const accountPasswordInput = document.getElementById('account-password-input');
const addAccountBtn = document.getElementById('add-account-btn');
const accountList = document.getElementById('account-list');

// Gmail Elements
const gmailEmailInput = document.getElementById('gmail-email-input');
const gmailPasswordInput = document.getElementById('gmail-password-input');
const saveGmailBtn = document.getElementById('save-gmail-btn');

// Login Buttons
const loginButtons = document.querySelectorAll('.login-btn');

// Login Status Toast
const loginStatusToast = document.getElementById('login-status-toast');
const loginStatusText = document.getElementById('login-status-text');

function initAccountManagement() {
    // Account Settings Button
    if (accountSettingsBtn) {
        accountSettingsBtn.onclick = async () => {
            window.electronAPI.hideViews(); // Hide views so modal is visible
            accountModal.style.display = 'flex';
            loadAccounts();
            loadGmailConfig();

            // Load Site Settings
            const jojobetWithdrawAcc = document.getElementById('jojobet-withdraw-acc');
            const matbetWithdrawAcc = document.getElementById('matbet-withdraw-acc');

            const jRes = await window.electronAPI.getSiteSettings('jojobet');
            if (jRes.success && jRes.withdrawalAccount) jojobetWithdrawAcc.value = jRes.withdrawalAccount;

            const mRes = await window.electronAPI.getSiteSettings('matbet');
            if (mRes.success && mRes.withdrawalAccount) matbetWithdrawAcc.value = mRes.withdrawalAccount;

            // Load Mobile Proxy Config
            const proxyRes = await window.electronAPI.getMobileProxyConfig();
            if (proxyRes.success && proxyRes.config) {
                const cfg = proxyRes.config;
                const hostInput = document.getElementById('mobile-proxy-host');
                const usernameInput = document.getElementById('mobile-proxy-username');
                const passwordInput = document.getElementById('mobile-proxy-password');
                const changeIpUrlInput = document.getElementById('mobile-proxy-change-ip-url');
                const batchSizeInput = document.getElementById('mobile-proxy-batch-size');

                if (hostInput) hostInput.value = `${cfg.host}:${cfg.port}`;
                if (usernameInput) usernameInput.value = cfg.username || '';
                if (passwordInput) passwordInput.value = cfg.password || '';
                if (changeIpUrlInput) changeIpUrlInput.value = cfg.changeIpUrl || '';
                if (batchSizeInput) batchSizeInput.value = cfg.batchSize || 5;
            }

            // Load General Proxy Config
            const genProxyRes = await window.electronAPI.getGeneralProxyConfig();
            if (genProxyRes.success && genProxyRes.config) {
                const cfg = genProxyRes.config;
                const genHostInput = document.getElementById('general-proxy-host');
                const genUsernameInput = document.getElementById('general-proxy-username');
                const genPasswordInput = document.getElementById('general-proxy-password');

                if (genHostInput) genHostInput.value = `${cfg.host}:${cfg.port}`;
                if (genUsernameInput) genUsernameInput.value = cfg.username || '';
                if (genPasswordInput) genPasswordInput.value = cfg.password || '';
            }
        };
    }

    // Save Site Settings Button Logic
    const saveSiteSettingsBtn = document.getElementById('save-site-settings-btn');
    if (saveSiteSettingsBtn) {
        saveSiteSettingsBtn.onclick = async () => {
            const jojobetWithdrawAcc = document.getElementById('jojobet-withdraw-acc');
            const matbetWithdrawAcc = document.getElementById('matbet-withdraw-acc');
            const jAcc = jojobetWithdrawAcc.value.trim();
            const mAcc = matbetWithdrawAcc.value.trim();

            const originalText = saveSiteSettingsBtn.innerText;
            saveSiteSettingsBtn.innerText = 'Kaydediliyor...';

            let ok = true;
            if (jAcc) {
                const res = await window.electronAPI.setSiteSettings('jojobet', jAcc);
                if (!res.success) ok = false;
            }
            if (mAcc) {
                const res = await window.electronAPI.setSiteSettings('matbet', mAcc);
                if (!res.success) ok = false;
            }

            if (ok) {
                saveSiteSettingsBtn.innerText = '✅ Kaydedildi';
            } else {
                saveSiteSettingsBtn.innerText = '❌ Hata Oluştu';
            }

            setTimeout(() => {
                saveSiteSettingsBtn.innerText = originalText;
            }, 2000);
        };
    }

    // Close Modal
    if (accountModalClose) {
        accountModalClose.onclick = () => {
            accountModal.style.display = 'none';
            window.electronAPI.showViews(); // Show views again
        };
    }

    // Add Account
    if (addAccountBtn) {
        addAccountBtn.onclick = async () => {
            const site = accountSiteSelect.value;
            const username = accountUsernameInput.value.trim();
            const password = accountPasswordInput.value.trim();

            if (!username || !password) {
                alert('Kullanıcı adı ve şifre zorunludur!');
                return;
            }

            const result = await window.electronAPI.addAccount(site, username, password);
            if (result.success) {
                accountUsernameInput.value = '';
                accountPasswordInput.value = '';
                loadAccounts();
                showToast('Hesap eklendi!', '#69db7c');
            } else {
                alert('Hesap eklenirken hata: ' + result.error);
            }
        };
    }

    // Bulk Add Accounts
    const addBulkAccountBtn = document.getElementById('add-bulk-account-btn');
    const bulkAccountSiteSelect = document.getElementById('bulk-account-site-select');
    const bulkAccountFileInput = document.getElementById('bulk-account-file-input');

    if (addBulkAccountBtn && bulkAccountSiteSelect && bulkAccountFileInput) {
        addBulkAccountBtn.onclick = async () => {
            const site = bulkAccountSiteSelect.value;
            const files = bulkAccountFileInput.files;

            if (!files || files.length === 0) {
                alert('Lütfen bir .txt dosyası seçin!');
                return;
            }

            const file = files[0];
            const reader = new FileReader();

            reader.onload = async (e) => {
                const text = e.target.result;
                if (!text || !text.trim()) {
                    alert('Seçilen dosya boş!');
                    return;
                }

                const originalText = addBulkAccountBtn.innerText;
                addBulkAccountBtn.innerText = 'Ekleniyor...';
                addBulkAccountBtn.disabled = true;

                const lines = text.split('\n');
                let successCount = 0;
                let errorCount = 0;

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Allow splitting by colon, semicolon or comma
                    let separator = ':';
                    if (!line.includes(':') && line.includes(',')) separator = ',';
                    if (!line.includes(':') && !line.includes(',') && line.includes(';')) separator = ';';

                    const parts = line.split(separator);
                    if (parts.length >= 2) {
                        const username = parts[0].trim();
                        const password = parts.slice(1).join(separator).trim();
                        if (username && password) {
                            const result = await window.electronAPI.addAccount(site, username, password);
                            if (result.success) {
                                successCount++;
                            } else {
                                errorCount++;
                                console.error(`Error adding account ${username}:`, result.error);
                            }
                        }
                    }
                }

                if (successCount > 0) {
                    bulkAccountFileInput.value = '';
                    loadAccounts();
                    showToast(`${successCount} hesap eklendi!${errorCount > 0 ? ` (${errorCount} hata)` : ''}`, '#69db7c');
                } else if (errorCount > 0) {
                    alert(`${errorCount} hesap eklenirken hata oluştu.`);
                } else {
                    alert('Geçerli formatta hesap bulunamadı (kullaniciadi:sifre)');
                }

                addBulkAccountBtn.innerText = originalText;
                addBulkAccountBtn.disabled = false;
            };

            reader.onerror = () => {
                alert('Dosya okunurken bir hata oluştu.');
            };

            reader.readAsText(file);
        };
    }

    // Save Gmail Config
    if (saveGmailBtn) {
        saveGmailBtn.onclick = async () => {
            const email = gmailEmailInput.value.trim();
            const appPassword = gmailPasswordInput.value.trim();

            if (!email || !appPassword) {
                alert('Gmail adresi ve App Password zorunludur!');
                return;
            }

            const result = await window.electronAPI.setGmailConfig(email, appPassword);
            if (result.success) {
                showToast('Gmail ayarları kaydedildi!', '#69db7c');
            } else {
                alert('Gmail ayarları kaydedilirken hata: ' + result.error);
            }
        };
    }

    // Login Buttons
    loginButtons.forEach(btn => {
        btn.onclick = () => {
            const category = btn.dataset.category;
            console.log(`[LOGIN] Triggering auto-login for: ${category}`);
            window.electronAPI.triggerAutoLogin(category);
            showToast(`${category} için giriş başlatılıyor...`, '#8ab4f8');
        };
    });

    // Mobile Proxy Settings
    const saveMobileProxyBtn = document.getElementById('save-mobile-proxy-btn');
    const testIpChangeBtn = document.getElementById('test-ip-change-btn');
    const mobileProxyHostInput = document.getElementById('mobile-proxy-host');
    const mobileProxyUsernameInput = document.getElementById('mobile-proxy-username');
    const mobileProxyPasswordInput = document.getElementById('mobile-proxy-password');
    const mobileProxyChangeIpUrlInput = document.getElementById('mobile-proxy-change-ip-url');
    const mobileProxyBatchSizeInput = document.getElementById('mobile-proxy-batch-size');

    if (saveMobileProxyBtn) {
        saveMobileProxyBtn.onclick = async () => {
            const hostPort = mobileProxyHostInput.value.trim();
            if (!hostPort) {
                showToast('Proxy Host:Port boş bırakılamaz!', '#fa5252');
                return;
            }

            const parts = hostPort.split(':');
            const host = parts[0];
            const port = parseInt(parts[1], 10) || 8080;

            const config = {
                host: host,
                port: port,
                username: mobileProxyUsernameInput.value.trim() || undefined,
                password: mobileProxyPasswordInput.value.trim() || undefined,
                changeIpUrl: mobileProxyChangeIpUrlInput.value.trim() || undefined,
                batchSize: parseInt(mobileProxyBatchSizeInput.value, 10) || 5
            };

            const originalText = saveMobileProxyBtn.innerText;
            saveMobileProxyBtn.innerText = 'Kaydediliyor...';

            const result = await window.electronAPI.setMobileProxyConfig(config);
            if (result.success) {
                saveMobileProxyBtn.innerText = '✅ Kaydedildi';
                showToast('Mobil proxy ayarları kaydedildi!', '#e599f7');
            } else {
                saveMobileProxyBtn.innerText = '❌ Hata';
                showToast('Kayıt hatası: ' + (result.error || ''), '#fa5252');
            }

            setTimeout(() => { saveMobileProxyBtn.innerText = originalText; }, 2000);
        };
    }

    // General Proxy Settings
    const saveGeneralProxyBtn = document.getElementById('save-general-proxy-btn');
    const generalProxyHostInput = document.getElementById('general-proxy-host');
    const generalProxyUsernameInput = document.getElementById('general-proxy-username');
    const generalProxyPasswordInput = document.getElementById('general-proxy-password');

    if (saveGeneralProxyBtn) {
        saveGeneralProxyBtn.onclick = async () => {
            const hostPort = generalProxyHostInput.value.trim();
            if (!hostPort) {
                showToast('Proxy Host:Port boş bırakılamaz!', '#fa5252');
                return;
            }

            const parts = hostPort.split(':');
            const host = parts[0];
            const port = parseInt(parts[1], 10) || 8080;

            const config = {
                host: host,
                port: port,
                username: generalProxyUsernameInput.value.trim() || undefined,
                password: generalProxyPasswordInput.value.trim() || undefined
            };

            const originalText = saveGeneralProxyBtn.innerText;
            saveGeneralProxyBtn.innerText = 'Kaydediliyor...';

            const result = await window.electronAPI.setGeneralProxyConfig(config);
            if (result.success) {
                saveGeneralProxyBtn.innerText = '✅ Kaydedildi';
                showToast('Genel proxy ayarları kaydedildi!', '#4dabf7');
            } else {
                saveGeneralProxyBtn.innerText = '❌ Hata';
                showToast('Kayıt hatası: ' + (result.error || ''), '#fa5252');
            }

            setTimeout(() => { saveGeneralProxyBtn.innerText = originalText; }, 2000);
        };
    }

    if (testIpChangeBtn) {
        testIpChangeBtn.onclick = async () => {
            const originalText = testIpChangeBtn.innerText;
            testIpChangeBtn.innerText = '⏳ IP Değiştiriliyor...';
            testIpChangeBtn.disabled = true;

            const result = await window.electronAPI.testMobileProxyIpChange();
            if (result.success) {
                testIpChangeBtn.innerText = '✅ IP Değişti!';
                showToast('IP başarıyla değiştirildi!', '#69db7c');
            } else {
                testIpChangeBtn.innerText = '❌ Hata!';
                showToast('IP değiştirme hatası: ' + (result.error || ''), '#fa5252');
            }

            setTimeout(() => {
                testIpChangeBtn.innerText = originalText;
                testIpChangeBtn.disabled = false;
            }, 3000);
        };
    }

    // Withdraw Buttons
    const withdrawButtons = document.querySelectorAll('.withdraw-btn');
    withdrawButtons.forEach(btn => {
        btn.onclick = () => {
            const category = btn.dataset.category;
            if (!confirm(`${category} için çekim işlemini başlatmak istiyor musunuz?`)) return;

            console.log(`[WITHDRAW] Triggering withdraw for: ${category}`);
            window.electronAPI.triggerWithdraw(category);
            showToast(`${category} için çekim başlatılıyor...`, '#fab005');
        };
    });

    // Listen for auto-login status updates
    window.electronAPI.onAutoLoginStatus((data) => {
        console.log('[LOGIN STATUS]', data);

        const statusColors = {
            started: '#8ab4f8',
            step: '#fab005',
            success: '#69db7c',
            error: '#fa5252'
        };

        const color = statusColors[data.status] || '#fff';
        showToast(data.message, color);
    });
}

async function loadAccounts() {
    const result = await window.electronAPI.getAllAccounts();

    if (!result.success) {
        accountList.innerHTML = '<p style="color: #fa5252;">Hesaplar yüklenirken hata oluştu</p>';
        return;
    }

    const accounts = result.accounts;

    if (accounts.length === 0) {
        accountList.innerHTML = '<p style="color: #666; text-align: center;">Henüz hesap eklenmemiş</p>';
        return;
    }

    // Group by site
    const grouped = {};
    accounts.forEach(acc => {
        if (!grouped[acc.site]) grouped[acc.site] = [];
        grouped[acc.site].push(acc);
    });

    let html = '';
    for (const site in grouped) {
        const color = SITE_TO_COLOR[site] || 'blue';
        const siteEmoji = { jojobet: '🔵', matbet: '🔴', holiganbet: '🟡', turboslot: '⚫' }[site] || '⚪';

        html += `<div style="margin-bottom: 10px;">
            <h4 style="color: var(--${color}); margin: 5px 0; display: flex; align-items: center; gap: 5px;">
                ${siteEmoji} ${site.charAt(0).toUpperCase() + site.slice(1)} (${grouped[site].length})
            </h4>`;

        grouped[site].forEach((acc, idx) => {
            html += `<div style="display: flex; justify-content: space-between; align-items: center; background: #2c2e33; padding: 8px 12px; border-radius: 4px; margin: 4px 0;">
                <span style="color: #e8eaed;">${idx + 1}. ${acc.username}</span>
                <button onclick="deleteAccount(${acc.id})" style="background: #fa5252; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Sil</button>
            </div>`;
        });

        html += '</div>';
    }

    accountList.innerHTML = html;
}

async function loadGmailConfig() {
    const result = await window.electronAPI.getGmailConfig();
    if (result.success && result.config) {
        gmailEmailInput.value = result.config.email || '';
        // Don't show password for security
        gmailPasswordInput.placeholder = 'Mevcut şifre kaydedildi';
    }
}

// Global function for delete button onclick
window.deleteAccount = async function (id) {
    if (!confirm('Bu hesabı silmek istediğinize emin misiniz?')) return;

    const result = await window.electronAPI.deleteAccount(id);
    if (result.success) {
        loadAccounts();
        showToast('Hesap silindi', '#fa5252');
    } else {
        alert('Hesap silinirken hata: ' + result.error);
    }
};

function showToast(message, color = '#fff') {
    loginStatusText.textContent = message;
    loginStatusToast.style.borderLeft = `4px solid ${color}`;
    loginStatusToast.style.display = 'block';

    // Auto-hide after 3 seconds
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        loginStatusToast.style.display = 'none';
    }, 3000);
}
