const dns = require('dns').promises;

const domains = [
  'tryaethelon.com',
  'aethelonlabs.com',
  'aethelonstudio.com',
  'getaethelon.com',
  'aethelonhq.com',
  'aethelonmail.com'
];

async function checkDomain(domain) {
  console.log(`\n========================================`);
  console.log(`🌐 DNS HEALTH REPORT FOR: ${domain}`);
  console.log(`========================================`);

  // 1. SPF Check
  try {
    const txts = await dns.resolveTxt(domain);
    const spf = txts.map(r => r.join('')).find(r => r.startsWith('v=spf1'));
    if (spf) {
      console.log(`✅ SPF Record Found: "${spf}"`);
    } else {
      console.log(`❌ SPF Record MISSING on ${domain}`);
    }
  } catch (err) {
    console.log(`❌ SPF Lookup Failed: ${err.message}`);
  }

  // 2. DKIM Check (Google selector: google._domainkey)
  try {
    const dkimTxts = await dns.resolveTxt(`google._domainkey.${domain}`);
    const dkim = dkimTxts.map(r => r.join('')).find(r => r.includes('v=DKIM1') || r.includes('p='));
    if (dkim) {
      console.log(`✅ DKIM Record Found (google._domainkey): "${dkim.substring(0, 60)}..."`);
    } else {
      console.log(`❌ DKIM Record MISSING on google._domainkey.${domain}`);
    }
  } catch (err) {
    console.log(`❌ DKIM Lookup Failed for google._domainkey.${domain}: ${err.message}`);
  }

  // 3. DMARC Check
  try {
    const dmarcTxts = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarc = dmarcTxts.map(r => r.join('')).find(r => r.startsWith('v=DMARC1'));
    if (dmarc) {
      console.log(`✅ DMARC Record Found: "${dmarc}"`);
    } else {
      console.log(`❌ DMARC Record MISSING on _dmarc.${domain}`);
    }
  } catch (err) {
    console.log(`❌ DMARC Lookup Failed for _dmarc.${domain}: ${err.message}`);
  }
}

async function main() {
  for (const d of domains) {
    await checkDomain(d);
  }
}

main();
