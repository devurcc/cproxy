import { recordRecentMessagesExchange } from "../analytics/store";

export type InferenceStats = {
  ttftMs: number;
  inputTokens: number;
  outputTokens: number;
  genMs: number;
};

export type WebToolKind = "search" | "fetch";

function usageFromParsedJson(obj: unknown): { in: number; out: number } {
  let inTok = 0;
  let outTok = 0;
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    const u = r.usage;
    if (u && typeof u === "object") {
      const ux = u as Record<string, unknown>;
      if (typeof ux.input_tokens === "number") inTok = ux.input_tokens;
      if (typeof ux.output_tokens === "number") outTok = ux.output_tokens;
    }
    for (const v of Object.values(r)) walk(v);
  };
  walk(obj);
  return { in: inTok, out: outTok };
}

function collectWebToolKinds(obj: unknown): Set<WebToolKind> {
  const out = new Set<WebToolKind>();
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    const r = o as Record<string, unknown>;
    const t = r.type;
    if (typeof t === "string") {
      const tl = t.toLowerCase();
      if (tl.includes("web_search")) out.add("search");
      if (tl.includes("web_fetch")) out.add("fetch");
    }
    const name = r.name;
    if (typeof name === "string") {
      const nl = name.toLowerCase();
      if (nl.includes("web_search")) out.add("search");
      if (nl.includes("web_fetch")) out.add("fetch");
    }
    for (const v of Object.values(r)) walk(v);
  };
  walk(obj);
  return out;
}

function emitWebToolSignals(obj: unknown, cb?: (kind: WebToolKind) => void): void {
  if (!cb) return;
  for (const k of collectWebToolKinds(obj)) cb(k);
}

/** Text + tool/error/thinking snippets for analytics preview (Anthropic + loose gateways). */
function extractResponsePreviewText(obj: unknown): string {
  const parts: string[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    const r = o as Record<string, unknown>;

    if (r.type === "error" && typeof r.message === "string") {
      parts.push(`[error] ${r.message}`);
    }
    const err = r.error;
    if (err && typeof err === "object") {
      const ex = err as Record<string, unknown>;
      if (typeof ex.message === "string") parts.push(`[error] ${ex.message}`);
    }

    const d = r.delta;
    if (d && typeof d === "object") {
      const dx = d as Record<string, unknown>;
      if (typeof dx.text === "string") parts.push(dx.text);
      if (typeof dx.thinking === "string") parts.push(dx.thinking);
    }

    if (r.type === "thinking" && typeof r.thinking === "string") {
      parts.push(r.thinking);
    }

    if (r.type === "text" && typeof r.text === "string") {
      parts.push(r.text);
    }

    if (r.type === "text_delta" && typeof r.text === "string") {
      parts.push(r.text);
    }

    if (r.type === "tool_use" && typeof r.name === "string") {
      const inp = r.input;
      const inStr = inp !== undefined ? JSON.stringify(inp).slice(0, 400) : "";
      parts.push(`[tool_use ${r.name}] ${inStr}`);
    }

    if (r.type === "tool_result") {
      const c = r.content;
      if (typeof c === "string") parts.push(`[tool_result] ${c.slice(0, 600)}`);
      else if (c !== undefined) parts.push(`[tool_result] ${JSON.stringify(c).slice(0, 600)}`);
    }

    const rt = r.type;
    if (typeof rt === "string" && rt.includes("web_search") && typeof r.title === "string") {
      parts.push(`${r.title}${typeof r.url === "string" ? `\n${r.url}` : ""}`);
    }

    for (const v of Object.values(r)) walk(v);
  };
  walk(obj);
  return parts.join("");
}

function compactStreamEventLine(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  const t = r.type;
  if (typeof t !== "string") {
    const s = JSON.stringify(obj);
    return s.length > 320 ? `${s.slice(0, 320)}…` : s;
  }
  if (t === "message_start" || t === "ping") return `[${t}]`;
  if (t === "content_block_start") {
    const cb = r.content_block as Record<string, unknown> | undefined;
    const cbt = cb?.type;
    const name = cb?.name;
    let s = `[content_block_start] ${typeof cbt === "string" ? cbt : "?"}`;
    if (typeof name === "string") s += ` name=${name}`;
    return s;
  }
  if (t === "content_block_delta") {
    const d = r.delta as Record<string, unknown> | undefined;
    const dt = d?.type;
    let frag = "";
    if (typeof d?.text === "string") frag = d.text.slice(0, 160);
    else if (typeof d?.thinking === "string") frag = `(thinking) ${d.thinking.slice(0, 140)}`;
    else frag = JSON.stringify(d ?? {}).slice(0, 180);
    return `[content_block_delta] ${typeof dt === "string" ? dt : "?"} ${frag}${frag.length >= 160 ? "…" : ""}`;
  }
  if (t === "content_block_stop") return "[content_block_stop]";
  if (t === "message_delta" || t === "message_stop") {
    const rest = JSON.stringify(obj);
    return `[${t}] ${rest.length > 240 ? `${rest.slice(0, 240)}…` : rest}`;
  }
  const rest = JSON.stringify(obj);
  return `[${t}] ${rest.length > 280 ? `${rest.slice(0, 280)}…` : rest}`;
}

