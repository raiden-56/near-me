-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0006 · Reference data: category taxonomy, badges, default configuration
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-runnable (upserts).
--
-- This is reference data the application cannot work without: businesses.category_id is a
-- foreign key into public.categories, and badges / app_config drive the contribution and
-- report logic. It therefore ships as a MIGRATION, so that production never depends on a seed
-- file. (supabase/seed/dev_seed.sql repeats the same rows with ON CONFLICT DO NOTHING only so
-- that the seed is self-contained; this file is the canonical copy.)
--
-- Source of truth: src/data/categories.ts (GROUPS, CATEGORIES — 9 groups, 50 categories, in
-- declaration order, which is also the classification priority) and the badge() list in
-- src/services/contributions.ts. Generated from those files; when the taxonomy changes, add a
-- new migration with the changed rows rather than editing this one after it has been applied.
--
-- On conflict the descriptive columns are refreshed, but categories.enabled and
-- categories.featured are left alone: once the row exists they belong to the administrators
-- (AdminConfig.disabledCategoryIds / featuredCategoryIds).
-- ════════════════════════════════════════════════════════════════════════════════════════════

insert into public.category_groups (id, label, blurb, icon, tone, sort_order)
values
  ('food', 'Food', 'Restaurants, cafes and quick bites', 'Utensils', 'brand', 10),
  ('health', 'Health', 'Hospitals, clinics and pharmacies', 'HeartPulse', 'danger', 20),
  ('shopping', 'Shopping', 'Groceries, malls and stores', 'ShoppingBag', 'butter', 30),
  ('automotive', 'Automotive', 'Fuel, repairs, charging and parking', 'CarFront', 'forest', 40),
  ('home', 'Home Services', 'Trusted help for your home', 'House', 'clay', 50),
  ('fitness', 'Fitness', 'Gyms, sports and green spaces', 'Dumbbell', 'success', 60),
  ('daily', 'Daily Needs', 'ATMs, salons, laundry and more', 'ListChecks', 'sand', 70),
  ('travel', 'Travel & Leisure', 'Stays, sights and things to do', 'Compass', 'sage', 80),
  ('safety', 'Safety', 'Police and fire services', 'ShieldAlert', 'danger', 90)
on conflict (id) do update
  set label = excluded.label, blurb = excluded.blurb, icon = excluded.icon, tone = excluded.tone, sort_order = excluded.sort_order;

