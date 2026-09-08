const HOSTS = new Set(['site.web.api.espn.com', 'site.api.espn.com', 'sports.core.api.espn.com', 'gamma-api.polymarket.com']);

export function safeReference(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid provider reference URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !HOSTS.has(url.hostname) || url.username || url.password || url.port && url.port !== '80') {
    throw new Error('Unsafe provider reference host, port or URL');
  }
  if (url.protocol === 'https:' && url.port) throw new Error('Unsafe provider reference port');
  url.port = '';
  url.protocol = 'https:';
  url.hash = '';
  return url.href;
}

export async function mapLimit(values, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Concurrency must be a positive integer');
  const result = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      result[index] = await fn(values[index], index);
    }
  }));
  return result;
}

export function createHttpClient({ fetchImpl = fetch, timeoutMs = 15000, maxBytes = 8 * 1024 * 1024 } = {}) {
  const cache = new Map();
  return function getJson(input) {
    const url = safeReference(input);
    if (!cache.has(url)) {
      cache.set(url, (async () => {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
          headers: { Accept: 'application/json', 'User-Agent': 'NFL-Season-Tracker/3 (public snapshot capture)' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}${new URL(url).pathname}`);
        if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Provider response too large');
        let size = 0;
        const chunks = [];
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) throw new Error('Provider response too large');
          chunks.push(Buffer.from(chunk));
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      })());
    }
    return cache.get(url);
  };
}
