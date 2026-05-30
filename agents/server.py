"""집잡아(JipJaba) Agent Service — FastAPI wrapper around the pipeline.

Deploy this on a Python-friendly host (Railway / Render / Fly / Docker) and
point the Next.js app at it via the AGENT_SERVICE_URL env var. The Next.js
routes then proxy to these endpoints over HTTP instead of spawning a local
Python subprocess (which Vercel's serverless runtime cannot do).

Endpoints:
  GET  /health           -> {"ok": true}
  POST /chat             -> NDJSON stream of {type: intent|delta|done|error}
  GET  /crm?limit=500    -> list[consultation]

Run locally:
  PYTHONUTF8=1 uvicorn agents.server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

try:
    from . import pipeline, crm_agent, calendar_agent
except ImportError:  # pragma: no cover - script execution
    import pipeline
    import crm_agent
    import calendar_agent

app = FastAPI(title="JipJaba Agent Service", version="1.0.0")

# Allow the Next.js frontend (any origin) to call directly if ever needed.
# The primary path is server-to-server from the Next.js route, but CORS keeps
# browser-side calls possible too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "jipjaba-agents"}


@app.post("/chat")
async def chat(req: Request):
    try:
        body = await req.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"error": "invalid JSON body"}, status_code=400)

    message = (body.get("message") or "").strip()
    customer_id = body.get("customerId") or body.get("customer_id")
    if not message:
        return JSONResponse({"error": "message is required"}, status_code=400)

    def generate():
        try:
            for event in pipeline.run_stream(message, customer_id):
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except Exception as exc:  # noqa: BLE001
            yield json.dumps({"type": "error", "error": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache, no-transform"},
    )


@app.get("/crm")
def crm(limit: int = 500):
    return JSONResponse(crm_agent.list_consultations(limit))


@app.get("/appointments")
def appointments(limit: int = 50):
    return JSONResponse(calendar_agent.list_appointments(limit))
