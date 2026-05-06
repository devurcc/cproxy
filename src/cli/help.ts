import pkg from "../../package.json";
import { DEFAULT_PROXY_PORT } from "../config/schema";

export function readPackageVersion(): string {
  return pkg.version ?? "0.0.0";
}

export function printHelp(): void {
  console.log(`cproxy — Claude Code → Ollama Cloud (Anthropic-compatible passthrough)

Usage:
  cproxy [cproxy-options] [--] [claude arguments...]

cproxy options:
      --serve         Start proxy server as daemon
      --stop          Stop the running proxy server
      --status        Show server status
      --mon           Live monitoring dashboard
  -c, --config        Interactive setup (~/.cproxyrc), then exit
  -r, --refresh       Refresh model cache and fix mappings if needed
      --port <n>      Proxy listen port (default from config or ${DEFAULT_PROXY_PORT})
  -h, --help          Show help
  -v, --version       Print version

Anything not listed above is passed to the claude executable unchanged.
Use -- before claude args if you need to pass flags that look like cproxy options.

Environment for Claude Code is set automatically (ANTHROPIC_BASE_URL → local proxy).
`);
}

export function printVersion(): void {
  console.log(readPackageVersion());
}
