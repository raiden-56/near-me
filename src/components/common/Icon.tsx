import {
  Activity, BadgePercent, Banknote, BedDouble, Beer, Bike, Bookmark, Building2, CalendarDays, Camera, CarFront, CircleCheck, Coffee, Cog,
  Compass, Construction, Croissant, DoorClosed, Drama, Droplets, Dumbbell, Eye, Flame, FlaskConical, Flower2, Fuel, GraduationCap, Hammer,
  Heart, HeartPulse, History, Hospital, Hourglass, House, IceCreamCone, IndianRupee, KeyRound, Landmark, Laptop, ListChecks, MapPin,
  MapPinPlus, MapPinned, Megaphone, MonitorSmartphone, Music, Package, PaintRoller, PartyPopper, PenLine, Pill, PlugZap, Radio, Sandwich,
  Scissors, Shield, ShieldAlert, ShieldCheck, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart, ShowerHead, Siren, Smartphone, Soup,
  SprayCan, SquareParking, Star, Stethoscope, Store, Sun, Ticket, Toilet, TrafficCone, Trees, Trophy, Users, Utensils, UtensilsCrossed,
  WashingMachine, Waves, Wrench, Zap, ZapOff, type LucideIcon, type LucideProps,
} from 'lucide-react';

/** Icons that are referenced by name from data files (categories, report types, badges …). */
export const ICONS: Record<string, LucideIcon> = {
  Activity, BadgePercent, Banknote, BedDouble, Beer, Bike, Bookmark, Building2, CalendarDays, Camera, CarFront, CircleCheck, Coffee, Cog,
  Compass, Construction, Croissant, DoorClosed, Drama, Droplets, Dumbbell, Eye, Flame, FlaskConical, Flower2, Fuel, GraduationCap, Hammer,
  Heart, HeartPulse, History, Hospital, Hourglass, House, IceCreamCone, IndianRupee, KeyRound, Landmark, Laptop, ListChecks, MapPin,
  MapPinPlus, MapPinned, Megaphone, MonitorSmartphone, Music, Package, PaintRoller, PartyPopper, PenLine, Pill, PlugZap, Radio, Sandwich,
  Scissors, Shield, ShieldAlert, ShieldCheck, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart, ShowerHead, Siren, Smartphone, Soup,
  SprayCan, SquareParking, Star, Stethoscope, Store, Sun, Ticket, Toilet, TrafficCone, Trees, Trophy, Users, Utensils, UtensilsCrossed,
  WashingMachine, Waves, Wrench, Zap, ZapOff,
};

export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Cmp = ICONS[name] ?? MapPin;
  return <Cmp strokeWidth={1.75} aria-hidden {...props} />;
}
