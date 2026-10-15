---
name: skyhook-backlog-migrate
description: Migrate monolithic backlog into modular per-epic and per-task directory layouts
---

# skyhook-backlog-migrate

Migrates legacy monolithic `.skyhook/backlog/epics.yaml` structures into granular modular directories (`.skyhook/backlog/epics/*.yaml` and `.skyhook/backlog/tasks/*.yaml`), enabling conflict-free multi-agent git concurrency.

## CLI Usage
```bash
# Preview migration safely
skyhook backlog migrate --dry-run

# Execute decomposition and create automatic backup
skyhook backlog migrate
```

## Git Merge Driver Setup
Pair with the standalone 3-way merge driver:
```bash
git config merge.skyhook-backlog.name "Skyhook Backlog 3-Way Semantic Merge Driver"
git config merge.skyhook-backlog.driver "skyhook-merge-driver %O %A %B %P"
```

