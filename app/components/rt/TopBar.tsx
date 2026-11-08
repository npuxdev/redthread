import type { ReactNode } from "react";
import { Link } from "react-router";

export function ThreadMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="5" cy="17" r="2" fill="currentColor" opacity="0.55" />
      <circle cx="12" cy="7" r="2" fill="currentColor" opacity="0.55" />
      <circle cx="19" cy="14" r="2" fill="currentColor" opacity="0.55" />
      <path d="M5 17 C 8 9, 9 7, 12 7 S 16 14, 19 14" fill="none" stroke="hsl(var(--rt-oxide))" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar({ title, question, children }: { title?: string; question?: string; children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 bg-[hsl(var(--rt-graphite))] px-4 text-[hsl(180_9%_92%)]">
      <Link to="/" className="flex items-center gap-2">
        <ThreadMark className="h-5 w-5 text-[hsl(180_9%_80%)]" />
        <span className="text-[12.5px] font-semibold tracking-[0.16em]">REDTHREAD</span>
      </Link>
      {title ? (
        <div className="flex min-w-0 flex-1 items-baseline gap-3 border-l border-white/10 pl-4">
          <span className="truncate text-[13px] font-medium">{title}</span>
          {question ? <span className="rt-serif hidden truncate text-[13px] italic text-[hsl(180_9%_70%)] lg:block">{question}</span> : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-1">{children}</div>
    </header>
  );
}

export function BarButton({ children, onClick, active, title }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-7 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors ${active ? "bg-white/12 text-white" : "text-[hsl(180_9%_78%)] hover:bg-white/8 hover:text-white"}`}
    >
      {children}
    </button>
  );
}
