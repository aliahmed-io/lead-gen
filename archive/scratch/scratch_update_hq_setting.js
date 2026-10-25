const fs = require('fs');
const path = require('path');
const { encrypt } = require('./cryptoUtils');

const settingsPath = path.resolve(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

const encryptedPass = encrypt('ixlrpexcdynvxkgf');

const acc = settings.accounts.find(a => a.email === 'ali@aethelonhq.com');
if (acc) {
  acc.password = encryptedPass;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  console.log('✅ Updated ali@aethelonhq.com password in settings.json successfully!');
} else {
  console.error('Account not found in settings.json');
}
