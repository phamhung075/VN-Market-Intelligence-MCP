# PM orchestration script: Apply architect disposition for SPIKE-BCTC-CTG-BS-REALDATA-ROOT
# Mints 2 new tasks, marks 1 superseded, stubs 1 backlog, re-parents 2 W5 blocked rows

# Mutation 1: Mint FIX-BCTC-BANK-BS-COLUMN-ORDER to backlog
.task_board.backlog += [
  {
    id: "FIX-BCTC-BANK-BS-COLUMN-ORDER",
    title: "CTG/bank-form parser: column-order header mapping + section-vocabulary + real-markdown regression (FIX-A+FIX-D+FIX-C composite)",
    type: "FIX",
    zone: "apps/mcp-server",
    next_agent: "dev-mcp-server",
    status: "TODO",
    priority: "high",
    size: "L",
    created_at: now | todate,
    note: "SPIKE-BCTC-CTG-BS-REALDATA-ROOT root-cause FIX-A (header-aware column mapping in refinedMarkdownParser.ts 4/5-cell branch, ~L419-426) + FIX-D (detectSection bank BS title vocabulary + ToC false-positive fix) + FIX-C (mandatory real-markdown regression fixture from live unit-0002/0003/0038). Supersedes FIX-BCTC-BANK-BS-SECTION-CLASSIFIER; fold its 3 shipped RC fixes (commit 2c7fb5b0) as real non-regressions. See architecture brief docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §7.",
    depends: [],
    unblocks: [
      "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST",
      "W5-FU-CTG-REFINE-96e36139"
    ]
  }
] |

# Mutation 2: Mint FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP to backlog
.task_board.backlog += [
  {
    id: "FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP",
    title: "Bank form classifier: strip markdown emphasis from anchor regex (FIX-B)",
    type: "FIX",
    zone: "apps/mcp-server",
    next_agent: "dev-mcp-server",
    status: "TODO",
    priority: "high",
    size: "S",
    created_at: now | todate,
    note: "SPIKE-BCTC-CTG-BS-REALDATA-ROOT root-cause FIX-B: strip markdown emphasis (**,__) from code before testing ROMAN_SECTION/CORP_BALANCE anchors in bctcFormType.ts isBankFormFromRows. Independent, low-risk, can ship in parallel. See architecture brief docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §4.",
    depends: []
  }
] |

# Mutation 3: Extract FIX-BCTC-BANK-BS-SECTION-CLASSIFIER from review, mark superseded
(.task_board.review[] | select(.id == "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER")) as $old_row |
.task_board.review |= map(select(.id != "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER")) |
.task_board.done += [
  $old_row +
  {
    status: "DONE",
    superseded_by: "FIX-BCTC-BANK-BS-COLUMN-ORDER",
    status_note: "Superseded by FIX-BCTC-BANK-BS-COLUMN-ORDER composite task (SPIKE-BCTC-CTG-BS-REALDATA-ROOT root-cause analysis). The 3 shipped RC-1/RC-2/RC-3 fixes (commit 2c7fb5b0) are retained as real non-regressions. Do NOT re-open for 4th narrow classifier-only patch.",
    closed_at: now | todate
  }
] |

# Mutation 4: Mark FIX-BCTC-BANK-SUMMARY-MAPPING as stale/superseded
.task_board.backlog |= map(
  if .id == "FIX-BCTC-BANK-SUMMARY-MAPPING" then
    . +
    {
      status: "DONE",
      superseded_by: "FIX-BCTC-BANK-BS-COLUMN-ORDER",
      status_note: "Scope now fully owned by FIX-BCTC-BANK-BS-COLUMN-ORDER composite task (SPIKE-BCTC-CTG-BS-REALDATA-ROOT root-cause). CTG total_assets=0 defect traced to 3 stacking bugs in apps/mcp-server layers (parser + classifier + section-detection), not the aggregator logic. W1-W4 shipped, W5 re-parented to new blocker. Recommend mark STALE/SUPERSEDED to avoid future re-opening."
    }
  else .
  end
) |

# Mutation 5a: Re-parent TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST (in review)
.task_board.review |= map(
  if .id == "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST" then
    . +
    {
      blocked_on: "FIX-BCTC-BANK-BS-COLUMN-ORDER — root cause now pinned by SPIKE: parser column-order + classifier bold-tolerance + section-vocabulary (3 stacking bugs in apps/mcp-server). FIX-A+FIX-D+FIX-C composite lands code fix + mandatory real-markdown regression gate. Developer must re-run finalizeBctcRefineTool post-deploy."
    }
  else .
  end
) |

# Mutation 5b: Re-parent W5-FU-CTG-REFINE-96e36139 (in active_sprints)
.task_board.active_sprints |= map(
  if .id == "W5-FU-CTG-REFINE-96e36139" then
    . +
    {
      blocked_on: "FIX-BCTC-BANK-BS-COLUMN-ORDER — root cause now pinned: parser + classifier + section-detection bugs drop balance_sheet rows pre-DB. Execution was correct (56/56 units), but finalize classifier had zero bank-form BS rows to emit."
    }
  else .
  end
)
