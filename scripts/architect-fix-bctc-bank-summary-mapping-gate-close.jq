# Gate-close ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING: AC-1 SPIKE done.
# ready[] -> done[]; mint PM-FIX-BCTC-BANK-SUMMARY-MAPPING in ready[] (owner=pm);
# head.next_agent -> pm with brief path + SPLIT summary.
# Usage: jq --arg ts "$ts" -f scripts/architect-fix-bctc-bank-summary-mapping-gate-close.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def close_arch_fix_bctc:
  (.task_board.ready[] | select(.id == "ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING")) as $arch_task |

  ($arch_task
    | .status = "DONE"
    | .closed_at = $ts
    | .note = (
        "AC-1 SPIKE done — live docker-exec probe vs named-volume market.db (mcp__gateway__call_tool unreachable "
        + "this session; substituted equivalent RAW evidence + serve-path source-code cross-reference). "
        + "§3.2 REVISED: \"Tổng tài sản\" grand-total row is absent from bctc_table_rows for BOTH CTG and VCB "
        + "(bank-form-generic gap, not CTG-only) — VCB's currently-correct total_assets traced to a lucky match in "
        + "the non-bank-aware initial flat-text extractor (balanceSheetExtractor.ts), frozen by finalizeBctcRefineTool.ts's "
        + "documented Case-2 skip-when-null logic; bctcScalarAggregator.ts mapping logic is sound but upstream-starved, "
        + "not broken. §3.3 CONFIRMED: guard fires only in get_financial_summary, zero guard in get_bctc_full/compare_financials. "
        + "ZONE RE-PINNED to apps/mcp-server/ ONLY (overrides sprint's route_to:dev-pdf-extractor default) — bctc_md_tables "
        + "(pdf-extractor bridge table) is NULL for both CTG/VCB report_ids; corruption traced to the in-repo agentic-refine "
        + "pipeline (bctcRefineJob.ts + refinedMarkdownParser.ts), not pdf-extractor OCR. "
        + "SPLIT (5 units, dev-mcp-server only): W1 identity-serve-guard coverage (ships first, independent) / "
        + "W2 generic markdown row-repair (pattern-based, ROMAN_SECTION-anchored) / W3 section-boundary-contamination guard "
        + "(reuse FM-VCB-1) / W4 bctcScalarAggregator fixtures incl. synthetic 3rd bank (AC-9) / W5 truthful validation_status "
        + "+ operational re-ingest of CTG report_id 96e36139-5dac-414d-8e4d-20a4725890d1 (code fix alone will NOT unfreeze "
        + "total_assets=0). Brief: docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md. "
        + "Handoff: docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md."
      )
  ) as $arch_done |

  ({
    id: "PM-FIX-BCTC-BANK-SUMMARY-MAPPING",
    title: "Decompose FIX-BCTC-BANK-SUMMARY-MAPPING into 5 dev-mcp-server work units (W1-W5) per architect SPIKE brief — NO dev-pdf-extractor task",
    owner: "pm",
    next_agent: "pm",
    status: "READY",
    zone: "apps/mcp-server/",
    type: "FIX",
    priority: "P1",
    recurrence_escalation: true,
    sprint: "FIX-BCTC-BANK-SUMMARY-MAPPING",
    implements: "FIX-BCTC-BANK-SUMMARY-MAPPING",
    depends: [],
    created_at: $ts,
    created_by: "architect",
    spec_ref: "docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md",
    architecture_brief: "docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md",
    split_summary: "W1 identity-serve-guard coverage (reports.ts compare_financials + bctcFullTools.ts get_bctc_full, factor into shared helper) — independent, ship first, satisfies AC-4/AC-7. W2 generic markdown row-repair (refinedMarkdownParser.ts, ROMAN_SECTION-anchored corruption-signature split) — parallel-safe with W1/W3/W4. W3 section-boundary-contamination guard (detectSection, reuse FM-VCB-1 fix) — parallel-safe. W4 bctcScalarAggregator.ts fixture hardening incl. CTG-shaped/VCB-shaped/synthetic-3rd-bank fixtures through all 3 serve tools (AC-9/AC-12) — parallel-safe. W5 truthful validation_status (finalizeBctcRefineTool.ts FR-6) + operational re-ingest of CTG report_id 96e36139-5dac-414d-8e4d-20a4725890d1 (SEQUENCED after W2+W4 deploy — a code fix alone will not unfreeze total_assets=0 due to Case-2 preserve-prior-value logic). Non-regression fixtures: FPT 2026-Q1 (failed, pre-existing floor) + FPT 2025-Q4 + VNM 2025-Q4 per BA §3.4. Dependency: W1|W2|W3|W4 parallel -> W5 -> qa AC-13 RAW re-probe. ZONE RE-PIN: apps/mcp-server/ ONLY — do NOT mint any dev-pdf-extractor task off this row (architect SPIKE evidence: bctc_md_tables NULL for both CTG/VCB current report_ids rules out the pdf-extractor push path as the source of the corrupted/absent rows).",
    acceptance: "docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md AC-2..AC-13 (AC-1/AC-11 satisfied by this row's existence). pm decomposes W1-W5 into dev-mcp-server TASK rows; qa gates AC-13 RAW-live vs named-volume market.db.",
    note: "[architect 2026-07-01] AC-1 SPIKE gate satisfied — mint per AC-11 cascade-ordering rule. pm MUST NOT mint dev-pdf-extractor tasks off this sprint (zone re-pinned to apps/mcp-server/ only, see architecture_brief)."
  }) as $pm_task |

  .task_board.ready |= (map(select(.id != "ARCH-FIX-BCTC-BANK-SUMMARY-MAPPING")) + [$pm_task]) |
  .task_board.done += [$arch_done] |

  .head.status = "planning" |
  .head.active_task_id = "PM-FIX-BCTC-BANK-SUMMARY-MAPPING" |
  .head.next_agent = "pm" |
  .head.next_action = "pm decomposes FIX-BCTC-BANK-SUMMARY-MAPPING into 5 dev-mcp-server work units (W1-W5) per docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md — W1 identity-serve-guard / W2 markdown row-repair / W3 section-boundary guard / W4 aggregator fixtures / W5 validation_status+re-ingest (sequenced after W2+W4). Do NOT mint dev-pdf-extractor tasks — zone re-pinned to apps/mcp-server/ only." |
  .head.updated_by = "architect" |
  .head.updated_at = $ts |
  .head.note = (
    "[architect 2026-07-01] AC-1 SPIKE DONE. Live docker-exec probe vs named-volume market.db (gateway tool unreachable "
    + "this session, substituted RAW-equivalent evidence + source-code cross-reference). REVISED §3.2: Tổng tài sản row "
    + "absent from bctc_table_rows for BOTH CTG and VCB (not CTG-only) — VCB's correct total_assets is a frozen lucky "
    + "value from the non-bank-aware initial extractor, not the row-based bank mapper; bctcScalarAggregator.ts is sound "
    + "but upstream-starved. CONFIRMED §3.3 (guard never-fired on get_bctc_full/compare_financials). ZONE RE-PINNED: "
    + "apps/mcp-server/ ONLY (bctc_md_tables NULL for both report_ids rules out dev-pdf-extractor as source) — overrides "
    + "sprint default. 5-unit SPLIT minted as PM-FIX-BCTC-BANK-SUMMARY-MAPPING. Brief: "
    + "docs/architecture-briefs/2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md."
  ) |

  ._updated_at = $ts |
  ._updated_by = "architect"
;

close_arch_fix_bctc
