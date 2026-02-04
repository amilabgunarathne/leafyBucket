// Pricing service to handle dynamic vegetable prices
export interface VegetablePricing {
  vegetableId: string;
  currentPrice: number;
  source: PricingSource;
  lastUpdated: string;
  isActive: boolean;
}

export type PricingSource = 'manual' | 'api' | 'market';

class PricingService {
  private static instance: PricingService;
  private prices: Map<string, VegetablePricing> = new Map();
  private lastFetch: Date | null = null;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  // Initialize with default prices from VegetableService
  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const vegetableService = (await import('./vegetableService')).default.getInstance();
        await vegetableService.initialize();
        const vegetables = vegetableService.getAllVegetables();

        console.log('Initializing pricing for vegetables:', vegetables.length);

        vegetables.forEach(veg => {
          this.prices.set(veg.id, {
            vegetableId: veg.id,
            currentPrice: veg.marketPricePer250g,
            source: 'manual',
            lastUpdated: new Date().toISOString(),
            isActive: true
          });
        });

        // Load from localStorage if available
        const storedPrices = localStorage.getItem('vegetable_prices');
        if (storedPrices) {
          try {
            const parsed = JSON.parse(storedPrices);
            Object.entries(parsed).forEach(([id, pricing]) => {
              this.prices.set(id, pricing as VegetablePricing);
            });
            console.log('Loaded stored prices:', this.prices.size);
          } catch (error) {
            console.error('Error loading stored prices:', error);
          }
        }
        console.log('Pricing service initialized with', this.prices.size, 'items');
        this.initialized = true;
      } catch (error) {
        console.error('Error initializing pricing service:', error);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  // Get current price for a vegetable
  getPrice(vegetableId: string): number {
    const pricing = this.prices.get(vegetableId);
    return pricing?.currentPrice || 0;
  }

  // Get all current prices
  getAllPricing(): VegetablePricing[] {
    return Array.from(this.prices.values());
  }

  // Update a single vegetable price
  updatePrice(vegetableId: string, newPrice: number, source: PricingSource = 'manual'): void {
    const existing = this.prices.get(vegetableId);
    if (existing) {
      const updated: VegetablePricing = {
        ...existing,
        currentPrice: newPrice,
        source,
        lastUpdated: new Date().toISOString()
      };
      this.prices.set(vegetableId, updated);
      this.savePrices();
    }
  }

  // Bulk update prices
  updatePricing(pricingData: VegetablePricing[]): Promise<void> {
    return new Promise((resolve) => {
      pricingData.forEach(pricing => {
        this.prices.set(pricing.vegetableId, {
          ...pricing,
          lastUpdated: new Date().toISOString()
        });
      });
      this.savePrices();
      resolve();
    });
  }

  // Save prices to localStorage
  private savePrices(): void {
    try {
      const pricesObject = Object.fromEntries(this.prices);
      localStorage.setItem('vegetable_prices', JSON.stringify(pricesObject));
    } catch (error) {
      console.error('Error saving prices:', error);
    }
  }

  // Mock refresh function (simulates external data fetch)
  refreshPricing(): Promise<VegetablePricing[]> {
    return new Promise((resolve, reject) => {
      // Simulate API call delay
      setTimeout(() => {
        try {
          // Check if we need to fetch (cache timeout)
          if (this.lastFetch && Date.now() - this.lastFetch.getTime() < this.cacheTimeout) {
            resolve(this.getAllPricing()); // Return cached data
            return;
          }

          // Simulate price fluctuations (±10% of current price)
          const updatedPricing: VegetablePricing[] = [];

          this.prices.forEach((pricing, vegetableId) => {
            const fluctuation = (Math.random() - 0.5) * 0.2; // ±10%
            const newPrice = Math.round(pricing.currentPrice * (1 + fluctuation));

            const updated: VegetablePricing = {
              ...pricing,
              currentPrice: Math.max(50, newPrice), // Minimum price of 50
              source: 'market',
              lastUpdated: new Date().toISOString()
            };

            this.prices.set(vegetableId, updated);
            updatedPricing.push(updated);
          });

          this.savePrices();
          this.lastFetch = new Date();
          resolve(updatedPricing);
        } catch (error) {
          console.error('Error refreshing pricing:', error);
          reject(new Error('Failed to refresh pricing data'));
        }
      }, 1000); // 1 second delay to simulate API call
    });
  }

  // Get last update info
  getLastUpdateInfo(): { lastFetch: Date | null } {
    return {
      lastFetch: this.lastFetch
    };
  }

  // Static methods for admin API compatibility
  static getAllPricing(): Promise<VegetablePricing[]> {
    return Promise.resolve(PricingService.getInstance().getAllPricing());
  }

  static updatePricing(pricingData: VegetablePricing[]): Promise<void> {
    return PricingService.getInstance().updatePricing(pricingData);
  }

  static refreshPricing(): Promise<VegetablePricing[]> {
    return PricingService.getInstance().refreshPricing();
  }
}

export default PricingService;