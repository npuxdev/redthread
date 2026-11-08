import { sendToAgentChat, useAgentChatGenerating } from "@agent-native/core/client/agent-chat";
import { AgentChatSurface } from "@agent-native/toolkit/app/chat";

import { ChatComposerContextProvider } from "@/components/ChatComposerContext";
import { TAB_ID } from "@/lib/tab-id";
import { cn } from "@/lib/utils";

import type { ActivityRow } from "@shared/investigation";

import { indexById, relativeTime, type Workspace } from "./lib";
import { Btn, Code, Kicker } from "./ui";

/** The consequences worth an investigator's attention: hypotheses, instruments, and orderings that flipped. */
function salientImpact(ws: Workspace, u: ActivityRow) {
  const hypotheses = new Set(ws.artifacts.filter((a) => a.type === "hypothesis").map((a) => a.id));
  const flipped = new Set((u.impact?.constraintFlips ?? []).map((f) => f.linkId));
  return (u.impact?.entries ?? []).filter((e) => e.depth > 0 && (e.kind === "instrument" || hypotheses.has(e.id) || flipped.has(e.id)));
}

export function reassess(ws: Workspace) {
  const idx = indexById(ws);
  const lines = ws.unreviewed.map((u) => {
    const impacted = salientImpact(ws, u).map((e) => idx.get(e.id)?.code ?? e.id);
    const flips = (u.impact?.constraintFlips ?? []).map((f) => `${idx.get(f.linkId)?.code ?? f.linkId} ${f.from} → ${f.to}`);
    return `- ${u.summary}${u.reason ? ` (reason: ${u.reason})` : ""}${impacted.length ? `; affects ${impacted.join(", ")}` : ""}${flips.length ? `; orderings: ${flips.join(", ")}` : ""}`;
  });
  sendToAgentChat({
    message: `I changed the investigation. Reassess what these changes mean before doing anything else:\n${lines.join("\n")}`,
    context: `investigationId: ${ws.investigation.id}. Call get-unreviewed-changes first, then read the affected instruments and reassess flagged hypotheses and relationships.`,
    submit: true,
  });
}

export function CoInvestigator({ ws }: { ws: Workspace }) {
  const [generating] = useAgentChatGenerating();
  const idx = indexById(ws);
  const pending = ws.unreviewed;

  return (
    <aside className="rt-co flex min-h-0 flex-col border-l border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Kicker>Co-investigator</Kicker>
        <div className="flex-1" />
        <span className={cn("flex items-center gap-1.5 text-[11px]", generating ? "text-primary" : "text-muted-foreground")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", generating ? "animate-pulse bg-primary" : "bg-border")} />
          {generating ? "Working" : "Idle"}
        </span>
      </div>

      {pending.length ? (
        <div className="rt-arrive border-b border-border bg-[hsl(var(--rt-unresolved)/0.05)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Kicker className="text-[hsl(var(--rt-unresolved))]">Your changes · not yet reassessed</Kicker>
          </div>
          <ul className="mt-2 grid max-h-36 gap-1.5 overflow-auto">
            {pending.slice(-6).map((u) => {
              const impacted = salientImpact(ws, u);
              const flips = u.impact?.constraintFlips ?? [];
              return (
                <li key={u.id} className="text-[12px] leading-snug">
                  <span className="text-foreground/85">{u.summary}</span>
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">{relativeTime(u.createdAt)}</span>
                  {impacted.length || flips.length ? (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10.5px] text-muted-foreground">
                      {impacted.length ? (
                        <span>
                          touches{" "}
                          {impacted.slice(0, 5).map((e) => (
                            <Code key={e.id} className="mr-1 text-[10px]">
                              {idx.get(e.id)?.code ?? "?"}
                            </Code>
                          ))}
                          {impacted.length > 5 ? `+${impacted.length - 5}` : ""}
                        </span>
                      ) : null}
                      {flips.length ? <span className="text-[hsl(var(--rt-oxide))]">{flips.length} ordering change{flips.length > 1 ? "s" : ""}</span> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-2.5">
            <Btn size="sm" tone="primary" disabled={generating} onClick={() => reassess(ws)}>
              Reassess {pending.length} change{pending.length > 1 ? "s" : ""}
            </Btn>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <AgentChatSurface
          mode="panel"
          storageKey="redthread-chat"
          browserTabId={TAB_ID}
          composerContextProvider={ChatComposerContextProvider}
          scope={{ type: "investigation", id: ws.investigation.id, label: ws.investigation.title }}
          isolateHistoryByScope
          showHeader={false}
          showTabBar={false}
          chatOnly
          agentPageHref="/settings/agent"
          emptyStateText="Ask about the evidence, or have the co-investigator examine it."
          suggestions={["Examine the evidence", "What would disprove the leading hypothesis?", "Which sources disagree, and why?"]}
          className="h-full"
        />
      </div>
    </aside>
  );
}
