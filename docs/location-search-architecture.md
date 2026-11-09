# Location search architecture

## Data and request path

- `public.india_locations` is the single normalized catalog table. The client has no `indiaLocations.ts` or directory-data import in the location picker and receives no direct table/RPC grants.
- `search_india_locations` is invoker-safe, uses an empty pinned `search_path`, and is executable only by `service_role`. The Express server makes all catalog queries with a transaction-local service role and a 700 ms statement timeout.
- Catalog APIs return eight popular places, a small state list, on-demand districts, and at most 10 autocomplete or 20 paged browse rows. Server cache: 64 entries / 60 seconds. Browser memory cache: 64 entries / 120 seconds. No location dataset is downloaded as a bulk file.
- Coordinate lookups use a POST body and the GiST point index; coordinates are not logged or cached.
- Unmatched queries can explicitly use Google Places API (New), only from the server. External results use `no-store`, do not enter either cache, recent-search storage, or durable app storage, and display a separate 12 px Google Maps attribution. The backend requires both the server-only key and `BOS_GOOGLE_MAPS_TERMS_READY=true`, so the provider remains off until the owner publishes Terms/Privacy language that incorporates Google policies. Google requires its logo where practical; text attribution is reserved for this compact result list. There is no public Nominatim autocomplete integration.

## Current local catalog coverage

The current local seed is 94 curated places across 13 states, taken from the existing compact app catalog. The repository's Local Government Directory files cover only selected states; they are not a complete India-wide source and are not imported by location search. Those separate provider service-area JSON files are dynamically imported only within their provider form and are not downloaded by the shared location picker. Do not describe local database coverage as complete. Google Places fallback is required for uncommon or unseeded locations and remains unavailable until an owner configures `GOOGLE_MAPS_PLACES_API_KEY` on the server, enables Places API (New), sets billing/quotas and updates the app Privacy Policy/Terms for Google's terms and privacy link.

Never put the provider key in a `VITE_` variable or browser bundle. Keep attribution visible alongside external suggestions and selected location labels. Do not store external place content; only Google's place ID is permitted for durable storage under Google's policy, and this implementation does not store even that.

## Local validation

Run `bash supabase/tests/run_location_search_validation.sh` from this repository. It creates and removes a uniquely marked disposable PostgreSQL 17 cluster, applies the two local location migrations, checks RLS/grants/RPC security/search indexes, then tests the HTTP API and client cache. It does not contact Supabase or apply hosted SQL.

Latest local benchmark (PostgreSQL 17.11, local loopback, 94 rows):

- Catalog relation including indexes: 262,144 bytes.
- First popular + state payload: 2,760 bytes raw / 753 bytes gzip.
- Cached API search: p95 1.11 ms in the Web worktree and 1.16 ms in the Capacitor worktree, each over 60 requests (same-machine HTTP loopback).
- Browser UI journey: the shared-location Playwright tests pass 4/4 in each repository, including a 390×844 viewport with no horizontal overflow. This is browser viewport emulation, not a native-device CPU/network benchmark. Native-device performance has not been measured; simulator/device measurement remains required.

These numbers describe the local fixture, not Supabase hosted latency or production hardware. The 300 ms target is met only for the measured local cached API path; hosted and mobile-device latency still require verification.
