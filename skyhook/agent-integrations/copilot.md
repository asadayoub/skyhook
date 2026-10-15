# Skyhook + GitHub Copilot Integration

Skyhook provides deep native integration with **GitHub Copilot** in VS Code, Cursor, and JetBrains IDEs by injecting persistent custom instructions and setting up the 100% offline MCP server.

---

## 1. Quick Setup

```bash
# 1. Install Skyhook globally
npm install -g @skyhook/cli

# 2. In your project, initialize Skyhook and inject Copilot harness:
cd your-project
skyhook init
skyhook harness inject --target=copilot
```

`skyhook harness inject --target=copilot` automatically configures:
- `.github/copilot-instructions.md`: Injects Skyhook governance rules, Task/Subtask hierarchy, and DoD checklist invariants.
- `.vscode/settings.json`: Configures the Skyhook MCP server with portable paths for Copilot MCP integration.

---

## 2. Copilot Custom Instructions (`.github/copilot-instructions.md`)

Copilot reads workspace custom instructions to align code completions with architectural rules:

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

## 3. Invoking Skyhook from Copilot Chat

When interacting with Copilot Chat in your IDE:

- **Claim next task**:
  `@skyhook get next task for agent Copilot`
- **Check active blockers**:
  `@skyhook what are the current blocked backlog items?`
- **Trace requirement**:
  `@skyhook trace REQ-001 to find which code implements it`
- **Verify architectural boundaries**:
  `@skyhook verify adr policies on src/`
- **Open Cybernetic Dashboard**:
  `skyhook dashboard start` (serves at [http://127.0.0.1:31415](http://127.0.0.1:31415))
