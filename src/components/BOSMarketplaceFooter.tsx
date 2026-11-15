import React from 'react';
import { Phone, MapPin, ShieldCheck, MessageCircle } from 'lucide-react';
import { BOS_CONTACT_PHONE, BOS_CALL_HREF, whatsappHref } from '../lib/contactNumbers';
import type { MarketSectionType } from '../data/moduleCategories';

const MODULE_LINKS: Array<{ section: MarketSectionType; label: string }> = [
  { section: 'pg_hostels', label: "PGs & Hostels" },
  { section: 'classes', label: 'Classes' },
  { section: 'venues', label: 'Function Halls' },
  { section: 'services', label: 'Home Services' },
  { section: 'hotel_stay', label: 'Stays' },
  { section: 'movies', label: 'Movies' },
];

/**
 * Marketplace footer.
 *
 * Layout follows the approved reference (brand block, two link columns, contact
 * block, dark surface) but carries only BookOurSpace's own brand, pages and
 * contact details — no third-party links, store badges or borrowed copy.
 */
export function BOSMarketplaceFooter({
  onOpenSection,
  onPostFree,
  onProviderHub,
  onVoiceJoin,
  isAdmin = false,
  onAdminConsole,
  pendingAdminListings = 0,
}: {
  onOpenSection: (section: MarketSectionType) => void;
  onPostFree: () => void;
  onProviderHub: () => void;
  onVoiceJoin: () => void;
  isAdmin?: boolean;
  onAdminConsole?: () => void;
  pendingAdminListings?: number;
}) {
  const year = new Date().getFullYear();
  const linkClass =
    'text-left text-[13px] font-medium text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';

  return (
    <footer
      data-testid="bos-marketplace-footer"
      className="mt-10 border-t border-white/10 bg-[#1a1f36] pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-300"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 pt-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-10 lg:px-8">
        <div>
          <div className="inline-flex rounded-2xl bg-white px-3 py-2">
            <img
              src="/assets/brand/bos-logo-lockup.webp"
              srcSet="/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp 560w, /assets/brand/bos-logo-lockup-1120-bea9629c0067.webp 1120w"
              sizes="(max-width: 640px) 60vw, 260px"
              alt="BookOurSpace — Find, Book, Enjoy"
              width={1560}
              height={320}
              loading="lazy"
              decoding="async"
              className="h-8 w-auto sm:h-9"
            />
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-6 text-slate-400">
            One account for PGs, classes, function halls, home services, stays and movies. Verified listings,
            transparent prices and owner contact only through the authorised flow.
          </p>
          <p className="mt-4 flex items-center gap-2 text-[12px] font-semibold text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Owner-verified listings. No brokerage claims.
          </p>
          <p className="mt-4 text-[11px] text-slate-500">© {year} BookOurSpace. All rights reserved.</p>
        </div>

        <nav aria-label="Explore BookOurSpace">
          <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Explore</h2>
          <ul className="mt-4 space-y-2.5">
            {MODULE_LINKS.map((item) => (
              <li key={item.section}>
                <button type="button" onClick={() => onOpenSection(item.section)} className={linkClass}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="BookOurSpace for owners and partners">
          <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Company</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <button type="button" onClick={onPostFree} className={linkClass}>
                Post a free listing
              </button>
            </li>
            <li>
              <button type="button" onClick={onProviderHub} className={linkClass}>
                Provider Hub
              </button>
            </li>
            <li>
              <button type="button" onClick={onVoiceJoin} className={linkClass}>
                Voice registration
              </button>
            </li>
            {isAdmin && onAdminConsole && (
              <li>
                <button type="button" onClick={onAdminConsole} className={linkClass}>
                  Admin console{pendingAdminListings > 0 ? ` (${pendingAdminListings})` : ''}
                </button>
              </li>
            )}
          </ul>
        </nav>

        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Contact</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a href={BOS_CALL_HREF} className={`inline-flex items-center gap-2 ${linkClass}`}>
                <Phone className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
                +91 {BOS_CONTACT_PHONE}
              </a>
            </li>
            <li>
              <a
                href={whatsappHref('Hi BookOurSpace, I need help with a booking.')}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 ${linkClass}`}
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                WhatsApp us
              </a>
            </li>
            <li className="flex items-start gap-2 text-[13px] text-slate-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
              Hyderabad, Telangana
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-8 w-full max-w-7xl border-t border-white/10 px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-[11px] leading-5 text-slate-500">
          BookOurSpace connects customers with listing owners. Listing details, prices and availability are published by
          the owner and confirmed before booking. Owner contact numbers are shared only after you sign in and verify
          your email.
        </p>
      </div>
    </footer>
  );
}
