/**
 * BookOurSpace Movies — display-only listings data.
 *
 * Theatre owners "post a card": each card is a cinema + movie + showtimes.
 * Cards are owner-editable and persisted in localStorage by the screen, so the
 * bundled list below is only the seeded default. No payment or seat booking is
 * offered in this version — cinema name and timings are shown for discovery.
 */

export interface MovieShow {
  id: string;
  title: string;
  poster: string;
  languages: string[];
  formats: string[];
  rating: number;
  cinema: string;
  area: string;
  city: string;
  showtimes: string[];
  genre: string;
  duration: string;
  certificate: string;
}

export const MOVIE_CITY = 'Bengaluru';

export const MOVIE_CITIES = ['Bengaluru', 'Hyderabad', 'Mumbai', 'Delhi'] as const;
export type MovieCity = (typeof MOVIE_CITIES)[number];

export const MOVIE_AREAS: Record<string, string[]> = {
  Bengaluru: ['All areas', 'Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Jayanagar', 'Rajajinagar'],
  Hyderabad: ['All areas', 'Madhapur', 'Gachibowli', 'Banjara Hills', 'Ameerpet', 'Secunderabad'],
  Mumbai: ['All areas', 'Andheri', 'Bandra', 'Lower Parel', 'Powai', 'Colaba'],
  Delhi: ['All areas', 'Saket', 'Connaught Place', 'Dwarka', 'Rohini', 'Vasant Kunj'],
};

export const MOVIE_LANGUAGES = ['All Movies', 'Hindi', 'Telugu', 'Tamil', 'Kannada'] as const;
export type MovieLanguage = (typeof MOVIE_LANGUAGES)[number];

