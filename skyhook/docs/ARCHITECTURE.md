# Skyhook Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI AGENT HARNESS                           │
│  (Codex, Claude Code, Gemini CLI, GitHub Copilot, Custom)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │  stdio JSON protocol
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SKYHOOK SKILL LAYER                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  skyhook CLI (cli/skyhook.js)                               │ │
│  │  - init, discover, question, plan, standards, decide,       │ │
│  │    sync, version, install, profile, setup, help            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  skyhook-cmd (skill/commands/index.js)                      │ │
│  │  13 Slash Commands via stdin/stdout JSON:                   │ │
│  │  Feature Mgmt: listCurrentFeatures, getFeature, addFeature  │ │
│  │  Task Mgmt: getNextTask, getBlockers, updateStatus          │ │
│  │  Decisions: recordDecision (auto-ADR), sync                 │ │
│  │  Traceability: trace, impact, untraced                      │ │
│  │  Context: getContext                                        │ │
│  │  Dashboard: dashboard (on-demand HTTP server)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Core Libraries                                              │ │
│  │  - simple-yaml.js: Zero-dep YAML parser                     │ │
│  │  - trace.js: trace/impact/untraced logic                    │ │
│  │  - adr.js: Auto-ADR generation with alternatives            │ │
│  │  - inference.js: Repo analysis engine                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │  reads/writes .skyhook/
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PROJECT SKYHOOK STATE (.skyhook/)              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │  Project   │ │ Requirements│ │ Decisions  │ │  Backlog   │  │
│  │  Config    │ │ (func,      │ │  (ADRs,    │ │  (epics,   │  │
│  │  (YAML)    │ │  non-func,  │ │   index)   │ │   stories, │  │
│  └────────────┘ │  constraints)│ └────────────┘ │   tasks)   │  │
│  ┌────────────┐ └────────────┘ ┌────────────┐ └────────────┘  │
│  │   Tech     │ ┌────────────┐ │    UX      │ ┌────────────┐  │
│  │   Stack    │ │  Context   │ │  (style-   │ │  Standards │  │
│  │   (YAML)   │ │  & Vision  │ │  guide,    │ │  (overrides)│ │
│  └────────────┘ │  (Markdown)│ │  components)│ └────────────┘  │
│  ┌────────────┐ └────────────┘ └────────────┘ ┌────────────┐  │
│  │    Plan    │ ┌────────────┐                 │  Changelog │  │
│  │  (Markdown)│ │ Extensions │                 │  (Markdown)│  │
│  └────────────┘ └────────────┘                 └────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                           │  scans for @skyhook-implements
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CODEBASE                                 │
│  // @skyhook-implements REQ-003                                 │
│  export function RevenueChart() { }                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. CLI Layer (`cli/skyhook.js`)

**Commands:**
| Command | Purpose |
|---------|---------|
| `init` | Create `.skyhook/` in project with auto-detected or specified profile |
| `discover` | Interactive requirements gathering workflow |
| `question` | Generate contextual questions for requirements |
| `plan` | Generate/update `PROJECT_PLAN.md` |
| `standards` | Show applicable built-in standards |
| `decide` | Record architectural decision + auto-generate ADR |
| `sync` | Check code vs docs drift |
| `version` | Show version info |
| `install` | Install skill globally |
| `profile` | Show profile details (tech stack, questions, scaffolds) |
| `setup` | Auto-configure agent harnesses (codex, claude, gemini, copilot, all) |
| `help` | Show all commands |

### 2. Slash Command Layer (`skill/commands/index.js`)

**13 Commands via stdio JSON protocol:**

| Category | Commands |
|----------|----------|
| **Feature Management** | `listCurrentFeatures`, `getFeature`, `addFeature` |
| **Task Management** | `getNextTask`, `getBlockers`, `updateStatus` |
| **Decisions & Architecture** | `recordDecision`, `sync` |
| **Traceability & Impact** | `trace`, `impact`, `untraced` |
| **Context** | `getContext` |
| **Dashboard** | `dashboard` (start/stop/status) |

**Protocol:**
```json
// Request
{"command": "getNextTask", "args": {}}

// Response
{"story": {...}, "context": {...}}
```

### 3. Traceability Engine (`skill/commands/trace.js`)

