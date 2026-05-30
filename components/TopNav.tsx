"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "상담" },
  { href: "/admin", label: "관리자" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-extrabold tracking-tight text-ink">
              집잡아
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-ink-muted">
              JipJaba AI
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full bg-surface p-1">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-white text-brand shadow-soft"
                    : "text-ink-muted hover:text-ink-soft"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
