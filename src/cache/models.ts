import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ModelWithContext } from "../ollama/types";
import { ensureCacheDir, modelsCachePath } from "./paths";

export type ModelsCacheFile = {
  updated_at: string;
  models: ModelWithContext[];
};

export function readModelsCache(): ModelsCacheFile | null {
  const p = modelsCachePath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    const data = JSON.parse(raw) as ModelsCacheFile;
    if (!data.models || !Array.isArray(data.models)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeModelsCache(models: ModelWithContext[]): void {
  ensureCacheDir();
  const body: ModelsCacheFile = {
    updated_at: new Date().toISOString(),
    models,
  };
  writeFileSync(modelsCachePath(), JSON.stringify(body, null, 2), "utf8");
}
