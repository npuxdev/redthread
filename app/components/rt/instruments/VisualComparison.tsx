import { Cross2Icon, Pencil1Icon } from "@radix-ui/react-icons";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { InstrumentRow } from "@shared/investigation";

import type { Readout } from "../../../../server/lib/readout";
import { useRtAction, useWorkbenchParams, type Workspace } from "../lib";
import { Btn, Code, inputClass, Kicker, SectionHead } from "../ui";

type VisualReadout = Extract<Readout, { method: "visual_comparison" }>;
type Region = { x: number; y: number; w: number; h: number };

export function VisualComparisonInstrument({ ws, instrument, readout }: { ws: Workspace; instrument: InstrumentRow; readout: VisualReadout }) {
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [reveal, setReveal] = useState(50);
  const [draft, setDraft] = useState<{ sourceId: string; region: Region } | null>(null);
  const images = readout.images.map((img) => ({ ...img, src: ws.sources.find((s) => s.id === img.id)?.content ?? "" }));
  const [a, b] = images;
  if (!a || !b) return <div className="p-8 text-sm text-muted-foreground">Bind two image sources to compare.</div>;

  return (
    <div className="flex min-h-0 flex-col">
      <SectionHead title="Compare" hint="Drag on an image to mark a region, then record what you see." className="px-5">
        <div className="flex overflow-hidden rounded-[5px] border border-border text-[11.5px]">
          {(["side", "overlay"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("px-2.5 py-1", mode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              {m === "side" ? "Side by side" : "Overlay"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          Zoom
          <input type="range" min={1} max={5} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-[hsl(var(--primary))]" />
          <span className="rt-mono w-8 text-[10.5px]">{zoom.toFixed(2)}×</span>
        </label>
        {mode === "overlay" ? (
          <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            Reveal
            <input type="range" min={0} max={100} value={reveal} onChange={(e) => setReveal(Number(e.target.value))} className="w-36 accent-[hsl(var(--primary))]" />
          </label>
        ) : null}
      </SectionHead>

      {mode === "side" ? (
        <div className="grid grid-cols-2 gap-px bg-border">
          {[a, b].map((img) => (
            <ImagePane
              key={img.id}
              img={img}
              zoom={zoom}
              origin={origin}
              onOrigin={setOrigin}
              observations={readout.observations.filter((o) => o.sourceId === img.id)}
              draft={draft?.sourceId === img.id ? draft.region : null}
              onRegion={(region) => setDraft({ sourceId: img.id, region })}
            />
          ))}
        </div>
      ) : (
        <div className="relative bg-[hsl(var(--muted))]">
          <ImagePane img={b} zoom={zoom} origin={origin} onOrigin={setOrigin} observations={readout.observations.filter((o) => o.sourceId === b.id)} draft={draft?.sourceId === b.id ? draft.region : null} onRegion={(region) => setDraft({ sourceId: b.id, region })} />
          <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
            <ImagePane img={a} zoom={zoom} origin={origin} observations={[]} draft={null} />
          </div>
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary" style={{ left: `${reveal}%` }} />
        </div>
      )}

      {draft ? <ObservationForm ws={ws} instrument={instrument} draft={draft} others={images.filter((i) => i.id !== draft.sourceId)} onDone={() => setDraft(null)} /> : null}

      <ObservationList readout={readout} ws={ws} />
    </div>
  );
}

function ImagePane({
  img,
  zoom,
  origin,
  onOrigin,
  observations,
  draft,
  onRegion,
}: {
  img: { id: string; code: string; title: string; src: string; provenance: Record<string, unknown> };
  zoom: number;
  origin: { x: number; y: number };
  onOrigin?: (o: { x: number; y: number }) => void;
  observations: VisualReadout["observations"];
  draft: Region | null;
  onRegion?: (r: Region) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Region | null>(null);
  const { set } = useWorkbenchParams();

  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) };
  };
  const toRegion = (p: { x: number; y: number }, q: { x: number; y: number }): Region => ({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x), h: Math.abs(p.y - q.y) });
  const shown = live ?? draft;

  return (
    <div className="bg-card">
      <div className="flex items-baseline gap-2 px-4 py-2">
        <Code>{img.code}</Code>
        <span className="truncate text-[12px] font-medium">{img.title}</span>
        {img.provenance.date ? <span className="rt-mono text-[10.5px] text-muted-foreground">{String(img.provenance.date)}</span> : null}
      </div>
      <div
        className="relative aspect-[4/3] cursor-crosshair overflow-hidden bg-[hsl(var(--muted))]"
        onWheel={(e) => {
          if (!onOrigin || zoom === 1) return;
          const r = e.currentTarget.getBoundingClientRect();
          onOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
      >
        <div ref={box} className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%`, transition: "transform 240ms var(--rt-ease)" }}
          onPointerDown={(e) => {
            if (!onRegion) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            start.current = point(e);
          }}
          onPointerMove={(e) => start.current && setLive(toRegion(start.current, point(e)))}
          onPointerUp={(e) => {
            if (!start.current || !onRegion) return;
            const r = toRegion(start.current, point(e));
            start.current = null;
            setLive(null);
            if (r.w > 0.01 && r.h > 0.01) onRegion(r);
          }}
        >
          <img src={img.src} alt={img.title} draggable={false} className="h-full w-full select-none object-contain" />
          {observations.map((o) => {
            const r = o.region as Region | null;
            if (!r) return null;
            return (
              <button
                key={o.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => set({ sel: o.id })}
                className="absolute border-[1.5px] border-primary bg-[hsl(var(--primary)/0.08)]"
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                title={o.label}
              >
                <span className="rt-mono absolute -top-4 left-0 rounded-sm bg-primary px-1 text-[9.5px] text-primary-foreground">{o.code}</span>
              </button>
            );
          })}
          {shown ? (
            <div className="rt-dashed pointer-events-none absolute border-[1.5px] border-[hsl(var(--rt-evidence))] bg-[hsl(var(--rt-evidence)/0.08)]" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ObservationForm({
  ws,
  instrument,
  draft,
  others,
  onDone,
}: {
  ws: Workspace;
  instrument: InstrumentRow;
  draft: { sourceId: string; region: Region };
  others: Array<{ id: string; code: string }>;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [both, setBoth] = useState(true);
  const record = useRtAction("record-artifacts");
  const code = ws.sources.find((s) => s.id === draft.sourceId)?.code;
  const save = async () => {
    if (!label.trim()) return;
    const citations = [{ sourceId: draft.sourceId, region: draft.region }, ...(both ? others.map((o) => ({ sourceId: o.id, region: draft.region, note: "Same region compared" })) : [])];
    const ok = await record.run({
      investigationId: ws.investigation.id,
      artifacts: [{ type: "observation", label: label.trim(), body: body.trim() || undefined, epistemic: "observation", citations }],
      reason: `Visual observation in ${instrument.code}`,
    });
    if (ok) onDone();
  };
  return (
    <div className="rt-arrive flex flex-wrap items-end gap-3 border-y border-border bg-[hsl(var(--primary)/0.04)] px-5 py-3">
      <div className="min-w-[260px] flex-1">
        <Kicker>Observation on {code}</Kicker>
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What do you see in this region?" className={cn(inputClass, "mt-1")} />
      </div>
      <div className="min-w-[220px] flex-1">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Detail or caveat (lighting, angle, resolution)" className={inputClass} />
      </div>
      {others.length ? (
        <label className="flex items-center gap-1.5 pb-1.5 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          Same region on {others.map((o) => o.code).join(", ")}
        </label>
      ) : null}
      <Btn tone="primary" onClick={save} disabled={!label.trim() || record.pending}>
        <Pencil1Icon />
        Record observation
      </Btn>
      <Btn tone="ghost" onClick={onDone}>
        <Cross2Icon />
        Cancel
      </Btn>
    </div>
  );
}

function ObservationList({ readout, ws }: { readout: VisualReadout; ws: Workspace }) {
  const { set } = useWorkbenchParams();
  const seen = new Set<string>();
  const unique = readout.observations.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  const code = new Map(ws.sources.map((s) => [s.id, s.code]));
  return (
    <div className="border-t border-border">
      <SectionHead title="Recorded observations" count={unique.length} className="px-5" />
      {unique.length ? (
        <div className="grid gap-1.5 px-5 py-3">
          {unique.map((o) => (
            <button key={o.id} onClick={() => set({ sel: o.id })} className="flex items-baseline gap-2 text-left text-[12.5px] hover:text-primary">
              <Code>{o.code}</Code>
              <span>{o.label}</span>
              <span className="rt-mono text-[10px] text-muted-foreground">{code.get(o.sourceId)} · {o.createdBy === "human" ? "investigator" : o.createdBy}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-5 py-3 text-[12px] text-muted-foreground">None yet. A visible difference is a reason to investigate. It does not by itself establish what caused it.</p>
      )}
    </div>
  );
}
