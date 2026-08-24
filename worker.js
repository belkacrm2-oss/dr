const AHREFS_ENDPOINT = 'https://api.ahrefs.com/v3/public/domain-rating-free';
const ALLOWED_ORIGIN = 'https://belkacrm2-oss.github.io';
const CACHE_TTL_SECONDS = 21600;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeDomain(value) {
  let input = String(value || '').trim().toLowerCase();
  if (!input) throw new Error('Укажите домен');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let hostname;
  try {
    hostname = new URL(input).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw new Error('Некорректный домен');
  }

  if (
    hostname.length > 253 ||
    !hostname.includes('.') ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    hostname.split('.').some((part) => !part || part.length > 63 || part.startsWith('-') || part.endsWith('-'))
  ) {
    throw new Error('Некорректный домен');
  }
  return hostname;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: 'Origin not allowed' }, 403, origin);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }
    if (!env.AHREFS_API_KEY) {
      return json({ error: 'Сервис временно не настроен' }, 503, origin);
    }

    let domain;
    try {
      domain = normalizeDomain(new URL(request.url).searchParams.get('target'));
    } catch (error) {
      return json({ error: error.message }, 422, origin);
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.search = `?target=${encodeURIComponent(domain)}`;
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;

    let upstream;
    try {
      upstream = await fetch(`${AHREFS_ENDPOINT}?target=${encodeURIComponent(domain)}`, {
        headers: {
          Authorization: `Bearer ${env.AHREFS_API_KEY}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      return json({ error: 'Ahrefs временно недоступен' }, 504, origin);
    }

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: status === 429 ? 'Лимит Ahrefs временно исчерпан' : 'Не удалось получить данные Ahrefs' }, status, origin);
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return json({ error: 'Некорректный ответ Ahrefs' }, 502, origin);
    }

    const rating = data && typeof data.domain_rating === 'object'
      ? data.domain_rating
      : data;
    const dr = Number(rating?.domain_rating);
    if (!Number.isFinite(dr)) {
      return json({ error: 'Ahrefs не вернул рейтинг домена' }, 502, origin);
    }

    const response = new Response(JSON.stringify({
      domain,
      dr,
      ahrefs_status: 'ok',
    }), {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });

    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  },
};
