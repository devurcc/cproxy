import { DEFAULT_PROXY_PORT } from "../config/schema";

export type CproxyFlags = {
  config: boolean;
  refresh: boolean;
  port?: number;
  serve: boolean;
  stop: boolean;
  status: boolean;
  mon: boolean;
};

export type ParseResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "serve"; flags: CproxyFlags }
  | { kind: "stop" }
  | { kind: "status" }
  | { kind: "mon" }
  | { kind: "run"; flags: CproxyFlags; claudeArgs: string[] };

function parsePort(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return Math.trunc(n);
}

export function parseArgv(argv: string[]): ParseResult {
  const flags: CproxyFlags = {
    config: false,
    refresh: false,
    serve: false,
    stop: false,
    status: false,
    mon: false,
  };
  const claudeArgs: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      claudeArgs.push(...argv.slice(i + 1));
      break;
    }
    if (a === "-h" || a === "--help") return { kind: "help" };
    if (a === "-v" || a === "--version") return { kind: "version" };
    if (a === "-c" || a === "--config") {
      flags.config = true;
      i += 1;
      continue;
    }
    if (a === "-r" || a === "--refresh") {
      flags.refresh = true;
      i += 1;
      continue;
    }
    if (a === "--serve") {
      flags.serve = true;
      i += 1;
      continue;
    }
    if (a === "--stop") {
      flags.stop = true;
      i += 1;
      continue;
    }
    if (a === "--status") {
      flags.status = true;
      i += 1;
      continue;
    }
    if (a === "--mon") {
      flags.mon = true;
      i += 1;
      continue;
    }
    if (a === "--port") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--port requires a number");
      flags.port = parsePort(v);
      i += 2;
      continue;
    }
    claudeArgs.push(a);
    i += 1;
  }

  // Dispatch to appropriate kind based on flags
  if (flags.serve) return { kind: "serve", flags };
  if (flags.stop) return { kind: "stop" };
  if (flags.status) return { kind: "status" };
  if (flags.mon) return { kind: "mon" };
  if (flags.config || flags.refresh) {
    return { kind: "run", flags, claudeArgs };
  }

  return { kind: "run", flags, claudeArgs };
}

export function effectivePort(flags: CproxyFlags, configPort: number | undefined): number {
  if (typeof flags.port === "number") return flags.port;
  if (typeof configPort === "number") return configPort;
  return DEFAULT_PROXY_PORT;
}
