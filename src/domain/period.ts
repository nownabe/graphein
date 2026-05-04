export type PeriodType = "day" | "week" | "month" | "quarter" | "year";

export interface Period {
  start: Date;
  end: Date;
}

// Extract local date parts (year, month, day) from a UTC Date in a timezone.
function getLocalParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = Number(p.value);
        if (p.type === "month") acc.month = Number(p.value);
        if (p.type === "day") acc.day = Number(p.value);
        return acc;
      },
      { year: 0, month: 0, day: 0 },
    );
}

// Compute the start and end of a period for a given anchor date in a timezone.
// Returns UTC Date objects representing the boundaries.
// fiscalQuarterStartMonth (1-12) controls which month Q1 starts on.
export function computePeriod(
  type: PeriodType,
  anchor: Date,
  timezone: string,
  fiscalQuarterStartMonth = 1,
): Period {
  const parts = getLocalParts(anchor, timezone);

  let startLocal: { year: number; month: number; day: number };
  let endLocal: { year: number; month: number; day: number };

  switch (type) {
    case "day":
      startLocal = { year: parts.year, month: parts.month, day: parts.day };
      endLocal = addDays(startLocal, 1);
      break;
    case "week": {
      // Monday-based week
      const anchorDate = new Date(parts.year, parts.month - 1, parts.day);
      const dow = anchorDate.getDay(); // 0=Sun, 1=Mon, ...
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      startLocal = addDays(parts, mondayOffset);
      endLocal = addDays(startLocal, 7);
      break;
    }
    case "month":
      startLocal = { year: parts.year, month: parts.month, day: 1 };
      endLocal =
        parts.month === 12
          ? { year: parts.year + 1, month: 1, day: 1 }
          : { year: parts.year, month: parts.month + 1, day: 1 };
      break;
    case "quarter": {
      // Shift month so that fiscalQuarterStartMonth becomes month 0
      const shifted = (parts.month - fiscalQuarterStartMonth + 12) % 12;
      const q = Math.floor(shifted / 3);
      const qStartMonth = ((fiscalQuarterStartMonth - 1 + q * 3) % 12) + 1;
      const qStartYear = qStartMonth > parts.month ? parts.year - 1 : parts.year;
      startLocal = { year: qStartYear, month: qStartMonth, day: 1 };
      const qEndMonth = ((qStartMonth - 1 + 3) % 12) + 1;
      const qEndYear = qEndMonth <= qStartMonth ? qStartYear + 1 : qStartYear;
      endLocal = { year: qEndYear, month: qEndMonth, day: 1 };
      break;
    }
    case "year":
      startLocal = { year: parts.year, month: 1, day: 1 };
      endLocal = { year: parts.year + 1, month: 1, day: 1 };
      break;
  }

  return {
    start: localToUtc(startLocal, timezone),
    end: localToUtc(endLocal, timezone),
  };
}

