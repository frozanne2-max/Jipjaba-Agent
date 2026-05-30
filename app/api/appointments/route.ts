import { NextRequest } from "next/server";
import { spawnAgent } from "../_lib/python";
import { agentServiceUrl } from "../_lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load upcoming JipJaba appointments via the remote service or a subprocess. */
async function loadAppointments(): Promise<any[]> {
  const serviceUrl = agentServiceUrl();
  if (serviceUrl) {
    const res = await fetch(`${serviceUrl}/appointments?limit=50`, { cache: "no-store" });
    if (!res.ok) throw new Error(`agent service ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  const py = [
    "-c",
    "import json,sys; from agents import calendar_agent; sys.stdout.write(json.dumps(calendar_agent.list_appointments(50), ensure_ascii=False))",
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
 * GET /api/appointments
 * Returns upcoming appointments booked through JipJaba (from Google Calendar).
 */
export async function GET(_req: NextRequest) {
  try {
    const appointments = await loadAppointments();
    return new Response(JSON.stringify({ appointments }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "failed to load appointments", detail: String(e).slice(-2000) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
