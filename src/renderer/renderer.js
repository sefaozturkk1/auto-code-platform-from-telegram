const urlInput = document.getElementById('url-input');
const newTabBtn = document.getElementById('new-tab-btn');
const gridContainer = document.getElementById('grid-container');
const syncInput = document.getElementById('input-id-yaz');
const alBtn = document.getElementById('buton-id-yaz');

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

// Flag to control view visibility during modal interactions
let isModalOpen = false;

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

// Value Sync Logic
let syncTimeout;
syncInput.addEventListener('input', () => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        window.electronAPI.syncValue(syncInput.value);
    }, 100);
});

alBtn.onclick = () => {
    window.electronAPI.globalClick();
};

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
};

modalCancel.onclick = () => {
    loginModal.style.display = 'none';
    window.electronAPI.sendTelegramAuth(null);
};

// --- Code Queuing System ---
let codeQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || codeQueue.length === 0) return;

    isProcessingQueue = true;
    const data = codeQueue.shift();

    console.log(`[QUEUE] Processing next code: ${data}`);

    syncInput.value = data;
    syncInput.dispatchEvent(new Event('input', { bubbles: true }));

    return new Promise((resolve) => {
        let clickCount = 0;
        const clickInterval = setInterval(() => {
            if (clickCount >= 17) { // ~10 saniye için (17 * 600ms = 10.2s)
                clearInterval(clickInterval);
                console.log(`[QUEUE] Finished 10s cycle for: ${data}`);
                isProcessingQueue = false;
                resolve();
                processQueue();
                return;
            }
            alBtn.click();
            clickCount++;
        }, 600); // 600ms aralıklarla bas
    });
}

window.electronAPI.onTelegramMessage((data) => {
    loginModal.style.display = 'none';
    console.log(`[QUEUE] Received code, adding to queue: ${data}`);
    codeQueue.push(data);
    processQueue();
});

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
        accountSettingsBtn.onclick = () => {
            accountModal.style.display = 'flex';
            loadAccounts();
            loadGmailConfig();
        };
    }

    // Close Modal
    if (accountModalClose) {
        accountModalClose.onclick = () => {
            accountModal.style.display = 'none';
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
