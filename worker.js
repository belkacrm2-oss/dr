/**
 * Cloudflare Worker — CORS proxy for Ahrefs Domain Rating free API
 * Deploy at: https://dash.cloudflare.com/ -> Workers & Pages -> Create Worker
 * After deploy, set WORKER_URL in index.html to your worker URL.
 *
 * Free tier: 100,000 requests/day
 */

const AHREFS_BASE = 'https://ahrefs.com/v3/public/domain-rating-free';

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('target');

    if (!target) {
      return jsonResponse({ error: 'Missing target parameter' }, 400);
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
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
