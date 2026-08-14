# Decision Journal — Sprint FRESHNESS-AUTO-REMEDIATE · po

**Sprint goal:** Close the loop between freshness DETECTION (live, working) and REMEDIATION (currently a dead end) — classify each SLA breach as broken-code vs not-refreshed, route it off the suppressed alert-commander addressee onto the po/dev-team signal_queue drain, and gate it with dedup/cooldown.
**Agent:** po
**Started:** 2026-08-14T04:11:35Z

---

### STEP po-S1 · po · 2026-08-14T04:15:21Z
**task-id:** SPIKE-FRESHNESS-REMEDIATE-TRIAGE
**what-done:** APPROVED the architect design brief at REVIEW-lane sign-off, moved the row review→done (status DONE), answered §10's 3 open questions, and decomposed the design into 4 backlog rows + 1 reprioritization — one `orch-apply.sh` pipe.
**what-considered:**
- Approve as-is and decompose (chosen).
- Rework to architect for the 3 open questions — rejected: architect explicitly marked them "noted, not blocking" and 2 of the 3 are PRODUCT calls (scope, schema risk) that are PO's to make, not architect's; a rework round-trip would have parked a complete 403-line design for a decision I can make in one read.
- Approve but defer decomposition to PM — rejected: §11 classifies this BUILD-STANDARD lean, which explicitly removes the PO→BA→architect→PM relay; routing through PM would add a hop the standard deletes.
**why-decision:** The brief answers all 5 SPIKE questions against 20 code-verified paths, and its load-bearing finding (alert-commander suppression is correct behaviour, wrong addressee — not a bug) is the thing that makes the redirect safe to build. Nothing was left unanswered that blocks a developer starting.
**why-change:** No change from plan.

### STEP po-S2 · po · 2026-08-14T04:15:21Z
**task-id:** SPIKE-FRESHNESS-REMEDIATE-TRIAGE
**what-done:** Answered §10 Q3 (isVnMarketHours 02:00→02:15 as its own FIX) by NOT minting — reprioritized the pre-existing `FIX-SLA-MONITOR-MARKET-OPEN-BOUNDARY-DETERMINISTIC-DAILY-BREACH` P2→P1 and cross-linked the brief's line-level root cause onto it.
**what-considered:**
- Mint the row architect asked for — rejected: it already exists, created 2026-08-07T02:50:38Z, ~3h BEFORE the brief was written; architect did not see it.
- Reprioritize + cross-link the existing row (chosen).
**why-decision:** This SPIKE's own charter is to end a 4-sibling per-source-patch churn series (SBV-FX, BCTC-threshold, signal-quality-monthly, + the PO fold). Minting a 5th duplicate while signing off the row that exists to stop that pattern would have been self-refuting. The boundary shift and that row's AC-1 warm-up compose (15-min window vs the rest of the open-side gap), so one row can carry both.
**why-change:** Deviates from architect's literal recommendation; the recommendation's intent (ship it fast, standalone) is preserved via the P1 bump.

### STEP po-S3 · po · 2026-08-14T04:15:21Z
**what-done:** Step 1 PO Triage over 18 durable-inbox envelopes — 0 net-new mints, 5 folds onto 4 existing rows (2 ci_red, 3 sweep-guard, 2 notebook-immutability), 1 carried, 1 ACK, 9 not-addressed-to-po skipped. [ambient — no single task-id]
**what-considered:**
- Mint per signal — rejected: every actionable envelope dedup-matched an already-open row; minting would have added 5 rows of pure bookkeeping to a 394-row backlog.
- Fold + attach evidence (chosen).
**why-decision:** The 2 ci_red envelopes were read AT SOURCE (`gh run view --log-failed`) rather than dispositioned on job name, which is what proved both runs share one FAILED FILES block already owned by 2 open READY rows. The one genuine judgement call was the 2 notebook-immutability fires: the rule's letter says pendingObservations (different sections), but same agent + consecutive cycles + a same-morning root-cause row for the unwired compose actuator makes it the tracked mechanism, not an interleaved-cycle false positive — folded, with the override reasoning written onto the row.
**why-change:** No change from plan.
