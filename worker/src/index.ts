// Cloudflare Worker — CORS proxy for radio.garden API.
// Frontend (Pages site) calls https://airwaves-proxy.<subdomain>.workers.dev/api/...
// We forward to https://radio.garden/api/... server-to-server (no CORS in S2S),
// then return the response with `Access-Control-Allow-Origin: *`.

const UPSTREAM = "https://radio.garden";

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const target = `${UPSTREAM}${url.pathname}${url.search}`;

    const upstreamResp = await fetch(target, {
      method: request.method,
      headers: { "user-agent": "Mozilla/5.0 (airwaves-proxy)" },
      redirect: "follow",
    });

    const headers = new Headers(upstreamResp.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    headers.delete("access-control-allow-credentials");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers,
    });
  },
};
