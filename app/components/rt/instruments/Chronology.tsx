import { CheckIcon, ChevronRightIcon, MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";
import type { ArtifactRow, InstrumentRow, LinkRow } from "@shared/investigation";

import type { OrderingConstraint, PlacedEvent } from "../../../../server/lib/engine/chronology";
import { type Chronology as ChronologyData, formatClock, useRtAction, useWorkbenchParams, type Workspace } from "../lib";
import { Btn, Code, CONSTRAINT_TONE, EpistemicMark, inputClass, Kicker, StatusTag } from "../ui";
import {
  chronologyMode,
  describeTemporalRelation,
  eventsWithinSpan,
  eventTone,
  formatEventTime,
  formatMinuteGap,
  groupByDay,
  isSignificant,
  ORDER_STATUS_LABEL,
  orderingBetween,
  parseSpanParam,
  resolveSpanIds,
  unresolvedNotes,
  type ChronologyMode,
  type EventSignals,
  type SequenceNote,
} from "./chronology-present";

const INACTIVE = new Set(["rejected", "refuted", "superseded"]);

export function ChronologyInstrument({ ws, instrument, data }: { ws: Workspace; instrument: InstrumentRow; data: ChronologyData }) {
  const { selected, set, chrono, span, scope } = useWorkbenchParams();
  const mode = chronologyMode(chrono);
  const [arm, setArm] = useState<"idle" | "start" | "end">("idle");
  const [clocksOpen, setClocksOpen] = useState(false);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (arm === "idle") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArm("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arm]);

  const events = data.events;
  const artifactById = useMemo(() => new Map(ws.artifacts.map((artifact) => [artifact.id, artifact])), [ws.artifacts]);
  const sourceById = useMemo(() => new Map(ws.sources.map((source) => [source.id, source])), [ws.sources]);
  const eventIds = useMemo(() => new Set([...events.map((event) => event.id), ...data.unplaced.map((event) => event.id)]), [events, data.unplaced]);
  const contradicted = useMemo(() => {
    const ids = new Set<string>();
    for (const link of ws.links) {
      if (link.relation !== "contradicts" || INACTIVE.has(link.status)) continue;
      if (eventIds.has(link.fromId)) ids.add(link.fromId);
      if (eventIds.has(link.toId)) ids.add(link.toId);
    }
    return ids;
  }, [ws.links, eventIds]);

  const signals = (event: PlacedEvent): EventSignals => ({
    constraints: data.constraints,
    contradicted: contradicted.has(event.id),
    disputed: event.status === "disputed",
    reviewFlag: !!artifactById.get(event.id)?.reviewFlag,
    proposed: event.status === "proposed",
  });

  const tokens = resolveSpanIds(parseSpanParam(span), ws.artifacts);
  const spanned = eventsWithinSpan(events, tokens);
  const spanRequested = tokens.length === 2 && tokens[0] !== tokens[1];
  const endpointIds = new Set(spanned.endpoints?.map((event) => event.id) ?? []);
  const windowEvents =
    scope === "important"
      ? spanned.events.filter((event) => endpointIds.has(event.id) || isSignificant(event, signals(event)))
      : spanned.events;
  const spanIds = spanned.endpoints ? new Set(spanned.events.map((event) => event.id)) : null;

  const notes = useMemo(
    () =>
      unresolvedNotes({
        questions: ws.artifacts
          .filter((artifact) => artifact.type === "question")
          .map((artifact) => ({ id: artifact.id, code: artifact.code, label: artifact.label, body: artifact.body, status: artifact.status })),
        links: ws.links.map((link) => ({ fromId: link.fromId, toId: link.toId, status: link.status })),
        placed: events.map((event) => ({ id: event.id, code: event.code, correctedMinutes: event.correctedMinutes })),
        scopeIds: eventIds,
        boundIds: new Set(instrument.boundArtifactIds),
      }),
    [ws.artifacts, ws.links, events, eventIds, instrument.boundArtifactIds],
  );

  const visibleIds = useMemo(() => new Set(windowEvents.map((event) => event.id)), [windowEvents]);
  const notesAfter = new Map<string, SequenceNote[]>();
  const trailingNotes: SequenceNote[] = [];
  for (const note of notes) {
    const inWindow = !spanned.endpoints || note.relatedEventIds.some((id) => visibleIds.has(id));
    if (!inWindow) continue;
    if (note.afterEventId && visibleIds.has(note.afterEventId)) {
      const list = notesAfter.get(note.afterEventId) ?? [];
      list.push(note);
      notesAfter.set(note.afterEventId, list);
    } else trailingNotes.push(note);
  }

  const seen = useRef<Set<string> | null>(null);
  const arrived = useMemo(() => {
    const ids = new Set<string>();
    if (!seen.current) return ids;
    for (const event of events) if (!seen.current.has(event.id)) ids.add(event.id);
    return ids;
  }, [events]);
  useEffect(() => {
    seen.current = new Set(events.map((event) => event.id));
  }, [events]);

  const prevStatus = useRef(new Map<string, string>());
  const flipped = useMemo(() => {
    const next = new Set<string>();
    for (const constraint of data.constraints) {
      const previous = prevStatus.current.get(constraint.linkId);
      if (previous && previous !== constraint.status) next.add(constraint.linkId);
    }
    return next;
  }, [data.constraints]);
  useEffect(() => {
    prevStatus.current = new Map(data.constraints.map((constraint) => [constraint.linkId, constraint.status]));
  }, [data.constraints]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected, mode]);

  const onEvent = (id: string) => {
    if (arm === "start") {
      set({ span: id });
      setArm("end");
      return;
    }
    if (arm === "end") {
      const start = tokens[0];
      if (!start || start === id) return;
      set({ span: `${start},${id}` });
      setArm("idle");
      return;
    }
    set({ sel: id });
  };

  const comparison = spanned.endpoints
    ? describeTemporalRelation(spanned.endpoints[0], spanned.endpoints[1], orderingBetween(data.constraints, spanned.endpoints[0].id, spanned.endpoints[1].id))
    : null;
  const conflicts = data.constraints.filter((constraint) => constraint.status === "violated" && (visibleIds.has(constraint.beforeId) || visibleIds.has(constraint.afterId)));
  const days = groupByDay(windowEvents);
  const anchorId = arm === "end" ? (tokens[0] ?? null) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
          <ModeSwitch mode={mode} onChange={(next) => set({ chrono: next === "sequence" ? null : next })} />
          {mode === "sequence" ? (
            <ScopeSwitch scope={scope} onChange={(next) => set({ scope: next === "all" ? null : next })} />
          ) : null}
          {mode === "sequence" ? (
            <button
              type="button"
              aria-pressed={arm !== "idle"}
              onClick={() => setArm((current) => (current === "idle" ? "start" : "idle"))}
              className={cn(
                "h-6 rounded-[5px] border px-2 text-[11.5px] font-medium",
                arm !== "idle" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {arm === "idle" ? "Focus" : "Cancel focus"}
            </button>
          ) : null}
          {span ? (
            <button type="button" onClick={() => (set({ span: null }), setArm("idle"))} className="h-6 rounded-[5px] px-2 text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
              Full chronology
            </button>
          ) : null}
          {data.clocks.length ? (
            <ClockCorrectionToggle ws={ws} clocks={data.clocks} open={clocksOpen} onToggle={() => setClocksOpen((open) => !open)} />
          ) : null}
        </div>
        {arm === "start" ? <p className="px-4 pb-2 text-[12px] text-muted-foreground">Choose the first event.</p> : null}
        {arm === "end" ? <p className="px-4 pb-2 text-[12px] text-muted-foreground">Choose the last event.</p> : null}
        {spanRequested && !spanned.endpoints ? <p className="px-4 pb-2 text-[12px] text-muted-foreground">{spanMiss(tokens, data, artifactById)}</p> : null}
        {comparison ? (
          <p
            aria-live="polite"
            className={cn(
              "border-t border-border px-4 py-2 text-[12.5px] leading-snug",
              comparison.tone === "conflict" && "text-[hsl(var(--rt-oxide))]",
              comparison.tone === "uncertain" && "text-[hsl(var(--rt-unresolved))]",
              comparison.tone === "neutral" && "text-foreground/80",
            )}
          >
            {comparison.text}
          </p>
        ) : null}
        {mode === "sequence" && conflicts.length ? (
          <button type="button" onClick={() => set({ chrono: "relationships" })} className="block w-full border-t border-border px-4 py-1.5 text-left text-[12px] font-medium text-[hsl(var(--rt-oxide))] hover:bg-[hsl(var(--rt-oxide)/0.05)]">
            {conflicts.length === 1 ? "1 ordering conflicts with corrected time" : `${conflicts.length} orderings conflict with corrected time`}
          </button>
        ) : null}
        {clocksOpen && data.clocks.length ? (
          <div id="clock-correction" className="max-h-44 overflow-y-auto border-t border-border bg-[hsl(var(--muted)/0.55)]">
            <div className="divide-y divide-border/80">
              {data.clocks.map((clock) => (
                <ClockControl
                  key={clock.clockKey}
                  ws={ws}
                  instrument={instrument}
                  clockKey={clock.clockKey}
                  eventCount={clock.eventCount}
                  sample={events.find((event) => event.clockKey === clock.clockKey) ?? null}
                  onReview={(id) => set({ sel: id })}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {mode === "sequence" ? (
        <Sequence
          days={days}
          notesAfter={notesAfter}
          trailingNotes={trailingNotes}
          unplaced={data.unplaced}
          artifactById={artifactById}
          sourceById={sourceById}
          selected={selected}
          anchorId={anchorId}
          arrived={arrived}
          selectedRef={selectedRef}
          onEvent={onEvent}
          onSource={(sourceId, eventId) => set({ sel: sourceId, hl: eventId })}
          signals={signals}
          emptyBecauseFilter={scope === "important" && events.length > 0 && windowEvents.length === 0}
          hasEvents={events.length > 0 || data.unplaced.length > 0}
        />
      ) : null}
      {mode === "relationships" ? (
        <Relationships
          ws={ws}
          data={data}
          windowIds={spanIds}
          flipped={flipped}
          selected={selected}
          onSelect={(id) => set({ sel: id })}
        />
      ) : null}
      {mode === "time" ? (
        <TimeAnalysis
          ws={ws}
          data={data}
          events={spanned.endpoints ? spanned.events : events}
          limited={!!spanned.endpoints}
          flipped={flipped}
          selected={selected}
          selectedRef={selectedRef}
          onSelect={(id) => set({ sel: id })}
        />
      ) : null}
    </div>
  );
}

function spanMiss(tokens: string[], data: ChronologyData, artifacts: Map<string, ArtifactRow>) {
  const missing = data.unplaced.filter((event) => tokens.includes(event.id));
  if (missing.length === 1) return `${missing[0]!.label} has no readable time, so this range stays open.`;
  if (missing.length > 1) return "Those events have no readable time, so this range stays open.";
  const known = tokens.map((token) => artifacts.get(token)?.label).filter(Boolean);
  if (known.length === 2) return "Those two events are not both on this chronology.";
  return "That range does not match two events on this chronology.";
}

function ModeSwitch({ mode, onChange }: { mode: ChronologyMode; onChange: (mode: ChronologyMode) => void }) {
  const modes: Array<[ChronologyMode, string]> = [
    ["sequence", "Sequence"],
    ["relationships", "Relationships"],
    ["time", "Time analysis"],
  ];
  return (
    <div role="tablist" aria-label="Chronology view" className="flex overflow-hidden rounded-[5px] border border-border text-[11.5px]">
      {modes.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          onClick={() => onChange(id)}
          className={cn("px-2.5 py-1", mode === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ScopeSwitch({ scope, onChange }: { scope: "all" | "important"; onChange: (scope: "all" | "important") => void }) {
  return (
    <div role="group" aria-label="Which events to show" className="flex overflow-hidden rounded-[5px] border border-border text-[11.5px]">
      {(
        [
          ["all", "All events"],
          ["important", "Important"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={scope === id}
          onClick={() => onChange(id)}
          className={cn("px-2.5 py-1", scope === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function edgeClass(tone: ReturnType<typeof eventTone>) {
  if (tone === "conflict") return "border-l-[hsl(var(--rt-oxide))]";
  if (tone === "uncertain") return "border-l-[hsl(var(--rt-unresolved))]";
  if (tone === "proposed") return "border-l-[hsl(var(--rt-evidence)/0.55)]";
  return "border-l-transparent";
}

function eventDescription(event: PlacedEvent, artifact: ArtifactRow | undefined) {
  const body = artifact?.body.trim() ?? "";
  if (!body || body === event.label.trim()) return "";
  return body;
}

function Sequence({
  days,
  notesAfter,
  trailingNotes,
  unplaced,
  artifactById,
  sourceById,
  selected,
  anchorId,
  arrived,
  selectedRef,
  onEvent,
  onSource,
  signals,
  emptyBecauseFilter,
  hasEvents,
}: {
  days: ReturnType<typeof groupByDay>;
  notesAfter: Map<string, SequenceNote[]>;
  trailingNotes: SequenceNote[];
  unplaced: ChronologyData["unplaced"];
  artifactById: Map<string, ArtifactRow>;
  sourceById: Map<string, Workspace["sources"][number]>;
  selected: string | null;
  anchorId: string | null;
  arrived: Set<string>;
  selectedRef: RefObject<HTMLDivElement | null>;
  onEvent: (id: string) => void;
  onSource: (sourceId: string, eventId: string) => void;
  signals: (event: PlacedEvent) => EventSignals;
  emptyBecauseFilter: boolean;
  hasEvents: boolean;
}) {
  if (!hasEvents) {
    return <p className="px-5 py-8 text-[13px] text-muted-foreground">No events with a recorded time are on this chronology yet.</p>;
  }
  if (emptyBecauseFilter && !unplaced.length && !trailingNotes.length) {
    return <p className="px-5 py-8 text-[13px] text-muted-foreground">No event is marked by a time conflict, a clock correction, or recorded uncertainty.</p>;
  }
  if (!days.length && !unplaced.length && !trailingNotes.length) {
    return <p className="px-5 py-8 text-[13px] text-muted-foreground">Nothing in this range has a recorded time.</p>;
  }
  return (
    <div>
      {days.map((day) => (
        <section key={day.key}>
          <h3 className="border-t border-border bg-[hsl(var(--muted)/0.45)] px-4 py-1">
            <Kicker className="text-foreground/70">{day.label}</Kicker>
          </h3>
          {day.events.map((event) => (
            <div key={event.id}>
              <EventRow
                event={event}
                artifact={artifactById.get(event.id)}
                sourceById={sourceById}
                selected={selected === event.id}
                anchor={anchorId === event.id}
                arrived={arrived.has(event.id)}
                rowRef={selected === event.id ? selectedRef : undefined}
                onEvent={onEvent}
                onSource={onSource}
                tone={eventTone(event, signals(event))}
              />
              {(notesAfter.get(event.id) ?? []).map((note) => (
                <NoteRow key={note.id} note={note} selected={selected === note.id} onSelect={onEvent} />
              ))}
            </div>
          ))}
        </section>
      ))}
      {trailingNotes.map((note) => (
        <NoteRow key={note.id} note={note} selected={selected === note.id} onSelect={onEvent} />
      ))}
      {unplaced.length ? (
        <section>
          <h3 className="border-t border-border bg-[hsl(var(--muted)/0.45)] px-4 py-1">
            <Kicker className="text-foreground/70">Time unknown</Kicker>
          </h3>
          {unplaced.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onEvent(event.id)}
              className={cn("block w-full border-t border-border border-l-2 border-l-[hsl(var(--rt-unresolved))] px-4 py-2 text-left", selected === event.id && "bg-[hsl(var(--primary)/0.06)]")}
            >
              <span className="text-[13.5px] font-medium leading-snug">{event.label}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">No recorded time could be read, so this event is not ordered.</span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function EventRow({
  event,
  artifact,
  sourceById,
  selected,
  anchor,
  arrived,
  rowRef,
  onEvent,
  onSource,
  tone,
}: {
  event: PlacedEvent;
  artifact: ArtifactRow | undefined;
  sourceById: Map<string, Workspace["sources"][number]>;
  selected: boolean;
  anchor: boolean;
  arrived: boolean;
  rowRef?: RefObject<HTMLDivElement | null> | undefined;
  onEvent: (id: string) => void;
  onSource: (sourceId: string, eventId: string) => void;
  tone: ReturnType<typeof eventTone>;
}) {
  const description = eventDescription(event, artifact);
  const place = typeof artifact?.attrs.place === "string" ? artifact.attrs.place.trim() : "";
  const sources = sourcesFor(artifact, sourceById);
  return (
    <div
      ref={rowRef}
      className={cn(
        "grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3 border-t border-border border-l-2 px-4 py-2",
        edgeClass(tone),
        (selected || anchor) && "bg-[hsl(var(--primary)/0.06)]",
        arrived && "rt-arrive",
      )}
      style={{ scrollMarginTop: 120 }}
    >
      <div className="pt-0.5">
        <div className="rt-mono text-[12.5px] tabular-nums" title={formatClock(event.correctedTime)}>
          {formatEventTime(event.correctedTime)}
        </div>
        {event.appliedOffset !== 0 ? (
          <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground" title={`Recorded ${formatClock(event.sourceTime)}`}>
            recorded
            <span className="rt-mono mt-0.5 block">{formatEventTime(event.sourceTime)}</span>
          </div>
        ) : null}
        {event.uncertaintyMin > 0 ? <div className="rt-mono mt-1 text-[10.5px] text-[hsl(var(--rt-unresolved))]">±{event.uncertaintyMin} min</div> : null}
      </div>
      <div className="min-w-0">
        <button type="button" onClick={() => onEvent(event.id)} aria-pressed={selected} className="block w-full rounded-[4px] text-left">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13.5px] font-medium leading-snug">{event.label}</span>
            {artifact && artifact.epistemic !== "observation" ? <EpistemicMark value={artifact.epistemic} withLabel /> : null}
            {event.status === "disputed" ? <StatusTag status="disputed" /> : null}
            {tone === "conflict" ? <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--rt-oxide))]">Time conflict</span> : null}
            {anchor ? <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">Range start</span> : null}
          </span>
          {description ? <span className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-foreground/75">{description}</span> : null}
          {artifact?.reviewFlag ? <span className="mt-0.5 block text-[12px] leading-snug text-[hsl(var(--rt-unresolved))]">{artifact.reviewFlag}</span> : null}
        </button>
        {place || sources.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {place ? <span className="text-[12px] text-muted-foreground">{place}</span> : null}
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => onSource(source.id, event.id)}
                className="inline-flex max-w-full min-w-0 items-baseline gap-1.5 text-left hover:text-primary"
              >
                <Code>{source.code}</Code>
                <span className="truncate text-[12px] text-muted-foreground">{source.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function sourcesFor(artifact: ArtifactRow | undefined, sourceById: Map<string, Workspace["sources"][number]>) {
  if (!artifact) return [];
  const seen = new Set<string>();
  const sources = [];
  for (const citation of artifact.citations) {
    if (seen.has(citation.sourceId)) continue;
    seen.add(citation.sourceId);
    const source = sourceById.get(citation.sourceId);
    if (source) sources.push(source);
  }
  return sources;
}

function NoteRow({ note, selected, onSelect }: { note: SequenceNote; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <div className={cn("border-t border-border border-l-2 border-l-[hsl(var(--rt-unresolved))] px-4 py-2", selected && "bg-[hsl(var(--primary)/0.06)]")}>
      <button type="button" onClick={() => onSelect(note.id)} aria-pressed={selected} className="block w-full text-left">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--rt-unresolved))]">Unresolved</span>
        {note.status !== "accepted" ? (
          <span className="ml-2 align-middle">
            <StatusTag status={note.status as ArtifactRow["status"]} />
          </span>
        ) : null}
        <span className="mt-0.5 block text-[13.5px] font-medium leading-snug">{note.label}</span>
        {note.body.trim() && note.body.trim() !== note.label.trim() ? (
          <span className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-foreground/75">{note.body}</span>
        ) : null}
      </button>
      {note.eventCodes.length ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Linked to{" "}
          {note.eventCodes.map((code, index) => (
            <span key={code}>
              {index ? ", " : null}
              <Code>{code}</Code>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function Relationships({
  ws,
  data,
  windowIds,
  flipped,
  selected,
  onSelect,
}: {
  ws: Workspace;
  data: ChronologyData;
  windowIds: Set<string> | null;
  flipped: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(ws.artifacts.map((artifact) => [artifact.id, artifact])), [ws.artifacts]);
  const eventById = useMemo(() => new Map(data.events.map((event) => [event.id, event])), [data.events]);
  const touches = (id: string) => !windowIds || windowIds.has(id);
  const constraints = data.constraints
    .filter((constraint) => touches(constraint.beforeId) || touches(constraint.afterId))
    .slice()
    .sort((a, b) => (eventById.get(a.beforeId)?.correctedMinutes ?? Number.MAX_SAFE_INTEGER) - (eventById.get(b.beforeId)?.correctedMinutes ?? Number.MAX_SAFE_INTEGER));
  const chronologyIds = new Set<string>([...eventById.keys(), ...data.unplaced.map((event) => event.id)]);
  const contradictions = ws.links.filter((link) => {
    if (link.relation !== "contradicts" || INACTIVE.has(link.status)) return false;
    if (!chronologyIds.has(link.fromId) && !chronologyIds.has(link.toId)) return false;
    return touches(link.fromId) || touches(link.toId);
  });
  const related = new Set<string>();
  for (const constraint of data.constraints) {
    related.add(constraint.beforeId);
    related.add(constraint.afterId);
  }
  for (const link of contradictions) {
    related.add(link.fromId);
    related.add(link.toId);
  }
  const unlinked = data.events.filter((event) => (!windowIds || windowIds.has(event.id)) && !related.has(event.id)).length;

  if (!constraints.length && !contradictions.length) {
    return <p className="px-5 py-8 text-[13px] text-muted-foreground">No orderings have been asserted.</p>;
  }

  return (
    <div>
      {constraints.map((constraint) => (
        <OrderingBlock
          key={constraint.linkId}
          constraint={constraint}
          before={labelAndTime(constraint.beforeId, byId, eventById)}
          after={labelAndTime(constraint.afterId, byId, eventById)}
          selected={selected === constraint.linkId}
          flipped={flipped.has(constraint.linkId)}
          onSelect={() => onSelect(constraint.linkId)}
          onEndpoint={onSelect}
        />
      ))}
      {contradictions.length ? (
        <section>
          <h3 className="border-t border-border bg-[hsl(var(--muted)/0.45)] px-4 py-1">
            <Kicker className="text-foreground/70">Contradictions</Kicker>
          </h3>
          {contradictions.map((link) => (
            <ContradictionRow key={link.id} link={link} byId={byId} selected={selected === link.id} onSelect={onSelect} />
          ))}
        </section>
      ) : null}
      {unlinked > 0 && constraints.length + contradictions.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
          {unlinked === 1 ? "1 event has no asserted relationship." : `${unlinked} events have no asserted relationship.`}
        </p>
      ) : null}
    </div>
  );
}

function labelAndTime(id: string, artifacts: Map<string, ArtifactRow>, events: Map<string, PlacedEvent>) {
  const event = events.get(id);
  const artifact = artifacts.get(id);
  return {
    id,
    label: event?.label ?? artifact?.label ?? "Unknown record",
    time: event ? formatEventTime(event.correctedTime) : "Time unknown",
  };
}

function OrderingBlock({
  constraint,
  before,
  after,
  selected,
  flipped,
  onSelect,
  onEndpoint,
}: {
  constraint: OrderingConstraint;
  before: { id: string; label: string; time: string };
  after: { id: string; label: string; time: string };
  selected: boolean;
  flipped: boolean;
  onSelect: () => void;
  onEndpoint: (id: string) => void;
}) {
  const tone = constraint.status === "violated" ? "bg-[hsl(var(--rt-oxide))]" : constraint.status === "uncertain" || constraint.status === "unplaced" ? "bg-[hsl(var(--rt-unresolved))]" : "bg-border";
  return (
    <div className={cn("grid grid-cols-[14px_minmax(0,1fr)] gap-2 border-t border-border px-4 py-2.5", selected && "bg-[hsl(var(--primary)/0.06)]", flipped && "rt-signal")}>
      <div className="flex flex-col items-center py-1" aria-hidden>
        <span className={cn("size-1.5 rounded-full", tone)} />
        <span className={cn("w-px flex-1", tone)} />
        <span className={cn("size-1.5 rounded-full", tone)} />
      </div>
      <div className="min-w-0">
        <EndpointButton id={before.id} label={before.label} time={before.time} onSelect={onEndpoint} />
        <button type="button" onClick={onSelect} className="my-1 block w-full text-left">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Code>{constraint.code}</Code>
            <span className={cn("text-[11.5px] font-semibold uppercase tracking-[0.05em]", CONSTRAINT_TONE[constraint.status])}>{ORDER_STATUS_LABEL[constraint.status]}</span>
            {constraint.gapMinutes !== null ? <span className="rt-mono text-[11px] text-muted-foreground">{formatMinuteGap(constraint.gapMinutes)}</span> : null}
            {constraint.linkStatus !== "accepted" ? <StatusTag status={constraint.linkStatus} /> : null}
          </span>
          {constraint.rationale ? <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-foreground/75">{constraint.rationale}</span> : null}
        </button>
        <EndpointButton id={after.id} label={after.label} time={after.time} onSelect={onEndpoint} />
      </div>
    </div>
  );
}

function EndpointButton({ id, label, time, onSelect }: { id: string; label: string; time: string; onSelect: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(id)} className="flex w-full min-w-0 items-baseline justify-between gap-3 text-left hover:text-primary">
      <span className="text-[13px] font-medium leading-snug">{label}</span>
      <span className="rt-mono shrink-0 text-[11px] text-muted-foreground">{time}</span>
    </button>
  );
}

function ContradictionRow({
  link,
  byId,
  selected,
  onSelect,
}: {
  link: LinkRow;
  byId: Map<string, ArtifactRow>;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(link.id)}
      className={cn("block w-full border-t border-border border-l-2 border-l-[hsl(var(--rt-oxide))] px-4 py-2 text-left", selected && "bg-[hsl(var(--primary)/0.06)]")}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <Code>{link.code}</Code>
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--rt-oxide))]">Contradicts</span>
        {link.status !== "accepted" ? <StatusTag status={link.status} /> : null}
      </span>
      <span className="mt-0.5 block text-[13px] font-medium leading-snug">
        {byId.get(link.fromId)?.label ?? "Unknown record"}
        <span className="font-normal text-muted-foreground"> and </span>
        {byId.get(link.toId)?.label ?? "Unknown record"}
      </span>
      {link.rationale ? <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-foreground/75">{link.rationale}</span> : null}
    </button>
  );
}

function TimeAnalysis({
  ws,
  data,
  events,
  limited,
  flipped,
  selected,
  selectedRef,
  onSelect,
}: {
  ws: Workspace;
  data: ChronologyData;
  events: PlacedEvent[];
  limited: boolean;
  flipped: Set<string>;
  selected: string | null;
  selectedRef: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(ws.artifacts.map((artifact) => [artifact.id, artifact])), [ws.artifacts]);
  const shown = new Set(events.map((event) => event.id));
  const checked = data.constraints.filter((constraint) => !limited || shown.has(constraint.beforeId) || shown.has(constraint.afterId));
  return (
    <div>
      <h3 className="border-t border-border bg-[hsl(var(--muted)/0.45)] px-4 py-1">
        <Kicker className="text-foreground/70">Recorded and corrected</Kicker>
      </h3>
      {events.map((event) => (
        <div key={event.id} ref={selected === event.id ? selectedRef : undefined} style={{ scrollMarginTop: 120 }}>
        <button
          type="button"
          onClick={() => onSelect(event.id)}
          className={cn("block w-full border-t border-border px-4 py-2 text-left hover:bg-accent/60", selected === event.id && "bg-[hsl(var(--primary)/0.06)]")}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[13px] font-medium leading-snug">{event.label}</span>
            <Code className="shrink-0">{event.code}</Code>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={event.clockKey}>
            {event.clockKey}
          </span>
          <span className="rt-mono mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px]">
            <span className="text-muted-foreground">recorded {formatClock(event.sourceTime)}</span>
            <span className={cn(event.appliedOffset ? "font-semibold text-[hsl(var(--rt-evidence))]" : "text-foreground/80")}>corrected {formatClock(event.correctedTime)}</span>
            {event.uncertaintyMin > 0 ? <span className="text-[hsl(var(--rt-unresolved))]">±{event.uncertaintyMin} min</span> : null}
          </span>
        </button>
        </div>
      ))}
      {!limited
        ? data.unplaced.map((event) => (
        <button key={event.id} type="button" onClick={() => onSelect(event.id)} className="block w-full border-t border-border px-4 py-2 text-left hover:bg-accent/60">
          <span className="text-[13px] font-medium">{event.label}</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">No recorded time could be read.</span>
        </button>
      ))
        : null}
      <h3 className="border-t border-border bg-[hsl(var(--muted)/0.45)] px-4 py-1">
        <Kicker className="text-foreground/70">Ordering check</Kicker>
      </h3>
      {checked.length ? (
        checked.map((constraint) => (
          <button
            key={constraint.linkId}
            type="button"
            onClick={() => onSelect(constraint.linkId)}
            className={cn("flex w-full items-start gap-3 border-t border-border px-4 py-2 text-left hover:bg-accent/60", flipped.has(constraint.linkId) && "rt-signal", selected === constraint.linkId && "bg-[hsl(var(--primary)/0.06)]")}
          >
            <Code className="pt-0.5">{constraint.code}</Code>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-snug">
                {byId.get(constraint.beforeId)?.label ?? "Unknown record"}
                <span className="text-muted-foreground"> before </span>
                {byId.get(constraint.afterId)?.label ?? "Unknown record"}
              </span>
              {constraint.rationale ? <span className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{constraint.rationale}</span> : null}
            </span>
            <span className="shrink-0 text-right">
              <span className={cn("block text-[10.5px] font-semibold uppercase tracking-[0.06em]", CONSTRAINT_TONE[constraint.status])}>{ORDER_STATUS_LABEL[constraint.status]}</span>
              {constraint.gapMinutes !== null ? <span className="rt-mono text-[10.5px] text-muted-foreground">{formatMinuteGap(constraint.gapMinutes)}</span> : null}
            </span>
          </button>
        ))
      ) : (
        <p className="px-4 py-3 text-[12.5px] text-muted-foreground">No orderings have been asserted.</p>
      )}
    </div>
  );
}

function activeOffset(ws: Workspace, clockKey: string) {
  const assumption = ws.assumptions.find((item) => item.kind === "clock_offset" && item.active && item.value.clockKey === clockKey);
  const minutes = Number(assumption?.value.aheadMinutes ?? 0);
  const touched = assumption ? ws.activity.some((entry) => entry.actor === "human" && entry.targetIds.includes(assumption.id)) : false;
  return { assumption, minutes, proposal: !!assumption && assumption.createdBy === "agent" && !touched };
}

function correctionSummary(ws: Workspace, clocks: Array<{ clockKey: string }>) {
  let adjusted = 0;
  let proposals = 0;
  for (const clock of clocks) {
    const offset = activeOffset(ws, clock.clockKey);
    if (offset.minutes !== 0) adjusted += 1;
    if (offset.proposal) proposals += 1;
  }
  const parts: string[] = [];
  if (adjusted) parts.push(adjusted === 1 ? "1 adjusted" : `${adjusted} adjusted`);
  if (proposals) parts.push(proposals === 1 ? "1 proposal" : `${proposals} proposals`);
  return { text: parts.join(" · "), proposal: proposals > 0 };
}

function ClockCorrectionToggle({
  ws,
  clocks,
  open,
  onToggle,
}: {
  ws: Workspace;
  clocks: Array<{ clockKey: string }>;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = correctionSummary(ws, clocks);
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="clock-correction"
      onClick={onToggle}
      className={cn(
        "ml-auto inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11.5px]",
        open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
      Clock correction
      {summary.text ? <span className={cn("rt-mono text-[11px]", summary.proposal ? "text-[hsl(var(--rt-unresolved))]" : "text-muted-foreground")}>{summary.text}</span> : null}
    </button>
  );
}

function ClockControl({
  ws,
  instrument,
  clockKey,
  eventCount,
  sample,
  onReview,
}: {
  ws: Workspace;
  instrument: InstrumentRow;
  clockKey: string;
  eventCount: number;
  sample: PlacedEvent | null;
  onReview: (id: string) => void;
}) {
  const { assumption, minutes: current, proposal: agentProposal } = activeOffset(ws, clockKey);
  const [draft, setDraft] = useState(String(Math.abs(current)));
  const [slow, setSlow] = useState(current < 0);
  const [reason, setReason] = useState("");
  useEffect(() => {
    setDraft(String(Math.abs(current)));
    setSlow(current < 0);
  }, [current]);
  const setAssumption = useRtAction("set-assumption");
  const retire = useRtAction("retire-assumption");
  const magnitude = Math.abs(Number(draft));
  const value = slow ? -magnitude : magnitude;
  const dirty = Number.isFinite(value) && value !== current;

  const apply = async () => {
    const why = reason.trim() || `Investigator set the ${clockKey} clock offset in ${instrument.code}`;
    if (value === 0 && assumption) {
      await retire.run({ investigationId: ws.investigation.id, ref: assumption.id, reason: why });
    } else {
      await setAssumption.run({
        investigationId: ws.investigation.id,
        ref: assumption?.id,
        kind: "clock_offset",
        label: `${clockKey} reads ${value > 0 ? `${value} min fast` : `${Math.abs(value)} min slow`}`,
        value: { clockKey, aheadMinutes: value },
        rationale: why,
      });
    }
    setReason("");
  };

  const offsetLabel = current === 0 ? "0 min" : `${current > 0 ? "fast" : "slow"} ${Math.abs(current)} min`;

  return (
    <div className="px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="rt-mono min-w-0 max-w-[16rem] truncate text-[12.5px] font-medium" title={clockKey}>
          {clockKey}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
        <span className="rt-mono text-[12.5px]">{offsetLabel}</span>
        {agentProposal ? (
          <button type="button" className="text-[11.5px] font-medium text-[hsl(var(--rt-evidence))] hover:underline" onClick={() => assumption && onReview(assumption.id)}>
            Agent proposal
          </button>
        ) : assumption ? (
          <span className="text-[11.5px] text-muted-foreground">{assumption.createdBy === "human" ? "Investigator" : "Active"}</span>
        ) : null}
        <span className="flex items-center gap-1">
          <button type="button" className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-primary" onClick={() => setDraft(String(Math.max(magnitude - 1, 0)))} aria-label={`Decrease ${clockKey} offset`}>
            <MinusIcon className="size-3" />
          </button>
          <input
            value={draft}
            inputMode="numeric"
            onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(event) => event.key === "Enter" && dirty && apply()}
            className="rt-mono h-6 w-12 rounded border border-border bg-card text-center text-[12px] outline-none focus:border-primary"
            aria-label={`${clockKey} offset in minutes`}
          />
          <button type="button" className="inline-flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-primary" onClick={() => setDraft(String(magnitude + 1))} aria-label={`Increase ${clockKey} offset`}>
            <PlusIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => setSlow((next) => !next)}
            className="inline-flex h-6 items-center rounded border border-border px-1.5 text-[11px] text-foreground hover:border-primary hover:text-primary"
            aria-label={`${clockKey} runs ${slow ? "slow" : "fast"}`}
          >
            {slow ? "slow" : "fast"}
          </button>
        </span>
      </div>
      {sample && current !== 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Recorded {formatEventTime(sample.sourceTime)}
          <span aria-hidden> · </span>
          corrected {formatEventTime(sample.correctedTime)}
        </p>
      ) : null}
      {dirty ? (
        <div className="mt-1.5 flex items-center gap-1">
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this offset" className={cn(inputClass, "h-6 px-1.5 py-0 text-[12px]")} aria-label={`Reason for the ${clockKey} offset`} />
          <Btn size="sm" tone="primary" onClick={apply} disabled={setAssumption.pending || retire.pending}>
            <CheckIcon />
            Apply
          </Btn>
        </div>
      ) : null}
    </div>
  );
}
