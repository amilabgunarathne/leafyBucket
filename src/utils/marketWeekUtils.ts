/** Market week row with optional per-plan veg counts */
export interface MarketWeekRow {
  id: string;
  week_start_date: string;
  week_end_date: string;
  is_locked?: boolean;
  veg_count_small?: number | null;
  veg_count_medium?: number | null;
  veg_count_large?: number | null;
}

/**
 * Find the market week that contains today (today between week_start_date and week_end_date).
 */
export function getCurrentMarketWeek(weeks: MarketWeekRow[]): MarketWeekRow | null {
  const today = new Date().toISOString().split('T')[0];
  return weeks.find(w => w.week_start_date <= today && today <= w.week_end_date) ?? null;
}

/** Get Monday of the week for a given date (ISO week). */
export function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

const fmt = (d: Date) => d.toISOString().split('T')[0];

/** Current week Mon–Sun as YYYY-MM-DD. */
export function getCurrentWeekDateRange(): { week_start_date: string; week_end_date: string } {
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { week_start_date: fmt(monday), week_end_date: fmt(sunday) };
}

/** Next week Mon–Sun as YYYY-MM-DD. */
export function getNextWeekDateRange(): { week_start_date: string; week_end_date: string } {
  const current = getCurrentWeekDateRange();
  const nextMon = new Date(current.week_start_date + 'T12:00:00');
  nextMon.setDate(nextMon.getDate() + 7);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  return { week_start_date: fmt(nextMon), week_end_date: fmt(nextSun) };
}

/**
 * Return the market week that contains today. If no DB row contains today, return a synthetic
 * week for the current Mon–Sun so the app always has a "current week".
 */
export function getOrCreateCurrentWeek(weeks: MarketWeekRow[]): MarketWeekRow {
  const fromDb = getCurrentMarketWeek(weeks);
  if (fromDb) return fromDb;
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    id: `synthetic-${fmt(monday)}`,
    week_start_date: fmt(monday),
    week_end_date: fmt(sunday),
    is_locked: false,
    veg_count_small: null,
    veg_count_medium: null,
    veg_count_large: null
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
