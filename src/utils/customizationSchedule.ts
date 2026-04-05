/**
 * Customization window: when customers can edit their bucket.
 * Default: Wed 12:00 open → Fri 23:59 close. Admin can change via customization_schedule and lock per week.
 */

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

/** Single global row from customization_schedule (kept in sync when admin saves Bucket types). */
export function scheduleFromGlobalCustomizationRow(row: {
  open_dow?: number | null;
  open_time?: string | null;
  close_dow?: number | null;
  close_time?: string | null;
} | null | undefined): CustomizationScheduleRow {
  if (!row) return DEFAULT;
  return {
    id: '',
    open_dow: row.open_dow ?? DEFAULT.open_dow,
    open_time: (row.open_time ?? DEFAULT.open_time).trim() || DEFAULT.open_time,
    close_dow: row.close_dow ?? DEFAULT.close_dow,
    close_time: (row.close_time ?? DEFAULT.close_time).trim() || DEFAULT.close_time,
  };
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

/** Is the customization window open at `now` for the given schedule? (Ignores week lock; caller combines with is_locked.) */
export function computeIsOpen(now: Date, schedule: CustomizationScheduleRow | null, weekLocked: boolean): boolean {
  if (weekLocked) return false;
  const s = schedule || DEFAULT;
  const lastOpen = previousOccurrence(now, s.open_dow, s.open_time);
  const daysToClose = (s.close_dow - s.open_dow + 7) % 7;
  const endOfWindow = new Date(lastOpen);
  endOfWindow.setDate(lastOpen.getDate() + daysToClose);
  const { hours: ch, minutes: cm } = parseTime(s.close_time);
  endOfWindow.setHours(ch, cm, 59, 999);
  return now.getTime() >= lastOpen.getTime() && now.getTime() <= endOfWindow.getTime();
}

/** End of the current customization window (same window as computeIsOpen). */
export function computeDeadline(now: Date, schedule: CustomizationScheduleRow | null): Date {
  const s = schedule || DEFAULT;
  const lastOpen = previousOccurrence(now, s.open_dow, s.open_time);
  const daysToClose = (s.close_dow - s.open_dow + 7) % 7;
  const endOfWindow = new Date(lastOpen);
  endOfWindow.setDate(lastOpen.getDate() + daysToClose);
  const { hours, minutes } = parseTime(s.close_time);
  endOfWindow.setHours(hours, minutes, 59, 999);
  return endOfWindow;
}

/** Next opening (open_dow + open_time) on or after now. */
export function computeNextOpening(now: Date, schedule: CustomizationScheduleRow | null): Date {
  const s = schedule || DEFAULT;
  return nextOccurrence(now, s.open_dow, s.open_time);
}

/** Start of the current customization window (same window as computeIsOpen). */
export function computeWindowStart(now: Date, schedule: CustomizationScheduleRow | null): Date {
  const s = schedule || DEFAULT;
  return previousOccurrence(now, s.open_dow, s.open_time);
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
  const s = schedule || DEFAULT;
  const windowStart = previousOccurrence(now, s.open_dow, s.open_time);
  const daysToClose = (s.close_dow - s.open_dow + 7) % 7;
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + daysToClose);
  const { hours, minutes } = parseTime(s.close_time);
  windowEnd.setHours(hours, minutes, 59, 999);

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
  const daysToClose = (s.close_dow - s.open_dow + 7) % 7;
  const nextWindowEnd = new Date(nextWindowStart);
  nextWindowEnd.setDate(nextWindowStart.getDate() + daysToClose);
  const { hours, minutes } = parseTime(s.close_time);
  nextWindowEnd.setHours(hours, minutes, 59, 999);

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
let scheduleContext: { schedule: CustomizationScheduleRow | null; weekLocked: boolean } | null = null;

export function setScheduleContext(schedule: CustomizationScheduleRow | null, weekLocked: boolean): void {
  scheduleContext = { schedule, weekLocked };
}

export function getScheduleContext(): { schedule: CustomizationScheduleRow | null; weekLocked: boolean } | null {
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTimeForDisplay(timeStr: string): string {
  const { hours, minutes } = parseTime(timeStr);
  if (hours === 0 && minutes === 0) return '12:00 AM';
  if (hours === 12 && minutes === 0) return '12:00 PM';
  const h = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

/** Human-readable labels from schedule (for customer UI). */
export function formatScheduleDisplay(schedule: CustomizationScheduleRow | null): { openLabel: string; closeLabel: string } | null {
  const s = schedule || DEFAULT;
  return {
    openLabel: `${DAY_NAMES[s.open_dow]} ${formatTimeForDisplay(s.open_time)}`,
    closeLabel: `${DAY_NAMES[s.close_dow]} ${formatTimeForDisplay(s.close_time)}`
  };
}
