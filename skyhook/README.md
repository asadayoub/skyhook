# Skyhook — Universal Project Intelligence for AI Agents

> **Give AI agents a persistent, structured, version-controlled understanding of your software project.**

[![Version](https://img.shields.io/badge/version-1.5.2-blue.svg)](https://github.com/asadayoub/skyhook/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Agent Compatibility](https://img.shields.io/badge/agents-Codex%20%7C%20Claude%20Code%20%7C%20Gemini%20CLI%20%7C%20Copilot%20%7C%20Antigravity-orange.svg)](#supported-agents)

---

## The Problem

AI coding agents are powerful but **stateless**. Every conversation starts from zero. They:
- Forget architectural decisions made yesterday
- Re-ask the same setup questions
- Introduce conflicting or deprecated dependencies
- Lose context when you switch agents
- Can't maintain project knowledge across sessions

## The Solution

**Skyhook gives AI agents persistent project memory and architectural governance.**

```
┌─────────────────────────────────────────────────────────────┐
│  Without Skyhook          │  With Skyhook                   │
│───────────────────────────┼─────────────────────────────────│
│  Agent: "What database?"  │  Agent reads .skyhook/          │
│  User: "PostgreSQL"       │  Knows: PostgreSQL + Prisma     │
│  ...later...              │  ...later...                    │
│  Agent: "What database?"  │  Agent: "Using PostgreSQL,      │
│  User: "PostgreSQL"       │  shall I add the User model?"   │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities

### 🧠 Persistent Project Memory
- All knowledge stored in `.skyhook/` as plain Markdown/YAML
- Version controlled with your code
- Survives agent restarts, context switches, team changes

### 🏛️ Automated Architecture Decision Records (ADRs) with Living Sync
- **Foundational Baseline Reverse-Engineering (`skyhook adr bootstrap`)**: Automatically reverse-engineers accepted ADRs for all discovered technologies in brownfield projects.
- **Proactive Ingestion (`skyhook adr draft`)**: Auto-synthesizes draft ADRs when unrecorded packages or architectural shifts are detected.
- **Living Bi-Directional Sync (`skyhook adr sync`)**: Edits in Markdown files (`decisions/records/*.md`) automatically propagate into `decisions/index.yaml`.
- **Architectural Policy Guard (`skyhook adr verify`)**: AST inspection rejects prohibited imports or invariant violations.
- **Background File Watcher (`skyhook adr watch` / `skyhook watch`)**: Instantly synchronizes changes on editor save.

### 🪝 Active Git Pre-Commit Governance ("Decisions with Teeth")
- `skyhook hook install` configures `.git/hooks/pre-commit` to prevent developers or agents from committing code that violates accepted ADR policies.

### 📊 Decision DAG & Visual Architecture Graph
- `skyhook graph` generates `.skyhook/trace-graph.md` featuring:
  - Directed Acyclic Graph (DAG) of architectural decisions with status icons (🏛️ accepted, ⚠️ superseded, 📝 draft).
  - Thick supersession arrows (`ADR-1 == "superseded by" ==> ADR-2`).
  - Requirement governance links (`ADR-2 -. "governs" .-> REQ-001`).
  - AST-scanned codebase symbols cascading downward cleanly in vertical subgraphs.

### 🔍 Babel AST Code Tracer Engine
- Automatically parses functions, classes, and exported symbols.
- Scans `// @skyhook-implements REQ-XXX` source annotations.
- Provides `skyhook trace`, `skyhook impact`, `skyhook untraced`, `skyhook coverage`, and `skyhook map-legacy`.

### 📋 Structured Requirements Engineering
- Functional requirements (user stories, acceptance criteria, actors, triggers)
- Non-functional requirements (performance, security, accessibility)
- Constraints (technical, business, regulatory)
- Priority (WSJF), status tracking, and end-to-end traceability

### 🎯 Contextual Questioning
- **Never asks everything upfront**
- Asks only what is relevant to current work
- Infers from codebase, uses standards as defaults

### 📐 Built-in Standards (Overridable)
| Domain | Standard |
|--------|----------|
| Software | TypeScript strict, modular architecture, error handling |
| UX/UI | Design tokens, components, dark mode, responsive |
| Accessibility | WCAG 2.1 AA baseline |
| Architecture | DDD, modular monolith, API design |
| Security | OWASP Top 10, crypto, secrets management |
| Testing | Test pyramid, patterns, coverage targets |

---

## Quick Start

### 1. Install Skyhook

```bash
# One-liner installer (macOS/Linux/WSL)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash
```

### 2. Initialize in Your Project

```bash
cd your-project

# Initialize Skyhook (detects tech stack and profiles)
skyhook init

# For brownfield/existing projects: reverse-engineer baseline ADRs
skyhook adr bootstrap

# Install Git pre-commit architectural protection
skyhook hook install
```

### 3. Start Building

Tell your AI agent (Codex, Claude Code, Gemini CLI, Antigravity):
> "Use Skyhook to help define and build this project."

---

## CLI Commands Reference

```bash
# Project Setup & Lifecycle
skyhook init [--profile=...] [--variant=...] [--force] # Initialize .skyhook/
skyhook setup <codex|claude|gemini|copilot|all>        # Configure agent harnesses
skyhook discover                                      # Interactive requirements gathering
skyhook question [category]                           # Contextual requirements questions
skyhook plan                                          # Generate/update PROJECT_PLAN.md
skyhook standards [category]                          # List engineering standards & overrides
skyhook version                                       # Show version and runtime info

# Architecture Decision Records (ADR)
skyhook adr bootstrap [--status=...] [--overwrite]    # Reverse-engineer baseline ADRs
skyhook adr draft                                     # Draft ADR for detected stack drift
skyhook adr sync                                      # Sync records/*.md with index.yaml
skyhook adr verify [path]                             # Enforce architectural rules
skyhook adr watch                                     # Start background live file watcher
skyhook decide <title> <decision> <context>           # Record decision + auto-generate ADR

# Git Enforcement Hooks
skyhook hook install                                  # Install Git pre-commit enforcement
skyhook hook uninstall                                # Remove Git pre-commit enforcement
skyhook hook status                                   # Check Git hook status

# Traceability & AST Engine
skyhook graph                                         # Generate Decision DAG (trace-graph.md)
skyhook trace <REQ-ID>                                # Trace requirement to code & decisions
skyhook impact <REQ-ID>                               # Analyze blast radius of changes
skyhook untraced                                      # Find requirements lacking code references
skyhook coverage                                      # Calculate requirement/code coverage
skyhook map-legacy [--limit=N]                        # Map unmapped symbols to requirements
skyhook sync                                          # Check tech stack & documentation drift

# Web Dashboard
skyhook dashboard <start|stop|status>                 # Start on-demand Web Dashboard (port 4343)
```

---

## Project Structure (`.skyhook/`)

```
your-project/
├── .skyhook/                    # Commit this to Git!
│   ├── project.yaml             # Project metadata & profile configuration
│   ├── context.md               # Problem statement, solution, target audience
│   ├── vision.md                # Vision, KPIs, personas, user journeys
│   ├── requirements/
│   │   ├── functional.yaml      # User stories, features (REQ-001...)
│   │   ├── non-functional.yaml  # Performance, security, scalability
│   │   └── constraints.yaml     # Technical, business, regulatory
│   ├── decisions/
│   │   ├── index.yaml           # Decision registry (status, supersedes, enforcement)
│   │   └── records/             # Rich living ADR Markdown files (<ULID>.md)
│   ├── backlog/
│   │   └── epics.yaml           # Epics, stories, tasks, WSJF prioritization
│   ├── tech-stack.yaml          # Auto-discovered & recorded technology stack
│   ├── ux/
│   │   └── styleguide.md        # Design system tokens and components
│   ├── standards/               # Project-specific standards overrides
│   ├── PROJECT_PLAN.md          # Generated comprehensive delivery plan
│   ├── changelog.md             # Automated audit trail of all project changes
│   └── trace-graph.md           # Generated visual Decision DAG & traceability graph
└── (your application source files)
```

---

## Supported Agents

| Agent | Integration | Setup Command |
|-------|-------------|---------------|
| **Codex** | `.codex/agents.md` native commands | `skyhook setup codex` |
| **Claude Code** | `.claude/commands/skyhook-*.md` | `skyhook setup claude` |
| **Gemini CLI** | `.gemini/functions/skyhook.js` tool declarations | `skyhook setup gemini` |
| **GitHub Copilot** | `.github/copilot-instructions.md` + VS Code tasks | `skyhook setup copilot` |
| **Google Antigravity** | Native Skill manifest & CLI integration | Pre-configured |
| **Generic AI Agents** | Stdio JSON protocol (`skyhook-cmd`) | Supported out of the box |

---

## Universal Protocol (`skyhook-cmd`)

All agents can invoke Skyhook directly via stdio JSON:
```bash
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd
echo '{"command":"bootstrapAdr","args":{}}' | skyhook-cmd
echo '{"command":"verifyAdr","args":{}}' | skyhook-cmd
```

---

## License

MIT — See [LICENSE](LICENSE) file.
