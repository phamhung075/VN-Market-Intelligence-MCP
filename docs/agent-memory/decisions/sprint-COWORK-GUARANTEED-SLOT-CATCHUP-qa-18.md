# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-12T09:37:23Z

---

### STEP qa-S78 · qa · 2026-08-12T09:37:23Z
**task-id:** FACTORY-APP-split-pollNews
**what-done:** Direct-Commit Verify — commit `0f23a703f` on main ancestry, touches all 8 files it claims (pollNews.ts + 5 new pollNews/ siblings + usecases.md + size-lint-baseline.json).
**what-considered:**
- Read diff/source myself: 5 helper clusters genuinely extracted, zero-external-call-site claim confirmed by grep (all consumer imports still resolve from pollNews.ts unchanged); dropped defaultTradingEconomicsFetcher confirmed zero remaining call sites. tsc clean, size-lint-justification.sh --check clean (only pre-existing untouched transport.ts fails), mock-guard PASS, DDD/security greps clean. Re-ran all 21 pollNews-touching test files myself in isolation: 109/109 pass (2 flake only under batch contention, isolated-pass confirms pre-existing, matches commit's own claim).
- BUT backlog DoD/approach (archive/backlog-detail.json) names 5 DIFFERENT target modules — insiderSignalDetector(→domain/), sourceFetchers, sourceHealth, ingestEntries, buildSignals — i.e. extraction of pollNews()'s own pipeline STAGES, target "~120L thin orchestrator", "each module <=120L". Delivered: pollNews.ts still 923L; the ~790L pipeline body itself untouched, only peripheral clusters (types/detectors/dedup/fetcher-impls/db-helpers) moved, 4/5 new files already exceed 120L (justified headers). Same-epic sibling FACTORY-APP-split-assembleBriefing hit its thin <=120L DoD fully in one commit (72L sequencer) — direct precedent this task falls far short of.
**why-decision:** vc-changes — execution is honest/regression-free (commit message itself discloses the gap) but DoD substantively unmet: the core goal never attempted, only a peripheral split landed. Routed qa[]->review[], redispatch_count=1, next_agent=owner dev-mcp-server (no task branch, per verify-committed convention) to continue the "one extraction per commit" ladder toward the actual pipeline-stage split.
**why-change:** none — I did not discover new facts beyond what the commit already discloses; declined to accept a self-labelled-partial commit as terminal DONE_VERIFIED against its own backlog DoD.
