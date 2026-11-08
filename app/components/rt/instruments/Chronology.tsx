import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { InstrumentRow } from "@shared/investigation";

import type { PlacedEvent } from "../../../../server/lib/engine/chronology";
import { type Chronology as ChronologyData, formatClock, useRtAction, useWorkbenchParams, type Workspace } from "../lib";
import { Btn, Code, CONSTRAINT_TONE, inputClass, Kicker } from "../ui";

const LANE_H = 76;
const ROW_H = 17;
const MIN_GAP = 40;
const MAX_ROWS = 6;
const LABEL_W = 196;
const PAD = 28;
const TICKS = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 20160, 43200, 86400];

function fmtTick(minutes: number, range: number) {
  const d = new Date(minutes * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  if (range > 3 * 1440) return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  if (range > 1440) return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

type Window = "all" | "focus";

function densestDay(events: PlacedEvent[]) {
  const byDay = new Map<string, PlacedEvent[]>();
  for (const e of events) {
    const day = e.correctedTime.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  let best: PlacedEvent[] = [];
  for (const list of byDay.values()) if (list.length > best.length) best = list;
  return best;
}

export function ChronologyInstrument({ ws, instrument, data }: { ws: Workspace; instrument: InstrumentRow; data: ChronologyData }) {
  const { selected, set } = useWorkbenchParams();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const events = data.events;
  const fullSpan = useMemo(() => {
    const all = events.flatMap((e) => [e.correctedMinutes, e.sourceMinutes]);
    return all.length ? { start: Math.min(...all), end: Math.max(...all) } : null;
  }, [events]);
  const longSpan = fullSpan ? fullSpan.end - fullSpan.start > 36 * 60 : false;
  const [windowMode, setWindowMode] = useState<Window>(longSpan ? "focus" : "all");
  useEffect(() => {
    if (!longSpan) setWindowMode("all");
  }, [longSpan]);

  const span = useMemo(() => {
    if (!fullSpan) return null;
    let { start, end } = fullSpan;
    if (windowMode === "focus") {
      const day = densestDay(events).flatMap((e) => [e.correctedMinutes, e.sourceMinutes]);
      if (day.length) {
        start = Math.min(...day);
        end = Math.max(...day);
      }
    }
    const pad = Math.max((end - start) * 0.06, 5);
    return { start: start - pad, end: end + pad };
  }, [fullSpan, windowMode, events]);

  const lanes = useMemo(() => {
    const keys = new Set(data.clocks.map((c) => c.clockKey));
    return data.clocks.filter((c) => keys.has(c.clockKey));
  }, [data.clocks]);

  const plotW = Math.max(width - LABEL_W, 200);
  const x = (m: number) => (span ? PAD + ((m - span.start) / (span.end - span.start)) * (plotW - PAD * 2) : 0);
  const inView = (m: number) => !!span && m >= span.start && m <= span.end;

  // Markers stack into rows so codes never collide; each label gets only the
  // room left before the next marker in its row, and lanes grow to fit.
  const { layout, laneTops, laneHeights } = useMemo(() => {
    const pos = new Map<string, { lane: number; row: number; left: number; ghost: number; room: number }>();
    const heights: number[] = [];
    lanes.forEach((lane, li) => {
      const rows: Array<Array<{ id: string; left: number }>> = [];
      events
        .filter((e) => e.clockKey === lane.clockKey)
        .sort((a, b) => a.correctedMinutes - b.correctedMinutes)
        .forEach((e) => {
          const left = x(e.correctedMinutes);
          let row = rows.findIndex((r) => left - r[r.length - 1]!.left >= MIN_GAP);
          if (row === -1) {
            if (rows.length < MAX_ROWS) row = rows.push([]) - 1;
            else row = rows.reduce((best, r, i) => (r[r.length - 1]!.left < rows[best]![rows[best]!.length - 1]!.left ? i : best), 0);
          }
          rows[row]!.push({ id: e.id, left });
          pos.set(e.id, { lane: li, row, left, ghost: x(e.sourceMinutes), room: 0 });
        });
      for (const r of rows) {
        r.forEach((m, i) => {
          const next = r[i + 1];
          pos.get(m.id)!.room = Math.min(next ? next.left - m.left - 14 : plotW - m.left - 8, 190);
        });
      }
      heights.push(Math.max(LANE_H, 22 + rows.length * ROW_H + 14));
    });
    const tops = heights.reduce<number[]>((acc, _h, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + heights[i - 1]!], []);
    return { layout: pos, laneTops: tops, laneHeights: heights };
  }, [events, lanes, span, plotW]);

  // Stagger the reorganization by how far each event moved in order.
  const prevRank = useRef(new Map<string, number>());
  const delays = useMemo(() => {
    const d = new Map<string, number>();
    let n = 0;
    for (const e of events) {
      const p = prevRank.current.get(e.id);
      if (p !== undefined && p !== e.rank) d.set(e.id, (n++ % 8) * 70);
    }
    return d;
  }, [events]);
  useEffect(() => {
    prevRank.current = new Map(events.map((e) => [e.id, e.rank]));
  }, [events]);

  const prevStatus = useRef(new Map<string, string>());
  const flipped = useMemo(() => {
    const s = new Set<string>();
    for (const c of data.constraints) {
      const p = prevStatus.current.get(c.linkId);
      if (p && p !== c.status) s.add(c.linkId);
    }
    return s;
  }, [data.constraints]);
  useEffect(() => {
    prevStatus.current = new Map(data.constraints.map((c) => [c.linkId, c.status]));
  }, [data.constraints]);

  const yOf = (id: string) => {
    const p = layout.get(id);
    return p ? laneTops[p.lane]! + 22 + p.row * ROW_H : 0;
  };

  const ticks = useMemo(() => {
    if (!span) return [];
    const range = span.end - span.start;
    const step = TICKS.find((t) => range / t <= 9) ?? TICKS[TICKS.length - 1]!;
    const first = Math.ceil(span.start / step) * step;
    const out: number[] = [];
    for (let m = first; m <= span.end; m += step) out.push(m);
    return out;
  }, [span]);

  if (!events.length) {
    return <div className="p-8 text-sm text-muted-foreground">No events with parseable source times are bound to this chronology yet.</div>;
  }

  const plotH = laneHeights.reduce((a, b) => a + b, 0);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const visibleConstraints = data.constraints.filter((c) => c.status === "violated" || c.status === "uncertain");

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-2">
        <Kicker>Corrected time</Kicker>
        <span className="text-[11.5px] text-muted-foreground">
          Hollow ticks mark the time each source recorded. Filled markers sit at corrected time.
        </span>
        <div className="flex-1" />
        {longSpan ? (
          <div className="flex overflow-hidden rounded-[5px] border border-border text-[11.5px]">
            {(["focus", "all"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setWindowMode(m)}
                className={cn("px-2.5 py-1", windowMode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
              >
                {m === "focus" ? "Densest day" : "Full span"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={wrap} className="relative">
        <div className="flex">
          <div style={{ width: LABEL_W }} className="shrink-0 border-r border-border">
            {lanes.map((lane, i) => (
              <ClockControl key={lane.clockKey} ws={ws} instrument={instrument} clockKey={lane.clockKey} eventCount={lane.eventCount} height={laneHeights[i]!} />
            ))}
          </div>
          <div className="relative" style={{ width: plotW, height: plotH }}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 bottom-0 border-l border-dashed border-[hsl(var(--border))]" style={{ left: x(t) }} />
            ))}
            {lanes.map((lane, i) => (
              <div key={lane.clockKey} className="absolute left-0 right-0 border-b border-border" style={{ top: laneTops[i], height: laneHeights[i] }} />
            ))}
            <svg className="pointer-events-none absolute inset-0" width={plotW} height={plotH}>
              {events.map((e) => {
                const p = layout.get(e.id);
                if (!p || e.appliedOffset === 0 || !inView(e.sourceMinutes)) return null;
                const y = yOf(e.id) + 3;
                return <line key={`g-${e.id}`} x1={p.ghost} y1={y} x2={p.left} y2={y} stroke="hsl(var(--rt-evidence) / 0.45)" strokeWidth={1} strokeDasharray="2 3" className="rt-move" />;
              })}
              {visibleConstraints.map((c) => {
                const a = eventById.get(c.beforeId);
                const b = eventById.get(c.afterId);
                const pa = a && layout.get(a.id);
                const pb = b && layout.get(b.id);
                if (!pa || !pb) return null;
                const ya = yOf(a!.id) + 3;
                const yb = yOf(b!.id) + 3;
                const mid = Math.min(ya, yb) - 22;
                const violated = c.status === "violated";
                return (
                  <path
                    key={c.linkId}
                    d={`M ${pa.left} ${ya} C ${pa.left} ${mid}, ${pb.left} ${mid}, ${pb.left} ${yb}`}
                    fill="none"
                    strokeWidth={violated ? 1.6 : 1.2}
                    strokeDasharray={violated ? undefined : "4 3"}
                    stroke={violated ? "hsl(var(--rt-oxide))" : "hsl(var(--rt-unresolved) / 0.8)"}
                    className={cn("rt-arrive", flipped.has(c.linkId) && "rt-signal")}
                  />
                );
              })}
            </svg>
            {events.map((e) => {
              const p = layout.get(e.id);
              if (!p) return null;
              const y = yOf(e.id);
              const isSel = selected === e.id;
              const delay = delays.get(e.id) ?? 0;
              return (
                <div key={e.id}>
                  {e.appliedOffset !== 0 && inView(e.sourceMinutes) ? (
                    <div
                      className="rt-move absolute h-[7px] w-[7px] -translate-x-1/2 rounded-full border border-[hsl(var(--rt-evidence)/0.6)] bg-card"
                      style={{ left: p.ghost, top: y, ["--rt-delay" as string]: `${delay}ms` }}
                      title={`Recorded ${formatClock(e.sourceTime)}`}
                    />
                  ) : null}
                  <button
                    onClick={() => set({ sel: e.id })}
                    title={`${e.code} ${e.label}\nrecorded ${formatClock(e.sourceTime)} · corrected ${formatClock(e.correctedTime)}`}
                    className={cn(
                      "rt-move group absolute flex -translate-x-[4px] items-center gap-1.5 whitespace-nowrap",
                      !inView(e.correctedMinutes) && "opacity-0",
                    )}
                    style={{ left: p.left, top: y - 1, ["--rt-delay" as string]: `${delay}ms` }}
                  >
                    <span
                      className={cn(
                        "block h-[9px] w-[9px] rounded-full border-2 transition-colors",
                        e.status === "proposed" ? "border-[hsl(var(--rt-evidence))] bg-card" : "border-[hsl(var(--rt-evidence))] bg-[hsl(var(--rt-evidence))]",
                        isSel && "ring-2 ring-primary ring-offset-1",
                        e.uncertaintyMin > 0 && "rt-hatch",
                      )}
                    />
                    <span className={cn("truncate text-[11px] leading-none", isSel ? "text-primary" : "text-foreground/80 group-hover:text-foreground")} style={{ maxWidth: Math.max(p.room, 26) }}>
                      <span className="rt-mono mr-1 text-[10px] text-[hsl(var(--rt-evidence))]">{e.code}</span>
                      {p.room > 64 ? e.label : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex border-t border-border" style={{ paddingLeft: LABEL_W }}>
          <div className="relative h-6" style={{ width: plotW }}>
            {ticks.map((t) => (
              <span key={t} className="rt-mono absolute top-1 -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: x(t) }}>
                {span ? fmtTick(t, span.end - span.start) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-0 border-t border-border">
        <Orderings data={data} ws={ws} flipped={flipped} />
        <EventTable events={events} selected={selected} onSelect={(id) => set({ sel: id })} />
      </div>
    </div>
  );
}

function ClockControl({ ws, instrument, clockKey, eventCount, height }: { ws: Workspace; instrument: InstrumentRow; clockKey: string; eventCount: number; height: number }) {
  const assumption = ws.assumptions.find((a) => a.kind === "clock_offset" && a.active && a.value.clockKey === clockKey);
  const current = Number(assumption?.value.aheadMinutes ?? 0);
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

  return (
    <div className="flex flex-col justify-center gap-1 border-b border-border px-3" style={{ height }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="rt-mono truncate text-[11.5px] font-medium text-foreground" title={clockKey}>
          {clockKey}
        </span>
        <span className="text-[10.5px] text-muted-foreground">{eventCount} ev</span>
      </div>
      <div className="flex items-center gap-1">
        <button className="h-5 w-5 rounded border border-border text-[12px] leading-none text-muted-foreground hover:text-primary" onClick={() => setDraft(String(Math.max(magnitude - 1, 0)))} aria-label="Decrease offset">
          −
        </button>
        <input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && dirty && apply()}
          className="rt-mono h-5 w-10 rounded border border-border bg-card text-center text-[11px] outline-none focus:border-primary"
          aria-label={`${clockKey} offset in minutes`}
        />
        <button className="h-5 w-5 rounded border border-border text-[12px] leading-none text-muted-foreground hover:text-primary" onClick={() => setDraft(String(magnitude + 1))} aria-label="Increase offset">
          +
        </button>
        <span className="text-[10.5px] text-muted-foreground">min</span>
        <button
          onClick={() => setSlow((s) => !s)}
          className="rounded border border-border px-1 text-[10.5px] text-foreground hover:border-primary hover:text-primary"
          title="Toggle whether this clock runs fast or slow"
        >
          {slow ? "slow" : "fast"}
        </button>
        {assumption ? <Code className="ml-auto">{assumption.code}</Code> : null}
      </div>
      {dirty ? (
        <div className="flex items-center gap-1">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" className={cn(inputClass, "h-5 px-1.5 py-0 text-[11px]")} />
          <Btn size="sm" tone="primary" onClick={apply} disabled={setAssumption.pending}>
            Apply
          </Btn>
        </div>
      ) : assumption ? (
        <div className="truncate text-[10.5px] text-muted-foreground" title={assumption.rationale}>
          {assumption.createdBy === "agent" ? "Proposed by agent · " : ""}
          {assumption.rationale}
        </div>
      ) : null}
    </div>
  );
}

function Orderings({ data, ws, flipped }: { data: ChronologyData; ws: Workspace; flipped: Set<string> }) {
  const { set } = useWorkbenchParams();
  const code = new Map(ws.artifacts.map((a) => [a.id, a.code]));
  if (!data.constraints.length) {
    return (
      <div className="border-r border-border p-4">
        <Kicker>Asserted orderings</Kicker>
        <p className="mt-2 text-[12px] text-muted-foreground">
          No "precedes" links yet. Link two events with "precedes" to have the chronology test that claim against corrected time.
        </p>
      </div>
    );
  }
  return (
    <div className="max-h-[260px] overflow-auto border-r border-border">
      <div className="sticky top-0 bg-card px-4 py-2">
        <Kicker>Asserted orderings</Kicker>
      </div>
      {data.constraints.map((c) => (
        <button
          key={c.linkId}
          onClick={() => set({ sel: c.linkId })}
          className={cn("rt-move flex w-full items-start gap-3 border-t border-border px-4 py-2 text-left hover:bg-accent/60", flipped.has(c.linkId) && "rt-signal")}
        >
          <Code className="pt-0.5">{c.code}</Code>
          <div className="min-w-0 flex-1">
            <div className="rt-mono text-[11px] text-foreground">
              {code.get(c.beforeId)} <span className="text-muted-foreground">before</span> {code.get(c.afterId)}
            </div>
            <div className="truncate text-[11.5px] text-muted-foreground">{c.rationale}</div>
          </div>
          <div className="text-right">
            <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.06em]", CONSTRAINT_TONE[c.status])}>{c.status}</div>
            {c.gapMinutes !== null ? <div className="rt-mono text-[10px] text-muted-foreground">{c.gapMinutes > 0 ? "+" : ""}{Math.round(c.gapMinutes)} min</div> : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function EventTable({ events, selected, onSelect }: { events: PlacedEvent[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full text-[11.5px]">
        <thead className="sticky top-0 bg-card text-left">
          <tr className="text-muted-foreground">
            <th className="rt-kicker px-3 py-2">#</th>
            <th className="rt-kicker px-2 py-2">Event</th>
            <th className="rt-kicker px-2 py-2">Clock</th>
            <th className="rt-kicker px-2 py-2">Recorded</th>
            <th className="rt-kicker px-2 py-2">Corrected</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr
              key={e.id}
              onClick={() => onSelect(e.id)}
              className={cn("cursor-pointer border-t border-border hover:bg-accent/60", selected === e.id && "bg-[hsl(var(--primary)/0.06)]")}
            >
              <td className="whitespace-nowrap px-3 py-1.5">
                <Code>{e.code}</Code>
              </td>
              <td className="max-w-[220px] truncate px-2 py-1.5">{e.label}</td>
              <td className="rt-mono truncate px-2 py-1.5 text-[10.5px] text-muted-foreground">{e.clockKey}</td>
              <td className="rt-mono px-2 py-1.5 text-[10.5px] text-muted-foreground">{formatClock(e.sourceTime)}</td>
              <td className={cn("rt-mono px-2 py-1.5 text-[10.5px]", e.appliedOffset ? "font-semibold text-[hsl(var(--rt-evidence))]" : "text-muted-foreground")}>
                {formatClock(e.correctedTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
