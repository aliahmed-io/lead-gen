'use strict';

// Resolves which URL variant of a business website actually answers, and classifies why not.
async function probeSite(website, { fetchPage, host, signal }) {
  const base = host(website);
  const hadWww = /^(?:https?:\/\/)?www\./i.test(String(website));
  const hosts = hadWww ? ['www.' + base, base] : [base, 'www.' + base];
  const variants = [];
  for (const protocol of ['https', 'http']) for (const name of hosts) variants.push(protocol + '://' + name + '/');
  const errors = []; let blocked = null, httpError = null;
  for (const variant of variants) {
    if (signal?.aborted) break;
    try {
      const response = await fetchPage(variant, { signal, timeoutMs: 15000 });
      if (response.status >= 200 && response.status < 300) {
        return { state: 'live', retryable: false, origin: new URL(response.url || variant).origin, finalUrl: response.url || variant, finalDomain: host(response.url || variant), requestedDomain: base, domainChanged: host(response.url || variant) !== base, redirectChain: response.chain || [], html: response.text, headers: response.headers || {}, errors };
      }
      if ([401, 403, 429, 503].includes(response.status)) {
        const header = response.headers?.['retry-after'];
        const delay = /^\d+$/.test(String(header || '')) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now()) || 0;
        blocked = blocked || { variant, status: response.status, retryAfterMs: Math.min(delay, 86400000) };
        if (response.status === 429) return { requestedDomain: base, errors, state: 'blocked', retryable: true, detail: 'HTTP 429', retryAfterMs: blocked.retryAfterMs };
      }
      else httpError = httpError || { variant, status: response.status };
    } catch (error) { errors.push({ variant, kind: error.kind || 'error', message: String(error.message).slice(0, 160) }); }
  }
  const base_ = { requestedDomain: base, errors };
  if (blocked) return { ...base_, state: 'blocked', retryable: true, detail: 'HTTP ' + blocked.status, retryAfterMs: blocked.retryAfterMs };
  if (httpError) return { ...base_, state: 'http-error', retryable: httpError.status >= 500, detail: 'HTTP ' + httpError.status };
  const kinds = errors.map(e => e.kind);
  if (kinds.length && kinds.every(k => k === 'dns')) return { ...base_, state: 'dns-dead', retryable: true };
  if (kinds.includes('timeout')) return { ...base_, state: 'timeout', retryable: true };
  if (kinds.length && kinds.every(k => ['tls', 'dns'].includes(k))) return { ...base_, state: 'tls-broken', retryable: false };
  if (kinds.includes('redirect-loop')) return { ...base_, state: 'redirect-loop', retryable: false };
  if (kinds.includes('too-large')) return { ...base_, state: 'too-large', retryable: false };
  return { ...base_, state: 'unreachable', retryable: true };
}

module.exports = { probeSite };
