const dns = require('dns').promises;

/**
 * Checks SPF record for a domain.
 * Looks for a TXT record starting with "v=spf1".
 */
async function checkSPF(domain) {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(r => r.join('')).join('\n');
    const spfRecord = records.find(r => r.join('').startsWith('v=spf1'));

    if (spfRecord) {
      const value = spfRecord.join('');
      const includesGoogle =
        value.includes('include:_spf.google.com') ||
        value.includes('include:google.com');

      return {
        pass: true,
        includesGoogle,
        record: value,
        warning: !includesGoogle
          ? 'SPF found but does not explicitly include Google mail servers.'
          : null,
      };
    }

    return { pass: false, record: null, warning: 'No SPF record found.' };
  } catch (err) {
    return { pass: false, record: null, warning: `DNS lookup failed: ${err.message}` };
  }
}

/**
 * Checks DMARC record for a domain.
 * Looks for a TXT record at _dmarc.<domain>.
 */
async function checkDMARC(domain) {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records.find(r => r.join('').startsWith('v=DMARC1'));

    if (dmarcRecord) {
      const value = dmarcRecord.join('');
      const policy = value.match(/p=([^;]+)/)?.[1] || 'none';

      return {
        pass: true,
        policy,
        record: value,
        warning: policy === 'none'
          ? 'DMARC policy is "none" — emails are monitored but not enforced. Consider upgrading to "quarantine".'
          : null,
      };
    }

    return { pass: false, record: null, warning: 'No DMARC record found.' };
  } catch (err) {
    return { pass: false, record: null, warning: `DNS lookup failed: ${err.message}` };
  }
}

/**
 * Checks MX records exist for a domain.
 * If no MX records exist the domain cannot receive email.
 */
async function checkMX(domain) {
  try {
    const records = await dns.resolveMx(domain);
    if (records && records.length > 0) {
      return { pass: true, records: records.map(r => r.exchange) };
    }
    return { pass: false, records: [], warning: 'No MX records found.' };
  } catch (err) {
    return { pass: false, records: [], warning: `MX lookup failed: ${err.message}` };
  }
}

/**
 * Runs a full DNS preflight check on a sending domain.
 * Returns a structured result with pass/fail per check and an overall health score.
 *
 * @param {string} emailAddress - full email address e.g. ali@aethelonlabs.com
 * @returns {Promise<DnsCheckResult>}
 */
async function runPreflightCheck(emailAddress) {
  const domain = emailAddress.split('@')[1];

  if (!domain) {
    return {
      domain: null,
      overall: 'fail',
      spf: { pass: false, warning: 'Could not extract domain from email address.' },
      dmarc: { pass: false, warning: 'Could not extract domain from email address.' },
      mx: { pass: false, warning: 'Could not extract domain from email address.' },
      summary: 'Invalid email address format.',
    };
  }

  const [spf, dmarc, mx] = await Promise.all([
    checkSPF(domain),
    checkDMARC(domain),
    checkMX(domain),
  ]);

  const criticalFails = [!spf.pass, !dmarc.pass, !mx.pass].filter(Boolean).length;
  const warnings = [spf.warning, dmarc.warning, mx.warning].filter(Boolean);

  let overall = 'good';
  if (criticalFails >= 2) overall = 'fail';
  else if (criticalFails === 1 || warnings.length > 0) overall = 'warning';

  return {
    domain,
    overall,  // 'good' | 'warning' | 'fail'
    spf,
    dmarc,
    mx,
    summary: criticalFails === 0
      ? warnings.length > 0
        ? `DNS is configured but has ${warnings.length} warning(s).`
        : 'All DNS records are correctly configured.'
      : `${criticalFails} critical DNS record(s) are missing. Deliverability will be severely impacted.`,
    checkedAt: Date.now(),
  };
}

module.exports = { runPreflightCheck, checkSPF, checkDMARC, checkMX };
