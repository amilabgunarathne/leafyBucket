import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw, Upload, Download, Settings, AlertCircle, CheckCircle, ExternalLink, Copy, Eye, EyeOff, Shield, User, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VegetableService, { Vegetable } from '../services/vegetableService';

const AdminPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('vegetables');
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedVegetable, setSelectedVegetable] = useState<Vegetable | null>(null);
  const [showVegetableModal, setShowVegetableModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const vegetablesResponse = await VegetableService.getAllVegetables();
      setVegetables(vegetablesResponse);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify({ vegetables }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `admin-data-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.vegetables) setVegetables(data.vegetables);
          setMessage({ type: 'success', text: 'Data imported successfully' });
        } catch (error) {
          setMessage({ type: 'error', text: 'Failed to import data' });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleVegetableAction = (action: 'add' | 'edit' | 'delete', vegetable?: Vegetable) => {
    if (action === 'add') {
      setSelectedVegetable(null);
      setShowVegetableModal(true);
    } else if (action === 'edit' && vegetable) {
      setSelectedVegetable(vegetable);
      setShowVegetableModal(true);
    } else if (action === 'delete' && vegetable) {
      if (confirm(`Are you sure you want to delete ${vegetable.name}?`)) {
        VegetableService.getInstance().deleteVegetable(vegetable.id);
        setVegetables(prev => prev.filter(v => v.id !== vegetable.id));
        setMessage({ type: 'success', text: 'Vegetable deleted successfully' });
      }
    }
  };

  const handleVegetableSave = async (vegetableData: any) => {
    try {
      if (selectedVegetable) {
        // Update existing
        const updated = await VegetableService.updateVegetable(selectedVegetable.id, vegetableData);
        setVegetables(prev => prev.map(v => v.id === selectedVegetable.id ? updated : v));
        setMessage({ type: 'success', text: 'Vegetable updated successfully' });
      } else {
        // Add new
        const newVegetable = await VegetableService.createVegetable(vegetableData);
        setVegetables(prev => [...prev, newVegetable]);
        setMessage({ type: 'success', text: 'Vegetable added successfully' });
      }
      setShowVegetableModal(false);
      setSelectedVegetable(null);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save vegetable' });
    }
  };

  const handlePriceUpdate = async (vegetableId: string, newPrice: number) => {
    try {
      await VegetableService.updateVegetable(vegetableId, { marketPricePer250g: newPrice });
      setVegetables(prev => prev.map(v => 
        v.id === vegetableId ? { ...v, marketPricePer250g: newPrice } : v
      ));
      setMessage({ type: 'success', text: 'Price updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update price' });
    }
  };

  const handleToggleAvailability = async (vegetableId: string) => {
    try {
      const vegetableService = VegetableService.getInstance();
      const success = vegetableService.toggleVegetableStatus(vegetableId);
      
      if (!success) {
        setMessage({ type: 'error', text: 'Failed to update availability' });
        return;
      }
      
      // Update local state immediately
      setVegetables(prev => prev.map(v => 
        v.id === vegetableId ? { ...v, isAvailable: !v.isAvailable } : v
      ));
      
      setMessage({ type: 'success', text: 'Availability updated successfully' });
      
      // Force a refresh of the vegetables list to ensure consistency
      setTimeout(() => {
        loadData();
      }, 100);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update availability' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Site
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center space-x-2">
                <Shield className="w-6 h-6 text-green-600" />
                <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'} border-l-4 p-4`}>
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2" />
            )}
            <span>{message.text}</span>
            <button 
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: 'vegetables', label: 'Vegetable Catalog & Pricing', icon: Package },
                { id: 'system', label: 'System Settings', icon: Settings }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'vegetables' && (
              <div className="space-y-6">
                {/* Vegetables Controls */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Vegetable Catalog & Pricing</h2>
                    <p className="text-sm text-gray-600">Manage available vegetables, their details, and pricing</p>
                  </div>
                  <button
                    onClick={() => handleVegetableAction('add')}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Vegetable</span>
                  </button>
                </div>

                {/* Vegetables Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {vegetables.map((vegetable) => (
                    <div key={vegetable.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{vegetable.name}</h3>
                          <p className="text-sm text-gray-600 capitalize">{vegetable.category}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleVegetableAction('edit', vegetable)}
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleVegetableAction('delete', vegetable)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Price Editor */}
                      <div className="mb-4 p-3 bg-green-50 rounded-lg">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Price per 250g (LKR)
                        </label>
                        <input
                          type="number"
                          value={vegetable.marketPricePer250g}
                          onChange={(e) => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            handlePriceUpdate(vegetable.id, newPrice);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Season:</span>
                          <span className="font-medium">{vegetable.season}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nutrition Score:</span>
                          <span className="font-medium">{vegetable.nutritionScore}/10</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Available:</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleAvailability(vegetable.id);
                            }}
                            className="flex items-center"
                            type="button"
                          >
                            {vegetable.isAvailable ? (
                              <ToggleRight className="w-6 h-6 text-green-600 hover:text-green-700 transition-colors" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6">
                {/* System Settings */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">System Settings</h2>
                  <p className="text-sm text-gray-600">Configure system-wide settings and integrations</p>
                </div>

                {/* API Configuration */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        External Pricing API Key
                      </label>
                      <div className="flex items-center space-x-3">
                        <div className="relative flex-1">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter API key..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(apiKey);
                            setMessage({ type: 'success', text: 'API key copied to clipboard' });
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Management */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Data Management</h3>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleExportData}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Data</span>
                    </button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        <Upload className="w-4 h-4" />
                        <span>Import Data</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* External Links */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">External Resources</h3>
                  <div className="space-y-3">
                    <a
                      href="https://api.example.com/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Pricing API Documentation</span>
                    </a>
                    <a
                      href="https://dashboard.example.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>External Dashboard</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vegetable Modal */}
      {showVegetableModal && (
        <VegetableModal
          vegetable={selectedVegetable}
          onSave={handleVegetableSave}
          onClose={() => {
            setShowVegetableModal(false);
            setSelectedVegetable(null);
          }}
        />
      )}
    </div>
  );
};

// Vegetable Add/Edit Modal Component
const VegetableModal: React.FC<{
  vegetable?: Vegetable | null;
  onSave: (data: any) => void;
  onClose: () => void;
}> = ({ vegetable, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: vegetable?.name || '',
    category: vegetable?.category || '',
    season: vegetable?.season || '',
    nutritionScore: vegetable?.nutritionScore || 5,
    description: vegetable?.description || '',
    marketPricePer250g: vegetable?.marketPricePer250g || 100,
    baseValue: vegetable?.baseValue || 3,
    typicalWeight: vegetable?.typicalWeight || '250g',
    weightPerValuePoint: vegetable?.weightPerValuePoint || 100,
    benefits: vegetable?.benefits?.join(', ') || '',
    image: vegetable?.image || 'https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=400',
    isAvailable: vegetable?.isAvailable ?? true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      benefits: formData.benefits.split(',').map(b => b.trim()).filter(b => b.length > 0)
    };
    
    onSave(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {vegetable ? 'Edit Vegetable' : 'Add New Vegetable'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              >
                <option value="">Select category</option>
                <option value="leafy">Leafy Greens</option>
                <option value="root">Root Vegetables</option>
                <option value="bushy">Bushy Vegetables</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price per 250g (LKR)</label>
              <input
                type="number"
                value={formData.marketPricePer250g}
                onChange={(e) => setFormData(prev => ({ ...prev, marketPricePer250g: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
              <select
                value={formData.season}
                onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              >
                <option value="">Select season</option>
                <option value="spring">Spring</option>
                <option value="summer">Summer</option>
                <option value="monsoon">Monsoon</option>
                <option value="winter">Winter</option>
                <option value="year-round">Year Round</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Value</label>
              <input
                type="number"
                value={formData.baseValue}
                onChange={(e) => setFormData(prev => ({ ...prev, baseValue: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="1"
                max="10"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typical Weight</label>
              <input
                type="text"
                value={formData.typicalWeight}
                onChange={(e) => setFormData(prev => ({ ...prev, typicalWeight: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., 250g"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight per Value Point</label>
              <input
                type="number"
                value={formData.weightPerValuePoint}
                onChange={(e) => setFormData(prev => ({ ...prev, weightPerValuePoint: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="1"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nutrition Score ({formData.nutritionScore}/10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.nutritionScore}
              onChange={(e) => setFormData(prev => ({ ...prev, nutritionScore: parseInt(e.target.value) }))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Benefits (comma-separated)</label>
            <input
              type="text"
              value={formData.benefits}
              onChange={(e) => setFormData(prev => ({ ...prev, benefits: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="e.g., High in vitamin C, Good for digestion"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
            <input
              type="url"
              value={formData.image}
              onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="https://..."
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isAvailable"
              checked={formData.isAvailable}
              onChange={(e) => setFormData(prev => ({ ...prev, isAvailable: e.target.checked }))}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
            <label htmlFor="isAvailable" className="ml-2 block text-sm text-gray-900">
              Available for purchase
            </label>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {vegetable ? 'Update' : 'Add'} Vegetable
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminPage;