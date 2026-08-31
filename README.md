# Skyhook — Universal Project Intelligence for AI Agents

Persistent, structured, version-controlled project understanding via `.skyhook/` directory with plain Markdown/YAML files.

**Repository:** https://github.com/asadayoub/skyhook  
**Latest Release:** https://github.com/asadayoub/skyhook/releases/latest  
**Download:** https://github.com/asadayoub/skyhook/releases/latest/download/skyhook-skill.tar.gz

---

## 🚀 Quick Install

```bash
# One-liner (macOS/Linux/WSL)
curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

# Add to PATH
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify
skyhook version
```

**Alternative: Download Release (no git required)**
```bash
mkdir -p ~/.skyhook
curl -fsSL https://github.com/asadayoub/skyhook/releases/latest/download/skyhook-skill.tar.gz | tar -xz -C ~/.skyhook
echo 'export PATH="$HOME/.skyhook/skill/cli:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## 🎯 CLI Commands (`skyhook`)

| Command | Description |
|---------|-------------|
| `skyhook init [--profile=web-app\|api-service\|cli-tool\|library\|saas\|ai-agent] [--variant=stripe-b2b]` | Initialize `.skyhook/` in current project; auto-detects type or uses profile |
| `skyhook discover` | Interactive requirements gathering workflow |
| `skyhook question [category]` | Generate contextual questions for requirements |
| `skyhook plan` | Generate/update `PROJECT_PLAN.md` |
| `skyhook standards` | Show applicable built-in standards |
| `skyhook decide "title" "decision" "context" [category]` | Record decision + auto-generate ADR |
| `skyhook sync` | Check code vs docs drift (tech stack, reqs→stories, decisions) |
| `skyhook version` | Show version info |
| `skyhook install [--global]` | Install Skyhook skill globally |
| `skyhook profile <name>` | Show profile details (tech stack, questions, scaffolds) |
| `skyhook setup <codex\|claude\|gemini\|copilot\|all>` | **Auto-configure agent harness** |
| `skyhook help` | Show all commands |

### Project Profiles & Variants

| Profile | Use Case | Variants |
|---------|----------|----------|
| `web-app` | React/Next.js/Vue apps | — |
| `api-service` | REST/GraphQL APIs | — |
| `cli-tool` | Command-line tools | — |
| `library` | NPM/PyPI packages | — |
| `saas` | Subscription SaaS | `stripe-b2b`, `stripe-b2c`, `paddle-b2b` (pre-fills 15+ decisions) |
| `ai-agent` | AI agent projects | — |

**Variant Example:** `skyhook init --profile=saas --variant=stripe-b2b` pre-fills payment, auth, database, email, monitoring decisions.

---

## 📋 Slash Commands (`skyhook-cmd` via stdio JSON)

All agents invoke via: `echo '{"command":"...","args":{}}' | skyhook-cmd`

### Feature Management
| Command | Args | Returns |
|---------|------|---------|
| `listCurrentFeatures` | `status?: all\|backlog\|in-progress\|done\|blocked` | Features with stories, status badges, blockers |
| `getFeature` | `id: string` | Full feature + all stories |
| `addFeature` | `title, description?, goal?, stories?: [...]` | Created epic + story IDs |

### Task Management
| Command | Args | Returns |
|---------|------|---------|
| `getNextTask` | `assignee?: string` | Highest priority ready story + context (epic, reqs, tech stack) |
| `getBlockers` | — | All blocked stories with reasons |
| `updateStatus` | `storyId, status: backlog\|ready\|in-progress\|in-review\|done\|blocked\|cancelled` | Updated story |

### Decisions & Architecture
| Command | Args | Returns |
|---------|------|---------|
| `recordDecision` | `title, decision, context, status?, category?, alternatives?, relatedRequirements?, consequences?, rationale?` | Auto-generated ADR (alternatives, consequences, related reqs/decisions, validation criteria) |
| `sync` | — | Drift report: tech stack vs package.json, reqs→stories coverage, decisions tracked |

### Traceability & Impact
| Command | Args | Returns |
|---------|------|---------|
| `trace` | `id: string (REQ-XXX)` | Requirement → stories, decisions, code refs (`@skyhook-implements`) |
| `impact` | `id: string (REQ-XXX)` | Risk level (low/medium/high), affected stories/decisions/files, recommendations |
| `untraced` | — | Requirements with status implemented/in-progress but no code refs |

### Context
| Command | Args | Returns |
|---------|------|---------|
| `getContext` | `topic?: string` | Relevant reqs, decisions, tech stack for topic |

### Dashboard
| Command | Args | Returns |
|---------|------|---------|
| `dashboard` | `action: start\|stop\|status` | Starts HTTP server on port 4343 (on-demand, no background process) |

### Project Initialization & Discovery
| Command | Args | Returns |
|---------|------|---------|
| `init` | `profile?, name?, description?, variant?, force?` | Initializes `.skyhook/` with profile, creates all template files |
| `discover` | `phase?, answers?` | Phased questions for requirements gathering (init, vision, requirements, architecture, ux, tech, plan) |
| `question` | `category?, limit?` | Contextual questions filtered by category (init, vision, requirements, architecture, ux, tech, plan) |
| `plan` | — | Generates `PROJECT_PLAN.md` with phases, milestones, risks, tech stack |
| `standards` | `category?` | Lists all applicable standards with levels (strict/advisory) and source (profile/project/override) |
| `profile` | `name?` | Profile details: tech stack, variants, question count, standards, default requirements |
| `version` | — | Skyhook version, protocol, Node.js version, platform |
| `install` | `scope?: global\|local, force?` | Installs skill globally to `~/.skyhook/skill` |
| `setup` | `agent: codex\|claude\|gemini\|copilot\|all` | Auto-configures agent harness with native slash commands |
| `decide` | `title, decision, context, ...` | Shorthand for `recordDecision` with auto-generated ADR |
| `batchCreate` | `items: [{type: feature\|story\|requirement\|decision, data: {...}}]` | Bulk creates multiple items in one call |

### JSON Protocol Examples
```bash
# List features
echo '{"command":"listCurrentFeatures","args":{}}' | skyhook-cmd

