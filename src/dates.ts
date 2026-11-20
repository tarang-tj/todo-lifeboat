/** Graph dateTime strings are local to a timeZone; we only ever slice them, never convert. */

export function datePart(dateTime: string | null): string | null {
  if (!dateTime) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(dateTime);
  return m ? (m[1] as string) : null;
}

/** True when the time-of-day is not midnight (so a date-only destination drops information). */
export function hasTimeOfDay(dateTime: string | null): boolean {
  if (!dateTime) return false;
  const m = /T(\d{2}):(\d{2}):(\d{2})/.exec(dateTime);
  return !!m && (m[1] !== "00" || m[2] !== "00" || m[3] !== "00");
}

/** `2026-12-01T09:30:00.0000000` -> `2026-12-01T09:30:00` */
export function trimToSeconds(dateTime: string): string {
  return dateTime.slice(0, 19);
}
