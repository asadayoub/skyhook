---
name: skyhook-doctor
description: Run system health diagnostics across runtime, backlog, git hooks, and agent harnesses
---

# skyhook-doctor

Run system health diagnostics across Node.js runtime, `.skyhook` workspace state, backlog integrity, git hooks, agent harnesses, port availability, and AST parsers.

## CLI Usage
```bash
skyhook doctor
skyhook doctor --port 31415 --json
```

## JSON Protocol
```bash
echo '{"command":"doctor","args":{"port":31415}}' | skyhook-cmd
```

## MCP Tool
Tool: `skyhook_doctor`
Args: `{ "port": 31415 }`

