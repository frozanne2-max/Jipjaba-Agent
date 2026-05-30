import { NextRequest } from "next/server";
import { spawnAgent } from "../_lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/crm
 * Returns all consultations (from Airtable if configured, else local store)
 * plus simple aggregate stats for the admin dashboard.
 */
export async function GET(_req: NextRequest) {
  const py = [
    "-c",
    "import json,sys; from agents import crm_agent; sys.stdout.write(json.dumps(crm_agent.list_consultations(500), ensure_ascii=False))",
  ];

  const child = spawnAgent(py);

  const out = await new Promise<{ ok: boolean; data: string; err: string }>(
    (resolve) => {
      let data = "";
      let err = "";
      child.stdout.on("data", (c: Buffer) => (data += c.toString("utf-8")));
      child.stderr.on("data", (c: Buffer) => (err += c.toString("utf-8")));
      child.on("error", (e) => resolve({ ok: false, data: "", err: String(e) }));
      child.on("close", (code) =>
        resolve({ ok: code === 0, data, err })
      );
    }
  );

  if (!out.ok) {
    return new Response(
      JSON.stringify({ error: "failed to load consultations", detail: out.err.slice(-2000) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let consultations: any[] = [];
  try {
    consultations = JSON.parse(out.data || "[]");
  } catch {
    consultations = [];
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
