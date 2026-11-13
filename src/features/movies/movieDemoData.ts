import type { MovieAdminRow, PublicShowtime } from './moviesApi';

const demoTheatres = [
  { id: 'demo-theatre-hyd-1', name: 'BookOurSpace Cinema', state: 'Telangana', city: 'Hyderabad', area: 'Gachibowli' },
  { id: 'demo-theatre-hyd-2', name: 'Heritage Screen House', state: 'Telangana', city: 'Hyderabad', area: 'Madhapur' },
  { id: 'demo-theatre-blr-1', name: 'Metro Garden Cinema', state: 'Karnataka', city: 'Bengaluru', area: 'Indiranagar' },
  { id: 'demo-theatre-chn-1', name: 'Marina Demo Screens', state: 'Tamil Nadu', city: 'Chennai', area: 'Adyar' },
] as const;

const demoMovies = [
  { id: 'demo-movie-1', title: 'Metro Dreams', language: 'Telugu' },
  { id: 'demo-movie-2', title: 'Final Signal', language: 'English' },
  { id: 'demo-movie-3', title: 'Midnight Express', language: 'Hindi' },
  { id: 'demo-movie-4', title: 'Beyond the Horizon', language: 'Telugu' },
] as const;

const demoHours = ['10:30:00+05:30', '14:15:00+05:30', '19:45:00+05:30'];

export const demoMovieShowtimes: PublicShowtime[] = demoTheatres.flatMap((theatre, theatreIndex) =>
  demoHours.map((time, slot) => {
    const movie = demoMovies[theatreIndex];
    return {
      showtime_id: `demo-show-${theatreIndex + 1}-${slot + 1}`,
      theatre_id: theatre.id,
      theatre_name: theatre.name,
      state: theatre.state,
      city: theatre.city,
      area: theatre.area,
      movie_id: movie.id,
      title: movie.title,
      language: movie.language,
      poster_url: '/assets/demo/movie.svg',
      starts_at: `2026-11-03T${time}`,
      screen_name: 'Demo Screen 1',
      format: slot === 2 ? 'IMAX demo' : '2D demo',
    };
  })
);

export const demoTheatreAdminRows: MovieAdminRow[] = demoTheatres.map((theatre, index) => ({
  id: theatre.id,
  name: theatre.name,
  state: theatre.state,
  city: theatre.city,
  is_visible: index !== 2,
  version: 0,
  parent_visible: true,
  total_count: demoTheatres.length,
}));

export function filterDemoMovieShowtimes(filters: { query: string; state: string; city: string; language?: string }) {
  const query = filters.query.trim().toLocaleLowerCase('en-IN');
  return demoMovieShowtimes.filter(row =>
    (!query || `${row.title} ${row.theatre_name} ${row.area} ${row.city}`.toLocaleLowerCase('en-IN').includes(query)) &&
    (!filters.state || row.state === filters.state) &&
    (!filters.language || row.language.toLocaleLowerCase('en-IN') === filters.language.trim().toLocaleLowerCase('en-IN')) &&
    (!filters.city || row.city.toLocaleLowerCase('en-IN').includes(filters.city.trim().toLocaleLowerCase('en-IN')))
  );
}
