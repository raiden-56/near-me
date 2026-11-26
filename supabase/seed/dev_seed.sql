-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · DEVELOPMENT SEED — never required in production, never run it there
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- How to run
--   • `supabase db reset` (local stack) applies the migrations and then this file, when
--     supabase/config.toml has   [db.seed]  sql_paths = ["./seed/dev_seed.sql"]
--   • or paste it into the SQL editor of a *development* project / run it with psql.
--   It must run as the `postgres` role (it writes to auth.users and sets is_sample).
--
-- What it contains
--   PART A  Reference data: category taxonomy, badges, default app_config.
--           Production gets these rows from migration 0006_reference_data.sql. They are
--           repeated here with ON CONFLICT DO NOTHING so the seed also works on a database
--           where only 0001-0005 were applied; they never overwrite existing rows.
--   PART B  A small sample data set, every row flagged is_sample = true.
--           Purge it with:   select public.purge_sample_data();
--
-- The whole file is idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Safety net: refuse to add sample data to a database that already has real accounts.
-- Override deliberately with:   set nearme.allow_dev_seed = 'on';
do $$
declare
  v_real integer;
begin
  select count(*) into v_real from public.profiles p where not p.is_sample;
  if v_real > 25 and coalesce(current_setting('nearme.allow_dev_seed', true), '') <> 'on' then
    raise exception 'dev_seed.sql: % non-sample accounts found. This looks like a real database; the development seed was not applied.', v_real
      using hint = 'If this really is a development database: set nearme.allow_dev_seed = ''on''; and run the file again.';
  end if;
end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART A · REFERENCE DATA (mirror of migration 0006; safe everywhere, changes nothing that exists)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- A.1 · Category groups (9)
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
on conflict (id) do nothing;

-- A.2 · Categories (50) — ids, labels and groups from src/data/categories.ts
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
on conflict (id) do nothing;

-- A.3 · Badges
insert into public.badges (id, name, description, icon, kinds, min_count, min_level, sort_order)
values
  ('first-review', 'First word', 'Wrote a first review', 'PenLine', array['review']::public.contribution_kind[], 1, null, 10),
  ('critic', 'Local critic', 'Reviewed 10 places', 'Star', array['review']::public.contribution_kind[], 10, null, 20),
  ('reporter', 'On the ground', 'Shared 5 live updates', 'Radio', array['report']::public.contribution_kind[], 5, null, 30),
  ('eagle-eye', 'Eagle eye', 'Confirmed 10 updates from others', 'Eye', array['confirm']::public.contribution_kind[], 10, null, 40),
  ('shutterbug', 'Shutterbug', 'Added 3 photos', 'Camera', array['photo']::public.contribution_kind[], 3, null, 50),
  ('mapmaker', 'Mapmaker', 'Added or fixed 3 places', 'MapPinPlus', array['place', 'edit', 'missing', 'closed']::public.contribution_kind[], 3, null, 60),
  ('trusted', 'Trusted voice', 'Reached Neighborhood Expert', 'ShieldCheck', null, null, 2, 70)
on conflict (id) do nothing;

-- A.4 · Default configuration (column defaults = DEFAULT_CONFIG in src/services/backend/localDb.ts:
--       expiry minutes per report type, 3 confirmations to verify, 6 reports/hour, hide at 4 disagreements …)
insert into public.app_config default values on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART B · SAMPLE DATA — DEVELOPMENT ONLY
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- A small, fictional neighbourhood around the app's default location (BTM Layout, Bengaluru:
-- 12.9166, 77.6101). Every row written here — or derived from it by a trigger — carries
-- is_sample = true.
--
--   Remove all of it again with ONE statement:
--
--       select public.purge_sample_data();
--
--   (deletes every is_sample row in every table and the six sample accounts; returns counts.)
--
-- Sample accounts have an empty password hash and @sample.nearme.invalid addresses: nobody can
-- sign in as them. All ids are fixed so that the block is idempotent; re-running it also
-- refreshes the sample live updates, deals and events, which otherwise expire like real ones.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- B.1 · Sample accounts (handle_new_user creates profile, preferences and starter collections)
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   confirmation_token, recovery_token, email_change_token_new, email_change,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.name),
  now() - u.member_for, now() - u.member_for
