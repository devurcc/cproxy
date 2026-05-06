import { readlinkSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  cleanupDaemonState,
  readDaemonState,
  writeDaemonState,
} from "./cache/daemon";
import { printHelp, printVersion } from "./cli/help";
import { type ParseResult, parseArgv, effectivePort } from "./cli/parse";
import { loadConfig } from "./config/loader";
import type { CproxyConfig } from "./config/schema";
import { spawnClaude } from "./launcher/spawn";
import { startProxyServer } from "./proxy/server";
import { runRefresh } from "./setup/refresh";
import { ensureReadyConfig } from "./setup/wizard";
import {
  cleanSocket,
  getPortFromSocket,
  getServerStatus,
  ipcJsonCommand,
  isServerAlive,
  startIpcServer,
  stopServer,
  type IpcState,
} from "./ipc/socket";
import { getSnapshot } from "./analytics/store";
import { renderMonitor } from "./cli/monitor";

// ============================================================================
// Server mode (--serve)
// ============================================================================

async function cmdServe(desiredPort: number | undefined): Promise<void> {
  // Check if already running
  if (await isServerAlive()) {
    const status = await getServerStatus();
    console.error(
      `cproxy: server already running on port ${status.port} (pid ${status.pid})`
    );
    process.exit(1);
  }

  // Clean up any stale socket
  cleanSocket();

  // Load or create config
  let cfg = loadConfig();
  if (!cfg) {
    console.error("cproxy: no ~/.cproxyrc — run `cproxy` to configure");
    process.exit(1);
  }

  const port = desiredPort ?? cfg.port ?? 0;

  // Start HTTP proxy server
  const handle = startProxyServer(cfg, port);

  // Prepare IPC state
  const state: IpcState = {
    pid: process.pid,
    port: handle.port,
    started_at: new Date().toISOString(),
  };

  // Start IPC server
  startIpcServer(state, getSnapshot, () => {
    handle.stop();
    cleanupDaemonState();
    process.exit(0);
  });

  // Save state for debugging
  writeDaemonState(state);

  // Signal to parent that we're ready
  console.log(`ok`);
  console.error(`cproxy: daemon started on port ${handle.port} (pid ${process.pid})`);

  // Keep running until signal or STOP command
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });

  handle.stop();
  cleanupDaemonState();
}

// ============================================================================
// Stop mode (--stop)
// ============================================================================

async function cmdStop(): Promise<void> {
  const stopped = await stopServer();
  if (!stopped) {
    console.error("cproxy: server not running");
    process.exit(1);
  }
  console.log("cproxy: server stopped");
}

// ============================================================================
// Status mode (--status)
// ============================================================================

async function cmdStatus(): Promise<void> {
  const status = await getServerStatus();
  if (!status.running) {
    console.log("cproxy: server not running");
    return;
  }
  console.log(`cproxy: server running`);
  console.log(`  port: ${status.port}`);
  console.log(`  pid: ${status.pid}`);
  console.log(`  started: ${status.startedAt}`);
}

// ============================================================================
// Monitor mode (--mon)
// ============================================================================

async function cmdMon(): Promise<void> {
  if (!(await isServerAlive())) {
    console.error("cproxy: server not running — start with `cproxy --serve`");
    process.exit(1);
  }

  let running = true;
  const onSignal = () => {
    running = false;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  while (running) {
    const snapshot = await ipcJsonCommand<ReturnType<typeof getSnapshot>>("SNAPSHOT");
    if (!snapshot) {
      console.error("\ncproxy: lost connection to server");
      process.exit(1);
    }
    console.log(renderMonitor(snapshot));
    await new Promise((r) => setTimeout(r, 1000));
  }

  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
}

// ============================================================================
// Wrapper mode (default)
// ============================================================================

function tryRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function ownProcessImagePath(): string | undefined {
  try {
    return readlinkSync("/proc/self/exe");
  } catch {
    return undefined;
  }
}

function isBunCliExecutable(path: string): boolean {
  const base = basename(path.replaceAll("\\", "/"));
  return base === "bun" || base === "bun.exe";
}

function resolvedCompiledExecutableFromArgv(): string {
  const argv = process.argv;
  const argv0 = argv[0] ?? "";
  if (!isBunCliExecutable(argv0)) {
    return resolve(argv0);
  }
  if (argv[1] === "run" && argv[2] && !argv[2].startsWith("-")) {
    return resolve(argv[2]);
  }
  if (argv[1] && argv[1] !== "run" && !argv[1].startsWith("-")) {
    return resolve(argv[1]);
  }
  return resolve(argv0);
}

function daemonSpawnArgv(): string[] {
  const entry = import.meta.path;
  const isBundledVirtual = entry.includes("bunfs");
  const isScriptEntry =
    /\.(ts|tsx|js|mjs|cjs)$/i.test(entry) && !isBundledVirtual;

  if (isScriptEntry) {
    return [process.execPath, entry];
  }

  const fromKernel = ownProcessImagePath();
  if (fromKernel && !isBunCliExecutable(fromKernel)) {
    return [tryRealpath(fromKernel)];
  }

  const execPath = process.execPath;
  if (!isBunCliExecutable(execPath)) {
    return [tryRealpath(execPath)];
  }

  return [tryRealpath(resolvedCompiledExecutableFromArgv())];
}

async function spawnDaemonAndAwaitPort(desiredPort?: number): Promise<number> {
  const args = ["--serve"];
  if (desiredPort !== undefined) {
    args.push("--port", String(desiredPort));
  }

  const proc = Bun.spawn([...daemonSpawnArgv(), ...args], {
    detached: true,
    stdio: ["ignore", "pipe", "inherit"],
  });

  // Wait for "ok\n" from daemon
  const reader = proc.stdout?.getReader();
  if (!reader) {
    throw new Error("Failed to spawn daemon: no stdout");
  }

  const { value } = await reader.read();
  reader.releaseLock();

  const output = new TextDecoder().decode(value);
  if (!output.startsWith("ok")) {
    throw new Error(`Failed to start daemon: ${output}`);
  }

  proc.unref();

  // Wait for socket to become ready
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const port = await getPortFromSocket();
    if (port !== null) return port;
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error("Daemon did not become ready in 5 seconds");
}

async function cmdRun(
  flags: { config: boolean; refresh: boolean; port?: number },
  claudeArgs: string[],
): Promise<void> {
  let cfg = loadConfig();
  cfg = await ensureReadyConfig(flags.config, cfg);

  if (flags.config) {
    return;
  }

  if (flags.refresh) {
    if (!cfg) {
      console.error("cproxy: no ~/.cproxyrc — run `cproxy` to configure");
      process.exit(1);
    }
    await runRefresh(cfg);
    return;
  }

  // Get port from existing server or spawn new one
  let port = await getPortFromSocket();
  if (port === null) {
    port = await spawnDaemonAndAwaitPort(flags.port ?? cfg?.port);
  }

  // Run Claude
  const exitCode = await spawnClaude(port, claudeArgs);
  process.exit(exitCode);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  let parsed: ParseResult;
  try {
    parsed = parseArgv(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  switch (parsed.kind) {
    case "help":
      printHelp();
      return;
    case "version":
      printVersion();
      return;
    case "serve":
      await cmdServe(parsed.flags.port);
      return;
    case "stop":
      await cmdStop();
      return;
    case "status":
      await cmdStatus();
      return;
    case "mon":
      await cmdMon();
      return;
    case "run":
      await cmdRun(parsed.flags, parsed.claudeArgs);
      return;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});