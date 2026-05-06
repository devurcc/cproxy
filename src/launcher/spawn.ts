export async function spawnClaude(port: number, args: string[]): Promise<number> {
  const proc = Bun.spawn(["claude", ...args], {
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_AUTH_TOKEN: "cproxy",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  return typeof code === "bigint" ? Number(code) : code;
}
