"""집잡아(JipJaba) consultation pipeline.

Wires intent -> response -> crm. Uses a LangGraph StateGraph with a
**persistent checkpointer** (SqliteSaver) so each customer's conversation is
remembered across calls. The thread is keyed by ``thread_id = customer_id``,
which means prior turns survive even though the Next.js route spawns a fresh
Python subprocess per request (the state lives on disk in
``data/checkpoints.sqlite``).

Exposes:
  - run(message, customer_id)            -> full result dict (blocking)
  - run_stream(message, customer_id)     -> yields intent/delta/done events

Conversation memory:
  - Prior turns are loaded from the checkpointer and fed into both intent
    classification and response generation, so follow-up questions
    ("그럼 마포는?", "거기 시세는?") resolve correctly.
  - After each turn the new (user, assistant) pair is appended back to the
    thread's history channel.

Also usable as a CLI for the Next.js route:
  python -m agents.pipeline --stdin [--customer-id C1] [--stream]
Streaming mode prints NDJSON lines; final line is a JSON meta event.
"""

from __future__ import annotations

import argparse
import json
import operator
import os
import sys
from typing import Annotated, Iterator, Optional, TypedDict

try:
    from .intent_agent import classify, IntentResult
    from . import response_agent, crm_agent
except ImportError:  # pragma: no cover
    from intent_agent import classify, IntentResult
    import response_agent
    import crm_agent


_CHECKPOINT_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "checkpoints.sqlite")
)
_HISTORY_LIMIT = 12  # keep the last N stored turns (user+assistant) per thread


# --- Persistence ------------------------------------------------------------

def _make_checkpointer():
    """Return a disk-backed SqliteSaver, or None if unavailable.

    SqliteSaver persists to ``data/checkpoints.sqlite`` so conversation state
    survives across the per-request subprocesses spawned by the chat route.
    """
    try:
        import sqlite3

        from langgraph.checkpoint.sqlite import SqliteSaver
    except Exception:  # noqa: BLE001 - langgraph/sqlite saver not installed
        return None
    try:
        os.makedirs(os.path.dirname(_CHECKPOINT_PATH), exist_ok=True)
        conn = sqlite3.connect(_CHECKPOINT_PATH, check_same_thread=False)
        saver = SqliteSaver(conn)
        saver.setup()
        return saver
    except Exception:  # noqa: BLE001 - degrade gracefully (memory only)
        return None


class State(TypedDict, total=False):
    message: str
    customer_id: Optional[str]
    history: Annotated[list, operator.add]
    intent: dict
    response: str
    crm: dict


_GRAPH = None  # cached compiled graph (per process)
_GRAPH_BUILT = False


def build_graph():
    """Return a compiled LangGraph app with a persistent checkpointer.

    Cached per process. Returns None if LangGraph is unavailable, in which case
    the pipeline runs the three steps sequentially without memory.
    """
    global _GRAPH, _GRAPH_BUILT
    if _GRAPH_BUILT:
        return _GRAPH
    _GRAPH_BUILT = True

    try:
        from langgraph.graph import StateGraph, END
    except Exception:  # noqa: BLE001
        _GRAPH = None
        return None

    def intent_node(state: State) -> dict:
        result = classify(state["message"], history=state.get("history"))
        return {"intent": result.to_dict()}

    def response_node(state: State) -> dict:
        obj = IntentResult(**state["intent"])
        text = response_agent.generate(obj, history=state.get("history"))
        return {"response": text}

    def crm_node(state: State) -> dict:
        obj = IntentResult(**state["intent"])
        crm = crm_agent.save_consultation(
            intent=obj.intent,
            message=state["message"],
            response=state["response"],
            confidence_score=obj.confidence,
            urgency=obj.urgency,
            customer_id=state.get("customer_id"),
        )
        return {
            "crm": crm,
            "history": [
                {"role": "user", "content": state["message"]},
                {"role": "assistant", "content": state["response"]},
            ],
        }

    graph = StateGraph(State)
    graph.add_node("intent", intent_node)
    graph.add_node("response", response_node)
    graph.add_node("crm", crm_node)
    graph.set_entry_point("intent")
    graph.add_edge("intent", "response")
    graph.add_edge("response", "crm")
    graph.add_edge("crm", END)

    checkpointer = _make_checkpointer()
    _GRAPH = graph.compile(checkpointer=checkpointer)
    return _GRAPH


