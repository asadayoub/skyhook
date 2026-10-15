---
name: skyhook-heartbeat
description: Extend active task or story advisory lease during long execution
---

# skyhook-heartbeat

Extends an active advisory lease held by an AI agent on a story or task, preventing the automated lease sweeper from reclaiming the item during long-running builds, test suites, or refactoring.

## CLI Usage
```bash
skyhook task heartbeat --item="TASK-001" --agent="Antigravity" --extend=30
```

## JSON Protocol
```bash
echo '{"command":"heartbeatLease","args":{"itemId":"TASK-001","agentId":"Antigravity","extendMinutes":30}}' | skyhook-cmd
```

## MCP Tool
Tool: `skyhook_heartbeat_lease`
Args: `{ "itemId": "TASK-001", "agentId": "Antigravity", "extendMinutes": 30 }`

