import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Actor } from "@shared/investigation";

import { indexById, relativeTime, useWorkbenchParams, type Workspace } from "./lib";
import { ActorTag, Code, Kicker, OverlayPanel } from "./ui";

export function History({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const [actor, setActor] = useState<Actor | "all">("all");
  const idx = indexById(ws);
  const { set } = useWorkbenchParams();
  const entries = [...ws.activity].reverse().filter((h) => actor === "all" || h.actor === actor);
  return (
    <OverlayPanel
      widthClass="w-[min(480px,92%)]"
      onClose={onClose}
      header={
        <>
          <Kicker>History</Kicker>
          <div className="flex gap-1">
            {(["all", "human", "agent", "system"] as const).map((a) => (
              <button key={a} onClick={() => setActor(a)} className={cn("rounded px-1.5 py-0.5 text-[11px]", actor === a ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {a === "human" ? "investigator" : a}
              </button>
            ))}
          </div>
        </>
      }
    >
      <ol className="rt-scroll min-h-0 flex-1 overflow-auto px-5 py-3">
        {entries.map((h) => (
          <li key={h.id} className="relative border-l border-border pb-3 pl-4">
            <span className={cn("absolute -left-[3.5px] top-1.5 h-[7px] w-[7px] rounded-full", h.actor === "agent" ? "bg-[hsl(var(--rt-evidence))]" : h.actor === "human" ? "bg-foreground" : "bg-border")} />
            <div className="flex items-center gap-2">
              <ActorTag actor={h.actor} />
              <span className="rt-mono text-[10px] text-muted-foreground">{h.action}</span>
              <span className="ml-auto text-[10.5px] text-muted-foreground">{relativeTime(h.createdAt)}</span>
            </div>
            <div className="mt-0.5 text-[12.5px] leading-snug">{h.summary}</div>
            {h.reason ? <div className="text-[11.5px] text-muted-foreground">{h.reason}</div> : null}
            {h.targetIds.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {h.targetIds.slice(0, 8).map((t) =>
                  idx.get(t) ? (
                    <button key={t} onClick={() => (set({ sel: t }), onClose())}>
                      <Code className="text-[10px]">{idx.get(t)!.code}</Code>
                    </button>
                  ) : null,
                )}
              </div>
            ) : null}
            {h.impact?.constraintFlips.length ? (
              <div className="mt-1 text-[11px] text-[hsl(var(--rt-oxide))]">
                {h.impact.constraintFlips.map((f) => `${idx.get(f.linkId)?.code ?? "?"} ${f.from} → ${f.to}`).join(" · ")}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </OverlayPanel>
  );
}