| Command | Function |
|---------|----------|
| `trace` | Requirement → stories, decisions, code refs (`@skyhook-implements`) |
| `impact` | Risk level (low/medium/high), affected stories/decisions/files |
| `untraced` | Requirements with implemented/in-progress status but no code refs |

### 4. Auto-ADR Generator (`skill/commands/adr.js`)

Generates complete Architecture Decision Records with:
- Alternatives (profile-suggested + user-provided)
- Consequences (positive/negative/neutral)
- Related requirements & decisions
- Implementation steps + validation criteria
- Markdown output to `decisions/ULID.md`

### 5. Inference Engine (`skill/lib/inference.js`)

Auto-detects from repository (zero config):
- Language: TypeScript, JavaScript, Python, Go, Rust
- Framework: Next.js, React, Vue, FastAPI, Express, NestJS, Remix, Astro, Hono
- Build Tool: Vite, Webpack, esbuild, Turbopack
- Styling: Tailwind, Styled Components, Emotion, Sass
- Database/ORM: Prisma, Drizzle, Kysely, Mongoose, TypeORM
- Auth: NextAuth.js, Clerk, Supabase Auth, JWT
- Deployment: Vercel, Netlify, Fly.io, Railway, Docker, Kubernetes
- CI/CD: GitHub Actions, GitLab CI, CircleCI
- Testing: Jest, Vitest, Playwright, Cypress
- Monorepo: pnpm-workspace, Turborepo, Nx

### 6. Dashboard (`skill/dashboard/public/index.html`)

On-demand HTTP server (port 4343):
- Multi-project discovery via `/api/projects`
- Project data via `/api/data?project=<path>`
- Frontend: vanilla JS, dark theme, auto-refresh 30s
- Zero overhead when stopped

---

## Data Flow

### Initialization Flow
```
skyhook init
    │
    ▼
Detect project type (package.json, configs, files)
    │
    ▼
Load profile (web-app, api-service, cli-tool, library, saas, ai-agent)
    │
    ▼
Create .skyhook/ with:
  - project.yaml (detected type, config)
  - Empty schema-compliant files
  - context.md, vision.md templates
  - Basic styleguide.md
```

### Discovery Flow
```
skyhook discover
    │
    ▼
Load project state + repo scan (inference engine)
    │
    ▼
Confirm/refine project type + load profile + standards
    │
    ▼
Identify knowns vs unknowns (profile requirements - knowns)
    │
    ▼
Score unknowns by importance + current relevance
    │
    ▼
Ask top N questions (contextual, not exhaustive)
    │
    ▼
Interpret answers → structured requirements/decisions
    │
    ▼
Save to .skyhook/ → Generate PROJECT_PLAN.md
```

### Ongoing Build Flow
```
For each task:
  1. Agent reads relevant .skyhook/ context
  2. Checks decisions affecting this work
  3. Identifies missing information
  4. If critical gap → asks targeted question
  5. Implements following standards
  6. Records decisions made during implementation
  7. Updates requirement status
  8. Verifies against acceptance criteria
  9. If significant change → regenerate plan
```

---

## .skyhook/ File System Schema

### project.yaml
```yaml
schemaVersion: 1.0.0
id: ULID
name: string
description: string
type: web-app|api-service|cli-tool|library|saas|ai-agent
profile: string
version: semver
repository: {url, branch, provider}
configuration:
  questionThreshold: minimal|contextual|comprehensive
  autoPlan: boolean
  standardsLevel: advisory|strict|custom
  trackDecisions: boolean
  syncOnCommit: boolean
```

### requirements/functional.yaml
```yaml
schemaVersion: 1.0.0
requirements:
  - id: REQ-XXX
    title: string
    description: string
    priority: critical|high|medium|low
    status: proposed|confirmed|in-progress|implemented|deferred
    category: string
    userStory: string
    actor: string
    trigger: string
    tags: [string]
    timestamps: createdAt, updatedAt, confirmedAt, implementedAt
```

### decisions/index.yaml
```yaml
schemaVersion: 1.0.0
decisions:
  - id: DEC-XXX|ULID
    title: string
    status: proposed|accepted|rejected|deprecated|superseded
    category: architecture|technology|security|process|ux|software
    createdAt: ISO8601
    decidedAt: ISO8601
```

