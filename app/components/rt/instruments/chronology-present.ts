import type { ConstraintStatus } from "@shared/investigation";

import type { OrderingConstraint, PlacedEvent } from "../../../../server/lib/engine/chronology";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const INACTIVE = new Set(["rejected", "refuted", "superseded"]);

export const CHRONOLOGY_MODES = ["sequence", "relationships", "time"] as const;
export type ChronologyMode = (typeof CHRONOLOGY_MODES)[number];

export type EventTone = "conflict" | "uncertain" | "proposed";

export interface EventSignals {
  constraints: OrderingConstraint[];
  contradicted: boolean;
  disputed: boolean;
  reviewFlag: boolean;
  proposed: boolean;
}

export interface SequenceNote {
  id: string;
  code: string;
  label: string;
  body: string;
  status: string;
  /** Placed event this note follows. Null keeps it after the sequence. */
  afterEventId: string | null;
  relatedEventIds: string[];
  eventCodes: string[];
}

export const ORDER_STATUS_LABEL: Record<ConstraintStatus, string> = {
  consistent: "Time agrees",
  violated: "Time conflicts",
  uncertain: "Within uncertainty",
  unplaced: "Time unknown",
};

export function chronologyMode(value: string | null | undefined): ChronologyMode {
  return (CHRONOLOGY_MODES as readonly string[]).includes(value ?? "") ? (value as ChronologyMode) : "sequence";
}

export function parseSpanParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function resolveSpanIds(tokens: string[], items: Array<{ id: string; code: string }>): string[] {
  return tokens.map((token) => items.find((item) => item.id === token || item.code === token)?.id ?? token);
}

/** Inclusive corrected-time window between two placed events. A partial or unknown pair does not narrow the sequence. */
export function eventsWithinSpan(
  events: PlacedEvent[],
  endpointIds: string[],
): { events: PlacedEvent[]; endpoints: [PlacedEvent, PlacedEvent] | null } {
  if (endpointIds.length < 2 || endpointIds[0] === endpointIds[1]) return { events, endpoints: null };
  const first = events.find((event) => event.id === endpointIds[0]);
  const second = events.find((event) => event.id === endpointIds[1]);
  if (!first || !second) return { events, endpoints: null };
  const start = Math.min(first.correctedMinutes, second.correctedMinutes);
  const end = Math.max(first.correctedMinutes, second.correctedMinutes);
  const endpoints: [PlacedEvent, PlacedEvent] = first.correctedMinutes <= second.correctedMinutes ? [first, second] : [second, first];
  return {
    events: events.filter((event) => event.correctedMinutes >= start && event.correctedMinutes <= end),
    endpoints,
  };
}

export function formatEventDay(iso: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso.slice(0, 10);
  const month = MONTHS[Number(match[2]) - 1] ?? match[2];
  const day = String(Number(match[3]));
  return withYear ? `${month} ${day}, ${match[1]}` : `${month} ${day}`;
}

export function formatEventTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return "";
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

