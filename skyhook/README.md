# Skyhook — Universal Project Intelligence for AI Agents

> **Give AI agents a persistent, structured, version-controlled understanding of your software project.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/skyhook/skyhook/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Agent Compatibility](https://img.shields.io/badge/agents-Codex%20%7C%20Claude%20Code%20%7C%20Gemini%20CLI%20%7C%20Generic-orange.svg)](#supported-agents)

---

## The Problem

AI coding agents are powerful but **stateless**. Every conversation starts from zero. They:
- Forget decisions made yesterday
- Re-ask the same questions
- Invent inconsistent requirements
- Lose context when you switch agents
- Can't maintain project knowledge across sessions

## The Solution

**Skyhook gives AI agents persistent project memory.**

```
┌─────────────────────────────────────────────────────────────┐
│  Without Skyhook          │  With Skyhook                   │
├─────────────────────────────────────────────────────────────┤
│  Agent: "What database?"  │  Agent reads .skyhook/          │
│  User: "PostgreSQL"       │  Knows: PostgreSQL + Prisma     │
│  ...later...              │  ...later...                    │
│  Agent: "What database?"  │  Agent: "Using PostgreSQL,     │
│  User: "PostgreSQL"       │  shall I add the User model?"   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 🧠 Persistent Project Memory
- All knowledge stored in `.skyhook/` as plain Markdown/YAML
- Version controlled with your code
- Survives agent restarts, context switches, team changes

### 📋 Structured Requirements Engineering
- Functional requirements (user stories, acceptance criteria)
- Non-functional requirements (performance, security, accessibility)
- Constraints (technical, business, regulatory)
- Priority, status, traceability

### 🏗️ Architectural Decision Records (ADRs)
- Document every significant decision
- Track alternatives, consequences, trade-offs
- Link decisions to requirements and code

### 🎯 Contextual Questioning
- **Never asks everything upfront**
- Asks only what's relevant to current work
- Infers from codebase, uses standards as defaults
- Natural language → structured knowledge

### 📐 Built-in Standards (Overridable)
| Domain | Standard |
|--------|----------|
| Software | TypeScript strict, modular architecture, error handling |
| UX/UI | Design tokens, components, dark mode, responsive |
| Accessibility | WCAG 2.1 AA baseline |
| Architecture | DDD, modular monolith, API design |
| Security | OWASP Top 10, crypto, secrets management |
| Testing | Test pyramid, patterns, coverage targets |

### 🔧 Project-Type Profiles
- `web-app` — Full-stack (Next.js, React, Tailwind, Prisma)
- `api-service` — REST/GraphQL APIs
- `cli-tool` — Command-line applications
- `library` — Packages, SDKs
- `saas` — Multi-tenant with billing
- `ai-agent` — LLM-powered applications
- `marketing-site`, `ecommerce`, `mobile-app`, `desktop-app`

### 🔄 Continuous Synchronization
- Detect drift between code and documentation
- Regenerate plans when requirements change
- Track superseded decisions
- Maintain changelog automatically

---

## Quick Start

### 1. Install Skyhook

```bash
# Global (recommended)
git clone https://github.com/skyhook/skyhook.git ~/.skyhook/skill

# Or per-project
cd your-project
npx skyhook install
```

### 2. Initialize in Your Project

```bash
cd your-project
skyhook init
```

This creates `.skyhook/` with:
- Project configuration
- Empty requirement/decision/backlog files
- Context & vision templates
- Basic design system

### 3. Start Building

Tell your AI agent:
> "Use Skyhook to help define and build this project."

The agent will:
1. Read `.skyhook/` for existing knowledge
2. Inspect your repository
3. Detect project type (web-app, api-service, etc.)
4. Load applicable profile & standards
5. Ask only critical questions
6. Generate `PROJECT_PLAN.md`
7. Begin implementation

---

## Example Workflow

### New Project: AI Customer Support SaaS

```bash
$ skyhook init
🔍 Detected: saas (web-app + saas profile)
✅ Created .skyhook/ structure

$ skyhook discover
📋 Project: MySupport (saas)
📝 Context: 0 items | Vision: 0 items
❓ Critical questions:
  1. [CRITICAL] How should users authenticate?
     Default: Email/password with NextAuth.js
  2. [CRITICAL] What's the billing model?
     Default: Tiered subscriptions
  3. [HIGH] Where will this be deployed?
     Default: Vercel
```

**You answer naturally:**
> "Email/password for merchants, tiered subs with Stripe, deploy to Vercel, clean design"

**Agent interprets & structures:**
```yaml
requirements:
  - id: ulid-1
    title: "Merchant Authentication"
    category: "authentication"
    userStory: "As a merchant, I want to sign in with email/password..."
    priority: "critical"

techStack:
  database: { name: "PostgreSQL", orm: "Prisma" }
  auth: { provider: "NextAuth.js (credentials)" }
  billing: { provider: "Stripe" }
  deployment: { platform: "Vercel" }
```

**Generates plan:**
```
.skyhook/plan/PROJECT_PLAN.md
├── Vision & Success Metrics
├── Requirements Summary (8 functional, 5 NFR)
├── Architecture Decisions (3 recorded)
├── Tech Stack (12 choices)
├── Backlog (4 epics, 12 stories)
└── Timeline & Milestones
```

---

## Supported Agents

| Agent | Integration |
|-------|-------------|
| **Codex** | Add to `.codex/instructions.md` or use skill system |
| **Claude Code** | Reference in `CLAUDE.md` or use as subagent |
| **Gemini CLI** | Load via `@skyhook` reference |
| **Antigravity** | Skill manifest |
| **Generic** | File-based protocol (read/write `.skyhook/`) |

See [Agent Integration Guide](docs/AGENT_INTEGRATION.md) for details.

---

## Project Structure

```
your-project/
├── .skyhook/                    # Commit this to git!
│   ├── project.yaml             # Project metadata & config
│   ├── context.md               # Problem, solution, users, constraints
│   ├── vision.md                # Vision, KPIs, personas, journeys
│   ├── requirements/
│   │   ├── functional.yaml      # User stories, features
│   │   ├── non-functional.yaml  # Performance, security, a11y
│   │   └── constraints.yaml     # Technical, business, regulatory
│   ├── decisions/
│   │   ├── index.yaml           # Decision registry
│   │   └── *.md                 # Full ADR documents
│   ├── backlog/
│   │   ├── epics.yaml
│   │   ├── stories.yaml
│   │   └── tasks.yaml
│   ├── tech-stack.yaml          # All tech choices + rationale
│   ├── ux/
│   │   ├── styleguide.md        # Design system (tokens, components)
│   │   ├── components.yaml
│   │   └── patterns.yaml
│   ├── standards/               # Project-specific overrides
│   ├── plan/
│   │   └── PROJECT_PLAN.md      # Generated comprehensive plan
│   └── changelog.md             # History of changes
└── (your project code)
```

---

## CLI Commands

```bash
skyhook init              # Initialize .skyhook in current project
skyhook discover          # Run discovery workflow
skyhook question          # Generate contextual questions
skyhook plan              # Generate/update PROJECT_PLAN.md
skyhook standards         # Show applicable standards
skyhook decide "title"    # Record architectural decision
skyhook sync              # Check code/doc alignment
skyhook version           # Show version info
skyhook install [--global] # Install Skyhook skill
skyhook profile <name>    # Show profile details
```

---

## Documentation

- [Installation Guide](docs/INSTALLATION.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Agent Integration](docs/AGENT_INTEGRATION.md)
- [Question Engine](skill/question-engine.md)
- [Lifecycle Workflow](workflows/lifecycle.md)
- [Example Workflows](examples/agent-workflow.md)

---

## Philosophy

> **Never ask the user for information Skyhook can reasonably infer.**
>
> **Never silently invent information that materially affects the project.**
>
> **Standards are defaults, not restrictions.**
>
> **User-confirmed decisions override AI recommendations.**
>
> **Current project state is authoritative; history explains how it got there.**
>
> **The project knowledge must remain portable even if the user stops using Skyhook.**

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and release process.

---

## License

MIT — See [LICENSE](LICENSE) file.

---

## Roadmap

- [ ] Web UI for visual project dashboard
- [ ] Real-time multi-agent sync
- [ ] Schema registry & migration tools
- [ ] More project-type profiles
- [ ] IDE extensions (VS Code, Cursor)
- [ ] Team collaboration features
- [ ] Cloud backup (optional)

---

**Built for AI agents. Designed for humans. Portable by default.**
