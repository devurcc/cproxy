import type { AnalyticsSnapshot, ModelInferenceRow } from "../analytics/store";

function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h${min % 60}m`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokPerSec(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(0)} tok/s`;
}

function formatTtft(val: number | null): string {
  if (val === null) return "—";
  return `${Math.round(val)}ms`;
}

function formatTime(): string {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour12: false });
}

function renderModels(rows: ModelInferenceRow[]): string {
  if (rows.length === 0) return "  No data yet";

  return rows
    .slice(0, 5)
    .map((r) => {
      const model = r.model.length > 28 ? r.model.slice(0, 25) + "…" : r.model;
      return `  ${model.padEnd(28)} ${String(r.requests).padStart(4)} req  ${formatTokPerSec(r.tokPerSec).padStart(10)}  TTFT ${formatTtft(r.avgTtftMs)}`;
    })
    .join("\n");
}

export function renderMonitor(snapshot: AnalyticsSnapshot): string {
  const uptime = formatUptime(snapshot.now - snapshot.sessionStartedAt);
  const avgLatency = formatLatency(snapshot.latency.avgMs);
  const maxLatency = formatLatency(snapshot.latency.maxMs);

  const lines = [
    `\x1b[2J\x1b[H`, // Clear screen, move cursor to top
    `\x1b[1mcproxy monitor\x1b[0m${" ".repeat(40)}${formatTime()}`,
    "",
    `Uptime: ${uptime}  Reqs: ${snapshot.upstreamRequests}  Err: ${snapshot.upstreamErrors}  Stream: ${snapshot.streamingMessages}`,
    "",
    `Latency: avg ${avgLatency}  max ${maxLatency}`,
    "",
    "\x1b[1mModels (resolved):\x1b[0m",
    renderModels(snapshot.modelInference),
  ];

  return lines.join("\n");
}