# Universal Skyhook Setup for Any AI Agent

Skyhook provides universal project intelligence, living backlog management, AST traceability, and architectural policy enforcement for all major AI coding agents (Cursor, Claude Code, OpenAI Codex, Windsurf, GitHub Copilot, Google Antigravity, Cline, and Gemini CLI).

---

## 1. Installation

Install globally via npm (recommended):
```bash
npm install -g @skyhook/cli
```
Or run directly without installation via npx:
```bash
npx --yes --package skyhook-cli skyhook --help
```

Verify the installation:
```bash
skyhook --version
skyhook doctor
```

---

## 2. Automated Agent Configuration (`skyhook harness inject`)

Skyhook provides automatic harness injection that configures rule files, MCP clients, and slash commands without manual editing:

```bash
cd your-project

# Initialize Skyhook state in the workspace
skyhook init

# Auto-detect installed agents and configure them in one shot:
skyhook setup

# Or inject for a specific target agent:
skyhook harness inject --target=cursor
skyhook harness inject --target=claude-code
skyhook harness inject --target=codex
skyhook harness inject --target=windsurf
skyhook harness inject --target=copilot
skyhook harness inject --target=antigravity
skyhook harness inject --target=cline
```

---

## 3. Universal JSON Protocol (`skyhook-cmd`)

All AI agents can communicate with Skyhook via standard input/output JSON streams using the `skyhook-cmd` binary:

```bash
# Request format
echo '{"command": "COMMAND_NAME", "args": {}}' | skyhook-cmd

# Examples:
echo '{"command": "listCurrentFeatures", "args": {}}' | skyhook-cmd
echo '{"command": "getNextTask", "args": {"assignee": "Agent-1"}}' | skyhook-cmd
echo '{"command": "claimTask", "args": {"assignee": "Agent-1", "level": "task"}}' | skyhook-cmd
echo '{"command": "heartbeatLease", "args": {"itemId": "TASK-001", "agentId": "Agent-1", "extendMinutes": 30}}' | skyhook-cmd
echo '{"command": "getBlockers", "args": {}}' | skyhook-cmd
echo '{"command": "trace", "args": {"id": "REQ-001"}}' | skyhook-cmd
echo '{"command": "impact", "args": {"id": "REQ-001"}}' | skyhook-cmd
echo '{"command": "untraced", "args": {}}' | skyhook-cmd
echo '{"command": "sync", "args": {}}' | skyhook-cmd
echo '{"command": "recordDecision", "args": {"title": "Use Redis", "decision": "...", "context": "..."}}' | skyhook-cmd
echo '{"command": "dashboard", "args": {"action": "start"}}' | skyhook-cmd
```

---

## 4. Command Reference

| Command | Description | Key Arguments |
|---|---|---|
| `listCurrentFeatures` | List features with status | `status?: all\|backlog\|in-progress\|done\|blocked` |
| `getFeature` | Get detailed feature info | `id: string` |
| `getNextTask` | Get highest priority ready item | `assignee?: string`, `level?: task\|story\|any` |
| `claimTask` | Atomically claim task with advisory lease | `assignee: string`, `taskId?: string`, `lease?: number` |
| `heartbeatLease` | Extend active advisory lease | `itemId: string`, `agentId: string`, `extendMinutes?: number` |
| `releaseLease` | Release active lease without completion | `taskId?: string`, `storyId?: string` |
| `updateStatus` | Update story status (FSM) | `storyId: string`, `status: string` |
| `updateTaskStatus` | Update fine-grained task status | `taskId: string`, `status: string` |
| `createTask` | Create fine-grained task under story/epic | `title: string`, `parentId: string`, `type?: string` |
| `createSubtask` | Add Definition of Done (DoD) checklist item | `taskId: string`, `title: string` |
| `updateSubtask` | Toggle completion of DoD checklist item | `taskId: string`, `subtaskId: string`, `completed: boolean` |
| `getBlockers` | List dependency-blocked backlog items | None |
| `recordDecision` | Auto-generate ADR with enforceable policies | `title, decision, context, category?` |
| `getContext` | Retrieve context packet for a topic | `topic?: string` |
| `sync` | Code vs documentation drift check | None |
| `trace` | Trace requirement to code, stories, and ADRs | `id: string` |
| `impact` | Blast-radius impact analysis | `id: string` |
| `untraced` | Identify untraced dark matter symbols | None |
| `dashboard` | On-demand web UI server | `action: start\|stop\|status`, `port?: number` |

---

## 5. Cybernetic Dashboard

```bash
# Start dashboard (port 31415, auto-hunting if occupied)
skyhook dashboard start
# Open http://127.0.0.1:31415

# Check status & PID
skyhook dashboard status

# Stop dashboard
skyhook dashboard stop
```

Dashboard Views:
- **Mission Control (`#/mission-control`)**: Real-time agent swarm telemetry, active task HUD, and WebSocket ping latency monitor.
- **Kanban Board (`#/kanban`)**: Multi-agent board with live ticking lease timers.
- **Topology (`#/topology`)**: Interactive SVG architecture and traceability graph.
- **Drift Center (`#/drift`)**: DDD layer violation scorecard and 1-click auto-adoption.
- **Decisions DAG (`#/decisions`)**: Interactive ADR lineage graph and comparative diffs.
- **Mermaid Studio (`#/mermaid`)**: Living Gantt charts and 1-click plan recompilation.
- **Dark Matter Radar (`#/dark-matter`)**: Untraced code heatmap and risk tiers.
- **Harness Center (`#/harness`)**: Poly-agent injector hub and offline MCP status.

---

## 6. Agent-Specific Guides

| Agent | Setup Guide |
|---|---|
| **Cursor AI** | Managed via `skyhook harness inject --target=cursor` |
| **OpenAI Codex** | [codex.md](codex.md) & `skyhook harness inject --target=codex` |
| **Claude Code** | [claude-code.md](claude-code.md) & `skyhook harness inject --target=claude-code` |
| **GitHub Copilot** | [copilot.md](copilot.md) & `skyhook harness inject --target=copilot` |
| **Codeium Windsurf** | Managed via `skyhook harness inject --target=windsurf` |
| **Google Antigravity**| Managed via `skyhook harness inject --target=antigravity` |
| **Cline / Roo Code** | Managed via `skyhook harness inject --target=cline` |
| **Gemini CLI** | [gemini-cli.md](gemini-cli.md) |

---

## 7. CI/CD Integration

```yaml
# .github/workflows/skyhook-drift.yml
name: Skyhook Governance Gate
on: [push, pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install Skyhook
        run: npm install -g @skyhook/cli
      - name: Verify ADR Policies & Codebase Drift
        run: |
          skyhook adr verify
          skyhook drift --boundaries
```