from (values
  ('5a000000-0000-4000-8000-000000000001'::uuid, 'ananya@sample.nearme.invalid',  'Ananya R.',  interval '200 days'),
  ('5a000000-0000-4000-8000-000000000002'::uuid, 'rohan@sample.nearme.invalid',   'Rohan S.',   interval '150 days'),
  ('5a000000-0000-4000-8000-000000000003'::uuid, 'meera@sample.nearme.invalid',   'Meera K.',   interval '90 days'),
  ('5a000000-0000-4000-8000-000000000004'::uuid, 'karthik@sample.nearme.invalid', 'Karthik M.', interval '30 days'),
  ('5a000000-0000-4000-8000-000000000005'::uuid, 'divya@sample.nearme.invalid',   'Divya N.',   interval '120 days'),
  ('5a000000-0000-4000-8000-000000000006'::uuid, 'imran@sample.nearme.invalid',   'Imran P.',   interval '60 days')
) as u (id, email, name, member_for)
on conflict (id) do nothing;

update public.profiles p
set is_sample = true,
    bio       = 'Sample account (development seed).'
where p.id in (
  '5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002',
  '5a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000004',
  '5a000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000006'
)
  and not p.is_sample;

-- B.2 · Sample businesses. They are NearMe-only listings (osm_ref stays NULL), so they can
--       never collide with a real OpenStreetMap id. Owned by the two sample business accounts.
insert into public.businesses
  (id, owner_id, name, description, category_id, lat, lon, address, locality, phone, opening_hours, price_level, verification_status, is_sample)
values
  ('5b000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000005', 'Third Wave Filter Kaapi', 'Sample listing. South Indian filter coffee and light snacks.',  'cafes',          12.91720, 77.61050, '14, 7th Main Road, BTM 2nd Stage',   'BTM Layout', '+91 80 5550 0101', 'Mo-Su 07:00-22:00', 1,    'verified', true),
  ('5b000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000005', 'Malgudi Tiffin Room',     'Sample listing. Dosa, idli and meals served on banana leaf.',   'restaurants',    12.91590, 77.60890, '221, 16th Main Road, BTM 2nd Stage', 'BTM Layout', '+91 80 5550 0102', 'Mo-Su 07:30-22:30', 2,    'verified', true),
  ('5b000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000006', 'GreenCross Pharmacy',     'Sample listing. Round-the-clock pharmacy with home delivery.',  'medical-stores', 12.91810, 77.61200, '5, 29th Main Road, BTM 2nd Stage',   'BTM Layout', '+91 80 5550 0103', '24/7',              2,    'verified', true),
  ('5b000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000006', 'QuickFill Fuel Station',  'Sample listing. Petrol, diesel and free air.',                  'petrol-pumps',   12.91400, 77.61310, 'Outer Ring Road, BTM 2nd Stage',     'BTM Layout', '+91 80 5550 0104', 'Mo-Su 06:00-23:00', null, 'verified', true),
  ('5b000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000006', 'Iron Temple Gym',         'Sample listing. Strength floor, cardio and group classes.',     'gyms',           12.91950, 77.60780, '88, 4th Cross, BTM 1st Stage',       'BTM Layout', '+91 80 5550 0105', 'Mo-Sa 05:30-22:00', 3,    'verified', true),
  ('5b000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000005', 'Lakeview Unisex Salon',   'Sample listing. Haircuts, styling and spa by appointment.',     'salons',         12.91500, 77.61500, '31, Lake Road, Madiwala',            'BTM Layout', '+91 80 5550 0106', 'Tu-Su 10:00-20:30', 2,    'verified', true)
on conflict (id) do nothing;

-- Structured hours for two of them (they drive the "open now" filter): the cafe is open every
-- day 07:00-22:00, the salon is closed on Mondays.
insert into public.business_hours (business_id, day_of_week, is_closed, opens, closes)
select '5b000000-0000-4000-8000-000000000001'::uuid, d, false, time '07:00', time '22:00'
from generate_series(1, 7) as d
on conflict (business_id, day_of_week) do nothing;

insert into public.business_hours (business_id, day_of_week, is_closed, opens, closes)
select '5b000000-0000-4000-8000-000000000006'::uuid, d, d = 1,
       case when d = 1 then null else time '10:00' end,
       case when d = 1 then null else time '20:30' end
from generate_series(1, 7) as d
on conflict (business_id, day_of_week) do nothing;

