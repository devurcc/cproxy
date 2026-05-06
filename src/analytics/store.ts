import { broadcastAnalyticsJson } from "./sse";

type UpstreamRecord = {
  method: string;
  path: string;
  status: number;
  ms: number;
  incomingModel?: string;
  resolvedModel?: string;
  stream?: boolean;
};

export type ModelInferenceStats = {
  ttftMs: number;
  inputTokens: number;
  outputTokens: number;
  genMs: number;
};

export type ModelInferenceRow = {
  model: string;
  requests: number;
  avgTtftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  tokPerSec: number | null;
};

export type RecentMessagesExchange = {
  at: number;
  inputPreview: string;
  outputPreview: string;
};

const RECENT_MESSAGES_CAP = 20;
const RECENT_PREVIEW_CHARS = 4000;

const recentMessages: RecentMessagesExchange[] = [];

function truncatePreview(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated]`;
}

const sessionStartedAt = Date.now();

let healthHits = 0;
let dashboardHits = 0;
let upstreamRequests = 0;
let upstreamErrors = 0;
let streamingMessages = 0;
let webSearchScanHits = 0;
let webFetchScanHits = 0;

const byPath = new Map<string, number>();
const modelsIncoming = new Map<string, number>();
const modelsResolved = new Map<string, number>();

type Agg = {
  requests: number;
  ttftSumMs: number;
  ttftN: number;
  inSum: number;
  outSum: number;
  genMsSum: number;
};

const modelInference = new Map<string, Agg>();

let latencyCount = 0;
let latencySumMs = 0;
let latencyMaxMs = 0;

function bump(map: Map<string, number>, key: string, delta = 1) {
  map.set(key, (map.get(key) ?? 0) + delta);
}

function recordLatency(ms: number) {
  latencyCount += 1;
  latencySumMs += ms;
  if (ms > latencyMaxMs) latencyMaxMs = ms;
}

export type AnalyticsSnapshot = {
  sessionStartedAt: number;
  now: number;
  healthHits: number;
  dashboardHits: number;
  upstreamRequests: number;
  upstreamErrors: number;
  streamingMessages: number;
  webSearchScanHits: number;
  webFetchScanHits: number;
  byPath: [string, number][];
  modelsIncoming: [string, number][];
  modelsResolved: [string, number][];
  modelInference: ModelInferenceRow[];
  recentMessages: RecentMessagesExchange[];
  latency: { count: number; avgMs: number; maxMs: number };
};

function buildModelInferenceRows(): ModelInferenceRow[] {
  return [...modelInference.entries()]
    .map(([model, a]) => ({
      model,
      requests: a.requests,
      avgTtftMs: a.ttftN > 0 ? a.ttftSumMs / a.ttftN : null,
      inputTokens: a.inSum,
      outputTokens: a.outSum,
      tokPerSec: a.genMsSum > 0 && a.outSum > 0 ? a.outSum / (a.genMsSum / 1000) : null,
    }))
    .sort((x, y) => y.requests - x.requests);
}

export function getSnapshot(): AnalyticsSnapshot {
  const topPath = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const topInc = [...modelsIncoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const topRes = [...modelsResolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  return {
    sessionStartedAt,
    now: Date.now(),
    healthHits,
    dashboardHits,
    upstreamRequests,
    upstreamErrors,
    streamingMessages,
    webSearchScanHits,
    webFetchScanHits,
    byPath: topPath,
    modelsIncoming: topInc,
    modelsResolved: topRes,
    modelInference: buildModelInferenceRows(),
    recentMessages: recentMessages.slice(),
    latency: {
      count: latencyCount,
      avgMs: latencyCount ? latencySumMs / latencyCount : 0,
      maxMs: latencyMaxMs,
    },
  };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function notifyAnalytics(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    broadcastAnalyticsJson(JSON.stringify(getSnapshot()));
  }, 120);
}

export function recordHealthHit(): void {
  healthHits += 1;
  notifyAnalytics();
}

export function recordDashboardHit(): void {
  dashboardHits += 1;
  notifyAnalytics();
}

export function recordWebToolScan(kind: "search" | "fetch"): void {
  if (kind === "search") webSearchScanHits += 1;
  else webFetchScanHits += 1;
  notifyAnalytics();
}

export function recordRecentMessagesExchange(inputRaw: string, outputRaw: string): void {
  recentMessages.unshift({
    at: Date.now(),
    inputPreview: truncatePreview(inputRaw, RECENT_PREVIEW_CHARS),
    outputPreview: truncatePreview(outputRaw, RECENT_PREVIEW_CHARS),
  });
  while (recentMessages.length > RECENT_MESSAGES_CAP) recentMessages.pop();
  notifyAnalytics();
}

export function recordModelInference(model: string, stats: ModelInferenceStats): void {
  const cur =
    modelInference.get(model) ??
    ({
      requests: 0,
      ttftSumMs: 0,
      ttftN: 0,
      inSum: 0,
      outSum: 0,
      genMsSum: 0,
    } satisfies Agg);
  cur.requests += 1;
  if (stats.ttftMs > 0) {
    cur.ttftSumMs += stats.ttftMs;
    cur.ttftN += 1;
  }
  cur.inSum += stats.inputTokens;
  cur.outSum += stats.outputTokens;
  if (stats.genMs > 0) cur.genMsSum += stats.genMs;
  modelInference.set(model, cur);
  notifyAnalytics();
}

export function recordUpstream(rec: UpstreamRecord): void {
  upstreamRequests += 1;
  bump(byPath, rec.path);
  recordLatency(rec.ms);
  if (rec.stream) streamingMessages += 1;
  if (rec.incomingModel) bump(modelsIncoming, rec.incomingModel);
  if (rec.resolvedModel) bump(modelsResolved, rec.resolvedModel);
  notifyAnalytics();
}

export function recordUpstreamError(_method: string, path: string, ms: number): void {
  upstreamErrors += 1;
  bump(byPath, path);
  recordLatency(ms);
  notifyAnalytics();
}
