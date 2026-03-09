import sys

# Read the file
with open(r'c:\Users\sefao\OneDrive\Masaüstü\auto-code-platform-from-telegram-main\src\main\main.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with "sendStatus('success'"
target_line = None
for i, line in enumerate(lines):
    if "sendStatus('success'" in line and 'tamamlandı' in line:
        target_line = i
        print(f"Found at line {i+1}: {line.strip()}")
        break

if target_line is None:
    print("Line not found!")
    sys.exit(1)

# Insert the new lines after "sendStatus('success', 'Giriş tamamlandı!');"
# and before "return { success: true };"
new_lines = [
    "        \n",
    "        // Mark account as active in session tracker\n",
    "        activeAccountSessions.set(account.id, viewId);\n",
    "        console.log(`[SESSION] Account ${account.id} (${account.username}) is now active in view ${viewId}`);\n",
    "        \n"
]

# Insert after line 1043 (index 1042)
lines[target_line+1:target_line+1] = new_lines

# Write back
with open(r'c:\Users\sefao\OneDrive\Masaüstü\auto-code-platform-from-telegram-main\src\main\main.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully added session tracking code!")
