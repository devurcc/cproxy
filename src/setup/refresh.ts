import { confirm, intro, isCancel, outro, select, spinner } from "@clack/prompts";
import { writeModelsCache } from "../cache/models";
import { saveConfig } from "../config/loader";
import type { CproxyConfig, ModelSlot } from "../config/schema";
import { fetchAllModelDetails, fetchTags } from "../ollama/client";
import type { ModelWithContext, OllamaTagModel } from "../ollama/types";

const SLOTS: ModelSlot[] = ["opus", "sonnet", "haiku"];

export async function runRefresh(config: CproxyConfig): Promise<void> {
  intro("cproxy refresh");

  const spin = spinner();
  spin.start("Fetching models from Ollama Cloud");

  let tags: OllamaTagModel[];
  try {
    tags = await fetchTags(config.api_key);
  } catch (e) {
    spin.stop("Failed");
    const msg = e instanceof Error ? e.message : String(e);
    outro(`API error: ${msg}`);
    process.exit(1);
  }

  let details: ModelWithContext[];
  try {
    details = await fetchAllModelDetails(config.api_key, tags);
  } catch (e) {
    spin.stop("Failed");
    const msg = e instanceof Error ? e.message : String(e);
    outro(`API error: ${msg}`);
    process.exit(1);
  }

  spin.stop("Cache updated");
  writeModelsCache(details);

  const names = new Set(details.map((d) => d.name));
  const next: CproxyConfig = {
    ...config,
    models: { ...config.models },
  };

  let changed = false;
  const opts = details.map((m) => ({
    value: m.name,
    label: `${m.name} (${m.parameter_size}, ctx ${m.context_length})`,
    hint: m.family,
  }));

  for (const slot of SLOTS) {
    const current = next.models[slot];
    if (!names.has(current)) {
      const v = await select({
        message: `Configured ${slot} model "${current}" is no longer available. Choose a replacement`,
        options: opts,
      });
      if (isCancel(v)) process.exit(130);
      next.models[slot] = v as string;
      changed = true;
    }
  }

  const configured = new Set(Object.values(config.models));
  const newcomers = details.filter((d) => d.name.includes(":cloud") && !configured.has(d.name));

  if (newcomers.length > 0) {
    const offer = await confirm({
      message: `${newcomers.length} new cloud model(s) in the catalog. Review slot mappings?`,
      initialValue: false,
    });
    if (isCancel(offer)) process.exit(130);
    if (offer) {
      for (const slot of SLOTS) {
        const v = await select({
          message: `Model for ${slot}`,
          options: opts,
        });
        if (isCancel(v)) process.exit(130);
        if (v !== next.models[slot]) {
          next.models[slot] = v as string;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    const ok = await confirm({
      message: "Save changes to ~/.cproxyrc?",
      initialValue: true,
    });
    if (isCancel(ok)) process.exit(130);
    if (ok) saveConfig(next);
  }

  outro(changed ? "Done" : "No config changes required");
}
