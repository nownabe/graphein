import { describe, expect, it } from "bun:test";
import { computePeriod, navigatePeriod, formatPeriodLabel } from "./period";

const TZ = "Asia/Tokyo"; // UTC+9

function toTzDate(isoStr: string): Date {
  return new Date(isoStr);
}

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
    expect(next.getDate()).toBe(14);
  });

  it("navigates day backward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const prev = navigatePeriod("day", anchor, TZ, "prev");
    expect(prev.getDate()).toBe(12);
  });

  it("navigates week forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("week", anchor, TZ, "next");
    expect(next.getDate()).toBe(20);
  });

  it("navigates month forward", () => {
    const anchor = new Date("2026-04-13T10:00:00+09:00");
    const next = navigatePeriod("month", anchor, TZ, "next");
    expect(next.getMonth()).toBe(4); // May (0-indexed)
  });
});
