# Skyhook Installation & Packaging Guide (v2.0.0)

## Overview

Skyhook is an open-source, universal project intelligence and active architectural governance engine for AI coding agents and human engineering teams. It operates 100% offline and local-first, persisting structured project state, architectural decision records, Definition of Done checklists, and polyglot AST traceability directly in your repository.

**Repository:** https://github.com/asadayoub/skyhook  
**Latest Release:** https://github.com/asadayoub/skyhook/releases/latest  
**Current Version:** `2.0.0`

---

## 🚀 Quick Install Options

### Option 1: Global Installation via npm (Recommended)

Install Skyhook globally to access all 4 command-line executables anywhere:

```bash
npm install -g skyhook
```

Verify your installation:
```bash
skyhook version
```

---

### Option 2: Zero-Install Instant Invocation (npx)

Run any Skyhook command instantly without a global installation:

```bash
# Initialize a project
npx skyhook init --name="Fintech Core" --profile=saas

# Query next ready task
npx skyhook get-next-task

# Run system health diagnostics
npx skyhook doctor
```

---

### Option 3: Local Repository Clone & Development

If you are contributing to Skyhook or extending internal parsers:

```bash
# Clone the repository
git clone https://github.com/asadayoub/skyhook.git
cd skyhook

# Install dependencies
npm install

# Link binaries globally to your PATH
npm link

# Run automated verification tests
npm test
```

---

## 📦 The 4 Standalone Executables

Skyhook publishes 4 distinct executable binaries configured in `package.json`:

| Binary | Description | Primary Consumers |
|---|---|---|
| **`skyhook`** | Positional command-line interface with ANSI color output and rich tables. | Human developers, terminal operators, CI/CD pipelines. |
| **`skyhook-cmd`** | Headless stdio JSON protocol processor (`echo '{"command":"..."}' \| skyhook-cmd`). | IDE extensions, agent subshells, shell scripts. |
| **`skyhook-mcp`** | 100% offline Model Context Protocol server exposing 46 tools and 11 streaming resources over stdio / SSE. | Cursor, Claude Desktop, Windsurf, Copilot, Codex, Cline. |
| **`skyhook-merge-driver`** | 3-way semantic Git merge driver for conflict-free concurrent backlog branches. | Git engine during multi-agent merges. |

---

## 🔀 Configuring the 3-Way Git Merge Driver

When multiple developers or concurrent AI agents work on backlog items simultaneously on different git branches, merging `epics.yaml` or modular backlog files can lead to git merge conflicts. Skyhook provides a native 3-way semantic merge driver to resolve these automatically:

### 1. Register the Driver in Git Config
```bash
git config merge.skyhook-backlog.name "Skyhook Backlog 3-Way Merge Driver"
git config merge.skyhook-backlog.driver "skyhook-merge-driver %O %A %B %P"
```

### 2. Configure Repository Attributes (`.gitattributes`)
In your project repository root, ensure `.gitattributes` contains:
```gitattributes
.skyhook/backlog/** merge=skyhook-backlog
```

*(Tip: Running `skyhook hook install` automatically registers this merge driver and configures Git lifecycle hooks).*

---

## 🔌 Poly-Agent Harness Auto-Configuration

After installing Skyhook, auto-configure your installed AI coding agents:

```bash
# Auto-detect and configure all installed agents
skyhook harness inject --all

# Or target specific environments
skyhook harness inject --target=cursor,windsurf,codex
skyhook setup claude
skyhook setup gemini
```

### Supported AI Agent Matrix
- **Cursor**: Injects `.cursor/rules/skyhook.mdc` and `.cursor/mcp.json`.
- **Claude Desktop / Claude Code**: Merges `claude_desktop_config.json` and injects `CLAUDE.md`.
- **GitHub Copilot**: Injects `.github/copilot-instructions.md` and `.vscode/settings.json`.
- **Codeium Windsurf**: Injects `.windsurfrules` and `.codeium/windsurf/mcp_config.json`.
- **Google Antigravity**: Injects `.agents/rules/skyhook-governance.md` and `.agents/mcp_config.json`.
- **Cline / Roo Code**: Injects `.clinerules` and `cline_mcp_settings.json`.
- **OpenAI Codex**: Injects `.codex/agents.md`, `.codex/mcp.json`, and registers via `codex mcp add`.

---

## 🩺 System Verification & Diagnostic Health Check

Verify your installation and workspace health by running the diagnostic engine:

```bash
# Check version information
skyhook version

# Run comprehensive system diagnostics
skyhook doctor
```

