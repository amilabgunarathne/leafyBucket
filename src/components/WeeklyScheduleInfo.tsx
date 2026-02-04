import React from 'react';
import { Calendar, Clock, CheckCircle, Truck } from 'lucide-react';
import { useWeekly } from '../contexts/WeeklyContext';
import { getDeliveryDate } from '../utils/weeklyShuffling';

const WeeklyScheduleInfo = () => {
  const { isCustomizationAllowed, timeRemaining } = useWeekly();

  const formatTimeRemaining = () => {
    if (!isCustomizationAllowed) return null;
    if (timeRemaining.isExpired) return "Customization period ended";
    if (timeRemaining.days > 0) return `${timeRemaining.days} days, ${timeRemaining.hours} hours remaining`;
    if (timeRemaining.hours > 0) return `${timeRemaining.hours} hours, ${timeRemaining.minutes} minutes remaining`;
    return `${timeRemaining.minutes} minutes remaining`;
  };

  const getStatusColor = () => {
    if (!isCustomizationAllowed) return 'text-orange-600 bg-orange-100';
    if (timeRemaining.days === 0 && timeRemaining.hours < 24) return 'text-orange-600 bg-orange-100';
    return 'text-green-600 bg-green-100';
  };

  const StatusIcon = !isCustomizationAllowed || (timeRemaining.days === 0 && timeRemaining.hours < 24) ? Clock : CheckCircle;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
        <Calendar className="h-5 w-5 text-green-600" />
        <span>Weekly Schedule</span>
      </h3>

      {/* Customization status: Open or Closed + open/close times */}
      <div className={`p-4 rounded-xl mb-4 ${getStatusColor()}`}>
        <div className="flex items-center space-x-3">
          <StatusIcon className="h-5 w-5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">
              {isCustomizationAllowed ? 'Customization Open' : 'Customization Closed'}
            </div>
            <div className="text-sm opacity-90 mt-0.5">
              Opens Wed 00:01 · Closes Fri end (Sat 00:00)
            </div>
            {isCustomizationAllowed && formatTimeRemaining() && (
              <div className="text-sm mt-1 font-medium">
                {formatTimeRemaining()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delivery date – always use actual next Sunday from getDeliveryDate() */}
      <div className="p-4 rounded-xl bg-green-50 border border-green-200">
        <div className="flex items-center space-x-3">
          <Truck className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <div className="font-semibold text-green-900">Delivery date</div>
            <div className="text-sm text-green-800">
              {getDeliveryDate().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyScheduleInfo;