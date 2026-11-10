import { sendToAgentChat, useAgentChatGenerating } from "@agent-native/core/client/agent-chat";
import { AgentChatSurface } from "@agent-native/toolkit/app/chat";
import { ChatBubbleIcon, DoubleArrowRightIcon, UpdateIcon } from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChatComposerContextProvider } from "@/components/ChatComposerContext";
import { TAB_ID } from "@/lib/tab-id";
import { cn } from "@/lib/utils";

import type { ActivityRow } from "@shared/investigation";

import { indexById, relativeTime, type Workspace } from "./lib";
import { Btn, Code, Kicker } from "./ui";

/** Short stand-in lines while the co-investigator is working. Not tied to a specific action. */
const WORKING_PHRASES = [
  "Reading the record",
  "Reviewing evidence",
  "Tracing references",
  "Understanding connections",
  "Weighing contradictions",
  "Checking the timeline",
  "Comparing accounts",
  "Testing hypotheses",
  "Noting disagreements",
  "Following the thread",
  "Cross-checking claims",
  "Mapping relationships",
  "Looking for gaps",
  "Revising the picture",
  "Sorting the signal",
  "Finalizing notes",
];

function useWorkingPhrase(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    setIndex(0);
    const id = window.setInterval(() => setIndex((i) => (i + 1) % WORKING_PHRASES.length), 2400);
    return () => window.clearInterval(id);
  }, [active]);
  return WORKING_PHRASES[index] ?? WORKING_PHRASES[0];
}

function WorkingPhrase({ phrase }: { phrase: string }) {
  return (
    <span key={phrase} className="rt-co-phrase relative z-[1] min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.011em]" aria-hidden>
      {phrase}
    </span>
  );
}

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

function ActivityNarrative({ ws, generating }: { ws: Workspace; generating: boolean }) {
  const recent = useMemo(() => [...ws.activity].reverse().filter((a) => a.actor === "agent").slice(0, 4), [ws.activity]);
  const lead = recent[0];
  if (!lead && !generating) return null;
  return (
    <div className="border-b border-border px-3 py-2.5">
      <Kicker>{generating ? "Now" : "Latest"}</Kicker>
      <p className="mt-1 text-[13px] leading-snug text-foreground">{generating ? (lead?.summary ?? "Examining the evidence") : lead?.summary}</p>
      {recent.length > 1 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] text-muted-foreground">Earlier work</summary>
          <ul className="mt-1.5 grid gap-1">
            {recent.slice(1).map((a) => (
              <li key={a.id} className="text-[12px] leading-snug text-muted-foreground">
                {a.summary}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** The co-investigator at rest: one line of status under the work surface, summonable into the full panel. */
export function AgentDock({ ws, onOpen }: { ws: Workspace; onOpen: () => void }) {
  const [generating] = useAgentChatGenerating();
  const [replied, setReplied] = useState(false);
  const wasGenerating = useRef(generating);
  useEffect(() => {
    if (wasGenerating.current && !generating) setReplied(true);
    wasGenerating.current = generating;
  }, [generating]);
  const pending = ws.unreviewed;
  const latest = [...ws.activity].reverse().find((a) => a.actor === "agent");
  const phrase = useWorkingPhrase(generating);
  const open = () => {
    setReplied(false);
    onOpen();
  };
  const state = replied ? "Replied" : null;

  return (
    <div className={cn("flex h-10 shrink-0 items-center gap-2.5 border-t px-3", generating ? "rt-co-bar--working border-black/15" : "border-border bg-card")}>
      <span className="sr-only" role="status">
        {generating ? "Co-investigator is working" : replied ? "Co-investigator replied" : "Co-investigator is ready"}
      </span>
      <button
        type="button"
        onClick={open}
        className="relative z-[1] flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px]"
        title="Open the co-investigator"
        aria-label={generating ? "Open the co-investigator. It is working." : "Open the co-investigator"}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            generating ? "rt-co-dot bg-current" : replied ? "bg-primary" : pending.length ? "bg-[hsl(var(--rt-unresolved))]" : "bg-border",
          )}
        />
        <Kicker className="shrink-0">Co-investigator</Kicker>
        {generating ? (
          <>
            <span className="h-3 w-px shrink-0 bg-current opacity-40" aria-hidden />
            <WorkingPhrase phrase={phrase} />
          </>
        ) : (
          <>
            {state ? <span className="shrink-0 font-medium text-foreground">{state}</span> : null}
            <span className="min-w-0 truncate text-muted-foreground">{latest?.summary ?? "Ask about the evidence, or have it examine the sources."}</span>
          </>
        )}
      </button>
      {pending.length ? (
        <Btn size="sm" disabled={generating} className="relative z-[1] rt-co-on-bar" onClick={() => reassess(ws)} title="Your changes have not been reassessed yet">
          <UpdateIcon />
          Reassess {pending.length}
        </Btn>
      ) : null}
      <Btn size="sm" tone={replied && !generating ? "primary" : "quiet"} className="relative z-[1] rt-co-on-bar" onClick={open}>
        <ChatBubbleIcon />
        {replied && !generating ? "Read reply" : "Ask"}
      </Btn>
    </div>
  );
}

export function CoInvestigator({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const [generating] = useAgentChatGenerating();
  const phrase = useWorkingPhrase(generating);
  const idx = indexById(ws);
  const pending = ws.unreviewed;
  const latest = [...ws.activity].reverse().find((a) => a.actor === "agent");

  return (
    <aside className="rt-co flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card">
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", generating ? "rt-co-bar--working border-black/15" : "border-border")}>
        <span className="sr-only" role="status">
          {generating ? "Co-investigator is working" : latest ? "Co-investigator is caught up" : "Co-investigator is ready"}
        </span>
        <Kicker className="relative z-[1] shrink-0">Co-investigator</Kicker>
        {generating ? (
          <>
            <span className="relative z-[1] h-3 w-px shrink-0 bg-current opacity-40" aria-hidden />
            <WorkingPhrase phrase={phrase} />
            <span className="rt-co-dot relative z-[1] h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          </>
        ) : (
          <>
            <div className="flex-1" />
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pending.length ? "bg-[hsl(var(--rt-unresolved))]" : "bg-border")} />
              <span className="truncate">{latest ? "Caught up" : "Ready"}</span>
            </span>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "relative z-[1] inline-flex size-7 items-center justify-center rounded-[5px] border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            generating && "rt-co-on-bar",
          )}
          aria-label="Hide co-investigator"
          title="Hide co-investigator"
        >
          <DoubleArrowRightIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
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
                <UpdateIcon />
                Reassess {pending.length} change{pending.length > 1 ? "s" : ""}
              </Btn>
            </div>
          </div>
        ) : null}

        <ActivityNarrative ws={ws} generating={generating} />

        <div className="min-h-0 flex-1">
          <AgentChatSurface
            mode="panel"
            storageKey="redthread-chat"
            thinkingDisplay="collapsed"
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
      </div>
    </aside>
  );
}
