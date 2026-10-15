---
name: skyhook-drift
description: Detect DDD layer violations, circular dependencies, and package drift
---

# skyhook-drift

Analyzes codebase drift, Domain-Driven Design (DDD) layer breaches, circular dependencies (via Tarjan's algorithm), and undeclared package imports. Provides 1-click adoption to reconcile architecture with reality.

## CLI Usage
```bash
# Check architecture boundaries and circular dependencies
skyhook drift --boundaries

# Check semantic code hygiene rules
skyhook drift --semantic

# Auto-reconcile and adopt detected drift
skyhook drift --adopt
```

## JSON Protocol
```bash
echo '{"command":"sync","args":{}}' | skyhook-cmd
```

## MCP Tools
- `skyhook_check_drift`
- `skyhook_adopt_drift`
- `skyhook_get_c4_architecture`

