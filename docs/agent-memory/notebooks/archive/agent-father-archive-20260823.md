# Agent Father — Notebook Archive 2026-08-23

Split out of `docs/agent-memory/notebooks/agent-father.md` on 2026-08-23 (self-prune: 188L/16787B, line cap 200L, byte cap 12000B breached). Nothing deleted — full record here and in git history. Same convention as `agent-father-archive-20260812.md`.

---

## FIX 2026-08-23T09:30Z — FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded, P0 CI-red fix
- Added 1 Pipeline-B routing row (`bctc_image_fetch_degraded`) to `docs/agents/po/flow/triage-signals-longtail.md` — mcp-server `push_bctc_refined_unit`/`bctcImageFetchDegradedSignalWriter.ts`, dedup on `dedup_key`, mint FIX zone `cross-service/` next_agent `developer`. Placed in the longtail sibling (single-fire-so-far type, matches existing `bctc-data-quality-anomaly` precedent), not the hot-path main table.
- Guard `guard-signal-type-coverage.sh --check`: FAIL (`unrouted Pipeline-B to=po types: ["bctc_image_fetch_degraded"]`) → PASS, reproduced. Paired suite: 23/24 → 24/24, reproduced once (TEST10 live-files smoke).
- Committed `a309c9334` (file alone, pushed clean to origin/main, no rebase). Board write via `orch-apply.sh` moved the FIX row `backlog[]→review[]` (`next_agent: qa`; `ci_green_on_subsequent_push` gate not yet independently observed) — lands UNCOMMITTED, `docs/data/orch/orch-state.json` is outside agent-father's commit zone (FU-AGENT-FATHER-ORCH-SCOPE).
- **Not fixed here (flagged, out of scope):** a genuinely new, unrelated Pipeline-A type `cowork-fire` appeared live mid-task and re-trips the guard/TEST10 post-fix — different pipeline, different subject, no claim held. Guard's own self-filing fallback already auto-tracked it (`FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire`, backlog, owner po). Needs its own fresh triage/dispatch, not folded into this task.

## FIX 2026-08-23T09:45Z — cowork-team Step 4.7 + 5.3 doc-truth pair (2 P3 rows)

- 4.7 `tick-snapshot.md`: "pure bash cannot call MCP" false since `mcp-call.sh` f7d34918d
  2026-07-02 (row said 07-30 = mtime). Folded in-fence; ran verbatim, 20199B vs 20190B ref.
- 5.3 `spawn-fanout.md`: surface contract + provenance fix + fail-open negative control +
  >=2-distinct-marker threshold. `.output` = 187B symlink → 246939B transcript; the 1515B
  dispatcher-authored prompt ALONE scores 6/6.
- **LESSON: a detector whose markers come from its own prompt is not exogenous — grep
  `docs/signals/` before calling one fixed.** That grep found an unprocessed 2026-07-30
  signal: a 3rd FP, 1/6 on a disclaimer, on the CORRECT surface — scoping alone misses it.
- Out of zone → agents-architect: caps pattern `docs/agents/*/flow/**/*.md` matches nothing
  (bash `case` `**`==`*`); 173 flow files ungoverned. Rows NOT flipped (orch-state).

