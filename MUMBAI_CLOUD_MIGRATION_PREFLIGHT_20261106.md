# BookOurSpace Mumbai cloud migration preflight

Date: 2026-11-06  
Target: `obkfgxjzlscungkhbyvq` (ap-south-1)  
Mode: **`--plan` and read-only SQL only**

No `--apply`, hosted writes, Auth creation, real payments, push, merge, or deployment.

**Stop here. Apply and deploy need separate explicit approval.**

---

## Verdict

**PLAN READY / APPLY BLOCKED pending owner decisions.**  
Installer `--plan` matches the local chain. Live Mumbai ledger confirms **exactly eight** unapplied versions. Identity, RLS, hashes, and order check out. Encrypted backup is now **encrypt-ready**. Production Stays still cannot go live until these eight files are applied, a public HTTPS API is deployed, Razorpay/UPI/Google/native origin are configured, and cloud E2E is run on that host.

Local tests remain non-cloud.

---

## 1. Installer `--plan` (no connection, no write)

```
target project : obkfgxjzlscungkhbyvq (verified local Supabase CLI link)
baseline       : supabase/schema_and_rls.sql (first-install only)
migration files: 60 (manifest order; history entries after full apply: 61)
history table  : supabase_migrations.schema_migrations
profile backfill: supabase/backfill_existing_google_profiles.sql (separate gate)
pre-change backup: encrypted .gpg; Auth users + identities
rollback       : restore a pre-change backup; forward corrective migrations only
```

CLI link `supabase/.temp/project-ref` = `obkfgxjzlscungkhbyvq`.  
Pooler host `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.obkfgxjzlscungkhbyvq`.  
Rejected refs `sfoizxarbljhldmkgsma` and `ezrxykyocgbolpaebnqx` were not used.

`node supabase/tests/migration_manifest.mjs` **PASS** (baseline + 60, unique versions, SHA-256 match).

Note: `MIGRATION_MANIFEST.json` `review.migrationCount` is still **59**. The installer uses `migrations.length` (**60**). Cosmetic drift only.

---

## 2. Live ledger (read-only)

Connected as `postgres` on database `postgres`, PostgreSQL **17.11**, session pooler, `sslmode=require`, `default_transaction_read_only=on`. Password never printed.

| Check | Result |
|---|---|
| History rows | **53** = baseline `00000000000000` + **52** files through `20261105140000` |
| Hosted file versions (excl. baseline) | **52** |
| Local files | **60** |
| Missing on Mumbai | **8** (exact list below) |
| Extra / renamed on Mumbai | **none** |
| Public tables / RLS | **68 / 68 enabled / 0 disabled** |
| RLS event trigger | `ensure_rls` → `rls_auto_enable`, enabled (`O`) |
| `is_admin` EXECUTE | anon **false**, authenticated **true**, public grant **false** |
| `rls_auto_enable` EXECUTE | anon **false**, authenticated **false** |
| Auth users | **2** (was 1 on 2026-11-05) |
| Google Auth users | **1** |
| Identity providers | google **1**, email **1** |
| Profiles | **2**; Super Admin **1**; role=admin **1** |
| Stay properties / rooms / units / bookings | **0 / 0 / 0 / 0** |
| Listings | **0** |
| `media_assets` | **1** ready/public, unreferenced |
| Storage objects | **2**, **148,357** bytes |
| `payment_intents.qr_image_url` | **absent** (comes from `20261106010000`) |
| `create_stay_checkout` | **10-arg only** (13-arg is in pending file 8) |
| `create_stay_request` / `settle_stay_provider_event` / `stay_price_quote` | **absent** |
| Exclusion constraints | `stay_allocations_no_overlap`, `stay_blocks_no_overlap`, two venue GiST constraints |
| `pg_locks` waiting | **0** |

`compare_migration_history.sh` reported **MIGRATION HISTORY MISMATCH** as expected (8 missing). That is the apply candidate list, not a hash conflict.

---

## 3. Eight pending files — hashes, order, tx, grants, locks, media

All eight have matching SHA-256 in file / `MIGRATION_MANIFEST.json` / `migrations.sha256`, explicit `begin;`/`commit;`, and installer-owned apply is **not** required.

