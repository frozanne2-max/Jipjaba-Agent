import { NextRequest } from "next/server";
import { spawnAgent } from "../_lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { message: string, customerId?: string }
 * Runs the JipJaba pipeline (intent -> response -> crm) and streams the
 * assistant response back as newline-delimited JSON events:
 *   {"type":"intent", data:{...}}
 *   {"type":"delta", text:"..."}
 *   {"type":"done", crm:{...}}
 */
export async function POST(req: NextRequest) {
  let message = "";
  let customerId: string | undefined;
  try {
    const body = await req.json();
    message = (body?.message ?? "").toString();
    customerId = body?.customerId ? body.customerId.toString() : undefined;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const args = ["-m", "agents.pipeline", "--stdin", "--stream"];
  if (customerId) args.push("--customer-id", customerId);

  const child = spawnAgent(args);
  // Pass the Korean message over stdin (UTF-8) instead of argv, which Windows
  // mangles via the ANSI code page.
  child.stdin.write(Buffer.from(message, "utf-8"));
  child.stdin.end();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) controller.enqueue(encoder.encode(line + "\n"));
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", error: String(err) }) + "\n"
          )
        );
        controller.close();
      });

      child.on("close", (code) => {
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer.trim() + "\n"));
        }
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: `pipeline exited ${code}`,
                detail: stderr.slice(-2000),
              }) + "\n"
            )
          );
        }
        controller.close();
      });
    },
    cancel() {
      child.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
