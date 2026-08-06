const dns = require('dns').promises;

const selectors = [
  'google', 'mail', 'k1', 's1', 's2048', 's1024', 'smtp', 'default', 'porkbun', 'mailpool', 'instantly', 'smartlead', 'sendgrid', 'mandrill'
];

async function checkSelectors() {
  console.log('🔍 Checking common DKIM selectors for aethelonlabs.com...');
  for (const s of selectors) {
    try {
      const records = await dns.resolveTxt(`${s}._domainkey.aethelonlabs.com`);
      const txt = records.map(r => r.join('')).join('');
      if (txt.includes('v=DKIM1') || txt.includes('p=')) {
        console.log(`✅ FOUND DKIM KEY on selector "${s}":`, txt);
        return txt;
      }
    } catch (e) {}
  }
  console.log('❌ No existing DKIM key found on common selectors.');
  return null;
}

checkSelectors();
