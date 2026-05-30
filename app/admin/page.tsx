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

const INTENT_META: Record<string, { label: string; dot: string; cls: string }> = {
  PROPERTY_SEARCH: { label: "매물검색", dot: "bg-brand-500", cls: "bg-brand-50 text-brand-700" },
  CONTRACT_INQUIRY: { label: "계약문의", dot: "bg-violet-500", cls: "bg-violet-50 text-violet-700" },
  PRICE_INQUIRY: { label: "시세문의", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700" },
  LEGAL_QUESTION: { label: "법률질문", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700" },
  COMPLAINT: { label: "불만접수", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700" },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "불러오기 실패");
      setConsultations(data.consultations || []);
      setStats(data.stats || null);
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

        {/* Table */}
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
      </main>
    </div>
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
