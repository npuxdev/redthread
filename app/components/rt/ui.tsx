import { Cross2Icon, InfoCircledIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Actor, ArtifactStatus, ConstraintStatus, Epistemic, Standing } from "@shared/investigation";

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("rt-mono text-[11px] font-medium text-[hsl(var(--rt-evidence))]", className)}>{children}</span>;
}

/** Distinct evidence identifier used in list rows and inspector headers. */
export function EvidenceTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rt-mono inline-flex h-[22px] shrink-0 items-center rounded-[4px] bg-[hsl(var(--rt-evidence)/0.1)] px-1.5 text-[10.5px] font-semibold tracking-[0.04em] text-[hsl(var(--rt-evidence))] ring-1 ring-inset ring-[hsl(var(--rt-evidence)/0.22)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kicker({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn("rt-kicker", className)} title={title}>
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  count,
  hint,
  children,
  className,
}: {
  title: string;
  count?: number;
  hint?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 border-b border-border bg-[hsl(var(--muted)/0.65)] px-4 py-1.5", className)}>
      <Kicker className="text-foreground/65">{title}</Kicker>
      {count != null ? <span className="rt-mono text-[10px] text-muted-foreground">{count}</span> : null}
      {hint ? (
        <span className="inline-flex" title={hint}>
          <InfoCircledIcon className="size-3.5 text-muted-foreground/80" aria-label={hint} />
        </span>
      ) : null}
      <div className="flex-1" />
      {children}
    </div>
  );
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
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  tone?: BtnTone;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rt-press inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        size === "sm" ? "h-6 px-2 text-[11.5px] [&_svg]:size-3" : "h-8 px-3 text-[12.5px] [&_svg]:size-3.5",
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
  if (status === "accepted") {
    return (
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground" title="Accepted by the investigator">
        Accepted
      </span>
    );
  }
  const proposal = status === "proposed";
  const tone = proposal
    ? "text-[hsl(var(--rt-evidence))] border-[hsl(var(--rt-evidence)/0.35)] rt-dashed"
    : status === "disputed"
      ? "text-[hsl(var(--rt-unresolved))] border-[hsl(var(--rt-unresolved)/0.4)]"
      : status === "refuted" || status === "rejected"
        ? "text-[hsl(var(--rt-oxide))] border-[hsl(var(--rt-oxide)/0.35)]"
        : "text-muted-foreground border-border";
  const label = proposal ? "Provisional" : status;
  const title = proposal
    ? `${actor === "agent" ? "Proposed by the co-investigator" : "Proposed"}. It informs the analysis now; accept it to treat it as established.`
    : undefined;
  return (
    <span title={title} className={cn("inline-flex h-[18px] items-center rounded-[3px] border px-1 text-[10px] font-medium uppercase tracking-wide", tone)}>
      {label}
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

export function StandingTag({ standing, unsupported }: { standing: Standing; unsupported?: boolean }) {
  const tone = unsupported && standing === "supported" ? "text-[hsl(var(--rt-unresolved))]" : STANDING_TONE[standing];
  return (
    <span
      className={cn("inline-flex items-baseline gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]", tone)}
      title={
        unsupported && standing === "supported"
          ? "Assessed as supported, but no supporting link is recorded. This is not an accepted conclusion."
          : "Evidence standing. An assessment against linked evidence, separate from whether the hypothesis was accepted."
      }
    >
      <span className="font-medium normal-case tracking-normal text-muted-foreground">Standing</span>
      {standing}
    </span>
  );
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

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
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

export function FilterChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string; count?: number }>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-2 pb-1.5" role="group">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "rt-press h-6 shrink-0 rounded-[4px] px-2 text-[11.5px] font-medium",
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null ? <span className={cn("rt-mono ml-1 text-[10px]", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ColumnResize({ label, onDelta }: { label: string; onDelta: (dx: number) => void }) {
  const last = useRef(0);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onDelta(e.key === "ArrowLeft" ? -16 : 16);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        last.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onDelta(e.clientX - last.current);
        last.current = e.clientX;
      }}
      className="relative z-10 h-full w-1.5 shrink-0 cursor-col-resize touch-none hover:bg-primary/30 focus-visible:bg-primary/40"
    />
  );
}

export function RailFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative border-b border-border px-2 py-1.5">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        className="h-7 w-full rounded-[5px] border border-border bg-background pl-7 pr-7 text-[12px] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Clear filter"
        >
          <Cross2Icon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

const overlayStack: symbol[] = [];

export function OverlayPanel({
  onClose,
  widthClass = "w-[min(560px,92%)]",
  width,
  onResize,
  modal = true,
  header,
  children,
}: {
  onClose: () => void;
  widthClass?: string;
  width?: number;
  onResize?: (dx: number) => void;
  /** A non-modal panel leaves the work surface beneath it visible and interactive. */
  modal?: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const token = Symbol("overlay");
    overlayStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || overlayStack[overlayStack.length - 1] !== token) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      overlayStack.splice(overlayStack.indexOf(token), 1);
    };
  }, []);

  return (
    <>
      {modal ? <div className="absolute inset-0 z-20 bg-[hsl(var(--rt-graphite)/0.16)]" onClick={onClose} aria-hidden /> : null}
      <div
        role="dialog"
        aria-modal={modal}
        className={cn(
          "rt-slide-in absolute inset-y-0 right-0 z-30 flex flex-col border-l border-border bg-card shadow-[-12px_0_32px_-24px_hsl(var(--rt-graphite)/0.35)]",
          width == null && widthClass,
        )}
        style={width != null ? { width, maxWidth: "calc(100% - 24rem)" } : undefined}
      >
        {onResize ? (
          <div className="absolute inset-y-0 left-0 z-10">
            <ColumnResize label="Resize inspector" onDelta={onResize} />
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          {header}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-[5px] border border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <Cross2Icon className="size-3" />
            Close
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
