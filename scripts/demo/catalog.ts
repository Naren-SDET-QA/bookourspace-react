import type { MarketplaceListing } from '../../src/types/marketplace';

export const demoCustomerId = 'd3a00000-0000-4000-8000-000000000100';
export const demoCities = [
  { city: 'Hyderabad', state: 'Telangana', area: 'Madhapur', lat: 17.4483, lng: 78.3915 },
  { city: 'Bengaluru', state: 'Karnataka', area: 'Indiranagar', lat: 12.9719, lng: 77.6412 },
  { city: 'Chennai', state: 'Tamil Nadu', area: 'Adyar', lat: 13.0067, lng: 80.2573 },
];
const providerNames = ['Clear Nest Care', 'City Repair Collective', 'Everyday Wellness Studio', 'Woodcraft Learning Circle', 'Gather Together Care'];
const services = [
  ['cat-1', 'Deep cleaning', 'Home deep clean', 1800], ['cat-1', 'Kitchen cleaning', 'Kitchen refresh', 900], ['cat-1', 'Sofa cleaning', 'Upholstery care', 750],
  ['cat-4', 'AC', 'AC inspection', 499], ['cat-2', 'Plumbing', 'Tap and pipe repair', 350], ['cat-3', 'Electrical', 'Electrical safety visit', 450],
  ['cat-6', 'Salon at Home', 'Hair care appointment', 600], ['cat-6', 'Beauty', 'Skin care consultation', 800], ['cat-6', 'Grooming', 'Grooming session', 550],
  ['cat-5', 'Furniture repair', 'Desk repair workshop', 850], ['cat-5', 'Carpentry', 'Shelf installation', 650], ['cat-5', 'Wood work', 'Furniture care visit', 500],
  ['cat-1', 'Event cleaning', 'Pre-event venue cleaning', 2200], ['cat-1', 'Office cleaning', 'Office refresh', 2400], ['cat-1', 'Move-in cleaning', 'Move-in home care', 2800],
] as const;

