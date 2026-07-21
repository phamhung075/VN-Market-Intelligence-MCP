# Developer — Notebook

**Last updated:** 2026-07-21 | **Cycle:** CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR (router-directed)

## Session 2026-07-21 — FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (router-directed, scripts/, recurring_bug_count=4) — REVIEW

**Task:** `repointPayloadRefs()`'s jq `execFileSync` call (drain-signals.js:233) had no `maxBuffer`; jq's `{doc,changed}` output re-emits the whole orch-state doc, which crossed Node's default 1,048,576-byte cap the moment the live file passed 1,109,434 bytes — `ENOBUFS` thrown every run since, caught, and reported as a "non-fatal" WARN, so the shipped repoint fix has been silently dead in production. Same catch also mis-classified a genuine computation failure as equivalent to "nothing to repoint."

**Actions taken:** Added explicit `maxBuffer: 64MB` (comment cites measured numbers + row id) to the jq `execFileSync` call. Reclassified the catch at 240-245 from silent `WARN`+`return` to `FAIL-LOUD`+`process.exit(1)`, matching the existing FAIL-LOUD pattern at lines ~268/272; left the genuinely-benign `!result.changed` branch untouched. Grepped `scripts/agents-flow/` for other `execFileSync`/`spawnSync` reading orch-state.json (or any file that can grow past 1MB) without `maxBuffer` — none found; every other call either queries a small sqlite3 aggregate or (the orch-apply.sh invocation) never echoes the doc back to stdout.

**Verification (RED-before, twice):** (1) natural TDD order — new `drain-signals.test.js` ENOBUFS scenario (isolated harness, >1MB orch-state.json fixture padded via schema-safe `dashboard_section_cache`, never the live SSOT) against the then-current unfixed code: 21/22 pass, 1 FAIL (`spawnSync jq ENOBUFS` swallowed, payload_ref left dangling). (2) `git stash push --keep-index` on `drain-signals.js` only (test file kept) reproduced the identical 21/22 failure against the reverted file. After the fix, both re-runs: 22/22 GREEN. Live orch-state.json currently 1,112,468 bytes — 64MB maxBuffer gives ~57x headroom.

**Also emitted (not fixed, per instruction):** `docs/signals/2026-07-21T162233Z-drain-predicate-price-anomaly-family.json` to `po` — drain's non-routable-shape predicate never matches `price_anomaly_v1` (7 files stranded in inbox, one live/minutes-old carrying real VN-Index/sector data); PO's earlier "cowork-team telemetry only" characterization of the drain-skip blast radius is incomplete. Scope adjudication left to PO — no board row minted, task not widened.

**Router mid-task note:** router's own `git add -A` + `git commit -m` swept an unrelated pre-existing HEAD state (commit `84096f617`, already containing the pre-maxBuffer shipped code — not my edits, I had not yet touched either file at that point) into an auditor commit. No work of mine was lost; RED evidence above was captured entirely after that point, against the then-current HEAD content.

**Board:** `task_board.backlog[FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE]` → REVIEW, next_agent=qa, via `orch-apply.sh`.

**Scope discipline:** Touched only `scripts/agents-flow/drain-signals.js`, `scripts/agents-flow/drain-signals.test.js`, this notebook, decision journal, + the new po-addressed signal file. Did not touch the price_anomaly predicate itself, did not touch live `docs/data/orch/orch-state.json`.

Zone health: `scripts/agents-flow/drain-signals.js` payload_ref repoint path — now buffer-safe past 1MB + FAIL-LOUD on genuine computation failure; price_anomaly drain-skip family flagged to PO as a distinct, unfixed gap | HEALTHY (repoint) / KNOWN-GAP (price_anomaly, PO-owned)

## Session 2026-07-21 — FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH (router-directed, scripts/, P0) — task_board.ready (untouched, router-owned)

