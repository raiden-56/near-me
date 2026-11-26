import type { Category, CategoryGroup, GroupId, Tone } from '@/types';

/**
 * NearMe's category taxonomy and how each category maps onto OpenStreetMap tags.
 * Order matters: a place's primary category is the first one whose rules match.
 */

export const GROUPS: readonly CategoryGroup[] = [
  { id: 'food', label: 'Food', blurb: 'Restaurants, cafes and quick bites', icon: 'Utensils', tone: 'brand' },
  { id: 'health', label: 'Health', blurb: 'Hospitals, clinics and pharmacies', icon: 'HeartPulse', tone: 'danger' },
  { id: 'shopping', label: 'Shopping', blurb: 'Groceries, malls and stores', icon: 'ShoppingBag', tone: 'butter' },
  { id: 'automotive', label: 'Automotive', blurb: 'Fuel, repairs, charging and parking', icon: 'CarFront', tone: 'forest' },
  { id: 'home', label: 'Home Services', blurb: 'Trusted help for your home', icon: 'House', tone: 'clay' },
  { id: 'fitness', label: 'Fitness', blurb: 'Gyms, sports and green spaces', icon: 'Dumbbell', tone: 'success' },
  { id: 'daily', label: 'Daily Needs', blurb: 'ATMs, salons, laundry and more', icon: 'ListChecks', tone: 'sand' },
  { id: 'travel', label: 'Travel & Leisure', blurb: 'Stays, sights and things to do', icon: 'Compass', tone: 'sage' },
  { id: 'safety', label: 'Safety', blurb: 'Police and fire services', icon: 'ShieldAlert', tone: 'danger' },
];

const STREET_CUISINES = [
  'indian', 'south_indian', 'north_indian', 'chaat', 'street_food', 'regional', 'dosa', 'momo', 'momos',
  'pani_puri', 'vada_pav', 'snack', 'snacks', 'juice', 'tea', 'kebab', 'shawarma', 'rolls', 'andhra', 'kerala',
];

