# FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS

**Architect:** design cycle 2026-08-26T01:17Z | **Zone:** cross-service/ (`launchd/`, `scripts/`, `docs/standards/cron-jobs.md` — no `apps/<service>/`) | **BUILD-STANDARD:** not-applicable (bug-fix/tooling, no new primitives)

**Row:** `docs/data/orch/orch-state.json` `.task_board.in_progress[]` id `FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS` (P0, po mint 2026-08-24T13:16:43Z, Design-Router Sweep dispatch_lane=architect). No BA spec / no `docs/handoffs/` file for this row — findings recorded here per architect flow §5's "direct PO mint, no handoff" convention; the row's `architect_review_note` field carries a pointer to this file.

## HARD CONSTRAINTS (binding on every implementer, verbatim from the row's AC-5 / dispatch)

Never re-arm `com.vn-market.fleet-push` by any mechanism — not the plist `Disabled` key (installed **or** repo copy), not `launchctl enable/load/bootstrap`. Not in this design, not in whatever implements it, absent an explicit later human decision to do so. Do not push (CI is red on origin/main; the user pushes personally). Do not conflate this with `com.vn-market.docker-events` (separate label, separate row, still acked). All verification of the `Disabled` state MUST use `plutil -p`/`plutil -extract` on the **installed** plist — never `grep`, which reads the key as false-absent on this binary-plist file (already hit live once, see AC-4).

## 1. Brownfield findings

**1.1 — The one-line diff, re-verified live this cycle (2026-08-26T01:1xZ):**
```
diff <(plutil -p launchd/com.vn-market.fleet-push.plist) <(plutil -p ~/Library/LaunchAgents/com.vn-market.fleet-push.plist)
> "Disabled" => 1
```
Every other key (`ProgramArguments`, `StartInterval=1800`, `RunAtLoad=1`, `KeepAlive=0`, `EnvironmentVariables`, both log paths, `WorkingDirectory`) is byte-identical between the tracked repo copy and the installed copy. Confirms PO's AC-2 finding is still accurate and unchanged since 2026-08-24.

**1.2 — Fleet plist-install census (new this cycle — not in the original triage).** `launchd/` tracks 5 plists; the installed copies split into two structurally different install patterns:

| Label | Install mechanism | Drift possible? |
|---|---|---|
| `com.vn-market.cowork-guaranteed-slot-firer` | **symlink** → repo file | No — tracked file *is* the live file |
| `com.vn-market.socat-bridge` | **symlink** → repo file | No |
| `com.vn-market.socat-tls-bridge` | **symlink** → repo file | No |
| `com.vn-market.fleet-push` | **independent copy** (`-rw-------`, last modified 2026-08-24, the disarm edit) | **Yes** — exactly this row |
| `com.vn-market.docker-events` | independent copy | Yes in principle, not disabled today |

Three of five labels already use a symlink install (`docs/incidents/2026-07-10-cowork-guaranteed-slot-install.md` confirms this was deliberate for the firer), which is durable by construction — editing the tracked file *is* editing the live file, no separate copy step exists to go stale. `fleet-push` is on the older, copy-based pattern, which is the entire reason this row exists.

**1.3 — No install script exists today.** Grepped `scripts/` for any installer/setup script touching `launchd/*.plist` — none found. The only documented procedure is `docs/standards/cron-jobs.md:359`: `launchctl load ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` — this **presumes the installed copy is already present**; it is a re-arm-after-restart instruction, not a fetch-from-repo instruction. The silent-rearm vector the row names ("any re-install from source") only fires when the installed copy is missing or being freshly re-created (disaster recovery, new host, or an ops agent "helpfully" restoring what it reads as a missing file) and whoever does that reaches for the obvious `cp launchd/com.vn-market.fleet-push.plist ~/Library/LaunchAgents/` — which is exactly the tracked repo copy, `Disabled` key absent.

**1.4 — This is a real, not hypothetical, risk on this fleet.** Standing memory records multiple full-environment-reconstruction events on this host (Docker VM rebuilds wiping named volumes, a hypervisor crash, host-suspension multi-day outages) — the kind of event that plausibly also loses unmanaged host state like `~/Library/LaunchAgents` copies and triggers a "restore everything from the repo" pass.

