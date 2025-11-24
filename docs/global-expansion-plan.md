# Leafy Bucket Global Expansion Plan

## 🌍 Technical Infrastructure

### Domain Strategy
- **Primary**: leafybucket.com
- **Localized**: 
  - leafybucket.lk (Sri Lanka)
  - leafybucket.in (India)
  - leafybucket.sg (Singapore)
  - leafybucket.co.uk (UK)

### Multi-Region Architecture

```
Global CDN (Netlify/Vercel)
├── Asia-Pacific (Singapore)
├── Europe (London)
├── North America (Virginia)
└── Middle East (Dubai)
```

### Database Strategy
```
Supabase Multi-Region Setup:
├── Primary: Asia-Pacific (Singapore)
├── Read Replicas: 
│   ├── Europe (Ireland)
│   ├── US East (Virginia)
│   └── Middle East (Bahrain)
```

## 💰 Global Pricing Strategy

### Market-Specific Pricing
```typescript
const globalPricing = {
  sriLanka: {
    currency: 'LKR',
    small: 2900,
    medium: 4900,
    large: 6900
  },
  india: {
    currency: 'INR',
    small: 1200,
    medium: 2000,
    large: 2800
  },
  singapore: {
    currency: 'SGD',
    small: 25,
    medium: 42,
    large: 58
  },
  uae: {
    currency: 'AED',
    small: 65,
    medium: 110,
    large: 150
  },
  uk: {
    currency: 'GBP',
    small: 15,
    medium: 25,
    large: 35
  },
  canada: {
    currency: 'CAD',
    small: 25,
    medium: 42,
    large: 58
  }
};
```

## 🚚 Logistics Partners by Region

### Asia-Pacific
- **Sri Lanka**: Local farms network
- **India**: BigBasket, Grofers partnership
- **Singapore**: RedMart, FairPrice integration

### Middle East
- **UAE**: Carrefour, Spinneys partnership
- **Qatar**: Al Meera, Lulu Group

### Europe
- **UK**: Tesco, Sainsbury's partnership
- **Germany**: Rewe, Edeka integration

### North America
- **Canada**: Loblaws, Metro partnership
- **USA**: Whole Foods, Fresh Direct

## 📱 Localization Features

### Language Support
```typescript
const supportedLanguages = [
  'en', // English (Primary)
  'si', // Sinhala
  'ta', // Tamil
  'hi', // Hindi
  'ar', // Arabic
  'de', // German
  'fr'  // French
];
```

### Cultural Adaptations
- **Sri Lanka**: Traditional vegetables, local recipes
- **India**: Regional vegetables, Ayurvedic focus
- **Singapore**: Organic premium positioning
- **UAE**: Halal certification, Ramadan specials
- **UK**: Convenience focus, meal kits
- **Canada**: Sustainability messaging

## 💳 Payment Methods by Region

### Asia-Pacific
- **Sri Lanka**: Bank transfers, Cash on delivery
- **India**: UPI, Paytm, Razorpay
- **Singapore**: PayNow, GrabPay, Credit cards

### Middle East
- **UAE**: Apple Pay, Samsung Pay, Bank transfers
- **Qatar**: QNB, QPAY, Credit cards

### Europe
- **UK**: Stripe, PayPal, Bank transfers
- **Germany**: SEPA, Klarna, PayPal

### North America
- **Canada**: Stripe, PayPal, Interac
- **USA**: Stripe, Apple Pay, Venmo

## 📊 Market Entry Timeline

### Year 1: Foundation
- ✅ Sri Lanka (Established)
- 🎯 India (Q2)
- 🎯 Singapore (Q3)
- 🎯 UAE (Q4)

### Year 2: Expansion
- 🎯 UK (Q1)
- 🎯 Canada (Q2)
- 🎯 Australia (Q3)
- 🎯 Germany (Q4)

### Year 3: Scale
- 🎯 USA (Q1)
- 🎯 Netherlands (Q2)
- 🎯 France (Q3)
- 🎯 Japan (Q4)

## 🏆 Success Metrics

### Key Performance Indicators
```typescript
const globalKPIs = {
  customerAcquisition: {
    target: '10,000 customers per market',
    timeline: '12 months'
  },
  revenue: {
    target: '$1M ARR per major market',
    timeline: '18 months'
  },
  marketShare: {
    target: '5% of organic delivery market',
    timeline: '24 months'
  }
};
```

## 🔧 Technical Implementation

### Multi-Tenant Architecture
```typescript
// Market-specific configurations
const marketConfig = {
  routing: 'subdomain', // sg.leafybucket.com
  database: 'multi-tenant',
  cdn: 'global-edge',
  payments: 'region-specific'
};
```

### Scalability Features
- Auto-scaling infrastructure
- Load balancing across regions
- Real-time inventory management
- Multi-currency support
- Tax calculation by region
- Shipping rate optimization

## 📈 Investment Requirements

### Technology Infrastructure
- **Global CDN**: $500/month
- **Multi-region database**: $2,000/month
- **Payment processing**: 2.9% + $0.30 per transaction
- **Monitoring & analytics**: $300/month

### Market Entry Costs (per market)
- **Legal & compliance**: $10,000-50,000
- **Local partnerships**: $25,000-100,000
- **Marketing launch**: $50,000-200,000
- **Inventory & logistics**: $100,000-500,000

### Total Year 1 Investment
- **Technology**: $50,000
- **4 Markets**: $800,000-3,200,000
- **Operations**: $200,000
- **Total**: $1,050,000-3,450,000