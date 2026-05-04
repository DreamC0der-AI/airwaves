// Cloudflare Worker proxy in front of radio.garden — adds permissive CORS so the
// static Pages site can reach the API. Source: ../../worker/src/index.ts
const BASE = "https://airwaves-proxy.akagishigerutokyo.workers.dev";

export const RG_API = `${BASE}/api`;
export const RG_CONTENT = `${BASE}/api/ara/content`;
