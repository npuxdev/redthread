import { appPath } from "@agent-native/core/client/api-path";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

const LOGO_SRC = appPath("/Redthread%20Arc%20Logo.png");

export function TopBar({ title, question, children }: { title?: string; question?: string; children?: ReactNode }) {
  return (
    <div className="shrink-0 bg-[hsl(var(--rt-graphite))] text-[hsl(180_9%_92%)]">
      <header className="flex h-12 items-center gap-4 px-4">
        <Link to="/" className="flex shrink-0 items-center">
          <img src={LOGO_SRC} alt="REDTHREAD" className="h-[46px] w-auto" />
        </Link>
        {title ? (
          <div className="min-w-0 flex-1 border-l border-white/10 pl-4">
            <span className="block truncate text-[13px] font-medium">{title}</span>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex items-center gap-1.5">{children}</div>
      </header>
      {question ? (
        <div className="flex items-baseline gap-3 border-t border-white/10 px-4 py-1.5">
          <span className="rt-kicker shrink-0 text-[hsl(180_9%_52%)]">Question</span>
          <p className="rt-serif min-w-0 flex-1 text-[13px] leading-snug italic text-[hsl(180_9%_82%)]">{question}</p>
        </div>
      ) : null}
    </div>
  );
}

export const BarButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode }
>(function BarButton({ children, active, icon, className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={cn(
        "rt-press inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2.5 text-[12px] font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        active
          ? "border-white/28 bg-white/16 text-white"
          : "border-white/18 bg-white/8 text-[hsl(180_9%_88%)] hover:border-white/30 hover:bg-white/14 hover:text-white",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});
