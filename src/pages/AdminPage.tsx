import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Upload, Download, Settings, AlertCircle, CheckCircle, ExternalLink, Copy, Eye, EyeOff, Shield, User, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Package, DollarSign, Users, LayoutGrid, Calendar, Percent } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VegetableService, { Vegetable } from '../services/vegetableService';
import { supabase } from '../lib/supabase';
import type { BucketType } from '../services/SubscriptionService';

export interface MarketWeek {
  id: string;
  week_start_date: string;
  week_end_date: string;
  is_locked: boolean;
  created_at?: string;
}

const AdminPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('vegetables');
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [bucketTypes, setBucketTypes] = useState<BucketType[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([]);
  const [marketWeeks, setMarketWeeks] = useState<MarketWeek[]>([]);
  const [selectedMarketWeekId, setSelectedMarketWeekId] = useState<string | null>(null);
  const [marketPricesByWeek, setMarketPricesByWeek] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedVegetable, setSelectedVegetable] = useState<Vegetable | null>(null);
  const [showVegetableModal, setShowVegetableModal] = useState(false);
  const [vegCategories, setVegCategories] = useState<{ id: string; name: string; budget_share_percent: number }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedMarketWeekId) return;
    const loadPricesForWeek = async () => {
      const { data } = await supabase
        .from('market_prices')
        .select('vegetable_id, price_per_unit')
        .eq('market_week_id', selectedMarketWeekId);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => { map[r.vegetable_id] = r.price_per_unit; });
      setMarketPricesByWeek(map);
    };
    loadPricesForWeek();
  }, [selectedMarketWeekId]);

  const loadData = async () => {
    setLoading(true);
    try {
      await VegetableService.getInstance().initialize();
      const vegList = VegetableService.getInstance().getAllVegetables();

      let btList: BucketType[] = [];
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        btList = await SubscriptionService.getInstance().getBucketTypes();
      } catch {
        const { data } = await supabase.from('bucket_types').select('*').order('monthly_price');
        btList = (data || []) as BucketType[];
      }

      const { data: profData } = await supabase.from('profiles').select('id, email, full_name, role');
      const { data: weeksData } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, created_at').order('week_start_date', { ascending: false });
      const { data: catData } = await supabase.from('veg_categories').select('id, name, budget_share_percent').order('name');
      // Dedupe by name so we show one row per category (DB may have had duplicate seeds)
      const byName = new Map<string, { id: string; name: string; budget_share_percent: number }>();
      (catData || []).forEach((r: { id: string; name: string; budget_share_percent?: number | null }) => {
        const key = (r.name || '').toLowerCase();
        if (!byName.has(key)) {
          const pct = r.budget_share_percent != null ? Number(r.budget_share_percent) : NaN;
          byName.set(key, {
            id: r.id,
            name: r.name,
            budget_share_percent: !Number.isNaN(pct) && pct >= 0 ? Math.round(Math.min(100, pct)) : 34
          });
        }
      });
      setVegCategories(Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)));
      const weeks = (weeksData || []) as MarketWeek[];
      setMarketWeeks(weeks);
      if (weeks.length > 0 && !selectedMarketWeekId) setSelectedMarketWeekId(weeks[0].id);

      setVegetables(vegList);
      setBucketTypes(btList);
      setProfiles(profData || []);
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
    } catch (error: unknown) {
      const err = error as { message?: string };
      const errMsg = err?.message ?? (error instanceof Error ? error.message : String(error));
      setMessage({ type: 'error', text: `Failed to save vegetable: ${errMsg}` });
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
                Back to site
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
                { id: 'vegetables', label: 'Vegetables', icon: Package },
                { id: 'buckets', label: 'Bucket types', icon: LayoutGrid },
                { id: 'ratios', label: 'Category ratios', icon: Percent },
                { id: 'prices', label: 'Market prices', icon: DollarSign },
                { id: 'weeks', label: 'Market weeks', icon: Calendar },
                { id: 'users', label: 'Users', icon: Users },
                { id: 'system', label: 'System', icon: Settings }
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

            {activeTab === 'buckets' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Bucket types</h2>
                <p className="text-sm text-gray-600">Edit plan sizes and pricing. Changes affect new subscriptions.</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {bucketTypes.map((bt) => (
                    <BucketTypeCard
                      key={bt.id}
                      bucketType={bt}
                      onSave={async (updates) => {
                        const payload: Record<string, unknown> = {
                          name: updates.name,
                          description: updates.description,
                          display_item_range: updates.display_item_range,
                          monthly_price: updates.monthly_price,
                          handling_fee: updates.handling_fee,
                          is_active: updates.is_active
                        };
                        if (updates.root_count !== undefined) payload.root_count = updates.root_count;
                        if (updates.bushy_count !== undefined) payload.bushy_count = updates.bushy_count;
                        if (updates.leafy_count !== undefined) payload.leafy_count = updates.leafy_count;
                        const { error } = await supabase.from('bucket_types').update(payload).eq('id', bt.id);
                        if (error) throw error;
                        setMessage({ type: 'success', text: 'Bucket type updated' });
                        loadData();
                      }}
                    />
                  ))}
                </div>
                {bucketTypes.length === 0 && !loading && (
                  <p className="text-gray-500">No bucket types. Add them in Supabase or run migrations.</p>
                )}
              </div>
            )}

            {activeTab === 'ratios' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Category budget share (%)</h2>
                <p className="text-sm text-gray-600">
                  Percentage of the bucket budget for each category (root, leafy, bushy). Values should sum to 100%.
                </p>
                <div className="max-w-md space-y-4">
                  {vegCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between gap-4 p-4 border border-gray-200 rounded-lg bg-white">
                      <span className="font-medium text-gray-900 capitalize">{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={cat.budget_share_percent}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v)) setVegCategories(prev => prev.map(c => c.id === cat.id ? { ...c, budget_share_percent: Math.max(0, Math.min(100, v)) } : c));
                          }}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        />
                        <span className="text-sm text-gray-500 w-6">%</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { error } = await supabase.from('veg_categories').update({ budget_share_percent: cat.budget_share_percent }).eq('id', cat.id);
                              if (error) throw error;
                              await VegetableService.getInstance().refreshCategoryRatios();
                              setMessage({ type: 'success', text: `Budget share for ${cat.name} saved` });
                            } catch (err: unknown) {
                              const e = err as { message?: string };
                              setMessage({ type: 'error', text: e?.message || 'Failed to save' });
                            }
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
                  {vegCategories.length > 0 && (
                    <p className="text-sm text-gray-600 pt-2">
                      Total: <strong>{vegCategories.reduce((s, c) => s + c.budget_share_percent, 0)}%</strong>
                      {vegCategories.reduce((s, c) => s + c.budget_share_percent, 0) !== 100 && (
                        <span className="text-amber-600 ml-2">(should be 100%)</span>
                      )}
                    </p>
                  )}
                </div>
                {vegCategories.length === 0 && !loading && (
                  <p className="text-gray-500">No categories found. Run the migration that creates veg_categories and seeds root, leafy, bushy.</p>
                )}
              </div>
            )}

            {activeTab === 'prices' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Market prices (per 250g, per week)</h2>
                <p className="text-sm text-gray-600">Select a market week, then set prices per vegetable. Used for allocation when that week is active.</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Market week</label>
                  <select
                    value={selectedMarketWeekId || ''}
                    onChange={(e) => setSelectedMarketWeekId(e.target.value || null)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 max-w-xs"
                  >
                    <option value="">Select week</option>
                    {marketWeeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.week_start_date} → {w.week_end_date} {w.is_locked ? '(locked)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedMarketWeekId && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Vegetable</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Price (LKR)</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {vegetables.map((v) => (
                          <tr key={v.id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{v.name}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="w-24 px-2 py-1 border rounded"
                                value={marketPricesByWeek[v.id] ?? v.marketPricePer250g ?? ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(val)) setMarketPricesByWeek((prev) => ({ ...prev, [v.id]: val }));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="text-sm text-green-600 hover:text-green-800"
                                onClick={async () => {
                                  const price = marketPricesByWeek[v.id] ?? v.marketPricePer250g;
                                  if (price == null) return;
                                  const row = { market_week_id: selectedMarketWeekId, vegetable_id: v.id, price_per_unit: price };
                                  const { error } = await supabase.from('market_prices').upsert(row, { onConflict: 'market_week_id,vegetable_id' });
                                  if (error) {
                                    setMessage({ type: 'error', text: error.message });
                                    return;
                                  }
                                  setMessage({ type: 'success', text: `Price for ${v.name} saved` });
                                  setMarketPricesByWeek((prev) => ({ ...prev, [v.id]: price }));
                                }}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'weeks' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Market weeks</h2>
                <p className="text-sm text-gray-600">Define week windows for pricing and delivery. Lock a week to prevent further changes.</p>
                <MarketWeeksSection marketWeeks={marketWeeks} onRefresh={loadData} setMessage={setMessage} />
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Users & roles</h2>
                <p className="text-sm text-gray-600">Change role to admin to grant access to this panel.</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Name</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Role</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {profiles.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{p.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{p.full_name || '—'}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs ${p.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                              {p.role || 'user'}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              className="text-sm text-green-600 hover:text-green-800"
                              onClick={async () => {
                                const newRole = p.role === 'admin' ? 'user' : 'admin';
                                const { error } = await supabase.from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', p.id);
                                if (error) {
                                  setMessage({ type: 'error', text: error.message });
                                  return;
                                }
                                setMessage({ type: 'success', text: `Role set to ${newRole}` });
                                loadData();
                              }}
                            >
                              {p.role === 'admin' ? 'Set as user' : 'Set as admin'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {profiles.length === 0 && !loading && <p className="text-gray-500">No profiles found.</p>}
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

// Bucket type card: name, description, display_item_range, monthly_price, handling_fee, is_active, root_count, leafy_count, bushy_count
const BucketTypeCard: React.FC<{
  bucketType: BucketType;
  onSave: (updates: Partial<BucketType> & { is_active?: boolean }) => Promise<void>;
}> = ({ bucketType, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: bucketType.name,
    description: bucketType.description || '',
    display_item_range: bucketType.display_item_range || '',
    monthly_price: bucketType.monthly_price,
    handling_fee: bucketType.handling_fee,
    is_active: (bucketType as any).is_active !== false,
    root_count: bucketType.root_count ?? 1,
    leafy_count: bucketType.leafy_count ?? 1,
    bushy_count: bucketType.bushy_count ?? 2
  });

  const handleSave = async () => {
    await onSave(form);
    setEditing(false);
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      {!editing ? (
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-gray-900">{bucketType.name}</h3>
            <p className="text-sm text-gray-600">LKR {bucketType.monthly_price} / mo</p>
            <p className="text-xs text-gray-500">Handling: LKR {bucketType.handling_fee} · Items: {bucketType.display_item_range}</p>
            <p className="text-xs text-gray-500 mt-1">Root: {bucketType.root_count ?? 1} · Leafy: {bucketType.leafy_count ?? 1} · Bushy: {bucketType.bushy_count ?? 2}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-green-600 hover:text-green-800 text-sm">Edit</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Display range e.g. 4-6" value={form.display_item_range} onChange={(e) => setForm((f) => ({ ...f, display_item_range: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="w-full px-2 py-1 border rounded text-sm" placeholder="Monthly price" value={form.monthly_price} onChange={(e) => setForm((f) => ({ ...f, monthly_price: Number(e.target.value) || 0 }))} />
            <input type="number" className="w-full px-2 py-1 border rounded text-sm" placeholder="Handling fee" value={form.handling_fee} onChange={(e) => setForm((f) => ({ ...f, handling_fee: Number(e.target.value) || 0 }))} />
          </div>
          <p className="text-xs text-gray-600 mt-2">Vegetables per bucket (for budget split):</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500">Root</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.root_count} onChange={(e) => setForm((f) => ({ ...f, root_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Leafy</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.leafy_count} onChange={(e) => setForm((f) => ({ ...f, leafy_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Bushy</label>
              <input type="number" min={0} className="w-full px-2 py-1 border rounded text-sm" value={form.bushy_count} onChange={(e) => setForm((f) => ({ ...f, bushy_count: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleSave} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// Market weeks: list, add, edit (week_start_date, week_end_date, is_locked)
const MarketWeeksSection: React.FC<{
  marketWeeks: MarketWeek[];
  onRefresh: () => void;
  setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void;
}> = ({ marketWeeks, onRefresh, setMessage }) => {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ week_start_date: '', week_end_date: '', is_locked: false });

  const handleCreate = async () => {
    const { error } = await supabase.from('market_weeks').insert({
      week_start_date: form.week_start_date,
      week_end_date: form.week_end_date,
      is_locked: form.is_locked
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Market week created' });
    setForm({ week_start_date: '', week_end_date: '', is_locked: false });
    setAdding(false);
    onRefresh();
  };

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('market_weeks').update({
      week_start_date: form.week_start_date,
      week_end_date: form.week_end_date,
      is_locked: form.is_locked
    }).eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Market week updated' });
    setEditId(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setAdding(true); setForm({ week_start_date: '', week_end_date: '', is_locked: false }); }}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
      >
        Add week
      </button>
      {(adding || editId) && (
        <div className="p-4 border rounded-lg bg-gray-50 space-y-2 max-w-md">
          <input type="date" className="w-full px-2 py-1 border rounded text-sm" placeholder="Start date" value={form.week_start_date} onChange={(e) => setForm((f) => ({ ...f, week_start_date: e.target.value }))} />
          <input type="date" className="w-full px-2 py-1 border rounded text-sm" placeholder="End date" value={form.week_end_date} onChange={(e) => setForm((f) => ({ ...f, week_end_date: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_locked} onChange={(e) => setForm((f) => ({ ...f, is_locked: e.target.checked }))} /> Locked</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => editId ? handleUpdate(editId) : handleCreate()} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm">Save</button>
            <button type="button" onClick={() => { setAdding(false); setEditId(null); }} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-gray-200">
        {marketWeeks.map((w) => (
          <li key={w.id} className="py-2 flex items-center justify-between">
            <span className="text-sm">{w.week_start_date} → {w.week_end_date} {w.is_locked ? '(locked)' : ''}</span>
            <button type="button" onClick={() => { setEditId(w.id); setForm({ week_start_date: w.week_start_date, week_end_date: w.week_end_date, is_locked: w.is_locked }); }} className="text-green-600 text-sm">Edit</button>
          </li>
        ))}
      </ul>
      {marketWeeks.length === 0 && !adding && <p className="text-gray-500 text-sm">No market weeks. Add one to use week-scoped prices.</p>}
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
    category: vegetable?.category || 'leafy',
    season: vegetable?.season || 'Year-round',
    nutritionScore: vegetable?.nutritionScore ?? 5,
    description: vegetable?.description || '',
    marketPricePer250g: vegetable?.marketPricePer250g || 100,
    typicalWeight: vegetable?.typicalWeight || '250g',
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