import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Actor, ArtifactStatus, ConstraintStatus, Epistemic, Standing } from "@shared/investigation";

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("rt-mono text-[11px] font-medium text-[hsl(var(--rt-evidence))]", className)}>{children}</span>;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rt-kicker", className)}>{children}</div>;
}

type BtnTone = "primary" | "quiet" | "ghost" | "critical";

export function Btn({
  children,
  onClick,
  tone = "quiet",
  disabled,
  className,
  title,
  type = "button",
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: BtnTone;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-8 px-3 text-[12.5px]",
        tone === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        tone === "quiet" && "border border-border bg-card text-foreground hover:border-[hsl(var(--primary)/0.5)] hover:text-primary",
        tone === "ghost" && "text-muted-foreground hover:bg-accent hover:text-foreground",
        tone === "critical" && "border border-[hsl(var(--rt-oxide)/0.4)] bg-card text-[hsl(var(--rt-oxide))] hover:bg-[hsl(var(--rt-oxide)/0.06)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

const EPISTEMIC_MARK: Record<Epistemic, { glyph: string; label: string }> = {
  observation: { glyph: "●", label: "Observation" },
  interpretation: { glyph: "◐", label: "Interpretation" },
  inference: { glyph: "○", label: "Inference" },
  speculation: { glyph: "◌", label: "Speculation" },
};

export function EpistemicMark({ value, withLabel }: { value: Epistemic; withLabel?: boolean }) {
  const m = EPISTEMIC_MARK[value];
  return (
    <span title={m.label} className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
      <span className="text-[hsl(var(--rt-evidence))]">{m.glyph}</span>
      {withLabel ? m.label : null}
    </span>
  );
}

export function StatusTag({ status, actor }: { status: ArtifactStatus; actor?: Actor }) {
  if (status === "accepted") return null;
  const tone =
    status === "proposed"
      ? "text-[hsl(var(--rt-evidence))] border-[hsl(var(--rt-evidence)/0.35)] rt-dashed"
      : status === "disputed"
        ? "text-[hsl(var(--rt-unresolved))] border-[hsl(var(--rt-unresolved)/0.4)]"
        : status === "refuted" || status === "rejected"
          ? "text-[hsl(var(--rt-oxide))] border-[hsl(var(--rt-oxide)/0.35)]"
          : "text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex h-[17px] items-center rounded-[3px] border px-1 text-[10px] font-medium uppercase tracking-wide", tone)}>
      {status === "proposed" && actor === "agent" ? "proposed" : status}
    </span>
  );
}

export const STANDING_TONE: Record<Standing, string> = {
  supported: "text-[hsl(var(--rt-confirmed))]",
  open: "text-muted-foreground",
  weakened: "text-[hsl(var(--rt-unresolved))]",
  contradicted: "text-[hsl(var(--rt-oxide))]",
  refuted: "text-[hsl(var(--rt-oxide))]",
};

export function StandingTag({ standing }: { standing: Standing }) {
  return <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.06em]", STANDING_TONE[standing])}>{standing}</span>;
}

export const CONSTRAINT_TONE: Record<ConstraintStatus, string> = {
  consistent: "text-[hsl(var(--rt-confirmed))]",
  violated: "text-[hsl(var(--rt-oxide))]",
  uncertain: "text-[hsl(var(--rt-unresolved))]",
  unplaced: "text-muted-foreground",
};

export function ActorTag({ actor }: { actor: Actor }) {
  return (
    <span
      className={cn(
        "rt-mono text-[10px] uppercase tracking-wide",
        actor === "agent" ? "text-[hsl(var(--rt-evidence))]" : actor === "human" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {actor === "human" ? "investigator" : actor}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="rt-kicker">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[5px] border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-[hsl(var(--primary)/0.15)]";

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">{children}</div>;
}
