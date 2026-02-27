import sqlite3
import datetime

conn = sqlite3.connect(r'C:\Users\sefao\AppData\Roaming\s\accounts.db')
rows = conn.execute("SELECT id, site, username, bonus_flagged FROM accounts ORDER BY site, id").fetchall()
conn.close()

flagged = [r for r in rows if r[3]]
print("FLAGLI HESAPLAR:")
for r in flagged:
    ts = datetime.datetime.fromtimestamp(r[3]/1000).strftime('%d.%m %H:%M')
    print(r[0], r[1], r[2], ts)

matbet_all = [r for r in rows if r[1] == 'matbet']
print("\nTUM MATBET:")
for r in matbet_all:
    ts = datetime.datetime.fromtimestamp(r[3]/1000).strftime('%d.%m %H:%M') if r[3] else 'Temiz'
    print(r[0], r[2], ts)
