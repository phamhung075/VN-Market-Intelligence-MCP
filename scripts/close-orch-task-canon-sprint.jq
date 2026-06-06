# Close sprint ORCH-TASK-CANON: move 5 DONE tasks to done[], flatten meta-level tasks, set sprint status->done
# Atomic: tmp write + sentinel validation + mv

# Step 1: Extract all DONE tasks from ORCH-TASK-CANON sprint entries
# Step 2: Rename QA task id -> QA-ORCH-TASK-CANON (global uniqueness)
# Step 3: Add to done[] array
# Step 4: Remove ORCH-TASK-CANON from active_sprints
# Step 5: Set sprint_goal ORCH-TASK-CANON status->done

def close_orch_task_canon:
  # Find all ORCH-TASK-CANON sprints and extract DONE tasks
  (.task_board.active_sprints | map(select(.id == "ORCH-TASK-CANON"))) as $orch_sprints |

  # Collect all DONE tasks, rename QA task
  ($orch_sprints | map(.tasks[]) | map(select(.status == "DONE")) | map(
    if .id == "QA" then .id = "QA-ORCH-TASK-CANON" else . end
  )) as $done_tasks |

  # Update task_board:
  # 1. Add done tasks to done[] (append)
  # 2. Remove ORCH-TASK-CANON sprints from active_sprints
  .task_board |= (
    .done += $done_tasks |
    .active_sprints |= map(select(.id != "ORCH-TASK-CANON"))
  ) |

  # Update sprint_goal: flip ORCH-TASK-CANON status->done
  .sprint_goal.entries |= map(
    if .sprint_id == "ORCH-TASK-CANON" then .status = "done" else . end
  ) |

  # Update metadata
  ._updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ")) |
  ._updated_by = "pm"
;

close_orch_task_canon