const poster = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=320&h=480&q=80`;

export const MOVIES_APP_DATA: MovieShow[] = [
  {
    id: 'pushpa-2',
    title: 'Pushpa 2',
    poster: poster('photo-1489599849927-2ee91cede3ba'),
    languages: ['Telugu'],
    formats: ['2D'],
    rating: 8.4,
    cinema: 'PVR Orion Mall',
    area: 'Rajajinagar',
    city: 'Bengaluru',
    showtimes: ['10:00 AM', '01:15 PM', '04:30 PM', '07:45 PM', '11:00 PM'],
    genre: 'Action',
    duration: '3h 20m',
    certificate: 'UA',
  },
  {
    id: 'kalki-2898-ad',
    title: 'Kalki 2898 AD',
    poster: poster('photo-1517604931442-7e0c8ed2963c'),
    languages: ['Hindi'],
    formats: ['IMAX'],
    rating: 8.1,
    cinema: 'INOX Garuda Mall',
    area: 'Magrath Road',
    city: 'Bengaluru',
    showtimes: ['11:00 AM', '02:30 PM', '06:00 PM', '09:30 PM'],
    genre: 'Sci-Fi',
    duration: '3h 1m',
    certificate: 'UA',
  },
  {
    id: 'devara',
    title: 'Devara',
    poster: poster('photo-1536440136628-849c177e76a1'),
    languages: ['Telugu'],
    formats: ['2D'],
    rating: 8.3,
    cinema: 'PVR Forum Mall',
    area: 'Koramangala',
    city: 'Bengaluru',
    showtimes: ['11:30 AM', '03:00 PM', '06:30 PM', '10:15 PM'],
    genre: 'Action',
    duration: '2h 56m',
    certificate: 'UA',
  },
  {
    id: 'singham-again',
    title: 'Singham Again',
    poster: poster('photo-1440404653325-ab127d49abc1'),
    languages: ['Hindi'],
    formats: ['2D', 'IMAX'],
    rating: 7.9,
    cinema: 'Cinepolis Royal Meenakshi',
    area: 'HSR Layout',
    city: 'Bengaluru',
    showtimes: ['09:45 AM', '01:00 PM', '04:15 PM', '07:30 PM', '10:45 PM'],
    genre: 'Action',
    duration: '2h 24m',
    certificate: 'UA',
  },
  {
    id: 'amaran',
    title: 'Amaran',
    poster: poster('photo-1478720568477-152d9b164e26'),
    languages: ['Tamil'],
    formats: ['2D'],
    rating: 8.2,
    cinema: 'PVR Phoenix Marketcity',
    area: 'Whitefield',
    city: 'Bengaluru',
    showtimes: ['10:15 AM', '01:30 PM', '04:45 PM', '08:00 PM'],
    genre: 'Biography',
    duration: '2h 49m',
    certificate: 'U',
  },
  {
    id: 'kantara-chapter-1',
    title: 'Kantara Chapter 1',
    poster: poster('photo-1594909122845-11baa439b7bf'),
    languages: ['Kannada'],
    formats: ['2D'],
    rating: 8.6,
    cinema: 'INOX Lido Mall',
    area: 'Indiranagar',
    city: 'Bengaluru',
    showtimes: ['09:30 AM', '12:45 PM', '04:00 PM', '07:15 PM', '10:30 PM'],
    genre: 'Action',
    duration: '2h 45m',
    certificate: 'UA',
  },
  {
    id: 'stree-2',
    title: 'Stree 2',
    poster: poster('photo-1626814026160-2237a95fc5a0'),
    languages: ['Hindi'],
    formats: ['2D'],
    rating: 8.0,
    cinema: 'PVR Vega City',
    area: 'Jayanagar',
    city: 'Bengaluru',
    showtimes: ['11:15 AM', '02:00 PM', '05:15 PM', '08:30 PM'],
    genre: 'Horror Comedy',
    duration: '2h 29m',
    certificate: 'UA',
  },
  {
    id: 'vettaiyan',
    title: 'Vettaiyan',
    poster: poster('photo-1574267432553-4b4628081c31'),
    languages: ['Tamil'],
    formats: ['2D', 'IMAX'],
    rating: 7.8,
    cinema: 'PVR Orion Mall',
    area: 'Rajajinagar',
    city: 'Bengaluru',
    showtimes: ['10:45 AM', '02:15 PM', '05:45 PM', '09:00 PM'],
    genre: 'Action',
    duration: '2h 46m',
    certificate: 'UA',
  },
  {
    id: 'hanu-man',
    title: 'Hanu-Man',
    poster: poster('photo-1485846234645-a62644f84728'),
    languages: ['Telugu'],
    formats: ['2D'],
    rating: 8.5,
    cinema: 'AMB Cinemas',
    area: 'Gachibowli',
    city: 'Hyderabad',
    showtimes: ['09:00 AM', '12:15 PM', '03:30 PM', '06:45 PM', '10:00 PM'],
    genre: 'Fantasy',
    duration: '2h 38m',
    certificate: 'UA',
  },
  {
    id: 'jawan',
    title: 'Jawan',
    poster: poster('photo-1533929736458-ca588d08c8be'),
    languages: ['Hindi'],
    formats: ['2D', 'IMAX'],
    rating: 8.2,
    cinema: 'PVR Icon Andheri',
    area: 'Andheri',
    city: 'Mumbai',
    showtimes: ['10:30 AM', '01:45 PM', '05:00 PM', '08:15 PM'],
    genre: 'Action',
    duration: '2h 49m',
    certificate: 'UA',
  },
];

/** Five-day chip row starting "today". */
export interface DateChip {
  id: string;
  label: string;
  date: string;
  iso: string;
}

export function buildDateChips(now = new Date()): DateChip[] {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Array.from({ length: 5 }, (_, offset) => {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const day = String(d.getDate()).padStart(2, '0');
    return {
      id: `d-${offset}`,
      label: offset === 0 ? 'Today' : weekday[d.getDay()],
      date: `${day} ${month[d.getMonth()]}`,
      iso: d.toISOString().slice(0, 10),
    };
  });
}
