import React from 'react';
import { Calendar, Clock, Truck, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { useWeekly } from '../contexts/WeeklyContext';

const WeeklyScheduleInfo = () => {
  const { isCustomizationAllowed, timeRemaining, currentWeekSelection } = useWeekly();

  const formatTimeRemaining = () => {
    if (timeRemaining.isExpired) {
      return "Customization period ended";
    }
    
    if (timeRemaining.days > 0) {
      return `${timeRemaining.days} days, ${timeRemaining.hours} hours remaining`;
    } else if (timeRemaining.hours > 0) {
      return `${timeRemaining.hours} hours, ${timeRemaining.minutes} minutes remaining`;
    } else {
      return `${timeRemaining.minutes} minutes remaining`;
    }
  };

  const getStatusColor = () => {
    if (!isCustomizationAllowed) return 'text-orange-600 bg-orange-100';
    if (timeRemaining.days === 0 && timeRemaining.hours < 24) return 'text-orange-600 bg-orange-100';
    return 'text-green-600 bg-green-100';
  };

  const getStatusIcon = () => {
    if (!isCustomizationAllowed) return Clock;
    if (timeRemaining.days === 0 && timeRemaining.hours < 24) return Clock;
    return CheckCircle;
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
        <Calendar className="h-5 w-5 text-green-600" />
        <span>Weekly Schedule</span>
      </h3>
      
      {/* Current Status */}
      <div className={`p-4 rounded-xl mb-4 ${getStatusColor()}`}>
        <div className="flex items-center space-x-3">
          <StatusIcon className="h-5 w-5" />
          <div>
            <div className="font-semibold">
              {isCustomizationAllowed ? 'Customization Open' : 'Customization Closed'}
            </div>
            <div className="text-sm">
              {formatTimeRemaining()}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <Settings className="h-4 w-4 text-blue-600" />
            <div>
              <div className="font-medium text-blue-900">Monday - Friday</div>
              <div className="text-sm text-blue-700">Customization Period</div>
            </div>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            isCustomizationAllowed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {isCustomizationAllowed ? 'OPEN' : 'CLOSED'}
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <Clock className="h-4 w-4 text-gray-600" />
            <div>
              <div className="font-medium text-gray-900">Friday Midnight</div>
              <div className="text-sm text-gray-600">Customization Deadline</div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            23:59:59
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <Truck className="h-4 w-4 text-green-600" />
            <div>
              <div className="font-medium text-green-900">Sunday</div>
              <div className="text-sm text-green-700">Delivery Day</div>
            </div>
          </div>
          <div className="text-xs text-green-600">
            8 AM - 12 PM
          </div>
        </div>
      </div>

      {/* Next Week Info */}
      {!isCustomizationAllowed && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-800">
            <strong>Customization is currently open!</strong> You can make changes until Friday at 11:59 PM
          </div>
        </div>
      )}

      {/* Current Week Delivery */}
      {currentWeekSelection && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-800">
            <strong>This week's delivery:</strong> {new Date(currentWeekSelection.deliveryDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyScheduleInfo;