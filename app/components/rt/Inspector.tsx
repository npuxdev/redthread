import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { ChatBubbleIcon, CheckIcon, Cross2Icon, Link2Icon, Pencil1Icon } from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type ArtifactRow, type ArtifactStatus, type AssumptionRow, type Citation, type LinkRow, RELATIONS, type Relation, type SourceRow, type Standing } from "@shared/investigation";

import { formatClock, indexById, relativeTime, standingOf, useRtAction, useStoredNumber, useWorkbenchParams, type Workspace } from "./lib";
import { ActorTag, Btn, Code, EpistemicMark, EvidenceTag, inputClass, Kicker, OverlayPanel, StandingTag, StatusTag } from "./ui";

export function Inspector({ ws }: { ws: Workspace }) {
  const { selected, set } = useWorkbenchParams();
  const [width, setWidth] = useStoredNumber("redthread.inspector.width", 480, 360, 720);
  if (!selected) return null;
  const source = ws.sources.find((s) => s.id === selected);
  const artifact = ws.artifacts.find((a) => a.id === selected);
  const link = ws.links.find((l) => l.id === selected);
  const assumption = ws.assumptions.find((a) => a.id === selected);
  if (!source && !artifact && !link && !assumption) return null;
  return (
    <OverlayPanel
      onClose={() => set({ sel: null })}
      modal={false}
      width={width}
      onResize={(dx) => setWidth((w) => w - dx)}
      header={<Kicker>{source ? "Source record" : link ? "Relationship" : assumption ? "Assumption" : artifact!.type}</Kicker>}
    >
      <div className="rt-scroll min-h-0 flex-1 overflow-auto">
        {source ? <SourceView ws={ws} source={source} /> : artifact ? <ArtifactView ws={ws} a={artifact} /> : assumption ? <AssumptionView ws={ws} a={assumption} /> : <LinkView ws={ws} l={link!} />}
      </div>
    </OverlayPanel>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-3">
      <Kicker className="mb-2">{title}</Kicker>
      {children}
    </section>
  );
}

// ---------- source ----------

function quoteRanges(content: string, quotes: Array<{ quote: string; key: string }>) {
  const ranges: Array<{ start: number; end: number; key: string }> = [];
  for (const q of quotes) {
    const pattern = q.quote.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (!pattern) continue;
    const m = new RegExp(pattern).exec(content);
    if (m) ranges.push({ start: m.index, end: m.index + m[0].length, key: q.key });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

function SourceView({ ws, source }: { ws: Workspace; source: SourceRow }) {
  const { highlight, set } = useWorkbenchParams();
  const citing = ws.artifacts.filter((a) => a.citations.some((c) => c.sourceId === source.id));
  const quotes = citing.flatMap((a) => a.citations.filter((c) => c.sourceId === source.id && c.quote).map((c) => ({ quote: c.quote!, key: a.id })));
  const rows = new Map<number, string[]>();
  for (const a of citing) for (const c of a.citations) if (c.sourceId === source.id && c.row !== undefined) rows.set(c.row, [...(rows.get(c.row) ?? []), a.id]);
  const activeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, source.id]);

  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <EvidenceTag>{source.code}</EvidenceTag>
          <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{source.kind}</span>
        </div>
        <h3 className="rt-heading mt-1 text-[18px] leading-snug">{source.title}</h3>
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] text-muted-foreground">Source details</summary>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
            {Object.entries(source.provenance).map(([k, v]) => (
              <ProvRow key={k} k={k} v={String(v)} />
            ))}
            <ProvRow k="ingested by" v={source.createdBy === "human" ? "investigator" : source.createdBy} />
            <ProvRow k="sha-256" v={source.contentHash.slice(0, 16) + "…"} mono />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">Original content as ingested. Interpretations are stored separately and never modify it.</p>
        </details>
      </div>
      <div className="border-t border-border">
        {source.kind === "image" ? (
          <ImageWithRegions source={source} ws={ws} />
        ) : source.kind === "records" ? (
          <RecordsTable source={source} rows={rows} highlight={highlight} activeRef={activeRef} />
        ) : (
          <TextWithMarks content={source.content} ranges={quoteRanges(source.content, quotes)} highlight={highlight} activeRef={activeRef} onPick={(id) => set({ sel: id })} />
        )}
      </div>
      <Section title={`Cited by ${citing.length}`}>
        {citing.length ? (
          <div className="grid gap-1">
            {citing.map((a) => (
              <button key={a.id} onClick={() => set({ sel: a.id })} className="flex items-baseline gap-2 text-left text-[12.5px] hover:text-primary">
                <Code>{a.code}</Code>
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                <EpistemicMark value={a.epistemic} />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Nothing cites this source yet.</p>
        )}
      </Section>
    </div>
  );
}

function ProvRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 truncate", mono && "rt-mono text-[10.5px]")}>{v}</span>
    </>
  );
}

