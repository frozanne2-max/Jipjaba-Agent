"""집잡아(JipJaba) CRM Agent.

Persists a full consultation record to Airtable via the REST API. When Airtable
credentials are not configured, it appends to a local JSONL file so the pipeline
remains testable offline.

Airtable table fields:
    customer_id, intent, message, response, confidence_score,
    urgency, status, timestamp
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
AIRTABLE_TABLE = os.environ.get("AIRTABLE_TABLE_NAME", "Consultations")

_LOCAL_STORE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "consultations.local.jsonl"
)


def _status_for(intent: str) -> str:
    if intent == "COMPLAINT":
        return "escalated"
    return "pending"


def build_record(
    intent: str,
    message: str,
    response: str,
    confidence_score: float,
    urgency: str,
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    return {
        "customer_id": customer_id or f"CUST-{uuid.uuid4().hex[:8]}",
        "intent": intent,
        "message": message,
        "response": response,
        "confidence_score": round(float(confidence_score), 2),
        "urgency": urgency,
        "status": status or _status_for(intent),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _save_local(record: dict) -> dict:
    with open(_LOCAL_STORE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"backend": "local", "id": record["customer_id"], "record": record}


def _save_airtable(record: dict) -> dict:
    import requests

    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE}"
    headers = {
        "Authorization": f"Bearer {AIRTABLE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"records": [{"fields": record}], "typecast": True}
    resp = requests.post(url, headers=headers, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return {"backend": "airtable", "id": data["records"][0]["id"], "record": record}


def save_consultation(
    intent: str,
    message: str,
    response: str,
    confidence_score: float,
    urgency: str,
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    """Persist a consultation. Uses Airtable if credentials exist, else local JSONL."""
    record = build_record(
        intent=intent,
        message=message,
        response=response,
        confidence_score=confidence_score,
        urgency=urgency,
        customer_id=customer_id,
        status=status,
    )
    if AIRTABLE_API_KEY and AIRTABLE_BASE_ID:
        try:
            return _save_airtable(record)
        except Exception as exc:  # noqa: BLE001
            result = _save_local(record)
            result["airtable_error"] = str(exc)
            return result
    return _save_local(record)


def list_consultations(limit: int = 100) -> list:
    """Fetch consultations. Used by the admin dashboard."""
    if AIRTABLE_API_KEY and AIRTABLE_BASE_ID:
        try:
            import requests

            url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE}"
            headers = {"Authorization": f"Bearer {AIRTABLE_API_KEY}"}
            params = {"pageSize": min(limit, 100)}
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            resp.raise_for_status()
            return [r.get("fields", {}) for r in resp.json().get("records", [])]
        except Exception:  # noqa: BLE001
            pass
    if not os.path.exists(_LOCAL_STORE):
        return []
    with open(_LOCAL_STORE, "r", encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    return rows[-limit:]


if __name__ == "__main__":
    out = save_consultation(
        intent="COMPLAINT",
        message="보증금을 안 돌려줘요",
        response="에스컬레이션 처리하겠습니다.",
        confidence_score=0.82,
        urgency="high",
    )
    print(json.dumps(out, ensure_ascii=False, indent=2))
    print("총 상담 기록:", len(list_consultations()))
