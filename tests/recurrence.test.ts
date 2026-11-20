import { describe, expect, it } from "vitest";
import { mapTask } from "../src/mapper";
import { recurrenceToText, recurrenceToTodoist } from "../src/recurrence";
import { rec } from "./fixtures";
import type { GraphRecurrence } from "../src/graph-types";

const r = (g: GraphRecurrence) => {
  const t = mapTask({ id: "x", recurrence: g }, "L").recurrence;
  if (!t) throw new Error("fixture did not map");
  return t;
};

describe("recurrenceToTodoist", () => {
  it.each([
    ["daily", rec.daily, "every day"],
    ["every 3 days", rec.every3Days, "every 3 days"],
    ["weekly on one day", rec.weeklyMonday, "every monday"],
    ["every 2 weeks, days sorted", rec.biweeklyMonWed, "every 2 weeks on monday, wednesday"],
    ["monthly on the 15th", rec.monthly15, "every 15th"],
    ["2nd thursday monthly", rec.secondThursday, "every 2nd thursday"],
    ["last friday monthly", rec.lastFriday, "every last friday"],
    ["yearly on March 15", rec.yearlyMarch15, "every march 15"],
  ])("%s", (_n, g, want) => expect(recurrenceToTodoist(r(g))).toBe(want));

  it("weekly on all seven days is every day", () => {
    const all = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    expect(recurrenceToTodoist(r({ pattern: { type: "weekly", interval: 1, daysOfWeek: all }, range: { type: "noEnd" } }))).toBe("every day");
  });

  it.each([
    ["quarterly", rec.quarterly15],
    ["every other year", rec.everyOtherYear],
    ["relative yearly", rec.relYearly],
    ["has an end date", rec.dailyUntil],
    ["numbered occurrences", rec.tenTimes],
    ["weekly with no days", { pattern: { type: "weekly", interval: 1 }, range: { type: "noEnd" } }],
  ])("unsupported: %s", (_n, g) => expect(recurrenceToTodoist(r(g))).toBeNull());
});

describe("recurrenceToText", () => {
  it.each([
    [rec.daily, "Repeats every day"],
    [rec.every3Days, "Repeats every 3 days"],
    [rec.biweeklyMonWed, "Repeats every 2 weeks on Monday, Wednesday"],
    [rec.quarterly15, "Repeats every 3 months on day 15"],
    [rec.secondThursday, "Repeats every month on the 2nd Thursday"],
    [rec.yearlyMarch15, "Repeats every year on March 15"],
    [rec.everyOtherYear, "Repeats every 2 years on March 15"],
    [rec.relYearly, "Repeats every year on the 4th Thursday of November"],
    [rec.dailyUntil, "Repeats every day, until 2026-12-31"],
    [rec.tenTimes, "Repeats every day, 10 times"],
  ])("describes %#", (g, want) => expect(recurrenceToText(r(g))).toBe(want));
});
