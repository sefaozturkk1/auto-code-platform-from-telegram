const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

const MAX_RETRIES = 3;

function initDatabase() {
    const dbPath = path.join(app.getPath('userData'), 'accounts.db');

    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            db = new Database(dbPath);
            break; // Success
        } catch (e) {
            console.error(`[DB] Connection attempt ${retries + 1} failed:`, e.message);
            if (e.code === 'EINTR' || e.message.includes('EINTR')) {
                retries++;
                if (retries >= MAX_RETRIES) throw e;
                // Wait briefly before retrying (synchronous sleep for simplicity in this context)
                const end = Date.now() + 100;
                while (Date.now() < end);
                continue;
            }
            throw e; // Throw other errors immediately
        }
    }

    // Create accounts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create gmail_config table
    db.exec(`
        CREATE TABLE IF NOT EXISTS gmail_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            email TEXT NOT NULL,
            app_password TEXT NOT NULL
        )
    `);

    console.log('[DB] Database initialized at:', dbPath);
    return db;
}

// Account operations
function addAccount(site, username, password) {
    const stmt = db.prepare('INSERT INTO accounts (site, username, password) VALUES (?, ?, ?)');
    const result = stmt.run(site, username, password);
    console.log(`[DB] Account added: ${site} - ${username}, ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid;
}

function getAccountsBySite(site) {
    const stmt = db.prepare('SELECT * FROM accounts WHERE site = ? ORDER BY id ASC');
    return stmt.all(site);
}

function getAllAccounts() {
    const stmt = db.prepare('SELECT * FROM accounts ORDER BY site, id ASC');
    return stmt.all();
}

function deleteAccount(id) {
    const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
    const result = stmt.run(id);
    console.log(`[DB] Account deleted: ID ${id}`);
    return result.changes > 0;
}

function updateAccount(id, site, username, password) {
    const stmt = db.prepare('UPDATE accounts SET site = ?, username = ?, password = ? WHERE id = ?');
    const result = stmt.run(site, username, password, id);
    return result.changes > 0;
}

// Gmail config operations
function getGmailConfig() {
    const stmt = db.prepare('SELECT * FROM gmail_config WHERE id = 1');
    return stmt.get() || null;
}

function setGmailConfig(email, appPassword) {
    const stmt = db.prepare(`
        INSERT INTO gmail_config (id, email, app_password) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET email = excluded.email, app_password = excluded.app_password
    `);
    stmt.run(email, appPassword);
    console.log(`[DB] Gmail config saved for: ${email}`);
    return true;
}

module.exports = {
    initDatabase,
    addAccount,
    getAccountsBySite,
    getAllAccounts,
    deleteAccount,
    updateAccount,
    getGmailConfig,
    setGmailConfig
};
