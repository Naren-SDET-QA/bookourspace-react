import React, { useRef } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Home,
  Hotel,
  Palmtree,
  PawPrint,
  Sparkles,
  Star,
  Trees,
  Umbrella,
  UtensilsCrossed,
  Waves,
  Wifi,
  Zap,
} from 'lucide-react';
import type { StayFilters } from '../../lib/stayFilters';

const CATEGORY_AMENITIES = ['pool', 'beachaccess', 'wifi', 'kitchen'] as const;

export interface StayCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  patch: Partial<StayFilters>;
}

export const STAY_CATEGORIES: StayCategory[] = [
  { id: 'all', label: 'Homes', icon: Home, patch: {} },
  { id: 'hotel', label: 'Hotels', icon: Hotel, patch: { propertyTypes: ['hotel'] } },
  { id: 'flat', label: 'Flats', icon: Building2, patch: { propertyTypes: ['apartment', 'flat'] } },
  { id: 'villa', label: 'Villas', icon: Trees, patch: { propertyTypes: ['villa'] } },
  { id: 'resort', label: 'Resorts', icon: Palmtree, patch: { propertyTypes: ['resort'] } },
  { id: 'homestay', label: 'Homestays', icon: Home, patch: { propertyTypes: ['homestay'] } },
  { id: 'guest', label: 'Guest favourites', icon: Sparkles, patch: { guestFavourite: true } },
  { id: 'instant', label: 'Instant', icon: Zap, patch: { instantBook: true } },
  { id: 'luxe', label: 'Luxe', icon: Star, patch: { luxeVerified: true } },
  { id: 'pool', label: 'Amazing pools', icon: Waves, patch: { amenities: ['pool'] } },
  { id: 'beach', label: 'Beach', icon: Umbrella, patch: { amenities: ['beachaccess'] } },
  { id: 'pets', label: 'Pets allowed', icon: PawPrint, patch: { petsAllowed: true } },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi, patch: { amenities: ['wifi'] } },
  { id: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed, patch: { amenities: ['kitchen'] } },
];

export function applyStayCategory(current: StayFilters, category: StayCategory): StayFilters {
  const keptAmenities = current.amenities.filter((item) => !CATEGORY_AMENITIES.includes(item as (typeof CATEGORY_AMENITIES)[number]));
  const { amenities: extraAmenities, ...restPatch } = category.patch;
  return {
    ...current,
    propertyTypes: [],
    guestFavourite: false,
    instantBook: false,
    luxeVerified: false,
    petsAllowed: false,
    amenities: [...keptAmenities, ...(extraAmenities || [])],
    ...restPatch,
  };
}

export function activeStayCategoryId(filters: StayFilters): string {
  for (const category of STAY_CATEGORIES) {
    if (category.id === 'all') continue;
    const patch = category.patch;
    if (patch.guestFavourite && filters.guestFavourite) return category.id;
    if (patch.instantBook && filters.instantBook) return category.id;
    if (patch.luxeVerified && filters.luxeVerified) return category.id;
    if (patch.petsAllowed && filters.petsAllowed) return category.id;
    if (patch.propertyTypes?.length && patch.propertyTypes.every((type) => filters.propertyTypes.includes(type))) {
      return category.id;
    }
    if (patch.amenities?.length && patch.amenities.every((amenity) => filters.amenities.includes(amenity))) {
      return category.id;
    }
  }
  return 'all';
}

export function StayCategoryRail({
  filters,
  onSelect,
}: {
  filters: StayFilters;
  onSelect: (category: StayCategory) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const active = activeStayCategoryId(filters);

  return (
    <div className="relative border-b border-[#ebebeb] bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-[1760px] items-center gap-2 px-2 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={() => scroller.current?.scrollBy({ left: -280, behavior: 'smooth' })}
          aria-label="Previous stay categories"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#222222] shadow-sm md:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div
          ref={scroller}
          role="tablist"
          aria-label="Stay categories"
          className="flex snap-x gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {STAY_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const selected = active === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(category)}
                className={`flex min-w-[76px] snap-start flex-col items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition ${
                  selected
                    ? 'text-[#222222] dark:text-white'
                    : 'text-[#717171] hover:text-[#222222] dark:hover:text-white'
                }`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className={`whitespace-nowrap border-b-2 pb-1 ${selected ? 'border-[#222222] dark:border-white' : 'border-transparent'}`}>
                  {category.label}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => scroller.current?.scrollBy({ left: 280, behavior: 'smooth' })}
          aria-label="Next stay categories"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#222222] shadow-sm md:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
