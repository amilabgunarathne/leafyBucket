import { supabase } from '../lib/supabase';

// Vegetable management service for dynamic CRUD operations
export interface Vegetable {
  id: string;
  name: string;
  category: 'root' | 'leafy' | 'bushy';
  typicalWeight: string;
  marketPricePer250g: number;
  description: string;
  season: string;
  benefits: string[];
  image: string;
  isAvailable: boolean;
  nutritionScore: number;
  createdAt: string;
  updatedAt: string;
  // New fields from schema
  categoryId?: string;
  unitType?: string;
  isSubstitutable?: boolean;
}

/** Budget share per category as percentage (0–100). Sum should be 100. */
export type CategoryRatios = { root: number; leafy: number; bushy: number };

const DEFAULT_CATEGORY_PERCENTS: CategoryRatios = { root: 44, leafy: 22, bushy: 34 };

class VegetableService {
  private static instance: VegetableService;
  private vegetables: Map<string, Vegetable> = new Map();
  private categoryRatios: CategoryRatios = { ...DEFAULT_CATEGORY_PERCENTS };
  /** Per-bucket-type ratios (bucket_type_id -> { root, leafy, bushy }). */
  private bucketTypeRatios: Map<string, CategoryRatios> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  static getInstance(): VegetableService {
    if (!VegetableService.instance) {
      VegetableService.instance = new VegetableService();
    }
    return VegetableService.instance;
  }

  // Initialize with vegetables from Supabase
  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log('Initializing VegetableService with Supabase...');

        const { data, error } = await supabase
          .from('vegetables')
          .select('*, category:veg_categories(name, soft_ratio_weight)');

        if (error) {
          console.error('VegetableService: Supabase error:', error);
          throw error;
        }

        console.log('VegetableService: Raw data received:', data);
        if (data && data.length > 0) {
          console.log('First Item Keys:', Object.keys(data[0]));
        }

        if (data) {
          this.vegetables.clear();
          data.forEach((row: any) => {
            if (!row.id || !row.name) {
              console.warn('Skipping invalid row:', row);
              return;
            }

            // Determine category string robustly
            let categoryStr = 'leafy'; // Default fallback

            // Check if 'category' is the join object from veg_categories
            if (row.category && typeof row.category === 'object' && row.category.name) {
              categoryStr = row.category.name.toLowerCase();
            } else if (typeof row.category === 'string') {
              categoryStr = row.category.toLowerCase();
            } else if (row.category_id) {
              // If we have ID but no join object, we might want to fetch it, 
              // but for now let's hope the join worked.
              console.warn(`Vegetable ${row.id} has category_id but no joined category name`);
            }

            const vegetable: Vegetable = {
              id: row.id,
              name: row.name,
              typicalWeight: row.typical_weight,
              marketPricePer250g: row.market_price_per_250g || 0,
              description: row.description || '',
              season: row.season || 'All Year',
              benefits: row.benefits || [],
              image: row.image || '',
              isAvailable: row.is_available !== undefined ? row.is_available : (row.is_active !== undefined ? row.is_active : true),
              updatedAt: row.updated_at || new Date().toISOString(),
              createdAt: row.created_at || new Date().toISOString(),
              nutritionScore: row.nutrition_score || 0,
              categoryId: row.category_id,
              category: categoryStr as 'root' | 'leafy' | 'bushy',
              unitType: row.unit_type || '250g',
              isSubstitutable: row.is_substitutable !== undefined ? row.is_substitutable : true
            };
            this.vegetables.set(vegetable.id, vegetable);
          });
          console.log('VegetableService: Processed', this.vegetables.size, 'vegetables');
          const stats = this.getStatistics();
          console.log('VegetableService: Categories ->', stats.byCategory);
          this.notifyListeners();
        }

