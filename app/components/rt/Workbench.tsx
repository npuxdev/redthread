import { DotsHorizontalIcon, DownloadIcon, FileTextIcon, PlusIcon, ResetIcon, ClockIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { AddEvidence } from "./AddEvidence";
import { AgentDock, CoInvestigator } from "./CoInvestigator";
import { EvidenceRail, type RailTab } from "./EvidenceRail";
import { History } from "./History";
import { Inspector } from "./Inspector";
import { InstrumentStage } from "./InstrumentStage";
import {
  currentAssessment,
  reviewQueue,
  useMediaQuery,
  useRtAction,
  useStoredFlag,
  useStoredNumber,
  useWorkbenchParams,
  useWorkspace,
  type Assessment,
  type Workspace,
} from "./lib";
import { Review } from "./Review";
import { BarButton, TopBar } from "./TopBar";
import { Btn, ColumnResize } from "./ui";

const SOURCES_KEY = "redthread.sources.width";
const CO_WIDTH_KEY = "redthread.co.width";
const EVIDENCE_OPEN_KEY = "redthread.evidence.open";
const CO_OPEN_KEY = "redthread.co.open";

const VERDICT_TONE: Record<Assessment["tone"], string> = {
  open: "text-[hsl(var(--rt-unresolved))]",
  leaning: "text-[hsl(var(--rt-confirmed))]",
  written: "text-foreground",
};

function QuestionBand({ ws, onInquiries, onReview }: { ws: Workspace; onInquiries: () => void; onReview: () => void }) {
  const { set } = useWorkbenchParams();
  const [open, setOpen] = useState(false);
  const queue = reviewQueue(ws);
  const assessment = currentAssessment(ws);
  const question = ws.investigation.question;
  const competing = assessment.inquiries - (assessment.leading ? 1 : 0);
  const briefVerdict = assessment.verdict.length <= 96;
  const expandable = question.length > 220 || assessment.verdict.length > 180;
  const hasWork = Boolean(assessment.needed || competing > 0 || queue.total);

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="px-5 pb-3 pt-3.5">
        <p className={cn("rt-serif text-[18px] leading-snug text-foreground", !open && expandable && question.length > 220 && "line-clamp-2")}>{question}</p>
        <p
          className={cn(
            "mt-2 text-[14px] leading-snug",
            briefVerdict ? cn("font-medium", VERDICT_TONE[assessment.tone]) : "text-foreground/80",
            !open && assessment.verdict.length > 180 && "line-clamp-2",
          )}
        >
          {assessment.verdict}
        </p>
        {expandable ? (
          <button
            type="button"
            className="mt-1.5 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Show less" : "Read all"}
          </button>
        ) : null}
      </div>
      {hasWork ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border px-5 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-x-3 text-[12.5px] text-muted-foreground">
            {assessment.needed ? (
              <button
                type="button"
                onClick={() => set({ sel: assessment.needed!.id })}
                className="min-w-0 truncate text-left underline-offset-2 hover:text-foreground hover:underline"
                title={assessment.needed.label}
              >
                {assessment.openQuestions === 1 ? assessment.needed.label : `${assessment.openQuestions} open questions`}
              </button>
            ) : null}
            {competing > 0 ? (
              <button type="button" onClick={onInquiries} className="shrink-0 underline-offset-2 hover:text-foreground hover:underline">
                {competing} {assessment.leading ? "competing" : "open"} {competing === 1 ? "inquiry" : "inquiries"}
              </button>
            ) : null}
          </div>
          {queue.total ? (
            <Btn
              size="sm"
              tone={queue.judgement.length ? "primary" : "quiet"}
              className="shrink-0"
              onClick={onReview}
              title={`${queue.judgement.length} need your judgement · ${queue.routine.length} routine`}
            >
              Review {queue.total}
            </Btn>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Workbench({ investigationId }: { investigationId: string }) {
  const { data: ws, isLoading, error } = useWorkspace(investigationId);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("sources");
  const [armReset, setArmReset] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useStoredFlag(EVIDENCE_OPEN_KEY, false);
  const [coOpen, setCoOpen] = useStoredFlag(CO_OPEN_KEY, false);
  const [sourcesWidth, setSourcesWidth] = useStoredNumber(SOURCES_KEY, 248, 200, 360);
  const [coWidth, setCoWidth] = useStoredNumber(CO_WIDTH_KEY, 320, 280, 440);
  const narrow = useMediaQuery("(max-width: 1100px)");
  const [narrowOpen, setNarrowOpen] = useState<"sources" | "agent" | null>(null);
  const { set } = useWorkbenchParams();
  const navigate = useNavigate();
  const reset = useRtAction<Record<string, unknown>, { id: string | null }>("reset-investigation");

  useEffect(() => {
    setNarrowOpen(null);
  }, [narrow]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOURCES_KEY)) return;
      setSourcesWidth(Math.round(window.innerWidth * 0.17));
    } catch {
      // Ignore storage access errors.
    }
    try {
      if (window.localStorage.getItem(CO_WIDTH_KEY)) return;
      setCoWidth(Math.round(window.innerWidth * 0.22));
    } catch {
      // Ignore storage access errors.
    }
  }, [setCoWidth, setSourcesWidth]);

  if (!ws) {
    return (
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">{isLoading ? "Opening investigation…" : `Investigation not available. ${error ? String((error as Error).message ?? "") : ""}`}</div>
      </div>
    );
  }

  const sourcesOpen = narrow ? narrowOpen === "sources" : evidenceOpen;
  const agentOpen = narrow ? narrowOpen === "agent" : coOpen;

  const toggleSources = () => {
    if (narrow) setNarrowOpen((v) => (v === "sources" ? null : "sources"));
    else setEvidenceOpen((v) => !v);
  };
  const showEvidence = (tab: RailTab) => {
    setRailTab(tab);
    if (narrow) setNarrowOpen("sources");
    else setEvidenceOpen(true);
  };
  const setAgent = (open: boolean) => {
    if (narrow) setNarrowOpen(open ? "agent" : null);
    else setCoOpen(open);
  };
  const openReview = () => {
    setHistory(false);
    set({ sel: null });
    setReviewing(true);
  };

  const doReset = async () => {
    if (!ws.investigation.caseSlug) return;
    const res = await reset.run({ investigationId: ws.investigation.id });
    if (res?.id) navigate(`/i/${res.id}`, { replace: true });
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ws.investigation.title.replace(/\W+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar title={ws.investigation.title}>
        <BarButton icon={<PlusIcon />} onClick={() => setAdding(true)}>
          Add evidence
        </BarButton>
        <BarButton icon={<ClockIcon />} active={history} onClick={() => (setHistory((v) => !v), setReviewing(false), set({ sel: null }))}>
          History
        </BarButton>
        <BarButton icon={<FileTextIcon />} onClick={() => navigate(`/i/${ws.investigation.id}/report`)}>
          Report
        </BarButton>
        <DropdownMenu onOpenChange={(open) => !open && setArmReset(false)}>
          <DropdownMenuTrigger asChild>
            <BarButton icon={<DotsHorizontalIcon />} title="Export and reset">
              More
            </BarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 p-1">
            <DropdownMenuItem onSelect={doExport}>
              <DownloadIcon />
              Export JSON
            </DropdownMenuItem>
            {ws.investigation.caseSlug ? (
              <>
                <DropdownMenuSeparator />
                {armReset ? (
                  <DropdownMenuItem
                    className="text-[hsl(var(--rt-oxide))] focus:text-[hsl(var(--rt-oxide))]"
                    disabled={reset.pending}
                    onSelect={(e) => {
                      e.preventDefault();
                      void doReset();
                    }}
                  >
                    <ResetIcon />
                    Discard work and reload
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setArmReset(true);
                    }}
                  >
                    <ResetIcon />
                    Reset investigation…
                  </DropdownMenuItem>
                )}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TopBar>
      <QuestionBand ws={ws} onInquiries={() => showEvidence("inquiries")} onReview={openReview} />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {narrow && (sourcesOpen || agentOpen) ? (
          <button
            type="button"
            className="absolute inset-0 z-40 bg-[hsl(var(--rt-graphite)/0.2)]"
            aria-label="Close panel"
            onClick={() => setNarrowOpen(null)}
          />
        ) : null}
        <div
          className={cn("flex h-full min-h-0 shrink-0 flex-col overflow-hidden", narrow && sourcesOpen && "absolute bottom-0 left-0 top-0 z-50 shadow-xl")}
          style={{ width: sourcesOpen ? (narrow ? "min(320px, 86vw)" : sourcesWidth) : 40 }}
        >
          <EvidenceRail
            ws={ws}
            tab={railTab}
            onTab={setRailTab}
            collapsed={!sourcesOpen}
            onToggle={toggleSources}
            onAdd={() => setAdding(true)}
            onReview={openReview}
          />
        </div>
        {!narrow && sourcesOpen ? <ColumnResize label="Resize evidence" onDelta={(dx) => setSourcesWidth((w) => w + dx)} /> : null}
        <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1">
            <InstrumentStage ws={ws} />
          </div>
          {agentOpen ? null : <AgentDock ws={ws} onOpen={() => setAgent(true)} />}
          {history ? <History ws={ws} onClose={() => setHistory(false)} /> : null}
          {reviewing && !history ? <Review ws={ws} onClose={() => setReviewing(false)} /> : null}
          {history ? null : <Inspector ws={ws} />}
        </main>
        {!narrow && agentOpen ? <ColumnResize label="Resize co-investigator" onDelta={(dx) => setCoWidth((w) => w - dx)} /> : null}
        <div
          className={cn("flex h-full min-h-0 shrink-0 flex-col overflow-hidden", !agentOpen && "hidden", narrow && agentOpen && "absolute bottom-0 right-0 top-0 z-50 shadow-xl")}
          style={{ width: narrow ? "min(360px, 86vw)" : coWidth }}
        >
          <CoInvestigator ws={ws} onClose={() => setAgent(false)} />
        </div>
      </div>
      {adding ? <AddEvidence ws={ws} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
