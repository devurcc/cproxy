import type { AnalyticsSnapshot, ModelInferenceRow, RecentMessagesExchange } from "./store";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowPair(label: string, value: string | number): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`;
}

function tableRows(entries: [string, number][]): string {
  if (entries.length === 0) return '<tr><td colspan="2">No data</td></tr>';
  return entries
    .map(
      ([k, v]) =>
        `<tr><td><code>${escapeHtml(k)}</code></td><td>${escapeHtml(String(v))}</td></tr>`,
    )
    .join("");
}

function inferenceTableRows(rows: ModelInferenceRow[]): string {
  if (rows.length === 0) return '<tr><td colspan="6">No data</td></tr>';
  return rows
    .map((r) => {
      const ttft = r.avgTtftMs != null ? r.avgTtftMs.toFixed(1) : "—";
      const tps = r.tokPerSec != null ? r.tokPerSec.toFixed(1) : "—";
      return `<tr><td><code>${escapeHtml(r.model)}</code></td><td>${escapeHtml(String(r.requests))}</td><td>${escapeHtml(ttft)}</td><td>${escapeHtml(String(r.inputTokens))}</td><td>${escapeHtml(String(r.outputTokens))}</td><td>${escapeHtml(tps)}</td></tr>`;
    })
    .join("");
}

function recentMessagesRows(rows: RecentMessagesExchange[]): string {
  if (rows.length === 0) return '<tr><td colspan="3">No data</td></tr>';
  return rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(new Date(r.at).toLocaleString())}</td><td><pre class="io-preview">${escapeHtml(r.inputPreview)}</pre></td><td><pre class="io-preview">${escapeHtml(r.outputPreview)}</pre></td></tr>`,
    )
    .join("");
}

function summaryRows(snapshot: AnalyticsSnapshot): string {
  const uptimeSec = Math.floor((snapshot.now - snapshot.sessionStartedAt) / 1000);
  const avg = snapshot.latency.avgMs.toFixed(1);
  return [
    rowPair("Proxy uptime (s)", uptimeSec),
    rowPair("GET /health", snapshot.healthHits),
    rowPair("GET /analytics", snapshot.dashboardHits),
    rowPair("Upstream requests (Ollama)", snapshot.upstreamRequests),
    rowPair("Proxy errors (fetch failures)", snapshot.upstreamErrors),
    rowPair("Streaming /v1/messages", snapshot.streamingMessages),
    rowPair("Web search (SSE/JSON hits)", snapshot.webSearchScanHits),
    rowPair("Web fetch (SSE/JSON hits)", snapshot.webFetchScanHits),
    rowPair("Latency: samples", snapshot.latency.count),
    rowPair("Latency: avg (ms)", avg),
    rowPair("Latency: max (ms)", snapshot.latency.maxMs.toFixed(1)),
  ].join("");
}

