# Skyhook Architecture (v1.5.2)

Universal Project Intelligence & Architecture Governance for AI Agents.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    AI AGENT HARNESS LAYER                                       │
│          (Codex, Claude Code, Gemini CLI, GitHub Copilot, Antigravity IDE, Custom Agents)       │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │  stdio JSON protocol / CLI invocation
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     SKYHOOK ENGINE LAYER                                        │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  CLI Dispatcher (cli/skyhook.js)                                                          │  │
│  │  Commands & Subcommands: init, setup, discover, question, plan, standards, decide, sync,  │  │
│  │  trace, impact, untraced, coverage, mapLegacy, graph, dashboard, version, install, help   │  │
│  │  Subcommands:                                                                             │  │
│  │    • adr <bootstrap | draft | sync | verify | watch>                                      │  │
│  │    • hook <install | uninstall | status>                                                  │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Slash Command & Protocol Router (cli/skyhook-cmd.js)                                      │  │
│  │  36 stdio JSON commands covering Features, Tasks, ADRs, Traceability, Git Hooks & Graph   │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Core Architectural Sub-Systems & Engines                                                 │  │
│  │  • AST Code Tracer (lib/tracer.js): Babel AST parser, symbol extractor & legacy mapper    │  │
│  │  • ADR Synthesizer (lib/adr/ADRSynthesizer.js): Context-aware ADRs & dynamic Mermaid C4   │  │
│  │  • Living Sync Engine (lib/adr/ADRSyncEngine.js): Bi-directional Markdown ⇄ YAML sync    │  │
│  │  • Architectural Policy Guard (lib/adr/ADRPolicyGuard.js): AST prohibited-import enforcer │  │
│  │  • Live File Watcher (lib/adr/ADRWatcher.js): Real-time background sync on editor save    │  │
│  │  • Git Hook Manager (lib/git/GitHookManager.js): Pre-commit hook installer & governor    │  │
│  │  • Inference Engine (lib/inference/): 6 providers (PackageJson, Prisma, Config, etc.)     │  │
│  │  • Context Manager (lib/context.js & lib/yaml.js): State management & YAML persistence    │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │  reads / writes .skyhook/
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                PROJECT SKYHOOK STATE (.skyhook/)                                │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌───────────────────────────────────┐  │
│  │  project.yaml          │  │  requirements/         │  │  decisions/                       │  │
│  │  (type, profile, config)│  │  • functional.yaml      │  │  • index.yaml (registry)          │  │
│  └────────────────────────┘  │  • non-functional.yaml  │  │  • records/<ULID>.md (rich ADRs)  │  │
│  ┌────────────────────────┐  │  • constraints.yaml     │  └───────────────────────────────────┘  │
│  │  tech-stack.yaml       │  └────────────────────────┘  ┌───────────────────────────────────┐  │
│  │  (auto-detected stack) │  ┌────────────────────────┐  │  backlog/                         │  │
│  └────────────────────────┘  │  standards/            │  │  • epics.yaml (epics, stories)    │  │
│  ┌────────────────────────┐  │  (project overrides)   │  └───────────────────────────────────┘  │
│  │  trace-graph.md        │  └────────────────────────┘  ┌───────────────────────────────────┐  │
│  │  (Visual Decision DAG) │  ┌────────────────────────┐  │  changelog.md                     │  │
│  └────────────────────────┘  │  PROJECT_PLAN.md       │  │  (automated audit trail)          │  │
│                              └────────────────────────┘  └───────────────────────────────────┘  │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                │  scans codebase symbols & annotations
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      APPLICATION CODEBASE                                       │
│  // @skyhook-implements REQ-001 REQ-002                                                         │
│  export class AuthService { ... }                                                               │
│                                                                                                 │
│  // AST Policy Guard blocks prohibited imports (e.g., import axios from 'axios')                │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. CLI Layer (`skyhook/cli/skyhook.js`)

Provides terminal ergonomics with formatted output, colorful badges, table views, and JSON fallback:

