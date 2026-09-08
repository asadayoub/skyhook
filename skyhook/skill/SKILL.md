# Skyhook Skill — Universal Project Intelligence for AI Agents

## Purpose

Skyhook gives AI agents a **persistent, structured, version-controlled understanding of a software project** that can be created during project discovery, enriched with automated Architecture Decision Records (ADRs), and continuously maintained throughout development with active Git pre-commit enforcement.

## Installation

```bash
# One-liner install
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

# Install globally for use across projects
skyhook install --global

# Or install per-project
skyhook install
```

## Quick Start

```bash
# In your project directory
skyhook init

# For existing projects, bootstrap foundational ADRs
skyhook adr bootstrap

# Install Git pre-commit architectural guard
skyhook hook install

# Or just say to your AI agent:
# "Use Skyhook to help define and build this project."
```

## Agent Protocol

When an agent detects Skyhook is available, it should:

1. **Check for `.skyhook/`** in the project root
2. **Read `SKILL.md`** (this file) to understand the protocol
3. **Load project state** from `.skyhook/` if it exists
4. **Run discovery workflow** (`skyhook discover`) if no project state exists
5. **Bootstrap baseline architecture** (`skyhook adr bootstrap`) if working on a brownfield codebase
6. **Follow the lifecycle** defined in `workflows/lifecycle.md`

## Core Concepts

### Project Memory (`.skyhook/`)

Each project gets its own `.skyhook/` directory containing only project-specific information:

```
.skyhook/
├── project.yaml           # Project metadata & configuration
├── context.md             # Project context & background
├── vision.md              # Product vision & goals
├── requirements/          # Structured requirements
│   ├── functional.yaml    # Functional reqs (REQ-001, user stories)
│   ├── non-functional.yaml # Performance, security, accessibility
│   └── constraints.yaml   # Technical, business, regulatory
├── decisions/             # Architectural & design decisions
│   ├── index.yaml         # Decision registry (status, category, supersedes)
│   └── records/           # Living ADR Markdown files (<ULID>.md) with Mermaid diagrams
├── backlog/               # Prioritized work items (WSJF)
│   └── epics.yaml         # Epics, child stories, acceptance criteria, tasks
├── tech-stack.yaml        # Technology choices & rationale
├── ux/                    # UX & design specifications
│   ├── styleguide.md      # Design system & tokens
│   ├── components.yaml
│   └── patterns.yaml
├── standards/             # Project-specific standards overrides
│   ├── software.md
│   ├── security.md
│   └── testing.md
├── PROJECT_PLAN.md        # Generated project plan with milestones and risks
├── changelog.md           # History of significant changes
└── trace-graph.md         # Generated visual Decision DAG & traceability graph
```

### Built-in Standards

Skyhook includes opinionated but overridable standards:

- **Software Standards** — Code quality, architecture patterns, modularity
- **UX/UI Standards** — Design systems, accessibility, responsive design
- **Accessibility Standards** — WCAG 2.1 AA compliance patterns
- **Architecture Standards** — Separation of concerns, scalability patterns
- **Security Standards** — OWASP top 10, secure defaults, data protection
- **Testing Standards** — Unit, integration, e2e, contract testing

### Project-Type Profiles

Pre-configured profiles for common project types:

- `web-app` — Full-stack web applications (Next.js, React, Tailwind, Prisma)
- `api-service` — REST/GraphQL APIs
- `cli-tool` — Command-line applications
- `mobile-app` — React Native, Flutter, native
- `desktop-app` — Electron, Tauri, native
- `library` — Reusable packages/SDKs
- `marketing-site` — Static sites, landing pages
- `ecommerce` — Online stores
- `saas` — Multi-tenant SaaS platforms (with `stripe-b2b`, `stripe-b2c` variants)
- `ai-agent` — AI-powered applications

## Agent Workflow

### 1. Discovery Phase
```yaml
discovery:
  - check_skyhook_installed
  - check_project_state_exists
  - if_not_exists: run_init_workflow
  - if_exists: load_project_state
  - inspect_repository
  - determine_project_type
  - load_applicable_profile
  - load_builtin_standards
  - identify_knowns_and_unknowns
  - classify_unknown_importance
  - ask_contextual_questions
  - interpret_answers
  - save_structured_knowledge
  - generate_initial_plan
```

### 2. Implementation Phase

During implementation, the agent should:
- **Before each task**: Call `getNextTask` to fetch the highest-priority story (WSJF) with context
- **Check for blockers**: Call `getBlockers` to surface blocked dependencies
- **Check decisions**: Review `.skyhook/decisions/` for relevant architectural constraints
- **After decisions**: Call `recordDecision` or `skyhook decide` to auto-generate rich ADRs
- **When introducing new tech**: Run `skyhook adr draft` to document shifts
- **Update status**: Call `updateStatus` when stories transition to `in-progress` or `done`

### 3. Verification & Governance Phase

Continuous synchronization and compliance:
- **Check compliance**: Run `skyhook adr verify` to ensure no prohibited imports or rule violations exist
- **Enforce at commit**: Run `skyhook hook install` so Git rejects non-compliant commits
- **Trace to code**: Add `// @skyhook-implements REQ-XXX` to implemented classes and functions
- **Audit traceability**: Run `skyhook trace`, `skyhook impact`, and `skyhook untraced`
- **Visualize DAG**: Run `skyhook graph` to inspect the full Decision DAG in `.skyhook/trace-graph.md`

## CLI Commands

```bash
# Project Setup & Lifecycle
skyhook init [--profile=...] [--variant=...] [--force]
skyhook setup <codex|claude|gemini|copilot|all>
skyhook discover
skyhook question [category]
skyhook plan
skyhook standards [category]
skyhook version

# Architecture Decision Records (ADR)
skyhook adr bootstrap [--status=...] [--overwrite]
skyhook adr draft
skyhook adr sync
skyhook adr verify [path]
skyhook adr watch
skyhook decide <title> <decision> <context>

# Git Enforcement Hooks
skyhook hook install
skyhook hook uninstall
skyhook hook status

# Traceability & AST Engine
skyhook graph
skyhook trace <REQ-ID>
skyhook impact <REQ-ID>
skyhook untraced
skyhook coverage
skyhook map-legacy [--limit=N]
skyhook sync

# Web Dashboard
skyhook dashboard <start|stop|status>
```

## Universal JSON Protocol (`skyhook-cmd`)

All agents can invoke commands directly via stdio JSON:
```bash
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd
echo '{"command":"bootstrapAdr","args":{}}' | skyhook-cmd
```

## Configuration

Global config at `~/.skyhook/config.yaml`:

```yaml
defaults:
  projectType: "web-app"
  questionThreshold: "contextual"
  autoPlan: true
  standardsLevel: "strict"

profiles:
  # Custom profile overrides

integrations:
  git: true
  github: false
  linear: false
  jira: false
```

## Versioning & Compatibility

- Skill version: `v1.5.2` (SemVer)
- Schema versions in each YAML file (`schemaVersion: "1.0.0"`)
- Backward compatibility guaranteed within major version
- Plain text, Git-friendly Markdown & YAML

## License

MIT — See `LICENSE` file.
