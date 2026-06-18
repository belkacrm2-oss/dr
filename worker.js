/**
 * Cloudflare Worker — proxy for Ahrefs DR + Semrush Authority Score
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * Free tier: 100,000 requests/day
 *
 * Secrets: SEMRUSH_KEY
 * Response: GET /?target=example.com → { domain, dr, semrush_as }
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
    const debug  = url.searchParams.get('debug') === '1';

    if (!target) {
      return jsonResponse({ error: 'Missing target parameter' }, 400);
    }

    try {
      if (target.includes('://')) target = new URL(target).hostname;
      else if (target.includes('/')) target = target.split('/')[0];
      target = target.replace(/^www\./i, '').toLowerCase();
    } catch (_) {}

    const result = { domain: target };
    const tasks  = [];

    // ── Ahrefs DR ──
    tasks.push(
      fetch(`${AHREFS_BASE}?target=${encodeURIComponent(target)}&output=json`, {
        headers: { 'User-Agent': 'DR-Checker/1.16' },
      })
        .then(r => r.json())
        .then(data => {
          let dr = null;
          if (data && typeof data.domain_rating === 'number') {
            dr = data.domain_rating;
          } else if (data && data.domain_rating && typeof data.domain_rating.domain_rating === 'number') {
            dr = data.domain_rating.domain_rating;
          }
          result.dr = dr;
          if (data && data.error) result.dr_error = data.error;
        })
        .catch(err => { result.dr = null; result.dr_error = err.message; })
    );

    // ── Semrush AS ──
    const key = env && env.SEMRUSH_KEY;
    if (!key) {
      result.semrush_as    = null;
      result.semrush_error = 'SEMRUSH_KEY secret not configured';
    } else {
      tasks.push(
        fetch(
          `${SEMRUSH_BASE}/?type=domain_rank&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(target)}&database=us&export_columns=Dn,As`,
          { headers: { 'User-Agent': 'DR-Checker/1.16' } }
        )
          .then(r => r.text())
          .then(text => {
            // Always expose raw for debugging
            result.semrush_raw = text.slice(0, 300);

            const lines = text.trim().split('\n');
            if (lines.length >= 2) {
              // Try both ; and , as delimiters
              const line = lines[1];
              const cols = line.includes(';') ? line.split(';') : line.split(',');
              const as   = parseInt(cols[1], 10);
              result.semrush_as = isNaN(as) ? null : as;
              if (isNaN(as)) result.semrush_error = 'Could not parse AS from: ' + line;
            } else if (lines.length === 1) {
              // Single line — might be error message from Semrush
              result.semrush_as    = null;
              result.semrush_error = 'Single line response: ' + lines[0];
            } else {
              result.semrush_as    = null;
              result.semrush_error = 'Empty response from Semrush';
            }
          })
          .catch(err => { result.semrush_as = null; result.semrush_error = err.message; })
      );
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
