# Skyhook CLI Reference Manual

The `skyhook` executable provides over **40 commands and subcommands** for architecture governance, multi-agent backlog coordination, polyglot AST code tracing, and cybernetic dashboard management.

---

## Command Categories
- [Setup & Workspace Initialization](#setup--workspace-initialization)
- [Multi-Agent Backlog & Task Coordination](#multi-agent-backlog--task-coordination)
- [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
- [Architecture Drift & Quality Governance](#architecture-drift--quality-governance)
- [Polyglot AST Traceability & Coverage](#polyglot-ast-traceability--coverage)
- [Agent Harnesses & Offline MCP Server](#agent-harnesses--offline-mcp-server)
- [Cybernetic Web Dashboard](#cybernetic-web-dashboard)
- [Discovery & Standards](#discovery--standards)

---

## Global Options
The following flags can be passed to any `skyhook` command:

| Flag | Description |
|---|---|
| `--json` | Formats output as raw, structured JSON for AI agent consumption. |
| `--dir <path>` | Specifies custom project root directory (defaults to current working directory). |
| `--help`, `-h` | Prints detailed syntax and option descriptions for the command. |

---

## Setup & Workspace Initialization

### `skyhook init`
Initializes a new `.skyhook/` governance directory in the current workspace.
```bash
skyhook init [--name <project-name>] [--profile <profile>] [--force]
```
- **Options**:
  - `--name <string>`: Human-readable project name.
  - `--profile <string>`: Base architecture profile (`web-app`, `saas`, `api-service`, `cli-tool`, `ai-agent`, `library`).
  - `--force`: Overwrites existing `.skyhook/` configuration without prompting.
- **Example**:
  ```bash
  skyhook init --name="Fintech Core" --profile=saas
  ```
- **Terminal Output**:
  ```
  ✓ Skyhook workspace initialized at .skyhook
  ℹ Profile: saas
  ℹ Stack auto-detected: Node.js (v18+), PostgreSQL, TypeScript
  ```

---

### `skyhook setup`
Auto-configures AI agent instruction files and governance rules in the repository.
```bash
skyhook setup [--agent <agent-id>] [--dry-run]
```
- **Options**:
  - `--agent <id>`: Target agent (`cursor`, `claude-desktop`, `claude-code`, `copilot`, `windsurf`, `antigravity`, `cline`).
  - `--dry-run`: Displays file changes without writing to disk.

---

### `skyhook version`
Prints the Skyhook CLI version and engine metadata.
```bash
skyhook version
```

---

## Multi-Agent Backlog & Task Coordination

### `skyhook get-next-task`
Acquires the next highest-priority ready task from the backlog and issues an advisory agent lease.
```bash
skyhook get-next-task [--agent <name>] [--epic <epic-id>] [--json]
```
- **Options**:
  - `--agent <string>`: Identifier of the agent claiming the task (e.g. `Cursor-Cascade`).
  - `--epic <string>`: Filter ready tasks to a specific parent Epic ID.
- **Example**:
  ```bash
  skyhook get-next-task --agent="Cursor-01"
  ```
- **Example Output**:
  ```
  ✓ Acquired task STORY-002: Double Entry Ledger
  ℹ Priority: High (WSJF: 12.5) | Story Points: 5
  ℹ Acceptance Criteria:
    1. Transaction commits must be atomic
    2. Sum of debits must equal sum of credits
  ℹ Advisory lease active for: 60 minutes
  ```

---

### `skyhook update-status`
Transitions a story across the finite state machine:
$$\text{backlog} \longrightarrow \text{ready} \longrightarrow \text{in-progress} \longrightarrow \text{in-review} \longrightarrow \text{done}$$
```bash
skyhook update-status <story-id> <new-status> [--force]
```
- **Options**:
  - `<story-id>`: ID of the story (e.g. `STORY-002`).
  - `<new-status>`: Target status (`backlog`, `ready`, `in-progress`, `in-review`, `done`).
  - `--force`: Overrides prerequisite dependency blocking or invalid leap prevention.
- **Example**:
  ```bash
  skyhook update-status STORY-002 in-progress
  ```

---

### `skyhook backlog release`
Explicitly releases an active agent lease, returning the task to the ready pool.
```bash
skyhook backlog release <story-id>
```

---

### `skyhook backlog events`
Displays recent transactions recorded in `.skyhook/backlog/events.jsonl`.
```bash
skyhook backlog events [--limit <number>]
```

---

### `skyhook backlog replay`
Replays the event ledger from genesis to reconstitute and verify the backlog state.
```bash
skyhook backlog replay
```

---

### `skyhook get-blockers`
Lists all tasks blocked by incomplete prerequisite dependencies.
```bash
skyhook get-blockers
```

---

### `skyhook list-features`
Lists all features, epics, and child stories with their current statuses.
```bash
skyhook list-features [--status <status>]
```

---

### `skyhook add-feature`
Adds a new feature or story to the backlog.
```bash
skyhook add-feature <title> [--epic <epic-id>] [--points <number>] [--criteria <criteria-json>]
```

---

## Architecture Decision Records (ADRs)

### `skyhook decide`
Records an architectural decision and writes a structured ADR file with auto-generated Mermaid diagram.
```bash
skyhook decide <title> <decision> [context]
```
- **Example**:
  ```bash
  skyhook decide "PostgreSQL for Ledger" "Use PostgreSQL with Serializable Isolation" "Financial transactions require strict ACID guarantees"
  ```

---

### `skyhook adr bootstrap`
Reverse-engineers baseline ADRs for all discovered technologies in an existing repository.
```bash
skyhook adr bootstrap [--overwrite]
```

---

### `skyhook adr draft`
Synthesizes a draft ADR based on newly detected packages or architecture changes.
```bash
skyhook adr draft <title> <decision>
```

---

### `skyhook adr review`
Transitions an ADR from `draft` to `under-review`.
```bash
skyhook adr review <adr-id>
```

---

### `skyhook adr supersede`
Supersedes an existing accepted ADR with a newly accepted ADR, generating warning callouts and updating the Decision DAG.
```bash
skyhook adr supersede <old-adr-id> <new-adr-id>
```
- **Example**:
  ```bash
  skyhook adr supersede ADR-001 ADR-004
  ```

---

### `skyhook adr verify`
Scans codebase imports and symbols against active ADR boundary policies.
```bash
skyhook adr verify
```
- **Exit Code**: Returns `0` if compliant; returns `1` if prohibited imports are found.

---

### `skyhook adr sync`
Bi-directionally synchronizes Markdown files in `decisions/records/*.md` with `.skyhook/decisions/index.yaml`.
```bash
skyhook adr sync
```

---

### `skyhook adr watch`
Starts a real-time background file watcher that re-synchronizes ADRs whenever files are saved in your editor.
```bash
skyhook adr watch
```

---

### `skyhook adr dag`
Outputs the Mermaid syntax for the Decision Lineage Directed Acyclic Graph (DAG).
```bash
skyhook adr dag
```

---

### `skyhook adr compile`
Compiles all active ADR rules into AST policy checks.
```bash
skyhook adr compile
```

---

### `skyhook adr intercept`
Scans package manifests and migrations to discover unrecorded architectural additions.
```bash
skyhook adr intercept
```

---

## Architecture Drift & Quality Governance

### `skyhook drift`
Runs full architecture drift analysis across tech stack, boundaries, and semantic rules.
```bash
skyhook drift [--boundaries] [--c4] [--semantic] [--fix]
```
- **Flags**:
  - `--boundaries`: Enforces Domain-Driven Design (DDD) layer separation rules and detects circular dependencies.
  - `--c4`: Diffs reverse-engineered C4 Container model against baseline.
  - `--semantic`: Runs AST code hygiene checks (raw SQL, `process.env`, `console.log`).
  - `--fix`: Automatically adopts newly detected dependencies into `tech-stack.yaml`.
- **Directory Exclusions**:
  - Automatically ignores package and virtualenv directories: `.venv`, `venv`, `env`, `.env`, `node_modules`, `dist`, `build`, `target`, `bin`, `obj`, `.tox`, `.nox`, `.pytest_cache`, `.mypy_cache`, `__pycache__`, `vendor`, `Pods`, and `.gemini`.
  - Automatically parses `.gitignore` in project root.
  - Supports custom workspace exclusions via `ignoreDirs` in `.skyhook/project.yaml`, `.skyhook/architecture-boundaries.yaml`, or `.skyhook/drift.yaml`.

---

### `skyhook hook install`
Installs the executable Git pre-commit architectural guard in `.git/hooks/pre-commit`.
```bash
skyhook hook install
```

---

### `skyhook hook uninstall`
Non-destructively removes the Skyhook Git pre-commit hook.
```bash
skyhook hook uninstall
```

---

### `skyhook hook status`
Checks whether the Git pre-commit hook is installed and active.
```bash
skyhook hook status
```

---

## Polyglot AST Traceability & Coverage

### `skyhook trace`
Traces a requirement ID to user stories, ADRs, and AST-parsed code references.
```bash
skyhook trace <requirement-id>
```
- **Example**:
  ```bash
  skyhook trace REQ-001
  ```
- **Output**:
  ```
  ℹ Requirement: REQ-001 (Double Entry Ledger)
  ┌───────────────────────┬──────────────────────────┬──────────────┬──────┐
  │ File                  │ Symbol                   │ Type         │ Line │
  ├───────────────────────┼──────────────────────────┼──────────────┼──────┤
  │ src/ledger/Service.ts │ LedgerService            │ Class        │ 14   │
  │ src/ledger/Service.ts │ executeTransfer          │ Method       │ 42   │
  └───────────────────────┴──────────────────────────┴──────────────┴──────┘
  ```

---

### `skyhook impact`
Analyzes the blast radius, risk level, and affected files if a requirement is modified.
```bash
skyhook impact <requirement-id>
```

---

### `skyhook untraced`
Surfaces in-progress or completed requirements with zero codebase references.
```bash
skyhook untraced
```

---

### `skyhook coverage`
Calculates overall AST code coverage percentage and untraced symbols.
```bash
skyhook coverage
```

---

### `skyhook dark-matter`
Generates the untraced code radar, reporting total codebase symbols versus traced symbols with risk tiers.
```bash
skyhook dark-matter
```

---

### `skyhook map-legacy`
Analyzes untagged legacy code symbols and suggests candidate requirement links based on AST heuristics.
```bash
skyhook map-legacy [--limit <number>]
```

---

### `skyhook graph`
Compiles visual architecture diagrams and Decision DAG into `.skyhook/trace-graph.md`.
```bash
skyhook graph
```

---

### `skyhook plan`
Compiles the living master project plan `.skyhook/plan/PROJECT_PLAN.md` with dynamic Mermaid Gantt charts and capacity forecasts.
```bash
skyhook plan [--scoped]
```
- **Flags**:
  - `--scoped`: Also generates detailed requirement plans in `.skyhook/plan/requirements/` and epic plans in `.skyhook/plan/epics/`.

---

### `skyhook sync`
Executes comprehensive project-wide synchronization: refreshes agent rules, recompiles living plans, checks drift, and validates boundaries.
```bash
skyhook sync
```

---

## Agent Harnesses & Offline MCP Server

### `skyhook harness detect`
Scans workspace and host OS to identify installed AI agents and editors.
```bash
skyhook harness detect
```

---

### `skyhook harness status`
Reports injection and governance status across all 8 supported harnesses (Cursor, Claude Desktop, Claude Code, GitHub Copilot, Windsurf, Antigravity, Cline, and OpenAI Codex).
```bash
skyhook harness status
```

---

### `skyhook harness inject`
Injects rules and MCP configurations into detected or specified agent environments.
```bash
skyhook harness inject [--target <agents>] [--all] [--dry-run]
```
- **Options**:
  - `--target <list>`: Comma-separated list (e.g. `--target=cursor,windsurf,codex`).
  - `--all`: Injects across all detected agents.
  - Automatically invokes native `codex mcp add` when targeting OpenAI Codex.

---

### `skyhook harness remove`
Cleanly uninstalls Skyhook rules and MCP servers from specified agent configurations.
```bash
skyhook harness remove [--target <agents>]
```

---

### `skyhook mcp`
Launches the 100% offline Model Context Protocol server.
```bash
skyhook mcp [--stdio] [--sse] [--port <number>]
```
- **Options**:
  - `--stdio`: Standard I/O transport (default, used by Cursor, OpenAI Codex, Claude Desktop, Windsurf, Cline).
  - `--sse`: Local HTTP Server-Sent Events loopback transport on `127.0.0.1`.
  - `--port <number>`: Port for SSE server (defaults to 31415).

---

## Cybernetic Web Dashboard

### `skyhook dashboard start`
Starts the cybernetic dashboard HTTP and WebSocket server.
```bash
skyhook dashboard start [--port <number>]
```
- **Options**:
  - `--port <number>`: Custom port (defaults to auto-hunting starting at 31415).

---

### `skyhook dashboard status`
Reports the status, PID, port, and URL of the running dashboard server.
```bash
skyhook dashboard status
```

---

### `skyhook dashboard stop`
Stops the running dashboard background server.
```bash
skyhook dashboard stop
```

---

## Discovery & Standards

### `skyhook discover`
Runs an interactive requirements gathering interview workflow.
```bash
skyhook discover [phase]
```

---

### `skyhook question`
Generates contextual architectural questions tailored to the current implementation phase.
```bash
skyhook question [category]
```

---

### `skyhook standards`
Modular engineering standards catalog, exploration, and verification.
```bash
# List all active standards (optionally filter by domain)
skyhook standards [list] [domain]

# View detailed guidelines, criteria, and rules for a standard
skyhook standards view <id>

# Scaffold a new workspace-custom engineering standard
skyhook standards new <id> [title]

# Run automated validation of codebase against standards rules
skyhook standards verify [id]
```
