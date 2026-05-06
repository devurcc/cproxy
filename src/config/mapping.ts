import type { CproxyConfig, ModelSlot } from "./schema";

function slotForIncoming(model: string): ModelSlot | null {
  const m = model.toLowerCase();
  if (m === "opus" || m.includes("opus")) return "opus";
  if (m === "haiku" || m.includes("haiku")) return "haiku";
  if (m === "sonnet" || m.includes("sonnet")) return "sonnet";
  return null;
}

export function resolveUpstreamModel(incomingModel: string, config: CproxyConfig): string {
  const configured = new Set(Object.values(config.models));
  if (configured.has(incomingModel)) return incomingModel;

  const slot = slotForIncoming(incomingModel);
  if (slot) {
    const tag = config.models[slot];
    if (tag.length > 0) return tag;
  }

  return incomingModel;
}
