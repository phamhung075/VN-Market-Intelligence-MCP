# Decision Journal — Sprint TOKEN-ECONOMY-AUDIT · developer

**Sprint goal:** no goal set (task dispatched outside sprint scope — standalone FIX row)
**Agent:** developer
**Started:** 2026-07-12T07:20:00Z

---

### STEP developer-S1 · developer · 2026-07-12T07:40:00Z
**task-id:** FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH
**what-done:** Widened `scripts/agents-flow/notebook-auto-prune.sh`'s timestamp regex to one ERE with optional dash/colon separators (`[0-9]{4}-?[0-9]{2}-?[0-9]{2}(T[0-9]{2}:?[0-9]{2}(:?[0-9]{2}(\.[0-9]+)?)?Z)?`) covering compact (`cycle-YYYYMMDDTHHMMZ`, main.md), dashed-no-seconds (`Tick YYYY-MM-DDTHH:MMZ`, po.md), dashed-with-seconds/ms suffix (bctc-analyst.md/system-auditor.md), and date-only (qa.md) — all real live formats surveyed across every file in `docs/agent-memory/notebooks/*.md`. Matched substring normalized (digits-only, zero-padded/truncated to 17 chars = YYYYMMDDHHMMSSfff) into a pure-numeric sort key so mixed-precision formats compare correctly; `sort -t: -k2,2 -s` (was unbounded `-k2`, which silently fell through to full-line — i.e. alphabetical heading-text — comparison whenever timestamps tied, including every sentinel-tied no-timestamp entry).
**what-considered:**
- Multiple separate `grep -oE` patterns tried in fallback order vs one combined ERE with optional separators — chose the single combined ERE: simpler, avoids POSIX ERE alternation leftmost-longest ambiguity across `grep` implementations (BSD vs GNU), and one pattern naturally handles the "digits present regardless of separator" property all these formats share.
- Digit-strip + fixed-width right-pad normalization vs full capture-group parsing (year/month/day/hour/... individually) — chose digit-strip: `grep -oE` doesn't expose capture groups portably without `-P` (GNU-only, unavailable on BSD/macOS grep), and the raw digit sequence is already left-anchored in chronological order for every format found, so right-padding missing trailing fields with `0` is semantically correct (missing seconds/ms = :00/.000) without needing per-field parsing.
**why-decision:** Live-verified via direct `grep -oE` probes (documented in task) that the OLD regex returns EMPTY on main.md's real compact format (unambiguous hard bug) and silently degrades po.md's dashed-no-seconds format to date-only granularity (silent precision loss, not a hard failure but still wrong). The new regex was validated against all 10 real heading shapes surveyed live across every notebook file before implementation, not just the 2 named in the AC.
**why-change:** No change from plan — regex-widening was the acceptance criterion.

---

