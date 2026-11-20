/**
 * Graph returns dateTimeTimeZone values in the zone we ask for. To Do stores a date-only due date as
 * midnight UTC, so in a zone west of UTC it comes back as the previous evening. This restores the date.
 */

function offsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - utcMs;
}

/** Wall-clock time in an IANA zone to a UTC instant. Throws RangeError for zones Intl does not know. */
export function wallToUtcMs(dateTime: string, zone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dateTime);
  if (!m) throw new RangeError(`Unparseable dateTime ${dateTime}`);
  const asUtc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  const first = asUtc - offsetMs(asUtc, zone);
  return asUtc - offsetMs(first, zone);
}

const isUtc = (z: string): boolean => /^(utc|etc\/utc|gmt|etc\/gmt)$/i.test(z.trim());

/**
 * Normalise a Graph due value to the intended local date.
 * Returns `YYYY-MM-DDT00:00:00.0000000` for a date-only due, else the wall-clock string unchanged.
 */
export function normalizeDue(dt: { dateTime: string; timeZone: string } | null | undefined): string | null {
  if (!dt?.dateTime) return null;
  if (isUtc(dt.timeZone ?? "UTC")) return dt.dateTime;
  try {
    const utc = new Date(wallToUtcMs(dt.dateTime, dt.timeZone));
    const midnight = utc.getUTCHours() === 0 && utc.getUTCMinutes() === 0 && utc.getUTCSeconds() === 0;
    if (midnight) return `${utc.toISOString().slice(0, 10)}T00:00:00.0000000`;
  } catch {
    // Zone name Intl cannot resolve (for example a Windows zone name): keep the wall-clock value.
  }
  return dt.dateTime;
}

export function userZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Header value asking Graph for dateTimeTimeZone values in this zone. */
export const preferTimezone = (zone: string): string => `outlook.timezone="${zone}"`;