The diagnostic doctor checks:
1. **Node.js Environment**: Confirms Node 18+ runtime version.
2. **Global & Workspace Binaries**: Confirms executable availability.
3. **Dashboard Asset Integrity**: Verifies local air-gapped `/vendor/mermaid.min.js` assets.
4. **Port Availability**: Probes default port `31415` for conflict-free dashboard startup.
5. **Git Cleanliness**: Validates repository boundary and `.gitignore` hygiene.
6. **Schema Validation**: Audits `.skyhook/` YAML specifications against schemas.

---

## 🗂️ Project Directory Structure (`.skyhook/`)

Running `skyhook init` in any repository generates the following structure:

```
your-project/
├── .skyhook/                        # Version-controlled project intelligence
│   ├── project.yaml                 # Project metadata, profile, and settings
│   ├── tech-stack.yaml              # Declared vs inferred dependencies
│   ├── requirements/                # Structured requirements
│   │   ├── functional.yaml          # Functional requirements & WSJF priorities
│   │   ├── non-functional.yaml      # Non-functional constraints (SLA, security)
│   │   ├── constraints.yaml         # Business & regulatory constraints
│   │   └── mapping.yaml             # Tier 2 non-intrusive symbol mapping manifest
│   ├── backlog/                     # Living backlog & multi-agent concurrency
│   │   ├── epics.yaml               # Monolithic backlog store (or modular layout)
│   │   ├── epics/                   # Granular epic definitions (modular layout)
│   │   ├── stories/                 # Granular user stories (modular layout)
│   │   ├── tasks/                   # Granular tasks & DoD subtasks (modular layout)
│   │   ├── events.jsonl             # Append-only audit trail and agility metrics
│   │   └── .lock                    # Advisory cross-process concurrency lock
│   ├── decisions/                   # Architecture Decision Records (ADRs)
│   │   ├── index.yaml               # Fast decision registry & status index
│   │   └── records/*.md             # Markdown ADRs with compiled policy rules
│   ├── standards/                   # Workspace-custom standards & overrides
│   │   └── *.yaml                   # Declarative YAML standards rules
│   ├── plan/                        # Living Project Plan
│   │   ├── PROJECT_PLAN.md          # Compiled master living plan with Gantt charts
│   │   ├── requirements/            # Scoped requirement plans
│   │   └── epics/                   # Scoped epic plans
│   ├── .cache/                      # Incremental cache (git-ignored)
│   │   └── symbols.json             # Fast AST symbol lineage cache (<30ms hits)
│   ├── trace-graph.md               # Visual Mermaid Decision DAG & traceability graph
│   └── changelog.md                 # Project state audit log
└── your-source-code/
```

---

## 🖥️ Launching the Cybernetic Web Dashboard

Skyhook includes a Modular Multi-Page Application (MMPA) web dashboard featuring real-time Multi-Agent Kanban, Topology Visualization, Drift Analysis, and Mission Control telemetry:

```bash
# Launch dashboard on default port (31415)
skyhook dashboard start

# Or specify a custom port
skyhook dashboard start --port 32000

# Inspect dashboard process status
skyhook dashboard status

# Stop background dashboard process
skyhook dashboard stop
```

Navigate to **http://127.0.0.1:31415** in your browser or view embedded in VS Code / Cursor.

---

## 🔄 Updating Skyhook

To upgrade to the latest stable release:

```bash
# If installed globally via npm
npm update -g skyhook

# If cloned from source
cd /path/to/skyhook-repo
git pull origin main
npm test
npm link
```

---

## 🛠️ Troubleshooting

### "skyhook: command not found"
- If installed via npm, ensure your global npm bin directory is on your system `PATH`:
  ```bash
  # Check npm global bin directory
  npm bin -g
  
  # Ensure it is in your shell profile (~/.zshrc, ~/.bashrc)
  export PATH="$(npm bin -g):$PATH"
  ```
- Alternatively, run commands via `npx skyhook <command>`.

### "Not a Skyhook project. Run `skyhook init` first."
- Commands that inspect project backlog, ADRs, or living plans require a `.skyhook/` governance directory. Run `skyhook init` in your repository root.
- Informational commands (`skyhook --help`, `skyhook version`, `skyhook doctor`) can run in any directory.

### "EADDRINUSE: Port 31415 already in use"
- Skyhook features automatic port hunting (`31415`, `31416`, `31417`, ...).
- To inspect or stop an existing dashboard instance:
  ```bash
  skyhook dashboard status
  skyhook dashboard stop
  # Or force kill:
  lsof -ti :31415 | xargs kill -9
  ```

### Diagnostic Audit
When in doubt, run the interactive diagnostic suite:
```bash
skyhook doctor
```

---

## 📄 License

MIT © [Asad Ayoub](https://github.com/asadayoub)
