# BookOurSpace image-loading fix — 2026-11-11

## Scope

Local React checkout and the Google AI Studio preview path for the six marketplace
modules (PG, Classes, Venues, Services, Stays, Movies), plus Admin/Provider media,
avatars and banners. No push, merge, deploy, production DB change, Storage policy
change, or secret exposure was performed. No new media assets were added and no
marketplace DB rows were created; only existing data and the original mock
illustrations are used.

## Confirmed root cause

1. **Two media surfaces bypassed `SafeImage`.** `VenueAgendaView` rendered the
   raw `photo` value in `<img src>` and the stay host avatar in
   `StayDetail`/`StayHostProfileModal` rendered `hostAvatarUrl` directly. A raw
   `<img>` cannot interpret the app's canonical `storage://bos-public-media/...`
   reference, and it cannot request the short-lived signed URL that the private
   `bos-public-media` bucket requires. Those images therefore fail before
   `SafeImage` can sign or fall back.
2. **Storage references were not canonicalised before signing.**
   `parseStorageObjectReference` decoded `%2F`, `%3F` and `%23` inside a path
   segment and then re-split the decoded path when building the signed request.
   That changes the object key (`owner/a%2Fb` becomes two segments) and can make
   an otherwise valid object unreadable. Bucket casing and invalid references
   were also handled inconsistently. The resolver now decodes once, rejects
   decoded separators/query/fragment characters, normalises the bucket name and
   returns one canonical `storage://<bucket>/<encoded-path>` form.
3. **Stay host writes persisted signed URLs.** The documents endpoint accepted
   any string starting with `storage://bos-public-media/`, including a signed
   `.../object/sign/...?token=...` URL. Stored signed URLs expire, so the photo
   goes blank after the token TTL and a signed grant is written into the
   database. `persistableStayImages` now uses
   `isPersistableListingImageSource`, which keeps original HTTPS photos and
   canonical public-bucket references only.
4. **The AI Studio build/preview was fenced off from real data.** `vite.config.ts`
   injected `VITE_ENABLE_DEMO_DATA=true` and `VITE_AI_STUDIO_DEMO=true` for
   `/app/applet`, so the preview exercised fixtures rather than the real API
   and signed Storage path. In addition, `server.ts` ran the production
   persistence/repository/APP_URL/HMAC gates before honouring the AI Studio
   preview flag, so a production-mode preview without PostgreSQL could not
   boot at all. The build no longer injects demo values, and the server now
   skips the production-only gates only for an explicitly fenced AI Studio
   preview (`K_SERVICE` still forces all gates for Cloud Run). The Playwright
   harness now has an explicit `BOS_E2E_AI_STUDIO=1` mode that starts the
   preview without demo data and exercises real signing.
5. **Provider and header avatars were hard-coded.** The Provider hero and
   visiting-card generator used a fixed Unsplash portrait instead of the
   signed-in `supabaseProfile.avatar_url`; the shared `Header` ignored its
   `userAvatar` prop and always rendered the local placeholder. Both now use
   the account avatar (signed through `SafeImage`) with a bundled brand avatar
   as the empty-state fallback.
No new media files were added. The one explicitly-labelled demo card in each
module keeps its existing `/assets/fallbacks/*.svg` mock illustration, and all
listing photos come from existing database rows or existing Unsplash URLs.
Only existing repository assets are used.

`SafeImage` already implemented the correct private-media model: it only signs
`bos-public-media` listing media and `bos-private-profile-media` profile media,
never exposes `bos-private-documents`, caches signed URLs in memory only, and
falls back once without retrying a failed URL in a loop. The fix routes every
image surface through that component and makes stored references safe to
re-sign on every load.

## Changed files

### Production code

- `src/lib/media/signedStorageUrl.ts` — canonical reference parsing/validation.
- `src/components/VenueAgendaView.tsx` — venue agenda photos now use `SafeImage`.
- `src/components/stay/StayDetail.tsx` — host avatar now uses `SafeImage`.
- `src/components/stay/StayHostProfileModal.tsx` — host avatar now uses `SafeImage`.
- `src/App.tsx` — `prepareListingMedia` keeps every record, promotes the first
  real photo, and substitutes an existing catalogue photo for a dead fixture
  image at presentation time.
- `src/lib/media/signedStorageUrl.ts` — `isUsableListingImageSource` /
  `firstUsableListingImage` and the shared fixture-host policy.
- `src/components/SafeImage.tsx` — re-exports the shared fixture-host policy.
- `src/components/demoBooking/demoBookableData.ts` — PG demo card uses an
  existing Unsplash URL; no new media file.
- `src/server/stayHostApi.ts` — `persistableStayImages` rejects signed/expired and
  non-canonical references before persistence.
- `src/components/ProviderDashboard.tsx` — real provider avatar instead of a
  hard-coded portrait, in both the hero and poster generator.
