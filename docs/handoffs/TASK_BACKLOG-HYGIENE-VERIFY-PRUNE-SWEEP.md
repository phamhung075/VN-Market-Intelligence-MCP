# TASK_BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP

**Board row:** `docs/data/orch/orch-state.json` `.task_board.ready[id=BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP]` (P1, size M, adjudicated_dispatch by po, next_agent architect → pm)
**Source:** po status_note 2026-07-10T17:03Z (SHARPENED + PROMOTED); full deep-dive → `docs/architecture-briefs/2026-07-10-backlog-hygiene-verify-prune-sweep.md`

---

## [Architect] Brownfield Findings

### Zone
**`scripts/` (cross-service) + single-file `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (D2.5 only).** No frontend/other-service change. Per zone-detect Tier-2: root/scripts span → route D4/D1 to generic `developer`; route D2.5 (schema-file-only touch) to `dev-mcp-server`.

### Verified paths (RAW-read this cycle)
- `scripts/orch-cold-evict.sh:125-347` — confirmed it evicts exactly 5 categories (`task_board.done[]`, `.done_verified[]`, `.active_sprints[]`, `sprint_goal.entries[]`, `signal_queue.*[]`) and **never reads `task_board.backlog[]`** — root cause, 100% confirmed by direct read, not inferred.
- `scripts/orch-cold-evict.sh:323` — `backlog_detail: []` — a cold-archive schema field that has existed since inception and is **empty in every monthly archive** (`docs/data/orch/archive/2026-07.json` confirmed `0` items). This is the correct D1 eviction sink — PO's named target (`archive/backlog-detail.json`) is a *different, wrong* file (that one is the live-task hot/cold detail-prose split, 361/384 backlog rows still point there for still-open work, confirmed via `detail_ref` count).
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts:412-420` (`LANE_ALLOWED_STATUSES`) — **no lane accepts `BLOCKED`** at all. Live histogram: 4 backlog + 3 review rows carry `BLOCKED` — these can never pass lane-coherence in ANY of the 7 lanes without a schema change (§6/D2.5 of the brief). New gap PO's plan did not anticipate.
- `docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md` §2 — confirms the ORIGINAL sprint-eviction design was scoped to `active_sprints[]` only; `backlog[]` terminal-eviction was never in any prior brief's scope (not a slipped implementation, a genuine scope gap).
- `scripts/devteam-close-task-done-verified.jq` — existing generic any-lane→`done_verified[]` closer (searches backlog/ready/in_progress/review/qa). Reuse for exceptions found below rather than a new close mechanism.
- `scripts/orch-apply.sh:136-154` — conservation circuit-breaker (`orch-conservation-check.mjs`) already wired at Stage 2, confirmed live; `orch-cold-evict.sh` is already one of the 2 blessed `ORCH_APPLY_ALLOW_SHRINK` callers — D1/D4 need no new bypass grant.

### Empirically confirmed exceptions (D0 is not a formality — see brief §4 for full evidence/commands)
1. **`FIX-BCTC-BANK-SUMMARY-MAPPING`** — hot status `DONE` in `backlog[]`, but live-probed the serving DB directly (`docker exec ... bun:sqlite`) and the exact defect the row describes (CTG 2026Q1 `net_margin_pct=229157%`, `total_assets=0`) is **still reproducing today** (`parsed_at:2026-07-10T07:51:33Z`). Corroborated independently by its own review-lane sub-task `TASK-W5-...-VALIDATION-REINGEST` (status `BLOCKED`, `status_note` timestamped today from an independent qa review-drain sweep, same conclusion). **MUST NOT be evicted as terminal.**
2. **`FACTORY-INTERFACE-split-server-ts`** — hot status `BLOCKED` in `backlog[]` (one of the 12 "mislaned active" rows), but all 4 of its stage commits are present in this repo's actual history (`bce8be44b`, `821bbbeea`, `56f922c93`, `8c228ffa6` — the last is the newest commit at session start). This row needs `devteam-close-task-done-verified.jq`, not lane relocation.

Both are handoff-ready (exact evidence + commands in the brief §4) — the executing agent does not need to re-derive them, only apply the correction.

