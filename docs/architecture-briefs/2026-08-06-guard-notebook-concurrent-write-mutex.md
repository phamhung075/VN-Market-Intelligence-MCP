# Architecture Brief — Notebook Concurrent-Write Collision (Multi-Writer Lost-Update)

**Task:** `GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS` (P1, supervised, owner `po`, `plan_only`)
**Author:** architect · **Date:** 2026-08-06
**Status:** DESIGN COMPLETE — no code shipped by this brief (plan_only per task contract)
**Standard Detection:** BUG-FIX/REFACTOR (in-zone, no new service) → `BUILD-STANDARD: not-applicable`
**Zone:** `cross-service/` (`.claude/skills/`, `scripts/agents-flow/`, `docs/agents/dev-team/`) — spans TWO owner commit-zones, see §6.

---

## 1. Restated problem

9 concurrent `qa` sub-agents (`QA_CAP=10` BGFAN-1 batch fan-out, `docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain) each ran the standard notebook end-of-cycle write against the SAME file, `docs/agent-memory/notebooks/qa.md`, inside one dev-team tick (2026-08-06T09:37Z–10:08Z). The write convention (`.claude/skills/notebook-write/SKILL.md` AC-3) is read-full-file → compose-in-memory → single settled `Write` (full-file replace) — safe for 1 writer/tick, unsafe for N concurrent writers on the same file with no mutex.

This is **distinct** from `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS` (single-writer: one agent's own compose step corrupts a retained section it never should have touched — see `docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-actuator-and-immutability-blindspot.md`, already routed to agent-father). That defect is about ONE writer mishandling its own read. This one is about TWO-OR-MORE writers, each individually correct in isolation, racing on the SAME shared file. Fixing either leaves the other live — confirmed by design, not assumption.

## 2. Decisive evidence (read raw, not PO's summary)

Read directly from `docs/signals/processed/notebook-direction-defaulted-docs-agent-memory-notebooks-qa-md-2026-08-06T*.json` (11 files, 10:00:46Z–10:08:36Z) — each is a forensic snapshot of `qa.md`'s retained `## ` sections as `notebook-auto-prune.sh` saw them, emitted as an informational side-effect (the hook is not a race participant, `feedback_agent_selfreport_metalayer_confabulation` does not apply — this is a passive observer log).

Two independent proofs of concurrent lost-update, both mechanically undeniable:

**(a) Non-monotone retained set.** `100046Z`: `{c503, c504-A, c504-B, c504-C, c505-A, c506-A}` (6 sections — note THREE distinct `## cycle-504` headings coexisting). `100600Z`: `{c503, c504-D, c504-B, c504-C, c505-B}` (5 sections) — `c505-A` (`FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE`) and `c506-A` (`FFLOW-STALE-0723-A-VPS-FIX`) both vanished; `c504-D` (`FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE`) appeared in their place. `103320Z`: `c505` is now a THIRD distinct entry (`FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS`). A monotone drop-oldest prune cannot resurrect a vanished section or swap one cycle's content for another's — only independent writers, each overwriting the whole file from their own stale baseline read, produce this.

**(b) Duplicate cycle-number allocation.** The `100046Z` snapshot alone contains THREE different `## cycle-504 · ...` headings with three different task titles, coexisting in one file. The `c<NNN>` generation rule (SKILL.md, "continuing from the highest existing `c<NNN>`") requires each writer to read the current max and increment — three writers read the SAME max (`503`) before any of them landed their write, so all three independently computed `504`. This is the textbook "lost update from a stale read" signature, not a pruning-order bug.

**Ruled out, not assumed — the "third writer" open question.** The router signal (`docs/signals/processed/router-notebook-race-qa-md-20260806T0958Z.json`) flagged one agent's suspicion of "a PostToolUse formatter hook rewriting the file mid-session." Read `.claude/settings.local.json`: the only `PostToolUse` hooks matching `Write|Edit` on this path are `notebook-auto-prune.sh` and `context-bloat-backstop.sh`. Read `context-bloat-backstop.sh` in full (294L): its only file-mutating action is `printf ... > "$sig_file"` — a NEW signal JSON file under `docs/signals/`, never a write to the notebook itself (grep-confirmed: zero `mv`/`> "$FILE"` targeting the notebook path). `orch-state-hook-prewrite.mjs` (the only `PreToolUse` writer-adjacent hook) is scoped to `docs/data/orch/orch-state.json` only. **There is no third writer.** The suspected "formatter" was almost certainly a peer QA sub-agent's own concurrent `Write` (or its cascading `notebook-auto-prune.sh` invocation) landing mid-session — i.e. more evidence for this same defect, not a fourth mechanism.

## 3. Root cause

Two coupled read-modify-write actors touch the same file with zero mutual exclusion:

1. **The writing agent itself** — AC-3 Step 1 (`Read` full file into context) through Step 2 (single settled `Write`) spans an LLM reasoning window of unbounded, variable duration. Any second writer whose own Step 1 Read lands before the first writer's Step 2 Write completes computes its "settled body" from a baseline that is about to become stale, and its own Write silently clobbers whatever the first writer landed.
2. **`notebook-auto-prune.sh`** (PostToolUse `Write|Edit` hook) — fires synchronously after EVERY notebook Write/Edit, and performs its own independent read-full-file → drop-oldest-in-memory → atomic `mv` cycle with **zero staleness check between its own read and its own mv** (confirmed by full read of the script, lines 379–598: `FILE_CONTENT="$(cat "$FILE_PATH")"` once, then loops purely in memory, `mv "$TEMP" "$FILE_PATH"` at the end with no re-stat of `$FILE_PATH` immediately prior). If a second Write (from a peer sub-agent) lands on the real file between this hook's read and its mv, the hook's mv overwrites that peer's content using a decision computed from data that is now stale — same class of bug as (1), just a second actor capable of triggering it.

Both actors are individually "correct" in isolation (matches AC-3/AC-5 exactly for 1 writer/tick); neither has ever been exercised concurrently until `QA_CAP` was raised from `<1` to `10` (`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` / `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`, both 2026-08-06) — the fan-out change did not introduce a new bug, it raised N on an always-latent one past the point of being observable.

## 4. Adjudicating PO's three candidate directions

**(c) Cap same-tick same-role fan-out — insufficient alone, confirmed by an independent prior incident, not just PO's own caveat.** The ORIGINAL instance of this row (tran-ngoc-bau.md `c113`, 2026-07-18) was exactly **N=2** concurrent writers, no fan-out mechanism involved at all. A lower cap narrows the exposure window and lowers collision *frequency*; it cannot raise the probability to zero, because the defect fires at N=2. Recommendation: keep as defense-in-depth throughput tuning only (§6.3), never as the closing fix.

**(b) Append-only cycle-log section — cannot work standalone; the instinct is right but mis-scoped.** Adding a NEW cycle section is not this notebook format's only mutation: AC-2 retention (drop-oldest to 3 sections) and AC-5 (≤200L/≤60L-per-section cap) both require **removing** content already in the file — an operation with no OS-level "append" equivalent. Native `Write`/`Edit` tools have no true append primitive either (AC-3 already collapsed to ONE full-file `Write`, specifically because the prior `Edit`-whole-file-match form was fragile). A pure append-only redesign would still need a periodic full-rewrite prune step, which reintroduces the exact same RMW race for that step. The useful part of (b)'s instinct — stop treating "recompute the whole file from an LLM-held read" as an acceptable primitive — is what §6.1/§6.2 below actually deliver, via a shared mutex around the existing settled-write shape, not via a new append format.

**(a) `task_claim` mutex per notebook file — correct direction, but not a drop-in; requires one small, concrete primitive extension.** Verified in `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts`: `task_kind` is a closed Zod enum, 7 values (`cowork-slot | sprint-task | dashboard-row | commit-mutex | intent | orphan-signal | session-presence`) — none semantically fits "mutex over an arbitrary shared file." This is not a documentation gap; calling `task_claim` today with any invented `task_kind` value fails Zod validation server-side. §5/§6 below specify the exact, additive (backward-compatible) extension needed and why `task_claim` — not a new filesystem lock — is the right primitive for this specific repo.

## 5. Why `task_claim`, not a new filesystem lock (environmental risk, corroborated in this repo)

A bash-only mutual-exclusion primitive (`mkdir <lockdir>`, `ln`, `open(O_CREAT|O_EXCL)`) is the obvious default for a hook script — `notebook-auto-prune.sh` is pure bash and **cannot call an MCP tool** (no MCP-from-bash bridge exists anywhere in this repo; verified: `task_claim` has zero non-agent callers, grep of `scripts/` finds it only inside `.jq`/prose references PO/router agents interpret, never inside an executable bash/bun script). This constrains any hook-side fix to bash-only primitives.

But this repo has a **confirmed, not hypothesized**, environmental hazard specifically against that class of primitive on this exact directory: `docs/protocols/head-lock-self-cure.md` documents a root-caused (`H4`, "identical fingerprint (VirtioFS PID 51247)" across 14 occurrences) Docker-Desktop-VirtioFS race that makes atomic-create lock semantics (`git`'s own `HEAD.lock`, itself an `O_CREAT|O_EXCL`-class primitive) unreliable — and names `./docs/agent-memory` as one of only TWO remaining un-excluded rw bind-mounts (the `F1` fix, excluding `.git` from Docker Desktop's shared sync, is a pending USER action, not yet shipped). Inventing a NEW lock-directory primitive under `docs/agent-memory/notebooks/` would inherit this exact, already-burning hazard class without any new validation. This is why §6.2 below hardens `notebook-auto-prune.sh` with a **stat-based staleness check** (an optimistic, non-blocking guard using primitives already proven safe in this script — `cat`, `stat`, `mv` — never a new atomic-create lock file) rather than a bash-side mutex.

`task_claim`'s lock state lives in the MCP server's own SQLite-backed lock table (`apps/mcp-server/src/infrastructure/db/coordinationStore.ts`), entirely outside the bind-mounted git worktree filesystem — its correctness does not depend on this repo's VirtioFS hazard at all. This is the deciding factor for recommending it as the PRIMARY (agent-side) mutex over a new file lock, independent of it also being the already-proven, already-reused primitive for every other shared-hot-file race in this codebase (`orch-state.json` PRE-CLAIM, cowork dispatch, commit-mutex).

**TTL hazard, addressed by design (not ignored):** `feedback_preclaim_ttl_600s_expires_under_long_agent_runs` (this repo's own prior incident) burned this exact primitive by holding a claim across a long, variable-duration critical section. §6.1 explicitly keeps the LLM's variable-duration work (authoring the new section's prose) **outside** the held window — the claim brackets only the short, mechanical "fresh read → merge/prune math → Write → verify" span, with an explicit short TTL override (120s), not the 3600s default (which would otherwise turn one crashed holder into a fleet-wide hour-long notebook freeze).

## 6. Design

### 6.1 `.claude/skills/notebook-write/SKILL.md` — new AC-7: Concurrency Guard (owner: `agent-father`)

Insert between AC-3 (Write operation) and AC-4 (Blank-state fallback):

```markdown
### Concurrency guard (AC-7) — mutex around the settled write

Any write to a governed notebook (AC-6 table) MUST be bracketed by a per-file
task_claim, held ONLY across the mechanical portion of AC-3 — never across the
LLM's own authoring of the new section's content, which happens BEFORE this
block and is NOT time-bounded by it (TTL-hazard avoidance, see
GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS brief §5).

1. Author the new cycle's ≤60L section content first (normal reasoning, no
   claim held).
2. Claim: task_claim(task_id="notebook:<agent-id>", task_kind="notebook-write",
   owner_agent="<agent-id>", owner_client_session=$CLAUDE_CODE_SESSION_ID,
   ttl_seconds=120, payload='{"file":"<notebook_path>"}')
   - claimed:true -> proceed to step 3.
   - claimed:false, current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID
     -> task_heartbeat, proceed (re-entrant, already held).
   - claimed:false, peer session holds it -> sleep 3s, retry (max 5 attempts,
     15s total). Exhausted -> DO NOT write unguarded. Emit
     notebook_write_deferred_lock_contended signal, defer this cycle's entry
     to the NEXT invocation of this write step. Never bypass the claim to
     "make progress" — an unguarded write here is the exact defect this AC
     exists to close.
3. Re-read the notebook fresh (Step 1a) — the pre-claim Read, if any, is
   DISCARDED; only a read taken AFTER a successful claim is a valid baseline.
4. Perform Step 1b-h (compose) and Step 2 (Write) exactly as AC-3/AC-5
   specify. Step 2's cascading PostToolUse hook (notebook-auto-prune.sh) runs
   synchronously inside this SAME held window (hooks block the tool result
   from returning to the caller) — no separate lock is needed for the hook on
   this path.
   If/when the compose step is replaced by a scripted actuator (per
   docs/architecture-briefs/2026-08-06-fix-system-auditor-notebook-compose-
   actuator-and-immutability-blindspot.md), the Bash tool call to that script
   replaces "Write" in this step; the claim/release bracket is unchanged.
5. task_release(task_id="notebook:<agent-id>", owner_client_session=$CLAUDE_CODE_SESSION_ID).

Prerequisite (blocking, separate task — do not implement inline): task_kind
enum on the MCP server must include "notebook-write" before step 2 can
succeed (see brief §6.4). Zod validation fails closed today for any
unrecognized task_kind — this is not optional wiring.
```

### 6.2 `scripts/agents-flow/notebook-auto-prune.sh` — staleness guard (owner: `developer`)

The hook cannot itself call `task_claim` (no MCP-from-bash path exists). For the case where a write lands from a caller that is NOT (yet, or ever, e.g. legacy) inside an AC-7 claim, harden the hook so it never overwrites a change it cannot see:

- At the point `FILE_CONTENT` is first captured (current line ~379), also capture `PRE_MTIME=$(stat -f %m "$FILE_PATH" 2>/dev/null || stat -c %Y "$FILE_PATH" 2>/dev/null)` and `PRE_SIZE=$(wc -c < "$FILE_PATH" | tr -d ' ')` — same dual macOS/Linux `stat` idiom already used in `docs/protocols/head-lock-self-cure.md`.
- Immediately before the existing `mv "$TEMP" "$FILE_PATH"` (line ~598), re-read `CUR_MTIME`/`CUR_SIZE` the same way. If either differs from `PRE_MTIME`/`PRE_SIZE`, a peer write landed during this hook's own compute window: **abort this mv, discard `$TEMP`, do not write.** Emit a new informational signal `notebook_prune_aborted_concurrent_write_detected` (same emit-signal shape as the existing `notebook_tiebreak_direction_defaulted` — file, both mtimes/sizes, `action_required: informational_no_action_needed`) and exit 0. The prune is not lost: any subsequent Write/Edit to this same path re-fires this same PostToolUse hook, so an aborted-this-time prune is retried on the very next write, and the fixed-cadence `notebook-linecap-sweep.sh` sweep is an existing independent backstop regardless.
- This is optimistic, non-blocking, and uses only primitives already proven safe in this exact script (`stat`, `wc -c`, `mv`) — it adds no new atomic-create lock file, so it does not inherit the VirtioFS/`H4` hazard named in §5. It narrows this hook's own race window from "however long the compute+mv takes" to effectively zero, but does not by itself make the AGENT-side race (§6.1) go away — it is defense-in-depth for the backstop path only, never a substitute for AC-7.

### 6.3 `docs/agents/dev-team/flow/main.md` — prose note only (owner: `agent-father`)

In § Review-Lane QA-Drain (both the idle-tick and head-decoupled sites, which already share one `QA_CAP`/claim script per the file's own text), add one sentence: once AC-7 (§6.1) ships, `QA_CAP` is a pure throughput/latency tuning knob (higher = more contention/backoff on the shared per-notebook mutex among same-role `qa` spawns, never a correctness lever) — no change to the cap value is required by this row, and PO's adjudication (row note) explicitly rejects capping alone as a close condition. Optional, non-blocking: a small stagger (e.g. a few hundred ms) between BGFAN-1 spawns within one batch reduces peak concurrent contention during rollout; not required for correctness once §6.1 lands.

### 6.4 Prerequisite, NOT in this row's file scope — flag as a companion task for PM to mint

`apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (Zod `task_kind` enum, line ~89) and `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (`TaskKind` type, line 346) both need one additive value, `"notebook-write"`, appended to their respective 7-member lists (backward-compatible — adds, never removes/renames an existing kind; zero risk to the other 6 callers). Zone: `dev-mcp-server` (owner: `dev-mcp-server`, NOT `agent-father`/`developer` — real TS source under `apps/mcp-server/src/`). This MUST land before §6.1's AC-7 can succeed (a `task_claim` call with an unrecognized `task_kind` fails Zod validation today, fail-closed).

**Acceptance test (extend, don't duplicate):** `apps/mcp-server/src/__tests__/task-lock-coordination-store.test.ts` already has the exact harness needed (`describe("AC-2: Concurrent INSERT OR IGNORE — only one winner")` already proves the primitive's core mutual-exclusion at the unit level). Add one new `describe("AC-12: notebook-write task_kind — concurrent notebook RMW")` block: spin up N (>=2, and a second run at N=9 to match the live incident's fan-out) simulated async writers against a shared TEMP fixture `.md` file, each performing claim→fresh-read→append-distinct-section→prune-to-3→write→release using `task_kind="notebook-write"`; assert (a) a NEGATIVE control with claim/release removed reproduces a dropped-or-duplicated section (proves the fixture is a faithful repro, not a strawman — mirrors this brief's own §2 evidence shape) and (b) the POSITIVE control (claim/release present) always ends with exactly the N most-recent distinct sections, byte-identical, no duplicates, no drops. This is the row's own `verification_gate` ("forced two-concurrent-writer test on a fixture notebook preserves BOTH sections") — implement it here, not as a new shell script, since the primitive under test already lives in this file's own module.

## 7. Files to create / modify

| Action | Path | Owner (zone) |
|---|---|---|
| MODIFY | `.claude/skills/notebook-write/SKILL.md` (new AC-7) | agent-father |
| MODIFY | `scripts/agents-flow/notebook-auto-prune.sh` (staleness guard) | developer |
| MODIFY | `docs/agents/dev-team/flow/main.md` (1-sentence prose note, § Review-Lane QA-Drain) | agent-father |
| MODIFY (companion row, mint separately) | `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` + `.../coordinationStore.ts` (`task_kind` enum +1) | dev-mcp-server |
| MODIFY (same companion row) | `apps/mcp-server/src/__tests__/task-lock-coordination-store.test.ts` (new AC-12 block) | dev-mcp-server |

**Mixed-zone flag for PM (do not dispatch as one row):** this task's own 3 named files already split across `agent-father` (`SKILL.md`, `dev-team/flow/main.md`) and `developer` (`scripts/agents-flow/notebook-auto-prune.sh`) — same class of zone-split PM already resolved for `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (`docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §1c). Recommend PM mint 3 rows: (1) agent-father — §6.1+§6.3, depends on (3); (2) developer — §6.2, no dependency, can ship first/independently; (3) dev-mcp-server — §6.4, blocking dependency of (1).

## 8. Sequencing

§6.4 (enum extension) → §6.1 (AC-7, depends on §6.4 shipping first — the claim call is a no-op-fails-closed otherwise). §6.2 (hook hardening) is independent, ships any time, closes real exposure on its own (narrows the hook's own race window) even before §6.1 lands. §6.3 is a documentation-only note, no dependency, cosmetic.

## 9. Risk flags

- **Retry-exhaustion path in §6.1 defers a cycle's notebook entry** rather than writing unguarded — this is a deliberate trade (never silently lose data by writing on a stale baseline) but means a persistently-contended notebook (e.g. `qa.md` under sustained `QA_CAP=10` load) could see entries deferred more than one cycle under worst-case contention. Acceptable given the alternative is the exact data-loss class this row exists to close; monitor via the new `notebook_write_deferred_lock_contended` signal after rollout — if it fires often, that is evidence for tuning `QA_CAP` down (§6.3), not for weakening the guard.
- **§6.2's mtime granularity** may be 1-second resolution on some filesystems; a same-second, same-byte-count coincidental collision could theoretically slip through undetected. Explicitly framed as defense-in-depth belt for the backstop path, never the primary guarantee (§6.1 is).
- **Scope discipline:** this brief does not touch `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`'s own scripted-actuator design (`scripts/notebook-compose.sh`) — §6.1 step 4 is written to compose cleanly with it whichever lands first, by construction (the claim/release bracket is agnostic to what runs inside it).

## RETURN
```
DONE: Architecture brief complete — docs/architecture-briefs/2026-08-06-guard-notebook-concurrent-write-mutex.md
ZONE: cross-service/ (multi: .claude/skills/, scripts/agents-flow/, docs/agents/dev-team/ + companion dev-mcp-server row)
NEXT: pm | split into 3 rows per §7 mixed-zone flag (agent-father / developer / dev-mcp-server), sequence per §8
PIPELINE: continue
QUALITY: full
```
