export const DEFAULT_PROXY_PORT = 7860;

export const CONFIG_FILENAME = ".cproxyrc";

export const CACHE_DIR_NAME = "cproxy";

export type ModelSlot = "opus" | "sonnet" | "haiku";

export type ModelMap = Record<ModelSlot, string>;

export type CproxyConfig = {
  api_key: string;
  port: number;
  models: ModelMap;
};

export function defaultModelMap(): ModelMap {
  return {
    opus: "",
    sonnet: "",
    haiku: "",
  };
}
