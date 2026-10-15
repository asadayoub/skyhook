# Skyhook + Claude Code Integration

Skyhook provides deep native integration with Anthropic's **Claude Code** CLI tool, injecting project governance rules, MCP tools, and contextual slash commands.

---

## 1. Quick Setup

```bash
# 1. Install Skyhook globally
npm install -g @skyhook/cli

# 2. In your project, initialize Skyhook and inject Claude Code harness:
cd your-project
skyhook init
skyhook harness inject --target=claude-code
```

`skyhook harness inject` automatically configures:
- `CLAUDE.md`: Injects Skyhook governance rules, Task/Subtask hierarchy, and DoD checklist invariants.
- `.claude/config.json`: Configures the Skyhook MCP server with portable workspace paths.

---

## 2. Claude Code Slash Commands

Create `.claude/commands/skyhook-*.md` files for fast native slash command execution:

### `.claude/commands/skyhook-claim.md`
```markdown
---
description: Claim the next ready task or specific task with advisory lease
argument-hint: [task-id]
---
Claims the next highest priority ready task or a specific task ID, starts the advisory lease, and fetches the full execution context packet.
```

### `.claude/commands/skyhook-heartbeat.md`
```markdown
---
description: Extend active task lease during execution
argument-hint: <task-id> [minutes]
---
Extends the advisory lease on an active task to prevent timeout.
```

### `.claude/commands/skyhook-features.md`
```markdown
---
description: List all Skyhook features with status
---
List all features with their stories, child tasks, and blockers.
```

### `.claude/commands/skyhook-blockers.md`
```markdown
---
description: Show all blocked items
---
Show all blocked stories/tasks and their unmet prerequisite dependencies.
```

### `.claude/commands/skyhook-decide.md`
```markdown
---
description: Record architectural decision (auto-generates ADR)
argument-hint: <title> | <decision> | <context> | [category]
---
Record an architectural decision and generate an ADR with enforceable boundary rules.
Usage: /skyhook-decide "Use Redis" | "Redis for session caching" | "Need distributed state" | technology
```

### `.claude/commands/skyhook-trace.md`
```markdown
---
description: Trace requirement to code, stories, and decisions
argument-hint: <requirement-id>
---
Trace a requirement through AST code symbols, stories, and architectural decisions.
```

### `.claude/commands/skyhook-sync.md`
```markdown
---
description: Check code vs documentation drift
---
Runs drift verification across package dependencies, architecture layers, and requirement implementations.
```

### `.claude/commands/skyhook-dashboard.md`
```markdown
---
description: Start/stop Skyhook cybernetic web dashboard
argument-hint: start|stop|status
---
Controls the offline web dashboard at http://127.0.0.1:31415
```

---

## 3. Usage in Claude Code

During interactive sessions with Claude Code, run:
```bash
/skyhook-claim
/skyhook-trace REQ-001
/skyhook-heartbeat TASK-001 30
/skyhook-decide "Use PostgreSQL" | "PostgreSQL with Prisma" | "Need ACID transactions" | technology
/skyhook-sync
/skyhook-dashboard start
```

---

## 4. MCP Tools in Claude Code

When Claude Code is launched inside a workspace configured with `skyhook harness inject --target=claude-code`, all **46 offline Skyhook MCP tools** (e.g. `skyhook_claim_task`, `skyhook_heartbeat_lease`, `skyhook_verify_policies`, `skyhook_doctor`) are natively callable directly by the model.
