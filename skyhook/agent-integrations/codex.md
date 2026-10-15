# Skyhook + OpenAI Codex Integration

Skyhook seamlessly integrates with **OpenAI Codex** CLI and editor environments, providing offline MCP tools, automated instruction injection, and atomic task leases.

---

## 1. Quick Setup

```bash
# 1. Install Skyhook globally
npm install -g @skyhook/cli

# 2. In your project, initialize Skyhook and inject Codex harness:
cd your-project
skyhook init
skyhook harness inject --target=codex
```

`skyhook harness inject --target=codex` automatically configures:
- `.codex/agents.md` & `AGENTS.md`: Injects Skyhook governance rules, Task/Subtask hierarchy, and DoD checklist invariants.
- `.codex/mcp.json`: Registers the 100% offline Skyhook MCP server with portable paths.
- Codex CLI registration: Automatically invokes `codex mcp add skyhook -- ...` when the Codex CLI is detected in PATH.

---

## 2. MCP Server Configuration

You can also manually register Skyhook with Codex via CLI:
```bash
# Register standalone binary with Codex CLI
codex mcp add skyhook -- skyhook-mcp

# Or register using node and workspace script
codex mcp add skyhook -- node skyhook/cli/skyhook-mcp.js
```

Or verify `.codex/mcp.json`:
```json
{
  "mcpServers": {
    "skyhook": {
      "command": "node",
      "args": ["${workspaceFolder}/skyhook/cli/skyhook-mcp.js"]
    }
  }
}
```

---

## 3. Codex AGENTS.md Configuration

Skyhook maintains `.codex/agents.md` to instruct Codex models on backlog lifecycle, boundary rules, and traceability:

```markdown
<!-- SKYHOOK_RULES_START -->
# Skyhook Project Intelligence & Governance Rules

This repository is governed by Skyhook. As an AI Agent working in this codebase, you MUST adhere to the following rules:

1. **Backlog & Task Hierarchy (Epic ➔ Story ➔ Task ➔ Subtask)**:
   - Query 'skyhook_get_next_task' or 'skyhook_claim_task' (or inspect 'skyhook://backlog') before starting any feature work.
   - Acquire an advisory lease for your assigned task ('TASK-XXX') or story ('STORY-XXX') to avoid stepping on concurrent agent tasks.
   - For long-running tasks, extend your lease periodically using 'skyhook_heartbeat_lease'.
   - Respect Definition of Done (DoD) subtasks ('SUB-XXX'): complete all subtasks before transitioning the parent item to done.
   - Transition states using 'skyhook_update_status' or 'skyhook_update_task_status' (backlog -> ready -> in-progress -> in-review -> done).

2. **Architectural Governance & Boundary Policies**:
   - Never bypass Domain-Driven Design (DDD) module boundaries or introduce circular dependencies.
   - Call 'skyhook_verify_policies' before modifying code across modules.
   - If an architectural decision is made, record it via 'skyhook_record_decision'.

3. **Traceability Annotations**:
   - Tag exported symbols (classes, functions, interfaces) with JSDoc/docstring comments linking to story or requirement IDs:
     `@skyhook-implements REQ-XXX` or `@skyhook-story STORY-YYY`
   - Verify traceability using 'skyhook_trace_requirement' or the 'skyhook trace' CLI.
<!-- SKYHOOK_RULES_END -->
```

---

## 4. Key Agent Workflows

1. **Claiming Work**: Codex calls `skyhook_claim_task` (or `skyhook task claim`), receiving requirements, DoD checklists, and target source files.
2. **Lease Maintenance**: For long-running tasks, Codex calls `skyhook_heartbeat_lease` to keep its advisory lock active.
3. **Traceability Tagging**: Codex decorates exported functions with `// @skyhook-implements REQ-XXX`.
4. **Pre-Commit Verification**: Run `skyhook adr verify` to confirm zero architectural boundary breaches.
5. **HUD Telemetry**: View real-time agent activity on the cybernetic dashboard at [http://127.0.0.1:31415/#/mission-control](http://127.0.0.1:31415/#/mission-control).
