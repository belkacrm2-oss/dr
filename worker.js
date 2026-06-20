/**
 * Cloudflare Worker — proxy for Ahrefs DR + Semrush Authority Score
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * v1.22 — fixed Ahrefs nested parse + Semrush correct endpoint
 */

const AHREFS_BASE  = 'https://api.ahrefs.com/v3/public/domain-rating-free';
const SEMRUSH_BASE = 'https://api.semrush.com';
const ALLOWED_ORIGIN = 'https://belkacrm2-oss.github.io';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url    = new URL(request.url);
    let   target = url.searchParams.get('target') || '';

    if (!target) return jsonResponse({ error: 'Missing target' }, 400, origin);

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
        headers: { 'User-Agent': 'DR-Checker/1.22' },
      })
        .then(r => {
          if (!r.ok) throw new Error(`Ahrefs HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          let dr = null;
          // Response shape: { domain_rating: { domain_rating: 91.0, license: "..." } }
          if (data?.domain_rating && typeof data.domain_rating.domain_rating === 'number') {
            dr = data.domain_rating.domain_rating;
          } else if (typeof data?.domain_rating === 'number') {
            dr = data.domain_rating;
          }
          result.dr = dr;
          if (data?.error) result.dr_error = data.error;
        })
        .catch(err => { result.dr = null; result.dr_error = err.message; })
    );

    // ── Semrush Authority Score ──
    // Uses domain_rank type with export_columns=Dn,As
    // 'As' column = Authority Score in Semrush Analytics API
    const key = env?.SEMRUSH_KEY;
    if (!key) {
      result.semrush_as = null;
      result.semrush_error = 'NO_KEY';
    } else {
      tasks.push(
        fetch(
          `${SEMRUSH_BASE}/?type=domain_rank&key=${encodeURIComponent(key)}&export_columns=Dn,As&domain=${encodeURIComponent(target)}`,
          { headers: { 'User-Agent': 'DR-Checker/1.22' } }
        )
          .then(r => r.text())
          .then(text => {
            const trimmed = text.trim();

            // Error response: "ERROR N :: ..."
            if (trimmed.startsWith('ERROR')) {
              result.semrush_as    = null;
              result.semrush_error = trimmed.slice(0, 80);
              return;
            }

            const lines = trimmed.split(/\r?\n/);
            if (lines.length < 2) {
              result.semrush_as    = null;
              result.semrush_error = 'empty_response';
              return;
            }

            // Semrush uses semicolons as delimiter
            const sep  = lines[0].includes(';') ? ';' : ',';
            const hdrs = lines[0].split(sep).map(h => h.trim().toLowerCase());
            const vals = lines[1].split(sep);

            // 'As' column in response is lowercase 'as'
            const asKeys = ['as', 'authority score', 'authority_score', 'score'];
            let asIdx = -1;
            for (const k of asKeys) { asIdx = hdrs.indexOf(k); if (asIdx !== -1) break; }

            if (asIdx !== -1) {
              const as = parseInt(vals[asIdx], 10);
              result.semrush_as = isNaN(as) ? null : as;
            } else {
              result.semrush_as    = null;
              result.semrush_error = 'col_not_found:' + hdrs.join(',');
            }
          })
          .catch(err => { result.semrush_as = null; result.semrush_error = err.message; })
      );
    }

    await Promise.all(tasks);
    return jsonResponse(result, 200, origin);
  },
};

function corsHeaders(origin) {
  // Allow the GitHub Pages origin + local dev
  const allowed = [ALLOWED_ORIGIN, 'http://localhost', 'http://127.0.0.1'];
  const isAllowed = allowed.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function jsonResponse(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
