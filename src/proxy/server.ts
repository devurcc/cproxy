import { html } from "@elysiajs/html";
import { Elysia } from "elysia";
import { renderAnalyticsPage } from "../analytics/dashboard";
import { analyticsSseSubscribe, analyticsSseUnsubscribe } from "../analytics/sse";
import {
  getSnapshot,
  recordDashboardHit,
  recordHealthHit,
  recordModelInference,
  recordUpstream,
  recordUpstreamError,
  recordWebToolScan,
} from "../analytics/store";
import type { CproxyConfig } from "../config/schema";
import {
  buildUpstreamBody,
  buildUpstreamHeaders,
  peekMessagesRequestMeta,
  upstreamUrl,
} from "./rewrite";
import { attachInferenceMetrics } from "./stream-metrics";

async function handleProxy(request: Request, config: CproxyConfig) {
  const tReqStart = performance.now();
  const url = new URL(request.url);
  const pathKey = url.pathname;
  const method = request.method.toUpperCase();

  const meta = await peekMessagesRequestMeta(request, config);

  const target = upstreamUrl(request);
  const headers = buildUpstreamHeaders(request, config.api_key);

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json") && url.pathname.includes("/v1/messages")) {
      body = await buildUpstreamBody(request, config);
    } else if (request.body) {
      body = request.body;
    }
  }

  const init: RequestInit = {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : (body ?? null),
  };

  if (
    body !== undefined &&
    typeof body !== "string" &&
    !(body instanceof ArrayBuffer) &&
    body instanceof ReadableStream
  ) {
    (init as { duplex?: "half" }).duplex = "half";
  }

  const t0 = performance.now();
  try {
    const upstream = await fetch(target, init);
    const ms = performance.now() - t0;
    recordUpstream({
      method,
      path: pathKey,
      status: upstream.status,
      ms,
      incomingModel: meta?.incoming,
      resolvedModel: meta?.resolved,
      stream: meta?.stream,
    });
    const messagesBodyForRecent =
      pathKey.includes("/v1/messages") && typeof body === "string" ? body : undefined;
    if (pathKey.includes("/v1/messages") && upstream.ok) {
      return attachInferenceMetrics(
        upstream,
        {
          modelKey: meta?.resolved,
          tReqStart,
          streamHint: !!meta?.stream,
          onWebTool: (kind) => recordWebToolScan(kind),
          recentInputBody: messagesBodyForRecent,
        },
        (_model, stats) => {
          if (stats && meta?.resolved) recordModelInference(meta.resolved, stats);
        },
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (e) {
    const ms = performance.now() - t0;
    recordUpstreamError(method, pathKey, ms);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({
        type: "error",
        error: { type: "api_error", message: msg },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}

export type ProxyHandle = {
  stop: () => void;
  port: number;
};

export function startProxyServer(config: CproxyConfig, port: number): ProxyHandle {
  const app = new Elysia()
    .use(html())
    .get("/health", () => {
      recordHealthHit();
      return new Response("ok", { status: 200 });
    })
    .get("/analytics/stream", () => {
      let ctl!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          ctl = controller;
          analyticsSseSubscribe(controller, JSON.stringify(getSnapshot()));
        },
        cancel() {
          analyticsSseUnsubscribe(ctl);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    })
    .get("/analytics", () => {
      recordDashboardHit();
      return renderAnalyticsPage(getSnapshot());
    })
    .all("*", ({ request }) => handleProxy(request, config));

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 0,
    fetch: app.fetch.bind(app),
  });

  const listenPort = server.port ?? port;
  return {
    port: listenPort,
    stop: () => server.stop(),
  };
}