### Design decisions (full detail + rejected alternatives → brief §5-§8)
- **D2.5 (NEW, blocks D5):** extend `LANE_ALLOWED_STATUSES` so `backlog`/`review`/`in_progress` also accept `BLOCKED` (orthogonal-to-lane sub-state, matches the enum's own definition) — **requires PO ratification**, mirrors the ADD-1 `READY` precedent (same file, same mechanism). Rejected alternative: a new `task_board.blocked[]` lane (too large a blast radius against a `.strict()` schema + every lane-enumerating consumer).
- **D4 (root fix):** extend `orch-cold-evict.sh` with a new Pass-1 category scanning flat lanes `{backlog, review, qa, in_progress, ready}` for `TERMINAL_SET` status, sink = the dormant `.backlog_detail[]` field, add a migration-time `--exclude-ids` safety valve seeded with Exception 1, plus a new test file (`scripts/test/orch-cold-evict-tests.sh`, none currently exists) mirroring `orch-apply-wrapper-tests.sh`'s fixture/hash-proof style.
- **D0:** script-assisted 3-tier per-row triage of the 56 terminal-labeled + 8 D2-relocate-candidate rows (mechanical commit-hash check → git-grep corroboration → mandatory live-reprobe for any falsifiable data claim). NOT a blind bulk op — §4's 2/56-sampled error rate is the proof.
- **D1/D2/D3/D5:** mechanical execution once D0/D2.5/D4 land — full sequencing table with dependencies and risk tiers in brief §8.

### Reuse patterns
- `scripts/orch-cold-evict.sh` — extend, do not fork.
- `scripts/orch-apply.sh` + `scripts/orch-conservation-check.mjs` — reuse as-is, already wired, zero new write path.
- `scripts/devteam-close-task-done-verified.jq` — reuse for any-lane→done_verified corrections (Exception 2 and siblings D0 may find among the 8 D2 candidates).
- `LANE_ALLOWED_STATUSES` — single SSOT, extend not duplicate (D2.5).

### DDD layer / file map
| Component | File | Layer |
|---|---|---|
| D2.5 schema extension | `apps/mcp-server/src/infrastructure/orchStateSchema.ts:412-420` | infrastructure (schema) |
| D4 eviction extension | `scripts/orch-cold-evict.sh` (Pass 1 + Pass 2b) | ops/tooling script, not app-layer |
| D4 test suite | `scripts/test/orch-cold-evict-tests.sh` (new) | test |
| D0 triage tooling | new script (PM to name, e.g. `scripts/orch-backlog-hygiene-triage.mjs`) | ops/tooling script |
| D1 sweep driver | `scripts/orch-backlog-hygiene-sweep.sh` (new, per po's naming) — orchestration wrapper ONLY, calls D4's extended evict + a small D2 lane-move jq + the D0 exception closer | ops/tooling script |

### Test strategy
See brief §8 D4 row for the 6-case fixture test list; §9 for the D5 negative-path proof (inject a deliberate coherence violation into a throwaway fixture post-flip, confirm non-zero exit — never test against the live file, per `negative_path_corrupts_ssot` hazard).

### Risk flags
- **R-CRIT-1:** blind bulk-evict without D0 would have silently archived a genuinely-open P1 defect (Exception 1 proves this, not hypothetical) — D0 before D1 is load-bearing sequencing, not optional.
- **R-HIGH-1:** D4 touches the sole SSOT eviction script — regression risk against the already-working done/done_verified/sprint paths. Mandatory new test file before merge, run only against throwaway fixtures.
- **R-MED-1:** D2.5 is a schema-semantics decision — must not be silently decided by dev/PM without PO sign-off.
- **R-LOW-1:** evicted rows leave orphaned `backlog-detail.json` prose entries (harmless, not ref-integrity checked in that direction) — optional cleanup only.

### Scan clean: true (root cause + all counts independently re-verified against live code/data, not taken on PO's word)

**Standard Detection:** BUG-FIX / REFACTOR (in-zone, no new primitives) / MAINTENANCE → `BUILD-STANDARD: not-applicable`.
