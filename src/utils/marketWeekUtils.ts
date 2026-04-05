/** Market week row with optional per-plan veg counts and per-week open/close. */
export interface MarketWeekRow {
  id: string;
  week_start_date: string;
  week_end_date: string;
  is_locked?: boolean;
  veg_count_small?: number | null;
  veg_count_medium?: number | null;
  veg_count_large?: number | null;
  /** Day of week customization opens (0=Sun .. 6=Sat). */
  open_dow?: number | null;
  open_time?: string | null;
  close_dow?: number | null;
  close_time?: string | null;
}

/** YYYY-MM-DD in the user's local timezone (not UTC). Avoids wrong "today" vs DB week ranges. */
export function formatLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeWeekStartDate(d: string | null | undefined): string {
  return d ? String(d).slice(0, 10) : '';
}

/**
 * Find the market week that contains today (today between week_start_date and week_end_date).
 * Uses local calendar date for "today" so it matches how admin stores week_start / week_end.
 */
export function getCurrentMarketWeek(weeks: MarketWeekRow[]): MarketWeekRow | null {
  const today = formatLocalDateISO(new Date());
  return weeks.find(w => w.week_start_date <= today && today <= w.week_end_date) ?? null;
}

/** Same as admin: row for this calendar week's Monday (where open/close times are edited). */
export function getMarketWeekForCurrentMonday(weeks: MarketWeekRow[]): MarketWeekRow | null {
  const { week_start_date } = getCurrentWeekDateRange();
  const target = normalizeWeekStartDate(week_start_date);
  return weeks.find((w) => normalizeWeekStartDate(w.week_start_date) === target) ?? null;
}

/**
 * Resolve which market_weeks.id the app should use for week vegetables (same row as admin "current week").
 * Prefer Monday match, then week that contains today, never synthetic ids.
 */
export function pickMarketWeekIdForApp(weeks: MarketWeekRow[]): string | null {
  if (!weeks?.length) return null;
  const byMonday = getMarketWeekForCurrentMonday(weeks);
  if (byMonday?.id && !String(byMonday.id).startsWith('synthetic-')) return byMonday.id;
  const byToday = getCurrentMarketWeek(weeks);
  if (byToday?.id && !String(byToday.id).startsWith('synthetic-')) return byToday.id;
  // Last resort: most recent market_week row (covers minor date mismatches vs local Monday)
  const sorted = [...weeks].filter((w) => w.week_start_date).sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  const latest = sorted[0];
  return latest?.id && !String(latest.id).startsWith('synthetic-') ? latest.id : null;
}

/** Get Monday of the week for a given date (ISO week). */
export function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

/** Current week Mon–Sun as YYYY-MM-DD (local dates). */
export function getCurrentWeekDateRange(): { week_start_date: string; week_end_date: string } {
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { week_start_date: formatLocalDateISO(monday), week_end_date: formatLocalDateISO(sunday) };
}

/** Next week Mon–Sun as YYYY-MM-DD (local dates). */
export function getNextWeekDateRange(): { week_start_date: string; week_end_date: string } {
  const current = getCurrentWeekDateRange();
  const nextMon = new Date(current.week_start_date + 'T12:00:00');
  nextMon.setDate(nextMon.getDate() + 7);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  return { week_start_date: formatLocalDateISO(nextMon), week_end_date: formatLocalDateISO(nextSun) };
}

/**
 * Return the market week used for customization schedule (same row admin edits in Bucket types).
 * 1) Row whose week_start_date matches this week's Monday (preferred).
 * 2) Else row that contains today's local date.
 * 3) Else synthetic week with default Wed/Fri times (customer UI should fall back to customization_schedule if needed).
 */
export function getOrCreateCurrentWeek(weeks: MarketWeekRow[]): MarketWeekRow {
  const byMonday = getMarketWeekForCurrentMonday(weeks);
  if (byMonday) return byMonday;
  const fromDb = getCurrentMarketWeek(weeks);
  if (fromDb) return fromDb;
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monStr = formatLocalDateISO(monday);
  const sunStr = formatLocalDateISO(sunday);
  return {
    id: `synthetic-${monStr}`,
    week_start_date: monStr,
    week_end_date: sunStr,
    is_locked: false,
    veg_count_small: null,
    veg_count_medium: null,
    veg_count_large: null,
    open_dow: 3,
    open_time: '12:00',
    close_dow: 5,
    close_time: '23:59'
  };
}

/**
 * Parse display_item_range e.g. "3-4" or "6-7" to [min, max]. Falls back to [4, 4] etc.
 */
export function parseVegRange(displayItemRange: string | undefined, planId: 'small' | 'medium' | 'large'): [number, number] {
  const fallbacks: Record<string, [number, number]> = {
    small: [3, 4],
    medium: [6, 7],
    large: [9, 10]
  };
  if (!displayItemRange) return fallbacks[planId] ?? [4, 4];
  const parts = displayItemRange.split(/[–\-]/).map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
  if (parts.length >= 2) return [parts[0], parts[1]];
  if (parts.length === 1) return [parts[0], parts[0]];
  return fallbacks[planId] ?? [4, 4];
}

/**
 * Get veg count from bucket type. Single source of truth for customer and admin.
 * When admin sets per-category counts (root + leafy + bushy > 0), that sum is used.
 * Otherwise uses display_item_range midpoint (e.g. "9-10" => 10).
 */
export function getVegCountFromBucketType(
  displayItemRange?: string,
  rootCount?: number | null,
  leafyCount?: number | null,
  bushyCount?: number | null
): number {
  const sum = (rootCount ?? 0) + (leafyCount ?? 0) + (bushyCount ?? 0);
  if (sum > 0) return sum;
  let rangeMid = 4;
  if (displayItemRange) {
    const parts = displayItemRange.split(/[–\-]/).map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (parts.length >= 2) rangeMid = Math.round((parts[0] + parts[1]) / 2);
    else if (parts.length === 1) rangeMid = parts[0];
  }
  return rangeMid;
}

/**
 * Get veg count for a plan from bucket type (same as getVegCountFromBucketType; kept for callers that pass planId).
 * @deprecated Prefer getVegCountFromBucketType(displayItemRange, rootCount, leafyCount, bushyCount).
 */
export function getVegCountForPlan(
  _planId: 'small' | 'medium' | 'large',
  _currentWeek: MarketWeekRow | null,
  displayItemRange: string,
  rootCount?: number | null,
  leafyCount?: number | null,
  bushyCount?: number | null
): number {
  return getVegCountFromBucketType(displayItemRange, rootCount, leafyCount, bushyCount);
}
