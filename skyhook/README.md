# Skyhook — Universal Project Intelligence & Architecture Governance for AI Agents

Persistent, structured, version-controlled project memory, active architectural governance, and real-time visual telemetry for AI agents and human engineering teams.

**Repository:** https://github.com/asadayoub/skyhook  
**Latest Release:** https://github.com/asadayoub/skyhook/releases/latest  

[![Version](https://img.shields.io/badge/version-1.9.1-blue.svg)](https://github.com/asadayoub/skyhook/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-207%20passing-brightgreen.svg)](TESTING.md)
[![MCP](https://img.shields.io/badge/MCP-100%25%20Offline-cyan.svg)](docs/MCP_SERVER.md)
[![Dashboard](https://img.shields.io/badge/dashboard-modular%20MMPA-purple.svg)](docs/DASHBOARD_AND_IDE.md)
[![Agents](https://img.shields.io/badge/agents-Cursor%20%7C%20Claude%20%7C%20Copilot%20%7C%20Windsurf%20%7C%20Antigravity%20%7C%20Cline-orange.svg)](docs/AGENT_HARNESSES.md)

---

## ⚡ The Problem

Autonomous AI coding agents are powerful but **stateless**. Every new prompt or context window starts from zero. They:
- Forget architectural decisions made yesterday
- Introduce conflicting, banned, or unvetted libraries
- Step on each other's toes with overlapping, concurrent changes
- Break domain boundaries (e.g. importing database drivers into UI components)
- Cannot maintain project knowledge across sessions or across different AI tools

## 🛡️ The Skyhook Solution

**Skyhook gives AI agents persistent project memory, advisory task leasing, and active architectural governance.**

```
┌─────────────────────────────────────────────────────────────┐
│  Without Skyhook          │  With Skyhook                   │
│───────────────────────────┼─────────────────────────────────│
│  Agent: "What database?"  │  Agent reads .skyhook/          │
│  User: "PostgreSQL"       │  Knows: PostgreSQL + Prisma     │
│  ...later...              │  ...later...                    │
│  Agent: "What database?"  │  Agent: "Using PostgreSQL with  │
│  User: "PostgreSQL"       │  ADR-002; claiming STORY-002"   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏛️ Core Capabilities

1. **🤖 100% Offline Model Context Protocol (MCP) Server**:
   - Implements MCP Specification (2024-11-05) over stdio and loopback `127.0.0.1` SSE.
   - Exposes **44 autonomous tools** and **11 streaming resources** (`skyhook://backlog`, `skyhook://plan`, `skyhook://decisions`, `skyhook://boundaries`, `skyhook://tech-stack`, `skyhook://standards`, `skyhook://blockers`, `skyhook://drift-scorecard`, `skyhook://dark-matter`, `skyhook://profile`, `skyhook://trace-graph`).
   - Works natively with Cursor, Claude Desktop, Claude Code, GitHub Copilot, Windsurf, Google Antigravity, Cline, and OpenAI Codex without cloud relays.

2. **🔌 Poly-Agent Harness Injector**:
   - Atomic, non-destructive configuration across 8 supported AI coding agents (`.cursor/rules/*.mdc`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `.agents/`, `.clinerules`, `.codex/agents.md`, and native `codex mcp add`).
   - Deep JSON merges for `mcp.json` and settings without clobbering user customizations.

3. **🖥️ Modular Cybernetic Web Dashboard & Native IDE Extension**:
   - Modular Multi-Page Application (MMPA) with zero build tools (native browser ES modules).
   - Deep-link client hash router (`#/kanban`, `#/topology`, `#/drift`, `#/decisions`, `#/mermaid`, `#/dark-matter`, `#/harness`, `#/settings`).
   - Universal Platform Bridge runs identically in browsers and inside native VS Code / Cursor extension Webviews.

4. **🔀 Two-Tier Multi-Agent Agile Backlog & Advisory Leases**:
   - Hierarchy: `Epics ➔ Stories / Direct Chores ➔ Tasks ➔ Subtasks (DoD)`.
   - Two-tier locking: concurrent execution across sibling tasks (`TASK-XXX`) without collision, exclusive story locks, AST file conflict warnings, and heartbeat renewals (`skyhook task heartbeat`).
   - Bottom-up FSM rollups auto-advance parent stories (`in-progress`, `in-review`) and epics (`done`), with Definition of Done (DoD) subtask checklist invariants.
   - Append-only event ledger (`events.jsonl`) with Lead/Cycle time metrics and replay.

5. **🏛️ Automated ADR Engine & Active Policy Guard ("Decisions with Teeth")**:
   - Reverse-engineers baseline ADRs for existing repositories (`skyhook adr bootstrap`).
   - Complete ADR supersession lifecycle and visual Mermaid Decision DAG (`skyhook adr dag`).
   - Compiles ADR text into AST import policies that reject prohibited packages before commit.

6. **🪝 Active Git Pre-Commit Governance**:
   - `skyhook hook install` sets up `.git/hooks/pre-commit` to prevent developers or agents from committing code that violates accepted architectural decisions.

7. **🔍 Polyglot AST Code Tracer & Dark Matter Radar**:
   - Polyglot support for **JavaScript / TypeScript, Python, Go, Rust, and Java**.
   - AST symbol lineage tracking with fuzzy refactoring recovery.
   - Tarjan's algorithm detecting circular dependency cycles in import graphs.
   - Dark Matter Radar reporting untraced codebase symbols with risk tiers.

8. **📋 Living Project Plan Compiler & Capacity Forecaster**:
   - Compiles `PROJECT_PLAN.md` with client-side Mermaid Gantt charts.
   - Historical capacity planning with statistical P50 and P90 completion forecasts.

---

## 🚀 Quick Install

```bash
# One-liner installer (macOS/Linux/WSL)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

# Add to PATH (if not already present)
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify installation
skyhook version
```

---

## ⚡ 5-Minute Quickstart

```bash
# 1. Initialize in your project
skyhook init --name="Fintech Ledger" --profile=saas

# 2. Inject rules across all installed AI agents
skyhook harness inject --all

# 3. Launch the 100% offline MCP server
skyhook mcp --stdio &

# 4. Start the Cybernetic Web Dashboard
skyhook dashboard start --port 31415

# 5. Add an architectural requirement
skyhook add-feature "Double Entry Ledger" --points 5

# 6. Claim task as an AI agent
skyhook get-next-task --agent="Cursor-Cascade"

# 7. Record an architectural decision
skyhook decide "PostgreSQL with ACID Isolation" "Use PostgreSQL with Serializable Isolation"

# 8. Verify codebase compliance against accepted ADRs
skyhook adr verify

# 9. Recompile living master plan
skyhook plan
```

---

## 📚 Complete Documentation Suite

Comprehensive manuals and deep-dives are available in [`docs/`](docs/):

- 🏛️ **[System Architecture (v1.9.1)](docs/ARCHITECTURE.md)**: System design, dataflow diagrams, and sub-system specifications.
- 📖 **[CLI Reference Manual](docs/CLI_REFERENCE.md)**: Exhaustive reference for all 40+ commands, options, and JSON outputs.
- 🤖 **[100% Offline MCP Server Guide](docs/MCP_SERVER.md)**: Setting up Cursor, OpenAI Codex, Claude Desktop, Windsurf, Antigravity, and Cline.
- 🖥️ **[Dashboard & Native IDE Extension Manual](docs/DASHBOARD_AND_IDE.md)**: MMPA architecture, hash routing, and VS Code extension packaging.
- 🔌 **[Poly-Agent Harness Matrix](docs/AGENT_HARNESSES.md)**: Non-destructive merging and rule synchronization.
- 🔍 **[Polyglot AST Traceability & Dark Matter](docs/TRACEABILITY_AND_AST.md)**: Multi-language parsers, symbol lineage, and coverage radar.
- ⚖️ **[ADR Synthesis & Policy Governance](docs/ADR_AND_GOVERNANCE.md)**: Decision DAG, supersession, and AST import guards.
- 🛠️ **Tutorials**:
  - [Tutorial 1: Zero to Governed Repository in 5 Minutes](docs/TUTORIALS/01_QUICKSTART.md)
  - [Tutorial 2: Multi-Agent Task Coordination Without Collisions](docs/TUTORIALS/02_MULTI_AGENT_WORKFLOW.md)
  - [Tutorial 3: Authoring Custom Language Parsers](docs/TUTORIALS/03_CUSTOM_PARSERS.md)

---

## 🧪 Verification & Testing

Skyhook is thoroughly tested with **207 automated tests across 6 test suites**:
```bash
npm test
```

---

## 📄 License

MIT © [Asad Ayoub](https://github.com/asadayoub)
