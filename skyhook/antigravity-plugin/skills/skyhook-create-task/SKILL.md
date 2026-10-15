---
name: skyhook-create-task
description: Create a fine-grained task under an existing Story or Epic
---

# skyhook-create-task

Creates a fine-grained executable task (`TASK-XXX`) attached to a parent user story (`STORY-XXX`) or epic (`EPIC-XXX`).

## CLI Usage
```bash
skyhook task create \
  --title="Implement Auth Token Validator" \
  --parent="STORY-001" \
  --type="feature" \
  --priority="high" \
  --target-files="src/auth/Token.ts"
```

## JSON Protocol
```bash
echo '{"command":"createTask","args":{"title":"Implement Auth Token Validator","parentId":"STORY-001","type":"feature","priority":"high"}}' | skyhook-cmd
```

## MCP Tool
Tool: `skyhook_create_task`
Args: `{ "title": "Implement Auth Token Validator", "parentId": "STORY-001", "type": "feature", "priority": "high" }`

