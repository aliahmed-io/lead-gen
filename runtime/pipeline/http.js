'use strict';
const https = require('node:https');
const http = require('node:http');
const zlib = require('node:zlib');
const { resolvePublic, pinnedLookup } = require('../network');
const USER_AGENT = 'Mozilla/5.0 (compatible; LeadGenResearch/3.0; read-only public business research)';
class FetchError extends Error {
  constructor(message, kind, retryable) { super(message); this.name = 'FetchError'; this.kind = kind; this.retryable = retryable; }
}
function toFetchError(error) {
  if (error instanceof FetchError) return error;
  const code = String(error.code || ''), message = String(error.message || error), both = code + ' ' + message;
  if (['ENOTFOUND', 'ENODATA'].includes(code)) return new FetchError(message, 'dns', false);
  if (code === 'EAI_AGAIN') return new FetchError(message, 'dns-temporary', true);
  if (/Only public network/i.test(message)) return new FetchError(message, 'private-address', false);
  if (/certificate|CERT_|DEPTH_ZERO|UNABLE_TO_VERIFY|altnames|self[- ]signed/i.test(both)) return new FetchError(message, 'tls', false);
  if (['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return new FetchError(message, 'refused', true);
  if (/timed? ?out|deadline|ETIMEDOUT/i.test(both)) return new FetchError(message, 'timeout', true);
  if (/exceeds|too.large/i.test(message)) return new FetchError(message, 'too-large', false);
  if (/cancel|abort/i.test(message)) return new FetchError(message, 'cancelled', true);
  return new FetchError(message, 'reset', true);
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { cleanup(); reject(signal.reason || new FetchError('Website research cancelled', 'cancelled', true)); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    Promise.resolve(promise).then(v => { cleanup(); resolve(v); }, e => { cleanup(); reject(e); });
  });
}
function createFetcher({ resolveHost = resolvePublic, requestFactory } = {}) {
  function once(url, { signal, timeoutMs, maxBytes }) {
    return new Promise((resolve, reject) => {
      let request, response, decoded, settled = false;
      const cleanup = () => signal.removeEventListener('abort', cancel);
      const finish = (error, result) => {
        if (settled) return; settled = true; cleanup();
        if (error) { decoded?.destroy(); response?.destroy(); request?.destroy(); reject(toFetchError(error)); }
        else resolve(result);
      };
      const cancel = () => finish(signal.reason || new FetchError('Website research cancelled', 'cancelled', true));
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) { cancel(); return; }
      abortable(resolveHost(url.hostname), signal).then(record => {
        if (signal.aborted || settled) return;
        const factory = requestFactory || ((u, o, cb) => (u.protocol === 'https:' ? https : http).get(u, o, cb));
        request = factory(url, {
          agent: false, lookup: pinnedLookup(record), timeout: timeoutMs,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5', 'Accept-Language': 'en', 'Accept-Encoding': 'gzip, deflate, br' },
        }, incoming => {
          response = incoming;
          if (settled || signal.aborted) { incoming.destroy(); return; }
          const status = incoming.statusCode, location = incoming.headers.location;
          if (status >= 300 && status < 400 && location) {
            incoming.destroy();
            try { finish(null, { status, headers: incoming.headers, redirect: new URL(location, url).href, url: url.href, text: '', contentType: '' }); }
            catch (error) { finish(error); }
            return;
          }
          const contentType = String(incoming.headers['content-type'] || '');
          if (status >= 200 && status < 300 && contentType && !/text|json|xml|html/i.test(contentType)) {
            incoming.destroy(); finish(null, { status, headers: incoming.headers, url: url.href, text: '', contentType }); return;
          }
          const encoding = String(incoming.headers['content-encoding'] || '').toLowerCase();
          decoded = encoding === 'gzip' ? incoming.pipe(zlib.createGunzip()) : encoding === 'deflate' ? incoming.pipe(zlib.createInflate()) : encoding === 'br' ? incoming.pipe(zlib.createBrotliDecompress()) : incoming;
          const limit = status >= 200 && status < 300 ? maxBytes : Math.min(maxBytes, 65536);
          let size = 0; const chunks = [];
          decoded.on('data', chunk => {
            size += chunk.length;
            if (size > limit) { finish(new FetchError('Website response exceeds size limit', 'too-large', false)); return; }
            chunks.push(chunk);
          });
          decoded.on('end', () => {
            if (incoming.complete === false) { finish(new FetchError('Truncated HTTP response', 'truncated', true)); return; }
            finish(null, { status, headers: incoming.headers, url: url.href, text: Buffer.concat(chunks).toString('utf8'), contentType });
          });
          decoded.on('error', finish);
          incoming.on('aborted', () => finish(new FetchError('Truncated HTTP response', 'truncated', true)));
          incoming.on('error', finish);
          decoded.on('close', () => { if (!settled && !decoded.readableEnded) finish(new FetchError('Response closed before completion', 'truncated', true)); });
        });
        request.on('timeout', () => finish(new FetchError('Website request timed out', 'timeout', true)));
        request.on('error', finish);
        if (signal.aborted) cancel();
      }, finish).catch(finish);
    });
  }
  return async function fetchPage(raw, { signal, timeoutMs = 15000, totalTimeoutMs = timeoutMs * 2, maxBytes = 6 * 1024 * 1024, maxRedirects = 6 } = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort(new FetchError('Website research cancelled', 'cancelled', true));
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(new FetchError('Website total deadline exceeded', 'timeout', true)), totalTimeoutMs);
    try {
      let url;
      try { url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { throw new FetchError('Invalid website URL', 'invalid-url', false); }
      const chain = [];
      for (let hop = 0; hop <= maxRedirects; hop++) {
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !['', '80', '443'].includes(url.port)) throw new FetchError('Invalid website URL', 'invalid-url', false);
        const response = await once(url, { signal: controller.signal, timeoutMs, maxBytes });
        if (response.redirect) { chain.push(url.href); url = new URL(response.redirect); continue; }
        return { ...response, chain };
      }
      throw new FetchError('Too many redirects', 'redirect-loop', false);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
}
const fetchPage = createFetcher();
module.exports = { fetchPage, createFetcher, FetchError, toFetchError, USER_AGENT };
