> Parent: [ops-incident-response.md](./ops-incident-response.md)

# Decision Matrix & Escalation Tree

---

## Decision Matrix

```
                Service Down?  │  Server Down?  │  DB Issue?
────────────────────────────────────────────────────────────
VPS services    Playbook 1     │       No       │    No
Server process  No             │   Playbook 2   │    No
Multiple down   Playbook 4     │       No       │    No
DB corruption   No             │       No       │  Playbook 3
Deployment fail Playbook 5     │   Depends      │    No
────────────────────────────────────────────────────────────

→ If uncertain, start with Playbook 1 (quickest diagnosis)
→ If 2+ playbooks apply, handle highest severity first
→ Always escalate Purple (data risk) immediately
```

---

## Escalation Decision Tree

```
Is it Purple (data risk)?
├─ YES → ESCALATE TO HUMAN IMMEDIATELY
│        Send full diagnostic to WORK channel
│        Do NOT attempt recovery unless explicitly trained
└─ NO → Continue to Step 2

Can you reach the failing service/server via SSH/curl?
├─ NO → Network issue
│       └─ Check VPS connectivity
│          └─ If VPS unreachable → ESCALATE (network down)
└─ YES → Continue to Step 3

Does the service have logs?
├─ NO → Service not started (systemd issue)
│       └─ Attempt restart
│          └─ If fails 2x → ESCALATE
└─ YES → Read error message
         └─ Known pattern? → Apply fix
         └─ Unknown error? → ESCALATE with logs

Has the issue persisted for >10 min after attempted fix?
├─ YES → ESCALATE
│        "Attempted fix failed. Requires manual review."
└─ NO → Monitor and report to WORK
```
