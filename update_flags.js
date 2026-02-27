const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use APPDATA for roaming profile on Windows
const dbPath = path.join(process.env.APPDATA, 's', 'accounts.db');
console.log('Opening database at:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database not found!');
    process.exit(1);
}

const db = new Database(dbPath);

const ids = [15, 16, 17, 18, 19];
const placeholders = ids.map(() => '?').join(',');
const sql = `UPDATE accounts SET bonus_flagged = 0 WHERE id IN (${placeholders})`;

console.log(`Executing SQL: ${sql} with params:`, ids);

try {
    const stmt = db.prepare(sql);
    const info = stmt.run(...ids);
    console.log(`Successfully updated ${info.changes} rows.`);
} catch (err) {
    console.error('Error updating database:', err);
}

db.close();
