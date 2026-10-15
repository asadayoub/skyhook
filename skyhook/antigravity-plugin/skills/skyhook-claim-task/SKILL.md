---
name: skyhook-claim-task
description: Atomically claim a specific or next ready task with an advisory lease and context packet
---

# skyhook-claim-task

Atomically claim the next highest-priority task or a specific task by ID, transition it to `in-progress`, and issue an advisory lease with full execution context (acceptance criteria, DoD checklist, governing standards, and target source files).

## CLI Usage
```bash
# Claim next available task
skyhook task claim --agent="Antigravity"

# Claim specific task by ID
skyhook task claim --agent="Antigravity" --target="TASK-001"
```

## JSON Protocol
```bash
echo '{"command":"claimTask","args":{"assignee":"Antigravity","taskId":"TASK-001","level":"task"}}' | skyhook-cmd
```

## MCP Tool
Tool: `skyhook_claim_task`
Args: `{ "assignee": "Antigravity", "taskId": "TASK-001", "level": "task", "lease": 30 }`

