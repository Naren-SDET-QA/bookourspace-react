export interface MovieDisplayInput {
  title: string;
  theatreName: string;
  language: string;
}

export function getMovieDisplayCopy({ title, theatreName, language }: MovieDisplayInput) {
  return {
    title,
    theatre: theatreName,
    language,
    notice: 'Display-only movie information — this is not a booking platform. Booking and seat selection are not available here.',
    timingsLabel: 'Show timings',
  } as const;
}
