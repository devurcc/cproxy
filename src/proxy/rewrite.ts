import { resolveUpstreamModel } from "../config/mapping";
import type { CproxyConfig } from "../config/schema";

export type MessagesRequestMeta = {
  incoming?: string;
  resolved?: string;
  stream?: boolean;
};

export async function peekMessagesRequestMeta(
  request: Request,
  config: CproxyConfig,
): Promise<MessagesRequestMeta | null> {
  const method = request.method.toUpperCase();
  if (method !== "POST") return null;
  const url = new URL(request.url);
  if (!url.pathname.includes("/v1/messages")) return null;
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    const raw = await request.clone().text();
    const j = JSON.parse(raw) as { model?: string; stream?: boolean };
    const incoming = typeof j.model === "string" ? j.model : undefined;
    const resolved = incoming ? resolveUpstreamModel(incoming, config) : undefined;
    return { incoming, resolved, stream: !!j.stream };
  } catch {
    return null;
  }
}

const HOP_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

export function buildUpstreamHeaders(request: Request, apiKey: string): Headers {
  const h = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lk = key.toLowerCase();
    if (lk === "authorization" || lk === "x-api-key") continue;
    if (HOP_SKIP.has(lk)) continue;
    h.append(key, value);
  }
  h.set("Authorization", `Bearer ${apiKey}`);
  return h;
}

export async function buildUpstreamBody(
  request: Request,
  config: CproxyConfig,
): Promise<BodyInit | undefined> {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const url = new URL(request.url);
  const ct = request.headers.get("content-type") ?? "";

  if (ct.includes("application/json") && url.pathname.includes("/v1/messages")) {
    const raw = await request.text();
    try {
      const j = JSON.parse(raw) as { model?: string };
      if (typeof j.model === "string") {
        j.model = resolveUpstreamModel(j.model, config);
      }
      return JSON.stringify(j);
    } catch {
      return raw;
    }
  }

  const buf = await request.arrayBuffer();
  return buf.byteLength ? buf : undefined;
}

export function upstreamUrl(request: Request): string {
  const u = new URL(request.url);
  return `https://ollama.com${u.pathname}${u.search}`;
}
