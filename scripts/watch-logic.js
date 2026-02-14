
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const WATCH_FILE = path.join(__dirname, '../src/lib/classification.ts');
const SYNC_SCRIPT = path.join(__dirname, 'sync-logic.sh');

console.log(`[Watcher] Monitoring ${WATCH_FILE} for changes...`);

if (!fs.existsSync(WATCH_FILE)) {
    console.error(`[Watcher] Error: File ${WATCH_FILE} does not exist!`);
    process.exit(1);
}

let debounceTimer;

fs.watch(WATCH_FILE, (eventType, filename) => {
    if (filename && eventType === 'change') {
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            console.log(`[Watcher] Change detected in ${filename}. Running sync...`);
            exec(`bash "${SYNC_SCRIPT}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Watcher] Sync failed: ${error.message}`);
                    return;
                }
                if (stderr) console.error(`[Watcher] Stderr: ${stderr}`);
                console.log(`[Watcher] Output:\n${stdout}`);
            });
        }, 500); // 500ms debounce to avoid multiple triggers
    }
});
