/**
 * Business-day maths in India Standard Time (UTC+05:30, no DST). Dashboards and reports use IST day boundaries so
 * "today" matches the owner's calendar, not the server's. All stored timestamps remain UTC ISO strings.
 */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Start (as a UTC Date) of the IST calendar day containing `d`. */
export function istDayStart(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

export type Period = "today" | "7d" | "month";

export interface PeriodRange {
  period: Period;
  start: Date;
  end: Date; // exclusive
  label: string;
}

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

export function periodRange(period: Period, now = new Date()): PeriodRange {
  const todayStart = istDayStart(now);
  const tomorrow = new Date(todayStart.getTime() + 86_400_000);
  if (period === "today") return { period, start: todayStart, end: tomorrow, label: `Today (${fmt(todayStart)}, IST)` };
  if (period === "7d") {
    const start = new Date(todayStart.getTime() - 6 * 86_400_000);
    return { period, start, end: tomorrow, label: `Last 7 days (${fmt(start)} - ${fmt(todayStart)}, IST)` };
  }
  const ist = new Date(todayStart.getTime() + IST_OFFSET_MS);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
  return { period: "month", start, end: tomorrow, label: `Month to date (${fmt(start)} - ${fmt(todayStart)}, IST)` };
}