export const CATEGORIES: readonly Category[] = [
  /* ── Food ─────────────────────────────────────────────────────────── */
  {
    id: 'restaurants', groupId: 'food', label: 'Restaurants', singular: 'Restaurant', icon: 'UtensilsCrossed', featured: true,
    rules: [['amenity', ['restaurant']]],
    keywords: ['restaurant', 'restaurants', 'dinner', 'lunch', 'meals', 'dosa', 'biryani', 'thali', 'food', 'eat', 'dining', 'family restaurant', 'veg', 'non veg', 'idli', 'north indian', 'south indian', 'chinese', 'pizza place'],
  },
  {
    id: 'cafes', groupId: 'food', label: 'Cafes', singular: 'Cafe', icon: 'Coffee', featured: true,
    rules: [['amenity', ['cafe', 'juice_bar']], ['shop', ['coffee', 'tea']]],
    keywords: ['cafe', 'cafes', 'coffee', 'tea', 'chai', 'cappuccino', 'breakfast', 'coffee shop', 'filter coffee', 'juice', 'work friendly cafe'],
  },
  {
    id: 'bakeries', groupId: 'food', label: 'Bakeries', singular: 'Bakery', icon: 'Croissant',
    rules: [['shop', ['bakery', 'pastry']]],
    keywords: ['bakery', 'bakeries', 'bread', 'cake', 'cakes', 'puff', 'pastry', 'bun', 'cookies'],
  },
  {
    id: 'desserts', groupId: 'food', label: 'Desserts', singular: 'Dessert spot', icon: 'IceCreamCone',
    rules: [['amenity', ['ice_cream']], ['shop', ['confectionery', 'chocolate', 'ice_cream', 'sweets']]],
    keywords: ['dessert', 'desserts', 'ice cream', 'sweets', 'sweet shop', 'mithai', 'gelato', 'kulfi', 'chocolate', 'falooda'],
  },
  {
    id: 'street-food', groupId: 'food', label: 'Street food', singular: 'Street food', icon: 'Soup',
    rules: [['amenity', ['food_court']], ['amenity', ['fast_food'], { cuisine: STREET_CUISINES }], ['street_vendor', ['yes']]],
    keywords: ['street food', 'chaat', 'pani puri', 'golgappa', 'vada pav', 'momos', 'snacks', 'bajji', 'food court', 'tiffin', 'darshini', 'chats'],
  },
  {
    id: 'fast-food', groupId: 'food', label: 'Fast food', singular: 'Fast food', icon: 'Sandwich',
    rules: [['amenity', ['fast_food']]],
    keywords: ['fast food', 'burger', 'burgers', 'pizza', 'fries', 'sandwich', 'quick bite', 'takeaway', 'rolls', 'shawarma', 'cheap lunch'],
  },
  {
    id: 'bars', groupId: 'food', label: 'Pubs & bars', singular: 'Bar', icon: 'Beer',
    rules: [['amenity', ['bar', 'pub', 'biergarten']]],
    keywords: ['bar', 'bars', 'pub', 'pubs', 'brewery', 'beer', 'drinks', 'cocktails', 'happy hour', 'microbrewery'],
  },

  /* ── Health ───────────────────────────────────────────────────────── */
  {
    id: 'emergency-care', groupId: 'health', label: 'Emergency care', singular: 'Emergency care', icon: 'Siren',
    rules: [['amenity', ['hospital', 'clinic'], { emergency: ['yes'] }], ['amenity', ['ambulance_station']], ['emergency', ['ambulance_station']]],
    keywords: ['emergency', 'emergency care', 'casualty', 'trauma', 'ambulance', '24 hour hospital', 'accident', 'er', 'emergency services', 'urgent care'],
  },
  {
    id: 'hospitals', groupId: 'health', label: 'Hospitals', singular: 'Hospital', icon: 'Hospital', featured: true,
    rules: [['amenity', ['hospital']], ['healthcare', ['hospital']]],
    keywords: ['hospital', 'hospitals', 'multispeciality', 'nursing home', 'medical centre', 'maternity'],
  },
  {
    id: 'clinics', groupId: 'health', label: 'Clinics', singular: 'Clinic', icon: 'Stethoscope',
    rules: [['amenity', ['clinic', 'doctors', 'dentist']], ['healthcare', ['clinic', 'doctor', 'dentist', 'centre', 'physiotherapist', 'optometrist']]],
    keywords: ['clinic', 'clinics', 'doctor', 'doctors', 'dentist', 'dental', 'physician', 'pediatrician', 'skin doctor', 'eye clinic', 'physio', 'consultation', 'gp'],
  },
  {
    id: 'medical-stores', groupId: 'health', label: 'Medical stores', singular: 'Medical store', icon: 'Pill', featured: true,
    rules: [['amenity', ['pharmacy']], ['shop', ['chemist']], ['healthcare', ['pharmacy']]],
    keywords: ['pharmacy', 'pharmacies', 'medical store', 'medical shop', 'medicals', 'chemist', 'drugstore', 'drug store', 'medicine', 'medicines', 'tablets', 'apollo pharmacy'],
  },
  {
    id: 'diagnostic-labs', groupId: 'health', label: 'Diagnostic labs', singular: 'Diagnostic lab', icon: 'FlaskConical',
    rules: [['healthcare', ['laboratory', 'sample_collection', 'diagnostics', 'blood_donation']], ['amenity', ['laboratory']]],
    keywords: ['lab', 'labs', 'diagnostic', 'diagnostics', 'blood test', 'scan', 'x-ray', 'xray', 'pathology', 'mri', 'ct scan', 'health checkup'],
  },

  /* ── Shopping ─────────────────────────────────────────────────────── */
  {
    id: 'supermarkets', groupId: 'shopping', label: 'Supermarkets', singular: 'Supermarket', icon: 'ShoppingCart', featured: true,
    rules: [['shop', ['supermarket', 'wholesale']]],
    keywords: ['supermarket', 'supermarkets', 'hypermarket', 'dmart', 'big bazaar', 'more supermarket', 'reliance fresh', 'departmental'],
  },
  {
    id: 'grocery', groupId: 'shopping', label: 'Grocery', singular: 'Grocery', icon: 'ShoppingBasket',
    rules: [['shop', ['convenience', 'greengrocer', 'grocery', 'general', 'butcher', 'dairy', 'seafood', 'kiosk', 'health_food', 'spices', 'farm']], ['amenity', ['marketplace']]],
    keywords: ['grocery', 'groceries', 'kirana', 'vegetables', 'fruits', 'provisions', 'provision store', 'milk', 'market', 'sabzi', 'meat', 'chicken shop', 'general store'],
  },
  {
    id: 'malls', groupId: 'shopping', label: 'Shopping malls', singular: 'Mall', icon: 'Building2',
    rules: [['shop', ['mall']]],
    keywords: ['mall', 'malls', 'shopping mall', 'shopping centre', 'shopping center', 'complex', 'arcade'],
  },
  {
    id: 'electronics', groupId: 'shopping', label: 'Electronics', singular: 'Electronics store', icon: 'MonitorSmartphone',
    rules: [['shop', ['electronics', 'computer', 'hifi', 'appliance', 'camera']]],
    keywords: ['electronics', 'electronic', 'computer', 'laptop', 'tv', 'gadgets', 'appliances', 'croma', 'headphones', 'camera'],
  },
  {
    id: 'clothing', groupId: 'shopping', label: 'Clothing', singular: 'Clothing store', icon: 'Shirt',
    rules: [['shop', ['clothes', 'shoes', 'boutique', 'fashion', 'tailor', 'fabric', 'bag', 'jewelry', 'fashion_accessories']]],
    keywords: ['clothing', 'clothes', 'garments', 'shoes', 'footwear', 'tailor', 'saree', 'sarees', 'boutique', 'fashion', 'jewellery', 'jewelry', 'apparel', 'textiles'],
  },
  {
    id: 'stores', groupId: 'shopping', label: 'Stores', singular: 'Store', icon: 'Store',
    rules: [['shop', ['department_store', 'variety_store', 'gift', 'books', 'stationery', 'hardware', 'furniture', 'toys', 'sports', 'optician', 'cosmetics', 'florist', 'pet', 'doityourself', 'houseware', 'interior_decoration', 'bed', 'outdoor', 'garden_centre', 'art', 'music', 'watches', 'perfumery', 'copyshop', 'photo', 'alcohol', 'beverages', 'baby_goods', 'kitchen', 'musical_instrument', 'craft', 'frame', 'travel_agency']]],
    keywords: ['store', 'stores', 'shop', 'shops', 'stationery', 'books', 'book shop', 'hardware', 'gifts', 'furniture', 'toys', 'optician', 'spectacles', 'florist', 'flowers', 'pet shop', 'xerox', 'photocopy', 'wine shop', 'liquor'],
  },

  /* ── Automotive ───────────────────────────────────────────────────── */
  {
    id: 'petrol-pumps', groupId: 'automotive', label: 'Petrol pumps', singular: 'Petrol pump', icon: 'Fuel', featured: true, nameless: true,
    rules: [['amenity', ['fuel']]],
    keywords: ['petrol', 'petrol pump', 'petrol bunk', 'diesel', 'fuel', 'gas station', 'cng', 'fuel station', 'hp petrol', 'indian oil', 'bharat petroleum', 'low queue'],
  },
  {
    id: 'ev-charging', groupId: 'automotive', label: 'EV charging', singular: 'EV charging station', icon: 'PlugZap', nameless: true,
    rules: [['amenity', ['charging_station']]],
    keywords: ['ev', 'ev charging', 'charging station', 'electric vehicle', 'charger', 'ev charger', 'ather grid', 'fast charger', 'charging point'],
  },
  {
    id: 'bike-repair', groupId: 'automotive', label: 'Bike repair', singular: 'Bike repair', icon: 'Bike',
    rules: [['shop', ['motorcycle_repair', 'motorcycle', 'bicycle']], ['amenity', ['bicycle_repair_station']], ['craft', ['motorcycle_repair']]],
    keywords: ['bike repair', 'bike mechanic', 'bike puncture', 'puncture', 'puncture repair', 'two wheeler', 'two-wheeler', 'scooter service', 'bike service', 'tyre puncture', 'motorcycle', 'cycle repair', 'bike garage'],
  },
  {
    id: 'car-repair', groupId: 'automotive', label: 'Car repair', singular: 'Car repair', icon: 'Wrench',
    rules: [['shop', ['car_repair', 'tyres', 'car_parts']], ['craft', ['car_repair']]],
    keywords: ['car repair', 'car service', 'garage', 'car mechanic', 'tyre shop', 'tyres', 'wheel alignment', 'denting', 'car ac', 'spare parts', 'roadside assistance', 'towing'],
  },
  {
    id: 'mechanics', groupId: 'automotive', label: 'Mechanics', singular: 'Mechanic', icon: 'Cog',
    rules: [['shop', ['car_repair', 'motorcycle_repair', 'tyres', 'motorcycle']], ['craft', ['mechanic', 'car_repair', 'motorcycle_repair']]],
    keywords: ['mechanic', 'mechanics', 'repair shop', 'workshop', 'vehicle repair', 'breakdown', 'roadside help'],
  },
  {
    id: 'car-wash', groupId: 'automotive', label: 'Car wash', singular: 'Car wash', icon: 'Droplets',
    rules: [['amenity', ['car_wash']]],
    keywords: ['car wash', 'bike wash', 'water wash', 'detailing', 'car cleaning', 'foam wash'],
  },
  {
    id: 'parking', groupId: 'automotive', label: 'Parking', singular: 'Parking', icon: 'SquareParking', nameless: true,
    rules: [['amenity', ['parking', 'motorcycle_parking', 'parking_entrance']]],
    keywords: ['parking', 'park', 'car park', 'parking lot', 'bike parking', 'two wheeler parking', 'pay and park', 'parking near mall'],
  },

  /* ── Home services ────────────────────────────────────────────────── */
  {
    id: 'electricians', groupId: 'home', label: 'Electricians', singular: 'Electrician', icon: 'Zap',
    rules: [['craft', ['electrician']], ['shop', ['electrical']]],
    keywords: ['electrician', 'electricians', 'wiring', 'electrical', 'electric work', 'switch repair', 'fan repair', 'inverter'],
  },
  {
    id: 'plumbers', groupId: 'home', label: 'Plumbers', singular: 'Plumber', icon: 'ShowerHead',
    rules: [['craft', ['plumber']], ['shop', ['bathroom_furnishing', 'plumbing']]],
    keywords: ['plumber', 'plumbers', 'plumbing', 'pipe', 'leak', 'tap repair', 'drain', 'sanitary'],
  },
  {
    id: 'carpenters', groupId: 'home', label: 'Carpenters', singular: 'Carpenter', icon: 'Hammer',
    rules: [['craft', ['carpenter', 'joiner', 'cabinet_maker', 'upholsterer']]],
    keywords: ['carpenter', 'carpenters', 'woodwork', 'furniture repair', 'wood work', 'door repair', 'modular'],
  },
  {
    id: 'painters', groupId: 'home', label: 'Painters', singular: 'Painter', icon: 'PaintRoller',
    rules: [['craft', ['painter']], ['shop', ['paint']]],
    keywords: ['painter', 'painters', 'painting', 'wall paint', 'house painting', 'paint shop', 'asian paints'],
  },
  {
    id: 'cleaning', groupId: 'home', label: 'Cleaning services', singular: 'Cleaning service', icon: 'SprayCan',
    rules: [['craft', ['cleaning', 'pest_control', 'window_cleaning']], ['office', ['cleaning']]],
    keywords: ['cleaning', 'cleaner', 'housekeeping', 'maid', 'deep clean', 'pest control', 'sofa cleaning', 'home cleaning'],
  },
  {
    id: 'appliance-repair', groupId: 'home', label: 'Appliance repair', singular: 'Appliance repair', icon: 'WashingMachine',
    rules: [['craft', ['electronics_repair', 'hvac', 'appliance_repair']], ['shop', ['repair']]],
    keywords: ['appliance repair', 'ac repair', 'ac service', 'fridge repair', 'washing machine', 'tv repair', 'microwave', 'geyser', 'ro service', 'purifier'],
  },

  /* ── Fitness ──────────────────────────────────────────────────────── */
  {
    id: 'yoga', groupId: 'fitness', label: 'Yoga', singular: 'Yoga studio', icon: 'Flower2',
    rules: [['leisure', ['fitness_centre', 'sports_centre'], { sport: ['yoga', 'pilates', 'meditation'] }], ['sport', ['yoga']]],
    keywords: ['yoga', 'yoga class', 'meditation', 'pilates', 'yoga studio', 'pranayama'],
  },
  {
    id: 'gyms', groupId: 'fitness', label: 'Gyms', singular: 'Gym', icon: 'Dumbbell', featured: true,
    rules: [['leisure', ['fitness_centre', 'fitness_station']], ['amenity', ['gym']]],
    keywords: ['gym', 'gyms', 'fitness', 'workout', 'crossfit', 'fitness centre', 'cult fit', 'weights', 'zumba', 'gym under'],
  },
  {
    id: 'swimming', groupId: 'fitness', label: 'Swimming', singular: 'Swimming pool', icon: 'Waves', nameless: true,
    rules: [['leisure', ['swimming_pool', 'water_park', 'swimming_area']], ['sport', ['swimming']]],
    keywords: ['swimming', 'swimming pool', 'pool', 'swim', 'water park'],
  },
  {
    id: 'sports', groupId: 'fitness', label: 'Sports', singular: 'Sports venue', icon: 'Trophy', nameless: true,
    rules: [['leisure', ['sports_centre', 'pitch', 'stadium', 'sports_hall', 'track', 'ice_rink', 'bowling_alley']]],
    keywords: ['sports', 'badminton', 'cricket', 'football', 'turf', 'court', 'tennis', 'basketball', 'stadium', 'ground', 'box cricket', 'futsal', 'bowling'],
  },
  {
    id: 'parks', groupId: 'fitness', label: 'Parks', singular: 'Park', icon: 'Trees', nameless: true, featured: true,
    rules: [['leisure', ['park', 'garden', 'playground', 'nature_reserve', 'dog_park']]],
    keywords: ['park', 'parks', 'garden', 'walk', 'jogging', 'playground', 'green space', 'lake', 'morning walk', 'kids play area'],
  },

  /* ── Daily needs ──────────────────────────────────────────────────── */
  {
    id: 'atms', groupId: 'daily', label: 'ATMs', singular: 'ATM', icon: 'Banknote', nameless: true, featured: true,
    rules: [['amenity', ['atm']], ['amenity', ['bank'], { atm: ['yes'] }]],
    keywords: ['atm', 'atms', 'cash', 'withdraw', 'cash machine', 'cash withdrawal', 'money'],
  },
  {
    id: 'banks', groupId: 'daily', label: 'Banks', singular: 'Bank', icon: 'Landmark',
    rules: [['amenity', ['bank', 'bureau_de_change', 'money_transfer']]],
    keywords: ['bank', 'banks', 'branch', 'sbi', 'hdfc', 'icici', 'axis', 'forex', 'loan'],
  },
  {
    id: 'public-toilets', groupId: 'daily', label: 'Public toilets', singular: 'Public toilet', icon: 'Toilet', nameless: true,
    rules: [['amenity', ['toilets']]],
    keywords: ['toilet', 'toilets', 'public toilet', 'washroom', 'restroom', 'loo', 'sulabh', 'bathroom'],
  },
  {
    id: 'laundry', groupId: 'daily', label: 'Laundry', singular: 'Laundry', icon: 'Shirt',
    rules: [['shop', ['laundry', 'dry_cleaning']]],
    keywords: ['laundry', 'dry clean', 'dry cleaning', 'dry cleaner', 'ironing', 'wash and fold', 'laundromat', 'press'],
  },
  {
    id: 'salons', groupId: 'daily', label: 'Salons', singular: 'Salon', icon: 'Scissors', featured: true,
    rules: [['shop', ['hairdresser', 'beauty', 'massage', 'tattoo']], ['leisure', ['spa', 'sauna']], ['amenity', ['spa']]],
    keywords: ['salon', 'salons', 'haircut', 'hair cut', 'barber', 'parlour', 'beauty parlour', 'spa', 'beauty', 'massage', 'facial', 'unisex salon', 'saloon'],
  },
  {
    id: 'mobile-repair', groupId: 'daily', label: 'Mobile repair', singular: 'Mobile shop', icon: 'Smartphone',
    rules: [['shop', ['mobile_phone', 'telecommunication']], ['craft', ['phone_repair']]],
    keywords: ['mobile repair', 'phone repair', 'screen replacement', 'mobile shop', 'recharge', 'sim card', 'mobile service', 'mobile store', 'display change'],
  },
  {
    id: 'courier', groupId: 'daily', label: 'Courier services', singular: 'Courier point', icon: 'Package', nameless: true,
    rules: [['amenity', ['post_office', 'parcel_locker', 'post_box']], ['office', ['courier', 'logistics']]],
    keywords: ['courier', 'post office', 'parcel', 'speed post', 'dtdc', 'bluedart', 'delivery', 'post box', 'shipping'],
  },

  /* ── Travel & leisure ─────────────────────────────────────────────── */
  {
    id: 'hotels', groupId: 'travel', label: 'Hotels', singular: 'Hotel', icon: 'BedDouble',
    rules: [['tourism', ['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'dormitory']]],
    keywords: ['hotel', 'hotels', 'stay', 'lodge', 'lodging', 'pg', 'room', 'hostel', 'guest house', 'accommodation', 'paying guest'],
  },
  {
    id: 'rentals', groupId: 'travel', label: 'Rental services', singular: 'Rental', icon: 'KeyRound',
    rules: [['amenity', ['car_rental', 'bicycle_rental', 'motorcycle_rental', 'car_sharing', 'kick-scooter_rental']], ['shop', ['rental']]],
    keywords: ['rental', 'rentals', 'rent a bike', 'rent a car', 'bike rental', 'car rental', 'self drive', 'cycle rental', 'scooter rental'],
  },
  {
    id: 'attractions', groupId: 'travel', label: 'Tourist attractions', singular: 'Attraction', icon: 'Camera', featured: true,
    rules: [['tourism', ['attraction', 'museum', 'viewpoint', 'gallery', 'zoo', 'theme_park', 'aquarium', 'artwork']], ['historic', '*']],
    keywords: ['attraction', 'attractions', 'tourist', 'sightseeing', 'museum', 'viewpoint', 'gallery', 'zoo', 'places to visit', 'heritage', 'monument', 'things to do', 'art'],
  },
  {
    id: 'events', groupId: 'travel', label: 'Event venues', singular: 'Event venue', icon: 'Ticket',
    rules: [['amenity', ['theatre', 'cinema', 'community_centre', 'events_venue', 'arts_centre', 'conference_centre', 'exhibition_centre', 'nightclub', 'music_venue']]],
    keywords: ['events', 'event', 'movie', 'movies', 'cinema', 'theatre', 'theater', 'show', 'concert', 'auditorium', 'multiplex', 'hall', 'nightclub', 'local events'],
  },
  {
    id: 'coworking', groupId: 'travel', label: 'Coworking spaces', singular: 'Coworking space', icon: 'Laptop',
    rules: [['amenity', ['coworking_space']], ['office', ['coworking']]],
    keywords: ['coworking', 'co-working', 'shared office', 'work space', 'workspace', 'wework', 'hot desk', 'meeting room'],
  },

  /* ── Safety ───────────────────────────────────────────────────────── */
  {
    id: 'police', groupId: 'safety', label: 'Police stations', singular: 'Police station', icon: 'Shield',
    rules: [['amenity', ['police']]],
    keywords: ['police', 'police station', 'cops', 'traffic police'],
  },
  {
    id: 'fire-stations', groupId: 'safety', label: 'Fire stations', singular: 'Fire station', icon: 'Flame',
    rules: [['amenity', ['fire_station']]],
    keywords: ['fire station', 'fire brigade', 'fire service', 'fire engine'],
  },
];

export const CATEGORY_BY_ID: Readonly<Record<string, Category>> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Readonly<Record<GroupId, CategoryGroup>>;

export const categoriesIn = (groupId: GroupId) => CATEGORIES.filter((c) => c.groupId === groupId);
export const browsableGroups = GROUPS.filter((g) => g.id !== 'safety');
export const getCategory = (id: string | undefined | null) => (id ? CATEGORY_BY_ID[id] : undefined);
export const toneOf = (categoryId: string): Tone => GROUP_BY_ID[CATEGORY_BY_ID[categoryId]?.groupId ?? 'daily'].tone;

/** Curated shortcuts for the home screen, in display order. */
export const HOME_CATEGORY_IDS = ['restaurants', 'cafes', 'medical-stores', 'petrol-pumps', 'atms', 'supermarkets', 'gyms', 'salons'] as const;

/** Things you may need in a hurry: used by "Nearby Essentials". */
export const ESSENTIAL_CATEGORY_IDS = ['medical-stores', 'atms', 'petrol-pumps', 'hospitals', 'public-toilets', 'ev-charging', 'parking'] as const;

/** Tone → Tailwind classes and a hex used where CSS variables are unavailable (map pins). */
export const TONES: Record<Tone, { soft: string; solid: string; text: string; hex: string; softHex: string }> = {
  brand: { soft: 'bg-brand-soft text-brand-ink', solid: 'bg-brand text-white', text: 'text-brand-ink', hex: '#E97845', softHex: '#FBEADF' },
  sage: { soft: 'bg-sage text-sage-ink', solid: 'bg-sage-ink text-white', text: 'text-sage-ink', hex: '#5E8767', softHex: '#DDE8DA' },
  butter: { soft: 'bg-butter-soft text-butter-ink', solid: 'bg-butter text-[#252B26]', text: 'text-butter-ink', hex: '#C49A1F', softHex: '#FAF1D2' },
  clay: { soft: 'bg-clay text-clay-ink', solid: 'bg-clay-ink text-white', text: 'text-clay-ink', hex: '#A56A4B', softHex: '#ECDDD0' },
  forest: { soft: 'bg-bg-2 text-ink', solid: 'bg-forest text-on-forest', text: 'text-ink', hex: '#3A443C', softHex: '#E4E2DA' },
  danger: { soft: 'bg-danger-soft text-danger', solid: 'bg-danger text-white', text: 'text-danger', hex: '#B4524A', softHex: '#F6E4E1' },
  success: { soft: 'bg-success-soft text-success', solid: 'bg-success text-white', text: 'text-success', hex: '#4C8B5A', softHex: '#E2EFE2' },
  sand: { soft: 'bg-bg-2 text-ink-2', solid: 'bg-ink-2 text-white', text: 'text-ink-2', hex: '#8A8271', softHex: '#EEECE5' },
};

/* ── Tag matching ───────────────────────────────────────────────────────── */

const values = (raw: string | undefined) => (raw ? raw.toLowerCase().split(/\s*;\s*/) : []);

export function matchesCategory(cat: Category, tags: Record<string, string>): boolean {
  for (const [key, accepted, extra] of cat.rules) {
    const raw = tags[key];
    if (!raw) continue;
    if (accepted !== '*' && !values(raw).some((v) => accepted.includes(v))) continue;
    if (extra) {
      const ok = Object.entries(extra).every(([ek, ev]) => values(tags[ek]).some((v) => ev.includes(v)));
      if (!ok) continue;
    }
    return true;
  }
  return false;
}

export function classify(tags: Record<string, string>): string[] {
  const out: string[] = [];
  for (const cat of CATEGORIES) if (matchesCategory(cat, tags)) out.push(cat.id);
  return out;
}

/** value → OSM key, derived from the rules. Lets us rebuild tags from map-tile POIs, which only carry the value. */
const VALUE_KEY: Record<string, string> = (() => {
  const index: Record<string, string> = {};
  for (const cat of CATEGORIES)
    for (const [key, accepted, extra] of cat.rules) {
      if (accepted === '*' || extra) continue;
      for (const v of accepted) index[v] ??= key;
    }
  return index;
})();

/** Rebuild minimal OSM tags from an OpenMapTiles `poi` feature (class + subclass). */
export function tagsFromTilePoi(cls: string, subclass: string | undefined): Record<string, string> | null {
  const sub = subclass && subclass !== 'undefined' ? subclass : '';
  if (cls === 'pitch') return sub ? { leisure: 'pitch', sport: sub } : { leisure: 'pitch' };
  if (cls === 'lodging') return sub ? { tourism: sub } : null;
  if (cls === 'office') return sub ? { office: sub } : null;
  if (cls === 'attraction' || cls === 'art_gallery' || cls === 'museum' || cls === 'castle') return { tourism: sub || cls };
  if (cls === 'place_of_worship' || cls === 'school' || cls === 'college' || cls === 'bus' || cls === 'railway') return null;
  if (sub && VALUE_KEY[sub]) return { [VALUE_KEY[sub]!]: sub };
  if (VALUE_KEY[cls]) return { [VALUE_KEY[cls]!]: cls };
  return null;
}

/** All OSM keys/values NearMe cares about, grouped by key. Drives Overpass queries. */
export function overpassFilters(categoryIds?: readonly string[]): { key: string; values: string[] | '*' }[] {
  const cats = categoryIds?.length ? CATEGORIES.filter((c) => categoryIds.includes(c.id)) : CATEGORIES;
  const byKey = new Map<string, Set<string> | '*'>();
  for (const cat of cats)
    for (const [key, accepted] of cat.rules) {
      if (accepted === '*') {
        byKey.set(key, '*');
        continue;
      }
      const cur = byKey.get(key);
      if (cur === '*') continue;
      const set = cur ?? new Set<string>();
      accepted.forEach((v) => set.add(v));
      byKey.set(key, set);
    }
  return [...byKey.entries()].map(([key, v]) => ({ key, values: v === '*' ? '*' : [...v] }));
}