**1.5 — The disarm is a live host-level override, not a design change to the job's own intent.** `docs/policies/dev-standards.md` §"Push Policy — Autonomous Push Gate" (`CANONICAL: PUSH-AUTONOMY-1`, user directive 2026-07-14, still in force, unmodified) states plainly: *"Push is autonomous... requires NO user authorization when the gate is green."* Nothing in that policy, nor in the row's own evidence/po_note, nor in `docs/agent-memory/decisions/po-decisions.md`, reframes fleet-push as permanently retired — the row's own AC-5 language is "PUSH-AUTONOMY-1 is unsatisfied [today]", i.e. conditional on the current CI-red/224-commit-backlog situation, not a statement that the design itself changed. The tracked plist's current shape (`RunAtLoad=1`, no `Disabled` key = "armed by design") is therefore still the **correct expression of the job's intended default behavior** — the thing that needs to become durable is the *current host's temporary override*, not a rewrite of the design intent.

## 2. Decision

**Chosen: (b) — an install-time guard that refuses to silently overwrite a locally-disabled label.**

Concretely: a new script, `scripts/install-launchd-plist.sh <label>`, becomes the one sanctioned path for placing/refreshing any copy-based `launchd/*.plist` at `~/Library/LaunchAgents/`. Logic:

```bash
LABEL="$1"                                    # e.g. com.vn-market.fleet-push
SRC="launchd/${LABEL}.plist"
DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [ -f "$DST" ]; then
  # plutil -extract, never grep (AC-4 / HARD CONSTRAINT) — rc=0+"true" only when the
  # key is actually present; rc=1 (stderr "No value at that key path") when absent —
  # verified live against both fleet-push (present) and docker-events (absent) this cycle.
  if DISABLED_VAL="$(plutil -extract Disabled raw "$DST" 2>/dev/null)" && [ "$DISABLED_VAL" = "true" ]; then
    echo "REFUSE: ${LABEL} is locally disabled on the INSTALLED plist (Disabled=>1)." >&2
    echo "        Not overwriting — this would silently re-arm it. See docs/standards/cron-jobs.md" >&2
    echo "        § <job> for the documented, explicit re-arm procedure if that is truly intended." >&2
    exit 1
  fi
fi
cp "$SRC" "$DST" && chmod 600 "$DST"
echo "Installed ${LABEL} from ${SRC}. Run: launchctl load \"$DST\""
```

`docs/standards/cron-jobs.md`'s "Install / re-arm" line for `com.vn-market.fleet-push` (and the equivalent line for `com.vn-market.docker-events`, the only other copy-based label) is rewritten to route through this script instead of a bare `cp`/`launchctl load`, so the guard is the **documented, only** path — the same "wrapper is the only sanctioned write path" convention this repo already uses for `orch-apply.sh`.

This is a **tooling/documentation control, not an OS-level lock** — a human can still bypass it with a manual `cp`. That is an accepted, named cost (§4), consistent with how `orch-apply.sh` itself is enforced (discipline + the fact that it is the only path anyone actually follows), not a technical impossibility.

## 3. Justification against (a) and (c)

**vs (a) tracked `Disabled=1` + documented re-arm procedure:**
- Cheaper (one-line diff) but **inverts the tracked source of truth** for every future clone/host to "disabled by design" — exactly what AC-3 forbids doing without a ruling, and even with a written ruling, "a documented procedure nobody consults after the original incident is forgotten" is a failure class this fleet's own memory already catalogues repeatedly (stale cron variants, inert re-arm anchors, silent policy drift surviving past the event that motivated it). A future maintainer restoring the job from a fresh clone would get **no push automation at all**, for a reason no longer live, with nothing forcing them to notice.
- Fixes only `fleet-push`'s specific state — it is a value, not a mechanism. If `docker-events` (or any future copy-based label) is ever disabled the same way, (a) does nothing for it; each label needs its own manual tracked-flip.

