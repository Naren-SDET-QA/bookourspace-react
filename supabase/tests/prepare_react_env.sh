#!/usr/bin/env bash
# =============================================================================
# Normalise the active React environment files (structural edit only).
#
# Fixes exactly two defects and nothing else:
#   1. duplicate password assignments  -> keep the LAST one, drop the earlier
#      duplicates (an ambiguous assignment is how a stale credential survives).
#   2. a PostgreSQL URI stored in a *_PASSWORD variable -> the value is renamed
#      to BOS_DATABASE_URL. A password variable must hold only a password;
#      URIs belong in a URL variable.
#
# Guarantees:
#   * no value is ever printed, logged or copied into this document,
#   * the retained value is proven byte-identical (SHA-256 compared in memory),
#   * the original file is backed up outside the repository, mode 600,
#   * writes are atomic (temp file + rename) and preserve the file's mode,
#     tightened to 600 because the file still holds a connection URI,
#   * historical snapshots (.env.save, .env.local.*, .env.local.stockholm,
#     .env.example) are never read, modified or deleted,
#   * dry-run by default; --apply performs the edit.
#
# Usage:
#   bash supabase/tests/prepare_react_env.sh            # dry-run, prints plan
#   bash supabase/tests/prepare_react_env.sh --apply
#
# Exit: 0 done/no changes needed; 3 refused (ambiguous or conflicting state);
#       4 post-write verification failed.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

APPLY=0
FILES=()
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    -h|--help) sed -n '3,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Only the active React environment files. Snapshots are deliberately excluded.
for f in "$REPO_ROOT/.env" "$REPO_ROOT/.env.local"; do
  [ -f "$f" ] && FILES+=("$f")
done
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "nothing to do: neither .env nor .env.local exists."
  exit 0
fi

# Serialise writers: a concurrent agent rewriting the same env files is exactly
# what caused the earlier duplicate-block corruption. --apply takes the lock;
# a dry run only reads, so it never blocks anyone.
if [ "$APPLY" -eq 1 ]; then
  # shellcheck source=lib/bos_write_lock.sh
  . "$REPO_ROOT/supabase/tests/lib/bos_write_lock.sh"
  bos_lock_acquire env-write || exit 9
  # shellcheck disable=SC2064
  trap 'bos_lock_release env-write' EXIT
fi

python3 - "$APPLY" "${FILES[@]}" <<'PY'
import hashlib, os, re, stat, sys, time

apply = sys.argv[1] == "1"
paths = sys.argv[2:]
repo = os.getcwd()

URI_KEY = "BOS_DATABASE_URL"
PW_KEY = re.compile(r'^(?:[A-Za-z0-9]*_)?(?:PASSWORD|PASSWD|PASS|PWD|PW)$')
LINE = re.compile(r'^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$')
REF = re.compile(r'[a-z0-9]{20}')
URL_KEYS = ("MUMBAI_DIRECT_HOST", "MUMBAI_DB_HOST", "MUMBAI_DIRECT_USER", "MUMBAI_DB_USER")

