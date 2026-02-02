-- Vegetable Database Seed Script
-- All vegetables combined into a single INSERT to properly handle ON CONFLICT

INSERT INTO public.vegetables (id, name, category, base_value, typical_weight, market_price_per_250g, description, season, benefits, image, weight_per_value_point, is_available)
VALUES
-- ROOT VEGETABLES
('carrots', 'Organic Carrots', 'root', 4, '500g', 110, 'Sweet, crunchy carrots from Bandarawela farms', 'Year-round', ARRAY['Rich in beta-carotene', 'Good for eye health', 'High fiber'], 'https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg?auto=compress&cs=tinysrgb&w=400', 125, true),
('radish', 'Radish (Rabu)', 'root', 4, '400g', 80, 'Crisp white radishes perfect for sambols', 'Year-round', ARRAY['High in vitamin C', 'Good for digestion', 'Low calories'], 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400', 100, true),
('sweetpotato', 'Sweet Potato', 'root', 4, '600g', 105, 'Orange sweet potatoes from hill country', 'Year-round', ARRAY['Rich in beta-carotene', 'High fiber', 'Natural sweetness'], 'https://images.pexels.com/photos/144248/potatoes-vegetables-erdfrucht-bio-144248.jpeg?auto=compress&cs=tinysrgb&w=400', 150, true),
('beetroot', 'Beetroot', 'root', 4, '450g', 100, 'Deep red beetroots rich in nutrients', 'Year-round', ARRAY['Rich in folate', 'Supports heart health', 'Natural nitrates'], 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400', 112, true),

-- LEAFY VEGETABLES
('gotukola', 'Gotukola (Pennywort)', 'leafy', 2, '200g', 190, 'Traditional leafy green rich in nutrients', 'Year-round', ARRAY['Brain health', 'Anti-inflammatory', 'Rich in antioxidants'], 'https://images.pexels.com/photos/7129052/pexels-photo-7129052.jpeg?auto=compress&cs=tinysrgb&w=400', 100, true),
('mukunuwenna', 'Mukunuwenna', 'leafy', 2, '200g', 150, 'Nutritious local greens for curries', 'Year-round', ARRAY['High in iron', 'Rich in vitamins', 'Traditional medicine'], 'https://images.pexels.com/photos/2325843/pexels-photo-2325843.jpeg?auto=compress&cs=tinysrgb&w=400', 100, true),
('kankun', 'Kankun (Water Spinach)', 'leafy', 2, '250g', 140, 'Tender water spinach for quick stir-fries', 'Year-round', ARRAY['High in iron', 'Rich in vitamins', 'Quick cooking'], 'https://images.pexels.com/photos/4198019/pexels-photo-4198019.jpeg?auto=compress&cs=tinysrgb&w=400', 125, true),
('leeks', 'Leeks (Lunu Kola)', 'leafy', 2, '300g', 160, 'Fresh leeks for mild onion flavor', 'Year-round', ARRAY['Rich in vitamins', 'Anti-inflammatory', 'Heart healthy'], 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400', 150, true),
('cabbage', 'Cabbage', 'leafy', 2, '800g', 50, 'Fresh cabbage heads perfect for salads and curries', 'Year-round', ARRAY['High in vitamin C', 'Good for digestion', 'Anti-inflammatory'], 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400', 400, true),

-- BUSHY VEGETABLES
('bandakka', 'Bandakka (Okra)', 'bushy', 3, '300g', 165, 'Fresh okra pods perfect for curries', 'Year-round', ARRAY['High fiber', 'Good for digestion', 'Low calories'], 'https://images.pexels.com/photos/6824358/pexels-photo-6824358.jpeg?auto=compress&cs=tinysrgb&w=400', 100, true),
('wambatu', 'Wambatu (Eggplant)', 'bushy', 3, '400g', 115, 'Purple eggplants for traditional dishes', 'Year-round', ARRAY['Rich in antioxidants', 'Heart healthy', 'Low calories'], 'https://images.pexels.com/photos/321551/pexels-photo-321551.jpeg?auto=compress&cs=tinysrgb&w=400', 133, true),
('karavila', 'Karavila (Bitter Gourd)', 'bushy', 3, '300g', 135, 'Traditional bitter gourd with health benefits', 'Year-round', ARRAY['Blood sugar control', 'Rich in nutrients', 'Traditional medicine'], 'https://images.pexels.com/photos/8844895/pexels-photo-8844895.jpeg?auto=compress&cs=tinysrgb&w=400', 100, true),
('gherkin', 'Fresh Gherkin', 'bushy', 3, '250g', 180, 'Crisp, fresh gherkins perfect for salads', 'Year-round', ARRAY['High in vitamins', 'Low calories', 'Great for hydration'], 'https://images.pexels.com/photos/4198019/pexels-photo-4198019.jpeg?auto=compress&cs=tinysrgb&w=400', 83, true),
('chilies', 'Lunu Miris Chili', 'bushy', 3, '150g', 165, 'Fresh green chilies for authentic flavor', 'Year-round', ARRAY['Rich in vitamin C', 'Boosts metabolism', 'Natural preservative'], 'https://images.pexels.com/photos/1233324/pexels-photo-1233324.jpeg?auto=compress&cs=tinysrgb&w=400', 50, true),
('beans', 'Green Beans', 'bushy', 3, '350g', 120, 'Fresh green beans perfect for stir-fries', 'Year-round', ARRAY['High in fiber', 'Rich in vitamins', 'Low calories'], 'https://images.pexels.com/photos/6824358/pexels-photo-6824358.jpeg?auto=compress&cs=tinysrgb&w=400', 117, true),
('pumpkin', 'Pumpkin', 'bushy', 3, '500g', 70, 'Fresh pumpkin pieces for curries and desserts', 'Year-round', ARRAY['Rich in beta-carotene', 'High fiber', 'Natural sweetness'], 'https://images.pexels.com/photos/144248/potatoes-vegetables-erdfrucht-bio-144248.jpeg?auto=compress&cs=tinysrgb&w=400', 167, true)

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    base_value = EXCLUDED.base_value,
    typical_weight = EXCLUDED.typical_weight,
    market_price_per_250g = EXCLUDED.market_price_per_250g,
    description = EXCLUDED.description,
    season = EXCLUDED.season,
    benefits = EXCLUDED.benefits,
    image = EXCLUDED.image,
    weight_per_value_point = EXCLUDED.weight_per_value_point,
    is_available = EXCLUDED.is_available;
