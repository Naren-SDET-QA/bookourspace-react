# Supabase Pro cost-limit audit — 2026-11-11

**Scope:** BookOurSpace dynamic services + universal GPS tracking on branch `feat/universal-gps-tracking`.
**No paid service, hosted database, push or deployment was used.** This audit compares the repository’s
actual tracking/booking constants and schema against the published Supabase Pro quotas.

## Published Pro quotas used

Source: [Supabase pricing](https://supabase.com/pricing) (official pricing page, fetched 2026-11-11).

| Quota | Pro included | Overage |
|---|---:|---:|
| Plan | $25/month | — |
| Database disk | 8 GB per project | $0.125/GB |
| Egress | 250 GB | $0.09/GB |
| Cached egress | 250 GB | $0.03/GB |
| File storage | 100 GB | $0.0213/GB |
| Realtime concurrent peak connections | 500 | $10 per 1,000 |
| Realtime messages/month | 5,000,000 | $2.50/million |
| Realtime max message size | 3 MB | — |
| Edge Function invocations | 2,000,000 | $2/million |
| Auth MAU | 100,000 | $0.00325/MAU |

Pro spend caps are on by default. The repository uses no paid third-party API: the map is
OpenStreetMap/Leaflet, not Google Maps, and documents use Supabase Storage.

## Repository measurements

| Input | Value / source |
|---|---|
| GPS publisher interval | `TRACKING_UPDATE_INTERVAL_MS = 12_000` (`src/lib/deliveryTracking.ts`), with a 10-second client throttle |
| GPS freshness window | 45 seconds (`TRACKING_STALE_AFTER_MS`) |
| Server GPS rate guard | one accepted row per booking per 5 seconds (`service_tracking_rate_guard`) |
| Realtime subscribers | 1 customer + 1 provider channel per open tracking panel |
| GPS row size | ~120–200 bytes before index; payload has no images |
| Tracking tables in publication | `service_tracking_locations`, `service_tracking_events`, `service_delivery_profiles`, plus category config/version tables |
| Edge Functions | none used by this feature |
| Paid APIs | none |

## Estimates

Assumption: one active delivery publishes for 30 minutes at the 12-second cadence
(150 points), and both parties have the tracking panel open.

| Active deliveries (30 min/day) | GPS rows/month (30 days) | Realtime messages/month (2 per row) | Peak connections (2/job) |
|---:|---:|---:|---:|
| 25 | 112,500 | 225,000 | 50 |
| 100 | 450,000 | 900,000 | 200 |
| 250 | 1,125,000 | 2,250,000 | **500 (Pro limit)** |
| 500 | 2,250,000 | 4,500,000 | **1,000 (over Pro)** |

**Result:** the Realtime **connection** quota binds before the message quota. At two
subscribers per active delivery, Pro supports ~250 simultaneous tracked deliveries;
500 simultaneous tracked deliveries would need a higher connection quota even though
message volume remains under 5 million/month.

Database/storage estimate:

- 1,125,000 GPS rows/month × ~200 bytes ≈ **225 MB/month** plus indexes.
- 8 GB Pro disk therefore supports roughly **3 years** of that tracking volume
  before other data, at the 250-concurrent-delivery rate.
- 100 GB file storage supports ~20,000 prescription/ID documents at ~5 MB each.
- Egress is dominated by listing/media delivery (Smart CDN/cached egress), not GPS;
  map tiles are requested from OpenStreetMap, not Supabase.

## Adaptive polling fallback (2026-11-11 audit)

The fixed 5-second fallback was replaced with `nextTrackingPollDelay`:

| State | Poll delay |
|---|---:|
| Terminal or tracking disabled | **none** |
| Offline | 30 s |
| Tab hidden | 30 s |
| Supabase Realtime configured | 60 s safety read only |
| Waiting for first GPS point | 4 s |
| Stale GPS point | 5 s |
| Live, fresh GPS point | 8 s |

The fallback reads the app server API, not Supabase Realtime, so it does not consume
the 5M Realtime message quota. Polling stops entirely once tracking is inactive, and
the Realtime channel is dropped at the same point. At ~250 simultaneous tracked
deliveries this removes the duplicate fixed interval and eliminates background polling
after completion.

## Mitigations already in the repository

1. **Server rate guard** rejects more than one GPS row per booking per 5 seconds
   (`TRACKING_UPDATE_TOO_FREQUENT`, HTTP 429), so a misbehaving client cannot spam
   Realtime or storage.
2. **Client publisher throttles to 10 seconds** and the canonical interval is 12 seconds;
   no high-frequency socket traffic.
3. **Tracking panels subscribe only while open**; closing the panel removes the channel.
4. **Payloads are tiny** (coordinates + accuracy + timestamp), far below the 3 MB message cap.
5. **No image/document bytes in Realtime**; documents use private Storage references.
6. **Pro spend caps stay enabled by default**; no automatic overage spend is introduced.
7. **Private booking-document upload is scoped to the authenticated user’s own path**;
   reads remain owner/Super-Admin only, and the bucket keeps its 25 MB per-file limit.
   A malicious direct uploader is still bounded by the 100 GB Pro storage quota; a
   future signed-upload endpoint can add a per-booking quota if abuse is observed.

## Verdict

**PASS for the intended Pro deployment envelope (up to ~250 concurrent tracked deliveries).**
The feature is within Pro’s 8 GB disk, 100 GB file storage, 5M Realtime messages and 3 MB
message limits at that concurrency. Going beyond 250 simultaneous tracked deliveries is
**BLOCKED by the Pro Realtime connection quota**, not by this code. A higher connection
quota/plan or a later consolidation to one channel per booking would be required.
