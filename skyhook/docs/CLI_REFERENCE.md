# Skyhook CLI Reference Manual

The `skyhook` executable provides over **60 commands and subcommands** across 10 operational domains for architecture governance, multi-agent backlog coordination, polyglot AST code tracing, system diagnostics, and cybernetic dashboard management.

---

## Command Categories
- [Setup & Workspace Initialization](#setup--workspace-initialization)
- [System Diagnostics & Health Check](#system-diagnostics--health-check)
- [Multi-Agent Backlog & Task Coordination](#multi-agent-backlog--task-coordination)
- [Modular Backlog Storage & Semantic Git Merge Driver](#modular-backlog-storage--semantic-git-merge-driver)
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

## System Diagnostics & Health Check

### `skyhook doctor`
Runs comprehensive system health and diagnostic checks across the Node.js runtime, standalone binary availability, local offline dashboard assets, network port availability, Git repository boundary cleanliness, and `.skyhook/` schema specifications.
```bash
skyhook doctor [--port <number>] [--no-color] [--json]
```
- **Options**:
  - `--port <number>`: Target port to verify for dashboard availability (defaults to `31415`).
  - `--no-color`: Suppresses ANSI terminal colors for raw log piping.
  - `--json`: Returns complete diagnostic health report as structured JSON.
- **Diagnostics Evaluated**:
  1. `node_version`: Confirms Node.js runtime is 18.0.0 or newer.
  2. `binaries`: Verifies existence and executable permissions of all 4 standalone binaries (`skyhook`, `skyhook-cmd`, `skyhook-mcp`, `skyhook-merge-driver`).
  3. `dashboard_assets`: Verifies local air-gapped vendored dashboard assets (`vendor/mermaid.min.js`) exist without remote CDN calls.
  4. `dashboard_port`: Probes port availability on `127.0.0.1` to ensure collision-free web dashboard startup.
  5. `git_cleanliness`: Audits repository boundaries, untracked transient artifacts, and `.gitignore` integrity.
  6. `schema_validation`: Audits YAML specifications in `.skyhook/` (`project.yaml`, `tech-stack.yaml`, requirements, backlog) against defined schemas.
- **Example**:
  ```bash
  skyhook doctor
  ```
- **Terminal Output**:
  ```
  🩺 Skyhook System Doctor
  ======================================
  ✔ Node.js Runtime: v20.18.0 (>= 18.0.0 required)
  ✔ Executable Binaries: 4/4 present (skyhook, skyhook-cmd, skyhook-mcp, skyhook-merge-driver)
  ✔ Dashboard Assets: 100% offline air-gapped (/vendor/mermaid.min.js present)
  ✔ Port Probing: Port 31415 is available for web dashboard
  ✔ Git Cleanliness: Clean repository boundary (clean working tree)
  ✔ Schema Health: 5/5 valid specifications (.skyhook/ configuration verified)
  ======================================
  System Status: ✅ HEALTHY (6 passed, 0 warnings, 0 errors)
  ```

---

## Multi-Agent Backlog & Task Coordination

### `skyhook get-next-task`
Acquires the next highest-priority ready task or story from the backlog and issues an advisory agent lease.
```bash
skyhook get-next-task [--agent <name>] [--level task|story|any] [--story <story-id>] [--epic <epic-id>] [--type <type>] [--lease <mins>] [--json]
```
- **Options**:
  - `--agent <string>`: Identifier of the agent claiming the task (e.g. `Codex-01`, `Cursor-Cascade`).
  - `--level <task|story|any>`: Level of granularity (defaults to `any`: selects highest-priority ready task, falling back to ready story).
  - `--story <string>`: Filter tasks under a specific story ID.
  - `--epic <string>`: Filter tasks or stories under a specific parent Epic ID.
  - `--type <string>`: Filter by work item type (`feature`, `bug`, `chore`, `spike`, `test`, `refactor`).
  - `--lease <number>`: Lease duration in minutes (default: 30).
- **Example**:
  ```bash
  skyhook get-next-task --agent="Codex-01" --level=task
  ```
- **Example Output**:
  ```
  ✓ Task [TASK-003] - Implement refresh token rotation handler
  Status: ready | Priority: high | Parent: story:STORY-001
  Leased by: Codex-01 (expires: 2026-10-02T19:30:00.000Z)
  Subtasks (1/2 completed):
    ☑ [SUB-001] Invalidate prior token
    ☐ [SUB-002] Issue cryptographic rotating pair
  ```

---

### `skyhook task claim`
Explicitly claims a specific task by ID, verifies advisory lock availability, issues an agent lease, checks for AST target file overlap warnings, and automatically triggers living plan recompilation.
```bash
skyhook task claim <task-id> [--agent <name>] [--lease <mins>] [--skipPlanRecompile] [--json]
```
- **Options**:
  - `<task-id>`: Specific ID of the task to claim (e.g. `TASK-001`).
  - `--agent <string>`: Identifier of the agent claiming the task (e.g. `Claude-Code`, `Cursor-Cascade`).
  - `--lease <number>`: Lease TTL duration in minutes (default: 30).
  - `--skipPlanRecompile`: Suppresses automatic `PROJECT_PLAN.md` recompilation during high-throughput batch task execution.
- **Example**:
  ```bash
  skyhook task claim TASK-001 --agent="Claude-Code"
  ```

---

### `skyhook task add`
Creates a fine-grained task under an existing Story or Epic with optional target file conflict prevention and subtask checklist.
```bash
skyhook task add <title> --parent <story-id|epic-id> [--type <feature|bug|chore|spike|test|refactor>] [--priority <critical|high|medium|low>] [--targetFiles <files>] [--points <number>]
```
- **Example**:
  ```bash
  skyhook task add "Implement OAuth PKCE code challenge" --parent=STORY-001 --type=feature --priority=high --targetFiles="lib/auth/pkce.js"
  ```

---

### `skyhook task list`
Lists fine-grained tasks in the backlog with optional parent, status, or type filtering.
```bash
skyhook task list [<parent-id>] [--status <status>] [--type <type>] [--priority <priority>]
```
- **Example**:
  ```bash
  skyhook task list STORY-001
  ```

---

### `skyhook task view`
Displays detailed information for a specific task including subtasks, active agent lease, and target files.
```bash
skyhook task view <task-id>
```

---

### `skyhook task update`
Transitions a task status through the Agile state machine with automatic parent story status rollup.
```bash
skyhook task update <task-id> <new-status> [--force]
```
- **Example**:
  ```bash
  skyhook task update TASK-001 in-progress
  ```

---

### `skyhook task heartbeat`
Extends an active lease on a task or story during long-running agent workflows to prevent lease timeout.
```bash
skyhook task heartbeat <task-id> --agent <agent-id> [--extendMinutes <number>]
```

---

### `skyhook subtask add`
Adds a checklist subtask to a task's Definition of Done (DoD).
```bash
skyhook subtask add <task-id> <subtask-title>
```
- **Example**:
  ```bash
  skyhook subtask add TASK-001 "Write unit test for token expiry"
  ```

---

### `skyhook subtask toggle`
Toggles or sets the completion status of a checklist subtask.
```bash
skyhook subtask toggle <task-id> <subtask-id> [--completed <true|false>]
```
- **Example**:
  ```bash
  skyhook subtask toggle TASK-001 SUB-001
  ```

---

### `skyhook story add`
Creates a new story under an epic.
```bash
skyhook story add <title> [--epic <epic-id>] [--points <number>] [--priority <priority>]
```

---

### `skyhook update-status`
Transitions a story or task across the finite state machine:
$$\text{backlog} \longrightarrow \text{ready} \longrightarrow \text{in-progress} \longrightarrow \text{in-review} \longrightarrow \text{done}$$
```bash
skyhook update-status <item-id> <new-status> [--force]
```
- **Options**:
  - `<item-id>`: ID of the story or task (e.g. `STORY-002`, `TASK-001`).
  - `<new-status>`: Target status (`backlog`, `ready`, `in-progress`, `in-review`, `done`).
  - `--force`: Overrides prerequisite dependency blocking, uncompleted subtask DoD checks, or invalid leap prevention.
- **Example**:
  ```bash
  skyhook update-status STORY-002 in-progress
  ```

---

### `skyhook backlog release`
Explicitly releases an active agent lease on a story or task, returning the item to the ready pool.
```bash
skyhook backlog release <item-id>
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

## Modular Backlog Storage & Semantic Git Merge Driver

### `skyhook backlog migrate`
Migrates the repository backlog storage format between the legacy monolithic `epics.yaml` layout and the modular directory structure (`.skyhook/backlog/epics/`, `.skyhook/backlog/stories/`, `.skyhook/backlog/tasks/`).
```bash
skyhook backlog migrate [--target <modular|monolithic>]
```
- **Options**:
  - `--target <modular|monolithic>`: Target layout format. Defaults to `modular`.
- **Benefits of Modular Layout**:
  - Isolates concurrent branch mutations into separate YAML files.
  - Enables clean git status diffs when multiple agents work on independent epics or stories.
  - Eliminates file collisions when paired with `skyhook-merge-driver`.

---

### `skyhook-merge-driver`
A standalone 3-way semantic Git merge driver executable designed to merge concurrent backlog changes across branches without conflicts.
```bash
skyhook-merge-driver <ancestor-file> <current-file> <other-file> <pathname>
```
- **How It Works**:
  1. Parses ancestor (`%O`), current (`%A`), and incoming (`%B`) YAML files.
  2. Detects concurrent task additions, status advancements, and subtask toggles.
  3. Reconciles non-overlapping field updates semantically rather than line-by-line.
  4. Writes the merged result to current (`%A`) and exits with code 0 on clean merge.
- **Git Registration**:
  ```bash
  git config merge.skyhook-backlog.name "Skyhook Backlog 3-Way Merge Driver"
  git config merge.skyhook-backlog.driver "skyhook-merge-driver %O %A %B %P"
  ```
  And declare in `.gitattributes`:
  ```gitattributes
  .skyhook/backlog/** merge=skyhook-backlog
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
Traces a requirement ID to linked stories, governing ADRs, code references, and API specification contracts using the 3-Tier Traceability Resolver.
```bash
skyhook trace <requirement-id> [--map <file-path>] [--no-cache] [--reindex] [--json]
```
- **Options**:
  - `<requirement-id>`: ID of the requirement to trace (e.g. `REQ-001`).
  - `--map <file-path>`: Appends a non-intrusive declarative mapping entry to `.skyhook/requirements/mapping.yaml` (Tier 2 traceability for unannotated/third-party files).
  - `--no-cache`: Bypasses the incremental disk symbol cache (`.skyhook/.cache/symbols.json`) and forces fresh AST extraction.
  - `--reindex`: Invalidates the symbol cache and re-indexes all repository source files.
- **Example**:
  ```bash
  # Standard trace query
  skyhook trace REQ-001

  # Non-intrusively map an unannotated file to a requirement
  skyhook trace REQ-001 --map "src/auth/legacyService.js"
  ```
- **Output**:
  ```
  ℹ Requirement: REQ-001 (Double Entry Ledger)

  🏛️ Governing Architectural Decisions (ADRs):
  ┌─────────┬─────────┬──────────────┬────────────────────────┬────────────┐
  │ (index) │ id      │ status       │ title                  │ file       │
  ├─────────┼─────────┼──────────────┼────────────────────────┼────────────┤
  │ 0       │ ADR-002 │ 'accepted'   │ 'PostgreSQL Isolation' │ 'ADR-002.md'│
  └─────────┴─────────┴──────────────┴────────────────────────┴────────────┘

  💻 Source Implementations (2):
  ┌─────────┬───────────────────────┬──────────────────────────┬──────────────┬──────┐
  │ (index) │ file                  │ symbol                   │ type         │ line │
  ├─────────┼───────────────────────┼──────────────────────────┼──────────────┼──────┤
  │ 0       │ 'src/ledger/Service.ts'│ 'LedgerService'          │ 'class'      │ 14   │
  │ 1       │ 'src/ledger/Service.ts'│ 'executeTransfer'        │ 'function'   │ 42   │
  └─────────┴───────────────────────┴──────────────────────────┴──────────────┴──────┘

  📑 Derived API Contracts & Specs (1):
  ┌─────────┬───────────────────────┬──────────────────────────┬─────────────────────┬──────┐
  │ (index) │ file                  │ symbol                   │ type                │ line │
  ├─────────┼───────────────────────┼──────────────────────────┼─────────────────────┼──────┤
  │ 0       │ 'specs/openapi.yaml'  │ 'POST /api/v1/transfer'  │ 'contract-endpoint' │ 18   │
  └─────────┴───────────────────────┴──────────────────────────┴─────────────────────┴──────┘
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
