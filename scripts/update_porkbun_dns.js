const axios = require('axios');

/**
 * Automates adding SPF, DKIM, and DMARC TXT records to Porkbun for aethelonlabs.com.
 * Usage: node scripts/update_porkbun_dns.js <API_KEY> <SECRET_API_KEY> [DKIM_VALUE]
 */
async function addPorkbunDns(apiKey, secretApiKey, domain = 'aethelonlabs.com', dkimValue = '') {
  if (!apiKey || !secretApiKey) {
    console.error('❌ Porkbun API Key and Secret API Key are required.');
    console.log('Usage: node scripts/update_porkbun_dns.js <API_KEY> <SECRET_API_KEY>');
    process.exit(1);
  }

  const client = axios.create({
    baseURL: 'https://api.porkbun.com/api/json/v3',
    headers: { 'Content-Type': 'application/json' }
  });

  const records = [
    {
      name: '',
      type: 'TXT',
      content: 'v=spf1 include:_spf.google.com include:spf.mailserviceconnect.email mx a ~all',
      ttl: '300'
    },
    {
      name: '_dmarc',
      type: 'TXT',
      content: 'v=DMARC1; p=quarantine; fo=1; pct=100; rf=afrf; ri=86400; sp=quarantine; aspf=s; adkim=s',
      ttl: '300'
    }
  ];

  if (dkimValue) {
    records.push({
      name: 'google._domainkey',
      type: 'TXT',
      content: dkimValue.startsWith('v=DKIM1') ? dkimValue : `v=DKIM1; k=rsa; p=${dkimValue}`,
      ttl: '300'
    });
  }

  console.log(`🚀 Adding DNS records to Porkbun for ${domain}...`);

  for (const rec of records) {
    try {
      const payload = {
        secretapikey: secretApiKey,
        apikey: apiKey,
        name: rec.name,
        type: rec.type,
        content: rec.content,
        ttl: rec.ttl
      };
      const res = await client.post(`/dns/create/${domain}`, payload);
      if (res.data.status === 'SUCCESS') {
        console.log(`  ✅ Added ${rec.type} record for '${rec.name || '@'}': ID ${res.data.id}`);
      } else {
        console.warn(`  ⚠️ Warning for '${rec.name || '@'}':`, res.data.message);
      }
    } catch (err) {
      console.error(`  ❌ Failed to add '${rec.name || '@'}':`, err.response?.data?.message || err.message);
    }
  }

  console.log('\n🎉 Porkbun DNS Update Complete!');
}

const apiKey = process.argv[2] || process.env.PORKBUN_API_KEY;
const secretApiKey = process.argv[3] || process.env.PORKBUN_SECRET_KEY;
const dkimValue = process.argv[4] || process.env.DKIM_VALUE;

if (apiKey && secretApiKey) {
  addPorkbunDns(apiKey, secretApiKey, 'aethelonlabs.com', dkimValue);
}

module.exports = { addPorkbunDns };
