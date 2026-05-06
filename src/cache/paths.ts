import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR_NAME } from "../config/schema";

export function cacheRoot(): string {
  const base =
    process.env.XDG_CACHE_HOME ??
    join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".cache");
  return join(base, CACHE_DIR_NAME);
}

export function modelsCachePath(): string {
  return join(cacheRoot(), "models.json");
}

export function daemonStatePath(): string {
  return join(cacheRoot(), "daemon.json");
}

export function socketPath(): string {
  return join(cacheRoot(), "daemon.sock");
}

export function ensureCacheDir(): void {
  mkdirSync(cacheRoot(), { recursive: true });
}
