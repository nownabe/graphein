import { describe, expect, it } from "bun:test";
import {
  computePeriod,
  navigatePeriod,
  parseDateInTimezone,
  formatDateInTimezone,
  formatPeriodLabel,
} from "./period";

const TZ = "Asia/Tokyo"; // UTC+9

function formatInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

describe("computePeriod", () => {
  it("returns correct day boundaries for Asia/Tokyo", () => {
    // 2026-04-13 in Tokyo
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const { start, end } = computePeriod("day", anchor, TZ);

    // Start should be 2026-04-13 00:00:00 JST = 2026-04-12 15:00:00 UTC
    expect(formatInTz(start, TZ)).toContain("2026-04-13");
    expect(formatInTz(start, TZ)).toContain("00:00");

    // End should be 2026-04-14 00:00:00 JST
    expect(formatInTz(end, TZ)).toContain("2026-04-14");
    expect(formatInTz(end, TZ)).toContain("00:00");
  });

  it("returns correct week boundaries (Monday-Sunday)", () => {
    // 2026-04-15 is a Wednesday
    const anchor = new Date("2026-04-15T10:00:00+09:00");
    const { start, end } = computePeriod("week", anchor, TZ);

    // Monday = 2026-04-13
    expect(formatInTz(start, TZ)).toContain("2026-04-13");
    // End = Monday next week = 2026-04-20
    expect(formatInTz(end, TZ)).toContain("2026-04-20");
  });

  it("handles Sunday correctly for week boundaries", () => {
    // 2026-04-19 is a Sunday
    const anchor = new Date("2026-04-19T10:00:00+09:00");
    const { start, end } = computePeriod("week", anchor, TZ);

    // Monday = 2026-04-13
    expect(formatInTz(start, TZ)).toContain("2026-04-13");
    expect(formatInTz(end, TZ)).toContain("2026-04-20");
  });

  it("returns correct month boundaries", () => {
    const anchor = new Date("2026-04-15T10:00:00+09:00");
    const { start, end } = computePeriod("month", anchor, TZ);

    expect(formatInTz(start, TZ)).toContain("2026-04-01");
    expect(formatInTz(end, TZ)).toContain("2026-05-01");
  });

  it("returns correct quarter boundaries for Q2", () => {
    const anchor = new Date("2026-05-15T10:00:00+09:00");
    const { start, end } = computePeriod("quarter", anchor, TZ);

    expect(formatInTz(start, TZ)).toContain("2026-04-01");
    expect(formatInTz(end, TZ)).toContain("2026-07-01");
  });

  it("returns correct quarter boundaries for Q4", () => {
    const anchor = new Date("2026-12-15T10:00:00+09:00");
    const { start, end } = computePeriod("quarter", anchor, TZ);

    expect(formatInTz(start, TZ)).toContain("2026-10-01");
    expect(formatInTz(end, TZ)).toContain("2027-01-01");
  });

  it("returns correct year boundaries", () => {
    const anchor = new Date("2026-06-15T10:00:00+09:00");
    const { start, end } = computePeriod("year", anchor, TZ);

    expect(formatInTz(start, TZ)).toContain("2026-01-01");
    expect(formatInTz(end, TZ)).toContain("2027-01-01");
  });

  it("returns correct fiscal quarter boundaries when Q1 starts in April", () => {
    // May 2026 should be in fiscal Q1 (Apr-Jun) when fiscal year starts in April
    const anchor = new Date("2026-05-15T10:00:00+09:00");
    const { start, end } = computePeriod("quarter", anchor, TZ, 4);

    expect(formatInTz(start, TZ)).toContain("2026-04-01");
    expect(formatInTz(end, TZ)).toContain("2026-07-01");
  });

  it("returns correct fiscal Q4 when Q1 starts in April", () => {
    // February 2026 should be in fiscal Q4 (Jan-Mar) when fiscal year starts in April
    const anchor = new Date("2026-02-15T10:00:00+09:00");
    const { start, end } = computePeriod("quarter", anchor, TZ, 4);

    expect(formatInTz(start, TZ)).toContain("2026-01-01");
    expect(formatInTz(end, TZ)).toContain("2026-04-01");
  });

  it("returns correct fiscal Q3 when Q1 starts in April", () => {
    // November 2026 should be in fiscal Q3 (Oct-Dec) when fiscal year starts in April
    const anchor = new Date("2026-11-15T10:00:00+09:00");
    const { start, end } = computePeriod("quarter", anchor, TZ, 4);

    expect(formatInTz(start, TZ)).toContain("2026-10-01");
    expect(formatInTz(end, TZ)).toContain("2027-01-01");
  });

  it("handles December month boundary (cross-year)", () => {
    const anchor = new Date("2026-12-15T10:00:00+09:00");
    const { start, end } = computePeriod("month", anchor, TZ);

    expect(formatInTz(start, TZ)).toContain("2026-12-01");
    expect(formatInTz(end, TZ)).toContain("2027-01-01");
  });
});