function addDays(
  d: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const date = new Date(d.year, d.month - 1, d.day + days);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function localToUtc(d: { year: number; month: number; day: number }, timezone: string): Date {
  // Create a date string and parse it in the target timezone
  const dateStr = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}T00:00:00`;
  // Use a formatter to find the UTC offset for this local time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Trial-and-error approach: create a UTC date and adjust
  const guess = new Date(`${dateStr}Z`);
  const formatted = formatter.formatToParts(guess);
  const fParts = formatted.reduce(
    (acc, p) => {
      if (p.type === "year") acc.year = Number(p.value);
      if (p.type === "month") acc.month = Number(p.value);
      if (p.type === "day") acc.day = Number(p.value);
      if (p.type === "hour") acc.hour = Number(p.value);
      if (p.type === "minute") acc.minute = Number(p.value);
      if (p.type === "second") acc.second = Number(p.value);
      return acc;
    },
    { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 },
  );

  // The difference between what we wanted and what we got is the offset
  const wantedMs = new Date(d.year, d.month - 1, d.day, 0, 0, 0).getTime();
  const gotMs = new Date(
    fParts.year,
    fParts.month - 1,
    fParts.day,
    fParts.hour === 24 ? 0 : fParts.hour,
    fParts.minute,
    fParts.second,
  ).getTime();

  const offsetMs = gotMs - wantedMs;
  return new Date(guess.getTime() - offsetMs);
}

// Parse a YYYY-MM-DD string as midnight in the given timezone, returning a UTC Date.
// Unlike `new Date("YYYY-MM-DD")` which is UTC midnight, this ensures the date
// stays correct regardless of the timezone offset.
export function parseDateInTimezone(dateStr: string, timezone: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(dateStr);
  return localToUtc(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    timezone,
  );
}

// Format a UTC Date as YYYY-MM-DD in the given timezone.
// Unlike `toISOString().split("T")[0]` which uses UTC, this returns the local date.
export function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = p.value;
        if (p.type === "month") acc.month = p.value;
        if (p.type === "day") acc.day = p.value;
        return acc;
      },
      { year: "", month: "", day: "" },
    );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Navigate to the previous/next period.
// Returns a UTC Date representing midnight of the navigated date in the given timezone.
export function navigatePeriod(
  type: PeriodType,
  anchor: Date,
  timezone: string,
  direction: "prev" | "next",
): Date {
  const parts = getLocalParts(anchor, timezone);
  const delta = direction === "prev" ? -1 : 1;

  let target: { year: number; month: number; day: number };
  switch (type) {
    case "day":
      target = addDays(parts, delta);
      break;
    case "week":
      target = addDays(parts, delta * 7);
      break;
    case "month":
      target = {
        year:
          parts.month - 1 + delta < 0
            ? parts.year - 1
            : parts.month + delta > 12
              ? parts.year + 1
              : parts.year,
        month: ((parts.month - 1 + delta + 12) % 12) + 1,
        day: 1,
      };
      break;
    case "quarter":
      target = {
        year:
          parts.month - 1 + delta * 3 < 0
            ? parts.year - 1
            : parts.month + delta * 3 > 12
              ? parts.year + 1
              : parts.year,
        month: ((parts.month - 1 + delta * 3 + 12) % 12) + 1,
        day: 1,
      };
      break;
    case "year":
      target = { year: parts.year + delta, month: 1, day: 1 };
      break;
  }

  return localToUtc(target, timezone);
}

// Format a period range label for display
export function formatPeriodLabel(
  type: PeriodType,
  period: Period,
  timezone: string,
  locale: string,
  fiscalQuarterStartMonth = 1,
  fiscalYearLabel: "start" | "end" = "start",
): string {
  const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
      timeZone: timezone,
      ...opts,
    }).format(date);

  switch (type) {
    case "day":
      return fmt(period.start, { year: "numeric", month: "short", day: "numeric" });
    case "week": {
      const startStr = fmt(period.start, { month: "short", day: "numeric" });
      // End is exclusive, so subtract 1 day for display
      const endDisplay = new Date(period.end.getTime() - 86400000);
      const endStr = fmt(endDisplay, { month: "short", day: "numeric", year: "numeric" });
      return `${startStr} - ${endStr}`;
    }
    case "month":
      return fmt(period.start, { year: "numeric", month: "long" });
    case "quarter": {
      const startParts = getLocalParts(period.start, timezone);
      const monthNum = startParts.month;
      const quarter = Math.floor(((monthNum - fiscalQuarterStartMonth + 12) % 12) / 3) + 1;
      // Fiscal year labeled by the year it starts or ends
      const fyStartYear =
        fiscalQuarterStartMonth > 1 && monthNum < fiscalQuarterStartMonth
          ? startParts.year - 1
          : startParts.year;
      const fiscalYear =
        fiscalYearLabel === "end" && fiscalQuarterStartMonth > 1 ? fyStartYear + 1 : fyStartYear;
      return `Q${quarter} ${fiscalYear}`;
    }
    case "year":
      return fmt(period.start, { year: "numeric" });
  }
}
