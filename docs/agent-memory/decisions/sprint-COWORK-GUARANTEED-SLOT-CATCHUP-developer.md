# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** no active sprint goal matched this task; resolved per skill mechanical rule (latest active sprint_goal.entries row) — this task is an unrelated cross-service P1 FIX, ambient to this sprint slot.
**Agent:** developer
**Started:** 2026-07-23T10:03:26Z

---

### STEP developer-S1 · developer · 2026-07-23T10:03:26Z
**task-id:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY
**what-done:** Extracted drain-signals.js's inline "SKIP non-signal shape" check into a shared `isDrainableShape()` + read-only `--count-drainable` subcommand; both the drain-signals.md MANDATORY PERSIST GUARD and dev-team-tick-preflight.sh Step 5 idle-check now call it instead of a raw `ls docs/signals/*.json | wc -l`.
**what-considered:**
- Reimplement the from/type check in bash/jq inside the preflight script — rejected, task explicitly forbids forking a second predicate definition.
- Only fix drain-signals.md's own guard, leave preflight's idle-check raw-counting — rejected, preflight's own header comment says it mirrors the SAME guard fields, so leaving it raw would keep forcing Step 0a on litter-only ticks (the exact starvation symptom).
- Add `DRAIN_SIGNALS_DIR_OVERRIDE` env seam (mirrors existing `ORCH_APPLY_LIVE_FILE_OVERRIDE` convention) so the preflight's isolated test fixtures reach the shared script without touching live docs/signals/.
**why-decision:** Single source of truth for "is this a routable signal" — script is already the canonical drain implementation per drain-signals.md's own CANON-SCRIPT note; sharing it (not forking) is the only option consistent with that existing precedent and the task's explicit instruction.
**why-change:** Mid-implementation caught a real bug during verification: my first `sed -n 's/.../\+.../p'` extraction used GNU-only `\+` (BRE), which BSD/macOS `sed` silently fails to match — count came back empty on this host, masking the whole fix (idle-check always read 0, always "idle"). Replaced with portable bash parameter-expansion prefix-strip; caught only because I live-verified the guard decision on both fixtures per the task's hard gate, not by trusting green tests alone (the tests I'd hand-written matched the same buggy assumption until re-run against the real macOS sed).

