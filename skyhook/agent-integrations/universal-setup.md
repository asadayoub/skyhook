# Universal Skyhook Setup for Any AI Agent

## One-Line Install (Works Everywhere)

```bash
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc  # or ~/.bashrc, ~/.config/fish/config.fish
source ~/.zshrc
```

## Verify Installation

```bash
skyhook version
skyhook profile web-app
skyhook-cmd dashboard status
```

## Initialize in Any Project

```bash
cd your-project

# Auto-detect project type
skyhook init

# Or specify profile explicitly
skyhook init --profile=web-app
skyhook init --profile=api-service
skyhook init --profile=cli-tool
skyhook init --profile=library
skyhook init --profile=saas --variant=stripe-b2b
skyhook init --profile=ai-agent

# Run discovery to populate requirements
skyhook discover
```

## Universal JSON Protocol (All Agents)

All agents communicate via stdio JSON:

```bash
# Request format
echo '{"command": "COMMAND_NAME", "args": {}}' | skyhook-cmd

# Examples:
echo '{"command": "listCurrentFeatures", "args": {}}' | skyhook-cmd
echo '{"command": "getNextTask", "args": {}}' | skyhook-cmd
echo '{"command": "getBlockers", "args": {}}' | skyhook-cmd
echo '{"command": "trace", "args": {"id": "REQ-001"}}' | skyhook-cmd
echo '{"command": "impact", "args": {"id": "REQ-001"}}' | skyhook-cmd
echo '{"command": "untraced", "args": {}}' | skyhook-cmd
echo '{"command": "sync", "args": {}}' | skyhook-cmd
echo '{"command": "recordDecision", "args": {"title": "...", "decision": "...", "context": "..."}}' | skyhook-cmd
echo '{"command": "getContext", "args": {"topic": "authentication"}}' | skyhook-cmd
echo '{"command": "dashboard", "args": {"action": "start"}}' | skyhook-cmd
```

## Command Reference

| Command | Description | Key Args |
|---------|-------------|----------|
| `listCurrentFeatures` | List features with status | `status?: all\|backlog\|in-progress\|done\|blocked` |
| `getFeature` | Get detailed feature | `id: string` |
| `getNextTask` | Highest priority ready task | `assignee?: string` |
| `getBlockers` | All blocked items | - |
| `recordDecision` | Auto-generate ADR | `title, decision, context, category?, alternatives?, relatedRequirements?` |
| `updateStatus` | Update story status | `storyId, status` |
| `getContext` | Relevant context for topic | `topic?: string` |
| `sync` | Code vs docs drift check | - |
| `addFeature` | Add feature with stories | `title, description?, goal?, stories?` |
| `trace` | Requirement → code/stories/decisions | `id: string` |
| `impact` | Change impact analysis | `id: string` |
| `untraced` | Find untraced requirements | - |
| `dashboard` | On-demand web UI | `action: start\|stop\|status` |
| `help` | Show all commands | - |

## Dashboard (Visual UI)

```bash
# Start dashboard (port 4343, on-demand only)
skyhook-cmd dashboard start
# Open http://localhost:4343

# Stop dashboard
skyhook-cmd dashboard stop

# Check status
skyhook-cmd dashboard status
```

Dashboard shows:
- Project selector (multi-project)
- Features with status badges
- Next priority task
- Blockers
- Requirements
- Decisions
- Tech stack
- Auto-refreshes every 30s

## Traceability in Code

Add `@skyhook-implements REQ-XXX` comments:

```python
# @skyhook-implements REQ-003
def revenue_chart():
    pass

// @skyhook-implements REQ-001
export function login() { }
```

Then use:
- `trace` - Find code implementing a requirement
- `impact` - Analyze change impact
- `untraced` - Find requirements with no code refs

## Project Structure Created

```
your-project/
├── .skyhook/
│   ├── project.yaml          # Metadata
│   ├── context.md            # Problem/solution
│   ├── vision.md             # Vision/KPIs/personas
│   ├── requirements/
│   │   ├── functional.yaml
│   │   ├── non-functional.yaml
│   │   └── constraints.yaml
│   ├── decisions/
│   │   ├── index.yaml
│   │   └── *.md              # Auto-generated ADRs
│   ├── backlog/
│   │   └── epics.yaml        # Epics, stories, tasks (WSJF)
│   ├── tech-stack.yaml       # Tech choices
│   ├── ux/
│   │   └── styleguide.md
│   ├── standards/            # Project-specific overrides
│   └── changelog.md          # Full history
└── your-code/
```

## Agent-Specific Quick Links

| Agent | Setup Guide |
|-------|-------------|
| **Codex** | `agent-integrations/codex.md` |
| **Claude Code** | `agent-integrations/claude-code.md` |
| **Gemini CLI** | `agent-integrations/gemini-cli.md` |
| **GitHub Copilot** | `agent-integrations/copilot.md` |

## CI/CD Integration

```yaml
# .github/workflows/skyhook-drift.yml
name: Skyhook Drift Check
on: [push, pull_request]
jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Skyhook
        run: |
          curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash
          echo "$HOME/.skyhook/skill/cli" >> $GITHUB_PATH
      - name: Check Drift
        run: echo '{"command":"sync","args":{}}' | skyhook-cmd
```

## Key Principles

1. **Local-only** - No server, no network, no daemon
2. **Git-friendly** - All `.skyhook/` files are plain text, diffable
3. **Agent-agnostic** - Works with any AI via stdio JSON
4. **On-demand dashboard** - Zero overhead when not running
5. **Zero dependencies** - Pure Node.js, no external packages

## Support

- Repo: https://github.com/asadayoub/skyhook
- Issues: https://github.com/asadayoub/skyhook/issues
- Release: https://github.com/asadayoub/skyhook/releases/latest
