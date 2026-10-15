---
name: skyhook-subtask
description: Manage Definition of Done (DoD) checklist subtasks on backlog tasks
---

# skyhook-subtask

Creates or updates Definition of Done (DoD) checklist subtasks (`SUB-XXX`) attached to tasks. Tasks cannot transition to `done` while any subtask remains unchecked.

## CLI Usage
```bash
# Create DoD subtask
skyhook subtask create --task="TASK-001" --title="Unit tests with 100% branch coverage"

# Toggle subtask completion
skyhook subtask toggle --task="TASK-001" --subtask="SUB-001" --completed
```

## JSON Protocol
```bash
echo '{"command":"createSubtask","args":{"taskId":"TASK-001","title":"Unit tests with 100% branch coverage"}}' | skyhook-cmd
echo '{"command":"updateSubtask","args":{"taskId":"TASK-001","subtaskId":"SUB-001","completed":true}}' | skyhook-cmd
```

## MCP Tools
- Tool: `skyhook_create_subtask`, Args: `{ "taskId": "TASK-001", "title": "Unit tests" }`
- Tool: `skyhook_update_subtask`, Args: `{ "taskId": "TASK-001", "subtaskId": "SUB-001", "completed": true }`