export function buildDemoCatalog(anchor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || new Date(`${anchor}T00:00:00Z`).toISOString().slice(0, 10) !== anchor) {
    throw new Error('Demo date must be a valid YYYY-MM-DD date.');
  }
  const day = (offset: number) => new Date(Date.parse(`${anchor}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const providers = providerNames.map((name, index) => ({
    id: `d3a00000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name, email: `provider${index + 1}@bookourspace.invalid`, location: demoCities[index % 3],
  }));
  function listing(index: number, title: string, categoryId: string, subcategory: string, sectionType: string, price: number, providerIndex: number, cityIndex: number, fields: MarketplaceListing['customFieldValues'] = {}): MarketplaceListing {
    const provider = providers[providerIndex];
    const location = demoCities[cityIndex];
    const asset = sectionType === 'hotel_stay' || sectionType === 'pg_hostels' ? 'stay' : sectionType === 'venues' ? 'venue' : 'service';
    return {
      id: `demo-${sectionType}-${String(index).padStart(2, '0')}`, title,
      description: `${title} in ${location.area}, ${location.city}. Original local demonstration listing from ${provider.name}. Request availability before making plans. No real business or payment is represented.`,
      categoryId, subcategory, entityType: sectionType === 'venues' ? 'rental' : sectionType === 'hotel_stay' || sectionType === 'pg_hostels' ? 'property' : 'service',
      price, priceUnit: sectionType === 'hotel_stay' ? '/night' : sectionType === 'pg_hostels' ? '/month' : sectionType === 'venues' ? '/day' : '/visit', currency: '₹',
      priceBreakdown: { baseRent: price, maintenance: 0, serviceFee: 0, taxes: 0 },
      location: { ...location }, images: [`/assets/demo/${asset}.svg`],
      providerId: provider.id, providerName: provider.name, providerPhone: '', providerEmail: provider.email,
      providerAvatar: '/assets/demo/service.svg', providerRating: 0, reviewCount: 0, isVerified: false, isFeatured: false,
      status: 'active', customFieldValues: { sectionType, estimatedDuration: '60 minutes', ...fields },
      postingPlanId: 'plan-basic', viewsCount: 0, enquiriesCount: 0,
      createdAt: `${anchor}T00:00:00Z`, expiresAt: `${day(365)}T23:59:59Z`, reported: false,
    };
  }
  const listings = services.map(([category, subcategory, title, price], index) => listing(index + 1, title, category, subcategory, 'services', price, Math.floor(index / 3), Math.floor(index / 3) % 3));
  [
    ['City Comfort Residency', 'hotel-budget', 'Hotels'],
    ['Green Valley Home Stay', 'hotel-homestay', 'Home stays'],
    ['Urban Nest Apartment', 'hotel-service-apt', 'Furnished apartments'],
    ['Lake View Villa', 'hotel-resorts', 'Villas'],
  ].forEach(([title, category, subcategory], index) => listings.push(listing(index + 1, title, category, subcategory, 'hotel_stay', 1800 + index * 600, index, index % 3, {
    guestCapacity: 2 + index * 2, bedrooms: index + 1, bathrooms: index + 1,
    dailyPrice: 1800 + index * 600, checkInTime: '14:00', checkOutTime: '12:00',
    availableFrom: day(1), availableTo: day(365), totalRooms: 2, amenities: 'Wi-Fi, Kitchen, Parking',
  })));
  ['Grand Celebration Hall', 'Urban Convention Space', 'Pearl Banquet Hall', 'Riverside Events Venue'].forEach((title, index) => listings.push(listing(index + 1, title, 'venue-marriage', 'Banquet halls', 'venues', 15000 + index * 2500, index, index % 3, { capacity: 80 + index * 40, amenities: 'Parking, Projector, Accessible entrance', availableFrom: day(1), availableTo: day(365) })));
  ['Language Conversation Circle', 'Music Foundations Studio', 'Everyday Fitness Class'].forEach((title, index) => listings.push(listing(index + 1, title, ['class-languages', 'class-music', 'class-fitness'][index], ['Spoken English', 'Music', 'Yoga'][index], 'classes', 900 + index * 150, 3, index, { classMode: 'offline', classTimings: 'Evening', freeTrialAvailable: 'No' })));
  ['Maple Shared Living', 'Cedar Student House', 'Harbour Co-living'].forEach((title, index) => listings.push(listing(index + 1, title, 'pg-coliving', 'Co-living', 'pg_hostels', 7000 + index * 500, index, index, { roomTypesAvailable: 'Twin sharing', foodIncluded: 'No', genderPolicy: 'Co-living' })));
  const movies = ['Metro Dreams', 'Final Signal', 'Midnight Express', 'Beyond the Horizon'].map((title, index) => ({ id: `demo-movie-${index + 1}`, title, language: ['Telugu', 'English', 'Hindi', 'Telugu'][index], poster_url: '' }));
  const theatres = ['BookOurSpace Cinema', 'Central Square Cinema', 'Metro Garden Cinema', 'City Lights Cinema'].map((name, index) => ({ id: `demo-theatre-${index + 1}`, name, ...demoCities[[0, 0, 1, 2][index]] }));
  const showtimes = theatres.flatMap((theatre, index) => [9, 13, 17, 21].map((hour, slot) => ({
    id: `demo-show-${index + 1}-${slot + 1}`, theatre_id: theatre.id, movie_id: movies[index].id,
    starts_at: `${day(1)}T${String(hour).padStart(2, '0')}:00:00+05:30`, screen_name: 'Screen 1', format: '2D',
  })));
  return {
    cities: demoCities, providers, customer: { id: demoCustomerId, name: 'Local Demo Customer', email: 'customer@bookourspace.invalid' },
    movies, theatres, showtimes, listings,
    favorites: [listings[0].id, 'demo-hotel_stay-01', 'demo-venues-01'],
    notifications: ['Explore your city', 'Save a place for later', 'Request provider availability'].map((title, index) => ({ id: `demo-notification-${index + 1}`, title, message: 'Local catalog example. No message was sent.', link_id: listings[index].id })),
  };
}