        // Load category budget share percentages from veg_categories (one row per name)
        const { data: catRows } = await supabase.from('veg_categories').select('name, budget_share_percent, soft_ratio_weight');
        if (catRows && catRows.length > 0) {
          const seen = new Set<string>();
          const byName = catRows.filter((r: { name?: string }) => {
            const k = (r.name || '').toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          const totalWeight = byName.reduce((s, r) => s + (Number((r as any).soft_ratio_weight) || 0), 0);
          const ratios: CategoryRatios = { ...DEFAULT_CATEGORY_PERCENTS };
          byName.forEach((r: { name?: string; budget_share_percent?: number | null; soft_ratio_weight?: number }) => {
            const key = r.name?.toLowerCase();
            if (key === 'root' || key === 'leafy' || key === 'bushy') {
              const pct = r.budget_share_percent != null ? Number(r.budget_share_percent) : NaN;
              if (!Number.isNaN(pct) && pct >= 0) {
                ratios[key] = Math.round(Math.min(100, Math.max(0, pct)));
              } else if (totalWeight > 0) {
                const w = Number(r.soft_ratio_weight) || 0;
                ratios[key] = Math.round(Math.min(100, Math.max(0, (100 * w) / totalWeight)));
              }
            }
          });
          this.categoryRatios = ratios;
        }

        // Per-bucket ratios are loaded by Customization page from bucket_type_category_ratios (same as Admin).
        // Do not load here so Customization's fetch always wins and allocation uses DB values.

        this.initialized = true;
      } catch (error) {
        console.error('Error initializing vegetables:', error);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private notifyListeners(vegetableId?: string) {
    // Trigger custom event for React components
    window.dispatchEvent(new CustomEvent('vegetablesUpdated', {
      detail: { vegetableId }
    }));
  }

  // Get all vegetables (available and unavailable)
  getAllVegetables(): Vegetable[] {
    return Array.from(this.vegetables.values());
  }

  // Get only available vegetables
  getActiveVegetables(): Vegetable[] {
    return Array.from(this.vegetables.values()).filter(veg => veg.isAvailable);
  }

  // Get vegetables by category
  getVegetablesByCategory(category: 'root' | 'leafy' | 'bushy', includeInactive: boolean = false): Vegetable[] {
    const vegetables = includeInactive ? this.getAllVegetables() : this.getActiveVegetables();
    return vegetables.filter(veg => veg.category === category);
  }

  // Get single vegetable
  getVegetable(id: string): Vegetable | undefined {
    return this.vegetables.get(id);
  }

  // Add new vegetable
  async createVegetable(vegetableData: Omit<Vegetable, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vegetable> {
    const id = this.generateId(vegetableData.name);
    const now = new Date().toISOString();

    // Resolve category: DB may have category_id (FK to veg_categories) or category (text)
    let categoryId: string | null = vegetableData.categoryId || null;
    if (!categoryId) {
      const { data: categories } = await supabase.from('veg_categories').select('id, name');
      const byName = (categories || []).find((c: { name: string }) => c.name?.toLowerCase() === vegetableData.category?.toLowerCase());
      if (byName) categoryId = byName.id;
    }

    const dbPayload: Record<string, unknown> = {
      id,
      name: vegetableData.name,
      typical_weight: vegetableData.typicalWeight,
      market_price_per_250g: Math.round(Number(vegetableData.marketPricePer250g) || 0),
      description: vegetableData.description || '',
      season: vegetableData.season || 'All Year',
      image: vegetableData.image || '',
      nutrition_score: Math.min(10, Math.max(0, Math.round(Number(vegetableData.nutritionScore) || 5))),
    };

    if (categoryId) {
      dbPayload.category_id = categoryId;
    } else {
      // Fallback for schema with text category column
      dbPayload.category = vegetableData.category || 'leafy';
    }

    const { data, error } = await supabase
      .from('vegetables')
      .insert(dbPayload)
      .select()
      .single();

    if (error) {
      console.error('Error creating vegetable:', error);
      throw error;
    }

    // Update local cache
    const newVegetable: Vegetable = {
      ...vegetableData,
      id,
      createdAt: data.created_at || now,
      updatedAt: data.updated_at || now
    };

    this.vegetables.set(id, newVegetable);
    this.notifyListeners(id);
    return newVegetable;
  }

  // Update existing vegetable
  async updateVegetable(id: string, updates: Partial<Omit<Vegetable, 'id' | 'createdAt'>>): Promise<Vegetable> {
    const existing = this.vegetables.get(id);
    if (!existing) {
      throw new Error('Vegetable not found');
    }

    // Map updates to DB columns (table has category_id, not category)
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.marketPricePer250g !== undefined) dbUpdates.market_price_per_250g = updates.marketPricePer250g;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.season !== undefined) dbUpdates.season = updates.season;
    if (updates.image !== undefined) dbUpdates.image = updates.image;
    if (updates.nutritionScore !== undefined) dbUpdates.nutrition_score = updates.nutritionScore;

    // Resolve category name to category_id when user changes category in edit
    if (updates.categoryId !== undefined) {
      dbUpdates.category_id = updates.categoryId;
    } else if (updates.category !== undefined) {
      const { data: categories } = await supabase.from('veg_categories').select('id, name');
      const byName = (categories || []).find((c: { name: string }) => c.name?.toLowerCase() === updates.category?.toLowerCase());
      if (byName) dbUpdates.category_id = byName.id;
    }

    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('vegetables')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating vegetable:', error);
      throw error;
    }

    const updatedVegetable: Vegetable = {
      ...existing,
      ...updates,
      updatedAt: data.updated_at
    };

    this.vegetables.set(id, updatedVegetable);
    this.notifyListeners(id);
    return updatedVegetable;
  }

