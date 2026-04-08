import { Clock, Check } from 'lucide-react';
import { useWeekly } from '../contexts/WeeklyContext';
import { ScheduleWindowPairCards } from './ScheduleWindowPairCards';

export type CustomizationWindowStatusVariant = 'banner' | 'header';

type Props = { variant?: CustomizationWindowStatusVariant };

/**
 * Weekly customization window status (open vs closed + schedule copy).
 * `header`: compact strip for My Bucket top bar. `banner`: full-width block (legacy).
 */
const CustomizationWindowStatusBanner = ({ variant = 'banner' }: Props) => {
  const { isCustomizationAllowed, scheduleDisplay, timeRemaining } = useWeekly();
  const isHeader = variant === 'header';

  const formatTimeRemaining = () => {
    if (timeRemaining.isExpired) return 'Customization period has ended';
    if (timeRemaining.days > 0) return `${timeRemaining.days} days, ${timeRemaining.hours} hours left`;
    if (timeRemaining.hours > 0) return `${timeRemaining.hours} hours, ${timeRemaining.minutes} minutes left`;
    return `${timeRemaining.minutes} minutes left`;
  };

  if (!isCustomizationAllowed) {
    const hasParts = scheduleDisplay?.windowParts;

    if (isHeader) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2 w-full max-w-full sm:max-w-xl lg:max-w-2xl">
          <Clock className="h-4 w-4 shrink-0 text-orange-600 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-xs font-semibold text-orange-900 leading-tight">Customization closed</div>
            {hasParts ? (
              <ScheduleWindowPairCards parts={scheduleDisplay.windowParts} tone="orange" />
            ) : (
              <p className="text-[11px] text-orange-800 leading-snug">
                {scheduleDisplay
                  ? `Opens ${scheduleDisplay.openLabel} · Closes ${scheduleDisplay.closeLabel}`
                  : 'Opening and closing times are set by the market.'}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-8 w-full rounded-xl border-2 border-orange-200 bg-orange-50 p-3 sm:p-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <Clock className="h-5 w-5 shrink-0 text-orange-600 mt-0.5" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm font-semibold text-orange-900">Customization closed</div>
            {hasParts ? (
              <ScheduleWindowPairCards parts={scheduleDisplay.windowParts} tone="orange" />
            ) : (
              <p className="text-sm text-orange-800">
                {scheduleDisplay
                  ? `Opens ${scheduleDisplay.openLabel} · Closes ${scheduleDisplay.closeLabel}`
                  : 'Opening and closing times are set by the market.'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isHeader) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 sm:max-w-md">
        <Check className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
        <div className="min-w-0 text-left">
          <div className="text-sm font-semibold text-green-900 leading-tight">Customization open</div>
          <div className="text-xs font-medium text-green-800 tabular-nums leading-snug">{formatTimeRemaining()}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 w-full rounded-xl border-2 border-green-200 bg-green-50 p-4">
      <div className="flex items-center justify-center space-x-3 text-center sm:justify-start sm:text-left">
        <Check className="h-6 w-6 shrink-0 text-green-600" aria-hidden />
        <div>
          <div className="font-semibold text-green-900">Customization open</div>
          <div className="text-sm font-medium text-green-800 tabular-nums">{formatTimeRemaining()}</div>
        </div>
      </div>
    </div>
  );
};

export default CustomizationWindowStatusBanner;
