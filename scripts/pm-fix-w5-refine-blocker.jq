# Fix W5-FU-CTG-REFINE-96e36139 blocked_on pointer (was missed in first pass)

.task_board.review |= map(
  if .id == "W5-FU-CTG-REFINE-96e36139" then
    . +
    {
      blocked_on: "FIX-BCTC-BANK-BS-COLUMN-ORDER — root cause now pinned: parser + classifier + section-detection bugs drop balance_sheet rows pre-DB. Execution was correct (56/56 units), but finalize classifier had zero bank-form BS rows to emit."
    }
  else .
  end
)