  // Toggle vegetable availability
  async toggleVegetableStatus(id: string): Promise<boolean> {
    const vegetable = this.vegetables.get(id);
    if (!vegetable) return false;

    try {
      await this.updateVegetable(id, { isAvailable: !vegetable.isAvailable });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Delete vegetable (permanent removal)
  async deleteVegetable(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('vegetables')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting vegetable:', error);
      return false;
    }

    this.vegetables.delete(id);
    this.notifyListeners(id);
    return true;
  }

  // Generate unique ID from name
  private generateId(name: string): string {
    const base = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);

    let id = base;
    let counter = 1;

    while (this.vegetables.has(id)) {
      id = `${base}${counter}`;
      counter++;
    }

    return id;
  }

  /** Set per-bucket ratios from an external source (e.g. Customization page fetch). Ensures allocation uses same data as Admin. */
  setBucketTypeRatios(byBucketTypeId: Record<string, CategoryRatios>): void {
    this.bucketTypeRatios.clear();
    Object.entries(byBucketTypeId).forEach(([id, ratios]) => {
      this.bucketTypeRatios.set(id, { ...ratios });
    });
  }

  /** Category budget share as percentages 0–100. If bucketTypeId given, returns that bucket's ratios; else global fallback. Always normalizes to sum 100. */
  getCategoryRatios(bucketTypeId?: string): CategoryRatios {
    const raw =
      bucketTypeId && this.bucketTypeRatios.has(bucketTypeId)
        ? { ...this.bucketTypeRatios.get(bucketTypeId)! }
        : { ...this.categoryRatios };
    const sum = raw.root + raw.leafy + raw.bushy;
    if (sum <= 0) return { ...DEFAULT_CATEGORY_PERCENTS };
    if (sum === 100) return raw;
    // Normalize to 100 so allocation never uses raw counts as shares
    return {
      root: Math.round((100 * raw.root) / sum),
      leafy: Math.round((100 * raw.leafy) / sum),
      bushy: 100 - Math.round((100 * raw.root) / sum) - Math.round((100 * raw.leafy) / sum)
    };
  }

