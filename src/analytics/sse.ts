const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

const enc = new TextEncoder();

function sseDataLine(json: string): Uint8Array {
  return enc.encode(`data: ${json}\n\n`);
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const ping = enc.encode(": ping\n\n");

function stopHeartbeatIfIdle(): void {
  if (subscribers.size === 0 && heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeatIfNeeded(): void {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(() => {
    if (subscribers.size === 0) {
      stopHeartbeatIfIdle();
      return;
    }
    for (const c of [...subscribers]) {
      try {
        c.enqueue(ping);
      } catch {
        subscribers.delete(c);
      }
    }
    stopHeartbeatIfIdle();
  }, 20000);
  const t = heartbeatTimer as ReturnType<typeof setInterval> & { unref?: () => void };
  t.unref?.();
}

export function analyticsSseSubscribe(
  controller: ReadableStreamDefaultController<Uint8Array>,
  initialJson: string,
): void {
  subscribers.add(controller);
  startHeartbeatIfNeeded();
  try {
    controller.enqueue(sseDataLine(initialJson));
  } catch {
    subscribers.delete(controller);
    stopHeartbeatIfIdle();
  }
}

export function analyticsSseUnsubscribe(
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  subscribers.delete(controller);
  stopHeartbeatIfIdle();
}

export function broadcastAnalyticsJson(json: string): void {
  const chunk = sseDataLine(json);
  for (const c of [...subscribers]) {
    try {
      c.enqueue(chunk);
    } catch {
      subscribers.delete(c);
    }
  }
  stopHeartbeatIfIdle();
}
