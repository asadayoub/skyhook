---
name: skyhook-adr
description: Manage Architecture Decision Records (ADRs) and enforce code boundary policies
---

# skyhook-adr

Manage the Architecture Decision Record (ADR) lifecycle (drafting, 2-way markdown sync, supersession chains, and visual Mermaid decision DAGs) and enforce active import boundaries against the codebase.

## CLI Usage
```bash
# Verify codebase against active ADR policies
skyhook adr verify

# Generate decision DAG
skyhook adr dag

# Supersede older ADR
skyhook adr supersede --old="ADR-001" --new="ADR-002" --reason="Migrated from SQLite to Postgres"

# Sync markdown records with index ledger
skyhook adr sync
```

## JSON Protocol
```bash
echo '{"command":"recordDecision","args":{"title":"Use Redis","decision":"Standardize on Redis","context":"Caching"}}' | skyhook-cmd
```

## MCP Tools
- `skyhook_record_decision`
- `skyhook_draft_adr`
- `skyhook_supersede_adr`
- `skyhook_sync_adr`
- `skyhook_get_adr_dag`
- `skyhook_verify_policies`

