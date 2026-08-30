# Skyhook + Codex Integration

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

## Codex AGENTS.md Configuration

Create `.codex/agents.md` in your project:

```markdown
# Skyhook Agent Instructions

## Available Slash Commands

All Skyhook commands are invoked via stdio JSON. Use the `skyhook-cmd` binary.

### Feature Management
- `/skyhook-listCurrentFeatures` - List all features with status
- `/skyhook-getFeature --id=EPIC-001` - Get detailed feature info
- `/skyhook-addFeature --title="New Feature" --description="..." --stories='[{"title":"Story 1","userStory":"As a user..."}]'`

### Task Management
- `/skyhook-getNextTask` - Get highest priority ready task with context
- `/skyhook-getBlockers` - Get all blocked items
- `/skyhook-updateStatus --storyId=STORY-001 --status=in-progress`

### Decisions & Architecture
- `/skyhook-recordDecision --title="Use PostgreSQL" --decision="PostgreSQL with Prisma" --context="Need ACID" --category=technology`
- `/skyhook-sync` - Check code vs documentation drift

### Traceability & Impact
- `/skyhook-trace --id=REQ-001` - Trace requirement to code/stories/decisions
- `/skyhook-impact --id=REQ-001` - Analyze change impact
- `/skyhook-untraced` - Find requirements with no code references

### Context
- `/skyhook-getContext --topic=authentication` - Get relevant context for topic

### Dashboard
- `/skyhook-dashboard start` - Start web UI at http://localhost:4343
- `/skyhook-dashboard stop` - Stop dashboard
- `/skyhook-dashboard status` - Check status

## Example Workflow

1. **Start of session**: Run `/skyhook-getNextTask` to see what to work on
2. **Before coding**: Run `/skyhook-trace --id=REQ-XXX` to understand requirements
3. **After decision**: Run `/skyhook-recordDecision` to auto-generate ADR
4. **Before commit**: Run `/skyhook-sync` to check for drift
5. **Visual overview**: Run `/skyhook-dashboard start` and open http://localhost:4343

## JSON Protocol

All commands accept JSON via stdin:

```json
{"command": "listCurrentFeatures", "args": {"status": "in-progress"}}
```

Returns structured JSON for programmatic use.
```

## Project Structure

```
your-project/
├── .skyhook/
│   ├── project.yaml
│   ├── context.md
│   ├── vision.md
│   ├── requirements/
│   ├── decisions/
│   ├── backlog/
│   ├── tech-stack.yaml
│   └── changelog.md
├── .codex/
│   └── agents.md          # This file
└── your-code/
```

## Tips

- Commit `.skyhook/` to git for team collaboration
- Use `@skyhook-implements REQ-001` comments in code for traceability
- Dashboard is on-demand only - no background process