- `src/components/Header.tsx` — renders the supplied `userAvatar`.
- `server.ts` — AI Studio preview boot no longer runs production DB/repository/
  APP_URL/HMAC gates; Cloud Run still fails closed, and configured DB variables
  are never cleared.

### Build / preview harness

- `vite.config.ts` — no build-time demo injection for `/app/applet`.
- `playwright.config.ts` — `BOS_E2E_AI_STUDIO=1` preview harness mode.
- `e2e/safe-image-rendering.spec.ts` — module-wide visible-image checks, real
  demo-photo decode checks, Storage signing and real signed-photo decode checks.

### Regression tests

- `tests/media-renderer-coverage.test.mjs` — enforces `SafeImage` coverage for
  venue agenda, stay host avatars, Admin ads/media, Provider media, account
  avatars and banners; verifies the demo cards keep the existing mock
  illustrations and that no `public/assets/demo` directory was added.
- `tests/stay-image-persistence.test.mjs` — signed/non-canonical stay media is
  not persisted.
- `tests/signed-storage-url.test.mjs` — encoded `%2F`, `%3F`, `%23` and bucket
  casing cases.
- `tests/preview-isolation.test.mjs` — no demo injection, no DB-variable
  clearing, AI Studio preview boot, and Cloud Run fail-closed.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Typecheck / lint | `npm run lint` | PASS (`tsc --noEmit`) |
| Unit / contract tests | `npm test` | 378 tests: 360 pass, 18 skipped, 0 fail |
| Production build | `npm run build` | PASS (only the pre-existing >500 kB chunk warning) |
| Browser E2E (images, local) | `npx playwright test e2e/safe-image-rendering.spec.ts --project=chromium` | 4 passed, 1 skipped |
| Browser E2E (images, AI Studio mode) | `BOS_E2E_AI_STUDIO=1 npx playwright test e2e/safe-image-rendering.spec.ts --project=chromium` | 3 passed, 2 skipped |
| Browser E2E (shell smoke) | `npx playwright test e2e/app.smoke.spec.ts --project=chromium` | 26 passed |
| Typecheck of E2E specs | `npx tsc --noEmit` | PASS |
| AI Studio production boot | `NODE_ENV=production AI_STUDIO=true BOS_AI_STUDIO_PREVIEW=1` (no DB) | PASS, server listens and serves the built app |
| Cloud Run fail-closed | `K_SERVICE=... AI_STUDIO=true` (no DB) | PASS, exits non-zero with `AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION` |

Verification screenshot: `screenshots/local-3000-stays-fixed.png` (old mock
illustration on the demo card, existing stay photos on the listings).

Real-image evidence from a Chromium audit of the running app:

- Existing Unsplash photos decoded at 360–460 px in PG, Classes, Venues and
  Stays; existing database stay photos rendered without new files.
- The six demo cards keep their existing `/assets/fallbacks/*.svg` mock
  illustrations (267 px natural width); no `/assets/demo/*.webp` request was
  made.
- The Provider portal decoded 74 images, including the signed-in profile avatar
  at 128 px and real stay photos at 460 px.
- The AI Studio-mode E2E test served an existing repository JPEG through a
  mocked signed Storage response and asserted `naturalWidth > 0` with
  `data-image-source-status="authorized-media"`.

## No database growth

The image fix is read-only with respect to marketplace inventory. It adds no
listings, media rows, users, bookings or Storage objects.

- Local database size: **90 MB** (pre-existing).
- Inserts with `created_at` after this work started (`2026-11-10 23:50`):
  **0** in `listings`, `bookings`, `media_assets` and `stay_properties`.
- No schema, RLS, bucket, or data migration was run.
- The only new files are source/tests/report/screenshot text and image
  artifacts; the new `public/assets/demo` directory was removed, and the demo
  data was restored to the original fallback illustrations.

## Why a few PG cards showed dummy images

The PG feed included disposable database fixtures such as `mock-image-*`,
`live-pg-*` and `pg-it-*`. Their only images were `storage://bos-public-media/mock/...`
objects or `images.example.com` URLs, neither of which can load. `SafeImage`
correctly rendered the local fallback, so those cards appeared as dummy images.

Fix (code-only, no DB write, no new media files, **no listing removed**):

- `prepareListingMedia` in `src/App.tsx` keeps every listing. It never filters a
  record out of the feed.
- When a listing has a mix of mock and real photos, the first real photo is
  promoted to the front.
- A dead fixture image is replaced at presentation time with an existing
  catalogue photo for that module (existing Unsplash URLs already used by the
  catalogue). The stored listing payload in PostgreSQL is unchanged.
- The PG demo card now uses an existing Unsplash photo URL already present in
  the catalogue; the other demo cards keep their old mock illustrations.

