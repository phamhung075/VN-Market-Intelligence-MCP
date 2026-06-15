# PO Notebook

## 2026-06-15T00:31Z — TRIAGE tick — ACCURACY-PAIR promoted (serialized)
Reliability layer DONE (F-MACRO-FETCH-DEADLINE + VMT-8 done_verified, ce4b46f0). Accuracy
follow-ons unblocked. Promoted both backlog→ready, SERIALIZED (same owner dev-macro-indicators /
zone apps/macro-indicators/, WIP≤2, no file conflict):
- **[1] F-BOP-ENCODING** (S, no-recon, FIRST, seq=null) — URL-encode SBV Liferay OData filter
  spaces in usecases_vmt_bop.go. bop degrade "context deadline exceeded" = FetchBudgetSec=8s
  bound firing on a malformed un-encoded filter. Quick accuracy win — dispatch first.
- **[2] F-NSO-SELECTOR** (S, RECON-FIRST, seq=F-BOP-ENCODING) — STEP1 ops-vps-fetch recons NEW
  NSO WordPress HTML (index fetches ~85KB → proxy UP, pure accuracy gap, NOT proxy-down);
  STEP2 dev-macro-indicators implements new selector in cache_vmt_nso.go + parsers. Recon-first
  so dev isn't idle while structure is scoped.
Both rebase 94b49f44. head → next_agent=dev-team (active=F-BOP-ENCODING). Idempotent promote via
`scripts/po-s54-macro-accuracy-pair-promote.jq` (atomic temp→[ -s ]→jq empty→rename; ready 1→3,
backlog 172→170). Committed orch-state + script by EXPLICIT PATH (c75398a3) — other dirty files
(fb-poster/unified-agent notebooks, tool-usage-stats, 07-06 brief) NOT swept.

**RECONCILE TRAP hit:** spawn-context said next_agent=po/awaiting-triage, but LIVE committed head
= BA-VN-MACRO-TOOLING/next_agent=ba @ stale 2026-06-14T18:36:18Z. ce4b46f0's diff SHOWED head→po
but its committed net REVERTED (SSOT last-write-wins clobber by a parallel BA dispatch on .head).
git-log note in ce4b46f0 = authoritative intent → trusted spawn context. Confirmed
BA-VN-MACRO-TOOLING is a SEPARATE live lane (architect-probefold-done, next_agent=pm, PM plan
PENDING) — left UNTOUCHED.

**jq guard bug (caught pre-rename):** first `already_present()` counted backlog (the source array)
→ never promoted; 2nd attempt `.key != "backlog"` precedence broke under `and`. Fixed: chained
`select(.key!="backlog") | select(.value|type=="array")`. Lesson: when moving FROM an array,
the dedup guard must EXCLUDE the source array.

**HELD (unchanged):** Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE
re-verify) — passive ops/cron live-probe, already owned by ARCH-CRON-SCHEDULER-RELIABILITY
reverify_gate + FIX-COWORK-GUARANTEED-BACKSTOP (TNB c95 ACK confirms); surfaces on its own gate
tick, NOT raised this tick. Also held: 07-06 brief (seq-after-incident), F3 cronJobCount,
VMT-3a-PMI, ops/infra lane, FIX-FB-POSTER-NOARG-MARKET-TOOLS. TNB already ACK'd this cycle.
4 drained signals all informational (no new code bugs).

### Carry-over (next tick)
- dev-team dispatches F-BOP-ENCODING first; F-NSO-SELECTOR only after BOP done (serialize guard).
- F-NSO needs ops-vps-fetch recon leg BEFORE dev-macro-indicators — verify recon handoff lands.
- BA-VN-MACRO-TOOLING: route to PM (task-plan) — separate lane, head pointer was wrong (said ba).
- Monday market-day gate goes live — ARCH-CRON G1/G2/G3 + F-EOD re-verify on its own gate tick.
- Watch .head SSOT clobber: parallel dispatches last-write-win on .head — re-read git-log intent.