# Get next task with context
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd

# Trace requirement to code
echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd

# Record decision (auto-generates ADR)
echo '{"command":"recordDecision","args":{"title":"Use Redis","decision":"Redis for session caching","context":"Need sub-ms latency","category":"technology"}}' | skyhook-cmd

# Check drift
echo '{"command":"sync","args":{}}' | skyhook-cmd
```

---

## 🤖 Agent Integration — Native Slash Commands

### One-Command Setup
```bash
skyhook setup all
```

| Agent | Command | Creates | Native Slash Commands |
|-------|---------|---------|----------------------|
| **Codex** | `skyhook setup codex` | `.codex/agents.md` | `/skyhook-listCurrentFeatures`, `/skyhook-getNextTask`, `/skyhook-trace REQ-001`, etc. |
| **Claude Code** | `skyhook setup claude` | `.claude/commands/skyhook-*.md` (8 files) | `/skyhook-next`, `/skyhook-features`, `/skyhook-blockers`, `/skyhook-decide "Use Redis" \| "Redis for caching" \| "Performance" \| technology`, `/skyhook-trace REQ-001`, `/skyhook-impact REQ-001`, `/skyhook-sync`, `/skyhook-dashboard start` |
| **Gemini CLI** | `skyhook setup gemini` | `.gemini/functions/skyhook.js` + `settings.json` | Function calls: `skyhook_get_next_task()`, `skyhook_trace({id:"REQ-001"})`, `skyhook_record_decision({...})`, etc. |
| **GitHub Copilot** | `skyhook setup copilot` | `.github/copilot-instructions.md` + `.vscode/tasks.json` | VS Code Tasks: "Skyhook: Next Task", "Skyhook: List Features", "Skyhook: Check Drift", "Skyhook: Start Dashboard" |

### Universal JSON Protocol (Any Agent)
```bash
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"trace","args":{"id":"REQ-001"}}' | skyhook-cmd
echo '{"command":"recordDecision","args":{"title":"Use Redis","decision":"Redis for session caching","context":"Need sub-ms latency","category":"technology"}}' | skyhook-cmd
```

---

## 🏗 Project Structure (`.skyhook/`)

Created by `skyhook init`:

```
.skyhook/
├── project.yaml          # Metadata & config (type, profile, version)
├── context.md            # Problem statement, solution overview, target users
├── vision.md             # Product vision, KPIs, personas, user journeys
├── requirements/
│   ├── functional.yaml   # Functional reqs (REQ-001, REQ-002...)
│   ├── non-functional.yaml # Performance, security, scalability
│   └── constraints.yaml  # Technical, budget, regulatory
├── decisions/
│   ├── index.yaml        # Decision registry (DEC-001, DEC-002...)
│   └── *.md              # Full ADRs (auto-generated)
├── backlog/
│   └── epics.yaml        # Epics, stories, tasks (WSJF prioritized)
├── tech-stack.yaml       # Technology choices with rationale
├── ux/
│   └── styleguide.md     # Design system, components, patterns
├── standards/            # Project-specific standards overrides
└── changelog.md          # Full history of all changes
```

---

## 🔗 Module Interconnections — How Data Flows

```
skyhook-cmd (JSON stdin) → Command Handler → SkyhookContext → .skyhook/ files
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
            trace.js (trace/impact/    adr.js (auto-ADR)          inference.js
             untraced)                                                          (repo analysis)
                    │                         │                         │
                    ▼                         ▼                         ▼
            ┌─────────────────────────────────────────────────────────────┐
            │                    .skyhook/ FILE SYSTEM                    │
            │  project.yaml ◄──► requirements/*.yaml ◄──► backlog/epics.yaml │
            │       │                  │                      │         │
            │       │                  ▼                      │         │
            │       │          decisions/index.yaml ◄─────────┘         │
            │       │                  │                              │
            │       ▼                  ▼                              │
            └─────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │       CODEBASE              │
                    │  @skyhook-implements REQ-XXX │
                    └─────────────────────────────┘
```

### Key Relationships

| Relationship | How It's Linked |
|--------------|-----------------|
| **Requirement → Stories** | `story.relatedRequirements: ["REQ-001", "REQ-003"]` |
| **Requirement → Decisions** | `decision.relatedRequirements: ["REQ-001"]` (in ADR frontmatter) |
| **Story → Epic** | `story.epicId: "EPIC-001"` + `epic.childStories: ["STORY-001"]` |
| **Decision → ADR** | `decisions/index.yaml` entry → `decisions/ULID.md` (full ADR) |
| **Code → Requirement** | `@skyhook-implements REQ-003` comment in source |
| **Trace Command** | Reads all: reqs, stories, decisions, code refs |
| **Impact Command** | Uses trace data + story status (in-progress=higher risk) |
| **Sync Command** | Checks: package.json deps vs tech-stack.yaml, reqs→stories coverage |

### Auto-ADR Generation Flow
```
recordDecision(title, decision, context, category)
    │
    ▼
generateADR() in adr.js
    │
    ├─► Finds profile-suggested alternatives
    ├─► Generates consequences (positive/negative/neutral)
    ├─► Links related requirements
    ├─► Links related decisions (keyword matching)
    ├─► Creates implementation steps + validation criteria
    │
    ▼
Writes decisions/ULID.md (full ADR)
Updates decisions/index.yaml
Appends to changelog.md
```

---

## 📊 Dashboard (On-Demand Web UI)

```bash
skyhook-cmd dashboard start   # http://localhost:4343
skyhook-cmd dashboard stop
skyhook-cmd dashboard status
```

**Backend API:**
- `GET /api/projects` — Discovers all Skyhook projects on disk
- `GET /api/data?project=/path/to/project` — Full project JSON

**Frontend (`skyhook/dashboard/public/index.html`):**
- Project selector dropdown (multi-project)
- Features with status badges (done/in-progress/ready/blocked/backlog)
- Next priority task with acceptance criteria
- Blockers with reasons
- Requirements (functional + non-functional)
- Decisions with status/category
- Tech stack
- Auto-refresh every 30s
- Zero overhead when stopped

---

## 🧠 Inference Engine (`lib/inference.js`)

Auto-detects from repository (zero config):

| Category | Detects |
|----------|---------|
| **Language** | TypeScript, JavaScript, Python, Go, Rust |
| **Framework** | Next.js, React, Vue, FastAPI, Express, NestJS, Remix, Astro, Hono |
| **Build Tool** | Vite, Webpack, esbuild, Turbopack, Parcel |
| **Styling** | Tailwind, Styled Components, Emotion, Sass |
| **Database/ORM** | Prisma, Drizzle, Kysely, Mongoose, TypeORM, Sequelize |
| **Auth** | NextAuth.js, Clerk, Supabase Auth, JWT |
| **Deployment** | Vercel, Netlify, Fly.io, Railway, Docker, Kubernetes |
| **CI/CD** | GitHub Actions, GitLab CI, CircleCI, Jenkins |
| **Testing** | Jest, Vitest, Playwright, Cypress |
| **Monorepo** | pnpm-workspace, Turborepo, Nx, Lerna |

Confidence scores (0-1) for each detection.

---

## 📚 Built-In Standards

| Standard | File | Covers |
|----------|------|--------|
| Software | `standards/software.md` | Clean code, SOLID, testing, documentation |
| UX/UI | `standards/ux.md` | Design principles, consistency, accessibility |
| Accessibility | `standards/accessibility.md` | WCAG 2.1 AA compliance |
| Architecture | `standards/architecture.md` | Modularity, boundaries, observability |
| Security | `standards/security.md` | OWASP Top 10, authZ, secrets, encryption |
| Testing | `standards/testing.md` | Unit/integration/e2e, coverage, contracts |

Project can override in `.skyhook/standards/{standard}.md`.

---

## 🔍 Traceability in Code

Add to any source file:
```typescript
// @skyhook-implements REQ-003
export function RevenueChart() { }

// @skyhook-implements REQ-001 REQ-002
async function login(email, password) { }
```

Enables:
- `trace REQ-003` → finds this function
- `impact REQ-003` → knows this file affected
- `untraced` → won't flag REQ-003 as untraced

---

## 🧪 Testing It Out — Step by Step

### On Existing Project
```bash
cd your-existing-project
skyhook init                    # Auto-detects, creates .skyhook/
skyhook discover                # Answer questions → populates requirements
echo '{"command":"listCurrentFeatures","args":{}}' | skyhook-cmd
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
echo '{"command":"sync","args":{}}' | skyhook-cmd
```

### On New Project
```bash
mkdir my-saas && cd my-saas
skyhook init --profile=saas --variant=stripe-b2b  # Pre-fills 15+ decisions
skyhook discover                # Interactive requirements
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
```

### With Agent Harnesses
```bash
# Codex
skyhook setup codex
# Now in Codex: /skyhook-next, /skyhook-trace REQ-001, etc.

# Claude Code
skyhook setup claude
# Now: /skyhook-next, /skyhook-decide "Use Redis" | "Redis for caching" | "Performance" | technology

# Dashboard
skyhook-cmd dashboard start
# Open http://localhost:4343
```

---

## 🔑 Key Principles

- **Zero dependencies** — Pure Node.js ≥18, no external packages
- **Local-only** — No server, network, or daemon; runs via stdio JSON
- **Agent-agnostic** — Works with any AI via stdin/stdout JSON
- **Git-friendly** — All `.skyhook/` files are plain text, diffable
- **On-demand dashboard** — Zero overhead when not running

---

## 📦 Key Files Reference

| File | Purpose |
|------|---------|
| `skyhook/cli/skyhook.js` | Main CLI (init, discover, setup, etc.) |
| `skyhook/skill/commands/index.js` | All 13 slash commands + dashboard server |
| `skyhook/skill/commands/trace.js` | trace/impact/untraced logic |
| `skyhook/skill/commands/adr.js` | Auto-ADR generation |
| `skyhook/skill/commands/simple-yaml.js` | Zero-dep YAML parser |
| `skyhook/skill/lib/inference.js` | Repo analysis engine |
| `skyhook/dashboard/public/index.html` | Dashboard UI |
| `skyhook/agent-integrations/*.md` | Agent setup guides |
| `skyhook/schemas/*.yaml` | 6 YAML schemas |
| `skyhook/profiles/*.yaml` | 6 project profiles + variants |

---

## 📥 Download Links

| Method | Command |
|--------|---------|
| **Installer (recommended)** | `curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh \| bash` |
| **Release tarball** | `curl -fsSL https://github.com/asadayoub/skyhook/releases/latest/download/skyhook-skill.tar.gz \| tar -xz -C ~/.skyhook` |
| **Git clone** | `git clone https://github.com/asadayoub/skyhook.git` |
| **Specific version** | `curl -fsSL https://github.com/asadayoub/skyhook/releases/download/v1.2.0/skyhook-skill.tar.gz \| tar -xz -C ~/.skyhook` |

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📞 Support

- **Issues:** https://github.com/asadayoub/skyhook/issues
- **Discussions:** https://github.com/asadayoub/skyhook/discussions
- **Releases:** https://github.com/asadayoub/skyhook/releases
