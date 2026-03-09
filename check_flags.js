const Database = require('better-sqlite3');
const path = require('path');

// Uygulama adı "s" olduğu için accounts.db yolu bu
const dbPath = path.join('C:\\Users\\sefao\\AppData\\Roaming\\s\\accounts.db');
console.log('DB Path:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT id, site, username, bonus_flagged FROM accounts ORDER BY site, id').all();

    console.log('\n=== TUM HESAPLAR ===');
    rows.forEach(r => {
        const flagStatus = r.bonus_flagged ? `FLAG VAR - ${new Date(r.bonus_flagged).toLocaleString('tr-TR')}` : 'Temiz';
        console.log(`ID:${r.id} | ${(r.site + '          ').substring(0, 12)} | ${(r.username + '                    ').substring(0, 20)} | ${flagStatus}`);
    });

    const matbet = rows.filter(r => r.site === 'matbet');
    const matbetFlagged = matbet.filter(r => r.bonus_flagged > 0);

    console.log('\n=== OZET ===');
    console.log(`Toplam hesap: ${rows.length}`);
    console.log(`Matbet hesap: ${matbet.length}`);
    console.log(`Flagli Matbet: ${matbetFlagged.length}`);
    if (matbetFlagged.length > 0) {
        console.log('\nFlagli olanlar:');
        matbetFlagged.forEach(r => console.log(`  -> ${r.username} (ID:${r.id})`));
    }

    db.close();
} catch (e) {
    console.error('HATA:', e.message);
}
process.exit(0);
