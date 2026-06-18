/**
 * Cloudflare Worker — proxy for Ahrefs DR + Semrush Authority Score
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * v1.17 — fixed Semrush field name for Authority Score
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

    if (!target) return jsonResponse({ error: 'Missing target' }, 400);

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
        headers: { 'User-Agent': 'DR-Checker/1.17' },
      })
        .then(r => r.json())
        .then(data => {
          let dr = null;
          if (data && typeof data.domain_rating === 'number') dr = data.domain_rating;
          else if (data?.domain_rating && typeof data.domain_rating.domain_rating === 'number') dr = data.domain_rating.domain_rating;
          result.dr = dr;
          if (data?.error) result.dr_error = data.error;
        })
        .catch(err => { result.dr = null; result.dr_error = err.message; })
    );

    // ── Semrush Authority Score ──
    // Correct field name is "as_score" or fetched via domain_rank with all columns
    const key = env?.SEMRUSH_KEY;
    if (!key) {
      result.semrush_as = null;
      result.semrush_error = 'NO_KEY';
    } else {
      tasks.push(
        // Request ALL columns so we can see what Semrush actually returns
        fetch(`${SEMRUSH_BASE}/?type=domain_rank&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(target)}&database=us`, {
          headers: { 'User-Agent': 'DR-Checker/1.17' },
        })
          .then(r => r.text())
          .then(text => {
            result.semrush_raw = text.slice(0, 500);

            const lines = text.trim().split('\n');
            if (lines.length < 2) {
              result.semrush_as = null;
              result.semrush_error = 'bad_response';
              return;
            }

            // Parse header row to find the Authority Score column
            const sep     = lines[0].includes(';') ? ';' : ',';
            const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
            const vals    = lines[1].split(sep);

            // Semrush Authority Score column names (try all known variants)
            const asKeys = ['authority score', 'authority_score', 'as', 'as_score', 'domain authority score'];
            let asIdx = -1;
            for (const k of asKeys) {
              asIdx = headers.indexOf(k);
              if (asIdx !== -1) break;
            }

            if (asIdx !== -1) {
              const as = parseInt(vals[asIdx], 10);
              result.semrush_as = isNaN(as) ? null : as;
            } else {
              // Expose headers so we know exact column names
              result.semrush_as      = null;
              result.semrush_headers = headers;
              result.semrush_error   = 'AS column not found';
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