describe("navigatePeriod", () => {
  it("navigates day forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("day", anchor, TZ, "next");
    expect(formatDateInTimezone(next, TZ)).toBe("2026-04-14");
  });

  it("navigates day backward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const prev = navigatePeriod("day", anchor, TZ, "prev");
    expect(formatDateInTimezone(prev, TZ)).toBe("2026-04-12");
  });

  it("navigates week forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("week", anchor, TZ, "next");
    expect(formatDateInTimezone(next, TZ)).toBe("2026-04-20");
  });

  it("navigates month forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("month", anchor, TZ, "next");
    expect(formatDateInTimezone(next, TZ)).toBe("2026-05-01");
  });

  it("navigates month backward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const prev = navigatePeriod("month", anchor, TZ, "prev");
    expect(formatDateInTimezone(prev, TZ)).toBe("2026-03-01");
  });

  it("navigates quarter forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("quarter", anchor, TZ, "next");
    expect(formatDateInTimezone(next, TZ)).toBe("2026-07-01");
  });

  it("navigates year forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("year", anchor, TZ, "next");
    expect(formatDateInTimezone(next, TZ)).toBe("2027-01-01");
  });
});

describe("parseDateInTimezone", () => {
  it("parses YYYY-MM-DD as midnight in the target timezone", () => {
    const date = parseDateInTimezone("2026-04-13", TZ);
    // Should be midnight JST = 2026-04-12T15:00:00Z
    expect(formatInTz(date, TZ)).toContain("2026-04-13");
    expect(formatInTz(date, TZ)).toContain("00:00");
  });

  it("does not shift date for negative-offset timezones", () => {
    const la = "America/Los_Angeles"; // UTC-7
    const date = parseDateInTimezone("2026-04-13", la);
    // Should be midnight PDT = 2026-04-13T07:00:00Z
    expect(formatInTz(date, la)).toContain("2026-04-13");
    expect(formatInTz(date, la)).toContain("00:00");

    // computePeriod should return April 13 boundaries
    const { start } = computePeriod("day", date, la);
    expect(formatInTz(start, la)).toContain("2026-04-13");
  });
});

describe("formatPeriodLabel", () => {
  it("shows fiscal year for Q4 when fiscal year starts in April", () => {
    // Feb 2027 is fiscal Q4 of FY2026 (Apr 2026 - Mar 2027)
    const anchor = new Date("2027-02-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 4);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 4);
    expect(label).toBe("Q4 2026");
  });

  it("shows fiscal year for Q1 when fiscal year starts in April", () => {
    // May 2026 is fiscal Q1 of FY2026 (Apr 2026 - Mar 2027)
    const anchor = new Date("2026-05-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 4);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 4);
    expect(label).toBe("Q1 2026");
  });

  it("shows fiscal year for Q3 when fiscal year starts in April", () => {
    // Nov 2026 is fiscal Q3 of FY2026
    const anchor = new Date("2026-11-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 4);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 4);
    expect(label).toBe("Q3 2026");
  });

  it("shows calendar year when fiscal year starts in January", () => {
    // Default (Jan start) — Q2 2026
    const anchor = new Date("2026-05-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 1);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 1);
    expect(label).toBe("Q2 2026");
  });

  it("shows fiscal year for March (Q4 boundary) when fiscal year starts in April", () => {
    // March 2027 is still fiscal Q4 of FY2026
    const anchor = new Date("2027-03-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 4);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 4);
    expect(label).toBe("Q4 2026");
  });

  it("shows end year when fiscalYearLabel is 'end' with July start", () => {
    // Oct 2025 is Q2 of FY starting Jul 2025, labeled by end year = 2026
    const anchor = new Date("2025-10-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 7);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 7, "end");
    expect(label).toBe("Q2 2026");
  });

  it("shows start year when fiscalYearLabel is 'start' with July start", () => {
    // Oct 2025 is Q2 of FY starting Jul 2025, labeled by start year = 2025
    const anchor = new Date("2025-10-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 7);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 7, "start");
    expect(label).toBe("Q2 2025");
  });

  it("shows end year for Q4 with July start", () => {
    // Apr 2026 is Q4 of FY Jul 2025 - Jun 2026, end year = 2026
    const anchor = new Date("2026-04-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 7);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 7, "end");
    expect(label).toBe("Q4 2026");
  });

  it("does not add 1 when fiscalYearLabel is 'end' with January start", () => {
    // Jan start means start year = end year, so 'end' should not change anything
    const anchor = new Date("2026-05-15T10:00:00+09:00");
    const period = computePeriod("quarter", anchor, TZ, 1);
    const label = formatPeriodLabel("quarter", period, TZ, "en", 1, "end");
    expect(label).toBe("Q2 2026");
  });
});

describe("formatDateInTimezone", () => {
  it("formats in the target timezone, not UTC", () => {
    // 2026-04-13T02:00:00Z = April 13 11:00 JST, but April 12 7PM PDT
    const date = new Date("2026-04-13T02:00:00Z");
    expect(formatDateInTimezone(date, TZ)).toBe("2026-04-13");
    expect(formatDateInTimezone(date, "America/Los_Angeles")).toBe("2026-04-12");
  });
});