export type DemoCatalog = ReturnType<typeof buildDemoCatalog>;
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
export function renderDemoSeed(catalog: DemoCatalog): string {
  const rows: string[] = ["BEGIN;", "DO $$ BEGIN IF current_setting('bookourspace.local_demo',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the guarded local demo seed command'; END IF; END $$;"];
  for (const user of [...catalog.providers, catalog.customer]) {
    // Deliberately no password, OAuth identity or real sign-in credentials.
    rows.push(`INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role) VALUES (${quote(user.id)}::uuid,${quote(user.email)},${quote(JSON.stringify({ full_name: user.name }))}::jsonb,'authenticated','authenticated') ON CONFLICT(id) DO NOTHING;`);
    const provider = catalog.providers.find(p => p.id === user.id);
    rows.push(`INSERT INTO public.profiles(id,email,full_name,role,city) VALUES (${quote(user.id)}::uuid,${quote(user.email)},${quote(user.name)},${quote(provider ? 'provider' : 'customer')},${quote(provider?.location.city || 'Hyderabad')}) ON CONFLICT(id) DO NOTHING;`);
    // Auth trigger initially creates a customer. Change only the local fixture's role.
    rows.push(`UPDATE public.profiles SET role=${quote(provider ? 'provider' : 'customer')},city=${quote(provider?.location.city || 'Hyderabad')} WHERE id=${quote(user.id)}::uuid AND email=${quote(user.email)};`);
  }
  for (const item of catalog.listings) {
    const { id, title, categoryId, subcategory, entityType, price, priceUnit, status, ...payload } = item;
    rows.push(`INSERT INTO public.listings(id,owner_id,title,category_id,subcategory,entity_type,price,price_unit,status,payload) VALUES (${quote(id)},${quote(item.providerId)}::uuid,${quote(title)},${quote(categoryId)},${quote(subcategory)},${quote(entityType)},${price},${quote(priceUnit)},${quote(status)},${quote(JSON.stringify(payload))}::jsonb) ON CONFLICT(id) DO NOTHING;`);
  }
  for (const theatre of catalog.theatres) rows.push(`INSERT INTO public.movie_theatres(id,name,state,city,area,is_visible) VALUES (${[theatre.id, theatre.name, theatre.state, theatre.city, theatre.area].map(quote).join(',')},true) ON CONFLICT(id) DO NOTHING;`);
  for (const movie of catalog.movies) rows.push(`INSERT INTO public.movie_titles(id,title,language,is_visible) VALUES (${[movie.id, movie.title, movie.language].map(quote).join(',')},true) ON CONFLICT(id) DO NOTHING;`);
  for (const show of catalog.showtimes) rows.push(`INSERT INTO public.movie_showtimes(id,theatre_id,movie_id,starts_at,screen_name,format,is_visible) VALUES (${[show.id, show.theatre_id, show.movie_id, show.starts_at, show.screen_name, show.format].map(quote).join(',')},true) ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at;`);
  for (const id of catalog.favorites) rows.push(`INSERT INTO public.user_favorites(user_id,listing_id) VALUES (${quote(catalog.customer.id)}::uuid,${quote(id)}) ON CONFLICT DO NOTHING;`);
  for (const notification of catalog.notifications) rows.push(`INSERT INTO public.notifications(id,recipient_user_id,target_role,title,message,link_id,notif_type) VALUES (${quote(notification.id)},${quote(catalog.customer.id)}::uuid,'customer',${quote(notification.title)},${quote(notification.message)},${quote(notification.link_id)},'booking') ON CONFLICT(id) DO NOTHING;`);
  rows.push('COMMIT;');
  return `${rows.join('\n')}\n`;
}
