import { supabase } from '../lib/supabase';

// Vegetable management service for dynamic CRUD operations
export interface Vegetable {
  id: string;
  name: string;
  category: 'root' | 'leafy' | 'bushy';
  baseValue: number;
  typicalWeight: string;
  marketPricePer250g: number;
  description: string;
  season: string;
  benefits: string[];
  image: string;
  weightPerValuePoint: number;
  isAvailable: boolean;
  nutritionScore: number;
  createdAt: string;
  updatedAt: string;
}

class VegetableService {
  private static instance: VegetableService;
  private vegetables: Map<string, Vegetable> = new Map();
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
          .select('*');

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
            // Verify critical fields
            if (!row.id || !row.name) {
              console.warn('Skipping invalid row:', row);
              return;
            }

            const vegetable: Vegetable = {
              id: row.id,
              name: row.name,
              category: row.category,
              baseValue: row.base_value,
              typicalWeight: row.typical_weight,
              marketPricePer250g: row.market_price_per_250g,
              description: row.description,
              season: row.season,
              benefits: row.benefits,
              image: row.image,
              weightPerValuePoint: row.weight_per_value_point,
              isAvailable: row.is_available,
              updatedAt: row.updated_at || new Date().toISOString(),
              createdAt: row.created_at || new Date().toISOString(),
              nutritionScore: row.nutrition_score
            };
            this.vegetables.set(vegetable.id, vegetable);
          });
          console.log('VegetableService: Loaded', this.vegetables.size, 'vegetables from Supabase');
          this.notifyListeners();
        }

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

    const dbPayload = {
      id,
      name: vegetableData.name,
      category: vegetableData.category,
      base_value: vegetableData.baseValue,
      typical_weight: vegetableData.typicalWeight,
      market_price_per_250g: vegetableData.marketPricePer250g,
      description: vegetableData.description,
      season: vegetableData.season,
      benefits: vegetableData.benefits,
      image: vegetableData.image,
      weight_per_value_point: vegetableData.weightPerValuePoint,
      is_available: vegetableData.isAvailable,
      nutrition_score: vegetableData.nutritionScore,
      // created_at and updated_at handled by DB defaults, but we can send if needed
    };

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

    // Map updates to DB columns
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.baseValue !== undefined) dbUpdates.base_value = updates.baseValue;
    if (updates.typicalWeight !== undefined) dbUpdates.typical_weight = updates.typicalWeight;
    if (updates.marketPricePer250g !== undefined) dbUpdates.market_price_per_250g = updates.marketPricePer250g;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.season !== undefined) dbUpdates.season = updates.season;
    if (updates.benefits !== undefined) dbUpdates.benefits = updates.benefits;
    if (updates.image !== undefined) dbUpdates.image = updates.image;
    if (updates.weightPerValuePoint !== undefined) dbUpdates.weight_per_value_point = updates.weightPerValuePoint;
    if (updates.isAvailable !== undefined) dbUpdates.is_available = updates.isAvailable;
    if (updates.nutritionScore !== undefined) dbUpdates.nutrition_score = updates.nutritionScore;

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