**vs (c) move the decision into a checked-in policy file the installer reads:**
- Gets closer to satisfying AC-3's "must be an explicit ruling, not silent" language on paper (a `{label, disabled, reason, since}` record is more legible than a bare plist diff) — but it requires **the exact same install-time reader/enforcer as (b)** to have any effect at all; a policy file nobody consults at install time is exactly as silently overridable as today's bare `cp`. So (c) pays (b)'s full cost and adds a second artifact (a new launchd-policy JSON/schema) to design, maintain, and keep in sync with the plists it describes.
- That extra registry is only worth it if disarm-durability is a recurring, multi-label problem. Today it is exactly one label. Standing up a parallel per-label ledger for a single instance repeats a pattern this fleet's own memory already flags as costly elsewhere (bespoke per-tick keys, duplicate ack ledgers hiding real coverage). If a second label ever needs this, extending (b)'s script to a 2nd/3rd `<label>` argument is strictly cheaper than building (c) now on spec. The reasoned record AC-3 wants already exists — in this brief, in the row's own `po_note`/`evidence`, and in git blame on the installed-plist edit — without a new file.

## 4. Cost of the chosen option, named plainly

- New script + a short test (`scripts/install-launchd-plist.sh`, mirrors this repo's existing `scripts/agents-flow/*.sh` conventions — argv label, plain exit codes, no new dependencies). S-size.
- One doc edit: `docs/standards/cron-jobs.md` "Install / re-arm" lines for `fleet-push` (and `docker-events`, for consistency, even though it is not disabled today) repointed at the guarded script.
- **Residual risk, named honestly:** the guard only protects the path that goes through it. Until it ships and the doc repoint lands, the exact gap this row exists to close is still open — this design alone does not close it, only its implementation does. And even after it ships, nothing stops a manual `cp` bypassing the script entirely; this is a discipline control, the same category and the same acceptance this fleet already gives `orch-apply.sh`.
- Does not touch `PUSH-AUTONOMY-1`, the underlying autonomous-push design intent, or any of `scripts/fleet-worktree-push.sh`'s own logic — scope is install/reinstall time only.

## 5. Acceptance mapping

- **AC-1** (durable in the tracked plane, or refuse silent re-arm) — satisfied via the install-time guard (refuse path), not via a tracked `Disabled` value.
- **AC-2** (the one-line diff) — re-verified live in §1.1, unchanged.
- **AC-3** (must choose + justify, not bare `Disabled=1`) — satisfied by this decision + §3.
- **AC-4** (verify via `plutil -p`/`-extract` on the installed plist, never grep) — the guard script itself uses `plutil -extract ... raw`, never grep; live-tested this cycle against both fleet-push (present→`true`, rc=0) and docker-events (absent→rc=1) as a working/non-working control pair.
- **AC-5** (never re-arm; don't push) — untouched by this design; the guard's refuse-branch is the ONLY behavior exercised against `com.vn-market.fleet-push` this cycle, and it was reasoned about, never executed against the live installed file.

## 6. Files for the implementer (developer)

- **Create:** `scripts/install-launchd-plist.sh` (per §2 pseudocode — implementer fills in real arg validation, `$SRC`/`$DST` existence checks, and a `--help`).
- **Create:** `scripts/install-launchd-plist.test.sh` (mirrors sibling `scripts/test-fleet-push-classifier.sh` style) — MUST assert, with fixtures (never the real installed plist): (i) fresh install with no pre-existing `$DST` succeeds; (ii) pre-existing `$DST` with no `Disabled` key succeeds (overwrite allowed); (iii) pre-existing `$DST` with `Disabled=>true` is REFUSED, exit non-zero, `$DST` byte-unchanged after the run.
- **Edit:** `docs/standards/cron-jobs.md` § Fleet worktree push backstop "Install / re-arm" line (and the `docker-events` equivalent section, if one exists at the same specificity — verify before assuming).
- **Do NOT edit:** `launchd/com.vn-market.fleet-push.plist` (tracked copy stays `RunAtLoad=1`, no `Disabled` key — that is the correct, unchanged design default per §1.5). Do NOT touch the installed copy at `~/Library/LaunchAgents/com.vn-market.fleet-push.plist` at all, in any commit, test run, or manual verification step.

## 7. Test strategy

Unit/fixture-only (per §6) — no test may target the real installed `com.vn-market.fleet-push.plist`. QA's live-verification pass (if any) is read-only: `plutil -extract Disabled raw ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` must still print `true` (rc=0) before and after the implementer's change lands, proving the change shipped without touching host state.
