"""집잡아(JipJaba) Response Agent.

Takes the intent_agent output, loads the relevant slice of mock data, and
generates a Korean consultation response using the Claude API. Supports both a
blocking call (`generate`) and a token stream (`stream`) for the Next.js chat
route. Falls back to a deterministic template when no API key is configured so
the pipeline can be exercised offline.
"""

from __future__ import annotations

import os
from typing import Iterator

try:  # allow running as module or script
    from .intent_agent import IntentResult
    from . import data_loader
except ImportError:  # pragma: no cover - script execution
    from intent_agent import IntentResult
    import data_loader

MODEL = os.environ.get("RESPONSE_MODEL", "claude-haiku-4-5")
SUGGEST_MODEL = os.environ.get("SUGGEST_MODEL", MODEL)

SUGGEST_TOOL = {
    "name": "suggest_questions",
    "description": "고객이 방금 받은 답변에 이어서 자연스럽게 물어볼 후속 질문 3개를 생성한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 3,
                "maxItems": 3,
                "description": "고객 1인칭 시점의 짧은 한국어 후속 질문 3개",
            }
        },
        "required": ["questions"],
    },
}

SUGGEST_SYSTEM = (
    "당신은 부동산 상담 대화의 '후속 질문 예측기'입니다. 방금 상담사가 한 답변을 읽고, "
    "고객이 이어서 자연스럽게 물어볼 질문 3개를 예측하세요.\n"
    "규칙:\n"
    "- 고객(1인칭) 입장에서 실제로 입력할 법한 짧고 구체적인 질문 (각 25자 이내).\n"
    "- 답변에 등장한 구체적 매물 ID·지역·금액·조건을 활용해 맥락에 맞게.\n"
    "- 이미 답변에서 충분히 설명된 내용은 다시 묻지 않기. 대화를 한 걸음 진전시키는 질문.\n"
    "- 한국어로, 반드시 suggest_questions 도구로만 반환."
)

SYSTEM_PROMPT = """당신은 '집잡아(JipJaba)'의 전문 부동산 상담사입니다.
한국 임대차 시장에 정통하며, 고객에게 친절하고 신뢰감 있게 한국어로 답변합니다.

[답변 분량 — 매우 중요]
- 짧고 정확하게. 핵심만 전달한다. 보통 3~6문장 또는 4개 이하의 짧은 불릿이면 충분하다.
- 불필요한 인사말·서론·맺음말·과한 이모지를 넣지 않는다.
- 표(table)는 비교가 꼭 필요할 때만 쓰고, 열은 3개 이하로 간단히 한다. 매물 1~2건은 표 대신 한 줄 불릿으로 정리한다.
- 같은 내용을 반복하지 않는다.

[형식]
- 마크다운을 활용하되 과하지 않게: 굵게(**), 짧은 불릿(-), 필요 시 작은 제목(##) 정도만.

[상담 원칙]
1. 전세 관련 답변에는 '확정일자'와 '전입신고'의 중요성을 한 줄로 짚는다(반복 금지).
2. 전세가율(매매가 대비 전세보증금 비율)이 80%를 초과하면 '깡통전세' 위험을 경고하고 반환보증보험 가입을 권한다.
3. 고객 불만/분쟁(COMPLAINT)에는 먼저 공감하고, 전문 상담원 에스컬레이션을 짧게 안내한다.
   방문/상담 예약(APPOINTMENT_BOOKING)은 원하는 날짜·시간을 확인하고, 일시가 명확하면
   예약이 접수됨을 안내한다. 일시가 불명확하면 희망 날짜·시간을 한 줄로 되묻는다.
4. 제공된 매물/시세/FAQ 데이터에 근거해 답하고, 데이터에 없는 사실은 추측하지 않는다.
5. 확정적 법률 단정은 피하고, 필요 시 전문가 확인을 한 줄로 권한다.
"""


def _format_won(value) -> str:
    if not value:
        return "-"
    eok = value // 100_000_000
    man = (value % 100_000_000) // 10_000
    parts = []
    if eok:
        parts.append(f"{eok}억")
    if man:
        parts.append(f"{man:,}만원")
    return " ".join(parts) if parts else f"{value:,}원"