| # | Version | SHA-256 (prefix) | Bytes | Ready? | Notes |
|---|---|---|---:|---|---|
| 1 | `20261105150000_server_media_byte_validation` | `6b1cced1…` | 3120 | **YES** | `finalize_media_asset*` EXECUTE **service_role only**. No object rewrite. |
| 2 | `20261105160000_media_published_listing_visibility` | `7642844c…` | 7951 | **REVIEW** | New `media_asset_publications` + audit, **RLS on**, anon column grant narrowed. Public listing reads require an **active listing image reference**, provider avatar projection, or Super Admin publication. **Test asset `1739b44f-…` (`parent_id=bos-media-test-20261105`, module `services`) will drop out of public listing discovery.** Bytes stay. Storage SELECT policy replaced. |
| 3 | `20261105163924_profile_media_and_account_closure` | `a4aa10b3…` | 10771 | **YES** | Private profile media policies; `close_account_server` **service_role only**; `account_closure_audit` RLS, no anon/authenticated DML. |
| 4 | `20261105170000_stay_discovery_filters` | `4693e093…` | 35364 | **YES** | Filters, calendar, checkout rewrite. Recreates `stay_blocks_no_overlap` GiST (`ACCESS EXCLUSIVE` on `stay_blocks`). Table is empty. |
| 5 | `20261105180000_stay_host_inventory_controls` | `9c683af7…` | 15070 | **YES** | Host blocks RLS; media reorder policy; `stay_availability` grant to anon+authenticated+service_role. |
| 6 | `20261105210000_stay_requests_fees_profiles` | `f22c3b17…` | 21698 | **YES** | Request-to-book, fees, `create_stay_request` authenticated+service_role; settle/sweep **service_role**. |
| 7 | `20261105220000_restore_pg_hostel_property_type` | `3d476396…` | 2107 | **YES** | Conditional CHECK repair for `pg_hostel`. Drops/rebuilds constraint **only if** current CHECK is incomplete; otherwise no exclusive rebuild. |
| 8 | `20261106010000_stay_razorpay_and_verified_upi` | `e6b05b1a…` | 25871 | **YES** | Adds `qr_image_url`; 13-arg checkout; Razorpay/UPI settle **service_role**. Production UPI is Razorpay QR. |

**Lock risk:** empty stay/listing tables. Short exclusive locks on `stay_blocks` (file 4) and possibly `stay_properties` (file 7). No concurrent guest traffic.

**Grants pattern:** money RPCs stay off `anon`. Discovery RPCs stay on `anon`+`authenticated`. New tables enable RLS before grants.

---

## 4. Rollback / restore readiness

| Item | Status |
|---|---|
| Owner GPG keyring `~/.config/bookourspace/backup-gnupg` | **PASS** (`drwx------`) |
| Recipient | `CC5AE8D856FE65C7349E9EE94F2EF422CFD44129` (expires 2028-11-03) |
| Encrypt test | **PASS** |
| Decrypt round-trip | **SKIPPED** (non-interactive; pinentry needed on your terminal) |
| Keychain `bos-production-backup` | **PRESENT** |
| `BOS_BACKUP_GPG_RECIPIENT` | **SET** in local env |
| Pre-change dump from 2026-11-05 apply | **NONE** (backup was skipped; accepted recovery risk) |
| Supabase Pro daily backups | Assume 7-day PITR **only if** this project is on Pro; not verified in dashboard this session |
| Installer rollback model | Restore encrypted `pg_dump` custom archive; **no down migrations** for these eight files (`supabase/rollback/` has only `20261104_hardening_down.sql`) |

**Recommendation:** do **not** skip backup this time. Set `BOS_MUMBAI_BACKUP_PATH` to a new `*.gpg` **outside** the repo (example: `~/BookOurSpace_Backups/react/mumbai-pre-8pending-20261106.dump.gpg`). Run interactive `bash supabase/tests/gpg_readiness.sh` once so decryption is proven before `--apply`.

---

## 5. Cloud HTTPS API deployment plan (not executed)

Production must be a public Node/Express process (`tsx server.ts` / `npm start`) with `NODE_ENV=production`. `npm run dev` on this Mac is not that process. Native apps cannot call loopback.

### Recommended shape

1. **Region:** Mumbai / `ap-south-1` (Fly `bom`, Render Singapore is farther; prefer BOM if the host offers it).
2. **Process:** one always-on HTTPS service, health `GET /api/auth/me` → 401 is fine.
3. **TLS:** terminate at the host; HSTS at the edge.
4. **Postgres:** session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.obkfgxjzlscungkhbyvq`, `sslmode=verify-full` (or `require`). Direct `db.<ref>.supabase.co` is IPv6-only on many networks.
5. **Secrets:** host secret manager only. Never `VITE_*` for DB URL, HMAC, Razorpay secret, service role.
6. **Raw body:** Express must keep raw bytes for `/api/stays/payments/razorpay/webhook`, `/api/pg/payments/razorpay/webhook`, and `/api/payments/razorpay/webhook`.
7. **CORS:** `APP_URL` plus exact `BOS_NATIVE_APP_ORIGINS` (`https://localhost`, `capacitor://localhost`).
8. **Static web:** Vite `dist` on the same origin **or** a CDN whose `/api` reverse-proxies the Node process. Native WebView needs `VITE_NATIVE_API_ORIGIN=https://<api-host>` baked at **build** time.

