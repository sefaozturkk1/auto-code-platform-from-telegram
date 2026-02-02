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
let selectedCategory = 'blue';
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
function createViewPlaceholder(id, url, category = 'blue') {
    const placeholder = document.createElement('div');
    placeholder.className = `grid-placeholder category-${category}`;
    placeholder.dataset.id = id;

    const header = document.createElement('div');
    header.className = 'grid-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'header-title';

    const categoryIndicator = document.createElement('div');
    categoryIndicator.className = `category-indicator ${category}`;

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

    views.push({ id, url, category, element: placeholder });

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

function toggleMaximize(id, element, btn) {
    const isMaximized = element.classList.toggle('maximized');
    btn.innerText = isMaximized ? 'KÜÇÜLT' : 'BÜYÜT';

    gridContainer.style.overflowY = isMaximized ? 'hidden' : 'scroll';

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

    const containerRect = gridContainer.getBoundingClientRect();
    const cardHeaderHeight = 36;

    // Minimum Y is the top of the grid container (scrolling area)
    const minY = Math.round(containerRect.top);
    const containerBottom = Math.round(containerRect.bottom);
    const containerLeft = Math.round(containerRect.left);
    const containerRight = Math.round(containerRect.right);

    const boundsData = views.map(v => {
        const rect = v.element.getBoundingClientRect();
        const isMaximized = v.element.classList.contains('maximized');

        // Card content area (below the header bar)
        const cardContentY = rect.y + cardHeaderHeight;
        const cardContentHeight = rect.height - cardHeaderHeight;

        if (isMaximized) {
            return {
                id: v.id,
                bounds: {
                    x: 0,
                    y: minY, // Start from grid container top
                    width: Math.round(window.innerWidth),
                    height: Math.round(window.innerHeight - minY)
                }
            };
        }

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
window.electronAPI.onTabCreatedWithCategory(({ id, category }) => {
    const url = createUrlInput.value.trim() || urlInput.value.trim();
    createViewPlaceholder(id, url, category);
});

// Legacy tab created (backwards compat)
window.electronAPI.onTabCreated((id) => {
    createViewPlaceholder(id, urlInput.value, 'blue');
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
    // App ready
};