### STEP developer-S2 · developer · 2026-07-12T07:41:00Z
**task-id:** FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH
**what-done:** Investigated AC item 3 (duplicate-heading reentrancy). Code-audited the drop-oldest while-loop: every mutation path (`head -n X`, `awk 'NR<drop_from||NR>drop_to'`) can only REMOVE lines from `FILE_CONTENT` — there is no code path capable of duplicating one. Cross-checked against git archaeology of the actual incident (commit `3e83f4846`, parent `3e83f4846^`): both real duplicate-heading pairs found in `main.md` existed inside a 196-line file, i.e. UNDER this hook's 200L guard (line ~112 short-circuits at ≤200L before any section parsing) — the hook literally never touched the file at that size. A SECOND, independent live occurrence of the identical bug (heading `cycle-20260712T0607Z + 0637Z` duplicated back-to-back) was found live in `main.md` at task start (referenced by the notebook's own text as this task's origin), again in a sub-200L file. **Conclusion: the mechanism is NOT in this hook.** Root-caused instead to `docs/agents/dev-team/flow/post-cycle.md` Step 4.5 ("Compact Checkpoint"), which writes `main.md` via a bare 1-line "Write docs/agent-memory/notebooks/main.md" instruction with none of `.claude/skills/notebook-write/SKILL.md` AC-3's compose-in-memory-then-single-settled-write discipline (which explicitly forbids the "2-Edit sequence" failure mode this incident matches). Filed follow-up signal `docs/signals/developer-2026-07-12T073316Z-main-notebook-writepath-missing-ac3.json` (to: po) rather than editing post-cycle.md inline (outside `scripts/agents-flow/` zone).
**what-considered:**
- Auto-fix duplicates by collapsing them during pruning vs detection-only signal — chose detection-only: this hook did not create the corruption and cannot reliably distinguish "accidental duplicate" from "intentionally repeated heading text" without more context; auto-collapsing risks silently deleting legitimately-repeated content. A non-destructive tripwire (pre-cap scan on every invocation, since duplicates were proven to survive under-cap; plus a post-prune re-check) that emits `notebook_duplicate_heading_detected` for human/PO review is the safe layer given root cause lives upstream.
- Editing `docs/agents/dev-team/flow/post-cycle.md` directly vs filing a signal — chose signal: task zone is `cross-service/` → `scripts/`, and `scripts/` maps to `developer` per `system-map.json`, but `docs/agents/dev-team/` is a different doc area with no zone claim here; filing keeps the fix scoped and lets PO route the real owner.
**why-decision:** Behavioral proof (old-script-vs-new-script comparison on a real+synthetic mixed fixture: an evergreen `## Known patterns / preferences` section competing against real timestamped `cycle-*` sections) showed the OLD regex's alphabetical-tiebreak fallback actively picked the WRONG section to drop (the evergreen section, due to ASCII uppercase-before-lowercase ordering) while the NEW code correctly drops the true chronological oldest — objective evidence the widened regex + `-k2,2`/`-s` sort fix is a real behavioral improvement, independent of the duplicate-heading investigation.
**why-change:** Original bug report speculated "reentrancy/off-by-one in the while-loop's line-number bookkeeping" as the duplicate mechanism — investigation disproved this specific hypothesis (loop recomputes line numbers fresh every iteration, no staleness found) and identified the actual upstream mechanism instead. Guard added anyway per task's "add if you find the mechanism" — added as defense-in-depth even though the mechanism lives outside this script.

---