| Command | Subcommands / Arguments | Purpose |
|---------|-------------------------|---------|
| `skyhook init` | `[--profile=...] [--variant=...] [--force]` | Initialize `.skyhook/` with auto-detected profile or custom template |
| `skyhook adr` | `bootstrap` | **Reverse-engineer baseline ADRs** for all discovered technologies in an existing project |
| | `draft` | Auto-detect architectural shifts or unrecorded dependencies and draft new ADRs |
| | `sync` | Bi-directionally sync living Markdown ADRs (`decisions/records/*.md`) with `index.yaml` |
| | `verify` | Check codebase compliance against accepted ADR policies and prohibited imports |
| | `watch` | Start real-time background file watcher for instant sync on editor save |
| `skyhook hook`| `install` | Install executable Git pre-commit hook in `.git/hooks/pre-commit` |
| | `uninstall` | Remove Skyhook Git pre-commit hook non-destructively |
| | `status` | Report Git hook status and configuration |
| `skyhook graph` | — | Generate visual Mermaid architecture graph & Decision DAG (`trace-graph.md`) |
| `skyhook trace` | `<REQ-ID>` | Trace requirement to stories, decisions, and AST-parsed code references |
| `skyhook impact`| `<REQ-ID>` | Analyze risk level and blast radius of changing a requirement |
| `skyhook untraced` | — | Surface implemented/in-progress requirements with zero codebase references |
| `skyhook coverage` | — | Calculate requirements and code traceability coverage percentages |
| `skyhook map-legacy` | `[--limit=N]` | Map untagged codebase symbols to candidate requirements |
| `skyhook sync` | — | Comprehensive drift detection across tech stack, requirements, and decisions |
| `skyhook decide`| `<title> <decision> <context>` | Record an architectural decision with auto-generated ADR |
| `skyhook plan` | — | Generate or refresh `PROJECT_PLAN.md` with milestones and risk analysis |
| `skyhook discover` | `[phase]` | Interactive requirements gathering workflow |
| `skyhook question` | `[category]` | Contextual questioning engine filtered by phase |
| `skyhook standards` | `[category]` | Display applicable engineering standards with project overrides |
| `skyhook dashboard` | `<start\|stop\|status>` | On-demand HTTP web dashboard (port 4343) |
| `skyhook setup` | `<codex\|claude\|gemini\|copilot\|all>` | Auto-configure native slash commands for agent harnesses |
| `skyhook profile` | `[name]` | Inspect profile details, variants, questions, and defaults |
| `skyhook version` | — | Output version, protocol info, and environment runtime |
| `skyhook help` | — | Comprehensive CLI help and command index |

---

### 2. Slash Command & JSON Protocol Layer (`skyhook/cli/skyhook-cmd.js`)

Provides stdio JSON protocol integration for all AI agent harnesses.
Invocation pattern:
```bash
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
```

**36 Protocol Commands:**

| Category | Commands |
|----------|----------|
| **Feature Management** | `listCurrentFeatures`, `getFeature`, `addFeature` |
| **Task Management** | `getNextTask`, `getBlockers`, `updateStatus` |
| **Decisions & ADRs** | `recordDecision`, `decide`, `syncAdr`, `verifyAdr`, `draftAdr`, `watchAdr`, `bootstrapAdr` |
| **Git Governance** | `hookInstall`, `hookUninstall`, `hookStatus` |
| **Traceability & AST** | `trace`, `impact`, `untraced`, `coverage`, `mapLegacy`, `graph` |
| **Drift & Sync** | `sync` |
| **Context & Plan** | `getContext`, `plan`, `standards`, `discover`, `question`, `profile` |
| **Lifecycle & Setup** | `init`, `setup`, `install`, `version`, `batchCreate`, `dashboard`, `help` |

---

### 3. Automated ADR Sub-Systems (`skyhook/lib/adr/`)

Skyhook replaces write-once, forgotten ADRs with a living, active architectural lifecycle:

1. **`ADRSynthesizer.js` (Visual Synthesis & Drafting)**:
   - Evaluates project profile, tech stack, and repository facts.
   - Generates rich Markdown documents containing contextual **Mermaid diagrams**:
     - C4 Component pipelines for Web Applications and APIs.
     - Database persistence diagrams for ORMs (Prisma, Drizzle) and databases (PostgreSQL, MySQL).
     - Sequence diagrams for Authentication flows.
   - Injects alternatives comparison tables, positive/negative/neutral consequences, and enforcement invariants.
2. **`ADRSyncEngine.js` (Bi-Directional Living Sync)**:
   - Scans `.skyhook/decisions/records/*.md` and `.skyhook/decisions/index.yaml`.
   - Parses Markdown frontmatter and headers using `ADRParser.js`.
   - Propagates status changes (e.g. `accepted` -> `deprecated`) from Markdown to YAML index.
   - Indexes newly created markdown files automatically.
   - Reconstructs missing markdown files from index entries.
3. **`ADRPolicyGuard.js` (Active Architectural Enforcement)**:
   - Parses policy invariants declared in ADRs (e.g. `prohibitedImports: ["axios"]`).
   - Scans JavaScript/TypeScript source files using AST parsing or regex.
   - Identifies exact line numbers, snippets, and violation messages.
   - Powers `skyhook adr verify` and Git pre-commit gating.
4. **`ADRWatcher.js` (Real-Time File Watcher Daemon)**:
   - Monitors `.skyhook/decisions/records/` using debounced filesystem watchers.
   - Triggers `ADRSyncEngine` instantly on editor save (`Cmd+S`).
