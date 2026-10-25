const fs = require('fs');
const path = require('path');

const adminData = {
  'ali@tryaethelon.com': { adminPass: '@RoPOwF6(#de9{,0', adminSecret: 'zxf4zldxuoqj4hridrq7vf2hxktyk4h6' },
  'ali@aethelonlabs.com': { adminPass: 'v*D=$4}2H3n7Kc71', adminSecret: 'od74meoyb4d5o7ql27yqyckrpwlx6vfq' },
  'ali@aethelonstudio.com': { adminPass: '[h]tL0O(8_65a^0B', adminSecret: 'xf6qx77czcklgbatailo334loca57wig' },
  'ali@getaethelon.com': { adminPass: '&i6eg8ev>8j!*MQ)', adminSecret: 'q2ikdgxmp4b5njj75edg6mm5p3e53cjh' },
  'ali@aethelonhq.com': { adminPass: '*fcx&Q;h+214sVw7', adminSecret: '4e442v6mjqd3y76kmmm6oqc2bd3pbnvq' },
  'ali@aethelonmail.com': { adminPass: '9+A@9$1_jw*L8D+J', adminSecret: 'fijtywbrlc7re4w5k5tcp5odsz44ti4c' }
};

const settingsPath = path.resolve(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

settings.accounts.forEach(acc => {
  acc.firstName = acc.firstName || 'Ali';
  acc.lastName = acc.lastName || 'Ahmed';
  acc.senderName = acc.senderName || 'Ali Ahmed';
  acc.signature = acc.signature || 'Ali Ahmed\nFounder & Interactive Developer | Aethelon Labs\naethelonlabs.com';
  acc.forwardingDestination = acc.forwardingDestination || acc.email;
  
  const info = adminData[acc.email];
  if (info) {
    acc.adminEmail = acc.adminEmail || acc.email;
    acc.adminPassword = acc.adminPassword || info.adminPass;
    acc.adminSecret = acc.adminSecret || info.adminSecret;
  }
});

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
console.log('✅ Populated full account profile & admin credentials in settings.json!');
