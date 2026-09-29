# Tutorial 1: Zero to Governed Repository in 5 Minutes

This guide walks you through initializing Skyhook in a project, connecting AI coding agents, and enforcing your first architectural policy.

---

## Step 1: Initialize Skyhook in Your Repository

Run `init` from your repository root:
```bash
skyhook init --name="Fintech API" --profile=web-app
```
Skyhook will auto-detect your stack and create the `.skyhook/` directory structure:
```
.skyhook/
├── project.yaml
├── tech-stack.yaml
├── requirements/
├── backlog/
├── decisions/
└── plan/
```

---

## Step 2: Inject Governance Rules into Your AI Agents

Scan your workspace and auto-configure all installed agents (Cursor, Claude, Copilot, Windsurf, etc.):
```bash
skyhook harness inject --all
```
This writes isolated instruction blocks (e.g. `.cursor/rules/skyhook.mdc`, `CLAUDE.md`, `.github/copilot-instructions.md`) and configures local MCP servers without overwriting your existing settings.

---

## Step 3: Launch the Cybernetic Dashboard

Start the local web dashboard:
```bash
skyhook dashboard start
```
Open [http://127.0.0.1:31415](http://127.0.0.1:31415) to access the real-time Multi-Agent Kanban, Topology Graph, and Drift Center.

---

## Step 4: Add a Requirement & Backlog Story

Create your first requirement and child story:
```bash
skyhook add-feature "Double-Entry Ledger" --points 5
```

---

## Step 5: Claim the Task as an Agent

Have your agent claim the task to acquire an advisory lock and prevent collisions:
```bash
skyhook get-next-task --agent="Cursor-Cascade"
```

---

## Step 6: Record an Architectural Decision

Record an architectural standard:
```bash
skyhook decide "PostgreSQL with ACID Isolation" \
  "Use PostgreSQL serializable isolation" \
  "Financial ledger transfers require strict serialization guarantees"
```
Skyhook automatically generates `.skyhook/decisions/records/ADR-001.md` and indexes it.

---

## Step 7: Annotate Code and Verify

In your source code (e.g. `src/ledger/LedgerService.ts`), link the class to your requirement:
```typescript
// @skyhook-implements REQ-001
export class LedgerService {
  async executeTransfer() {
    // ...
  }
}
```

Now verify traceability:
```bash
skyhook trace REQ-001
```

And verify architectural compliance:
```bash
skyhook adr verify
```

You now have a fully governed, persistent, multi-agent workspace!