def build_context(intent: IntentResult) -> dict:
    """Select the relevant data slice and any deterministic warnings."""
    ctx = {"listings": [], "market": [], "faq": [], "flags": []}

    if intent.intent in ("PROPERTY_SEARCH", "PRICE_INQUIRY", "APPOINTMENT_BOOKING"):
        ctx["listings"] = data_loader.find_listings(
            location=intent.location,
            property_type=intent.property_type,
            budget=intent.budget,
        )
    if intent.intent in ("PRICE_INQUIRY", "PROPERTY_SEARCH"):
        ctx["market"] = data_loader.find_market(
            location=intent.location, property_type=intent.property_type
        )
    if intent.intent in ("CONTRACT_INQUIRY", "LEGAL_QUESTION"):
        ctx["faq"] = data_loader.find_faq(keywords=[intent.raw_message])
        # also keyword match on the message tokens
        ctx["faq"] = data_loader.find_faq(
            keywords=[w for w in intent.raw_message.replace("?", " ").split()]
        )

    if intent.intent == "COMPLAINT":
        ctx["flags"].append("ESCALATE")

    # 전세가율 heuristic: jeonse listing whose price is at/above market high band
    for row in ctx["listings"]:
        if row.get("deal_type") == "전세" and row.get("jeonse_price"):
            band = next(
                (
                    m
                    for m in data_loader.market_prices()
                    if m["location"] == row["location"] and m["type"] == row["type"]
                ),
                None,
            )
            if band and row["jeonse_price"] >= band["jeonse_max"]:
                ctx["flags"].append(f"HIGH_JEONSE_RATIO:{row['id']}")

    return ctx


def _render_context_text(ctx: dict) -> str:
    lines = []
    if ctx["listings"]:
        lines.append("## 추천 매물")
        for r in ctx["listings"]:
            if r["deal_type"] == "전세":
                price = f"전세 {_format_won(r['jeonse_price'])}"
            else:
                price = f"보증금 {_format_won(r['deposit'])} / 월세 {_format_won(r['monthly_rent'])}"
            options = ", ".join(r.get("options") or []) or "정보 없음"
            address = r.get("address") or "-"
            floor = r.get("floor")
            floor_text = f", {floor}층" if floor else ""
            lines.append(
                f"- [{r['id']}] {r['title']} ({r['location']}/{r['type']}/{r['area_m2']}㎡{floor_text}) "
                f"- {price}, 관리비 {_format_won(r['maintenance_fee'])}, 입주 {r['available_from']}\n"
                f"  · 주소: {address}\n"
                f"  · 옵션: {options}"
            )
    if ctx["market"]:
        lines.append("\n## 시세 정보")
        for m in ctx["market"]:
            lines.append(
                f"- {m['location']} {m['type']} ({m['area_range_m2']}㎡): "
                f"전세 평균 {_format_won(m['jeonse_avg'])} "
                f"(범위 {_format_won(m['jeonse_min'])}~{_format_won(m['jeonse_max'])}), "
                f"월세 평균 {_format_won(m['monthly_rent_avg'])}"
            )
    if ctx["faq"]:
        lines.append("\n## 관련 FAQ")
        for f in ctx["faq"]:
            lines.append(f"- Q: {f['question']}\n  A: {f['answer']}")
    if ctx["flags"]:
        lines.append("\n## 시스템 플래그")
        if "ESCALATE" in ctx["flags"]:
            lines.append("- 고객 불만 접수: 전문 상담원 에스컬레이션 안내 필요")
        for flag in ctx["flags"]:
            if flag.startswith("HIGH_JEONSE_RATIO"):
                lines.append(
                    f"- {flag.split(':')[1]} 매물은 시세 상단 이상으로 전세가율 위험 가능성 → 보증보험·근저당 확인 경고 필요"
                )
    return "\n".join(lines) if lines else "(관련 데이터 없음)"


def _history_messages(history, limit: int = 8) -> list:
    """Convert stored {role, content} turns into Anthropic message dicts."""
    out = []
    for turn in (history or [])[-limit:]:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": content})
    return out


def _build_messages(intent: IntentResult, ctx: dict, history=None) -> list:
    context_text = _render_context_text(ctx)
    user_block = (
        f"[고객 메시지]\n{intent.raw_message}\n\n"
        f"[분류 결과] intent={intent.intent}, 신뢰도={intent.confidence}, "
        f"지역={intent.location}, 유형={intent.property_type}, "
        f"예산={_format_won(intent.budget) if intent.budget else '미상'}, "
        f"긴급도={intent.urgency}\n\n"
        f"[참고 데이터]\n{context_text}\n\n"
        "위 데이터를 근거로 집잡아 상담사로서 고객에게 한국어로 답변하세요. "
        "이전 대화 맥락이 있으면 자연스럽게 이어서 답하세요."
    )
    messages = _history_messages(history)
    messages.append({"role": "user", "content": user_block})
    return messages