Verified on the PG page:

- **11 PG images across all cards, 11 real Unsplash images loaded, 0 fallback
  images.** The `Mock Image wrongtype` and `Concurrent left` records are still
  present; they now show an existing catalogue photo instead of the dummy SVG.
- No `/assets/demo/*` files and no new DB rows were created.
- Because the fixture records have no real stored photo, the substitute is a
  module-appropriate catalogue photo, not the original fixture object. Exact
  fixture photos require re-uploading the missing objects, which would modify
  Storage/DB and was explicitly out of scope.

## The “Stays could not be loaded” screenshot

The screenshot at `localhost:3000/#pg/style1` was served by a **different
checkout**: `/Users/aa/Projects/bookourspace-final` on `main`, started without a
`BOS_LISTINGS_DATABASE_URL`. Its Stay page therefore returned 0 stays and showed
the frontend-only preview notice. It was not running this workspace's fixed
server.

This fixed checkout is verified on `http://localhost:3010` with the local
development database already configured in `.env.local`:

- `GET /api/stays/search` returns `source: "postgresql"`, `total: 39`.
- `http://localhost:3010/#stays` renders 24 places, **26 images loaded, 0
  fallbacks, 0 failed image requests**.
- `http://localhost:3010/#pg` renders **10 PG cards with 10 real Unsplash
  images and 0 fallbacks**.
- Verification screenshots: `screenshots/local-3000-stays-fixed.png` (Stay) and
  `screenshots/local-3010-pg-restored.png` (PG, capture below).

Port 3000 is currently serving the other checkout again
(`/Users/aa/Projects/bookourspace-final`), which has its own `.env.local`
pointing at `127.0.0.1:55442`. To use port 3000 with this fix, stop that process
and run `npm run dev` from `/Users/aa/Downloads/bookourspace-react`; `.env.local`
there points at the populated `127.0.0.1:55440` database.

## Failed requests and backend blockers

The code now issues a signing request only for canonical public/profile
references, and hides the result behind the local fallback when the object is
missing. The following requests still fail because of **data/backend state**, not
the renderer:

1. The configured hosted project reports no Storage buckets:
   `GET https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/public/bos-public-media/...`
   returns HTTP 400 `NoSuchBucket` (same for `bos-private-documents`), and the
   anon bucket list is empty. The media migrations/provisioning are therefore
   not applied to this project.
2. Anonymous `GET /rest/v1/media_assets` returns HTTP 401
   `42501 permission denied for table media_assets`; the pending media grants
   mean responsive-variant lookup is unavailable even if the bucket existed.
3. The local PostgreSQL cluster (`.local/stays-db`) contains E2E fixtures with
   object paths that were never uploaded. Representative failing paths:
   `mock/ok/mock-{stay,class,venue,service}-image.png`,
   `mock/{missing,wrongtype,slow,expired,forbidden,variants}/cover.png`,
   `11111111-2222-4333-8444-555555555555/services/provider_listing/asset1/original-abc.jpg`.
   Every signing call for these returns HTTP 400 `NoSuchKey`; `SafeImage`
   correctly renders the module fallback once and does not retry.
4. Actual photos on a correctly provisioned bucket could not be verified from
   this workstation: `SUPABASE_SECRET_KEY` is not present, and applying
   the pending migrations/bucket policies would violate the task's
   "no production DB/Storage policy changes" constraint.

## Remaining blockers

- **Hosted Storage provisioning:** apply the pending media/Storage migrations to
  `obkfgxjzlscungkhbyvq` in a separately approved change, then upload/verify a
  ready `bos-public-media` object and confirm signed URL + RLS behavior.
- **AI Studio snapshot:** the AI Studio app must be rebuilt/re-imported from this
  branch. This workspace cannot refresh or deploy the AI Studio snapshot, and
  the preview must not be pointed at a stale artifact.
- **Local fixture data:** clean/seed the disposable local PostgreSQL cluster if
  the local UI should show real listing photos instead of the documented E2E
  mock fallbacks.
- **Admin-console browser journey:** no admin credential is available in this
  environment, so Admin image surfaces were verified by source coverage and by
  the existing Admin unit/contract tests rather than a signed-in browser run.
  The Provider portal was verified with the local demo host session.

## Preservation / safety notes

- The workspace already contained extensive uncommitted integration work when
  this task started. It was not discarded or overwritten.
- A safety checkpoint was created before editing:
  `git stash` entry `checkpoint before image-loading fix`, plus a full
  `rsync` backup under `.local/pre-fix-backup/`.
- No files were deleted. `git status` reports no `D` entries.
- No `.env*` file, production bucket, RLS policy, database row, or hosted
  project was modified. Secrets were never printed.
- The checkout remains on `final-dev` (the branch that was already checked out);
  no branch switch, commit, merge, push, or deploy was performed.
