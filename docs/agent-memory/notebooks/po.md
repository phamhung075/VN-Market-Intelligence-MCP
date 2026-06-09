# PO Notebook

## c · 2026-06-09T08:05Z — CI-RED-RECONCILE: C1+C3 residual gate -12 -> close BOTH DONE-as-scoped + rebaseline 172->160 + C4 BACKLOG->TODO (PROD-TOUCHING, isolated) + /goal REMOVE-if-obsolete (po-S27)

**Trigger:** CI-C1C3-RESIDUAL-GATE-a43dff49 (signal -> docs/signals/processed/ci-c1c3-residual-gate-result-a43dff49-20260609T0755Z.json; architect brief docs/architecture-briefs/2026-06-09-ci-172-residual-filescope.md). Router pre-measured + raw-verified native bun summary, raw-verified a43dff49 TEST/META-ONLY (8 .test.ts + 4 meta, ZERO prod src), bundled push e920dc6d->a43dff49 = ONE CI run 27191715572 / bun job 80273289808. PO owns board; router owns push+gate. DJ-GATE-1.

**Gate (router-verified, native-to-native ONLY):** prior 172 (run 27189745293, sha 7bea53d0, 0 err) -> NEW **160** (11615 pass / 42 skip / 160 fail / **0 err** / Ran 11817, sha a43dff49, run 27191715572, job 80273289808). NET **-12**, no regression. CI conclusion stays `failure` (160!=0, RED-until-0); verification gate MET. **172 SUPERSEDED by 160.**

**KEY CALL — DONE-AS-SCOPED again (same as po-S25):** projected ~62, actual -12. 5 of 9 C1 files (028/025/1423a/1487/1833l) were ALREADY GREEN (transient, pre-absorbed by upstream Cluster-1 mock-contam fix). 4 real C1 fixed (VN-vs-vietnam key, getText JSON-envelope .split, stale cron, unmocked FRED). C3: 4 destroyers fixed (FK-safe delete + InMemoryTransport afterEach close). Residual same-pattern OUT-of-named-scope -> long-tail re-profile, NOT a charge-back to closed ids.

**NEW this round — C4 is FIRST prod-touching:** architect ruling (a) delivered (prod-emits-diacritics) -> SPIKE-CI-C4 BACKLOG->TODO, owner architect->dev-mcp-server, type SPIKE->FIX, prod_touching+isolated_push=true. MUST be its OWN commit + OWN CI run + careful verify (test-only-vs-prod separation). Path A = QUE_DATA local formatting, no Go service.

**GOAL refinement recorded:** /goal 'ci/di all passe on GitHub, test update (remove if obsolete)'. Obsolete tests (deleted seams / reuters.js / pre-98df0f43 macro headers / stale cron) must be DELETED not patched. Folded into new sprint-level long_tail_triage_policy object (classify each bucket REWRITE vs REMOVE) + C4 gate/note.

**Board edits (1 atomic jq pass `scripts/po-s27-c1c3-residual-gate.jq`, commit-mutex held):**
- FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS + FIX-CI-C3-RESIDUAL-DB-DESTROYERS (active_sprints[24].tasks): REVIEW->DONE (+resolution DONE-as-scoped +closed/done/done_by/actual_result). Single status key each.
- SPIKE-CI-C4-KINH-DICH-DIACRITICS: BACKLOG->TODO (+owner dev-mcp-server +type FIX +prod_touching +isolated_push +baseline 160 +gate +note). Single status key.
- ci_absolute 172->160 (172 SUPERSEDED); +long_tail_triage_policy (REWRITE-vs-REMOVE); ._updated_by=po-S27. Cluster-6 schema-drift PARKED.

**SSOT discipline:** sprint .tasks 29 unchanged (in-place flips, NO add/remove). Single status key (=1) on all 3 rows (paths(scalars) check). signal_queue.rows preserved EXACTLY 57. Temp validated [ -s ] && jq -e . && size>600000 (739761) BEFORE mv. commit-mutex (task_kind:commit-mutex owner:po) held + released. _schema=v3 _ssot=true. WIP in_progress=1 (<=2). NOT pushed.

**LESSON:** SUPERSET-cluster under-scope recurs — accept DONE-as-scoped + track forward, never re-open. First prod-touching round demands ISOLATED push so a prod regression can't hide behind a test-only delta. /goal now classifies residuals REWRITE vs REMOVE — delete obsolete tests, don't patch them green.

## Carry-over
- ROUTER OWNS: push (po.md + journal + orch-state.json + scripts/po-s27 helper + archived signal move, commit SHA in return, ahead of origin) + dispatch SPIKE-CI-C4-KINH-DICH-DIACRITICS to dev-mcp-server as an ISOLATED round (own commit + own CI run, careful verify; Path A QUE_DATA, REMOVE-if-obsolete lens).
- Next CI gate (router): native fail+error must DROP vs the NEW **160** absolute (sha a43dff49). Native-to-native only (marker over-counts ~2x). After C4, re-profile residual ~160 with the REWRITE-vs-REMOVE lens. Continue until 0 (/goal ci/di all passe).
- Cluster-6 schema-drift PARKED (no further touch).
