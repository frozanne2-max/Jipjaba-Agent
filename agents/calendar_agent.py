"""집잡아(JipJaba) Calendar Agent.

Books property-viewing / consultation appointments on Google Calendar using the
Google Calendar REST API (via google-api-python-client). Auth uses a **service
account** so it works server-side with no interactive OAuth — production ready.

Configuration (env):
  GOOGLE_SERVICE_ACCOUNT_JSON   inline service-account JSON (preferred on hosts
                                like Render where mounting files is awkward), OR
  GOOGLE_SERVICE_ACCOUNT_FILE   path to the service-account key JSON, OR
  GOOGLE_APPLICATION_CREDENTIALS standard ADC path (fallback)
  GOOGLE_CALENDAR_ID            target calendar id (default "primary"; for a
                                service account, share a real calendar with the
                                SA email and put its id here)
  GOOGLE_IMPERSONATE_SUBJECT    optional user to impersonate (Workspace domain-
                                wide delegation)
  GOOGLE_CALENDAR_TIMEZONE      IANA tz for events (default "Asia/Seoul")
  APPOINTMENT_DURATION_MINUTES  default event length (default 60)

If credentials are missing the agent degrades gracefully: it returns a
structured result with backend="unconfigured" instead of raising, so the
pipeline keeps working in demos/offline.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

SCOPES = ["https://www.googleapis.com/auth/calendar"]

CALENDAR_ID = os.environ.get("GOOGLE_CALENDAR_ID", "primary")
TIMEZONE = os.environ.get("GOOGLE_CALENDAR_TIMEZONE", "Asia/Seoul")
DEFAULT_DURATION = int(os.environ.get("APPOINTMENT_DURATION_MINUTES", "60"))


def _load_credentials():
    """Build service-account credentials from env, or return None."""
    try:
        from google.oauth2 import service_account
    except Exception:  # noqa: BLE001 - lib missing
        return None

    inline = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    file_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )

    creds = None
    try:
        if inline:
            info = json.loads(inline)
            creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        elif file_path and os.path.exists(file_path):
            creds = service_account.Credentials.from_service_account_file(file_path, scopes=SCOPES)
    except Exception:  # noqa: BLE001 - bad/missing key
        return None

    if creds is None:
        return None

    subject = os.environ.get("GOOGLE_IMPERSONATE_SUBJECT")
    if subject:
        try:
            creds = creds.with_subject(subject)
        except Exception:  # noqa: BLE001
            pass
    return creds


def _service():
    creds = _load_credentials()
    if creds is None:
        return None
    try:
        from googleapiclient.discovery import build

        return build("calendar", "v3", credentials=creds, cache_discovery=False)
    except Exception:  # noqa: BLE001
        return None


def _parse_start(start_iso: str) -> Optional[datetime]:
    if not start_iso:
        return None
    s = start_iso.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        # try date-only
        try:
            return datetime.fromisoformat(s + "T10:00:00")
        except ValueError:
            return None


def book_appointment(
    summary: str,
    start_iso: str,
    duration_minutes: int = DEFAULT_DURATION,
    description: Optional[str] = None,
    location: Optional[str] = None,
    attendee_email: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> dict:
    """Create a Google Calendar event. Returns a structured result dict."""
    start_dt = _parse_start(start_iso)
    if start_dt is None:
        return {"backend": "none", "status": "needs_datetime", "detail": f"invalid datetime: {start_iso!r}"}

    end_dt = start_dt + timedelta(minutes=duration_minutes or DEFAULT_DURATION)
    has_tz = start_dt.tzinfo is not None

    service = _service()
    if service is None:
        return {
            "backend": "unconfigured",
            "status": "unconfigured",
            "summary": summary,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "detail": "Google Calendar credentials not configured",
        }

    event_body = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_dt.isoformat(), "timeZone": TIMEZONE} if not has_tz else {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": TIMEZONE} if not has_tz else {"dateTime": end_dt.isoformat()},
    }
    if location:
        event_body["location"] = location
    if attendee_email:
        event_body["attendees"] = [{"email": attendee_email}]
    # Tag our events so we can list only JipJaba bookings (not the user's
    # personal events) on the admin dashboard.
    event_body["extendedProperties"] = {
        "private": {"jipjaba": "1", "customer_id": customer_id or ""}
    }

    try:
        created = (
            service.events()
            .insert(
                calendarId=CALENDAR_ID,
                body=event_body,
                sendUpdates="all" if attendee_email else "none",
            )
            .execute()
        )
        return {
            "backend": "google",
            "status": "booked",
            "event_id": created.get("id"),
            "html_link": created.get("htmlLink"),
            "summary": summary,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
        }
    except Exception as exc:  # noqa: BLE001 - surface API errors without crashing
        return {
            "backend": "google",
            "status": "error",
            "summary": summary,
            "start": start_dt.isoformat(),
            "detail": str(exc)[:500],
        }


def book_from_intent(intent, customer_id: Optional[str] = None) -> dict:
    """Book an appointment from an IntentResult-like object.

    Accepts the IntentResult dataclass (or any object with .intent /
    .appointment_datetime / .location / .raw_message attributes).
    No-op (status="skipped") for non-booking intents.
    """
    if getattr(intent, "intent", None) != "APPOINTMENT_BOOKING":
        return {"backend": "none", "status": "skipped"}

    start_iso = getattr(intent, "appointment_datetime", None)
    if not start_iso:
        return {
            "backend": "none",
            "status": "needs_datetime",
            "detail": "고객이 원하는 방문 일시가 명확하지 않음",
        }

    location = getattr(intent, "location", None)
    who = customer_id or "고객"
    summary = f"[집잡아] {who} 방문 상담" + (f" · {location}" if location else "")
    description = (
        f"집잡아 AI 상담을 통해 접수된 방문/상담 예약입니다.\n"
        f"고객 ID: {who}\n"
        f"요청 메시지: {getattr(intent, 'raw_message', '')}"
    )
    return book_appointment(
        summary=summary,
        start_iso=start_iso,
        description=description,
        location=location,
        customer_id=customer_id,
    )


def list_appointments(max_results: int = 50) -> list:
    """List upcoming JipJaba-created appointments (status="confirmed").

    Filters by our private extended property so the user's personal calendar
    events are excluded. Returns [] when calendar isn't configured.
    """
    from datetime import datetime, timezone

    service = _service()
    if service is None:
        return []
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = (
            service.events()
            .list(
                calendarId=CALENDAR_ID,
                privateExtendedProperty="jipjaba=1",
                timeMin=now_iso,
                singleEvents=True,
                orderBy="startTime",
                maxResults=max_results,
            )
            .execute()
        )
    except Exception:  # noqa: BLE001
        return []

    out = []
    for ev in resp.get("items", []):
        start = ev.get("start", {})
        end = ev.get("end", {})
        props = (ev.get("extendedProperties", {}) or {}).get("private", {}) or {}
        out.append(
            {
                "event_id": ev.get("id"),
                "summary": ev.get("summary", ""),
                "location": ev.get("location", ""),
                "description": ev.get("description", ""),
                "start": start.get("dateTime") or start.get("date"),
                "end": end.get("dateTime") or end.get("date"),
                "html_link": ev.get("htmlLink"),
                "status": ev.get("status", "confirmed"),
                "customer_id": props.get("customer_id", ""),
            }
        )
    return out


if __name__ == "__main__":
    class _Demo:
        intent = "APPOINTMENT_BOOKING"
        appointment_datetime = "2026-06-03T15:00:00"
        location = "강남"
        raw_message = "강남 매물 보러 6월 3일 오후 3시에 방문하고 싶어요"

    print(json.dumps(book_from_intent(_Demo(), customer_id="CUST-demo"), ensure_ascii=False, indent=2))
