---
name: skyhook-harness
description: Inject and manage agent harnesses across 8 supported AI coding environments
---

# skyhook-harness

Detects, injects, and cleans AI agent harnesses across Cursor, Claude Code, OpenAI Codex, Windsurf, GitHub Copilot, Google Antigravity, Cline, and Claude Desktop.

## CLI Usage
```bash
# Auto-detect and configure all installed agent environments
skyhook setup

# Inject specific agent harness
skyhook harness inject --target=cursor
skyhook harness inject --target=claude-code
skyhook harness inject --target=codex
skyhook harness inject --target=windsurf
skyhook harness inject --target=copilot
skyhook harness inject --target=antigravity
skyhook harness inject --target=cline

# Inspect active harnesses
skyhook harness status

# Safely remove harness without clobbering user configs
skyhook harness clean --target=cursor
```

