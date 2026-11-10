import { expect, test } from '@playwright/test';

/**
 * Movies browser coverage against the real React app, the real Express server
 * and a disposable PostgreSQL database created by
 * supabase/tests/run_classes_ui_e2e.sh.
 *
 * Movies V1 is discovery + showtimes only (docs/movies-showtimes-only.md):
 * booking, seat selection, payments, tickets and refunds are not product
 * capabilities, and the server hard-refuses the legacy seat/booking endpoints
 * with MOVIES_V1_DISPLAY_ONLY. This spec proves, in a browser:
 *   - the visible cinema screen row persisted in PostgreSQL is rendered
 *   - the stored showtimes are shown, and a hidden screen is not
 *   - no seat, ticket, payment or refund surface is rendered
 *   - /api/seats/*, /api/movies/bookings/* and /api/bookings/atomic refuse
 *     with MOVIES_V1_DISPLAY_ONLY instead of creating inventory
 *
 * Seat availability, hold, booking and cancellation are BLOCKED by that
 * product contract; exercising them would require inventing a movie booking.
 */

const BASE_URL = process.env.E2E_BASE_URL || '';
const SESSIONS = JSON.parse(process.env.E2E_MOVIES_SESSIONS || '{}');
const EXPECTED_MOVIE = process.env.E2E_MOVIES_TITLE || 'E2E Cinema Feature';

type Screen = {
  id: string;
  cinemaListingId: string;
  cinemaTitle: string;
  movieTitle: string | null;
  showDate: string | null;
  showtimes: string[];
  screenName: string;
};

if (!BASE_URL) {
  test.skip(true, 'E2E_BASE_URL is not configured for this run.');
}

test.describe('Movies discovery, showtimes and display-only contract', () => {
  test('renders the persisted visible screen and hides the invisible one', async ({ page, request }) => {
    const response = await request.get(`${BASE_URL}/api/movies/showtimes`);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);

    const screens = (payload.screens || []) as Screen[];
    expect(screens.length, 'a seeded cinema screen is required for this journey').toBeGreaterThan(0);
    const visible = screens.find((item) => item.movieTitle === EXPECTED_MOVIE);
    expect(visible, `the seeded "${EXPECTED_MOVIE}" screen must be publicly visible`).toBeTruthy();
    expect(visible!.showtimes.length).toBeGreaterThan(0);
    expect(visible!.showDate).toBeTruthy();
    expect(screens.some((item) => item.movieTitle === 'E2E Hidden Feature')).toBe(false);

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('bos_entry_choice_v1', 'signed-in');
        window.localStorage.setItem(
          'bos_privacy_consent_v1',
          JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }),
        );
        window.localStorage.setItem('bos_section_styles_v2', JSON.stringify({ movies: 'classic' }));
      } catch {
        /* storage unavailable */
      }
    });

    await page.goto(`${BASE_URL}/#movies`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Movies & showtimes/i })).toBeVisible({ timeout: 30_000 });

    // The classic grid lists the persisted movies; selecting one opens its
    // theatres and the stored timing chips.
    const movieCard = page.getByRole('button', { name: new RegExp(EXPECTED_MOVIE) }).first();
    await expect(movieCard, 'the persisted movie title is selectable in the grid').toBeVisible({ timeout: 20_000 });
    await movieCard.click();

    const theatres = page.getByRole('region', { name: 'Theatres and showtimes' });
    await expect(theatres).toBeVisible({ timeout: 20_000 });
    await expect(theatres).toContainText(visible!.cinemaTitle.slice(0, 24), { timeout: 20_000 });

    for (const showtime of visible!.showtimes) {
      await expect(theatres).toContainText(showtime, { timeout: 10_000 });
    }
    await expect(page.locator('body')).not.toContainText('E2E Hidden Feature');
    await expect(page.getByRole('button', { name: /book tickets|select seats|proceed to upi/i })).toHaveCount(0);
  });

  test('legacy seat and booking endpoints are hard-refused', async ({ request }) => {
    const token = SESSIONS?.customer?.token;
    if (!token) test.skip(true, 'E2E_MOVIES_SESSIONS.customer.token is not configured');

    const inventory = await request.get(`${BASE_URL}/api/movies/showtimes`);
    const screen = (((await inventory.json()).screens || []) as Screen[])[0];
    if (!screen) test.skip(true, 'no persisted cinema screen is available');

    const listingId = screen.cinemaListingId;
    const dateIso = screen.showDate || new Date().toISOString().slice(0, 10);
    const showtime = screen.showtimes[0];

    const calls = [
      request.get(
        `${BASE_URL}/api/seats/locks?listingId=${encodeURIComponent(listingId)}&dateIso=${dateIso}&showtime=${encodeURIComponent(showtime)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      request.post(`${BASE_URL}/api/seats/hold`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { listingId, dateIso, showtime, seats: ['A2'], sessionId: `e2e-movies-${Date.now()}` },
      }),
      request.post(`${BASE_URL}/api/movies/bookings/movie-a/cancel`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: 'e2e' },
      }),
      request.post(`${BASE_URL}/api/bookings/atomic`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          idempotencyKey: `e2e-movies-${Date.now()}`,
          listingId,
          scheduledDate: dateIso,
          timeSlot: showtime,
          showtime,
          seats: ['A2'],
          customerName: 'E2E Movie Customer',
          customerPhone: '9000000003',
        },
      }),
    ];

    for (const response of await Promise.all(calls)) {
      expect(response.status()).toBe(410);
      expect((await response.json()).error).toBe('MOVIES_V1_DISPLAY_ONLY');
    }
  });

  test('cancellation has no booking to act on', async () => {
    test.skip(
      true,
      'Movies V1 has no booking-creation path: /api/bookings/atomic refuses cinema listings with MOVIES_V1_DISPLAY_ONLY, so a cancellation assertion would need an invented booking record.',
    );
  });
});
