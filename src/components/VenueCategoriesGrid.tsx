import { initialVenueListings, venue12Categories } from '../data/venueData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import SafeImage from './SafeImage';

interface VenueCategoriesGridProps {
  activeCategory: string;
  onSelectCategory: (id: string) => void;
}

/**
 * Image-led venue category cards (Airbnb-style) for the Halls section.
 * One demo sample exists for every category.
 */
export function VenueCategoriesGrid({ activeCategory, onSelectCategory }: VenueCategoriesGridProps) {
  const tiles = venue12Categories.map((cat) => {
    const items = DEMO_DATA_ENABLED
      ? initialVenueListings.filter((listing) => listing.categoryId === cat.id)
      : [];
    return { cat, image: items[0]?.images?.[0], count: items.length };
  });

  return (
    <section className="w-full">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h2 className="text-sm font-black text-[#1e1b4b] dark:text-white">Browse halls by type</h2>
        <span className="text-[10.5px] font-semibold text-[#94a3b8]">{DEMO_DATA_ENABLED ? `${venue12Categories.length} categories · local demo samples` : 'No verified venue listings connected'}</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiles.map(({ cat, image, count }) => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(active ? 'all' : cat.id)}
              aria-pressed={active}
              className={`group relative w-[124px] shrink-0 overflow-hidden rounded-2xl border bg-white text-left transition sm:w-[144px] ${
                active ? 'border-[#7c3aed] ring-2 ring-purple-200' : 'border-[#ece8fb] hover:border-[#c4b5fd]'
              }`}
            >
              <div className="relative h-[82px] w-full overflow-hidden bg-slate-200">
                {image ? (
                  <SafeImage
                    src={image}
                    alt={cat.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    category="venues"
                    sizes="144px"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <span className="absolute left-1.5 top-1.5 text-[13px] leading-none">{cat.emoji}</span>
                <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-[10.5px] font-extrabold text-white">
                  {cat.name}
                </span>
              </div>
              <div className="flex items-center justify-between bg-white px-2 py-1.5 dark:bg-slate-900">
                <span className="text-[9px] font-bold text-[#475569] dark:text-slate-300">
                  {count} venue{count === 1 ? '' : 's'}
                </span>
                <span className={`text-[9px] font-black ${active ? 'text-emerald-600' : 'text-[#7c3aed]'}`}>
                  {active ? 'SELECTED' : 'VIEW'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
