import { ChevronRightIcon, PlusIcon } from "@radix-ui/react-icons";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ArtifactRow, ArtifactType } from "@shared/investigation";

import { Inquiries } from "./Hypotheses";
import { useWorkbenchParams, type Workspace } from "./lib";
import { Empty, EpistemicMark, EvidenceTag, FilterChips, Kicker, RailFilter, StatusTag } from "./ui";

const RECENT_KEY = "redthread.sources.recent";

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberSource(id: string) {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 12);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage access errors.
  }
  return next;
}

const GROUPS: Array<{ type: ArtifactType; label: string }> = [
  { type: "event", label: "Events" },
  { type: "claim", label: "Claims" },
  { type: "observation", label: "Observations" },
  { type: "entity", label: "Entities" },
  { type: "question", label: "Open questions" },
];

function matchesQuery(haystack: string, query: string) {
  return haystack.toLowerCase().includes(query);
}

export type RailTab = "sources" | "findings" | "inquiries";

const TAB_LABEL: Record<RailTab, string> = { sources: "Sources", findings: "Findings", inquiries: "Inquiries" };

export function EvidenceRail({
  ws,
  tab,
  onTab,
  onAdd,
  onReview,
  collapsed,
  onToggle,
}: {
  ws: Workspace;
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  onAdd: () => void;
  onReview: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [findingFilter, setFindingFilter] = useState("all");
  const [recent, setRecent] = useState<string[]>([]);
  const { selected, set } = useWorkbenchParams();
  const proposed = ws.artifacts.filter((a) => a.status === "proposed" && a.type !== "hypothesis").length;
  const findings = ws.artifacts.filter((a) => a.type !== "hypothesis");
  const inquiries = ws.artifacts.filter((a) => a.type === "hypothesis" && a.status !== "rejected").length;
  const counts: Record<RailTab, number> = { sources: ws.sources.length, findings: findings.length, inquiries };

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    if (!selected || !ws.sources.some((s) => s.id === selected)) return;
    setRecent(rememberSource(selected));
  }, [selected, ws.sources]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex h-full w-full flex-col items-center gap-3 border-r border-border bg-card py-3 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Show evidence"
        title={`${ws.sources.length} sources · ${findings.length} findings · ${inquiries} inquiries`}
      >
        <ChevronRightIcon className="size-3.5" />
        <span className="rt-kicker [writing-mode:vertical-rl] rotate-180">Evidence</span>
      </button>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="flex items-center border-b border-border px-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Hide evidence"
          title="Hide evidence"
        >
          <ChevronRightIcon className="size-3.5 rotate-180" />
        </button>
        {(["sources", "findings", "inquiries"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-1.5 pb-2 pt-2.5 text-[12.5px] font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {TAB_LABEL[t]}
            <span className="rt-mono ml-1 text-[10.5px] text-muted-foreground">{counts[t]}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onAdd}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border text-foreground hover:border-primary hover:text-primary"
          aria-label="Add evidence"
          title="Add evidence"
        >
          <PlusIcon className="size-3" />
        </button>
      </div>
      {tab === "inquiries" ? null : (
        <>
          <RailFilter value={query} onChange={setQuery} placeholder={tab === "sources" ? "Search sources" : "Search findings"} />
          {tab === "sources" ? (
            <SourceFilters ws={ws} value={sourceFilter} recent={recent} onChange={setSourceFilter} />
          ) : (
            <FindingFilters findings={findings} value={findingFilter} onChange={setFindingFilter} />
          )}
        </>
      )}
      {tab === "findings" && proposed ? (
        <button
          type="button"
          onClick={onReview}
          className="flex items-center gap-2 border-b border-border px-3 py-2 text-left text-[12px] hover:bg-accent/60"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--rt-evidence))]" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            <span className="rt-mono text-foreground">{proposed}</span> provisional
          </span>
          <span className="font-medium text-primary">Review</span>
        </button>
      ) : null}
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        {tab === "sources" ? (
          <SourceList ws={ws} selected={selected} query={query} filter={sourceFilter} recent={recent} onSelect={(id) => set({ sel: id })} />
        ) : tab === "findings" ? (
          <FindingList ws={ws} selected={selected} query={query} filter={findingFilter} onSelect={(id) => set({ sel: id })} />
        ) : (
          <Inquiries ws={ws} />
        )}
      </div>
    </aside>
  );
}

function disputedSourceIds(ws: Workspace) {
  const ids = new Set<string>();
  for (const a of ws.artifacts) if (a.status === "disputed") for (const c of a.citations) ids.add(c.sourceId);
  for (const l of ws.links) if (l.status === "disputed") for (const c of l.citations) ids.add(c.sourceId);
  return ids;
}

function citedCounts(ws: Workspace) {
  const m = new Map<string, number>();
  for (const a of ws.artifacts) for (const c of a.citations) m.set(c.sourceId, (m.get(c.sourceId) ?? 0) + 1);
  for (const l of ws.links) for (const c of l.citations) m.set(c.sourceId, (m.get(c.sourceId) ?? 0) + 1);
  return m;
}

function SourceFilters({
  ws,
  value,
  recent,
  onChange,
}: {
  ws: Workspace;
  value: string;
  recent: string[];
  onChange: (value: string) => void;
}) {
  const cited = citedCounts(ws);
  const disputed = disputedSourceIds(ws);
  const recentCount = recent.filter((id) => ws.sources.some((s) => s.id === id)).length;
  const options = [
    { id: "all", label: "All", count: ws.sources.length },
    { id: "cited", label: "Cited", count: ws.sources.filter((s) => (cited.get(s.id) ?? 0) > 0).length },
    { id: "uncited", label: "Uncited", count: ws.sources.filter((s) => (cited.get(s.id) ?? 0) === 0).length },
    ...(disputed.size ? [{ id: "disputed", label: "Disputed", count: disputed.size }] : []),
    ...(recentCount ? [{ id: "recent", label: "Recent", count: recentCount }] : []),
  ];
  return <FilterChips value={value} onChange={onChange} options={options} />;
}

