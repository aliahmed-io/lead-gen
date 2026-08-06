const fs = require('fs');
const path = require('path');

const secrets = {
  'ali@tryaethelon.com': 'zxf4zldxuoqj4hridrq7vf2hxktyk4h6',
  'ali@aethelonlabs.com': 'od74meoyb4d5o7ql27yqyckrpwlx6vfq',
  'ali@aethelonstudio.com': 'xf6qx77czcklgbatailo334loca57wig',
  'ali@getaethelon.com': 'q2ikdgxmp4b5njj75edg6mm5p3e53cjh',
  'ali@aethelonhq.com': '4e442v6mjqd3y76kmmm6oqc2bd3pbnvq',
  'ali@aethelonmail.com': 'fijtywbrlc7re4w5k5tcp5odsz44ti4c'
};

const settingsPath = path.resolve(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

settings.accounts.forEach(acc => {
  if (secrets[acc.email]) {
    acc.totpSecret = secrets[acc.email];
  }
});

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
console.log('✅ Added totpSecret to all accounts in settings.json successfully!');