def _fallback_response(intent: IntentResult, ctx: dict) -> str:
    parts = []
    if intent.intent == "COMPLAINT":
        parts.append(
            "불편을 드려 정말 죄송합니다. 말씀하신 내용은 전문 상담원에게 즉시 "
            "에스컬레이션하여 빠르게 도와드리겠습니다."
        )
    elif intent.intent == "PROPERTY_SEARCH":
        parts.append("요청하신 조건에 맞는 매물을 안내해 드립니다.")
    elif intent.intent == "PRICE_INQUIRY":
        parts.append("문의하신 지역·유형의 시세 정보를 안내해 드립니다.")
    elif intent.intent == "CONTRACT_INQUIRY":
        parts.append("계약 관련 안내를 도와드리겠습니다.")
    elif intent.intent == "LEGAL_QUESTION":
        parts.append("문의하신 법률·권리 사항에 대해 안내해 드립니다.")
    elif intent.intent == "APPOINTMENT_BOOKING":
        if intent.appointment_datetime:
            parts.append(
                f"요청하신 일정({intent.appointment_datetime})으로 방문 상담 예약을 접수했습니다. "
                "확정 안내를 곧 보내드리겠습니다."
            )
        else:
            parts.append("방문 상담을 도와드리겠습니다. 희망하시는 날짜와 시간을 알려주세요.")

    parts.append(_render_context_text(ctx))

    if any(f.startswith("HIGH_JEONSE_RATIO") for f in ctx["flags"]):
        parts.append(
            "⚠️ 일부 매물은 시세 상단 이상으로 전세가율이 높아 '깡통전세' 위험이 있을 수 있습니다. "
            "계약 전 등기부등본의 근저당을 확인하고 전세보증금 반환보증보험(HUG/SGI) 가입을 권장합니다."
        )
    if intent.intent in ("PROPERTY_SEARCH", "CONTRACT_INQUIRY", "LEGAL_QUESTION", "PRICE_INQUIRY"):
        parts.append(
            "📌 전세 계약 시 입주 당일 전입신고와 함께 '확정일자'를 반드시 받아 우선변제권을 확보하세요."
        )
    return "\n\n".join(p for p in parts if p)


def suggest_followups(intent: IntentResult, ctx: dict) -> list:
    """Build up to 3 short, context-aware Korean follow-up questions.

    Deterministic (no extra LLM call): keyed off the classified intent and the
    data slice that was actually loaded, so suggestions reference real listings
    / locations the customer just saw.
    """
    loc = intent.location or ""
    ptype = intent.property_type or ""
    listings = ctx.get("listings") or []
    flags = ctx.get("flags") or []
    high_jeonse = any(str(f).startswith("HIGH_JEONSE_RATIO") for f in flags)

    s: list[str] = []
    if high_jeonse:
        s.append("이 매물 전세가율이 위험한가요?")

    if intent.intent == "PROPERTY_SEARCH":
        if listings:
            s.append(f"{listings[0]['id']} 매물 옵션 알려줘")
            s.append(f"{listings[0]['id']} 입주 가능일이 언제예요?")
        if loc:
            s.append(f"{loc} {ptype} 전세 시세는 어때요?".replace("  ", " ").strip())
        s.append("전세 계약할 때 주의할 점은?")
    elif intent.intent == "PRICE_INQUIRY":
        if loc:
            s.append(f"{loc} {ptype} 매물 보여줘".replace("  ", " ").strip())
        s.append("추천 매물의 옵션이 궁금해요")
        s.append("확정일자는 어떻게 받나요?")
    elif intent.intent == "CONTRACT_INQUIRY":
        s.append("계약할 때 필요한 서류는?")
        s.append("중개수수료는 얼마인가요?")
        s.append("전세보증보험은 어떻게 가입하나요?")
    elif intent.intent == "LEGAL_QUESTION":
        s.append("전입신고는 어떻게 하나요?")
        s.append("깡통전세인지 확인하는 방법은?")
        s.append("전세보증보험 가입 방법 알려줘")
    elif intent.intent == "COMPLAINT":
        s.append("전문 상담원에게 연결해줘")
        s.append("보증금 반환 절차를 알려줘")
        s.append("임차권등기명령이 뭔가요?")
    elif intent.intent == "APPOINTMENT_BOOKING":
        if not intent.appointment_datetime:
            s.append("이번 주 토요일 오후 2시에 방문하고 싶어요")
        s.append("방문 시 준비할 서류가 있나요?")
        s.append("예약 시간을 변경할 수 있나요?")
        if listings:
            s.append(f"{listings[0]['id']} 매물도 같이 볼 수 있나요?")

    out: list[str] = []
    for q in s:
        if q and q not in out:
            out.append(q)
        if len(out) == 3:
            break
    return out


