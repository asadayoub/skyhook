# Skyhook + GitHub Copilot Integration

## Quick Setup

```bash
# 1. Install Skyhook (one-time)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 2. In your project
cd your-project
skyhook init
skyhook discover
```

## Copilot Custom Instructions

Create `.github/copilot-instructions.md`:

```markdown
# Skyhook Project Intelligence

This project uses Skyhook for persistent, structured project intelligence.

## Skyhook Commands

All Skyhook commands are available via `skyhook-cmd` binary (stdio JSON protocol).

### Key Commands for Copilot

- **List features**: `echo '{"command":"listCurrentFeatures","args":{}}' | skyhook-cmd`
- **Next task**: `echo '{"command":"getNextTask","args":{}}' | skyhook-cmd`
- **Blockers**: `echo '{"command":"getBlockers","args":{}}' | skyhook-cmd`
- **Trace requirement**: `echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd`
- **Impact analysis**: `echo '{"command":"impact","args":{"id":"REQ-001"}}' | skyhook-cmd`
- **Record decision**: `echo '{"command":"recordDecision","args":{"title":"...","decision":"...","context":"..."}}' | skyhook-cmd`
- **Sync check**: `echo '{"command":"sync","args":{}}' | skyhook-cmd`
- **Get context**: `echo '{"command":"getContext","args":{"topic":"authentication"}}' | skyhook-cmd`
- **Dashboard**: `skyhook-cmd dashboard start` (opens http://localhost:4343)

## Project Context Files

Skyhook maintains `.skyhook/` directory:

```
.skyhook/
├── project.yaml          # Project metadata
├── context.md            # Problem statement, solution overview
├── vision.md             # Product vision, KPIs, personas
├── requirements/
│   ├── functional.yaml
│   ├── non-functional.yaml
│   └── constraints.yaml
├── decisions/
│   ├── index.yaml
│   └── *.md              # Auto-generated ADRs
├── backlog/
│   └── epics.yaml        # Epics, stories, tasks (WSJF)
├── tech-stack.yaml       # Technology choices
├── ux/
│   └── styleguide.md
├── standards/            # Project-specific standards
└── changelog.md          # Full history
```

## Traceability

Use `@skyhook-implements REQ-XXX` comments in code:

```typescript
// @skyhook-implements REQ-003
export function RevenueChart() { ... }
```

This enables:
- `/skyhook-trace --id=REQ-003` - Find all code implementing a requirement
- `/skyhook-impact --id=REQ-003` - Analyze change impact
- `/skyhook-untraced` - Find requirements with no code references

## Workflow for Copilot

1. **Session start**: Ask "What's my next task?" → runs `getNextTask`
2. **Before coding**: Ask "Trace REQ-XXX" → runs `trace`
3. **Architecture decision**: Ask "Record decision: ..." → runs `recordDecision` (auto-generates ADR)
4. **Before PR**: Ask "Check for drift" → runs `sync`
5. **Visual overview**: Ask "Start dashboard" → runs `dashboard start`

## Example Prompts

```
"What's the highest priority task I should work on?"
"Show me all blockers in the project"
"Trace REQ-003 to see what stories and code implement it"
"What's the impact of changing the authentication requirement?"
"Record a decision: Use Redis for session caching"
"Check if our code matches the documented tech stack"
"Start the Skyhook dashboard for a visual overview"
```

## VS Code Tasks (Optional)

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Skyhook: Next Task",
      "type": "shell",
      "command": "echo '{\"command\":\"getNextTask\",\"args\":{}}' | skyhook-cmd",
      "presentation": { "reveal": "always", "panel": "new" }
    },
    {
      "label": "Skyhook: List Features",
      "type": "shell",
      "command": "echo '{\"command\":\"listCurrentFeatures\",\"args\":{}}' | skyhook-cmd",
      "presentation": { "reveal": "always", "panel": "new" }
    },
    {
      "label": "Skyhook: Check Drift",
      "type": "shell",
      "command": "echo '{\"command\":\"sync\",\"args\":{}}' | skyhook-cmd",
      "presentation": { "reveal": "always", "panel": "new" }
    },
    {
      "label": "Skyhook: Start Dashboard",
      "type": "shell",
      "command": "skyhook-cmd dashboard start",
      "presentation": { "reveal": "always", "panel": "new" }
    }
  ]
}
```

Then use `Cmd+Shift+P` → "Tasks: Run Task" → "Skyhook: Next Task"

## GitHub Actions (CI Integration)

Add `.github/workflows/skyhook-drift.yml`:

```yaml
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
```