  /** Refetch per-bucket-type ratios from DB (e.g. after admin edit in bucket type card). */
  async refreshCategoryRatiosByBucket(): Promise<void> {
    const { data: vcRows } = await supabase.from('veg_categories').select('id, name');
    const vegCatIdToName: Record<string, string> = {};
    (vcRows || []).forEach((r: { id: string; name: string }) => { vegCatIdToName[r.id] = (r.name || '').toLowerCase(); });
    const { data: btRatioRows } = await supabase.from('bucket_type_category_ratios').select('bucket_type_id, veg_category_id, budget_share_percent');
    this.bucketTypeRatios.clear();
    (btRatioRows || []).forEach((r: { bucket_type_id: string; veg_category_id: string; budget_share_percent: number | null }) => {
      const name = vegCatIdToName[r.veg_category_id] as keyof CategoryRatios | undefined;
      const pct = r.budget_share_percent != null ? Math.max(0, Math.min(100, r.budget_share_percent)) : 34;
      if (!name || !['root', 'leafy', 'bushy'].includes(name)) return;
      const existing = this.bucketTypeRatios.get(r.bucket_type_id) ?? { ...DEFAULT_CATEGORY_PERCENTS };
      existing[name] = pct;
      this.bucketTypeRatios.set(r.bucket_type_id, existing);
    });
    // If any bucket's ratios sum to < 20 they're likely counts (e.g. 3,1,2), not percentages — use default
    this.bucketTypeRatios.forEach((ratios, bucketId) => {
      const sum = ratios.root + ratios.leafy + ratios.bushy;
      if (sum < 20) {
        this.bucketTypeRatios.set(bucketId, { ...DEFAULT_CATEGORY_PERCENTS });
      }
    });
  }

  /** Refetch global category percentages from DB (e.g. after admin edit in veg_categories). */
  async refreshCategoryRatios(): Promise<CategoryRatios> {
    const { data: catRows } = await supabase.from('veg_categories').select('name, budget_share_percent, soft_ratio_weight');
    if (catRows && catRows.length > 0) {
      const seen = new Set<string>();
      const byName = catRows.filter((r: { name?: string }) => {
        const k = (r.name || '').toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const totalWeight = byName.reduce((s, r) => s + (Number((r as any).soft_ratio_weight) || 0), 0);
      const ratios: CategoryRatios = { ...DEFAULT_CATEGORY_PERCENTS };
      byName.forEach((r: { name?: string; budget_share_percent?: number | null; soft_ratio_weight?: number }) => {
        const key = r.name?.toLowerCase();
        if (key === 'root' || key === 'leafy' || key === 'bushy') {
          const pct = r.budget_share_percent != null ? Number(r.budget_share_percent) : NaN;
          if (!Number.isNaN(pct) && pct >= 0) {
            ratios[key] = Math.round(Math.min(100, Math.max(0, pct)));
          } else if (totalWeight > 0) {
            const w = Number(r.soft_ratio_weight) || 0;
            ratios[key] = Math.round(Math.min(100, Math.max(0, (100 * w) / totalWeight)));
          }
        }
      });
      this.categoryRatios = ratios;
    }
    return this.getCategoryRatios();
  }

  // Get statistics
  getStatistics() {
    const all = this.getAllVegetables();
    const active = this.getActiveVegetables();

    return {
      total: all.length,
      active: active.length,
      inactive: all.length - active.length,
      byCategory: {
        root: active.filter(v => v.category === 'root').length,
        leafy: active.filter(v => v.category === 'leafy').length,
        bushy: active.filter(v => v.category === 'bushy').length
      }
    };
  }

  // Static methods for admin API compatibility
  static getAllVegetables(): Promise<Vegetable[]> {
    return Promise.resolve(VegetableService.getInstance().getAllVegetables());
  }

  static updateVegetable(id: string, updates: any): Promise<Vegetable> {
    return VegetableService.getInstance().updateVegetable(id, updates);
  }

  static createVegetable(data: any): Promise<Vegetable> {
    return VegetableService.getInstance().createVegetable(data);
  }
}

export default VegetableService;