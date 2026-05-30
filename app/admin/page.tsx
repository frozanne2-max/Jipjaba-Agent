"use client";

import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";

type Consultation = {
  customer_id: string;
  intent: string;
  message: string;
  response: string;
  confidence_score: number;
  urgency: string;
  status: string;
  timestamp: string;
};

type Stats = {
  total: number;
  today: number;
  escalated: number;
  pending: number;
  resolved: number;
  byIntent: Record<string, number>;
};

type Appointment = {
  event_id: string;
  summary: string;
  location: string;
  start: string;
  end: string;
  html_link: string;
  status: string;
  customer_id: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function fmtAppt(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]}) ${hh}:${mm}`;
}

const INTENT_META: Record<string, { label: string; dot: string; cls: string }> = {
  PROPERTY_SEARCH: { label: "매물검색", dot: "bg-brand-500", cls: "bg-brand-50 text-brand-700" },
  CONTRACT_INQUIRY: { label: "계약문의", dot: "bg-violet-500", cls: "bg-violet-50 text-violet-700" },
  PRICE_INQUIRY: { label: "시세문의", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700" },
  LEGAL_QUESTION: { label: "법률질문", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700" },
  COMPLAINT: { label: "불만접수", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700" },
  APPOINTMENT_BOOKING: { label: "방문예약", dot: "bg-sky-500", cls: "bg-sky-50 text-sky-700" },
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    resolved: { label: "해결됨", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    escalated: { label: "에스컬레이션", cls: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
    pending: { label: "대기중", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  };
  const m = map[status] || { label: status, cls: "bg-surface text-ink-soft", dot: "bg-ink-faint" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function fmtTime(ts: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Admin() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"consultations" | "appointments">("consultations");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [crmRes, apptRes] = await Promise.all([
        fetch("/api/crm", { cache: "no-store" }),
        fetch("/api/appointments", { cache: "no-store" }),
      ]);
      const data = await crmRes.json();
      if (!crmRes.ok) throw new Error(data?.error || "불러오기 실패");
      setConsultations(data.consultations || []);
      setStats(data.stats || null);
      if (apptRes.ok) {
        const ad = await apptRes.json();
        setAppointments(ad.appointments || []);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const intentEntries = Object.entries(stats?.byIntent || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const intentTotal = intentEntries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div className="min-h-screen bg-surface">
      <TopNav />

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              상담 대시보드
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              집잡아 CRM · 실시간 상담 현황
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft shadow-soft transition-colors hover:bg-surface disabled:opacity-60"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className={loading ? "animate-spin" : ""}
            >
              <path
                d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            새로고침
          </button>
        </div>

        {/* Stat cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="오늘 상담" value={stats?.today ?? 0} accent="brand" icon="📈" />
          <StatCard label="전체 상담" value={stats?.total ?? 0} accent="ink" icon="💬" />
          <StatCard
            label="에스컬레이션"
            value={stats?.escalated ?? 0}
            accent="rose"
            icon="🔴"
          />
          <StatCard label="대기중" value={stats?.pending ?? 0} accent="amber" icon="⏳" />
        </section>

        {/* Intent distribution */}
        {intentEntries.length > 0 && (
          <section className="mt-3 rounded-3xl border border-line bg-white p-5 shadow-soft">
            <h2 className="text-sm font-bold text-ink-soft">의도 분포</h2>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
              {intentEntries.map(([k, v]) => {
                const meta = INTENT_META[k];
                return (
                  <div
                    key={k}
                    className={meta?.dot || "bg-ink-faint"}
                    style={{ width: `${(v / intentTotal) * 100}%` }}
                    title={`${meta?.label || k}: ${v}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {intentEntries.map(([k, v]) => {
                const meta = INTENT_META[k];
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
                    <span className={`h-2 w-2 rounded-full ${meta?.dot || "bg-ink-faint"}`} />
                    {meta?.label || k}
                    <span className="font-bold text-ink">{v}</span>
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {/* Tab switcher */}
        <div className="mt-5 inline-flex rounded-full border border-line bg-white p-1 shadow-soft">
          {([
            ["consultations", "상담 내역", consultations.length],
            ["appointments", "방문 예약", appointments.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                view === key ? "bg-brand text-white shadow-brand" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
              <span className={`ml-1.5 ${view === key ? "text-white/80" : "text-ink-faint"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Consultations table */}
        {view === "consultations" && (
        <section className="mt-3 overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3.5">시간</th>
                  <th className="px-5 py-3.5">고객</th>
                  <th className="px-5 py-3.5">의도</th>
                  <th className="px-5 py-3.5">메시지</th>
                  <th className="px-5 py-3.5">신뢰도</th>
                  <th className="px-5 py-3.5">긴급</th>
                  <th className="px-5 py-3.5">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-ink-muted">
                      불러오는 중…
                    </td>
                  </tr>
                ) : consultations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-ink-muted">
                      아직 상담 기록이 없어요.
                    </td>
                  </tr>
                ) : (
                  consultations.map((c, i) => {
                    const meta = INTENT_META[c.intent] || {
                      label: c.intent,
                      cls: "bg-surface text-ink-soft",
                    };
                    return (
                      <tr key={i} className="transition-colors hover:bg-surface/60">
                        <td className="whitespace-nowrap px-5 py-4 text-[13px] text-ink-muted">
                          {fmtTime(c.timestamp)}
                        </td>
                        <td className="px-5 py-4 font-mono text-[12px] text-ink-soft">
                          {c.customer_id}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="max-w-sm truncate px-5 py-4 text-ink-soft">
                          {c.message}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface">
                              <div
                                className="h-full rounded-full bg-brand-400"
                                style={{ width: `${Math.round((c.confidence_score ?? 0) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[12px] font-semibold text-ink-soft">
                              {Math.round((c.confidence_score ?? 0) * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {c.urgency === "high" ? (
                            <span className="font-bold text-rose-600">높음</span>
                          ) : (
                            <span className="text-ink-muted">
                              {c.urgency === "low" ? "낮음" : "보통"}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <StatusPill status={c.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {/* Appointments calendar + list */}
        {view === "appointments" && (
          <div className="mt-3 space-y-3">
            <MonthCalendar appointments={appointments} />
            <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
            <div className="border-b border-line px-5 py-3 text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              전체 목록
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                    <th className="px-5 py-3.5">방문 일시</th>
                    <th className="px-5 py-3.5">고객</th>
                    <th className="px-5 py-3.5">내용</th>
                    <th className="px-5 py-3.5">위치</th>
                    <th className="px-5 py-3.5">캘린더</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center text-ink-muted">
                        불러오는 중…
                      </td>
                    </tr>
                  ) : appointments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center text-ink-muted">
                        예정된 방문 예약이 없어요.
                      </td>
                    </tr>
                  ) : (
                    appointments.map((a) => (
                      <tr key={a.event_id} className="transition-colors hover:bg-surface/60">
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-ink">
                          {fmtAppt(a.start)}
                        </td>
                        <td className="px-5 py-4 font-mono text-[12px] text-ink-soft">
                          {a.customer_id || "-"}
                        </td>
                        <td className="max-w-xs truncate px-5 py-4 text-ink-soft">{a.summary}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-ink-soft">
                          {a.location || "-"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {a.html_link ? (
                            <a
                              href={a.html_link}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-semibold text-brand hover:text-brand-600"
                            >
                              열기 →
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function MonthCalendar({ appointments }: { appointments: Appointment[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const d = new Date(a.start);
    if (isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(a);
  }
  for (const arr of byDay.values())
    arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const first = new Date(cursor.y, cursor.m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }
  function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const monthCount = appointments.filter((a) => {
    const d = new Date(a.start);
    return d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
  }).length;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-extrabold text-ink">
            {cursor.y}년 {cursor.m + 1}월
          </h3>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[12px] font-bold text-sky-700">
            예약 {monthCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface"
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
            className="rounded-full border border-line px-3 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-surface"
          >
            오늘
          </button>
          <button
            onClick={() => shift(1)}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-line bg-surface/50 text-center text-[11px] font-bold">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-2 ${i === 0 ? "text-rose-500" : i === 6 ? "text-brand-600" : "text-ink-muted"}`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const key = day ? `${cursor.y}-${cursor.m}-${day}` : `e${idx}`;
          const events = day ? byDay.get(`${cursor.y}-${cursor.m}-${day}`) || [] : [];
          const isToday = day && `${cursor.y}-${cursor.m}-${day}` === todayKey;
          const dow = idx % 7;
          return (
            <div
              key={key}
              className={`min-h-[92px] border-b border-r border-line/60 p-1.5 [&:nth-child(7n)]:border-r-0 ${
                day ? "" : "bg-surface/30"
              }`}
            >
              {day && (
                <>
                  <div
                    className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                      isToday
                        ? "bg-brand text-white"
                        : dow === 0
                          ? "text-rose-500"
                          : dow === 6
                            ? "text-brand-600"
                            : "text-ink-soft"
                    }`}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 3).map((ev) => (
                      <a
                        key={ev.event_id}
                        href={ev.html_link || undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`${fmtTime(ev.start)} ${ev.summary}${ev.location ? ` · ${ev.location}` : ""}`}
                        className="block truncate rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                      >
                        <span className="font-bold">{fmtTime(ev.start)}</span>{" "}
                        {ev.location || ev.summary}
                      </a>
                    ))}
                    {events.length > 3 && (
                      <div className="px-1.5 text-[10.5px] font-semibold text-ink-faint">
                        +{events.length - 3}건 더
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const ACCENTS: Record<string, string> = {
  brand: "text-brand-600",
  ink: "text-ink",
  rose: "text-rose-600",
  amber: "text-amber-600",
};

function StatCard({
  label,
  value,
  accent = "ink",
  icon,
}: {
  label: string;
  value: number;
  accent?: string;
  icon?: string;
}) {
  return (
    <div className="rounded-3xl border border-line bg-white px-5 py-4 shadow-soft transition-shadow hover:shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className={`mt-2 text-[28px] font-extrabold leading-none ${ACCENTS[accent]}`}>
        {value}
      </p>
    </div>
  );
}
