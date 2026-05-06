import { existsSync, unlinkSync } from "node:fs";
import { socketPath } from "../cache/paths";
import type { AnalyticsSnapshot } from "../analytics/store";

export type IpcState = {
  pid: number;
  port: number;
  started_at: string;
};

export function cleanSocket(): void {
  const p = socketPath();
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

export function startIpcServer(
  state: IpcState,
  getSnapshot: () => AnalyticsSnapshot,
  onStop: () => void,
): ReturnType<typeof Bun.serve> {
  cleanSocket();

  return Bun.serve({
    unix: socketPath(),
    async fetch(req) {
      const url = new URL(req.url);
      const cmd = url.pathname.slice(1).toUpperCase();

      switch (cmd) {
        case "GET_PORT":
          return new Response(`PORT:${state.port}\n`, { status: 200 });

        case "STATUS":
          return new Response(
            `STATUS:running\nPORT:${state.port}\nPID:${state.pid}\nSTARTED:${state.started_at}\n`,
            { status: 200 },
          );

        case "STOP":
          setTimeout(() => {
            onStop();
          }, 50);
          return new Response("OK\n", { status: 200 });

        case "PING":
          return new Response("PONG\n", { status: 200 });

        case "SNAPSHOT":
          return new Response(JSON.stringify(getSnapshot()) + "\n", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });

        default:
          return new Response("ERROR:unknown command\n", { status: 400 });
      }
    },
  });
}

export async function ipcCommand(cmd: string): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost/${cmd}`, {
      unix: socketPath(),
      signal: AbortSignal.timeout(2000),
    });
    return await res.text();
  } catch {
    return null;
  }
}

export async function ipcJsonCommand<T>(cmd: string): Promise<T | null> {
  try {
    const res = await fetch(`http://localhost/${cmd}`, {
      unix: socketPath(),
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parsePortResponse(text: string): number | null {
  const match = text.match(/^PORT:(\d+)/m);
  return match ? parseInt(match[1], 10) : null;
}

export async function getPortFromSocket(): Promise<number | null> {
  const resp = await ipcCommand("GET_PORT");
  if (!resp) return null;
  return parsePortResponse(resp);
}

export async function isServerAlive(): Promise<boolean> {
  const resp = await ipcCommand("PING");
  return resp?.startsWith("PONG") ?? false;
}

export async function stopServer(): Promise<boolean> {
  const resp = await ipcCommand("STOP");
  return resp?.startsWith("OK") ?? false;
}

export async function getServerStatus(): Promise<{
  running: boolean;
  port?: number;
  pid?: number;
  startedAt?: string;
}> {
  const resp = await ipcCommand("STATUS");
  if (!resp) return { running: false };

  const statusMatch = resp.match(/^STATUS:(\w+)/m);
  const portMatch = resp.match(/^PORT:(\d+)/m);
  const pidMatch = resp.match(/^PID:(\d+)/m);
  const startedMatch = resp.match(/^STARTED:(.+)$/m);

  return {
    running: statusMatch?.[1] === "running",
    port: portMatch ? parseInt(portMatch[1], 10) : undefined,
    pid: pidMatch ? parseInt(pidMatch[1], 10) : undefined,
    startedAt: startedMatch?.[1],
  };
}