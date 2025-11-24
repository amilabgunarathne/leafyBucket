import React from 'react';
import { Shuffle, Lock, Leaf, TreePine, Flower, RefreshCw } from 'lucide-react';
import { useWeekly } from '../contexts/WeeklyContext';
import { vegetables } from '../data/vegetables';

interface WeeklyVegetableDisplayProps {
  planId: 'small' | 'medium' | 'large';
  showShuffleButton?: boolean;
}

const WeeklyVegetableDisplay: React.FC<WeeklyVegetableDisplayProps> = ({ 
  planId, 
  showShuffleButton = false 
}) => {
  const { currentWeekSelection, isCustomizationAllowed, refreshWeeklySelection } = useWeekly();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'root': return TreePine;
      case 'leafy': return Leaf;
      case 'bushy': return Flower;
      default: return Leaf;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'root': return 'text-orange-600 bg-orange-100';
      case 'leafy': return 'text-green-600 bg-green-100';
      case 'bushy': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const handleShuffle = () => {
    if (isCustomizationAllowed) {
      refreshWeeklySelection(planId);
    }
  };

  if (!currentWeekSelection) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading this week's selection...</p>
        </div>
      </div>
    );
  }

  const weekVegetables = currentWeekSelection.vegetables
    .map(vegId => vegetables.find(v => v.id === vegId))
    .filter(Boolean);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
            <Shuffle className="h-5 w-5 text-green-600" />
            <span>This Week's Selection</span>
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Week of {new Date(currentWeekSelection.startDate).toLocaleDateString()}
          </p>
        </div>
        
        {showShuffleButton && (
          <button
            onClick={handleShuffle}
            disabled={!isCustomizationAllowed}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isCustomizationAllowed
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isCustomizationAllowed ? (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Shuffle</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                <span>Locked</span>
              </>
            )}
          </button>
        )}
      </div>

      {!isCustomizationAllowed && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <Lock className="h-4 w-4 text-orange-600" />
            <span className="text-sm text-orange-800">
              Customization period has ended. Changes will be available next Monday.
            </span>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {weekVegetables.map((vegetable) => {
          if (!vegetable) return null;
          
          const CategoryIcon = getCategoryIcon(vegetable.category);
          
          return (
            <div
              key={vegetable.id}
              className="p-4 rounded-xl border-2 border-gray-200 hover:border-green-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="font-semibold text-gray-900">{vegetable.name}</h4>
                    <div className={`p-1 rounded-full ${getCategoryColor(vegetable.category)}`}>
                      <CategoryIcon className="h-3 w-3" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{vegetable.description}</p>
                  <div className="text-xs text-green-600">
                    Typical weight: {vegetable.typicalWeight}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Distribution */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
        <h4 className="font-semibold text-gray-900 mb-3">Category Distribution</h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          {['root', 'leafy', 'bushy'].map(category => {
            const categoryVegs = weekVegetables.filter(v => v?.category === category);
            const Icon = getCategoryIcon(category);
            
            return (
              <div key={category} className={`p-3 rounded-lg ${getCategoryColor(category)}`}>
                <Icon className="h-5 w-5 mx-auto mb-1" />
                <div className="text-sm font-medium capitalize">{category}</div>
                <div className="text-lg font-bold">{categoryVegs.length}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-gray-500">
        Selection automatically shuffled weekly to ensure variety
      </div>
    </div>
  );
};

export default WeeklyVegetableDisplay;