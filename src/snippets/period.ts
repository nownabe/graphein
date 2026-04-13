export type PeriodType = "day" | "week" | "month" | "quarter" | "year";

export interface Period {
  start: Date;
  end: Date;
}

// Compute the start and end of a period for a given anchor date in a timezone.
// Returns UTC Date objects representing the boundaries.
export function computePeriod(type: PeriodType, anchor: Date, timezone: string): Period {
  // Format anchor in the target timezone to get local date parts
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(anchor)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = Number(p.value);
        if (p.type === "month") acc.month = Number(p.value);
        if (p.type === "day") acc.day = Number(p.value);
        return acc;
      },
      { year: 0, month: 0, day: 0 },
    );

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
      const q = Math.floor((parts.month - 1) / 3);
      const qStartMonth = q * 3 + 1;
      startLocal = { year: parts.year, month: qStartMonth, day: 1 };
      const qEndMonth = qStartMonth + 3;
      endLocal =
        qEndMonth > 12
          ? { year: parts.year + 1, month: qEndMonth - 12, day: 1 }
          : { year: parts.year, month: qEndMonth, day: 1 };
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

// Navigate to the previous/next period
export function navigatePeriod(
  type: PeriodType,
  anchor: Date,
  timezone: string,
  direction: "prev" | "next",
): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(anchor)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = Number(p.value);
        if (p.type === "month") acc.month = Number(p.value);
        if (p.type === "day") acc.day = Number(p.value);
        return acc;
      },
      { year: 0, month: 0, day: 0 },
    );

  const delta = direction === "prev" ? -1 : 1;

  switch (type) {
    case "day":
      return new Date(parts.year, parts.month - 1, parts.day + delta);
    case "week":
      return new Date(parts.year, parts.month - 1, parts.day + delta * 7);
    case "month":
      return new Date(parts.year, parts.month - 1 + delta, 1);
    case "quarter":
      return new Date(parts.year, parts.month - 1 + delta * 3, 1);
    case "year":
      return new Date(parts.year + delta, 0, 1);
  }
}

// Format a period range label for display
export function formatPeriodLabel(
  type: PeriodType,
  period: Period,
  timezone: string,
  locale: string,
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
      const q = Math.ceil(
        (new Date(
          fmt(period.start, { year: "numeric", month: "2-digit", day: "2-digit" }),
        ).getMonth() +
          1) /
          3,
      );
      const monthNum = Number(
        new Intl.DateTimeFormat("en-CA", { timeZone: timezone, month: "2-digit" }).format(
          period.start,
        ),
      );
      const quarter = Math.ceil(monthNum / 3);
      const year = fmt(period.start, { year: "numeric" });
      return `Q${quarter} ${year}`;
    }
    case "year":
      return fmt(period.start, { year: "numeric" });
  }
}