5. **Baseline Reverse-Engineering (`bootstrapBaselineADRs`)**:
   - Analyzes brownfield codebases via `InferenceEngine`.
   - Generates foundational accepted ADRs for all discovered technologies (Next.js, Prisma, Tailwind, etc.).
   - Guarantees strict idempotency so re-runs never duplicate records.

---

### 4. Git Pre-Commit Hook Manager (`skyhook/lib/git/GitHookManager.js`)

Enforces "Decisions with Teeth":
- Installs `.git/hooks/pre-commit` with executable permissions (`chmod +x`).
- Runs `skyhook adr verify` before code is committed.
- Rejects commits that introduce prohibited dependencies or violate architectural invariants.
- Chains safely with existing pre-commit hooks non-destructively.

---

### 5. AST Code Tracer & Symbol Indexer (`skyhook/lib/tracer.js`)

Leverages `@babel/parser` and `@babel/traverse` to extract structural code intelligence:
- **Annotation Extraction**: Scans comments for `// @skyhook-implements REQ-001 REQ-002`.
- **Symbol Resolution**: Discovers functions, exported functions, classes, and methods.
- **Bi-Directional Traceability**: Links requirements to code symbols, backlog stories, and ADRs.
- **Impact Analysis**: Computes blast radius, risk level (low/medium/high), and affected files.
- **Untraced Detection**: Identifies requirements marked implemented but lacking code annotations.
- **Legacy Mapping (`map-legacy`)**: Suggests requirement mappings for existing untagged symbols.

---

### 6. Visual Traceability & Decision DAG (`skyhook/lib/handlers/sync.js`)

`skyhook graph` generates `.skyhook/trace-graph.md`:
- **Mermaid Graph Architecture**:
  - `subgraph Requirements`: Lists functional and non-functional requirements.
  - `subgraph Decisions`: Renders the complete **Decision DAG** timeline:
    - Status-specific styling (🏛️ accepted, ⚠️ superseded, 📝 draft).
    - Thick supersession arrows: `ADR_1 == "superseded by" ==> ADR_2`.
    - Governance arrows: `ADR_2 -. "governs" .-> REQ_001`.
  - `subgraph Codebase`: Renders source files and symbol nodes.
  - Traceability arrows connecting requirements to AST symbols: `REQ_001 --> S_0`.
- **Vertical Layout Enforcement**: Uses `direction TB` and invisible links (`~~~`) between subgraphs to prevent horizontal sprawl.

---

### 7. Inference Engine (`skyhook/lib/inference/`)

Extracts project architecture without configuration across 6 specialized providers:
- `PackageJsonProvider`: Detects dependencies, scripts, engines.
- `PrismaProvider`: Detects schemas, database providers (PostgreSQL, MySQL, SQLite).
- `ConfigProvider`: Detects Next.js, Vite, Tailwind, TypeScript configs.
- `DeploymentProvider`: Detects Docker, Vercel, Netlify, Fly.io, Railway.
- `MiddlewareProvider`: Detects auth pipelines, routing, logging.
- `ASTPatternProvider`: Inspects code patterns via AST.

---

### 8. State Directory Layout (`.skyhook/`)

```
.skyhook/
├── project.yaml              # Project metadata, profile, configuration
├── context.md                # Problem statement, solution overview, target audience
├── vision.md                 # Product vision, KPIs, personas, user journeys
├── requirements/
│   ├── functional.yaml       # Functional requirements (REQ-001, REQ-002...)
│   ├── non-functional.yaml   # Performance, security, scalability requirements
│   └── constraints.yaml      # Technical, budget, regulatory constraints
├── decisions/
│   ├── index.yaml            # Decision registry with statuses and supersessions
│   └── records/              # Full living ADR Markdown files (<ULID>.md)
├── backlog/
│   └── epics.yaml            # Epics, stories, acceptance criteria, WSJF priority
├── tech-stack.yaml           # Discovered & recorded technology stack
├── ux/
│   └── styleguide.md         # Design system tokens and component specs
├── standards/                # Project-specific standards overrides
├── changelog.md              # Automated audit log of all project mutations
└── trace-graph.md            # Generated visual Decision DAG & traceability graph
```

---

## Compatibility & Standards

- **Runtime**: Node.js ≥ 18.0.0 (Pure ES Modules).
- **Zero External Runtime Daemons**: Standard command execution via CLI or stdio JSON.
- **Portability**: Plain Markdown and YAML files stored in Git alongside source code.
- **Agent Interoperability**: Compatible with Codex, Claude Code, Gemini CLI, GitHub Copilot, and Google Antigravity.
