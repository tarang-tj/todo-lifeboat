import type { DayName, Recurrence } from "./model";

const DAY_ORDER: DayName[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december"];
const ORD = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", last: "last" } as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
function sortedDays(r: Recurrence): DayName[] {
  return [...new Set(r.daysOfWeek)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}
function every(n: number, unit: string): string {
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}
function rangeText(r: Recurrence): string {
  if (r.rangeType === "endDate" && r.endDate) return `, until ${r.endDate}`;
  if (r.rangeType === "numbered" && r.numberOfOccurrences) return `, ${r.numberOfOccurrences} times`;
  return "";
}

/** Plain-English description, always available. Used when a destination cannot hold the rule. */
export function recurrenceToText(r: Recurrence): string {
  const days = sortedDays(r).map(cap).join(", ");
  let core: string;
  switch (r.type) {
    case "daily":
      core = every(r.interval, "day");
      break;
    case "weekly":
      core = `${every(r.interval, "week")}${days ? ` on ${days}` : ""}`;
      break;
    case "absoluteMonthly":
      core = `${every(r.interval, "month")} on day ${r.dayOfMonth ?? "?"}`;
      break;
    case "relativeMonthly":
      core = `${every(r.interval, "month")} on the ${r.index ? ORD[r.index] : "1st"} ${days}`;
      break;
    case "absoluteYearly":
      core = `${every(r.interval, "year")} on ${cap(MONTHS[(r.month ?? 1) - 1] ?? "?")} ${r.dayOfMonth ?? "?"}`;
      break;
    case "relativeYearly":
      core = `${every(r.interval, "year")} on the ${r.index ? ORD[r.index] : "1st"} ${days} of ${cap(MONTHS[(r.month ?? 1) - 1] ?? "?")}`;
      break;
  }
  return `Repeats ${core}${rangeText(r)}`;
}

/**
 * Todoist due_string when the rule maps onto phrases Todoist documents by example.
 * Returns null when it does not (intervals > 1 on month/year, multi-day relative rules, bounded ranges).
 * UNVERIFIED against the live parser: see docs/api-notes.md.
 */
export function recurrenceToTodoist(r: Recurrence): string | null {
  if (r.rangeType !== "noEnd") return null;
  const days = sortedDays(r);
  switch (r.type) {
    case "daily":
      return every(r.interval, "day");
    case "weekly": {
      if (days.length === 0) return null;
      if (r.interval === 1) return days.length === 7 ? "every day" : `every ${days.join(", ")}`;
      return `every ${r.interval} weeks on ${days.join(", ")}`;
    }
    case "absoluteMonthly":
      return r.interval === 1 && r.dayOfMonth ? `every ${ordinal(r.dayOfMonth)}` : null;
    case "relativeMonthly":
      if (r.interval !== 1 || days.length !== 1) return null;
      return `every ${r.index ? ORD[r.index] : "1st"} ${days[0]}`;
    case "absoluteYearly": {
      const month = MONTHS[(r.month ?? 0) - 1];
      return r.interval === 1 && month && r.dayOfMonth ? `every ${month} ${r.dayOfMonth}` : null;
    }
    case "relativeYearly":
      return null;
  }
}
