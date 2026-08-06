const axios = require('axios');

/**
 * Automates adding SPF, DKIM, and DMARC TXT records to Cloudflare for a domain.
 * Requires process.env.CLOUDFLARE_API_TOKEN or token passed as parameter.
 */
async function addDnsRecords(apiToken, domainName = 'aethelonlabs.com', dkimValue = '') {
  if (!apiToken) {
    console.error('❌ Cloudflare API Token is required.');
    process.exit(1);
  }

  const cf = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });

  try {
    console.log(`🔍 Fetching Zone ID for domain: ${domainName}...`);
    const zonesRes = await cf.get(`/zones?name=${domainName}`);
    const zone = zonesRes.data.result[0];

    if (!zone) {
      throw new Error(`Domain "${domainName}" was not found in your Cloudflare account.`);
    }

    const zoneId = zone.id;
    console.log(`✅ Found Zone ID: ${zoneId}`);

    const recordsToAdd = [
      {
        type: 'TXT',
        name: '@',
        content: 'v=spf1 include:_spf.google.com include:spf.mailserviceconnect.email mx a ~all',
        ttl: 3600,
        comment: 'Outbound Email Platform SPF Record'
      },
      {
        type: 'TXT',
        name: '_dmarc',
        content: 'v=DMARC1; p=quarantine; fo=1; pct=100; rf=afrf; ri=86400; sp=quarantine; aspf=s; adkim=s',
        ttl: 3600,
        comment: 'Outbound Email Platform DMARC Record'
      }
    ];

    if (dkimValue) {
      recordsToAdd.push({
        type: 'TXT',
        name: 'google._domainkey',
        content: dkimValue.startsWith('v=DKIM1') ? dkimValue : `v=DKIM1; k=rsa; p=${dkimValue}`,
        ttl: 3600,
        comment: 'Outbound Email Platform Google DKIM Record'
      });
    }

    for (const rec of recordsToAdd) {
      try {
        console.log(`Adding ${rec.name} TXT record...`);
        const res = await cf.post(`/zones/${zoneId}/dns_records`, rec);
        console.log(`  ✅ Added TXT record (${rec.name}): ID ${res.data.result.id}`);
      } catch (err) {
        console.warn(`  ⚠️ Notice for ${rec.name}:`, err.response?.data?.errors?.[0]?.message || err.message);
      }
    }

    console.log(`\n🎉 DNS Records updated successfully on Cloudflare for ${domainName}!`);
  } catch (err) {
    console.error(`❌ Cloudflare DNS update failed:`, err.response?.data?.errors?.[0]?.message || err.message);
  }
}

const tokenFromArg = process.argv[2] || process.env.CLOUDFLARE_API_TOKEN;
const dkimFromArg = process.argv[3] || process.env.DKIM_VALUE;

if (tokenFromArg) {
  addDnsRecords(tokenFromArg, 'aethelonlabs.com', dkimFromArg);
}

module.exports = { addDnsRecords };