-- osm_rules is the TagRule[] of the frontend verbatim: [key, values | "*", extra-conditions?].
insert into public.categories (id, group_id, label, singular, icon, nameless, featured, sort_order, keywords, osm_rules)
values
  ('restaurants', 'food', 'Restaurants', 'Restaurant', 'UtensilsCrossed', false, true, 10,
     array['restaurant', 'restaurants', 'dinner', 'lunch', 'meals', 'dosa', 'biryani', 'thali', 'food', 'eat', 'dining', 'family restaurant', 'veg', 'non veg', 'idli', 'north indian', 'south indian', 'chinese', 'pizza place'],
     '[["amenity",["restaurant"]]]'::jsonb),
  ('cafes', 'food', 'Cafes', 'Cafe', 'Coffee', false, true, 20,
     array['cafe', 'cafes', 'coffee', 'tea', 'chai', 'cappuccino', 'breakfast', 'coffee shop', 'filter coffee', 'juice', 'work friendly cafe'],
     '[["amenity",["cafe","juice_bar"]],["shop",["coffee","tea"]]]'::jsonb),
  ('bakeries', 'food', 'Bakeries', 'Bakery', 'Croissant', false, false, 30,
     array['bakery', 'bakeries', 'bread', 'cake', 'cakes', 'puff', 'pastry', 'bun', 'cookies'],
     '[["shop",["bakery","pastry"]]]'::jsonb),
  ('desserts', 'food', 'Desserts', 'Dessert spot', 'IceCreamCone', false, false, 40,
     array['dessert', 'desserts', 'ice cream', 'sweets', 'sweet shop', 'mithai', 'gelato', 'kulfi', 'chocolate', 'falooda'],
     '[["amenity",["ice_cream"]],["shop",["confectionery","chocolate","ice_cream","sweets"]]]'::jsonb),
  ('street-food', 'food', 'Street food', 'Street food', 'Soup', false, false, 50,
     array['street food', 'chaat', 'pani puri', 'golgappa', 'vada pav', 'momos', 'snacks', 'bajji', 'food court', 'tiffin', 'darshini', 'chats'],
     '[["amenity",["food_court"]],["amenity",["fast_food"],{"cuisine":["indian","south_indian","north_indian","chaat","street_food","regional","dosa","momo","momos","pani_puri","vada_pav","snack","snacks","juice","tea","kebab","shawarma","rolls","andhra","kerala"]}],["street_vendor",["yes"]]]'::jsonb),
  ('fast-food', 'food', 'Fast food', 'Fast food', 'Sandwich', false, false, 60,
     array['fast food', 'burger', 'burgers', 'pizza', 'fries', 'sandwich', 'quick bite', 'takeaway', 'rolls', 'shawarma', 'cheap lunch'],
     '[["amenity",["fast_food"]]]'::jsonb),
  ('bars', 'food', 'Pubs & bars', 'Bar', 'Beer', false, false, 70,
     array['bar', 'bars', 'pub', 'pubs', 'brewery', 'beer', 'drinks', 'cocktails', 'happy hour', 'microbrewery'],
     '[["amenity",["bar","pub","biergarten"]]]'::jsonb),
  ('emergency-care', 'health', 'Emergency care', 'Emergency care', 'Siren', false, false, 80,
     array['emergency', 'emergency care', 'casualty', 'trauma', 'ambulance', '24 hour hospital', 'accident', 'er', 'emergency services', 'urgent care'],
     '[["amenity",["hospital","clinic"],{"emergency":["yes"]}],["amenity",["ambulance_station"]],["emergency",["ambulance_station"]]]'::jsonb),
  ('hospitals', 'health', 'Hospitals', 'Hospital', 'Hospital', false, true, 90,
     array['hospital', 'hospitals', 'multispeciality', 'nursing home', 'medical centre', 'maternity'],
     '[["amenity",["hospital"]],["healthcare",["hospital"]]]'::jsonb),
  ('clinics', 'health', 'Clinics', 'Clinic', 'Stethoscope', false, false, 100,
     array['clinic', 'clinics', 'doctor', 'doctors', 'dentist', 'dental', 'physician', 'pediatrician', 'skin doctor', 'eye clinic', 'physio', 'consultation', 'gp'],
     '[["amenity",["clinic","doctors","dentist"]],["healthcare",["clinic","doctor","dentist","centre","physiotherapist","optometrist"]]]'::jsonb),
  ('medical-stores', 'health', 'Medical stores', 'Medical store', 'Pill', false, true, 110,
     array['pharmacy', 'pharmacies', 'medical store', 'medical shop', 'medicals', 'chemist', 'drugstore', 'drug store', 'medicine', 'medicines', 'tablets', 'apollo pharmacy'],
     '[["amenity",["pharmacy"]],["shop",["chemist"]],["healthcare",["pharmacy"]]]'::jsonb),
  ('diagnostic-labs', 'health', 'Diagnostic labs', 'Diagnostic lab', 'FlaskConical', false, false, 120,
     array['lab', 'labs', 'diagnostic', 'diagnostics', 'blood test', 'scan', 'x-ray', 'xray', 'pathology', 'mri', 'ct scan', 'health checkup'],
     '[["healthcare",["laboratory","sample_collection","diagnostics","blood_donation"]],["amenity",["laboratory"]]]'::jsonb),
  ('supermarkets', 'shopping', 'Supermarkets', 'Supermarket', 'ShoppingCart', false, true, 130,
     array['supermarket', 'supermarkets', 'hypermarket', 'dmart', 'big bazaar', 'more supermarket', 'reliance fresh', 'departmental'],
     '[["shop",["supermarket","wholesale"]]]'::jsonb),
  ('grocery', 'shopping', 'Grocery', 'Grocery', 'ShoppingBasket', false, false, 140,
     array['grocery', 'groceries', 'kirana', 'vegetables', 'fruits', 'provisions', 'provision store', 'milk', 'market', 'sabzi', 'meat', 'chicken shop', 'general store'],
     '[["shop",["convenience","greengrocer","grocery","general","butcher","dairy","seafood","kiosk","health_food","spices","farm"]],["amenity",["marketplace"]]]'::jsonb),
  ('malls', 'shopping', 'Shopping malls', 'Mall', 'Building2', false, false, 150,
     array['mall', 'malls', 'shopping mall', 'shopping centre', 'shopping center', 'complex', 'arcade'],
     '[["shop",["mall"]]]'::jsonb),
  ('electronics', 'shopping', 'Electronics', 'Electronics store', 'MonitorSmartphone', false, false, 160,
     array['electronics', 'electronic', 'computer', 'laptop', 'tv', 'gadgets', 'appliances', 'croma', 'headphones', 'camera'],
     '[["shop",["electronics","computer","hifi","appliance","camera"]]]'::jsonb),
  ('clothing', 'shopping', 'Clothing', 'Clothing store', 'Shirt', false, false, 170,
     array['clothing', 'clothes', 'garments', 'shoes', 'footwear', 'tailor', 'saree', 'sarees', 'boutique', 'fashion', 'jewellery', 'jewelry', 'apparel', 'textiles'],
     '[["shop",["clothes","shoes","boutique","fashion","tailor","fabric","bag","jewelry","fashion_accessories"]]]'::jsonb),
  ('stores', 'shopping', 'Stores', 'Store', 'Store', false, false, 180,
     array['store', 'stores', 'shop', 'shops', 'stationery', 'books', 'book shop', 'hardware', 'gifts', 'furniture', 'toys', 'optician', 'spectacles', 'florist', 'flowers', 'pet shop', 'xerox', 'photocopy', 'wine shop', 'liquor'],
     '[["shop",["department_store","variety_store","gift","books","stationery","hardware","furniture","toys","sports","optician","cosmetics","florist","pet","doityourself","houseware","interior_decoration","bed","outdoor","garden_centre","art","music","watches","perfumery","copyshop","photo","alcohol","beverages","baby_goods","kitchen","musical_instrument","craft","frame","travel_agency"]]]'::jsonb),
  ('petrol-pumps', 'automotive', 'Petrol pumps', 'Petrol pump', 'Fuel', true, true, 190,
     array['petrol', 'petrol pump', 'petrol bunk', 'diesel', 'fuel', 'gas station', 'cng', 'fuel station', 'hp petrol', 'indian oil', 'bharat petroleum', 'low queue'],
     '[["amenity",["fuel"]]]'::jsonb),
  ('ev-charging', 'automotive', 'EV charging', 'EV charging station', 'PlugZap', true, false, 200,
     array['ev', 'ev charging', 'charging station', 'electric vehicle', 'charger', 'ev charger', 'ather grid', 'fast charger', 'charging point'],
     '[["amenity",["charging_station"]]]'::jsonb),
  ('bike-repair', 'automotive', 'Bike repair', 'Bike repair', 'Bike', false, false, 210,
     array['bike repair', 'bike mechanic', 'bike puncture', 'puncture', 'puncture repair', 'two wheeler', 'two-wheeler', 'scooter service', 'bike service', 'tyre puncture', 'motorcycle', 'cycle repair', 'bike garage'],
     '[["shop",["motorcycle_repair","motorcycle","bicycle"]],["amenity",["bicycle_repair_station"]],["craft",["motorcycle_repair"]]]'::jsonb),
  ('car-repair', 'automotive', 'Car repair', 'Car repair', 'Wrench', false, false, 220,
     array['car repair', 'car service', 'garage', 'car mechanic', 'tyre shop', 'tyres', 'wheel alignment', 'denting', 'car ac', 'spare parts', 'roadside assistance', 'towing'],
     '[["shop",["car_repair","tyres","car_parts"]],["craft",["car_repair"]]]'::jsonb),
  ('mechanics', 'automotive', 'Mechanics', 'Mechanic', 'Cog', false, false, 230,
     array['mechanic', 'mechanics', 'repair shop', 'workshop', 'vehicle repair', 'breakdown', 'roadside help'],
     '[["shop",["car_repair","motorcycle_repair","tyres","motorcycle"]],["craft",["mechanic","car_repair","motorcycle_repair"]]]'::jsonb),
  ('car-wash', 'automotive', 'Car wash', 'Car wash', 'Droplets', false, false, 240,
     array['car wash', 'bike wash', 'water wash', 'detailing', 'car cleaning', 'foam wash'],
     '[["amenity",["car_wash"]]]'::jsonb),
  ('parking', 'automotive', 'Parking', 'Parking', 'SquareParking', true, false, 250,
     array['parking', 'park', 'car park', 'parking lot', 'bike parking', 'two wheeler parking', 'pay and park', 'parking near mall'],
     '[["amenity",["parking","motorcycle_parking","parking_entrance"]]]'::jsonb),
  ('electricians', 'home', 'Electricians', 'Electrician', 'Zap', false, false, 260,
     array['electrician', 'electricians', 'wiring', 'electrical', 'electric work', 'switch repair', 'fan repair', 'inverter'],
     '[["craft",["electrician"]],["shop",["electrical"]]]'::jsonb),
  ('plumbers', 'home', 'Plumbers', 'Plumber', 'ShowerHead', false, false, 270,
     array['plumber', 'plumbers', 'plumbing', 'pipe', 'leak', 'tap repair', 'drain', 'sanitary'],
     '[["craft",["plumber"]],["shop",["bathroom_furnishing","plumbing"]]]'::jsonb),
  ('carpenters', 'home', 'Carpenters', 'Carpenter', 'Hammer', false, false, 280,
     array['carpenter', 'carpenters', 'woodwork', 'furniture repair', 'wood work', 'door repair', 'modular'],
     '[["craft",["carpenter","joiner","cabinet_maker","upholsterer"]]]'::jsonb),
  ('painters', 'home', 'Painters', 'Painter', 'PaintRoller', false, false, 290,
     array['painter', 'painters', 'painting', 'wall paint', 'house painting', 'paint shop', 'asian paints'],
     '[["craft",["painter"]],["shop",["paint"]]]'::jsonb),
  ('cleaning', 'home', 'Cleaning services', 'Cleaning service', 'SprayCan', false, false, 300,
     array['cleaning', 'cleaner', 'housekeeping', 'maid', 'deep clean', 'pest control', 'sofa cleaning', 'home cleaning'],
     '[["craft",["cleaning","pest_control","window_cleaning"]],["office",["cleaning"]]]'::jsonb),
  ('appliance-repair', 'home', 'Appliance repair', 'Appliance repair', 'WashingMachine', false, false, 310,
     array['appliance repair', 'ac repair', 'ac service', 'fridge repair', 'washing machine', 'tv repair', 'microwave', 'geyser', 'ro service', 'purifier'],
     '[["craft",["electronics_repair","hvac","appliance_repair"]],["shop",["repair"]]]'::jsonb),
  ('yoga', 'fitness', 'Yoga', 'Yoga studio', 'Flower2', false, false, 320,
     array['yoga', 'yoga class', 'meditation', 'pilates', 'yoga studio', 'pranayama'],
     '[["leisure",["fitness_centre","sports_centre"],{"sport":["yoga","pilates","meditation"]}],["sport",["yoga"]]]'::jsonb),
  ('gyms', 'fitness', 'Gyms', 'Gym', 'Dumbbell', false, true, 330,
     array['gym', 'gyms', 'fitness', 'workout', 'crossfit', 'fitness centre', 'cult fit', 'weights', 'zumba', 'gym under'],
     '[["leisure",["fitness_centre","fitness_station"]],["amenity",["gym"]]]'::jsonb),
  ('swimming', 'fitness', 'Swimming', 'Swimming pool', 'Waves', true, false, 340,
     array['swimming', 'swimming pool', 'pool', 'swim', 'water park'],
     '[["leisure",["swimming_pool","water_park","swimming_area"]],["sport",["swimming"]]]'::jsonb),
  ('sports', 'fitness', 'Sports', 'Sports venue', 'Trophy', true, false, 350,
     array['sports', 'badminton', 'cricket', 'football', 'turf', 'court', 'tennis', 'basketball', 'stadium', 'ground', 'box cricket', 'futsal', 'bowling'],
     '[["leisure",["sports_centre","pitch","stadium","sports_hall","track","ice_rink","bowling_alley"]]]'::jsonb),
  ('parks', 'fitness', 'Parks', 'Park', 'Trees', true, true, 360,
     array['park', 'parks', 'garden', 'walk', 'jogging', 'playground', 'green space', 'lake', 'morning walk', 'kids play area'],
     '[["leisure",["park","garden","playground","nature_reserve","dog_park"]]]'::jsonb),
  ('atms', 'daily', 'ATMs', 'ATM', 'Banknote', true, true, 370,
     array['atm', 'atms', 'cash', 'withdraw', 'cash machine', 'cash withdrawal', 'money'],
     '[["amenity",["atm"]],["amenity",["bank"],{"atm":["yes"]}]]'::jsonb),
  ('banks', 'daily', 'Banks', 'Bank', 'Landmark', false, false, 380,
     array['bank', 'banks', 'branch', 'sbi', 'hdfc', 'icici', 'axis', 'forex', 'loan'],
     '[["amenity",["bank","bureau_de_change","money_transfer"]]]'::jsonb),
  ('public-toilets', 'daily', 'Public toilets', 'Public toilet', 'Toilet', true, false, 390,
     array['toilet', 'toilets', 'public toilet', 'washroom', 'restroom', 'loo', 'sulabh', 'bathroom'],
     '[["amenity",["toilets"]]]'::jsonb),
  ('laundry', 'daily', 'Laundry', 'Laundry', 'Shirt', false, false, 400,
     array['laundry', 'dry clean', 'dry cleaning', 'dry cleaner', 'ironing', 'wash and fold', 'laundromat', 'press'],
     '[["shop",["laundry","dry_cleaning"]]]'::jsonb),
  ('salons', 'daily', 'Salons', 'Salon', 'Scissors', false, true, 410,
     array['salon', 'salons', 'haircut', 'hair cut', 'barber', 'parlour', 'beauty parlour', 'spa', 'beauty', 'massage', 'facial', 'unisex salon', 'saloon'],
     '[["shop",["hairdresser","beauty","massage","tattoo"]],["leisure",["spa","sauna"]],["amenity",["spa"]]]'::jsonb),
  ('mobile-repair', 'daily', 'Mobile repair', 'Mobile shop', 'Smartphone', false, false, 420,
     array['mobile repair', 'phone repair', 'screen replacement', 'mobile shop', 'recharge', 'sim card', 'mobile service', 'mobile store', 'display change'],
     '[["shop",["mobile_phone","telecommunication"]],["craft",["phone_repair"]]]'::jsonb),
  ('courier', 'daily', 'Courier services', 'Courier point', 'Package', true, false, 430,
     array['courier', 'post office', 'parcel', 'speed post', 'dtdc', 'bluedart', 'delivery', 'post box', 'shipping'],
     '[["amenity",["post_office","parcel_locker","post_box"]],["office",["courier","logistics"]]]'::jsonb),
  ('hotels', 'travel', 'Hotels', 'Hotel', 'BedDouble', false, false, 440,
     array['hotel', 'hotels', 'stay', 'lodge', 'lodging', 'pg', 'room', 'hostel', 'guest house', 'accommodation', 'paying guest'],
     '[["tourism",["hotel","guest_house","hostel","motel","apartment","dormitory"]]]'::jsonb),
  ('rentals', 'travel', 'Rental services', 'Rental', 'KeyRound', false, false, 450,
     array['rental', 'rentals', 'rent a bike', 'rent a car', 'bike rental', 'car rental', 'self drive', 'cycle rental', 'scooter rental'],
     '[["amenity",["car_rental","bicycle_rental","motorcycle_rental","car_sharing","kick-scooter_rental"]],["shop",["rental"]]]'::jsonb),
  ('attractions', 'travel', 'Tourist attractions', 'Attraction', 'Camera', false, true, 460,
     array['attraction', 'attractions', 'tourist', 'sightseeing', 'museum', 'viewpoint', 'gallery', 'zoo', 'places to visit', 'heritage', 'monument', 'things to do', 'art'],
     '[["tourism",["attraction","museum","viewpoint","gallery","zoo","theme_park","aquarium","artwork"]],["historic","*"]]'::jsonb),
  ('events', 'travel', 'Event venues', 'Event venue', 'Ticket', false, false, 470,
     array['events', 'event', 'movie', 'movies', 'cinema', 'theatre', 'theater', 'show', 'concert', 'auditorium', 'multiplex', 'hall', 'nightclub', 'local events'],
     '[["amenity",["theatre","cinema","community_centre","events_venue","arts_centre","conference_centre","exhibition_centre","nightclub","music_venue"]]]'::jsonb),
  ('coworking', 'travel', 'Coworking spaces', 'Coworking space', 'Laptop', false, false, 480,
     array['coworking', 'co-working', 'shared office', 'work space', 'workspace', 'wework', 'hot desk', 'meeting room'],
     '[["amenity",["coworking_space"]],["office",["coworking"]]]'::jsonb),
  ('police', 'safety', 'Police stations', 'Police station', 'Shield', false, false, 490,
     array['police', 'police station', 'cops', 'traffic police'],
     '[["amenity",["police"]]]'::jsonb),
  ('fire-stations', 'safety', 'Fire stations', 'Fire station', 'Flame', false, false, 500,
     array['fire station', 'fire brigade', 'fire service', 'fire engine'],
     '[["amenity",["fire_station"]]]'::jsonb)
