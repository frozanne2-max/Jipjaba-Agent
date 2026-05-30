import { NextRequest } from "next/server";
import { spawnAgent } from "../_lib/python";
import { agentServiceUrl } from "../_lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load the raw consultation list, via the remote service or a subprocess. */
async function loadConsultations(): Promise<any[]> {
  const serviceUrl = agentServiceUrl();
  if (serviceUrl) {
    const res = await fetch(`${serviceUrl}/crm?limit=500`, { cache: "no-store" });
    if (!res.ok) throw new Error(`agent service ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // Local-dev fallback: spawn Python.
  const py = [
    "-c",
    "import json,sys; from agents import crm_agent; sys.stdout.write(json.dumps(crm_agent.list_consultations(500), ensure_ascii=False))",
  ];
  const child = spawnAgent(py);
  const out = await new Promise<{ ok: boolean; data: string; err: string }>((resolve) => {
    let data = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => (data += c.toString("utf-8")));
    child.stderr.on("data", (c: Buffer) => (err += c.toString("utf-8")));
    child.on("error", (e) => resolve({ ok: false, data: "", err: String(e) }));
    child.on("close", (code) => resolve({ ok: code === 0, data, err }));
  });
  if (!out.ok) throw new Error(out.err.slice(-2000) || "subprocess failed");
  try {
    return JSON.parse(out.data || "[]");
  } catch {
    return [];
  }
}

/**
 * GET /api/crm
 * Returns all consultations (from Airtable if configured, else local store)
 * plus simple aggregate stats for the admin dashboard.
 */
export async function GET(_req: NextRequest) {
  let consultations: any[] = [];
  try {
    consultations = await loadConsultations();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "failed to load consultations", detail: String(e).slice(-2000) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    total: consultations.length,
    today: consultations.filter((c) => (c.timestamp || "").slice(0, 10) === today).length,
    escalated: consultations.filter((c) => c.status === "escalated").length,
    pending: consultations.filter((c) => c.status === "pending").length,
    resolved: consultations.filter((c) => c.status === "resolved").length,
    byIntent: consultations.reduce((acc: Record<string, number>, c) => {
      const k = c.intent || "UNKNOWN";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };

  // newest first
  consultations.sort((a, b) =>
    (b.timestamp || "").localeCompare(a.timestamp || "")
  );

  return new Response(JSON.stringify({ consultations, stats }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
