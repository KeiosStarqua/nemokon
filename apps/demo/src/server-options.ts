export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

export type ServerOptions = { hostname: string; port: number; token?: string };

/** Loopback hosts that may run without a bearer token. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "localhost" || host === "::1" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * Bind address, port and bearer token from the environment.
 * Throws a descriptive Error when the bind is public (non-loopback `HOST`) and `DEMO_TOKEN` is empty,
 * or when `PORT` is not an integer in 1..65535. A whitespace-only token counts as unset.
 */
export function resolveServerOptions(env: Record<string, string | undefined>): ServerOptions {
  const hostname = env.HOST?.trim() || DEFAULT_HOST;
  const rawPort = env.PORT?.trim();
  const port = rawPort ? (/^\d+$/.test(rawPort) ? Number(rawPort) : Number.NaN) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${rawPort}").`);
  }
  const token = env.DEMO_TOKEN?.trim() || undefined;
  if (!token && !isLoopbackHost(hostname)) {
    throw new Error(
      `Refusing to listen on ${hostname} without DEMO_TOKEN: POST /turn would be open to the network. ` +
        "Set DEMO_TOKEN, or leave HOST unset to bind 127.0.0.1.",
    );
  }
  return token ? { hostname, port, token } : { hostname, port };
}