### decisions/ULID.md (Auto-generated ADR)
Full ADR with: Context, Decision, Consequences, Alternatives, Related Requirements, Related Decisions, Implementation Notes, Validation Criteria.

### backlog/epics.yaml
```yaml
schemaVersion: 1.0.0
metadata: {createdAt, updatedAt, version}
epics:
  - id: EPIC-XXX
    title: string
    description: string
    goal: string
    successMetrics: [string]
    childStories: [STORY-XXX]
    targetDate: ISO8601
    timestamps: createdAt, updatedAt
stories:
  - id: STORY-XXX
    title: string
    description: string
    userStory: string
    acceptanceCriteria: [string]
    epicId: EPIC-XXX
    priority: number (WSJF)
    status: backlog|ready|in-progress|in-review|done|blocked|cancelled
    relatedRequirements: [REQ-XXX]
    dependencies: [STORY-XXX]
    blockerReason: string
    timestamps: createdAt, updatedAt, startedAt, completedAt
tasks: []
prioritization: {method: wsjf, criteria: {}}
```

---

## Module Interconnections

| From | To | Mechanism |
|------|-----|-----------|
| CLI | Profile | Loads `profiles/*.yaml` for defaults |
| Slash Commands | .skyhook/ | `SkyhookContext` reads/writes YAML/MD |
| trace/impact | Codebase | Scans for `@skyhook-implements REQ-XXX` |
| adr.js | decisions/ | Writes ULID.md + updates index.yaml |
| sync | package.json | Compares deps vs tech-stack.yaml |
| inference | Repo | Reads package.json, configs, files |
| dashboard | .skyhook/ | Serves via `/api/data?project=<path>` |

---

## Agent Integration Layer

### Setup Command (`skyhook setup <agent>`)

| Agent | Creates | Native Commands |
|-------|---------|-----------------|
| Codex | `.codex/agents.md` | `/skyhook-listCurrentFeatures`, `/skyhook-getNextTask`, etc. |
| Claude Code | `.claude/commands/skyhook-*.md` (8) | `/skyhook-next`, `/skyhook-decide "..." \| "..." \| "..." \| technology`, etc. |
| Gemini CLI | `.gemini/functions/skyhook.js` + `settings.json` | `skyhook_get_next_task()`, `skyhook_trace({id})`, etc. |
| Copilot | `.github/copilot-instructions.md` + `.vscode/tasks.json` | VS Code Tasks: "Skyhook: Next Task", etc. |

### Universal Protocol
All agents use stdio JSON:
```bash
echo '{"command":"getNextTask","args":{}}' | skyhook-cmd
```

---

## Key Principles

- **Zero dependencies** — Pure Node.js ≥18, no external packages
- **Local-only** — No server, network, or daemon; runs via stdio JSON
- **Agent-agnostic** — Works with any AI via stdin/stdout JSON
- **Git-friendly** — All `.skyhook/` files are plain text, diffable
- **On-demand dashboard** — Zero overhead when not running

---

## Versioning & Compatibility

- **Skill Version**: Semantic (v1.2.0)
- **Schema Version**: Each file has `schemaVersion: 1.0.0`
- **Protocol**: Stable JSON stdio interface
- **Compatibility**: Agents declare supported protocol version

---

## Security

1. **No network access** — Fully local
2. **No secrets in .skyhook/** — References to secret managers only
3. **Git-friendly** — Designed for version control
4. **No code execution** — Data only, no eval
5. **Agent sandbox** — Agents operate within project directory

---

## Performance

- **Init**: < 1 second
- **Discover**: < 3 seconds (repo scan + profile load)
- **Plan generation**: < 500ms
- **Question generation**: < 100ms
- **CLI startup**: ~50ms (Node.js)

---

## Future Architecture Considerations

1. **NPM Package** — `npm install -g @skyhook/skill`
2. **GitHub Action** — `.github/workflows/skyhook-drift.yml`
3. **VS Code Extension** — Sidebar, inline traceability
4. **Multi-Language** — Python, Go, Rust inference
5. **Team Features** — Webhook server for real-time sync
6. **AI Planning** — Auto-generate plan from backlog + capacity
