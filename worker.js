/**
 * Cloudflare Worker — proxy for Ahrefs DR + Semrush Authority Score
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * v1.18 — correct Semrush endpoint for Authority Score
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
        headers: { 'User-Agent': 'DR-Checker/1.18' },
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
    const key = env?.SEMRUSH_KEY;
    if (!key) {
      result.semrush_as = null;
      result.semrush_error = 'NO_KEY';
    } else {
      tasks.push(
        fetch(`${SEMRUSH_BASE}/?type=domain_authority_score&key=${encodeURIComponent(key)}&domain=${encodeURIComponent(target)}`, {
          headers: { 'User-Agent': 'DR-Checker/1.18' },
        })
          .then(r => r.text())
          .then(text => {
            result.semrush_raw = text.slice(0, 300);
            const lines = text.trim().split('\n');
            if (lines.length >= 2) {
              const sep  = lines[0].includes(';') ? ';' : ',';
              const hdrs = lines[0].split(sep).map(h => h.trim().toLowerCase());
              const vals = lines[1].split(sep);
              // Find AS column
              const asKeys = ['authority score', 'authority_score', 'score', 'as'];
              let asIdx = -1;
              for (const k of asKeys) { asIdx = hdrs.indexOf(k); if (asIdx !== -1) break; }
              if (asIdx !== -1) {
                const as = parseInt(vals[asIdx], 10);
                result.semrush_as = isNaN(as) ? null : as;
              } else {
                result.semrush_as      = null;
                result.semrush_headers = hdrs;
                result.semrush_error   = 'AS column not found';
              }
            } else {
              result.semrush_as    = null;
              result.semrush_error = 'bad_response: ' + text.slice(0, 100);
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
