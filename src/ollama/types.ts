export type OllamaTagModel = {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[] | null;
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type ModelInfo = {
  model_info?: Record<string, unknown>;
  details?: OllamaTagModel["details"];
};

export type ModelWithContext = {
  name: string;
  parameter_size: string;
  family: string;
  context_length: number;
};
