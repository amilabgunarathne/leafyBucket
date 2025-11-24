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

  static getInstance(): VegetableService {
    if (!VegetableService.instance) {
      VegetableService.instance = new VegetableService();
    }
    return VegetableService.instance;
  }

  // Initialize with default vegetables
  async initialize() {
    // Always initialize pricing service first
    const pricingService = await import('./pricingService');
    await pricingService.default.getInstance().initialize();
    
    // Load from localStorage first
    const stored = localStorage.getItem('admin_vegetables');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, veg]) => {
          this.vegetables.set(id, veg as Vegetable);
        });
        console.log('Loaded vegetables from storage:', this.vegetables.size);
        return;
      } catch (error) {
        console.error('Error loading stored vegetables:', error);
      }
    }

    // If no stored data, initialize with defaults
    try {
      const { vegetables: defaultVegetables } = await import('../data/vegetables');
      console.log('Loading default vegetables:', defaultVegetables.length);
      defaultVegetables.forEach(veg => {
        const vegetable: Vegetable = {
          ...veg,
          isAvailable: true,
          nutritionScore: 8, // Default nutrition score
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.vegetables.set(veg.id, vegetable);
      });
      
      this.saveVegetables();
      console.log('Initialized vegetables:', this.vegetables.size);
    } catch (error) {
      console.error('Error initializing vegetables:', error);
    }
  }

  // Get all vegetables (available and unavailable)
  getAllVegetables(): Vegetable[] {
    return Array.from(this.vegetables.values());
  }

  // Get only available vegetables
  getActiveVegetables(): Vegetable[] {
    const activeVegetables = Array.from(this.vegetables.values()).filter(veg => veg.isAvailable);
    console.log('VegetableService: Found', activeVegetables.length, 'active vegetables out of', this.vegetables.size, 'total');
    return activeVegetables;
  }

  // Get vegetables by category
  getVegetablesByCategory(category: 'root' | 'leafy' | 'bushy', includeInactive: boolean = false): Vegetable[] {
    const vegetables = includeInactive ? this.getAllVegetables() : this.getActiveVegetables();
    const categoryVegetables = vegetables.filter(veg => veg.category === category);
    console.log(`VegetableService: Found ${categoryVegetables.length} vegetables in category ${category} (includeInactive: ${includeInactive})`);
    return categoryVegetables;
  }

  // Get single vegetable
  getVegetable(id: string): Vegetable | undefined {
    return this.vegetables.get(id);
  }

  // Add new vegetable
  createVegetable(vegetableData: Omit<Vegetable, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vegetable> {
    return new Promise((resolve) => {
      const id = this.generateId(vegetableData.name);
      const vegetable: Vegetable = {
        ...vegetableData,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      this.vegetables.set(id, vegetable);
      this.saveVegetables();
      resolve(vegetable);
    });
  }

  // Update existing vegetable
  updateVegetable(id: string, updates: Partial<Omit<Vegetable, 'id' | 'createdAt'>>): Promise<Vegetable> {
    return new Promise((resolve, reject) => {
      const existing = this.vegetables.get(id);
      if (!existing) {
        reject(new Error('Vegetable not found'));
        return;
      }

      const updated: Vegetable = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      this.vegetables.set(id, updated);
      this.saveVegetables();
      resolve(updated);
    });
  }

  // Toggle vegetable availability
  toggleVegetableStatus(id: string): boolean {
    const vegetable = this.vegetables.get(id);
    if (!vegetable) return false;

    const updatedVegetable = {
      ...vegetable,
      isAvailable: !vegetable.isAvailable,
      updatedAt: new Date().toISOString()
    };
    
    this.vegetables.set(id, updatedVegetable);
    this.saveVegetables();
    
    console.log(`Toggled ${id} availability to:`, updatedVegetable.isAvailable);
    
    // Trigger a storage event to notify other components
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'admin_vegetables',
      newValue: JSON.stringify(Object.fromEntries(this.vegetables)),
      oldValue: null
    }));
    
    // Also trigger a custom event for immediate updates
    window.dispatchEvent(new CustomEvent('vegetablesUpdated', {
      detail: { vegetableId: id, isAvailable: updatedVegetable.isAvailable }
    }));
    
    return true;
  }

  // Delete vegetable (permanent removal)
  deleteVegetable(id: string): boolean {
    const deleted = this.vegetables.delete(id);
    if (deleted) {
      this.saveVegetables();
    }
    return deleted;
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

  // Save to localStorage
  private saveVegetables(): void {
    try {
      const vegetablesObject = Object.fromEntries(this.vegetables);
      localStorage.setItem('admin_vegetables', JSON.stringify(vegetablesObject));
    } catch (error) {
      console.error('Error saving vegetables:', error);
    }
  }

  // Export vegetables for backup
  exportVegetables(): string {
    return JSON.stringify(Array.from(this.vegetables.values()), null, 2);
  }

  // Import vegetables from backup
  importVegetables(jsonData: string): boolean {
    try {
      const vegetables = JSON.parse(jsonData) as Vegetable[];
      this.vegetables.clear();
      
      vegetables.forEach(veg => {
        this.vegetables.set(veg.id, veg);
      });
      
      this.saveVegetables();
      return true;
    } catch (error) {
      console.error('Error importing vegetables:', error);
      return false;
    }
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