on conflict (id) do update
  set group_id = excluded.group_id, label = excluded.label, singular = excluded.singular, icon = excluded.icon,
      nameless = excluded.nameless, sort_order = excluded.sort_order, keywords = excluded.keywords, osm_rules = excluded.osm_rules;

-- Badge rules: "at least min_count non-rejected contributions of these kinds", or "reached level min_level".
insert into public.badges (id, name, description, icon, kinds, min_count, min_level, sort_order)
values
  ('first-review', 'First word', 'Wrote a first review', 'PenLine', array['review']::public.contribution_kind[], 1, null, 10),
  ('critic', 'Local critic', 'Reviewed 10 places', 'Star', array['review']::public.contribution_kind[], 10, null, 20),
  ('reporter', 'On the ground', 'Shared 5 live updates', 'Radio', array['report']::public.contribution_kind[], 5, null, 30),
  ('eagle-eye', 'Eagle eye', 'Confirmed 10 updates from others', 'Eye', array['confirm']::public.contribution_kind[], 10, null, 40),
  ('shutterbug', 'Shutterbug', 'Added 3 photos', 'Camera', array['photo']::public.contribution_kind[], 3, null, 50),
  ('mapmaker', 'Mapmaker', 'Added or fixed 3 places', 'MapPinPlus', array['place', 'edit', 'missing', 'closed']::public.contribution_kind[], 3, null, 60),
  ('trusted', 'Trusted voice', 'Reached Neighborhood Expert', 'ShieldCheck', null, null, 2, 70)
on conflict (id) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon,
      kinds = excluded.kinds, min_count = excluded.min_count, min_level = excluded.min_level, sort_order = excluded.sort_order;

-- The single configuration row. Its column defaults are DEFAULT_CONFIG from
-- src/services/backend/localDb.ts (0002 already inserts it; repeated here so this file is
-- complete on its own). An existing row — i.e. settings an admin has changed — is never touched.
insert into public.app_config default values on conflict (id) do nothing;

-- Badges are awarded when a contribution changes. If badges were added after users already
-- earned them, re-evaluate everyone once.
do $$
declare
  u uuid;
begin
  for u in select distinct c.user_id from public.user_contributions c loop
    perform public.recompute_user_score(u);
  end loop;
end
$$;
