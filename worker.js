/**
 * Cloudflare Worker — CORS proxy for Ahrefs Domain Rating free API
 * Deployed at: https://purple-rice-39b2.belkacrm2.workers.dev
 * Free tier: 100,000 requests/day
 */

const AHREFS_BASE = 'https://ahrefs.com/v3/public/domain-rating-free';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    let target = url.searchParams.get('target') || '';

    if (!target) {
      return jsonResponse({ error: 'Missing target parameter' }, 400);
    }

    // Strip protocol and path — Ahrefs wants only the hostname
    try {
      if (target.includes('://')) {
        target = new URL(target).hostname;
      } else if (target.includes('/')) {
        target = target.split('/')[0];
      }
      // Remove www. prefix
      target = target.replace(/^www\./, '');
    } catch (e) {
      // keep original if parsing fails
    }

    try {
      const apiUrl = `${AHREFS_BASE}?target=${encodeURIComponent(target)}&output=json`;
      const resp = await fetch(apiUrl, {
        headers: { 'User-Agent': 'DR-Checker/1.0' },
      });
      const data = await resp.json();
      return jsonResponse(data, resp.status);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
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