### STEP developer-S2 · developer · 2026-07-23T10:22:58Z
**task-id:** FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN
**what-done:** `_check_launchd_agents()` in `auditor-tier1-probe.sh` now matches the LABEL column exactly (field 3 of `launchctl list`'s tab-separated PID/Status/Label output) then asserts field 2 (Status) == "0"; a present-but-nonzero-status label fails with `<label>(exit-status:<code>)`, distinct from the pre-existing `<label>(not-loaded)` absent case. Obsolete-allow-list `case` skip left byte-identical (PO's explicit do-not-change).
**what-considered:**
- Substring-match the whole `lc_out` blob for the status too — rejected: no reliable way to isolate which line's status belongs to which label without field-splitting, risk of matching a different label's status on partial-string collision.
- awk exact-match on field 3 (label) then read field 2 (status) from the same matched line — chosen: real `launchctl list` (verified live on this host) is tab-delimited 3 columns, PID\tStatus\tLabel; exact-match avoids the old substring-match's false-positive class entirely as a side benefit.
**why-decision:** Only option that answers both "is it loaded" and "is it healthy" from one already-captured `lc_out` read, with zero new external calls, matching PO's generic "exists != works" framing.
**why-change:** No change from plan — PO's mechanism_verified_by_po pointed straight at the discarded status column; live-verified against real `launchctl list` output first (confirmed tab-delimited PID/Status/Label header) before writing the awk field-match, so the fix targets the real format not an assumed one.
**live-verify:** Post-fix live probe run flipped ALL_GREEN→FAILURE (exit 1): 3 of 4 repo-tracked non-obsolete LaunchAgents currently show nonzero last-exit status — `com.vn-market.fleet-push(exit-status:78)` (the PO-confirmed EX_CONFIG case), plus `com.vn-market.docker-events(exit-status:1)` and `com.vn-market.cowork-guaranteed-slot-firer(exit-status:143)`, newly surfaced by this same fix (not investigated/remediated — out of this task's scope, reported not papered over per instruction). `com.vn-market.socat-bridge` correctly absent from the failure list (obsolete allow-list).

### STEP developer-S3 · developer · 2026-07-23T12:30:53Z
**task-id:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE
**what-done:** Added `has_unbacked_sequencing_prose($detail_items)` to `scripts/lib/devteam-eligibility.jq` (board-OR-detail `po_sequencing_*` key present AND `effective_depends_on` empty) as a new conjunct in `is_bounded1_eligible` only; extended `bounded1-supervised-lane-report.sh` with a non-gating TERTIARY section listing every such row; added `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh`.
**what-considered:**
- Regex-mine the prose to extract a predecessor task-id and auto-write `depends_on` — explicitly forbidden by spec (brittle, defeats the shared-library's own fragility-avoidance principle); rejected.
- Wire the new conjunct into SLS/RLC too (they don't call `is_bounded1_eligible`, they compose their own subset) — rejected: root-cause incident was BOUNDED-1-specific (UC-CDC-P5 mis-promote); def lives in the shared file so SLS/RLC CAN adopt it later without recopying, but only BOUNDED-1 actually gates on it now (scope discipline).
**why-decision:** Conservative-skip (withhold, surface via report) is exactly what SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW's design principle demands — one shared def, no forked/regex logic, gate lifts the instant PO encodes the dep.
**why-change:** No change from plan. Live-verified: UC-CDC-P5 (already hand-fixed with `depends_on` 2026-07-22) now evaluates `has_unbacked_sequencing_prose=false, is_bounded1_eligible=false` (still correctly held by pre-existing `deps_satisfied`, not double-gated). Pre-existing sibling verifier's CONTROL assertion fails identically with/without this change (confirmed via `git stash`) — harness bug in `make_isolated_fixture()` not clearing `.task_board.ready[]`, unrelated to this fix, reported not fixed (out of scope).

### STEP developer-S4 · developer · 2026-07-23T18:24:35Z
**task-id:** FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES
**what-done:** Confirmed the bug live at source (prune loop in scripts/agents-flow/drain-signals.js checked ONLY age, never references) — NOT already fixed. Added a referenced-file guard: gather every live task_board.*[].detail_ref (flat lanes + active_sprints/closed_sprints .tasks[]) + signal_queue.rows[].payload_ref from orch-state.json, basename-resolved; SKIP deletion (stderr skip note) if the >7d candidate's basename is in that set. Edited spec §0a-2 first (docs/agents/dev-team/flow/drain-signals.md), then the script, per its own "spec-first" note.
**what-considered:**
- Mirror Stage 1c's checkRefIntegrity() walk (orchStateSchema.ts) exactly vs a new ad-hoc lane list — chose mirroring so the guard's "referenced" definition can never drift from what actually blocks orch-apply.
- Full repo-relative path vs basename-only comparison — chose basename: robust to ROOT/SIG test overrides; live signal filenames are fingerprint/timestamp-unique so cross-directory basename collision is not a real risk here.
- Repoint the dangling ref at prune time (mirror FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE) vs SKIP-only — task explicitly forbids restore-then-reprune; SKIP-only matches the stated fix shape, keeps the change additive.
**why-decision:** One fs.readFileSync + JSON.parse per run (no jq/execFileSync) is the smallest correct guard that closes the exact live incident (drain commit 395e224ad pruning a detail_ref'd file) without touching MOVE-time repoint or the existing age/legacy-mtime cutoff logic.
**why-change:** No change from plan — FIX SHAPE in the task matched implementation directly. Added a 4th test case beyond the 2 requested ACs (no orch-state.json present → guard degrades to age-only prune, fails open not closed) to prove the degradation path live, not just the happy path. 36/36 assertions pass (`node scripts/agents-flow/drain-signals.test.js`).

### STEP developer-S5 · developer · 2026-07-24T15:32:35Z
**task-id:** FACTORY-NEWS-dedup-handlers-maxitems
**what-done:** Added `DEFAULT_MAX_ITEMS`/`resolveMaxItems` to `domain/models.ts` (RED test first in `domain-models.test.ts`, 22/22 pass after); replaced the 4 near-identical POST/GET headline handlers in `interface/handlers.ts` with a `makeHeadlinesHandler(ingest, source)` factory returning `{post, get}`, registered on the same 4 routes. `handlers.ts` 171L→118L.
**what-considered:**
- Only path considered for `resolveMaxItems` signature: accept `number | string | undefined` so ONE function serves both the JSON-body channel (POST, no NaN guard — preserves `typeof x === 'number'` pass-through incl. NaN) and querystring channel (GET, `parseInt`+`isNaN` guard) without collapsing their genuinely different legacy semantics.
- Scope: task FILES list names only handlers.ts + domain/models.ts; left the separately-duplicated 15/10 defaults in `application/use-cases.ts` + 4 scraper files untouched — different call chain, not part of the 4-handler dedup, out of this task's explicit scope.
**why-decision:** Factory has 2 real call sites (Reuters/Bloomberg) so it clears simplicity-gate Q2; response envelope + error branch byte-diffed identical to all 4 originals (verified via `git diff`, not asserted).
**why-change:** No change from plan.
**verify:** `bun test` 241 pass/6 skip/0 fail (baseline 235/6/0, +6 net new = the added DEFAULT_MAX_ITEMS/resolveMaxItems tests). `bun tsc --noEmit` 0 errors. `eslint lint:ci --max-warnings 0` clean. `bun run sandbox --tier=all --module=news-fetch` 16/16 PASS. `grep -inE "DB_|API_KEY|SECRET|TOKEN|PASSWORD|NEWS_API_KEY"` on both changed source files → no matches.

### STEP developer-S6 · developer · 2026-07-24T15:56:54Z
**task-id:** FACTORY-NEWS-go-server-tier-split
**what-done:** Created `apps/news-fetch/internal/httpapi/{router.go,handlers.go}` (`Router(fetchers, s, logger, port)`, moved `handleHealth`/`handleRSSFetch`/`handleFetchAll`/`fetchResult`/`writeJSON` verbatim); `cmd/server/main.go` 254L→138L, now a thin composition root (env reads, `store.Open`, fetcher construction, `Router(...)`, graceful shutdown only).
**what-considered:**
- `Router` signature: added a `port string` 4th arg (task's shorthand `Router(fetchers, store, logger)` didn't account for it) since `/health` now derives its port from this, replacing the old hardcoded `5008` literal.
- Health `port` JSON field type: kept `int` (`strconv.Atoi`) not `string` — `apps/news-fetch/api/openapi.yaml` `/health` schema requires `port: integer`; a string type would silently break the documented contract.
**why-decision:** New `envInt("RSS_MAX_ITEMS", 20)` in main.go replaces both `NewVnEconomyFetcher(nil,20)`/`NewVnExpressFetcher(nil,20)` bare-literal call sites — smallest change removing both named hardcodes without touching `fetcher.go`'s own internal `<=0`→20 default guard.
**why-change:** No change from plan.
**verify:** `go build ./...` / `go vet ./...` clean, `gofmt -l` clean on all 3 touched files, `go test ./...` 2/2 packages pass (fetcher, store; httpapi has no dedicated test file — handlers are pure relocations). RAW-verify: ran the built binary locally (`PORT=15008 RSS_MAX_ITEMS=7`) — `/health` returned `{"port":15008}` (not 5008, proving the derivation), `/vneconomy/fetch`+`/fetch/all` hit live vneconomy.vn/vnexpress.net RSS and persisted 13/7 real rows into `rag_analyses` (confirmed via `sqlite3` query, `source_type='vneconomy'` row inspected), `/newsapi`+`/vps` returned deterministic zero-insert shape (no key/host) — response shape identical to pre-refactor. grep confirms 0 bare `20` (only `const defaultRSSMaxItems = 20`) and 0 literal `5008` in any JSON-building path (only remaining occurrence is the legitimate `envStr("PORT","5008")` fallback default).
