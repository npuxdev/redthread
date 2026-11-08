/**
 * Wall-clock arithmetic on source timestamps. Source times are treated as
 * naive local times (no timezone conversion); everything is computed in
 * minutes since the epoch of that naive clock so offsets stay exact.
 */

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseLocalMinutes(value: string): number | null {
  const m = ISO_LOCAL.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (Number.isNaN(ms)) return null;
  return ms / 60000;
}

export function formatLocalMinutes(minutes: number): string {
  const d = new Date(Math.round(minutes * 60000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** A clock that reads `aheadMinutes` fast displays true time + aheadMinutes. */
export function correctedMinutes(sourceMinutes: number, aheadMinutes: number): number {
  return sourceMinutes - aheadMinutes;
}
