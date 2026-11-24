# Gate L3 — Canonical GPG Round-Trip Verification

**Date:** 2026-11-24 · **Run:** 11:52:53Z → 11:52:54Z (UTC)
**Authorization:** owner authorised execution of the existing local GPG verification script **for D6 only**.
**Verdict: D6 PASS — decryption VERIFIED.**

Read for this gate: `SUPABASE_RECOVERY_GATE_L2_SECURITY_CLOSURE.md`.

---

## 1. What was executed

Exactly the authorised command, unmodified, from the authorised repository:

```bash
cd /Users/aa/Downloads/bookourspace-react

BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh

echo "exit=$?"
```

| Property | Value |
| --- | --- |
| Script | `supabase/tests/owner_gpg_test.sh` (tracked, **0 diff** — unmodified) |
| Helper | `supabase/tests/lib/bos_backup_crypto.sh` (tracked, **0 diff**) |
| Keyring supplied | `/Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106` |
| Recipient supplied | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` |
| Network | **none** — the script is offline-only; it invokes `gpg` and `shasum` only |
| Database contact | **none** — no Supabase connection, no SQL, no dump |
| Passphrase handling | read from the macOS Keychain inside the helper; **never printed, never requested, never seen by this agent** |

---

## 2. Raw evidence (safe subset — PASS lines, exit status, timestamps)

```
START_UTC=2026-11-24T11:52:53Z
KEYRING=/Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106
RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A
--- script output ---
=== owner key encryption/decryption ===
encrypted with key E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A (private key stays in /Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106)
encrypted archive decrypts cleanly
decrypt round-trip reproduces the recorded plaintext checksum
PASS: owner key encrypted, decrypted and reproduced the test checksum.
PASS: no credential, key material or private-key path was printed.
--- end ---
exit=0
END_UTC=2026-11-24T11:52:54Z
```

Elapsed: **≈1 s**. No error, warning or BLOCKED line was emitted. No passphrase, private-key material,
key material or test payload appears in the transcript above.

---

## 3. Verification requirements — all six met

| # | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Canonical GPG keyring used | script echoed `private key stays in /Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106`; `BOS_BACKUP_GNUPGHOME` was set explicitly, so `bos_crypto_keyring()` could not fall back to the legacy default | **PASS** |
| 2 | Expected fingerprint matched | `encrypted with key E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`; independently re-listed from the keyring after the run — identical | **PASS** |
| 3 | Encryption succeeded | `encrypted with key …` — the helper's `bos_crypto_encrypt` returns non-zero on any failure, and it printed its success line | **PASS** |
| 4 | Decryption succeeded | `encrypted archive decrypts cleanly` (that line only prints after `bos_crypto_decrypt_to` succeeds) | **PASS** |
| 5 | Decrypted payload matched the original | `decrypt round-trip reproduces the recorded plaintext checksum` — `bos_crypto_roundtrip` compares `shasum -a 256` of the decrypted file against the pre-encryption digest and exits 5 on mismatch | **PASS** |
| 6 | Exit code 0 | `exit=0` | **PASS** |

**Why this evidence is genuine**, given Gate L2 §3.2's warning that the script self-cleans: the helper
prints the checksum-comparison line **only after** the SHA-256 equality test passes, and `bos_crypto_die`
exits **5** on any decryption or mismatch failure. A failure could not have produced this output with
`exit=0`. The evidence is therefore the *transcript*, not the absence of files — exactly the standard set
in Gate L2.

---

## 4. Containment after the run

| Check | Result |
| --- | --- |
| Temp directories/files in `/tmp` (`bos-owner-gpg.*`, `bos-decrypt.*`, `bos-verify.*`) | **0** — self-cleaned by the script's `trap … EXIT` and the helper's `rm -f` |
| Keyring permissions | `drwx------` — unchanged |
| Keyring fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` — unchanged |
| New keys / changed key material | **none** — only the directory mtime advanced (gpg rewrites its own state/seed files during a sign/decrypt cycle); the key set is identical |
| Scripts modified | **0 diff** on both test script and helper |
| New archives / dumps / `.gpg` in backup destination | **0** |
| Backup destination entries | **17** — unchanged |

**Note on the keyring mtime:** `~/.config/bookourspace/backup-gnupg-recovery-20261106` shows a modification
time of `2026-11-24T17:22:54Z` local (`11:52:53Z` UTC) — i.e. the run itself. That is normal GPG
housekeeping, not a key change: the fingerprint is identical and no key was created, imported, deleted or
expired. Recorded here so a later audit does not mistake the timestamp for tampering.

---

## 5. Scope of what is now proven — and what is not

**Proven:** the canonical recovery key on this machine can encrypt to itself and decrypt back, and the
decrypted bytes reproduce the original SHA-256. Key custody works: the private key is present, the
passphrase is retrievable from the authorised Keychain item, and the whole cycle completes without
exposing either.

**Not proven by D6:**

| Item | Status |
| --- | --- |
| That the **existing** archives (`…20261110T041600Z` etc.) individually decrypt | **untested** — same recipient, so highly likely, but never exercised per-archive |
| That a **schema dump** survives encrypt → decrypt → restore | untested — no dump exists yet (A1 not approved) |
| That a restore reproduces a working database | untested — A2 not approved |
| That the off-machine copy is readable | untested — no off-machine copy exists |

D6 removes the "can we even read our own backup?" risk for the key itself. It does not substitute for
A1/A2, and it does not make the stale archive set fresh (newest is 342 h old at last measure, 14 days
now).

---

## 6. Standing state — unchanged by this gate

| Item | Status |
| --- | --- |
| Password rotation | **DEFERRED BY OWNER** |
| Credential exposure incident | **OPEN** — D6 does not touch it |
| A1 schema dump | **NOT APPROVED** |
| A1b storage bucket capture | **NOT APPROVED** |
| A3 seven pending migrations | **NOT APPROVED** |
| A5 PostGIS installation | **NOT APPROVED** |
| Production provisioning | **NO-GO** |
| React | `feat/universal-gps-tracking` @ `96c1297` — 1 modified, 0 staged, 11 untracked (pipeline reports) |
| Flutter | `main` @ `fc35976` — clean |
| D7 | **3 dev refs, 0 diff — unweakened** |
| Disk | **9,258 MiB free** (2 GiB floor met) |

---

## 7. Verdict

**D6 — PASS. Decryption is VERIFIED, for the first time in this programme (Gates I, L, L1, L2 all
carried it as UNVERIFIED).**

The canonical key encrypts, decrypts and reproduces its checksum with exit 0, using the canonical keyring
and the exact expected fingerprint, with no credential, passphrase or key material exposed and no residue
left behind. The recovery mechanism is real.

Two things must not be confused with that result:

1. **The credential incident is still OPEN.** A working GPG key says nothing about a leaked database
   password; rotation remains deferred at the owner's direction.
2. **A readable key is not a readable backup.** The existing archives have never been decrypted
   individually, and there is no schema dump for them to contain — the 14 legacy tables remain
   undumped, so a restore today could not even begin.

**Next unresolved milestone is unchanged and now purely authorisation-bound:** A1, gated on the still-open
credential incident, not on cryptography.

**A1 · A1b · A3 · A5 NOT APPROVED · Production NO-GO · Rotation DEFERRED · Incident OPEN.**
