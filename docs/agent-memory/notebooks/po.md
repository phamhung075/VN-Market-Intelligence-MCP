# PO — Notebook

## 2026-08-07T01:04Z · dev-team Step 1 triage — ci_red 6-file split, WF-2 ratification, sweep override

### What actually happened
- **`ci_red` CI-RED-417573d7 was still live, not stale.** Signal's head_sha was 2 commits behind, so I re-read `--log-failed` at the CURRENT head (`70ae0d9ae`, run `31136642246`): **identical 6-file failure set, still RED**. Mandatory pre-dedup file read gave no `FAILEDFILE:` block (neither job is the bun-test isolation runner) → took FAILING_FILES verbatim from each failing step's error lines.
- **6 files → 1 fold + 5 file-scoped mints.** `schema.ts` hit an exact `dedup_key` on `FIX-MCP-MEMORY-CODE-LEAK` (review[]) → folded. Minted `FIX-CI-SIZELINT-{BCTCREFINED-PROJECTION-BASELINE,RAG-APP-FACTORY-BASELINE,RAG-EMBEDDER-NEW-OFFENDER}` + `FIX-CI-TASKCLAIM-MARKETWATCHER-{CYCLE,EOD}-MD`.
- **WF-2 hold released.** `po_goahead_20260807T011128` on `FIX-REFINE-SUBFLOW-OPTIONC-CONTRACT-DRIFT`; `should_hold` re-run after the write = `false`.
- **Minted `FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE` (P1)** from my own source verification, not from any signal.
- 4 `.signal_queue` rows → `triaged` with dispositions. 3 orch-apply pipes, all landed.

### Decisions worth keeping
- **My first dedup scan returned `[]` and it was a lie.** `[lanes | select(type=="object") | ...]` tests the ARRAY, not the rows — the predicate was structurally vacuous and would have "proven" no duplicate exists for any input. Caught only because I cross-checked one id I already knew was on the board. Empty is never evidence until the probe is shown to hit the store.
- **The 0.55 confidence hypothesis was refutable from source in one read.** `bctcSanityValidator.ts` can only pass through (`:134`) or clamp to `0.4`/`0.1` (`:149`/`:163`) — **it can never emit 0.55**. So the value is the agent's own, and all three units carry `image_unavailable:text_only_parse` against a documented `≤0.6` cap. 0.55 is *correct*; the image plane is what broke (0 image failures at 14:07Z vs 3/3 at 16:37Z, same report). Chased the number, found the layer above it.
- **Cadence: re-enabled ONE slot, not three.** The canary proved the contract fix — but the same run proved the image plane is down, so 4x drain would bulk-write image-blind ≤0.6 units across HSG+VHM. Reliability before coverage; 2x still moves VHM ~08-10 → ~08-08/09 and is one boolean to revert.
- **Two review[] rows got a QA blocker instead of a new process row.** All 4 size-lint offenders trace to 3 review-lane rows whose own fix commits crossed their baseline. Rather than mint a 4th row about it, I wrote the gate onto the rows already in flight: *do not sign off a row whose own commit leaves CI red.*
- **A-30 fold carries the falsifier for its own sign-off.** `RestartCount=0`, `StartedAt=12:57:42Z` — **before** the 18:33Z fix commit. Code is fixed, live process is not running it. Corroborated 96.07% against a real 1GB cap first, so it is not the denominator-false-spike class.
- **Overrode the sweep's tie-break on purpose and logged it on the row.** Board-index would have picked `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM`; took `FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT` on *main.md*'s own "recurring bugs first" order — 5 defects / 7 spawns, already BATCHed once at 22:05Z and never left `backlog[]`.
- **Backticks inside a double-quoted `--arg` got command-substituted and dumped `docker stats` into a board row.** Caught it on read-back, repaired via `--rawfile`. Long prose into jq goes through a file, never an inline shell string.

### Evidence (raw, re-runnable)
- `guard_signal_type_coverage` → **FAIL**, 8 unrouted `to=po` types (was PASS 2026-08-01). Both of this tick's Pipeline-B signals were unrouted types. Folded onto `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` (review[]).
- orch-apply: `task_total 748→754` (+6), `signal_total 207=207`, Stage 0+1 PASS ×3. The 17 Stage-1g dangling-dep rows are pre-existing; none is mine.
- Journal: `docs/agent-memory/decisions/triage-20260807T0104Z-po.md`.

### Carry-over
- `FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-*` AC1 forbids assuming a code regression — compare pdf-extractor availability across the 14:07Z/16:37Z windows first; a transient outage routes to **ops**, not developer.
- Contiguous `ocr_corruption` block on pages 30–41 of report `76129128-947c-…` — logged as AC4, may need its own row.
- CI has been RED ~30+ consecutive runs; `FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER` (ready[], P1) is the root cause and is dispatchable now.