### Env the hosted API must have

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables TLS DB policy and refuses sandbox settlement |
| `APP_URL` | yes | Canonical HTTPS origin |
| `BOS_LISTINGS_DATABASE_URL` | yes | Mumbai pooler + TLS; **not** loopback |
| `BOS_SERVER_HMAC_SECRET` | yes | ≥32 chars; local `.env.local` is **not** production |
| `VITE_SUPABASE_URL` / publishable key | yes (web build) | Project `obkfgxjzlscungkhbyvq` |
| `RAZORPAY_KEY_ID` | yes for online pay | Test keys first |
| `RAZORPAY_KEY_SECRET` | yes | Server only |
| `RAZORPAY_WEBHOOK_SECRET` | yes | Production Stays Razorpay/UPI will not be offered without it |
| `BOS_PAYMENT_SANDBOX` | **unset / 0** | Must not be `1` in production |
| `VITE_NATIVE_API_ORIGIN` | yes for APK/IPA | Same HTTPS origin as the API |
| `BOS_NATIVE_APP_ORIGINS` | yes | Exact WebView origins |
| `BOS_UPI_MERCHANT_VPA` | optional | Sandbox-only VPA; production UPI uses Razorpay QR |

### Razorpay dashboard (after API hostname exists)

Active events: `payment.captured`, `payment.failed`, `refund.processed` (and QR paid if offered).

| URL | Use |
|---|---|
| `https://<api-host>/api/stays/payments/razorpay/webhook` | Hotels/Stays Checkout + UPI QR |
| `https://<api-host>/api/pg/payments/razorpay/webhook` | PG (if same Razorpay account) |
| `https://<api-host>/api/payments/razorpay/webhook` | Legacy marketplace handler |

Webhook secret must match `RAZORPAY_WEBHOOK_SECRET`. Alert email on 4xx/5xx. Do **not** reuse the sandbox HMAC `BOS_PAYMENT_SANDBOX_SECRET`.

Verified UPI: production creates Razorpay `upi_qr` (`/v1/payments/qr_codes`). Settlement is webhook or Checkout verify + payment fetch. Screenshot/UTR is never verified. Pay at property stays `pay_later` / `collected_offline`.

### Google OAuth (no Auth writes this session)

Supabase Google callback (already the contract):  
`https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback`

Add **after** the API hostname is known:

- `https://<app-origin>/auth/callback`
- native `com.bookourspace.app://auth/callback`

Keep Google Cloud redirect on the **Supabase** callback, not the app. Google-only Sign-In remains the product rule.

**Identity observation (read-only):** Auth now has **2** users (Google 1 + email 1). Previously one Google user. Confirm in the dashboard whether email/password was enabled. Do not create more users until you approve it.

### Native

1. Set `VITE_NATIVE_API_ORIGIN=https://<api-host>` in **both** repos.  
2. `npm run build && npx cap sync`  
3. Rebuild Android debug/release and iOS; store binaries are stale.  
4. Production origin must be HTTPS. HTTP is only for emulator loopback.

---

## 6. Cloud E2E checklist (run only on the hosted API)

Do not treat localhost Playwright as this list.

**Web**

- [ ] Google first login → customer profile on Mumbai  
- [ ] Google returning login, same UUID  
- [ ] Host creates stay + rooms + photos; Admin publishes  
- [ ] Search + OSM map show the live listing (no sample stays)  
- [ ] Calendar availability from PostgreSQL  
- [ ] Razorpay **test** Checkout → webhook `payment.captured` → `payment_intents.status=verified`  
- [ ] Separate UPI QR → Razorpay QR paid event → verified  
- [ ] Pay at property → unpaid until host `collect_payment`  
- [ ] Double-book same dates → 409 / exclusion  
- [ ] Cancel + Razorpay refund API + DB refund row  
- [ ] Check-in / check-out / one review  

**Android / iOS**

- [ ] App talks only to `VITE_NATIVE_API_ORIGIN`  
- [ ] Google returns via `com.bookourspace.app://auth/callback`  
- [ ] Same booking/payment IDs visible in My Trips as Web  

**Stop if:** webhook signature fails, UTR/screenshot path reports paid, JSON store is used, or the API is this Mac.