function parseDataLine(rawLine: string): unknown | null {
  const line = rawLine.replace(/\r$/, "").trim();
  let payload: string | undefined;
  if (line.startsWith("data:")) {
    payload = line.slice(5).trim();
  } else if (line.startsWith("{")) {
    payload = line;
  } else {
    return null;
  }
  if (!payload || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export function attachInferenceMetrics(
  upstream: Response,
  opts: {
    modelKey?: string;
    tReqStart: number;
    streamHint: boolean;
    onWebTool?: (kind: WebToolKind) => void;
    recentInputBody?: string;
  },
  onInferenceDone: (model: string, stats: InferenceStats | null) => void,
): Response {
  const modelKey = opts.modelKey ?? "";
  const body = upstream.body;
  if (!body || !upstream.ok) {
    return upstream;
  }

  const ct = upstream.headers.get("content-type") ?? "";
  const asStream = opts.streamHint || ct.includes("text/event-stream");

  if (asStream) {
    let firstByteAt: number | null = null;
    let carry = "";
    const dec = new TextDecoder();
    let tokens = { in: 0, out: 0 };
    const outChunks: string[] = [];
    const streamEventLines: string[] = [];
    const maxStreamEventLines = 48;

    const stream = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (firstByteAt === null) {
            firstByteAt = performance.now();
          }
          controller.enqueue(chunk);
          carry += dec.decode(chunk, { stream: true });
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const rawLine of lines) {
            const parsed = parseDataLine(rawLine);
            if (!parsed) continue;
            emitWebToolSignals(parsed, opts.onWebTool);
            const frag = extractResponsePreviewText(parsed);
            if (frag.length > 0) outChunks.push(frag);
            if (streamEventLines.length < maxStreamEventLines) {
              const line = compactStreamEventLine(parsed);
              if (line) streamEventLines.push(line);
            }
            const u = usageFromParsedJson(parsed);
            if (u.in > 0 || u.out > 0) {
              tokens = u;
            }
          }
        },
        flush() {
          carry += dec.decode();
          const tailParsed = parseDataLine(carry);
          if (tailParsed) {
            emitWebToolSignals(tailParsed, opts.onWebTool);
            const frag = extractResponsePreviewText(tailParsed);
            if (frag.length > 0) outChunks.push(frag);
            if (streamEventLines.length < maxStreamEventLines) {
              const line = compactStreamEventLine(tailParsed);
              if (line) streamEventLines.push(line);
            }
            const u = usageFromParsedJson(tailParsed);
            if (u.in > 0 || u.out > 0) tokens = u;
          }
          const tEnd = performance.now();
          const finishRecent = (): void => {
            if (opts.recentInputBody === undefined) return;
            const combined = outChunks.join("");
            let out: string;
            if (combined.length > 0) {
              out = combined;
            } else if (streamEventLines.length > 0) {
              out = `[no assistant text_delta/text — raw SSE events (${streamEventLines.length})]\n${streamEventLines.join("\n")}`;
            } else if (firstByteAt === null) {
              out = "— (no response bytes)";
            } else {
              out = "— (no parseable SSE data: lines)";
            }
            recordRecentMessagesExchange(opts.recentInputBody, out);
          };
          if (firstByteAt === null) {
            onInferenceDone(modelKey, null);
            finishRecent();
            return;
          }
          onInferenceDone(modelKey, {
            ttftMs: firstByteAt - opts.tReqStart,
            inputTokens: tokens.in,
            outputTokens: tokens.out,
            genMs: Math.max(0, tEnd - firstByteAt),
          });
          finishRecent();
        },
      }),
    );

    return new Response(stream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  }

  if (ct.includes("application/json")) {
    const [clientBranch, parseBranch] = body.tee();
    void (async () => {
      const tEnd = performance.now();
      try {
        const text = await new Response(parseBranch).text();
        const parsed = JSON.parse(text) as unknown;
        emitWebToolSignals(parsed, opts.onWebTool);
        const u = usageFromParsedJson(parsed);
        const extracted = extractResponsePreviewText(parsed);
        const outPrev = extracted.length > 0 ? extracted : text;
        const wallMs = Math.max(0, tEnd - opts.tReqStart);
        onInferenceDone(modelKey, {
          ttftMs: wallMs,
          inputTokens: u.in,
          outputTokens: u.out,
          genMs: wallMs,
        });
        if (opts.recentInputBody !== undefined) {
          recordRecentMessagesExchange(opts.recentInputBody, outPrev);
        }
      } catch {
        onInferenceDone(modelKey, null);
        if (opts.recentInputBody !== undefined) {
          recordRecentMessagesExchange(opts.recentInputBody, "— (response JSON parse failed)");
        }
      }
    })();

    return new Response(clientBranch, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  }

  return upstream;
}
