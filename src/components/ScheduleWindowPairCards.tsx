import type { ScheduleWindowParts } from '../utils/customizationSchedule';

type Tone = 'orange' | 'green' | 'muted';

const toneText: Record<Tone, { wrap: string; sep: string; strong: string; label: string }> = {
  orange: {
    wrap: 'text-orange-800/95',
    sep: 'text-orange-400',
    strong: 'text-orange-950 font-medium',
    label: 'text-orange-700',
  },
  green: {
    wrap: 'text-green-800/95',
    sep: 'text-green-400',
    strong: 'text-green-950 font-medium',
    label: 'text-green-700',
  },
  muted: {
    wrap: 'text-gray-700',
    sep: 'text-gray-400',
    strong: 'text-gray-900 font-medium',
    label: 'text-gray-600',
  },
};

function shortWeekday(full: string): string {
  return full.length <= 3 ? full : full.slice(0, 3);
}

/**
 * Compact open/close line: fits in roughly the same space as one paragraph line (wraps on narrow screens).
 */
export function ScheduleWindowPairCards({
  parts,
  tone,
}: {
  parts: ScheduleWindowParts;
  tone: Tone;
}) {
  const t = toneText[tone];
  const openOneLine = `${shortWeekday(parts.open.weekday)} ${parts.open.dateStr} · ${parts.open.timeStr}`;
  const closeOneLine = `${shortWeekday(parts.close.weekday)} ${parts.close.dateStr} · ${parts.close.timeStr}`;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs leading-snug ${t.wrap}`}
      role="group"
      aria-label={`Customization opens ${parts.open.weekday} ${parts.open.dateStr} at ${parts.open.timeStr}, closes ${parts.close.weekday} ${parts.close.dateStr} at ${parts.close.timeStr}`}
    >
      <span className="inline-flex flex-wrap items-baseline gap-x-1 min-w-0">
        <span className={`uppercase tracking-wide text-[9px] sm:text-[10px] ${t.label}`}>Opens</span>
        <span className={`tabular-nums ${t.strong}`}>{openOneLine}</span>
      </span>
      <span className={`select-none ${t.sep}`} aria-hidden>
        ·
      </span>
      <span className="inline-flex flex-wrap items-baseline gap-x-1 min-w-0">
        <span className={`uppercase tracking-wide text-[9px] sm:text-[10px] ${t.label}`}>Closes</span>
        <span className={`tabular-nums ${t.strong}`}>{closeOneLine}</span>
      </span>
    </div>
  );
}