---

## 7. Hosting costs (list prices, USD, Oct–Nov 2026; GST extra in India)

| Item | Typical monthly | Notes |
|---|---|---|
| Supabase Pro (org) | **$25** | Includes $10 compute credit (one Micro). Daily backups 7 days. Confirm this project is Pro, not Free (Free has no backups and can pause). |
| Compute upgrade Small / Medium | +$5 / +$50 | Micro is 1 GB RAM / 60 direct connections. Raise if pooler waits appear. |
| PITR 7 days | **~$100** | Optional; recommended before first paid traffic. |
| Custom domain on Supabase | **$10** | Optional; Auth can stay on `*.supabase.co`. |
| HTTPS API (Fly shared-cpu-1x 1 GB) | **~$7** | Prefer BOM. Render web **~$7**. Railway Hobby **$5** + usage. Always-on; free tiers sleep. |
| Razorpay | **₹0** sandbox; live MDR on captures | Standard India card/UPI MDR; refunds may reverse MDR. |
| Google OAuth | **$0** | |
| Apple Developer / Play Console | annual, if store ships | Separate from cloud API. |
| **Working minimum** | **~$32–40/mo** | Pro Micro + small always-on Node. |
| **Safer production** | **~$140–160/mo** | Pro + PITR + Small compute + Node. |

Storage 148 KB and empty stay tables do not move the needle. File storage 100 GB is inside Pro.

---

## 8. Exact blockers and required credentials

| Blocker | Status |
|---|---|
| Owner **`--apply` approval** (`BOS_MUMBAI_APPLY_APPROVED` + `BOS_MUMBAI_CONFIRM_REF` = `obkfgxjzlscungkhbyvq`) | **UNSET** — stop |
| Backup path + encrypt (`BOS_MUMBAI_BACKUP_PATH` new `*.gpg`) **or** explicit skip (`BOS_MUMBAI_SKIP_BACKUP_APPROVED=<ref>`) | Need decision. Skip leaves **no** restore point again. |
| Profile backfill approve **or** skip (`BOS_MUMBAI_PROFILE_BACKFILL_APPROVED` / `SKIP` = ref) | Need decision. Two Auth users already exist. |
| Media `20261105160000` public-visibility change for test asset | Need **REVIEW** acknowledgement |
| Interactive GPG decrypt proof | Not done in this session |
| Hosted HTTPS API hostname | **none** |
| `BOS_LISTINGS_DATABASE_URL` on that host | **unset** (local listings URL unset; Mumbai URL is installer-only) |
| Production `BOS_SERVER_HMAC_SECRET` | Local secret must **not** be reused blindly; mint a host secret |
| Razorpay key id / key secret / webhook secret | **UNSET** in local env |
| `VITE_NATIVE_API_ORIGIN` | **UNSET** |
| `APP_URL` production | **UNSET** |
| Stay listings to search | **0** on Mumbai (publish after apply; that is a later hosted write) |
| Android APK / iOS IPA | **stale** until rebuild |
| Cloud Google / Razorpay / UPI E2E | **BLOCKED** |

---

## 9. Approval steps (copy/paste when you want apply)

Do these in order. I will not run them until you say so.

1. **Ack media:** “Apply `20261105160000`; unreferenced test asset may leave public discovery; do not delete Storage bytes.”  
2. **Backup:** “Take encrypted pre-change dump” **or** “Skip backup for `obkfgxjzlscungkhbyvq` and accept no restore point.”  
3. **Backfill:** “Skip Google profile backfill” **or** “Run backfill.”  
4. **Apply eight:**  
   `BOS_MUMBAI_APPLY_APPROVED=obkfgxjzlscungkhbyvq`  
   `BOS_MUMBAI_CONFIRM_REF=obkfgxjzlscungkhbyvq`  
   plus the backup and backfill variables from 2–3.  
   Command: `bash supabase/install_mumbai_migrations.sh --apply`  
   **Not** `supabase db push`.  
5. Separate approval: deploy HTTPS API + set secrets.  
6. Separate approval: Razorpay dashboard webhooks on that host (test mode).  
7. Separate approval: add OAuth redirect URLs; **no** extra Auth users unless you ask.  
8. Separate approval: publish stay listings / media.  
9. Separate approval: set `VITE_NATIVE_API_ORIGIN`, rebuild Android/iOS, run cloud E2E.

---

## 10. What was not done

- `--apply`
- `pg_dump` / restore
- Auth user create or OAuth setting change
- Razorpay live or test money
- Push, merge, deploy
- Stay listing seed
- Native rebuild
