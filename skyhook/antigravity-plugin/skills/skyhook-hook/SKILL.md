---
name: skyhook-hook
description: Manage Git lifecycle pre-commit hooks for architectural enforcement
---

# skyhook-hook

Installs, inspects, and manages `.git/hooks/pre-commit` lifecycle hooks to verify ADR boundary rules and check for drift automatically before every commit in `< 50ms`.

## CLI Usage
```bash
# Install pre-commit guard
skyhook hook install

# Check hook status
skyhook hook status

# Uninstall hook
skyhook hook uninstall
```