def _thread_config(customer_id: Optional[str]) -> dict:
    return {"configurable": {"thread_id": customer_id or "anon"}}


def _load_history(app, config) -> list:
    try:
        snap = app.get_state(config)
    except Exception:  # noqa: BLE001
        return []
    values = getattr(snap, "values", None) or {}
    return values.get("history", []) or []


# --- Public API -------------------------------------------------------------

def run(message: str, customer_id: Optional[str] = None) -> dict:
    """Blocking run. Uses the persistent graph when available."""
    app = build_graph()
    if app is None:
        return _run_no_memory(message, customer_id)

    config = _thread_config(customer_id)
    state = app.invoke(
        {"message": message, "customer_id": customer_id},
        config=config,
    )
    intent_dict = state.get("intent") or {}
    suggestions = []
    try:
        obj = IntentResult(**intent_dict)
        suggestions = response_agent.suggest_followups_llm(
            obj, state.get("response") or "", history=state.get("history")
        )
    except Exception:  # noqa: BLE001
        pass
    return {
        "intent": intent_dict,
        "response": state.get("response"),
        "crm": state.get("crm"),
        "turns": len(state.get("history", [])) // 2,
        "suggestions": suggestions,
    }


def run_stream(message: str, customer_id: Optional[str] = None) -> Iterator[dict]:
    """Streaming run. Streams response tokens, then persists the turn.

    The response LLM call streams directly (the anthropic SDK emits tokens),
    so generation runs outside the graph; the graph/checkpointer is still the
    source of truth for conversation history.
    """
    app = build_graph()
    config = _thread_config(customer_id)
    history = _load_history(app, config) if app is not None else []

    intent = classify(message, history=history)
    yield {"type": "intent", "data": intent.to_dict()}

    collected = []
    for chunk in response_agent.stream(intent, history=history):
        collected.append(chunk)
        yield {"type": "delta", "text": chunk}
    response_text = "".join(collected)

    try:
        suggestions = response_agent.suggest_followups_llm(
            intent, response_text, history=history
        )
    except Exception:  # noqa: BLE001
        suggestions = []

    crm_result = crm_agent.save_consultation(
        intent=intent.intent,
        message=message,
        response=response_text,
        confidence_score=intent.confidence,
        urgency=intent.urgency,
        customer_id=customer_id,
    )

    turns = len(history) // 2 + 1
    if app is not None:
        try:
            app.update_state(
                config,
                {
                    "message": message,
                    "customer_id": customer_id,
                    "intent": intent.to_dict(),
                    "response": response_text,
                    "history": [
                        {"role": "user", "content": message},
                        {"role": "assistant", "content": response_text},
                    ],
                },
                as_node="crm",
            )
        except Exception:  # noqa: BLE001 - persistence is best-effort
            pass

    yield {"type": "done", "crm": crm_result, "turns": turns, "suggestions": suggestions}


def _run_no_memory(message: str, customer_id: Optional[str]) -> dict:
    intent = classify(message)
    response_text = response_agent.generate(intent)
    crm_result = crm_agent.save_consultation(
        intent=intent.intent,
        message=message,
        response=response_text,
        confidence_score=intent.confidence,
        urgency=intent.urgency,
        customer_id=customer_id,
    )
    return {"intent": intent.to_dict(), "response": response_text, "crm": crm_result, "turns": 1}


def _main() -> None:
    parser = argparse.ArgumentParser(description="집잡아 consultation pipeline")
    parser.add_argument("--message", default=None)
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="read the message from stdin (UTF-8) to avoid argv encoding issues",
    )
    parser.add_argument("--customer-id", default=None)
    parser.add_argument("--stream", action="store_true")
    args = parser.parse_args()

    if args.stdin or args.message is None:
        args.message = sys.stdin.read()
    args.message = (args.message or "").strip()
    if not args.message:
        parser.error("a message is required (via --message or stdin)")

    if args.stream:
        for event in run_stream(args.message, args.customer_id):
            sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    else:
        result = run(args.message, args.customer_id)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
