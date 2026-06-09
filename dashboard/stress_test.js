const fs = require('fs');
const path = require('path');

async function testMissingFiles() {
    const settingsPath = path.resolve(__dirname, '../settings.json');
    const templatesPath = path.resolve(__dirname, '../templates.json');
    
    // Backup existing
    let sBackup = null;
    let tBackup = null;
    if (fs.existsSync(settingsPath)) {
        sBackup = fs.readFileSync(settingsPath, 'utf8');
        fs.unlinkSync(settingsPath);
    }
    if (fs.existsSync(templatesPath)) {
        tBackup = fs.readFileSync(templatesPath, 'utf8');
        fs.unlinkSync(templatesPath);
    }
    
    try {
        const sRes = await fetch('http://localhost:3000/api/settings');
        console.log("Settings missing file GET status:", sRes.status);
        const tRes = await fetch('http://localhost:3000/api/templates');
        console.log("Templates missing file GET status:", tRes.status);
    } catch (e) {
        console.error("Error testing missing files:", e);
    }
    
    // Restore
    if (sBackup !== null) {
        fs.writeFileSync(settingsPath, sBackup);
    }
    if (tBackup !== null) {
        fs.writeFileSync(templatesPath, tBackup);
    }
}

async function run() {
    await testMissingFiles();
}
run();
