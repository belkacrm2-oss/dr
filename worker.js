/**
 * Cloudflare Worker — proxy for Ahrefs DR + Semrush Authority Score
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * Free tier: 100,000 requests/day
 *
 * Secrets (set via wrangler):
 *   wrangler secret put SEMRUSH_KEY
 *
 * Endpoints:
 *   GET /?target=example.com          → { domain, dr, semrush_as }
 *   GET /?target=example.com&src=dr   → { domain, dr } only
 *   GET /?target=example.com&src=as   → { domain, semrush_as } only
 */

const AHREFS_BASE  = 'https://api.ahrefs.com/v3/public/domain-rating-free';
const SEMRUSH_BASE = 'https://api.semrush.com';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url    = new URL(request.url);
    let   target = url.searchParams.get('target') || '';
    const src    = url.searchParams.get('src') || 'both'; // 'dr' | 'as' | 'both'

    if (!target) {
      return jsonResponse({ error: 'Missing target parameter' }, 400);
    }

    // Normalize — strip protocol, www, path
    try {
      if (target.includes('://')) target = new URL(target).hostname;
      else if (target.includes('/')) target = target.split('/')[0];
      target = target.replace(/^www\./i, '').toLowerCase();
    } catch (_) {}

    const result = { domain: target };

    // Run requests in parallel
    const tasks = [];

    if (src === 'dr' || src === 'both') {
      tasks.push(
        fetch(`${AHREFS_BASE}?target=${encodeURIComponent(target)}&output=json`, {
          headers: { 'User-Agent': 'DR-Checker/1.14' },
        })
          .then(r => r.json())
          .then(data => {
            const dr = data?.domain_rating ?? data?.domain_rating?.domain_rating ?? null;
            result.dr = typeof dr === 'number' ? dr : null;
          })
          .catch(() => { result.dr = null; })
      );
    }

    if (src === 'as' || src === 'both') {
      const key = env?.SEMRUSH_KEY;
      if (!key) {
        result.semrush_as = null;
        result.semrush_error = 'SEMRUSH_KEY secret not set';
      } else {
        tasks.push(
          fetch(
            `${SEMRUSH_BASE}/?type=domain_rank&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(target)}&database=us&export_columns=Dn,As`,
            { headers: { 'User-Agent': 'DR-Checker/1.14' } }
          )
            .then(r => r.text())
            .then(text => {
              // Semrush returns CSV: "Domain;Authority Score\nexample.com;67"
              const lines = text.trim().split('\n');
              if (lines.length >= 2) {
                const cols = lines[1].split(';');
                const as = parseInt(cols[1], 10);
                result.semrush_as = isNaN(as) ? null : as;
              } else {
                result.semrush_as = null;
              }
            })
            .catch(() => { result.semrush_as = null; })
        );
      }
    }

    await Promise.all(tasks);
    return jsonResponse(result);
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