export function formatMinuteGap(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${sign}${abs} min`;
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  const parts = [days ? `${days} d` : "", hours ? `${hours} h` : "", mins ? `${mins} min` : ""].filter(Boolean);
  return `${sign}${parts.join(" ") || "0 min"}`;
}

export function groupByDay(events: PlacedEvent[]): Array<{ key: string; label: string; events: PlacedEvent[] }> {
  const years = new Set(events.map((event) => event.correctedTime.slice(0, 4)));
  const withYear = years.size > 1;
  const groups: Array<{ key: string; label: string; events: PlacedEvent[] }> = [];
  for (const event of events) {
    const key = event.correctedTime.slice(0, 10);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, label: formatEventDay(event.correctedTime, withYear), events: [event] });
    else last.events.push(event);
  }
  return groups;
}

export function eventTone(event: PlacedEvent, signals: EventSignals): EventTone | null {
  const related = signals.constraints.filter((constraint) => constraint.beforeId === event.id || constraint.afterId === event.id);
  if (related.some((constraint) => constraint.status === "violated") || signals.contradicted) return "conflict";
  if (
    event.uncertaintyMin > 0 ||
    related.some((constraint) => constraint.status === "uncertain" || constraint.status === "unplaced") ||
    signals.disputed ||
    signals.reviewFlag
  ) {
    return "uncertain";
  }
  if (signals.proposed) return "proposed";
  return null;
}

/** A correction, a conflict, recorded uncertainty, or an open review flag. Proposal alone is not enough. */
export function isSignificant(event: PlacedEvent, signals: EventSignals): boolean {
  const tone = eventTone(event, signals);
  return tone === "conflict" || tone === "uncertain" || event.appliedOffset !== 0;
}

export function orderingBetween(constraints: OrderingConstraint[], a: string, b: string): OrderingConstraint | null {
  return constraints.find((constraint) => (constraint.beforeId === a && constraint.afterId === b) || (constraint.beforeId === b && constraint.afterId === a)) ?? null;
}

function constraintPhrase(status: ConstraintStatus): string {
  switch (status) {
    case "consistent":
      return "agrees with these corrected times";
    case "violated":
      return "conflicts with these corrected times";
    case "uncertain":
      return "is not established by these corrected times";
    case "unplaced":
      return "cannot be checked because a time is missing";
  }
}

/** What the corrected timestamps say about two events. This is a time relation, not a claim that one caused the other. */
export function describeTemporalRelation(
  a: PlacedEvent,
  b: PlacedEvent,
  constraint?: OrderingConstraint | null,
): { text: string; tone: "neutral" | "uncertain" | "conflict" } {
  const [earlier, later] = a.correctedMinutes <= b.correctedMinutes ? [a, b] : [b, a];
  const gap = later.correctedMinutes - earlier.correctedMinutes;
  const tolerance = a.uncertaintyMin + b.uncertaintyMin;
  const within = gap <= tolerance;
  let text = within
    ? gap === 0
      ? `${earlier.label} and ${later.label} share a corrected time${tolerance ? ` (uncertainty ±${tolerance} min)` : ""}, so their order is not established.`
      : `${earlier.label} and ${later.label} are ${formatMinuteGap(gap)} apart on corrected time, inside ±${tolerance} min of uncertainty, so their order is not established.`
    : `${earlier.label} is ${formatMinuteGap(gap)} before ${later.label} on corrected time.`;
  let tone: "neutral" | "uncertain" | "conflict" = within ? "uncertain" : "neutral";
  if (constraint && (constraint.beforeId === a.id || constraint.beforeId === b.id) && (constraint.afterId === a.id || constraint.afterId === b.id)) {
    text += ` Asserted ordering ${constraint.code} ${constraintPhrase(constraint.status)}.`;
    if (constraint.status === "violated") tone = "conflict";
    else if (constraint.status === "uncertain" || constraint.status === "unplaced") tone = "uncertain";
  }
  return { text, tone };
}

/**
 * Questions the investigation actually recorded, placed after the earliest related event.
 * Silence is not turned into an event, and the note stays unresolved.
 */
export function unresolvedNotes(input: {
  questions: Array<{ id: string; code: string; label: string; body: string; status: string }>;
  links: Array<{ fromId: string; toId: string; status: string }>;
  placed: Array<{ id: string; code: string; correctedMinutes: number }>;
  scopeIds: Set<string>;
  boundIds: Set<string>;
}): SequenceNote[] {
  const placedById = new Map(input.placed.map((event) => [event.id, event]));
  const notes: SequenceNote[] = [];
  for (const question of input.questions) {
    if (INACTIVE.has(question.status)) continue;
    const related = new Set<string>();
    for (const link of input.links) {
      if (INACTIVE.has(link.status)) continue;
      const other = link.fromId === question.id ? link.toId : link.toId === question.id ? link.fromId : null;
      if (other && input.scopeIds.has(other)) related.add(other);
    }
    if (!related.size && !input.boundIds.has(question.id)) continue;
    const placedRelated = [...related]
      .map((id) => placedById.get(id))
      .filter((event): event is NonNullable<typeof event> => !!event)
      .sort((a, b) => a.correctedMinutes - b.correctedMinutes || a.code.localeCompare(b.code));
    notes.push({
      id: question.id,
      code: question.code,
      label: question.label,
      body: question.body,
      status: question.status,
      afterEventId: placedRelated[0]?.id ?? null,
      relatedEventIds: [...related],
      eventCodes: placedRelated.map((event) => event.code),
    });
  }
  return notes;
}
