import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import {
  CONFIG_FILENAME,
  type CproxyConfig,
  DEFAULT_PROXY_PORT,
  defaultModelMap,
  type ModelMap,
  type ModelSlot,
} from "./schema";

export function configPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return `${home}/${CONFIG_FILENAME}`;
}

export function loadConfig(): CproxyConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const doc = YAML.parse(raw) as Partial<CproxyConfig> | null;
  if (!doc || typeof doc !== "object") return null;
  if (!doc.api_key || typeof doc.api_key !== "string") return null;
  const port =
    typeof doc.port === "number" && Number.isFinite(doc.port) ? doc.port : DEFAULT_PROXY_PORT;
  const models = defaultModelMap();
  if (doc.models && typeof doc.models === "object") {
    for (const slot of ["opus", "sonnet", "haiku"] as ModelSlot[]) {
      const v = doc.models[slot];
      if (typeof v === "string" && v.length > 0) models[slot] = v;
    }
  }
  return { api_key: doc.api_key, port, models };
}

export function saveConfig(config: CproxyConfig): void {
  const path = configPath();
  const dir = dirname(path);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* exists */
  }
  const body: Record<string, unknown> = {
    api_key: config.api_key,
    port: config.port,
    models: { ...config.models } as ModelMap,
  };
  writeFileSync(path, YAML.stringify(body), "utf8");
}

export function isConfigComplete(config: CproxyConfig): boolean {
  return (
    config.api_key.length > 0 &&
    config.models.opus.length > 0 &&
    config.models.sonnet.length > 0 &&
    config.models.haiku.length > 0
  );
}
