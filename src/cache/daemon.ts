import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { daemonStatePath, ensureCacheDir } from "./paths";

export type DaemonState = {
  pid: number;
  port: number;
  started_at: string;
};

export function readDaemonState(): DaemonState | null {
  const p = daemonStatePath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    const data = JSON.parse(raw) as DaemonState;
    if (
      typeof data.pid !== "number" ||
      typeof data.port !== "number" ||
      typeof data.started_at !== "string"
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function writeDaemonState(state: DaemonState): void {
  ensureCacheDir();
  writeFileSync(daemonStatePath(), JSON.stringify(state, null, 2), "utf8");
}

export function cleanupDaemonState(): void {
  const p = daemonStatePath();
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      // ignore
    }
  }
}