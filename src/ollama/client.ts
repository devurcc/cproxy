import type { ModelInfo, ModelWithContext, OllamaTagModel } from "./types";

const OLLAMA_ORIGIN = "https://ollama.com";

function bearerHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

export async function fetchTags(apiKey: string): Promise<OllamaTagModel[]> {
  const res = await fetch(`${OLLAMA_ORIGIN}/api/tags`, {
    headers: bearerHeaders(apiKey),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`tags: HTTP ${res.status} ${t}`);
  }
  const data = (await res.json()) as { models?: OllamaTagModel[] };
  return data.models ?? [];
}

export async function fetchModelInfo(apiKey: string, modelName: string): Promise<ModelInfo> {
  const res = await fetch(`${OLLAMA_ORIGIN}/api/show`, {
    method: "POST",
    headers: {
      ...bearerHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: modelName }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`show ${modelName}: HTTP ${res.status} ${t}`);
  }
  return (await res.json()) as ModelInfo;
}

export function extractContextLength(info: ModelInfo): number {
  const mi = info.model_info;
  if (!mi || typeof mi !== "object") return 0;
  for (const [k, v] of Object.entries(mi)) {
    if (k.endsWith(".context_length") && typeof v === "number") return v;
  }
  return 0;
}

export async function fetchAllModelDetails(
  apiKey: string,
  tags: OllamaTagModel[],
  onProgress?: (done: number, total: number) => void,
): Promise<ModelWithContext[]> {
  const out: ModelWithContext[] = [];
  const total = tags.length;
  let done = 0;
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < tags.length) {
      const i = idx++;
      const tag = tags[i];
      const name = tag.name;
      try {
        const info = await fetchModelInfo(apiKey, name);
        const ctx = extractContextLength(info);
        const family =
          tag.details?.family ?? info.details?.family ?? tag.details?.families?.[0] ?? "unknown";
        const parameterSize = tag.details?.parameter_size ?? info.details?.parameter_size ?? "?";
        out[i] = {
          name,
          parameter_size: parameterSize,
          family,
          context_length: ctx,
        };
      } catch {
        out[i] = {
          name,
          parameter_size: tag.details?.parameter_size ?? "?",
          family: tag.details?.family ?? "unknown",
          context_length: 0,
        };
      }
      done++;
      onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tags.length) }, () => worker()));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
