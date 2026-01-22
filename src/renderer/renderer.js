const urlInput = document.getElementById('url-input');
const newTabBtn = document.getElementById('new-tab-btn');
const gridContainer = document.getElementById('grid-container');
const syncInput = document.getElementById('sync-input');
const alBtn = document.getElementById('al-btn');

let views = []; // { id, url, element }

function createViewPlaceholder(id, url) {
    const placeholder = document.createElement('div');
    placeholder.className = 'grid-placeholder';
    placeholder.dataset.id = id;

    // We add a header to identify the view and provide a close button
    const header = document.createElement('div');
    header.className = 'grid-header';

    const title = document.createElement('span');
    try {
        title.innerText = new URL(url).hostname;
    } catch {
        title.innerText = url;
    }

    const closeBtn = document.createElement('span');
    closeBtn.className = 'grid-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeView(id);
    };

    header.appendChild(title);
    header.appendChild(closeBtn);
    placeholder.appendChild(header);

    gridContainer.appendChild(placeholder);

    views.push({ id, url, element: placeholder });
    updateGridStyles();
}

function updateGridStyles() {
    const count = views.size || views.length;
    if (count === 0) return;

    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    // Update grid container styling for the placeholders
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
}

function closeView(id) {
    window.electronAPI.closeTab(id);
    const index = views.findIndex(v => v.id === id);
    if (index !== -1) {
        views[index].element.remove();
        views.splice(index, 1);
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

// Create initial views if requested, or just wait for user
window.onload = () => {
    // Optional: window.electronAPI.newTab('https://google.com');
};
