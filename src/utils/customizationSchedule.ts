/**
 * Customization window: when customers can edit their bucket.
 * Default: Wed 12:00 open → Fri 23:59 close. Per-week values live on `market_weeks` (open_dow/time, close_dow/time); lock per week with is_locked.
 *
 * Window end is never after **Sunday 23:59:59.999** of the Mon–Sun week that contains the window’s opening instant,
 * so customization does not roll into the next calendar week past week-end.
 */

import { getCurrentWeekDateRange, getMondayOfWeek } from './marketWeekUtils';

export interface CustomizationScheduleRow {
  id: string;
  open_dow: number;   // 0 Sun, 1 Mon, ... 6 Sat
  open_time: string;  // HH:MM 24h
  close_dow: number;
  close_time: string;
  updated_at?: string;
}

const DEFAULT: CustomizationScheduleRow = {
  id: '',
  open_dow: 3,
  open_time: '12:00',
  close_dow: 5,
  close_time: '23:59',
};

/** Build schedule row from a market_weeks row (per-week open/close). Uses DEFAULT only when row is null; otherwise uses DB values with per-field fallbacks. */
export function scheduleFromMarketWeek(row: {
  open_dow?: number | null;
  open_time?: string | null;
  close_dow?: number | null;
  close_time?: string | null;
} | null): CustomizationScheduleRow {
  if (!row) return DEFAULT;
  return {
    id: '',
    open_dow: row.open_dow ?? DEFAULT.open_dow,
    open_time: (row.open_time ?? DEFAULT.open_time).trim() || DEFAULT.open_time,
    close_dow: row.close_dow ?? DEFAULT.close_dow,
    close_time: (row.close_time ?? DEFAULT.close_time).trim() || DEFAULT.close_time,
  };
}

/** @deprecated Legacy alias — same shape as scheduleFromMarketWeek. Prefer loading open/close from `market_weeks` only. */
export function scheduleFromGlobalCustomizationRow(row: {
  open_dow?: number | null;
  open_time?: string | null;
  close_dow?: number | null;
  close_time?: string | null;
} | null | undefined): CustomizationScheduleRow {
  return scheduleFromMarketWeek(row ?? null);
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = (timeStr || '12:00').trim().split(':');
  const hours = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const minutes = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return { hours, minutes };
}

/** Next occurrence of (dayOfWeek, time) on or after `from`. dayOfWeek 0=Sun, 6=Sat. */
function nextOccurrence(from: Date, dayOfWeek: number, timeStr: string): Date {
  const { hours, minutes } = parseTime(timeStr);
  const d = new Date(from);
  const currentDow = d.getDay();
  let daysToAdd = (dayOfWeek - currentDow + 7) % 7;
  d.setDate(d.getDate() + daysToAdd);
  d.setHours(hours, minutes, 0, 0);
  if (daysToAdd === 0 && from.getTime() > d.getTime()) {
    d.setDate(d.getDate() + 7);
  }
  return d;
}

/** Previous occurrence of (dayOfWeek, time) at or before `from`. */
function previousOccurrence(from: Date, dayOfWeek: number, timeStr: string): Date {
  const { hours, minutes } = parseTime(timeStr);
  const d = new Date(from);
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() - 1);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() > from.getTime()) d.setDate(d.getDate() - 7);
  return d;
}

