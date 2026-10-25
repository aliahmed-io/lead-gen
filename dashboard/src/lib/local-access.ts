// This policy is checked in both Proxy and the API handlers. The dashboard
// launcher binds to loopback before enabling password-free local access.
export function localOnlyEnabled(): boolean {
  return process.env.LEADGEN_LOCAL_ONLY === '1';
}

function loopbackAddress(value: string): boolean {
  return ['127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(value.toLowerCase());
}

function localAuthority(value: string): boolean {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(value)) return false;
  try {
    const url = new URL('http://' + value);
    return !url.port || Number(url.port) > 0;
  } catch {
    return false;
  }
}

export function trustedLocalRequest(request: Request): boolean {
  if (!localOnlyEnabled()) return false;
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host') || '';
    if (!['http:', 'https:'].includes(url.protocol) || !localAuthority(host) || !localAuthority(url.host)) return false;
    // Next.js adds forwarded headers for direct local requests. Accept only
    // matching loopback values; reject public proxies and forwarding chains.
    if (request.headers.has('forwarded')) return false;
    const forwardedHost = request.headers.get('x-forwarded-host');
    if (forwardedHost && forwardedHost.toLowerCase() !== host.toLowerCase()) return false;
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor && !forwardedFor.split(',').every(value => loopbackAddress(value.trim()))) return false;
    const forwardedProto = request.headers.get('x-forwarded-proto');
    if (forwardedProto && forwardedProto !== url.protocol.slice(0, -1)) return false;
    const expectedOrigin = new URL(url.protocol + '//' + host);
    const forwardedPort = request.headers.get('x-forwarded-port');
    if (forwardedPort && forwardedPort !== (expectedOrigin.port || (url.protocol === 'https:' ? '443' : '80'))) return false;
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return false;
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).origin !== expectedOrigin.origin) return false;
    return true;
  } catch {
    return false;
  }
}