function TextWithMarks({
  content,
  ranges,
  highlight,
  activeRef,
  onPick,
}: {
  content: string;
  ranges: Array<{ start: number; end: number; key: string }>;
  highlight: string | null;
  activeRef: React.MutableRefObject<HTMLElement | null>;
  onPick: (id: string) => void;
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (r.start > at) parts.push(content.slice(at, r.start));
    const active = r.key === highlight;
    parts.push(
      <button key={i} type="button" data-active={active} ref={active ? (el) => void (activeRef.current = el) : undefined} onClick={() => onPick(r.key)} className="rt-source-mark">
        {content.slice(r.start, r.end)}
      </button>,
    );
    at = r.end;
  });
  parts.push(content.slice(at));
  return <div className="rt-source-text mx-auto max-w-[68ch] whitespace-pre-wrap break-words px-6 py-6 text-foreground/90">{parts}</div>;
}

function RecordsTable({ source, rows, highlight, activeRef }: { source: SourceRow; rows: Map<number, string[]>; highlight: string | null; activeRef: React.MutableRefObject<HTMLElement | null> }) {
  const parsed = useMemo(() => {
    try {
      const j = JSON.parse(source.content);
      const list: Record<string, unknown>[] = Array.isArray(j) ? j : j.rows ?? [];
      return { fields: [...new Set(list.flatMap((r) => Object.keys(r)))], rows: list.map((r) => r) };
    } catch {
      const lines = source.content.trim().split(/\r?\n/);
      const fields = (lines[0] ?? "").split(",");
      return { fields, rows: lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [fields[i], v]))) };
    }
  }, [source.content]);
  return (
    <div className="overflow-auto">
      <table className="rt-mono w-full text-[12.5px]">
        <thead className="sticky top-0 bg-card">
          <tr>
            <th className="px-2 py-1.5 text-left text-muted-foreground">#</th>
            {parsed.fields.map((f) => (
              <th key={f} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-muted-foreground">
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((r, i) => {
            const cited = rows.get(i);
            const active = !!highlight && !!cited?.includes(highlight);
            return (
              <tr key={i} ref={active ? (el) => void (activeRef.current = el) : undefined} className={cn("border-t border-border", cited && "bg-[hsl(var(--rt-evidence)/0.07)]", active && "bg-[hsl(var(--primary)/0.14)]")}>
                <td className="px-2 py-1 text-muted-foreground">{i}</td>
                {parsed.fields.map((f) => (
                  <td key={f} className="whitespace-nowrap px-2 py-1">
                    {String((r as Record<string, unknown>)[f] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ImageWithRegions({ source, ws }: { source: SourceRow; ws: Workspace }) {
  const { set } = useWorkbenchParams();
  const regions = ws.artifacts.flatMap((a) => a.citations.filter((c) => c.sourceId === source.id && c.region).map((c) => ({ a, r: c.region! })));
  return (
    <div className="relative mx-5 my-4">
      <img src={source.content} alt={source.title} className="rt-frame w-full rounded-[3px]" />
      {regions.map(({ a, r }, i) => (
        <button key={i} onClick={() => set({ sel: a.id })} className="absolute border-[1.5px] border-primary bg-[hsl(var(--primary)/0.08)]" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
          <span className="rt-mono absolute -top-4 left-0 rounded-sm bg-primary px-1 text-[9.5px] text-primary-foreground">{a.code}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- artifact ----------

function CitationList({ ws, citations, ownerId }: { ws: Workspace; citations: Citation[]; ownerId: string }) {
  const { set } = useWorkbenchParams();
  if (!citations.length) return <p className="text-[12px] text-muted-foreground">No direct citation.</p>;
  return (
    <div className="grid gap-2">
      {citations.map((c, i) => {
        const s = ws.sources.find((x) => x.id === c.sourceId);
        return (
          <button key={i} onClick={() => set({ sel: c.sourceId, hl: ownerId })} className="group text-left">
            <div className="flex items-baseline gap-2">
              <Code>{s?.code ?? "?"}</Code>
              <span className="truncate text-[11.5px] text-muted-foreground group-hover:text-primary">{s?.title}</span>
              {c.row !== undefined ? <span className="rt-mono text-[10.5px] text-muted-foreground">row {c.row}</span> : null}
              {c.region ? <span className="rt-mono text-[10.5px] text-muted-foreground">region</span> : null}
            </div>
            {c.quote ? <blockquote className="rt-mono mt-1 border-l-2 border-[hsl(var(--rt-evidence)/0.5)] pl-2.5 text-[11px] leading-relaxed text-foreground/80">“{c.quote}”</blockquote> : null}
          </button>
        );
      })}
    </div>
  );
}

function ArtifactView({ ws, a }: { ws: Workspace; a: ArtifactRow }) {
  const idx = indexById(ws);
  const { set } = useWorkbenchParams();
  const links = ws.links.filter((l) => l.fromId === a.id || l.toId === a.id);
  const history = ws.activity.filter((h) => h.targetIds.includes(a.id));
  const basis = (a.attrs.basis as string[] | undefined) ?? [];
  const standing = a.type === "hypothesis" ? standingOf(a) : null;
  const standingHistory = (a.attrs.standingHistory as Array<{ from: Standing; to: Standing; rationale: string; actor: string; at: string }> | undefined) ?? [];
  const event = a.type === "event" ? ws.chronology.events.find((e) => e.id === a.id) : null;

  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceTag>{a.code}</EvidenceTag>
          <EpistemicMark value={a.epistemic} withLabel />
          <StatusTag status={a.status} actor={a.createdBy} />
          {standing ? <StandingTag standing={standing} unsupported={standing === "supported" && !links.some((l) => l.toId === a.id && l.relation === "supports" && l.status !== "rejected")} /> : null}
          <span className="text-[10.5px] text-muted-foreground">by</span>
          <ActorTag actor={a.createdBy} />
          {a.confidence !== null ? <span className="rt-mono text-[10.5px] text-muted-foreground">confidence {a.confidence}</span> : null}
        </div>
        <h3 className={cn("mt-2 text-[16px] leading-snug", a.type === "hypothesis" ? "rt-serif text-[18px]" : "rt-heading")}>{a.label}</h3>
        {a.body ? <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/80">{a.body}</p> : null}
        {a.reviewFlag ? (
          <div className="mt-3 border-l-2 border-[hsl(var(--rt-unresolved))] bg-[hsl(var(--rt-unresolved)/0.06)] px-3 py-2 text-[12px] text-[hsl(var(--rt-unresolved))]">Needs review: {a.reviewFlag}</div>
        ) : null}
      </div>

      {event ? (
        <Section title="Time">
          <div className="rt-mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11.5px]">
            <span className="text-muted-foreground">recorded</span>
            <span>{formatClock(event.sourceTime)}</span>
            <span className="text-muted-foreground">clock</span>
            <span>{event.clockKey}</span>
            <span className="text-muted-foreground">corrected</span>
            <span className={cn(event.appliedOffset && "font-semibold text-[hsl(var(--rt-evidence))]")}>
              {formatClock(event.correctedTime)}
              {event.appliedOffset ? ` (${event.appliedOffset > 0 ? "−" : "+"}${Math.abs(event.appliedOffset)} min, ${ws.assumptions.find((x) => x.id === event.offsetAssumptionId)?.code ?? ""})` : ""}
            </span>
            {event.uncertaintyMin ? (
              <>
                <span className="text-muted-foreground">uncertainty</span>
                <span>±{event.uncertaintyMin} min</span>
              </>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Evidence">
        <CitationList ws={ws} citations={a.citations} ownerId={a.id} />
        {basis.length ? (
          <div className="mt-2 text-[12px]">
            <span className="text-muted-foreground">Inferred from </span>
            {basis.map((b) => (
              <button key={b} onClick={() => set({ sel: b })} className="mr-1.5">
                <Code>{idx.get(b)?.code ?? b}</Code>
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title={`Relationships ${links.length}`}>
        <LinkList ws={ws} links={links} focusId={a.id} />
        <NewLinkForm ws={ws} fromId={a.id} />
      </Section>

      {standingHistory.length ? (
        <Section title="How its standing changed">
          <ol className="grid gap-2">
            {standingHistory.map((h, i) => (
              <li key={i} className="text-[12px]">
                <div className="flex items-center gap-2">
                  <StandingTag standing={h.from} />
                  <span className="text-muted-foreground">→</span>
                  <StandingTag standing={h.to} />
                  <ActorTag actor={h.actor as never} />
                  <span className="text-[10.5px] text-muted-foreground">{relativeTime(h.at)}</span>
                </div>
                <p className="mt-0.5 leading-relaxed text-foreground/80">{h.rationale}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Decide">
        <Decide ws={ws} target={a} kind="artifact" />
      </Section>

      <Section title="History">
        <HistoryList entries={history} />
      </Section>
    </div>
  );
}

function LinkList({ ws, links, focusId }: { ws: Workspace; links: LinkRow[]; focusId: string }) {
  const idx = indexById(ws);
  const { set } = useWorkbenchParams();
  const constraint = new Map(ws.chronology.constraints.map((c) => [c.linkId, c.status]));
  if (!links.length) return <p className="mb-2 text-[12px] text-muted-foreground">Not connected to anything yet.</p>;
  return (
    <div className="mb-3 grid gap-1.5">
      {links.map((l) => {
        const other = l.fromId === focusId ? l.toId : l.fromId;
        const dir = l.fromId === focusId ? l.relation.replace("_", " ") : `← ${l.relation.replace("_", " ")}`;
        const cs = constraint.get(l.id);
        return (
          <button key={l.id} onClick={() => set({ sel: l.id })} className={cn("flex items-baseline gap-2 text-left text-[12px] hover:text-primary", l.status === "rejected" && "rt-recede")}>
            <Code>{l.code}</Code>
            <span className={cn("rt-mono text-[10.5px]", l.relation === "contradicts" || cs === "violated" ? "text-[hsl(var(--rt-oxide))]" : "text-muted-foreground")}>{dir}</span>
            <Code>{idx.get(other)?.code ?? "?"}</Code>
            <span className="rt-recede-text min-w-0 flex-1 truncate text-foreground/80">{l.rationale}</span>
            <StatusTag status={l.status} actor={l.createdBy} />
          </button>
        );
      })}
    </div>
  );
}

function NewLinkForm({ ws, fromId }: { ws: Workspace; fromId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [relation, setRelation] = useState<Relation>("supports");
  const [rationale, setRationale] = useState("");
  const [ask, setAsk] = useState(true);
  const link = useRtAction<Record<string, unknown>, { links: Array<{ code: string }> }>("link-artifacts");
  const idx = indexById(ws);
  const targets = [...ws.artifacts.filter((a) => a.id !== fromId), ...ws.links];
  if (!open) {
    return (
      <Btn size="sm" onClick={() => setOpen(true)}>
        <Link2Icon />
        Connect to…
      </Btn>
    );
  }
  const submit = async () => {
    const res = await link.run({ investigationId: ws.investigation.id, links: [{ from: fromId, to, relation, rationale }] });
    if (!res) return;
    if (ask) {
      sendToAgentChat({
        message: `I connected ${idx.get(fromId)?.code} ${relation} ${idx.get(to)?.code}: "${rationale}". Investigate this relationship: does the evidence corroborate or contradict it, and what does it change?`,
        context: `investigationId: ${ws.investigation.id}; new link ${res.links[0]?.code}`,
        submit: true,
      });
    }
    setOpen(false);
    setTo("");
    setRationale("");
  };
  return (
    <div className="rt-arrive grid gap-2 rounded-[5px] border border-border p-3">
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <select value={relation} onChange={(e) => setRelation(e.target.value as Relation)} className={inputClass}>
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
          <option value="">Choose evidence…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {idx.get(t.id)?.code} · {("label" in t ? t.label : t.rationale).slice(0, 70)}
            </option>
          ))}
        </select>
      </div>
      <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} placeholder="State exactly what this relationship claims. Proximity is not causation." className={inputClass} />
      <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} className="accent-[hsl(var(--primary))]" />
        Ask the co-investigator to examine this connection
      </label>
      <div className="flex gap-2">
        <Btn size="sm" tone="primary" disabled={!to || !rationale.trim() || link.pending} onClick={submit}>
          <Link2Icon />
          Connect
        </Btn>
        <Btn size="sm" tone="ghost" onClick={() => setOpen(false)}>
          <Cross2Icon />
          Cancel
        </Btn>
      </div>
    </div>
  );
}

function Decide({ ws, target, kind }: { ws: Workspace; target: ArtifactRow | LinkRow; kind: "artifact" | "link" }) {
  const [pending, setPending] = useState<ArtifactStatus | null>(null);
  const [reason, setReason] = useState("");
  const revise = useRtAction(kind === "artifact" ? "revise-artifact" : "revise-link");
  const acceptOne = useRtAction("accept-artifacts");
  const assess = useRtAction("assess-hypothesis");
  const accept = () =>
    kind === "artifact"
      ? acceptOne.run({ investigationId: ws.investigation.id, refs: [target.id], reason: "Investigator accepted" })
      : revise.run({ investigationId: ws.investigation.id, ref: target.id, status: "accepted", reason: "Investigator accepted" });
  const isHyp = kind === "artifact" && (target as ArtifactRow).type === "hypothesis";
  const [standing, setStanding] = useState<Standing | null>(null);

  const commit = async () => {
    if (standing) {
      await assess.run({ investigationId: ws.investigation.id, ref: target.id, standing, rationale: reason || "Investigator judgement" });
    } else if (pending) {
      await revise.run({ investigationId: ws.investigation.id, ref: target.id, status: pending, reason: reason || `Investigator marked ${pending}` });
    }
    setPending(null);
    setStanding(null);
    setReason("");
  };

  const options: Array<{ s: ArtifactStatus; label: string; tone?: "primary" | "critical" }> = [
    ...(target.status !== "accepted" ? [{ s: "accepted" as const, label: "Accept", tone: "primary" as const }] : []),
    { s: "disputed", label: "Dispute" },
    ...(isHyp ? [] : [{ s: "superseded" as const, label: "Supersede" }]),
    { s: "rejected", label: "Reject", tone: "critical" },
  ];

  return (
    <div className="grid gap-3">
      <div>
        <Kicker className="mb-1.5">Review</Kicker>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Btn key={o.s} size="sm" tone={pending === o.s ? "primary" : o.tone === "critical" ? "critical" : "quiet"} onClick={() => (o.s === "accepted" ? void accept() : (setStanding(null), setPending(o.s)))}>
              {o.s === "accepted" ? <CheckIcon /> : null}
              {o.label}
            </Btn>
          ))}
          <Btn
          size="sm"
          tone="ghost"
          onClick={() =>
            sendToAgentChat({
              message: `Investigate ${"code" in target ? target.code : ""}: look for corroborating and disconfirming evidence and tell me what it changes.`,
              context: `investigationId: ${ws.investigation.id}; focus ${target.id}`,
              submit: true,
            })
          }
        >
          <ChatBubbleIcon />
          Ask agent to investigate
        </Btn>
        </div>
      </div>
      {isHyp ? (
        <div>
          <Kicker className="mb-1.5" title="Assessment against linked evidence. Recording a standing does not accept the hypothesis.">
            Evidence standing
          </Kicker>
          <div className="flex flex-wrap gap-1.5">
            {(["supported", "weakened", "contradicted", "refuted"] as Standing[]).map((s) => (
              <Btn key={s} size="sm" tone={standing === s ? "primary" : "ghost"} onClick={() => (setPending(null), setStanding(s))}>
                {s}
              </Btn>
            ))}
          </div>
        </div>
      ) : null}
      {pending || standing ? (
        <div className="rt-arrive flex gap-2">
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit()} placeholder="Reason (kept in history)" className={inputClass} />
          <Btn size="sm" tone="primary" onClick={commit}>
            <Pencil1Icon />
            Record
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

function HistoryList({ entries }: { entries: Workspace["activity"] }) {
  if (!entries.length) return <p className="text-[12px] text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="grid gap-1.5">
      {entries.map((h) => (
        <li key={h.id} className="text-[12px]">
          <div className="flex items-center gap-2">
            <ActorTag actor={h.actor} />
            <span className="text-foreground/85">{h.summary}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">{relativeTime(h.createdAt)}</span>
          </div>
          {h.reason ? <p className="text-[11.5px] text-muted-foreground">{h.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function AssumptionView({ ws, a }: { ws: Workspace; a: AssumptionRow }) {
  const retire = useRtAction("retire-assumption");
  const minutes = Number(a.value.aheadMinutes);
  const humanTouched = ws.activity.some((h) => h.actor === "human" && h.targetIds.includes(a.id));
  const agentProposal = a.createdBy === "agent" && !humanTouched;
  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceTag>{a.code}</EvidenceTag>
          <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.06em]", agentProposal ? "text-[hsl(var(--rt-evidence))]" : "text-muted-foreground")}>
            {agentProposal ? "Agent proposal" : a.createdBy === "human" ? "Investigator" : "Active"}
          </span>
          {agentProposal ? <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[hsl(var(--rt-unresolved))]">Review required</span> : null}
        </div>
        <h3 className="rt-heading mt-2 text-[18px] leading-snug">{a.label}</h3>
        {a.kind === "clock_offset" && Number.isFinite(minutes) ? (
          <div className="mt-3">
            <Kicker>Offset in use</Kicker>
            <p className="rt-mono mt-1 text-[22px] leading-none">{minutes === 0 ? "0 min" : `${minutes > 0 ? "fast" : "slow"} ${Math.abs(minutes)} min`}</p>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
              Recorded timestamps stay on the events. Corrected times already use this offset. Removing it restores recorded time.
            </p>
          </div>
        ) : null}
        {a.rationale ? <p className="mt-3 text-[13.5px] leading-relaxed">{a.rationale}</p> : null}
      </div>
      <Section title="Evidence">
        <CitationList ws={ws} citations={a.citations} ownerId={a.id} />
      </Section>
      {a.active ? (
        <Section title="Review">
          <Btn
            tone="critical"
            disabled={retire.pending}
            onClick={() => retire.run({ investigationId: ws.investigation.id, ref: a.id, reason: "Investigator removed the correction" })}
          >
            <Cross2Icon />
            Remove correction
          </Btn>
        </Section>
      ) : (
        <Section title="Review">
          <p className="text-[13px] text-muted-foreground">This assumption is retired. Corrected times no longer use it.</p>
        </Section>
      )}
    </div>
  );
}

// ---------- link ----------

function LinkView({ ws, l }: { ws: Workspace; l: LinkRow }) {
  const idx = indexById(ws);
  const { set } = useWorkbenchParams();
  const cs = ws.chronology.constraints.find((c) => c.linkId === l.id);
  const history = ws.activity.filter((h) => h.targetIds.includes(l.id));
  const ends = [l.fromId, l.toId].map((id) => idx.get(id));
  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <EvidenceTag>{l.code}</EvidenceTag>
          <StatusTag status={l.status} actor={l.createdBy} />
          <span className="text-[10.5px] text-muted-foreground">by</span>
          <ActorTag actor={l.createdBy} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <button onClick={() => set({ sel: l.fromId })} className="min-w-0 truncate text-left hover:text-primary">
            <Code>{ends[0]?.code}</Code> {ends[0]?.label}
          </button>
        </div>
        <div className={cn("rt-mono my-1 pl-4 text-[11px] uppercase tracking-wide", l.relation === "contradicts" ? "text-[hsl(var(--rt-oxide))]" : "text-muted-foreground")}>↓ {l.relation.replace("_", " ")}</div>
        <button onClick={() => set({ sel: l.toId })} className="min-w-0 truncate text-left text-[13px] hover:text-primary">
          <Code>{ends[1]?.code}</Code> {ends[1]?.label}
        </button>
        <p className="rt-serif mt-3 text-[15px] leading-snug">{l.rationale}</p>
        {cs ? (
          <div className={cn("mt-3 text-[12px]", cs.status === "violated" ? "text-[hsl(var(--rt-oxide))]" : cs.status === "uncertain" ? "text-[hsl(var(--rt-unresolved))]" : "text-[hsl(var(--rt-confirmed))]")}>
            Ordering against corrected time: <strong className="uppercase tracking-wide">{cs.status}</strong>
            {cs.gapMinutes !== null ? ` (${cs.gapMinutes > 0 ? "+" : ""}${Math.round(cs.gapMinutes)} min)` : ""}
          </div>
        ) : null}
        {l.reviewFlag ? <div className="mt-3 border-l-2 border-[hsl(var(--rt-unresolved))] px-3 py-1.5 text-[12px] text-[hsl(var(--rt-unresolved))]">Needs review: {l.reviewFlag}</div> : null}
      </div>
      <Section title="Evidence">
        <CitationList ws={ws} citations={l.citations} ownerId={l.id} />
      </Section>
      <Section title="Decide">
        <Decide ws={ws} target={l} kind="link" />
      </Section>
      <Section title="History">
        <HistoryList entries={history} />
      </Section>
    </div>
  );
}