approved = ""
try:
    with open(os.path.join(repo, "supabase", "backup", "react-target.conf"), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("BOS_APPROVED_REF="):
                approved = line.split("=", 1)[1].strip()
                break
except OSError:
    pass

backup_dir = os.path.join(os.path.expanduser("~"), "BookOurSpace_Backups", "env")
stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def die(message):
    print(message, file=sys.stderr)
    sys.exit(3)


def parse(text):
    lines = text.splitlines(keepends=True)
    parsed = []
    for line in lines:
        body = line[:-1] if line.endswith("\n") else line
        eol = "\n" if line.endswith("\n") else ""
        m = LINE.match(body)
        if not m:
            parsed.append(None)
            continue
        parsed.append((m.group(1), m.group(2), m.group(3), eol))
    return lines, parsed


exit_code = 0
for path in paths:
    name = os.path.relpath(path, repo)
    st_before = os.stat(path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    lines, parsed = parse(text)

    groups = {}
    for i, p in enumerate(parsed):
        if p and (PW_KEY.match(p[1]) or p[1] == "MUMBAI_DB_PASSWORD"):
            groups.setdefault(p[1], []).append(i)

    drop, rename, notes = set(), {}, []
    retained_sha = None

    for key, idxs in groups.items():
        keep = idxs[-1]
        if len(idxs) > 1:
            for i in idxs[:-1]:
                drop.add(i)
            notes.append("duplicate %s: %d assignments, kept the last, dropped %d"
                         % (key, len(idxs), len(idxs) - 1))
        raw = parsed[keep][2]
        value = unquote(raw)
        if "://" not in value:
            if retained_sha is None:
                retained_sha = hashlib.sha256(value.encode()).hexdigest()
            continue

        # A PostgreSQL URI is sitting in a password variable: move it to a URL key.
        uri_idx = next((i for i, p in enumerate(parsed) if p and p[1] == URI_KEY), None)
        if uri_idx is not None:
            if unquote(parsed[uri_idx][2]) != value:
                die("REFUSED: %s has a URI password and %s already holds a different "
                    "value; resolve the conflict by hand. Nothing was written." % (name, URI_KEY))
            drop.add(keep)
            notes.append("%s: value already present as %s, dropped the password-named copy"
                         % (key, URI_KEY))
        else:
            rename[keep] = URI_KEY
            notes.append("%s: value is a PostgreSQL URI, renamed to %s (a password "
                         "variable must never hold a URI)" % (key, URI_KEY))
        retained_sha = hashlib.sha256(value.encode()).hexdigest()

    # Contract check (report only): host/user keys naming a non-approved project.
    contract = []
    for p in parsed:
        if not p or p[1] not in URL_KEYS:
            continue
        for tok in sorted(set(REF.findall(unquote(p[2])))):
            if approved and tok != approved:
                contract.append("%s names project %s (approved %s)" % (p[1], tok, approved))

    print("%s: %s" % (name, "changes proposed" if (drop or rename) else "already normalised"))
    for note in notes:
        print("    " + note)
    for c in contract:
        print("    CONTRACT  %s" % c)
    if contract:
        print("    note: host/user keys are not rewritten by this script; the backup")
        print("          scripts refuse a mismatched host even if these values stay stale.")

    if not drop and not rename:
        continue

    out = []
    for i, line in enumerate(lines):
        if i in drop:
            continue
        p = parsed[i]
        if p and i in rename:
            out.append("%s%s=%s%s" % (p[0], rename[i], p[2], p[3]))
        else:
            out.append(line)
    new_text = "".join(out)

    # ---- post-conditions computed on the new text, before anything is written ----
    _, new_parsed = parse(new_text)
    uri_hits = [p for p in new_parsed if p and p[1] == URI_KEY]
    if len(uri_hits) != 1:
        die("REFUSED: %s would end up with %d %s assignments. Nothing was written."
            % (name, len(uri_hits), URI_KEY))
    if retained_sha is None or hashlib.sha256(unquote(uri_hits[0][2]).encode()).hexdigest() != retained_sha:
        die("REFUSED: the retained value would change. Nothing was written.")
    bad = [p[1] for p in new_parsed if p and PW_KEY.match(p[1]) and "://" in unquote(p[2])]
    if bad:
        die("REFUSED: %s would still hold a URI in a password variable. Nothing was written." % name)

    mode = stat.S_IMODE(os.stat(path).st_mode)
    new_mode = 0o600  # the file still carries a connection URI
    print("    mode %04o -> %04o; retained value verified byte-identical (sha-256 match)"
          % (mode, new_mode))

    if not apply:
        continue

    # Optimistic concurrency: refuse to overwrite a file another process changed
    # while this run was inspecting it.
    st_now = os.stat(path)
    if (st_now.st_size, st_now.st_mtime_ns) != (st_before.st_size, st_before.st_mtime_ns):
        die("REFUSED: %s changed while this run was inspecting it; nothing was written."
            % name)

    os.makedirs(backup_dir, mode=0o700, exist_ok=True)
    os.chmod(backup_dir, 0o700)
    backup = os.path.join(backup_dir, "%s.before-react-password-dedupe-%s.bak"
                          % (os.path.basename(path), stamp))
    with open(backup, "x", encoding="utf-8") as fh:
        fh.write(text)
        os.fchmod(fh.fileno(), 0o600)
    print("    backup: %s (mode 600, outside the repository)" % backup)

    tmp = path + ".prepare-react.tmp"
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, new_mode)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(new_text)
        os.chmod(tmp, new_mode)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        print("FAILED: could not write %s; the original file is unchanged." % name, file=sys.stderr)
        exit_code = 4
        continue

    with open(path, encoding="utf-8") as fh:
        written = fh.read()
    _, verify = parse(written)
    hits = [p for p in verify if p and p[1] == URI_KEY]
    ok = (len(hits) == 1 and unquote(hits[0][2]) == unquote(uri_hits[0][2])
          and not [p for p in verify if p and PW_KEY.match(p[1]) and "://" in unquote(p[2])])
    if not ok:
        print("FAILED: %s did not verify after writing; backup retained." % name, file=sys.stderr)
        exit_code = 4
        continue
    print("    written atomically and re-verified")

if not apply:
    print("DRY-RUN: no file was modified. Re-run with --apply to perform the edits.")
sys.exit(exit_code)
PY