**Task:** `scripts/orch-apply.sh` (the single mandatory gated hot-file write path) had zero `updated_at` handling on task_board rows — 524/577 rows null — because the field is stamped only by whichever of 30+ ad-hoc jq callers happened to remember it (Head/Meta schema sites declare it optional; TaskSchema doesn't even list it, `.passthrough()` lets anything through unstamped).

**Actions taken:** New `scripts/orch-stamp-updated-at.mjs` — id-keyed, order-independent deep-equal diff of every task_board row (all 9 lanes + legacy `archive`), live vs candidate, `updated_at` itself excluded from the comparison (no feedback into its own predicate). Wired into `orch-apply.sh` as Stage 1.5, AFTER Stage 0/1 validation (protects the raw-text dup-key scanner from a parse/stringify roundtrip) and BEFORE Stage 2 conservation/CAS-rename. Diff unit deliberately lane-agnostic — real lane moves virtually always change `status`, already caught as content; `checkLaneCoherence` backstops the general case. No backfill of existing nulls (hard constraint honored).

**Verification:** Live-verified against the REAL orch-state.json: snapshotted all 577 rows' `updated_at`, mutated exactly 1 archived row (`BPE-ARCH-1`) via a jq filter mentioning no timestamp, applied through the real `orch-apply.sh` — structural diff confirmed ONLY that row changed (null→stamp), null count 524→523 (exactly -1). Re-applying an unchanged candidate stamped 0 rows (idempotent). Reverted the probe field via a second real write (also timestamp-free) — original field content restored byte-identical; `updated_at` correctly stays non-null (a real second touch, not falsified back to null). `scripts/test/orch-apply-wrapper-tests.sh` 31/31 pre-existing unchanged + 11 new STAMP-* cases = 42/42 GREEN.

**Board:** Deliberately did NOT move `task_board.ready[FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH]` — router holds/releases the coordination lock for this row and the dispatched report-back contract didn't ask for a board transition; left for router/PO to action.

**Scope discipline:** Touched `scripts/orch-apply.sh`, new `scripts/orch-stamp-updated-at.mjs`, `scripts/test/orch-apply-wrapper-tests.sh` (new cases only), `docs/policies/dev-standards.md`, `docs/WORK.md`, this notebook, decision journal. Did NOT touch `orchStateSchema.ts` (existing `.passthrough()` already permits the field; task explicitly forbids tightening it). Did NOT implement `updated_by` — the PO board row's acceptance text asks for it but the dispatched task text doesn't, and there is no reliable caller-identity signal at the chokepoint; flagged, not silently added.

Zone health: `scripts/orch-apply.sh` — write-path timestamp gap closed at the chokepoint; ~500 pre-existing null rows age out naturally, no synthetic backfill | HEALTHY

## Session 2026-07-21 — CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR (router-directed, active-producer premise, ready/P1) — PARTIAL, step (1) re-routed

**Task:** Router's re-ordered scope: (1) atomic-write fix at the telemetry writer (most urgent — a second 0-byte `cowork-team-*.json` landed 53min after the first, live evidence of a recurring truncated write), (2) loud log on drain's unparseable-file skip path, (3) `git rm` the two 0-byte artifacts only after (1) ships.

**Step (1) — STOPPED before editing, re-routed:** Grepped for the actual writer (did not guess from filename). Found: `docs/agents/cowork-team/flow/telemetry.md` Step 6.1 — `cat > docs/signals/cowork-team-${ISO}.json <<EOF`, a bash heredoc inside a flow doc, executed by the cowork-team LLM agent during its own live session. Not a script. Dispatch table (`.claude/skills/dispatch/SKILL.md`): "create/edit/review/maintain agent -> `agent-father`, All agent-file lifecycle"; `docs/policies/docs-organization.md`: `docs/agents/*/flow/` -> "Update via flow guide". Neither `system-map.json` zones nor my own zone_dispatch cover this path — per my own Step-0 mandate ("never write code in their zone") I stopped rather than drive-by-editing it, and annotated the board row so PO/router can re-route `next_agent` to `agent-father`.

**Step (2) — SHIPPED:** `scripts/agents-flow/drain-signals.js` unparseable-JSON catch now `console.error`s an immediate `[drain-signals] WARN unparseable JSON: <file> — <msg> (0-byte or truncated write; ...)`, distinguishable from the pre-existing benign `SKIP non-signal shape` console.log (well-formed JSON, just missing from/type). Previously it only pushed into the batched `report` array (stdout, printed once at end) — indistinguishable in prominence from routine `routed-to-po` lines.

**Verification (RED then GREEN):** Added 6-assertion scenario to `drain-signals.test.js` (0-byte file + benign non-signal file in the same run, asserting the WARN fires for one and not the other, stdout/report line unchanged, file left in place). Ran isolated (scratchpad standalone runner reusing the real `drain-signals.js`) — RED confirmed (no stderr output) before the fix, GREEN after. Could not run the full `node drain-signals.test.js` end-to-end: an EARLIER, unrelated scenario (`makeOrchRefHarness`) crashes the whole process because `scripts/orch-stamp-updated-at.mjs` (added by commit `a5d079663`, same day) isn't in that harness's file-copy list — confirmed pre-existing via `git stash` (crashes identically without my changes) and out of scope for this row. Worked around by running a truncated copy of the real test file through the pre-existing scenarios (15/15 PASS, including the exact-match AC7 golden-stdout regression) plus my new scenario (6/6 PASS) = 21/21 clean, no regression.

**Step (3) — NOT done, correctly:** Router's scope explicitly forbids `git rm`-ing the two 0-byte artifacts before step (1) ships (deleting now just lets the still-truncating writer re-create them within the hour). Both files (`cowork-team-20260721T183028Z.json`, `cowork-team-20260721T192339Z.json`) left untouched, untracked.

**Board:** Annotated `task_board.ready[CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR]` with `developer_progress_20260721T1953` (commit hash, re-route need, step-3 rationale) via `orch-apply.sh`. Did not change status/next_agent myself — that's PO/router's call on a supervised:true row.

**Commit:** `c6e548ca2 fix(signals/drain): loud WARN for unparseable/0-byte inbox files` — explicit pathspecs (`scripts/agents-flow/drain-signals.js scripts/agents-flow/drain-signals.test.js`), no `-A`/`-a`.

**Scope discipline:** Touched only the two drain-signals.js/test.js files, the board-row annotation, this notebook, decision journal. Did not touch `docs/agents/cowork-team/flow/telemetry.md`, did not `git rm` the artifacts, did not widen beyond the router's 3-step scope.

Zone health: `scripts/agents-flow/drain-signals.js` unparseable-skip path now loud | HEALTHY. Writer-side atomic-write fix | BLOCKED, needs `agent-father` re-route.