### STEP developer-S3 · developer · 2026-07-12T07:42:00Z
**task-id:** FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH
**what-done:** Extended `scripts/agents-flow/test-notebook-auto-prune.sh` with 3 new cases (5 total, was 2): Test 3 (compact `cycle-YYYYMMDDTHHMMZ`, mirrors main.md, prepend-style, 212L→179L), Test 4 (dashed-no-seconds `Tick YYYY-MM-DDTHH:MMZ`, mirrors po.md, prepend-style, 212L→179L), Test 5 (duplicate-heading tripwire: asserts file content byte-identical before/after — detection-only — and a signal file is emitted). All 5 GREEN. Confirmed Test 3/4 are genuine regressions (not false-green) by running the OLD (pre-fix, `git show HEAD:...`) script against the same fixtures where feasible, and via the evergreen-vs-cycle mixed fixture in S2 which unambiguously fails under old code and passes under new code.
**VERIFICATION GATE (AC-4, live-run, not synthetic-only):** Built a fixture from the ACTUAL current `main.md` (git HEAD content, real compact headings) + the real historical `cycle-20260710T0407Z` section reinstated verbatim from `git show 3e83f4846^` (207 real lines, >200L, includes a real duplicate-heading pair inherited from that historical snapshot). Ran the ACTUAL fixed hook script (not a reimplementation) against this scratch copy. Confirmed by direct `grep -n "^## "` + `wc -l` + a standalone dup-scan awk one-liner (own eyes, not agent self-report): oldest section (`cycle-20260710T0407Z`) correctly dropped, newest (`cycle-20260712T0707Z`) retained, final line count 177 (≤200), zero duplicate `## ` headings anywhere in output, pre-cap duplicate tripwire correctly fired and emitted a signal for the inherited historical duplicate. Also found and manually deduped a SECOND, independent live duplicate-heading occurrence actively present in the real (not scratch) `docs/agent-memory/notebooks/main.md` at task start (same bug class, unrelated to my fixture) — confirms this is a genuinely live, ongoing corruption, not a historical one-off.
**what-considered:**
- Trusting the 5/5 synthetic-test GREEN alone vs mandatory live-run against real data — task explicitly required the latter (that's exactly how the prior `e24e6b8b6` fix false-passed); did both, and the live-run additionally surfaced a live, currently-active duplicate in the real repo that the synthetic tests alone would never have found.
**why-decision:** Direct behavioral evidence beats agent self-report per standing project convention (raw-verify, not badge-trust).
**why-change:** No change from plan.

---

### STEP developer-S4 · developer · 2026-07-13T10:55:00Z
**task-id:** TE-T04
**what-done:** Deleted `## Example Invocation` (100-170L) from all 6 packages (market-watcher/news-scout/alert-commander/unified-agent/qa-responder/digest-predict), replaced each with the brief's exact 1-line pointer to `tools/list/<tool_name>.md`.
**what-considered:**
- Per-package generic pointer (matches existing L22 "How to Invoke" line style) vs enumerating every referenced tool per package — chose generic: brief's own proposal text is generic, DoD says "ONE pointer line", enumerating would duplicate example bodies by proxy.
- Fixing the WRONG `tickers` example in-place vs deleting it — chose deletion: whole section removed per DoD item 1; verified `tools/list/get_price_history.md` already correct (`code: string`), so no separate fix commit needed.
**why-decision:** Row-count diff (`grep -c "| \`"`) proved tool tables byte-identical pre/post for all 6 files — satisfies "keep tool tables intact" with objective evidence, not self-report.
**why-change:** No change from plan.

---

### STEP developer-S5 · developer · 2026-07-13T11:24:50Z
**task-id:** TE-T07
**what-done:** Split `.claude/skills/cron-detect-loop/SKILL.md` (196L->51L): kept frontmatter + Step 1 idempotency guard + Step 3 verify; moved "Why this skill exists", SSOT/divergence note, Job 1-4 CronCreate bodies (+inline notes), and P3-OBSERVE-ONLY-RETIREMENT verbatim to new `register.md` (156L), pointed to from Step 1's missing-entry branch.
**what-considered:**
- Rewording the divergence commentary while moving it vs verbatim relocation — chose verbatim: hard constraint is prose reorg only, and brief's own precedent (T-02) requires "relocated, not deleted."
- Collapsing the SSOT-note + Step-2-intro duplication into one paragraph vs keeping both as-authored — kept both verbatim to avoid any risk of altering register-body meaning; only new content added is the SKILL.md pointer sentence itself.
**why-decision:** `diff`+`md5` on the extracted CronCreate blocks (all 4) and the full Step 2/P3 sections between git HEAD SKILL.md and new register.md returned zero diff — objective byte-identity proof, not self-report.
**why-change:** No change from plan.

---

### STEP developer-S6 · developer · 2026-07-13T11:57:52Z
**task-id:** TE-T09/TE-T09b
**what-done:** Split `docs/agents/po/flow/main.md` (274L/69,513B -> 158L/9,443B): relocated the "Reusable triage scripts" registry (44L, po-s50..po-s142) verbatim to `po/flow/scripts-registry.md`, and the never-firing Step PUSH-BACKSTOP body (80L, superseded by launchd fleet-push timer) verbatim to `po/flow/push-backstop.md`. main.md keeps the orch-apply.sh write invariant inline + one pointer per sub-doc; corrected line-1 size-justification (was drifted at 229L pre-edit, true was 274L).
**what-considered:**
- Literal "line 225 through EOF" per brief vs actual section boundary — brief's own EOF read was imprecise: lines 269-274 (Doc self-heal + Skills-available lazy-load list) are separate always-loaded boilerplate, NOT registry entries; moving them would be a behavioral regression (breaks every-cycle doc-self-heal). Chose true boundary (225-268), verified zero per-script-entry loss.
**why-decision:** `diff`+`md5` of both extracted blocks against `git show HEAD:...main.md` (independent of my own scratch copies) returned zero-diff for both relocations — objective byte-identity, not self-report.
**why-change:** Boundary correction above; no other change from plan.

---

### STEP developer-S7 · developer · 2026-07-13T12:30:00Z
**task-id:** TE-T10
**what-done:** Deduped '## How to Invoke Tools' (17L) + 'log_agent_work Two-Call Recipe' (~30L) boilerplate across 11 `docs/agents/tools/package/*.md` files, replaced with a 1-line grammar pointer (CLAUDE.md § MCP Tools) and a 1-line lifecycle pointer (`tools/list/log_agent_work.md`); fixed `agent-father/flow/scaffold-files.md` Step 7 to scaffold the lean format so new packages don't regress.
**what-considered:**
- Task's literal "grep both return exactly 11, use intersection" instruction vs actual repo state — the two greps DID each return 11 but DIFFERENT files (`ops.md` has only the invoke-block, `po.md` has only the recipe-block, no heading overlap); used the brief's own explicit T-10 "Files:" list (11 named packages, matches the recipe-grep set exactly) as authoritative over the mis-assumed identical-intersection premise, leaving `ops.md` untouched (out of brief scope) and applying only the recipe-edit to `po.md` (no invoke-block present there to replace).
- Keeping the '## How to Invoke Tools' heading with a shrunk body vs deleting the heading text entirely — switched to full deletion after checking the task's own success criterion ("grep -l counts should drop 11->0 for both markers"), which requires the heading string itself to disappear, not just its body.
**why-decision:** Objective grep re-run after edit confirms 0 hits for both markers across the 11 in-scope files (ops.md correctly still shows the marker, out of scope); log_agent_work.md (SSOT pointer target) independently confirmed to cover session-start + id round-trip + completed/error end for all 11 agent names before deleting any recipe block.
**why-change:** File-set correction (po.md in, ops.md out — 12-file total unchanged) + full heading-deletion correction from an initial partial-shrink pass; no change to the 3 substantive edits (grammar pointer / recipe pointer / scaffold template fix).

---

### STEP developer-S8 · developer · 2026-07-13T13:05:00Z
**task-id:** TE-T13
**what-done:** Trimmed the line-1 size-justification marker on the 6 hottest flow files to ≤300 chars, current-shape-only (deleted dated changelog entries — each already a commit message), and added a cap rule (Q-3) to `.claude/skills/agent-md-factory/SKILL.md`. Before→after line-1 char counts (`head -1 | wc -c`, includes trailing newline): `dev-team/flow/main.md` 4199→247, `system-auditor/flow/main.md` 2435→227, `fb-market-poster/flow/main.md` 1701→222, `market-watcher/flow/cycle.md` 1211→266, `unified-agent/flow/chef.md` 1165→264, `cowork-team/flow/main.md` 1107→268. All ≤301 (300 chars + newline).
**what-considered:**
- Deleting the marker entirely vs rewriting it — chose rewrite: the governance rule (Q-3 in agent-md-factory) requires flow `main.md` files >120L to carry a justification; blanking it would fail that gate. Kept one sentence per file stating current-size drivers (dispatcher-thin + sub-flow extraction / tier split deferred / 3-mode coupling / step-by-step coupling / atomic recipe framework), dropped all dated FIX-*/TASK_*/sprint entries.
- Editing `dev-team/flow/main.md` and `cowork-team/flow/main.md` (live dispatcher flows, one of them mid-cron-cycle) — verified via `git diff` that each produces exactly one `@@ -1,4 +1,4 @@` hunk (1 insertion/1 deletion, line 1 only); zero Step/anchor/`jump:` text touched, so no behavioral risk despite the files being hot.
- Where to add the factory cap — added as a new Q-3 bullet (size-cap check section, already the home of the existing `>120L` justification-presence rule) rather than a new Pre-Edit checklist item, since this is a post-edit content-shape rule for a marker already required by the pre-existing Q-3 check.
**why-decision:** Per-file `git diff --stat` + `grep -E "^@@"` confirmed single-hunk (`1 file changed, 1 insertion(+), 1 deletion(-)`, `@@ -1,4 +1,4 @@`) for all 6 flow files before commit — objective proof of line-1-only scope, not self-report. `head -1 | wc -c` re-verified ≤301 on all 6 post-edit.
**why-change:** No change from plan.