insert into public.business_services (id, business_id, name, price, note, sort_order)
values
  ('5b100000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000006', 'Haircut',      '₹250',   'Wash and style included', 1),
  ('5b100000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000006', 'Head massage', '₹400',   '30 minutes',              2),
  ('5b100000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000005', 'Monthly pass', '₹1,800', null,                      1)
on conflict (id) do nothing;

-- B.3 · Sample reviews (rating aggregates and contribution points follow from the triggers)
insert into public.reviews (id, business_id, user_id, rating, aspects, body, is_sample, created_at)
values
  ('5c000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 5, '{"Taste": 5, "Service": 4}',   'Sample review. Strong decoction, served hot in a steel tumbler. Gets busy after 8 am.', true, now() - interval '9 days'),
  ('5c000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002', 4, '{"Taste": 4, "Value": 5}',     'Sample review. Good coffee for the price. Limited seating, mostly standing tables.',   true, now() - interval '4 days'),
  ('5c000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 4, '{"Taste": 5, "Wait": 3}',      'Sample review. The ghee roast dosa is excellent. Expect a queue on weekend mornings.', true, now() - interval '12 days'),
  ('5c000000-0000-4000-8000-000000000004', '5b000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000003', 3, '{}',                            'Sample review. Food was fine but the service was slow when we visited at lunch.',      true, now() - interval '2 days'),
  ('5c000000-0000-4000-8000-000000000005', '5b000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000004', 5, '{"Availability": 5}',           'Sample review. Open at 2 am when I needed it, and they had everything in stock.',      true, now() - interval '6 days'),
  ('5c000000-0000-4000-8000-000000000006', '5b000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000002', 4, '{"Equipment": 4, "Crowd": 3}', 'Sample review. Well maintained equipment. Evenings are crowded, mornings are calm.',    true, now() - interval '20 days'),
  ('5c000000-0000-4000-8000-000000000007', '5b000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000003', 5, '{"Service": 5}',                'Sample review. Booked a slot by phone and was seen on time. Friendly staff.',          true, now() - interval '1 day')
on conflict (id) do nothing;

-- One owner reply, so the reply UI has something to show.
update public.reviews r
set owner_reply    = 'Sample reply. Thank you. We have added a second counter for the lunch rush.',
    owner_reply_at = now() - interval '1 day',
    owner_reply_by = '5a000000-0000-4000-8000-000000000005'
where r.id = '5c000000-0000-4000-8000-000000000004'
  and r.owner_reply is null;

-- B.4 · Sample live updates. Timestamps are relative to now() and the expiry comes from
--       app_config, exactly as submit_report() would set it. The two area reports (no
--       business) go through coarsen_point() like real ones.
insert into public.community_reports
  (id, type, level, title, note, value, business_id, lat, lon, area_label, source, reporter_id, reporter_reputation,
   is_sample, created_at, refreshed_at, expires_at)
select
  r.id, r.type, r.level, r.title, r.note, r.value, r.business_id,
  coalesce(b.lat, cp.lat), coalesce(b.lon, cp.lon), coalesce(b.name, r.area_label), r.source, r.reporter_id, r.reputation,
  true, now() - r.age, now() - r.age, now() - r.age + make_interval(mins => public.report_ttl_minutes(r.type))
from (values
  ('5d000000-0000-4000-8000-000000000001'::uuid, 'queue'::public.report_type, 'good'::public.report_level, 'Short queue', 'Two cars at each pump.'::text, 4::numeric,
     '5b000000-0000-4000-8000-000000000004'::uuid, null::double precision, null::double precision, null::text,
     'community'::public.report_source, '5a000000-0000-4000-8000-000000000001'::uuid, 61::smallint, interval '4 minutes'),
  ('5d000000-0000-4000-8000-000000000002', 'wait_time', 'moderate', 'Waiting time about 20 min', null, 20,
     '5b000000-0000-4000-8000-000000000002', null, null, null,
     'community', '5a000000-0000-4000-8000-000000000002', 46, interval '8 minutes'),
  ('5d000000-0000-4000-8000-000000000003', 'availability', 'good', 'Available now', 'All medicines in stock today.', null,
     '5b000000-0000-4000-8000-000000000003', null, null, null,
     'business', '5a000000-0000-4000-8000-000000000006', 90, interval '10 minutes'),
  ('5d000000-0000-4000-8000-000000000004', 'traffic', 'bad', 'Heavy traffic congestion', 'Signal is not working.', null,
     null, 12.91663, 77.60412, 'Silk Board Junction',
     'community', '5a000000-0000-4000-8000-000000000003', 43, interval '6 minutes'),
  ('5d000000-0000-4000-8000-000000000005', 'outage', 'bad', 'Power outage in the area', null, null,
     null, 12.92087, 77.61133, 'BTM 1st Stage',
     'community', '5a000000-0000-4000-8000-000000000004', 40, interval '40 minutes')
) as r (id, type, level, title, note, value, business_id, lat, lon, area_label, source, reporter_id, reputation, age)
left join public.businesses b on b.id = r.business_id
left join lateral public.coarsen_point(r.lat, r.lon) cp on r.business_id is null
on conflict (id) do update
  set created_at   = excluded.created_at,
      refreshed_at = excluded.refreshed_at,
      expires_at   = excluded.expires_at;

-- Reactions from other sample accounts. The tally triggers maintain the counts and the first
-- confirmation verifies the reporter's contribution.
insert into public.report_confirmations (report_id, user_id)
values
  ('5d000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002'),
  ('5d000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000003'),
  ('5d000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000004'),
  ('5d000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.report_votes (report_id, user_id, kind)
values
  ('5d000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000001', 'disagree'),
  ('5d000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000004', 'helpful')
on conflict do nothing;

-- B.5 · Sample deals and events (their dates are moved forward on every run)
insert into public.deals (id, business_id, created_by, title, description, kind, badge, code, terms, starts_at, ends_at, moderation, is_sample)
values
  ('5e000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000005',
   'Two coffees for the price of one', 'Sample deal. Bring a friend between 3 and 5 pm on weekdays.', 'happy_hour', '2 for 1', null, 'Weekdays only. Dine-in.',
   now() - interval '1 day', now() + interval '6 days', 'visible', true),
  ('5e000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000006',
   '20% off the first month', 'Sample deal. For new members who join this week.', 'discount', '20% off', 'NEARME20', 'New memberships only.',
   now() - interval '2 days', now() + interval '5 days', 'visible', true)
on conflict (id) do update
  set starts_at = excluded.starts_at,
      ends_at   = excluded.ends_at;

insert into public.events (id, title, description, kind, venue_name, business_id, lat, lon, starts_at, ends_at, price, organizer_name, submitted_by, source, moderation, is_sample)
values
  ('5f000000-0000-4000-8000-000000000001', 'Sunday farmers market', 'Sample event. Local growers, fresh produce and breakfast stalls by the lake.', 'market', 'Madiwala Lake gate', null,
   12.91060, 77.61630, date_trunc('day', now()) + interval '2 days 7 hours', date_trunc('day', now()) + interval '2 days 11 hours', 'Free', 'Ananya R.',
   '5a000000-0000-4000-8000-000000000001', 'community', 'visible', true),
  ('5f000000-0000-4000-8000-000000000002', 'Beginner strength workshop', 'Sample event. A coached introduction to the main barbell lifts. Limited to twelve people.', 'workshop', 'Iron Temple Gym', '5b000000-0000-4000-8000-000000000005',
   12.91950, 77.60780, date_trunc('day', now()) + interval '3 days 18 hours', date_trunc('day', now()) + interval '3 days 20 hours', '₹300', 'Iron Temple Gym',
   '5a000000-0000-4000-8000-000000000006', 'business', 'visible', true)
on conflict (id) do update
  set starts_at = excluded.starts_at,
      ends_at   = excluded.ends_at;

insert into public.event_interest (event_id, user_id)
values
  ('5f000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002'),
  ('5f000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000003')
on conflict do nothing;

-- B.6 · One pending map suggestion for the admin queue
insert into public.place_suggestions (id, kind, name, category_id, lat, lon, details, user_id, status, is_sample)
values
  ('5f100000-0000-4000-8000-000000000001', 'add', 'Sri Sai Cycle Works', 'bike-repair', 12.91480, 77.60950,
   'Sample suggestion. Small puncture and cycle repair shop next to the bus stop; not on the map yet.',
   '5a000000-0000-4000-8000-000000000002', 'pending', true)
on conflict (id) do nothing;
