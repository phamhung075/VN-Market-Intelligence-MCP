# TASK-CRON-SKILLMD-PROBE-WIRING

**Zone:** `.claude/skills/` · **Owner:** `agent-father` · **Size:** M (~2.5h) · **Priority:** P0
**Parent row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` §4.1–§4.5, §5, §6
**depends_on:** `TASK-CRON-LIVENESS-PROBE-SCRIPT`, `TASK-CRON-LIVENESS-PROBE-TESTS`, `TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY`
**blocks:** `FIX-CRONCREATE-CONTRACT-DIVERGENCE-DURABLE-NOOP-AND-NO-DESCRIPTION-PARAM`

---

## TLDR
Rewrite Step 1b.1 in **all three** cron SKILL.md files to call the probe script instead of guessing from self-reported bookkeeping, and make Step 1c write the v2 process fingerprint the probe needs.

## Why the dependency ordering is load-bearing (brief §5) — do not start early
If these docs cite `scripts/agents-flow/cron-marker-liveness-probe.sh` before it exists and is tested, this becomes the exact doc-lies-about-runtime class already tracked as `FIX-CRONCREATE-CONTRACT-DIVERGENCE-DURABLE-NOOP-AND-NO-DESCRIPTION-PARAM` — which edits **these same three files** and is already `depends_on`-gated behind this work. `TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY` is also in `depends_on` because it edits `cron-cowork-team/SKILL.md` too (same-file → sequential, per the PM conflict-check matrix); it is small and dispatchable now, so it should not delay you materially.

## Acceptance Criteria

- [ ] **AC-1 — one shape, three files, byte-identical branch text.** `.claude/skills/cron-cowork-team/SKILL.md`, `.claude/skills/cron-detect-loop/SKILL.md`, `.claude/skills/cron-standalone-team/SKILL.md` all replace their Step 1b.1 block with the same probe invocation:
      `bash scripts/agents-flow/cron-marker-liveness-probe.sh --family cowork-team|detect-loop|standalone-team`
      **Do not fix one family and leave two divergent — that divergence IS the bug.** All three ship in one pass.
- [ ] **AC-2 — the byte-identical bad branch is deleted, everywhere.** This exact text must not survive in any of the three files:
      `` `released:false` (fresh heartbeat — race) → treat conservatively as LIVE → **STOP, no-op.** ``
      Replaced verbatim by brief §4.4: *"A `DEAD` verdict followed by `released:false` is a transient write conflict, **never** a re-interpretation as LIVE. Retry once after the remaining window (bounded, ≤120 s). Still `released:false` → `UNKNOWN` → §4.3 alarm. Under no circumstance does this path fall through to `STOP, no-op`."*
- [ ] **AC-3 — `orphan_threshold_seconds` demoted to a write-side CAS guard, uniform `120` in all three families** (brief §4.4). It is no longer asked "is the owner alive"; it is asked "has anything changed since I read the marker". `task_force_release_orphan` is called **only on a `DEAD` verdict**.
- [ ] **AC-4 — F5 gate.** `grep -c 'orphan_threshold_seconds: 7200' .claude/skills/cron-*/SKILL.md` returns **0**, and all three Step 1b.1 blocks demonstrably invoke the probe.
- [ ] **AC-5 — Step 1c payload gains the v2 fingerprint, in all three** (brief §4.5). Today only cowork has `registering_process` at all — O1 has zero wiring for 2 of 3 families. Write the structured object:
      `{"fp_version":2,"pid":<PPID>,"start_epoch":<epoch>,"comm":"claude","host":"<host>","session_id":"<SID>","transcript":"<absolute path>"}`
      `$PPID` inside these skills' Bash blocks **is** the `claude` CLI process (verified: bash 4286 → ppid 42648 → `comm=claude`). The v1 key name `ppid-` mis-binds the next reader; the v2 key is `pid`.
- [ ] **AC-6 — locale-free primitives in the arming path too** (brief §4.6, R3). `LC_ALL=C` wraps **both** `ps -p "$PPID" -o lstart=` and `date -j -f "%a %b %d %T %Y"`. The live cowork value is currently `"ppid-42648-start-Dim_23_aoû_02:40:51_2026_-host-admins-MBP.lan"` — French month names from `LC_TIME=fr_FR.UTF-8`, unparseable to an epoch, plus a `2026_-host` trailing pad from `tr -s ' ' '_'`. That string is a **latent Step-1a false-DEFER bug in its own right**: if `LC_TIME` differs between the arming and probing invocations, the fingerprint compares unequal for the *same* process and spuriously fires SIBLING-PROCESS DEFER.
- [ ] **AC-7 — cowork Step 1a compare is `fp_version`-aware (brief R4).** Step 1a's SIBLING-PROCESS fast path compares fingerprints by string equality; changing the shape breaks it for markers written by an older session. v1→v2 must route through Step 1a's **existing backfill branch** (`task_release` + `task_claim`) — **never a fresh claim**, which would steal a live peer's marker.
- [ ] **AC-8 — the third branch is documented, not just implemented.** Each file states the `DEAD / LIVE / UNKNOWN` trichotomy and its family's `on_unknown` disposition, and names the probe's `has_fire_election_mutex` table as the SSOT for that disposition. **Do not restate the mutex value as a literal in the docs** — three numbers in three docs is how this bug was born.
- [ ] **AC-9 — no silent termination (brief §4.3).** `UNKNOWN` and `DEFER` paths in all three files mandate `send_telegram(channel="bug")` **and** a `docs/signals/` row, deduped on `(family, marker_owner_session)`.
- [ ] **AC-10 — `cron-standalone-team/SKILL.md` §1.4 rationale rewritten.** `T=120` is no longer a liveness decision; its "no renewal hook, by design" rationale must stop being presented as a liveness argument. Note the residual (brief R6): standalone stays `defer`-on-UNKNOWN until it gets a per-tick mutex — tracked as `FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX`, not a blocker here.

## Files
- **Modify:** `.claude/skills/cron-cowork-team/SKILL.md` (Step 1a fingerprint v2 compare; Step 1b.1 → probe; Step 1c payload) · `.claude/skills/cron-detect-loop/SKILL.md` (Step 1b.1 → probe; Step 1c payload gains `registering_process`) · `.claude/skills/cron-standalone-team/SKILL.md` (Step 1b.1 → probe; Step 1c payload gains `registering_process`; §1.4 rewrite)
- **Read first:** brief §2, §4.1–§4.6, §5, §6 · `scripts/agents-flow/cron-marker-liveness-probe.sh` (the shipped contract — cite what it actually emits, never what you expect it to)
- **Do NOT modify:** `scripts/agents-flow/cron-marker-liveness-probe.sh` or its test file (developer zone) · `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` (that is `TASK-CRON-AMEND-DEDUP-BRIEF-S13`, owner `architect`)

## Standards
`docs/policies/dev-standards.md` · `.claude/skills/commit-boundary/SKILL.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-CRON-SKILLMD-PROBE-WIRING` + `AC:` trailer)
