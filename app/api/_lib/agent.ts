/**
 * Resolve the remote Python agent service base URL (no trailing slash).
 *
 * In production (e.g. Vercel) set AGENT_SERVICE_URL to the deployed FastAPI
 * service (agents/server.py). When unset, the API routes fall back to spawning
 * a local Python subprocess — convenient for local development.
 */
export function agentServiceUrl(): string | undefined {
  const raw = process.env.AGENT_SERVICE_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}
