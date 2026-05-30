"use client";

import { useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";

type CalendarInfo = {
  status: string; // booked | needs_datetime | unconfigured | error | skipped | none
  summary?: string;
  start?: string;
  end?: string;
  html_link?: string;
};

type Msg = {
  role: "user" | "assistant";
  text: string;
  intent?: string;
  confidence?: number;
  suggestions?: string[];
  calendar?: CalendarInfo;
};

const INTENT_META: Record<string, { label: string; cls: string }> = {
  PROPERTY_SEARCH: { label: "매물검색", cls: "bg-brand-50 text-brand-700" },
  CONTRACT_INQUIRY: { label: "계약문의", cls: "bg-violet-50 text-violet-700" },
  PRICE_INQUIRY: { label: "시세문의", cls: "bg-emerald-50 text-emerald-700" },
  LEGAL_QUESTION: { label: "법률질문", cls: "bg-amber-50 text-amber-700" },
  COMPLAINT: { label: "불만접수", cls: "bg-rose-50 text-rose-700" },
  APPOINTMENT_BOOKING: { label: "방문예약", cls: "bg-sky-50 text-sky-700" },
};

const SUGGESTIONS = [
  { icon: "🔑", text: "강남에 전세 원룸 3억 정도로 찾고 있어요" },
  { icon: "📊", text: "마포 투룸 전세 시세가 얼마인가요?" },
  { icon: "📝", text: "전세 계약할 때 확정일자 꼭 받아야 하나요?" },
  { icon: "🛟", text: "집주인이 보증금을 안 돌려줘요" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function fmtKDateTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]}) ${hh}:${mm}`;
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AppointmentCard({ cal }: { cal: CalendarInfo }) {
  return (
    <div className="mt-2.5 w-full max-w-sm rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 shadow-soft">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-sky-700">
        <CalendarIcon /> 방문 예약 확정
      </div>
      <div className="mt-1.5 text-[15px] font-extrabold text-ink">{fmtKDateTime(cal.start)}</div>
      {cal.summary && <div className="mt-0.5 text-[12.5px] text-ink-soft">{cal.summary}</div>}
      {cal.html_link && (
        <a
          href={cal.html_link}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-sky-700 ring-1 ring-sky-200 transition-colors hover:bg-sky-100"
        >
          캘린더에서 보기 →
        </a>
      )}
    </div>
  );
}

function AppointmentPicker({ onPick }: { onPick: (text: string) => void }) {
  const slots = [
    { days: 1, h: 14 },
    { days: 1, h: 16 },
    { days: 2, h: 11 },
    { days: 3, h: 15 },
  ].map(({ days, h }) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    const label = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${h}:00`;
    const send = `${d.getMonth() + 1}월 ${d.getDate()}일 ${h}시에 방문할게요`;
    return { label, send };
  });

  function pickCustom(value: string) {
    if (!value) return;
    const d = new Date(value);
    if (isNaN(d.getTime())) return;
    onPick(
      `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${d.getMinutes()}분에 방문할게요`
    );
  }

  return (
    <div className="mt-2.5 w-full max-w-sm rounded-2xl border border-line bg-white p-3 shadow-soft">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink-soft">
        <CalendarIcon /> 방문 일시를 선택하세요
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {slots.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.send)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-line/70 pt-2.5">
        <input
          type="datetime-local"
          onChange={(e) => (e.currentTarget.dataset.val = e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-sky-300"
        />
        <button
          onClick={(e) => {
            const input = e.currentTarget.parentElement?.querySelector("input");
            pickCustom((input as HTMLInputElement)?.value || "");
          }}
          className="shrink-0 rounded-xl bg-sky-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-sky-700"
        >
          예약
        </button>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-ink-faint animate-blink"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Stable per-browser id so the backend conversation thread (LangGraph
  // checkpointer, keyed by thread_id = customerId) persists across reloads.
  const customerId = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const KEY = "jipjaba_customer_id";
    let id = "";
    try {
      id = localStorage.getItem(KEY) || "";
      if (!id) {
        id = "CUST-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(KEY, id);
      }
    } catch {
      id = "CUST-" + Math.random().toString(36).slice(2, 10);
    }
    customerId.current = id;
  }, []);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (!customerId.current) {
      customerId.current = "CUST-" + Math.random().toString(36).slice(2, 10);
    }
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: message }]);
    const assistantIdx = messages.length + 1;
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, customerId: customerId.current }),
      });
      if (!res.body) throw new Error("스트림을 받을 수 없습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let evt: any;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "intent") {
            setMessages((m) => {
              const copy = [...m];
              copy[assistantIdx] = {
                ...copy[assistantIdx],
                intent: evt.data?.intent,
                confidence: evt.data?.confidence,
              };
              return copy;
            });
          } else if (evt.type === "delta") {
            setMessages((m) => {
              const copy = [...m];
              copy[assistantIdx] = {
                ...copy[assistantIdx],
                text: copy[assistantIdx].text + (evt.text || ""),
              };
              return copy;
            });
            scrollToBottom();
          } else if (evt.type === "done") {
            setMessages((m) => {
              const copy = [...m];
              copy[assistantIdx] = {
                ...copy[assistantIdx],
                suggestions: Array.isArray(evt.suggestions) ? evt.suggestions : [],
                calendar: evt.calendar || undefined,
              };
              return copy;
            });
          } else if (evt.type === "error") {
            setMessages((m) => {
              const copy = [...m];
              copy[assistantIdx] = {
                ...copy[assistantIdx],
                text:
                  copy[assistantIdx].text +
                  `\n\n[오류] ${evt.error || "처리 중 문제가 발생했습니다."}`,
              };
              return copy;
            });
          }
        }
      }
    } catch (e: any) {
      setMessages((m) => {
        const copy = [...m];
        copy[assistantIdx] = {
          ...copy[assistantIdx],
          text: `[오류] ${e?.message || e}`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-screen flex-col bg-surface">
      <TopNav />

      <div
        ref={scrollRef}
        className="scroll-clean flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl px-4 py-6">
          {empty ? (
            <div className="mt-10 flex flex-col items-center text-center animate-fade-up">
              <Logo size={64} />
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
                무엇을 도와드릴까요?
              </h1>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
                전세·월세·매물·계약·법률까지, 집잡아 AI 상담사가
                <br className="hidden sm:block" />
                데이터에 근거해 친절하게 안내해 드려요.
              </p>

              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-lg">
                      {s.icon}
                    </span>
                    <span className="text-[14px] font-medium leading-snug text-ink-soft group-hover:text-ink">
                      {s.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pb-2">
              {messages.map((m, i) => (
                <MessageRow
                  key={i}
                  m={m}
                  isLast={i === messages.length - 1}
                  busy={busy}
                  onPick={send}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line/70 bg-white/85 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto max-w-3xl px-4 py-3.5"
        >
          <div className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-1.5 pl-4 transition-colors focus-within:border-brand-300 focus-within:bg-white">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="메시지를 입력하세요"
              className="max-h-32 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="전송"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-brand transition-all hover:bg-brand-600 disabled:scale-95 disabled:bg-ink-faint disabled:shadow-none"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h13M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 px-1 text-center text-[11px] text-ink-faint">
            Enter 전송 · Shift+Enter 줄바꿈 · AI 답변은 참고용이며 계약 전 전문가 확인을 권장합니다
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageRow({
  m,
  isLast,
  busy,
  onPick,
}: {
  m: Msg;
  isLast: boolean;
  busy: boolean;
  onPick: (text: string) => void;
}) {
  const isUser = m.role === "user";
  const meta = m.intent ? INTENT_META[m.intent] : undefined;
  const showSuggestions =
    !isUser && isLast && !busy && (m.suggestions?.length ?? 0) > 0;

  return (
    <div className={`flex animate-fade-up ${isUser ? "justify-end" : "justify-start gap-2.5"}`}>
      {!isUser && (
        <div className="mt-0.5">
          <Logo size={32} />
        </div>
      )}
      <div className={`flex max-w-[82%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && meta && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
              {meta.label}
            </span>
            {typeof m.confidence === "number" && (
              <span className="text-[11px] font-medium text-ink-faint">
                신뢰도 {(m.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        <div
          className={`text-[14.5px] leading-relaxed ${
            isUser
              ? "whitespace-pre-wrap rounded-3xl rounded-tr-md bg-brand px-4 py-2.5 text-white shadow-brand"
              : "rounded-3xl rounded-tl-md border border-line bg-white px-4 py-3 text-ink shadow-soft"
          }`}
        >
          {isUser ? (
            m.text
          ) : m.text ? (
            <Markdown>{m.text}</Markdown>
          ) : (
            <TypingDots />
          )}
        </div>
        {m.calendar?.status === "booked" && <AppointmentCard cal={m.calendar} />}
        {m.calendar?.status === "needs_datetime" && isLast && !busy && (
          <AppointmentPicker onPick={onPick} />
        )}
        {(m.calendar?.status === "error" || m.calendar?.status === "unconfigured") && (
          <div className="mt-2.5 w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-700">
            예약 접수에 일시적인 문제가 있어, 담당 상담원이 확인 후 연락드리겠습니다.
          </div>
        )}
        {showSuggestions && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {m.suggestions!.map((q) => (
              <button
                key={q}
                onClick={() => onPick(q)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-soft shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