function FindingFilters({
  findings,
  value,
  onChange,
}: {
  findings: ArtifactRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  const count = (pred: (a: ArtifactRow) => boolean) => findings.filter(pred).length;
  const options = [
    { id: "all", label: "All", count: findings.length },
    { id: "accepted", label: "Accepted", count: count((a) => a.status === "accepted") },
    { id: "proposed", label: "Provisional", count: count((a) => a.status === "proposed") },
    { id: "disputed", label: "Disputed", count: count((a) => a.status === "disputed") },
    { id: "flagged", label: "Flagged", count: count((a) => !!a.reviewFlag && a.status !== "proposed") },
  ].filter((o) => o.id === "all" || o.count > 0);
  return <FilterChips value={value} onChange={onChange} options={options} />;
}

function SourceList({
  ws,
  selected,
  query,
  filter,
  recent,
  onSelect,
}: {
  ws: Workspace;
  selected: string | null;
  query: string;
  filter: string;
  recent: string[];
  onSelect: (id: string) => void;
}) {
  const citedBy = useMemo(() => citedCounts(ws), [ws]);
  const disputed = useMemo(() => disputedSourceIds(ws), [ws]);
  const q = query.trim().toLowerCase();
  let sources = ws.sources.filter((s) => {
    if (filter === "cited") return (citedBy.get(s.id) ?? 0) > 0;
    if (filter === "uncited") return (citedBy.get(s.id) ?? 0) === 0;
    if (filter === "disputed") return disputed.has(s.id);
    if (filter === "recent") return recent.includes(s.id);
    return true;
  });
  if (filter === "recent") sources = [...sources].sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  if (q) sources = sources.filter((s) => matchesQuery(`${s.code} ${s.title} ${s.kind}`, q));

  if (!sources.length) {
    return <Empty>{q ? `No sources match “${query.trim()}”.` : filter === "recent" ? "No sources viewed this session." : "No sources in this filter."}</Empty>;
  }

  return (
    <div className="py-1">
      {sources.map((s) => {
        const cited = citedBy.get(s.id) ?? 0;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/60", selected === s.id && "bg-[hsl(var(--primary)/0.07)]")}
          >
            <EvidenceTag className="mt-px">{s.code}</EvidenceTag>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-snug">{s.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                <span className="uppercase tracking-[0.06em]">{s.kind}</span>
                <span aria-hidden className="text-border">·</span>
                {cited ? <span>cited {cited}×</span> : <span className="italic">not yet examined</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FindingList({
  ws,
  selected,
  query,
  filter,
  onSelect,
}: {
  ws: Workspace;
  selected: string | null;
  query: string;
  filter: string;
  onSelect: (id: string) => void;
}) {
  const all = ws.artifacts.filter((a) => a.type !== "hypothesis");
  const q = query.trim().toLowerCase();
  const filtered = all.filter((a) => {
    if (filter === "accepted") return a.status === "accepted";
    if (filter === "proposed") return a.status === "proposed";
    if (filter === "disputed") return a.status === "disputed";
    if (filter === "flagged") return !!a.reviewFlag && a.status !== "proposed";
    return true;
  });
  const visible = q
    ? filtered.filter((a) => matchesQuery(`${a.code} ${a.label} ${a.type} ${a.status} ${a.epistemic} ${a.body ?? ""}`, q))
    : filtered;
  const byType = (t: ArtifactType) => visible.filter((a) => a.type === t);

  if (!all.length) {
    return <Empty>Nothing has been extracted yet. Findings appear here with citations back to their sources.</Empty>;
  }
  if (!visible.length) {
    return <Empty>{q ? `No findings match “${query.trim()}”.` : "No findings in this filter."}</Empty>;
  }

  return (
    <div className="pb-4">
      {GROUPS.map(({ type, label }) => {
        const items = byType(type);
        if (!items.length) return null;
        return (
          <section key={type} className="pt-2">
            <Kicker className="px-3 pb-1 pt-1">{label}</Kicker>
            {items.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "group flex w-full items-start gap-2 border-l-2 px-3 py-1.5 text-left",
                  a.status === "proposed" ? "border-[hsl(var(--rt-evidence)/0.5)]" : "border-transparent",
                  (a.status === "refuted" || a.status === "superseded" || a.status === "rejected") && "rt-recede",
                  selected === a.id && "bg-[hsl(var(--primary)/0.07)]",
                )}
              >
                <button className="flex min-w-0 flex-1 items-start gap-2.5 text-left" onClick={() => onSelect(a.id)}>
                  <EvidenceTag className="mt-px">{a.code}</EvidenceTag>
                  <div className="min-w-0 flex-1">
                    <div className="rt-recede-text line-clamp-2 text-[13px] leading-snug">{a.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <EpistemicMark value={a.epistemic} />
                      <StatusTag status={a.status} actor={a.createdBy} />
                      {a.reviewFlag ? <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--rt-unresolved))]" title={a.reviewFlag} /> : null}
                      {a.type === "event" ? <span className="rt-mono text-[10px] text-muted-foreground">{String(a.attrs.sourceTime ?? "").replace("T", " ")}</span> : null}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
