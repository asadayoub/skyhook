# Skyhook + Claude Code Integration

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

## Claude Code Slash Commands

Create `.claude/commands/skyhook-*.md` files for native slash commands:

### `.claude/commands/skyhook-next.md`
```markdown
---
description: Get next priority task from Skyhook
---
Get the highest priority ready task with full context from Skyhook.
```

### `.claude/commands/skyhook-features.md`
```markdown
---
description: List all Skyhook features with status
---
List all features with their stories and blockers.
```

### `.claude/commands/skyhook-blockers.md`
```markdown
---
description: Show all blocked items
---
Show all blocked stories and their reasons.
```

### `.claude/commands/skyhook-decide.md`
```markdown
---
description: Record architectural decision (auto-generates ADR)
argument-hint: <title> | <decision> | <context> | [category]
---
Record a decision with auto-generated ADR.
Usage: /skyhook-decide "Use Redis" | "Redis for caching" | "Need performance" | technology
```

### `.claude/commands/skyhook-trace.md`
```markdown
---
description: Trace requirement to code/stories/decisions
argument-hint: <requirement-id>
---
Trace a requirement through stories, decisions, and code references.
```

### `.claude/commands/skyhook-impact.md`
```markdown
---
description: Analyze impact of changing a requirement
argument-hint: <requirement-id>
---
Show impact analysis with risk level for a requirement change.
```

### `.claude/commands/skyhook-sync.md`
```markdown
---
description: Check code vs documentation drift
---
Sync check: tech stack vs package.json, requirements→stories, decisions tracked.
```

### `.claude/commands/skyhook-dashboard.md`
```markdown
---
description: Start/stop Skyhook web dashboard
argument-hint: start|stop|status
---
Control the on-demand web dashboard at http://localhost:4343
```

## Usage in Claude Code

```
/skyhook-next
/skyhook-features
/skyhook-blockers
/skyhook-decide "Use PostgreSQL" | "PostgreSQL with Prisma" | "Need ACID" | technology
/skyhook-trace REQ-001
/skyhook-impact REQ-001
/skyhook-sync
/skyhook-dashboard start
```

## CLAUDE.md Configuration

Add to your project's `CLAUDE.md`:

```markdown
# Skyhook Project Intelligence

This project uses Skyhook for persistent project intelligence.

## Key Commands

- `/skyhook-next` - Get next task with context
- `/skyhook-features` - View all features
- `/skyhook-blockers` - View blockers
- `/skyhook-trace <id>` - Trace requirement
- `/skyhook-impact <id>` - Impact analysis
- `/skyhook-decide` - Record decision (auto-ADR)
- `/skyhook-sync` - Check drift
- `/skyhook-dashboard start` - Visual dashboard

## Project Context

Skyhook maintains `.skyhook/` with:
- Requirements (functional, non-functional, constraints)
- Decisions (ADRs with alternatives/consequences)
- Backlog (epics, stories, tasks with WSJF prioritization)
- Tech stack choices
- Traceability links (`@skyhook-implements REQ-XXX`)

## Workflow

1. Start session: `/skyhook-next`
2. Understand context: `/skyhook-trace REQ-XXX`
3. Make decision: `/skyhook-decide`
4. Check drift before commit: `/skyhook-sync`
5. Visual overview: `/skyhook-dashboard start`
```

## JSON API (Programmatic)

```bash
# Direct JSON invocation
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd
```
