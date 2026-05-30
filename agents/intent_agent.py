"""집잡아(JipJaba) Intent Agent.

Classifies an incoming Korean real estate message into one of five intents and
extracts structured slots (location, type, budget, urgency) with a confidence
score. Uses the Anthropic Claude API with a tool-call schema for reliable
structured output, and falls back to a keyword heuristic when no API key is set
(useful for offline terminal testing).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from typing import Optional

INTENTS = [
    "PROPERTY_SEARCH",
    "CONTRACT_INQUIRY",
    "PRICE_INQUIRY",
    "LEGAL_QUESTION",
    "COMPLAINT",
]

LOCATIONS = ["강남", "마포", "성수"]
PROPERTY_TYPES = ["원룸", "2룸", "투룸", "아파트"]

MODEL = os.environ.get("INTENT_MODEL", "claude-sonnet-4-6")


@dataclass
class IntentResult:
    intent: str
    confidence: float
    location: Optional[str] = None
    property_type: Optional[str] = None
    budget: Optional[int] = None
    urgency: str = "normal"  # low | normal | high
    raw_message: str = ""
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


CLASSIFY_TOOL = {
    "name": "classify_intent",
    "description": "한국 부동산 상담 메시지를 분류하고 구조화된 정보를 추출한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "intent": {
                "type": "string",
                "enum": INTENTS,
                "description": (
                    "PROPERTY_SEARCH=매물 찾기, CONTRACT_INQUIRY=계약/절차 문의, "
                    "PRICE_INQUIRY=시세 문의, LEGAL_QUESTION=법률/권리 질문, "
                    "COMPLAINT=불만/항의/분쟁"
                ),
            },
            "confidence": {
                "type": "number",
                "description": "0.0~1.0 사이 분류 신뢰도",
            },
            "location": {
                "type": ["string", "null"],
                "description": "지역명 (예: 강남, 마포, 성수). 없으면 null",
            },
            "property_type": {
                "type": ["string", "null"],
                "description": "매물 유형 (원룸, 2룸, 아파트). 없으면 null",
            },
            "budget": {
                "type": ["integer", "null"],
                "description": "예산을 원 단위 정수로. 예: 1억 -> 100000000. 없으면 null",
            },
            "urgency": {
                "type": "string",
                "enum": ["low", "normal", "high"],
                "description": "긴급도. 분쟁/즉시 처리 요청은 high",
            },
            "notes": {
                "type": "string",
                "description": "추출 근거나 추가 메모 (한 문장)",
            },
        },
        "required": ["intent", "confidence", "urgency"],
    },
}

SYSTEM_PROMPT = (
    "당신은 집잡아(JipJaba) 부동산 상담 시스템의 의도 분류기입니다. "
    "고객 메시지를 정확히 하나의 intent로 분류하고, 지역/유형/예산/긴급도를 "
    "추출하세요. 반드시 classify_intent 도구를 호출해 결과를 반환하세요."
)


def _normalize_type(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value in ("투룸", "2룸"):
        return "2룸"
    return value


# --- Keyword fallback (no API key) -----------------------------------------

_KEYWORDS = {
    "COMPLAINT": ["불만", "항의", "환불", "사기", "분쟁", "신고", "안돌려", "안 돌려", "최악", "화나"],
    "LEGAL_QUESTION": ["확정일자", "전입신고", "대항력", "등기부", "근저당", "갱신청구", "법", "권리", "보증금 반환", "임차권등기"],
    "PRICE_INQUIRY": ["시세", "얼마", "평균", "가격대", "전세가율", "비싼", "싼", "적정가"],
    "CONTRACT_INQUIRY": ["계약", "복비", "중개수수료", "계약금", "절차", "서류", "보증보험", "특약"],
    "PROPERTY_SEARCH": ["찾", "구해", "매물", "원룸", "투룸", "2룸", "아파트", "방", "추천", "보여"],
}

_BUDGET_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(억|천만원|천만|만원|만)?")


def _parse_budget(text: str) -> Optional[int]:
    best: Optional[int] = None
    for num, unit in _BUDGET_RE.findall(text):
        val = float(num)
        if unit == "억":
            amount = int(val * 100_000_000)
        elif unit in ("천만원", "천만"):
            amount = int(val * 10_000_000)
        elif unit in ("만원", "만"):
            amount = int(val * 10_000)
        else:
            continue
        best = amount if best is None else max(best, amount)
    return best


def _fallback_classify(message: str) -> IntentResult:
    scores = {intent: 0 for intent in INTENTS}
    for intent, words in _KEYWORDS.items():
        for w in words:
            if w in message:
                scores[intent] += 1

    intent = max(scores, key=scores.get)
    hits = scores[intent]
    if hits == 0:
        intent = "PROPERTY_SEARCH"
        confidence = 0.3
    else:
        confidence = min(0.5 + 0.15 * hits, 0.9)

    location = next((loc for loc in LOCATIONS if loc in message), None)
    ptype = next((t for t in PROPERTY_TYPES if t in message), None)
    budget = _parse_budget(message)

    urgency = "normal"
    if intent == "COMPLAINT" or any(k in message for k in ["급", "당장", "오늘", "지금", "즉시"]):
        urgency = "high"

    return IntentResult(
        intent=intent,
        confidence=round(confidence, 2),
        location=location,
        property_type=_normalize_type(ptype),
        budget=budget,
        urgency=urgency,
        raw_message=message,
        notes="keyword-fallback",
    )


# --- Claude API path --------------------------------------------------------

def _history_messages(history, limit: int = 8) -> list:
    """Convert stored {role, content} turns into Anthropic message dicts."""
    out = []
    for turn in (history or [])[-limit:]:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": content})
    return out


def _llm_classify(message: str, history=None) -> IntentResult:
    import anthropic

    client = anthropic.Anthropic()
    messages = _history_messages(history)
    messages.append({"role": "user", "content": message})
    resp = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        tools=[CLASSIFY_TOOL],
        tool_choice={"type": "tool", "name": "classify_intent"},
        messages=messages,
    )

    tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
    if tool_use is None:
        return _fallback_classify(message)

    data = tool_use.input
    return IntentResult(
        intent=data.get("intent", "PROPERTY_SEARCH"),
        confidence=float(data.get("confidence", 0.5)),
        location=data.get("location"),
        property_type=_normalize_type(data.get("property_type")),
        budget=data.get("budget"),
        urgency=data.get("urgency", "normal"),
        raw_message=message,
        notes=data.get("notes", ""),
    )


def classify(message: str, history=None) -> IntentResult:
    """Classify a message. Uses Claude API if ANTHROPIC_API_KEY is set.

    `history` is an optional list of prior {role, content} turns so the
    classifier can resolve follow-up references (e.g. "그럼 마포는?").
    """
    message = (message or "").strip()
    if not message:
        return IntentResult(intent="PROPERTY_SEARCH", confidence=0.0, raw_message="", notes="empty")

    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return _llm_classify(message, history=history)
        except Exception as exc:  # noqa: BLE001 - degrade gracefully in demo
            result = _fallback_classify(message)
            result.notes = f"llm-error-fallback: {exc}"
            return result
    return _fallback_classify(message)


if __name__ == "__main__":
    samples = [
        "강남에 1억으로 전세 원룸 구하고 있어요",
        "전세 계약할 때 확정일자는 꼭 받아야 하나요?",
        "마포 투룸 전세 시세가 얼마인가요?",
        "집주인이 보증금을 안 돌려줘요. 너무 화가 납니다 당장 해결해주세요",
        "계약금은 보통 얼마 내고 돌려받을 수 있나요?",
    ]
    for s in samples:
        r = classify(s)
        print(json.dumps(r.to_dict(), ensure_ascii=False, indent=2))
        print("-" * 60)
