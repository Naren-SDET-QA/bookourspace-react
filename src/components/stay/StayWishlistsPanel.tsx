import React from 'react';
import { Heart, X } from 'lucide-react';
import type { StaySearchItem } from '../../lib/staySearchClient';
import { StayCard } from './StayCard';

export function StayWishlistsPanel({
  items,
  nights,
  displayTotal,
  onOpen,
  onSave,
  onShare,
  onClose,
}: {
  items: StaySearchItem[];
  nights: number;
  displayTotal: boolean;
  onOpen: (item: StaySearchItem) => void;
  onSave: (listingId: string) => void;
  onShare: (item: StaySearchItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[96] overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="stay-wishlists-heading">
      <div className="sticky top-0 z-10 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <h2 id="stay-wishlists-heading" className="text-lg font-semibold">Wishlists</h2>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800" aria-label="Close wishlists">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6">
        {items.length === 0 ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <Heart className="mx-auto h-10 w-10 text-[#dddddd]" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-semibold">Save stays you like</h3>
            <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">
              Tap the heart on any stay. Signed-in wishlists sync to your account. Guest saves stay on this device only.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <StayCard
                key={item.id}
                item={item}
                nights={nights}
                displayTotal={displayTotal}
                saved
                onOpen={() => onOpen(item)}
                onSave={() => onSave(item.listingId)}
                onShare={() => onShare(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