def _dedupe3(items) -> list:
    out: list[str] = []
    for q in items or []:
        q = (q or "").strip()
        if q and q not in out:
            out.append(q)
        if len(out) == 3:
            break
    return out


def suggest_followups_llm(intent: IntentResult, response_text: str, history=None) -> list:
    """Predict the customer's next questions from the *actual answer*.

    Uses Claude to read the last answer (plus recent history) and propose 3
    natural follow-up questions. Falls back to the deterministic template-based
    `suggest_followups` when no API key is set or the call fails.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return suggest_followups(intent, build_context(intent))
    try:
        import anthropic

        client = anthropic.Anthropic()
        messages = _history_messages(history, limit=6)
        messages.append(
            {
                "role": "user",
                "content": (
                    f"[직전 고객 질문]\n{intent.raw_message}\n\n"
                    f"[상담사 답변]\n{response_text}\n\n"
                    "위 답변을 읽고, 이 고객이 다음에 이어서 물어볼 만한 후속 질문 3개를 예측하세요."
                ),
            }
        )
        resp = client.messages.create(
            model=SUGGEST_MODEL,
            max_tokens=300,
            system=SUGGEST_SYSTEM,
            tools=[SUGGEST_TOOL],
            tool_choice={"type": "tool", "name": "suggest_questions"},
            messages=messages,
        )
        tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
        if tool_use is None:
            return suggest_followups(intent, build_context(intent))
        out = _dedupe3(tool_use.input.get("questions"))
        return out or suggest_followups(intent, build_context(intent))
    except Exception:  # noqa: BLE001 - degrade to template suggestions
        return suggest_followups(intent, build_context(intent))


def generate(intent: IntentResult, history=None) -> str:
    """Blocking generation. Returns the full Korean response text."""
    ctx = build_context(intent)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return _fallback_response(intent, ctx)
    try:
        import anthropic

        client = anthropic.Anthropic()
        resp = client.messages.create(
            model=MODEL,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=_build_messages(intent, ctx, history=history),
        )
        return "".join(b.text for b in resp.content if b.type == "text")
    except Exception as exc:  # noqa: BLE001
        return _fallback_response(intent, ctx) + f"\n\n(LLM 오류로 기본 응답 사용: {exc})"


def stream(intent: IntentResult, history=None) -> Iterator[str]:
    """Yield response text chunks for streaming to the client."""
    ctx = build_context(intent)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        text = _fallback_response(intent, ctx)
        for i in range(0, len(text), 40):
            yield text[i : i + 40]
        return
    try:
        import anthropic

        client = anthropic.Anthropic()
        with client.messages.stream(
            model=MODEL,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=_build_messages(intent, ctx, history=history),
        ) as s:
            for chunk in s.text_stream:
                yield chunk
    except Exception as exc:  # noqa: BLE001
        yield _fallback_response(intent, ctx)
        yield f"\n\n(LLM 오류로 기본 응답 사용: {exc})"


if __name__ == "__main__":
    try:
        from .intent_agent import classify
    except ImportError:
        from intent_agent import classify

    for msg in [
        "강남에 전세 원룸 3억 정도로 찾고 있어요",
        "집주인이 보증금을 안 돌려줘요 너무 화나요",
        "마포 투룸 전세 시세 얼마인가요",
        "전세 계약할 때 확정일자 꼭 받아야 하나요?",
    ]:
        intent = classify(msg)
        print(f"\n=== {msg} -> {intent.intent} ({intent.confidence}) ===")
        print(generate(intent))
