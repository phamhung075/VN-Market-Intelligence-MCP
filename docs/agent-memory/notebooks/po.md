# PO Notebook

_Last: 2026-07-25T12:26Z (router-referred mint-vs-fold on Tier-1 heartbeat writer gap — FOLD, 0 rows minted; evidence amended in place after router falsified one of my claims)_

## Tick 2026-07-25T12:15–12:26Z

| Input | Disposition |
|---|---|
| Router: `auditor-tier1-last-healthy.json` has no writer on the live Tier-1 path | **FOLD** — not a new row |
| `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` (READY/P2/developer) | `+ .live_path_evidence_20260725`; status/lane/owner/priority **unchanged** |
| Board totals | `task_total` 652→652, `ready[]` 44→44 — conservation flat, nothing minted |

**Ruling:** the finding is real and I re-verified it independently, but the READY row minted 2026-07-21 (`po/ruling-20260721T2050`) already owns the surface — its `.why_the_obvious_fixes_are_wrong` states verbatim *"No tier-1 heartbeat writer exists anywhere in the repo … system-auditor spawns every 30min forever"*, and its `.ownership_two_party` + AC(4) already own the register.md-vs-live-cron divergence. Commits `339c34d32` (fold) + amendment.

**Amendment 12:25Z:** router falsified my "never had a periodic writer" claim. Verified and accepted — writer is **intermittent, not absent**. `.live_path_evidence_20260725` rewritten in place: retraction marked, observation log added, mechanism recorded **UNRESOLVED** (3 candidates), OH-3.5 risk corrected permanent→**flapping**.

**Amendment 12:31Z:** router excluded my `12:20:51Z` sample as **confounded** (off-boundary + inside my own run window). Verified and accepted — ratio restated **3-of-4 → 2-of-3**, sample moved to a labelled `(1b) EXCLUDED` block, `(5) METHOD WARNING` added. Ruling untouched throughout — still FOLD, 0 rows minted, no lane/status/owner/priority change across all three writes.

## Lessons

- **⚠️⚠️ One failure class, THREE times in one triage: an artifact of the MEASUREMENT APPARATUS read as a property of the SYSTEM.** (i) Router read a raw-probe banner emitted by the *wrong script* as proof the heartbeat writer ran. (ii) I read `git log` of a **dirty** file as proof no writer existed. (iii) I counted a write that landed **inside my own investigation window** as a tick observation. Each time the instrument left a mark and we scored the mark. **When measuring a thing you are also touching, establish the observer's own footprint first.**
- **`git log` on a DIRTY file is not an observation log — I got falsified on exactly this.** I concluded "never a periodic writer, WU-3 dormant 23d" from `git log` of `auditor-tier1-last-healthy.json`. It is uncommitted-dirty (` M`): `HEAD`=`07-25T07:38:02Z` while live was `11:37:59Z` → **history is blind to precisely the writes that decide the question.** Writer is *intermittent*, not absent — **2 of 3** tick windows (11:00Z ✓, 11:30Z ✓, 12:00Z ✗). **Run `git status --porcelain` on a state file before reasoning from its history; if dirty, only the live file is admissible.**
- **A sample from inside your own run window is not evidence, even when you can prove you didn't cause it.** I logged the `12:20:51Z` advance as a 4th observation; router excluded it — off-boundary (`+20:51` vs `*/30`, and `CronList` shows only the plain form, no launchd auditor) **and** inside `[12:11Z, 12:25Z]` which my run covers. I *could* show my round-1 transcript ran no `auditor-tier1-probe.sh` (grep-read only, no subagent) — but that eliminates **one** confounder, not the exclusion: still off-boundary, peers still unexcluded. **Contribute the narrowing fact, do not use it to smuggle the sample back in.**
- **A silent wrong-path jq renders as a clean "zero prior art".** The router's grep miss was **not** case-sensitivity (both predicates carried `"i"`) — my stated cause was wrong. True cause: it queried **top-level** `.backlog`/`.ready`/… which are all `null` (rows live under `.task_board.*`); a defensive `select(.!=null)` then stripped every null and `add` returned empty → printed nothing, indistinguishable from a real negative. **A prior-art query that returns zero must first be proven to return non-zero on a known-present row.** This failure mode is silent, repeatable, and immune to fixing the needle.
- **I inherited a bad inference and then built a worse one on top.** Router's "Job 2 force-spawns forever" rested on conflating two scripts; I correctly split them, then over-read the timestamp pattern into "no writer ever". Tick-attributable writes land `+8..+14` min past a boundary and *never* near it — which looks like a discriminator until you notice session dispatch lag is ~7 min (12:00Z tick → notebook header `12:07:37Z`). **The offsets are consistent with all three candidate mechanisms; recorded UNRESOLVED rather than resolved.**
- **Two scripts, similar names, opposite contracts.** The tick's raw-probe block comes from `docs/agents/system-auditor/probe.sh:26` (writes **no** heartbeat); the heartbeat writer is `scripts/agents-flow/auditor-tier1-probe.sh`. A real probe block in the notebook is **not** evidence the heartbeat writer ran. Confirm by the emitting line, not the artifact's shape. (This part held up.)
- **Intermittent ≠ permanent, and the difference decides the debugging posture.** My OH-3.5 risk note said "permanent-stale FP"; with an intermittent writer the age **sawtooths** — breach needs ~2–3 consecutive misses and self-clears when one write lands. A flapping FP is arguably worse: it clears before anyone investigates and re-fires with no code change. Amended to require a consecutive-miss/dedup window, not a single-sample age read.

## Carry-over

- **`FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL` is two-party and must not be collapsed.** Developer does the 2 edits; **ROUTER must then re-arm via `/cron-detect-loop`** — `register.md` is a registration source, not the live cron. Do not let it close on file edits alone (its own AC(4) forbids it).
- **Sequence the re-arm BEFORE or WITH OH-3.5**, and give OH-3.5 a **consecutive-miss / dedup window** rather than a single-sample age read — the writer is intermittent, so a naive age check flaps rather than pinning.
- **The Tier-1 heartbeat writer's identity is UNRESOLVED** (Job 2 armed-but-flaky · subagent-discretionary invocation · third caller). Resolve by instrumenting the caller. **Timestamp offsets do not discriminate** — do not let anyone close it on that.
- **Do NOT "fix" the tier-1 heartbeat by dropping the `AUDIT_TIER` 2/3 gate at `main.md:748`** or by porting `suppress_heartbeat` to tier-1 — the 07-21 ruling rejects that direction explicitly.
- **`FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (P0) still CANNOT self-dispatch** — needs an out-of-band `architect` spawn. Do not clear `supervised`/`plan_only`; the classification is correct. Do not re-open its (a)/(b)/(c) option set.
- **If architect rejects the durable inbox** in favour of the narrow BOUNDED-1 guard → re-open `FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` from `archive[]`; do not silently narrow AC-2.
- **`ready[]` is a trap lane (44) and `review[]` is write-only (107, `qa[]`=0).** Unchanged this tick and still worsening — both unblock only via the P0 above. `in_progress` is now **0**.
- **`UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` MUST CO-SHIP.** `UC-SDF-P2` has a 2nd failure mode beyond the filename (on-grid file lacks `fetchedAt`/`created_at`); fixing only the name leaves it dark.
- Head untouched. I dispatched no agent, touched no container. **Nothing pushed** — push stays gated.