/** End of Sunday (23:59:59.999) for the Mon–Sun week that contains `d` (local calendar). */
export function endOfSundayForWeekContaining(d: Date): Date {
  const monday = getMondayOfWeek(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Rolling customization window containing `now`: opens at the latest open_dow/open_time on or before `now`,
 * closes at close_dow/close_time after the configured span, **capped** at end of Sunday of the week that contains the opening instant.
 */
export function getCustomizationWindowBounds(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { windowStart: Date; windowEnd: Date } {
  const s = schedule || DEFAULT;
  const windowStart = previousOccurrence(now, s.open_dow, s.open_time);
  const daysSpan = (s.close_dow - s.open_dow + 7) % 7;
  let windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + daysSpan);
  const { hours, minutes } = parseTime(s.close_time);
  windowEnd.setHours(hours, minutes, 59, 999);
  const cap = endOfSundayForWeekContaining(windowStart);
  if (windowEnd.getTime() > cap.getTime()) {
    windowEnd = new Date(cap);
  }
  return { windowStart, windowEnd };
}

/**
 * Next upcoming window after `now` (based on next open occurrence), with the same Sunday cap rule.
 * Used for UI labels when the current window is closed so we show the *next* open/close dates.
 */
export function getNextCustomizationWindowBounds(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { windowStart: Date; windowEnd: Date } {
  const s = schedule || DEFAULT;
  const windowStart = nextOccurrence(now, s.open_dow, s.open_time);
  const daysSpan = (s.close_dow - s.open_dow + 7) % 7;
  let windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + daysSpan);
  const { hours, minutes } = parseTime(s.close_time);
  windowEnd.setHours(hours, minutes, 59, 999);
  const cap = endOfSundayForWeekContaining(windowStart);
  if (windowEnd.getTime() > cap.getTime()) {
    windowEnd = new Date(cap);
  }
  return { windowStart, windowEnd };
}

/** Is the customization window open at `now` for the given schedule? (Ignores week lock; caller combines with is_locked.) */
export function computeIsOpen(now: Date, schedule: CustomizationScheduleRow | null, weekLocked: boolean): boolean {
  if (weekLocked) return false;
  const { windowStart, windowEnd } = getCustomizationWindowBounds(now, schedule);
  return now.getTime() >= windowStart.getTime() && now.getTime() <= windowEnd.getTime();
}

/** End of the current customization window (same window as computeIsOpen). */
export function computeDeadline(now: Date, schedule: CustomizationScheduleRow | null): Date {
  return getCustomizationWindowBounds(now, schedule).windowEnd;
}

/** Next opening (open_dow + open_time) on or after now. */
export function computeNextOpening(now: Date, schedule: CustomizationScheduleRow | null): Date {
  const s = schedule || DEFAULT;
  return nextOccurrence(now, s.open_dow, s.open_time);
}

/** Start of the current customization window (same window as computeIsOpen). */
export function computeWindowStart(now: Date, schedule: CustomizationScheduleRow | null): Date {
  return getCustomizationWindowBounds(now, schedule).windowStart;
}

/**
 * For admin: whether open/close can be edited based on current window.
 * - Before open: can edit both.
 * - In window (opened, not yet closed): can edit close only.
 * - After close: cannot edit (window over).
 */
export function getScheduleEditState(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { canEditOpen: boolean; canEditClose: boolean; message?: string } {
  const { windowStart, windowEnd } = getCustomizationWindowBounds(now, schedule);

  if (now.getTime() < windowStart.getTime()) {
    return { canEditOpen: true, canEditClose: true };
  }
  if (now.getTime() <= windowEnd.getTime()) {
    return { canEditOpen: false, canEditClose: true, message: 'Window is open; you can only change the close time.' };
  }
  return { canEditOpen: false, canEditClose: false, message: "This week's customization window has ended. Edits will apply to the next window." };
}

/**
 * For admin "Next week" card: edit state for the *next* window (upcoming open–close).
 * Before next window opens → both editable; in next window → close only; after next window → none.
 */
export function getScheduleEditStateForNextWindow(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { canEditOpen: boolean; canEditClose: boolean; message?: string } {
  const s = schedule || DEFAULT;
  const nextWindowStart = nextOccurrence(now, s.open_dow, s.open_time);
  const daysSpan = (s.close_dow - s.open_dow + 7) % 7;
  let nextWindowEnd = new Date(nextWindowStart);
  nextWindowEnd.setDate(nextWindowStart.getDate() + daysSpan);
  const { hours, minutes } = parseTime(s.close_time);
  nextWindowEnd.setHours(hours, minutes, 59, 999);
  const cap = endOfSundayForWeekContaining(nextWindowStart);
  if (nextWindowEnd.getTime() > cap.getTime()) {
    nextWindowEnd = new Date(cap);
  }

  if (now.getTime() < nextWindowStart.getTime()) {
    return { canEditOpen: true, canEditClose: true };
  }
  if (now.getTime() <= nextWindowEnd.getTime()) {
    return { canEditOpen: false, canEditClose: true, message: 'Window is open; you can only change the close time.' };
  }
  return { canEditOpen: false, canEditClose: false, message: "Next window has ended. Edits will apply to the following window." };
}

export function getTimeRemaining(deadline: Date, now: Date = new Date()): {
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
} {
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, isExpired: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, isExpired: false };
}

// Module-level context so weeklyShuffling can read without async
let scheduleContext: {
  schedule: CustomizationScheduleRow | null;
  weekLocked: boolean;
  /** Mon–Sun bounds for the active `market_weeks` row (or synthetic); used for closed-state copy. */
  marketWeekStart: string | null;
  marketWeekEnd: string | null;
} | null = null;

export function setScheduleContext(
  schedule: CustomizationScheduleRow | null,
  weekLocked: boolean,
  marketWeekStart?: string | null,
  marketWeekEnd?: string | null
): void {
  scheduleContext = {
    schedule,
    weekLocked,
    marketWeekStart: marketWeekStart ?? null,
    marketWeekEnd: marketWeekEnd ?? null,
  };
}

export function getScheduleContext(): {
  schedule: CustomizationScheduleRow | null;
  weekLocked: boolean;
  marketWeekStart: string | null;
  marketWeekEnd: string | null;
} | null {
  return scheduleContext;
}

/** Set localStorage 'LEAFY_FORCE_CUSTOMIZATION_CLOSED' = '1' to temporarily force customization closed for testing. Remove or set to '0' to restore. */
export function getIsOpen(now: Date = new Date()): boolean {
  if (typeof window !== 'undefined' && localStorage.getItem('LEAFY_FORCE_CUSTOMIZATION_CLOSED') === '1') return false;
  if (!scheduleContext) return computeIsOpen(now, DEFAULT, false);
  return computeIsOpen(now, scheduleContext.schedule, scheduleContext.weekLocked);
}

export function getDeadline(now: Date = new Date()): Date {
  if (!scheduleContext) return computeDeadline(now, DEFAULT);
  return computeDeadline(now, scheduleContext.schedule);
}

/** Human-readable labels with concrete calendar dates (same window as {@link getCustomizationWindowBounds}). */
export function formatScheduleDisplay(schedule: CustomizationScheduleRow | null): { openLabel: string; closeLabel: string } | null {
  if (!schedule) return null;
  return formatScheduleDisplayWithWeekDates(new Date(), schedule);
}

/** Formats a single instant for UI (weekday, calendar date, time). Uses local timezone. */
export function formatCustomizationInstant(d: Date, locale = 'en-US'): string {
  return d.toLocaleString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Same as {@link getCustomizationWindowBounds} (rolling window capped at week Sunday).
 * Kept for callers that still use the old name.
 */
export function getCustomizationWindowBoundsForLocalWeek(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { windowStart: Date; windowEnd: Date } {
  return getCustomizationWindowBounds(now, schedule);
}

/**
 * Open/close labels for the **active** customization window containing `now`, with full calendar date/time.
 */
export function formatScheduleDisplayWithWeekDates(
  now: Date,
  schedule: CustomizationScheduleRow | null
): { openLabel: string; closeLabel: string } {
  const { windowStart, windowEnd } = getCustomizationWindowBounds(now, schedule);
  return {
    openLabel: formatCustomizationInstant(windowStart),
    closeLabel: formatCustomizationInstant(windowEnd),
  };
}

/**
 * Open/close labels for customer/admin status banners:
 * - if currently open: show the active rolling window
 * - if closed: prefer {@link resolveScheduleDisplayForStatus} (market-week–scoped); this helper still uses the *next* rolling window for closed (legacy callers).
 */
export function formatScheduleDisplayForStatus(
  now: Date,
  schedule: CustomizationScheduleRow | null,
  isOpen: boolean
): { openLabel: string; closeLabel: string } {
  const { windowStart, windowEnd } = isOpen
    ? getCustomizationWindowBounds(now, schedule)
    : getNextCustomizationWindowBounds(now, schedule);
  return {
    openLabel: formatCustomizationInstant(windowStart),
    closeLabel: formatCustomizationInstant(windowEnd),
  };
}

export type ResolvedScheduleDisplayForStatus = {
  openLabel: string;
  closeLabel: string;
  windowParts: ScheduleWindowParts | null;
  /** When set, closed UI should show only this line (week locked or customization already ended for this market week). */
  closedWeekMessage: string | null;
};

/**
 * Customer-facing schedule copy aligned with the **current market week** when customization is closed:
 * - Open: active rolling window (same as {@link getCustomizationWindowBounds}).
 * - Closed + week locked: short unavailable message.
 * - Closed + before this week’s window: open/close instants for that week.
 * - Closed + on or before this week’s close instant: same dates (window still “this week”).
 * - Closed + after this week’s close: “Customization ended for this week.”
 * Missing week bounds fall back to local Mon–Sun, then to next rolling window if still indeterminate.
 */
export function resolveScheduleDisplayForStatus(
  now: Date,
  schedule: CustomizationScheduleRow | null,
  isOpen: boolean,
  weekLocked: boolean,
  marketWeekStart: string | null,
  marketWeekEnd: string | null
): ResolvedScheduleDisplayForStatus {
  const s = schedule || DEFAULT;

  if (isOpen) {
    const { windowStart, windowEnd } = getCustomizationWindowBounds(now, s);
    return {
      openLabel: formatCustomizationInstant(windowStart),
      closeLabel: formatCustomizationInstant(windowEnd),
      windowParts: getScheduleWindowPartsFromInstants(windowStart, windowEnd),
      closedWeekMessage: null,
    };
  }

  if (weekLocked) {
    return {
      openLabel: '',
      closeLabel: '',
      windowParts: null,
      closedWeekMessage: 'Customization is not available for this week.',
    };
  }

  let ws = marketWeekStart?.trim() || '';
  let we = marketWeekEnd?.trim() || '';
  if (!ws || !we) {
    const local = getCurrentWeekDateRange();
    ws = local.week_start_date;
    we = local.week_end_date;
  }

  const mw = getCustomizationWindowInMarketWeek(ws, we, s);
  if (now.getTime() > mw.windowEnd.getTime()) {
    return {
      openLabel: formatCustomizationInstant(mw.windowStart),
      closeLabel: formatCustomizationInstant(mw.windowEnd),
      windowParts: getScheduleWindowPartsFromInstants(mw.windowStart, mw.windowEnd),
      closedWeekMessage: 'Customization ended for this week.',
    };
  }
  return {
    openLabel: formatCustomizationInstant(mw.windowStart),
    closeLabel: formatCustomizationInstant(mw.windowEnd),
    windowParts: getScheduleWindowPartsFromInstants(mw.windowStart, mw.windowEnd),
    closedWeekMessage: null,
  };
}

function parseLocalDateNoon(iso: string): Date {
  const y = iso.slice(0, 10);
  return new Date(`${y}T12:00:00`);
}

/**
 * Open/close instants for a **specific** `market_weeks` row (Mon…Sun), from DOW + time fields.
 * If the configured close falls after `weekEndDate` 11:59 PM, `windowEnd` is the cap and `exceedsWeekEnd` is true.
 */
export function getCustomizationWindowInMarketWeek(
  weekStartDate: string,
  weekEndDate: string,
  schedule: CustomizationScheduleRow
): { windowStart: Date; windowEnd: Date; exceedsWeekEnd: boolean } {
  const monday = parseLocalDateNoon(weekStartDate);
  const weekEnd = parseLocalDateNoon(weekEndDate);
  weekEnd.setHours(23, 59, 59, 999);

  const mondayDow = monday.getDay();
  const s = schedule;
  const daysFromMondayToOpen = (s.open_dow - mondayDow + 7) % 7;
  const windowStart = new Date(monday);
  windowStart.setDate(monday.getDate() + daysFromMondayToOpen);
  const { hours: oh, minutes: om } = parseTime(s.open_time);
  windowStart.setHours(oh, om, 0, 0);

  const daysSpan = (s.close_dow - s.open_dow + 7) % 7;
  const windowEndRaw = new Date(windowStart);
  windowEndRaw.setDate(windowStart.getDate() + daysSpan);
  const { hours: ch, minutes: cm } = parseTime(s.close_time);
  windowEndRaw.setHours(ch, cm, 59, 999);

  const exceedsWeekEnd = windowEndRaw.getTime() > weekEnd.getTime();
  const windowEnd = exceedsWeekEnd ? new Date(weekEnd.getTime()) : windowEndRaw;
  return { windowStart, windowEnd, exceedsWeekEnd };
}

/**
 * Validates that open/close interpreted inside the market week `weekStartDate`…`weekEndDate` (Mon–Sun)
 * does not end after that week’s last day (typically Sunday 11:59 PM).
 */
export function validateScheduleWithinMarketWeek(
  weekStartDate: string,
  weekEndDate: string,
  schedule: CustomizationScheduleRow
): { ok: true } | { ok: false; message: string } {
  const { exceedsWeekEnd } = getCustomizationWindowInMarketWeek(weekStartDate, weekEndDate, schedule);
  if (exceedsWeekEnd) {
    return {
      ok: false,
      message: `Close must be on or before the end of this market week (${weekEndDate.slice(0, 10)}, 11:59 PM).`,
    };
  }
  return { ok: true };
}

export interface ScheduleWindowPart {
  weekday: string;
  dateStr: string;
  timeStr: string;
}

export interface ScheduleWindowParts {
  open: ScheduleWindowPart;
  close: ScheduleWindowPart;
}

function splitInstant(d: Date, locale = 'en-US'): ScheduleWindowPart {
  return {
    weekday: d.toLocaleDateString(locale, { weekday: 'long' }),
    dateStr: d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    timeStr: d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
  };
}

export function getScheduleWindowPartsFromInstants(windowStart: Date, windowEnd: Date, locale = 'en-US'): ScheduleWindowParts {
  return {
    open: splitInstant(windowStart, locale),
    close: splitInstant(windowEnd, locale),
  };
}

/** Same window as {@link formatScheduleDisplayWithWeekDates}, split for scannable UI (cards / timeline). */
export function getScheduleWindowPartsForLocalWeek(
  now: Date,
  schedule: CustomizationScheduleRow | null
): ScheduleWindowParts {
  const { windowStart, windowEnd } = getCustomizationWindowBoundsForLocalWeek(now, schedule);
  return {
    open: splitInstant(windowStart),
    close: splitInstant(windowEnd),
  };
}

/** Same as {@link formatScheduleDisplayForStatus} but split into parts for the compact cards UI. */
export function getScheduleWindowPartsForStatus(
  now: Date,
  schedule: CustomizationScheduleRow | null,
  isOpen: boolean
): ScheduleWindowParts {
  const { windowStart, windowEnd } = isOpen
    ? getCustomizationWindowBounds(now, schedule)
    : getNextCustomizationWindowBounds(now, schedule);
  return {
    open: splitInstant(windowStart),
    close: splitInstant(windowEnd),
  };
}

/** True only after this week's customization close (per {@link getCustomizationWindowBounds}), not before the next open. */
export function isAfterCustomizationClosedForLocalWeek(
  now: Date,
  schedule: CustomizationScheduleRow | null
): boolean {
  const { windowEnd } = getCustomizationWindowBoundsForLocalWeek(now, schedule);
  return now.getTime() > windowEnd.getTime();
}

/**
 * True only after **this market week’s** customization close.
 * Do not use the rolling “previous Wed–Fri” window alone — before this week’s open
 * (e.g. Mon–Tue), that rolling window is last week and would wrongly look “closed”.
 */
export function isAfterCustomizationClosedForCurrentWeek(now: Date = new Date()): boolean {
  const ctx = getScheduleContext();
  const schedule = ctx?.schedule ?? null;

  if (ctx?.marketWeekStart && ctx?.marketWeekEnd) {
    const mw = getCustomizationWindowInMarketWeek(
      ctx.marketWeekStart,
      ctx.marketWeekEnd,
      schedule
    );
    return now.getTime() > mw.windowEnd.getTime();
  }

  const { windowStart, windowEnd } = getCustomizationWindowBoundsForLocalWeek(now, schedule);
  const monday = getMondayOfWeek(now);
  monday.setHours(0, 0, 0, 0);
  // Last week’s window still “current” in rolling bounds → this week has not auto-saved yet
  if (windowStart.getTime() < monday.getTime()) {
    return false;
  }
  return now.getTime() > windowEnd.getTime();
}