export function renderAnalyticsPage(snapshot: AnalyticsSnapshot): string {
  const clientScript = `
<script>
(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function rowPair(label, value) {
    return "<tr><th scope=\\"row\\">" + esc(label) + "</th><td>" + esc(String(value)) + "</td></tr>";
  }
  function tableRows(entries) {
    if (!entries || entries.length === 0) return '<tr><td colspan="2">No data</td></tr>';
    return entries
      .map(function (row) {
        return "<tr><td><code>" + esc(row[0]) + "</code></td><td>" + esc(String(row[1])) + "</td></tr>";
      })
      .join("");
  }
  function tableInference(rows) {
    if (!rows || rows.length === 0) return '<tr><td colspan="6">No data</td></tr>';
    return rows
      .map(function (r) {
        var ttft = r.avgTtftMs != null ? r.avgTtftMs.toFixed(1) : "—";
        var tps = r.tokPerSec != null ? r.tokPerSec.toFixed(1) : "—";
        return (
          "<tr><td><code>" +
          esc(r.model) +
          "</code></td><td>" +
          esc(String(r.requests)) +
          "</td><td>" +
          esc(ttft) +
          "</td><td>" +
          esc(String(r.inputTokens)) +
          "</td><td>" +
          esc(String(r.outputTokens)) +
          "</td><td>" +
          esc(tps) +
          "</td></tr>"
        );
      })
      .join("");
  }
  function fillRecentMessages(rows) {
    var tb = document.getElementById("sse-recent-messages");
    if (!tb) return;
    tb.replaceChildren();
    if (!rows || rows.length === 0) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 3;
      td0.textContent = "No data";
      tr0.appendChild(td0);
      tb.appendChild(tr0);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var tAt = document.createElement("td");
      tAt.textContent = new Date(r.at).toLocaleString();
      var tIn = document.createElement("td");
      var pIn = document.createElement("pre");
      pIn.className = "io-preview";
      pIn.textContent = r.inputPreview || "";
      tIn.appendChild(pIn);
      var tOut = document.createElement("td");
      var pOut = document.createElement("pre");
      pOut.className = "io-preview";
      pOut.textContent = r.outputPreview || "";
      tOut.appendChild(pOut);
      tr.appendChild(tAt);
      tr.appendChild(tIn);
      tr.appendChild(tOut);
      tb.appendChild(tr);
    });
  }
  function applySnapshot(s) {
    var uptimeSec = Math.floor((s.now - s.sessionStartedAt) / 1000);
    var avg = (s.latency && s.latency.avgMs != null ? s.latency.avgMs : 0).toFixed(1);
    var sum = document.getElementById("sse-summary");
    if (sum) {
      sum.innerHTML =
        rowPair("Proxy uptime (s)", uptimeSec) +
        rowPair("GET /health", s.healthHits) +
        rowPair("GET /analytics", s.dashboardHits) +
        rowPair("Upstream requests (Ollama)", s.upstreamRequests) +
        rowPair("Proxy errors (fetch failures)", s.upstreamErrors) +
        rowPair("Streaming /v1/messages", s.streamingMessages) +
        rowPair("Web search (SSE/JSON hits)", s.webSearchScanHits || 0) +
        rowPair("Web fetch (SSE/JSON hits)", s.webFetchScanHits || 0) +
        rowPair("Latency: samples", s.latency.count) +
        rowPair("Latency: avg (ms)", avg) +
        rowPair("Latency: max (ms)", (s.latency.maxMs || 0).toFixed(1));
    }
    var inf = document.getElementById("sse-model-inference");
    if (inf) inf.innerHTML = tableInference(s.modelInference || []);
    var p = document.getElementById("sse-paths");
    if (p) p.innerHTML = tableRows(s.byPath);
    var mi = document.getElementById("sse-models-in");
    if (mi) mi.innerHTML = tableRows(s.modelsIncoming);
    var mr = document.getElementById("sse-models-res");
    if (mr) mr.innerHTML = tableRows(s.modelsResolved);
    fillRecentMessages(s.recentMessages || []);
  }
  var badge = document.getElementById("sse-live-badge");
  var es = new EventSource("/analytics/stream");
  es.onopen = function () {
    if (badge) {
      badge.textContent = "SSE: connected";
      badge.classList.remove("sse-off");
      badge.classList.add("sse-on");
    }
  };
  es.onerror = function () {
    if (badge) {
      badge.textContent = "SSE: reconnecting…";
      badge.classList.remove("sse-on");
      badge.classList.add("sse-off");
    }
  };
  es.onmessage = function (ev) {
    try {
      applySnapshot(JSON.parse(ev.data));
    } catch (e) {
      console.error(e);
    }
  };
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cproxy — analytics</title>
  <style>
    :root { color-scheme: dark light; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 960px; padding: 1.25rem; line-height: 1.45; }
    h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }
    h2 { font-size: 1.05rem; margin: 1.25rem 0 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding: 0.35rem 0.5rem; vertical-align: top; }
    th[scope="row"] { text-align: left; width: 42%; font-weight: 600; }
    code { font-family: ui-monospace, monospace; font-size: 0.86em; }
    .muted { opacity: 0.75; font-size: 0.85rem; margin-bottom: 1rem; }
    .grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
    @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }
    #sse-live-badge { display: inline-block; font-size: 0.8rem; padding: 0.15rem 0.45rem; border-radius: 0.35rem; margin-left: 0.5rem; vertical-align: middle; }
    .sse-on { background: color-mix(in srgb, CanvasText 12%, transparent); }
    .sse-off { background: color-mix(in srgb, #f59e0b 25%, transparent); }
    pre.io-preview { margin: 0; max-height: 14rem; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 0.78rem; line-height: 1.35; }
  </style>
</head>
<body>
  <h1>cproxy — session analytics <span id="sse-live-badge" class="sse-off">SSE: …</span></h1>
  <p class="muted">In-memory stats for this process only. Live updates via SSE (keep-alive ping every 20s).</p>

  <h2>Summary</h2>
  <table>
    <tbody id="sse-summary">
      ${summaryRows(snapshot)}
    </tbody>
  </table>

  <h2>Recent POST /v1/messages (20)</h2>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Request body (preview)</th>
        <th>Response text (preview)</th>
      </tr>
    </thead>
    <tbody id="sse-recent-messages">${recentMessagesRows(snapshot.recentMessages ?? [])}</tbody>
  </table>

  <h2>Model inference (resolved)</h2>
  <table>
    <thead>
      <tr>
        <th>Model</th>
        <th>Requests</th>
        <th>Avg TTFT (ms)</th>
        <th>Input tokens</th>
        <th>Output tokens</th>
        <th>Tok/s</th>
      </tr>
    </thead>
    <tbody id="sse-model-inference">${inferenceTableRows(snapshot.modelInference)}</tbody>
  </table>

  <h2>Paths (top)</h2>
  <table><thead><tr><th>Path</th><th>Count</th></tr></thead><tbody id="sse-paths">${tableRows(snapshot.byPath)}</tbody></table>

  <div class="grid">
    <section>
      <h2>Models (incoming names)</h2>
      <table><thead><tr><th>Model</th><th>Count</th></tr></thead><tbody id="sse-models-in">${tableRows(snapshot.modelsIncoming)}</tbody></table>
    </section>
    <section>
      <h2>Models (after mapping)</h2>
      <table><thead><tr><th>Model</th><th>Count</th></tr></thead><tbody id="sse-models-res">${tableRows(snapshot.modelsResolved)}</tbody></table>
    </section>
  </div>
${clientScript}
</body>
</html>`;
}
