import { confirm, intro, isCancel, outro, password, select, spinner, text } from "@clack/prompts";
import { writeModelsCache } from "../cache/models";
import { isConfigComplete, saveConfig } from "../config/loader";
import type { CproxyConfig, ModelSlot } from "../config/schema";
import { DEFAULT_PROXY_PORT, defaultModelMap } from "../config/schema";
import { fetchAllModelDetails, fetchTags } from "../ollama/client";
import type { ModelWithContext, OllamaTagModel } from "../ollama/types";

const SLOTS: ModelSlot[] = ["opus", "sonnet", "haiku"];

async function promptApiKey(): Promise<string> {
  for (;;) {
    const key = await password({
      message: "Ollama API key",
      mask: "*",
    });
    if (isCancel(key) || key === undefined) {
      process.exit(130);
    }
    const trimmed = key.trim();
    if (trimmed.length > 0) return trimmed;
  }
}

async function promptModelsForSlots(models: ModelWithContext[]): Promise<CproxyConfig["models"]> {
  const map = defaultModelMap();
  const opts = models.map((m) => ({
    value: m.name,
    label: `${m.name} (${m.parameter_size}, ctx ${m.context_length})`,
    hint: m.family,
  }));
  for (const slot of SLOTS) {
    const v = await select({
      message: `Model for ${slot}`,
      options: opts,
    });
    if (isCancel(v)) process.exit(130);
    map[slot] = v as string;
  }
  return map;
}

export async function runWizard(existing: CproxyConfig | null): Promise<CproxyConfig> {
  intro("cproxy setup");

  let apiKey = existing?.api_key ?? "";
  if (!apiKey) apiKey = await promptApiKey();

  const spin = spinner();
  spin.start("Validating API key and loading models");

  let tags: OllamaTagModel[];
  try {
    tags = await fetchTags(apiKey);
  } catch (e) {
    spin.stop("Failed");
    const msg = e instanceof Error ? e.message : String(e);
    outro(`API error: ${msg}`);
    process.exit(1);
  }

  let details: ModelWithContext[];
  try {
    details = await fetchAllModelDetails(apiKey, tags, () => {});
  } catch (e) {
    spin.stop("Failed");
    const msg = e instanceof Error ? e.message : String(e);
    outro(`API error: ${msg}`);
    process.exit(1);
  }

  spin.stop("Models loaded");
  writeModelsCache(details);

  const models = await promptModelsForSlots(details);

  const defaultPort = String(existing?.port ?? DEFAULT_PROXY_PORT);
  const portStr = await text({
    message: "Proxy listen port",
    initialValue: defaultPort,
    validate(v) {
      const n = Number(String(v).trim());
      if (!Number.isFinite(n) || n < 1024 || n > 65535) {
        return "Enter a port between 1024 and 65535";
      }
      return undefined;
    },
  });
  if (isCancel(portStr)) process.exit(130);
  const port = Math.trunc(Number(String(portStr).trim()));

  const cfg: CproxyConfig = {
    api_key: apiKey,
    port,
    models,
  };

  const ok = await confirm({ message: "Save ~/.cproxyrc?", initialValue: true });
  if (isCancel(ok)) process.exit(130);
  if (!ok) {
    outro("Discarded");
    process.exit(0);
  }

  saveConfig(cfg);
  outro("Saved ~/.cproxyrc");
  return cfg;
}

export async function ensureReadyConfig(
  flagsConfig: boolean,
  initial: CproxyConfig | null,
): Promise<CproxyConfig> {
  if (flagsConfig) {
    return runWizard(initial);
  }
  if (!initial || !isConfigComplete(initial)) {
    return runWizard(initial);
  }
  return initial;
}
