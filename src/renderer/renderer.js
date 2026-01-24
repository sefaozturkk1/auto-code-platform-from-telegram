const urlInput = document.getElementById('url-input');
const newTabBtn = document.getElementById('new-tab-btn');
const gridContainer = document.getElementById('grid-container');
const syncInput = document.getElementById('input-id-yaz');
const alBtn = document.getElementById('buton-id-yaz');

let views = []; // { id, url, element }

function createViewPlaceholder(id, url) {
    const placeholder = document.createElement('div');
    placeholder.className = 'grid-placeholder';
    placeholder.dataset.id = id;

    const header = document.createElement('div');
    header.className = 'grid-header';

    const title = document.createElement('span');
    try {
        title.innerText = new URL(url).hostname;
    } catch {
        title.innerText = url;
    }

    const controls = document.createElement('div');
    controls.className = 'header-controls';

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

    controls.appendChild(maxBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);
    placeholder.appendChild(header);

    gridContainer.appendChild(placeholder);

    views.push({ id, url, element: placeholder });
    updateGridStyles();
}

function toggleMaximize(id, element, btn) {
    const isMaximized = element.classList.toggle('maximized');
    btn.innerText = isMaximized ? 'KÜÇÜLT' : 'BÜYÜT';

    // When maximizing, we might want to disable scrolling on container
    gridContainer.style.overflowY = isMaximized ? 'hidden' : 'scroll';

    updateGridStyles();
}

function updateGridStyles() {
    if (views.length === 0) return;

    const containerRect = gridContainer.getBoundingClientRect();
    const headerHeight = 36; // Updated header height

    const boundsData = views.map(v => {
        const rect = v.element.getBoundingClientRect();
        const isMaximized = v.element.classList.contains('maximized');

        // Calculate the content area of the placeholder
        let contentX = Math.round(rect.x);
        let contentY = Math.round(rect.y + headerHeight);
        let contentWidth = Math.round(rect.width);
        let contentHeight = Math.round(rect.height - headerHeight);

        // If maximized, we don't clip by the container's bounds
        if (isMaximized) {
            return {
                id: v.id,
                bounds: {
                    x: contentX,
                    y: contentY,
                    width: contentWidth,
                    height: contentHeight
                }
            };
        }

        // Clipping logic relative to the grid container
        // We need to ensure the view doesn't overlap the header/sync area
        const visibleTop = Math.max(contentY, containerRect.top);
        const visibleBottom = Math.min(contentY + contentHeight, containerRect.bottom);
        const visibleLeft = Math.max(contentX, containerRect.left);
        const visibleRight = Math.min(contentX + contentWidth, containerRect.right);

        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        // If the view is completely scrolled out, move it off-screen
        if (visibleWidth <= 0 || visibleHeight <= 0) {
            return {
                id: v.id,
                bounds: { x: -1000, y: -1000, width: 0, height: 0 }
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

// Add scroll listener for the grid container
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
        // No need to manually update styles, grid CSS handles it, but we need to sync bounds
        updateGridStyles();
    }
}

newTabBtn.onclick = () => {
    let url = urlInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = `https://${url}`;
    window.electronAPI.newTab(url);
};

window.electronAPI.onTabCreated((id) => {
    createViewPlaceholder(id, urlInput.value);
});

// Value Sync Logic
let syncTimeout;
syncInput.addEventListener('input', () => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        window.electronAPI.syncValue(syncInput.value);
    }, 100); // Faster sync for grid mode
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

    // Optimistically hide or show loading? For now just wait for next request or close
    if (currentAuthType !== 'phoneNumber') {
        // usually code/password are last steps
        // we'll keep it open until main tells us it's done or errors
    }
};

modalCancel.onclick = () => {
    loginModal.style.display = 'none';
    window.electronAPI.sendTelegramAuth(null); // Signal cancellation
};

// --- Code Queuing System ---
let codeQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || codeQueue.length === 0) return;

    isProcessingQueue = true;
    const data = codeQueue.shift();

    console.log(`[QUEUE] Processing next code: ${data}`);

    // 1. Update the input field
    syncInput.value = data;
    syncInput.dispatchEvent(new Event('input', { bubbles: true }));

    // 2. 10 second fast click loop (Spam mode)
    // 100ms interval * 100 clicks = 10 seconds
    return new Promise((resolve) => {
        let clickCount = 0;
        const clickInterval = setInterval(() => {
            if (clickCount >= 100) {
                clearInterval(clickInterval);
                console.log(`[QUEUE] Finished 10s cycle for: ${data}`);
                isProcessingQueue = false;
                resolve();
                processQueue(); // Process next item
                return;
            }
            alBtn.click();
            clickCount++;
        }, 100);
    });
}

window.electronAPI.onTelegramMessage((data) => {
    loginModal.style.display = 'none';
    console.log(`[QUEUE] Received code, adding to queue: ${data}`);
    codeQueue.push(data);
    processQueue();
});

// Create initial views if requested, or just wait for user
window.onload = () => {
    // Optional: window.electronAPI.newTab('https://google.com');
};
