# Skyhook Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI AGENT HARNESS                           │
│  (Codex, Claude Code, Gemini CLI, Antigravity, Custom)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SKYHOOK SKILL LAYER                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  Protocols  │ │  Schemas    │ │  Standards  │ │  Profiles │ │
│  │  (agent-    │ │  (project,  │ │  (software, │ │  (web-    │ │
│  │   protocol, │ │   reqs,     │ │   ux,       │ │   app,    │ │
│  │   lifecycle)│ │   decisions)│ │   arch,     │ │   api,    │ │
│  └─────────────┘ └─────────────┘ │   security, │ │   cli,    │ │
│  ┌─────────────┐ ┌─────────────┐ │   testing)  │ │   lib,    │ │
│  │  Question   │ │  Templates  │ └─────────────┘ │   saas,   │ │
│  │  Engine     │ │  (init,     │ ┌─────────────┐ │   ai-agent│ │
│  └─────────────┘ │   files)    │ │    CLI      │ └───────────┘ │
│  ┌─────────────┐ └─────────────┘ │  (skyhook.js)            │
│  │  Workflows  │                 └─────────────┘            │
│  │  (discovery,│                                          │
│  │   lifecycle)│                                          │
│  └─────────────┘                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PROJECT SKYHOOK STATE                          │
│  .skyhook/                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │  Project   │ │ Requirements│ │ Decisions  │ │  Backlog   │  │
│  │  Config    │ │ (func,      │ │  (ADRs,    │ │  (epics,   │  │
│  │  (YAML)    │ │  non-func,  │ │   index)   │ │   stories, │  │
│  └────────────┘ │  constraints)│ └────────────┘ │   tasks)   │  │
│  ┌────────────┐ └────────────┘ ┌────────────┐ └────────────┘  │
│  │   Tech     │ ┌────────────┐ │    UX      │ ┌────────────┐  │
│  │   Stack    │ │  Context   │ │  (style-   │ │  Standards │  │
│  │   (YAML)   │ │  & Vision  │ │   guide,   │ │  (overrides)│ │
│  └────────────┘ │  (Markdown)│ │  components)│ └────────────┘  │
│  ┌────────────┐ └────────────┘ └────────────┘ ┌────────────┐  │
│  │    Plan    │ ┌────────────┐                 │  Changelog │  │
│  │  (Markdown)│ │ Extensions │                 │  (Markdown)│  │
│  └────────────┘ └────────────┘                 └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Design Principles

### 1. Separation of Concerns

| Layer | Responsibility | Portability |
|-------|---------------|-------------|
| **Skill** | Reusable capability, standards, workflows | Install once, use everywhere |
| **Project State** | Project-specific knowledge only | Plain text, git-friendly, agent-agnostic |

### 2. Plain Text Persistence

All project knowledge stored as:
- **YAML** for structured data (schemas, requirements, decisions, tech stack)
- **Markdown** for narrative content (context, vision, ADR details, plans)

Benefits:
- Human readable and editable
- Git diffable
- No vendor lock-in
- Any agent can read/write

### 3. Schema-Driven

Every `.skyhook/` file conforms to a schema:
- Versioned schemas in `schemas/`
- Validation on read/write
- Migration path for schema changes
- Type-safe interpretation

### 4. Agent-Agnostic Protocol

Agents interact via:
1. **File-based protocol** - Read/write `.skyhook/` files directly
2. **CLI commands** - `skyhook init`, `discover`, `plan`, `decide`, etc.
3. **Skill manifest** - `SKILL.md` describes capabilities

No RPC, no daemon, no network required.

---

## Component Details

### 1. Schemas (`schemas/`)

Define structure for all project knowledge:

| Schema | Purpose | Key Files |
|--------|---------|-----------|
| `project.yaml` | Project metadata, config | `.skyhook/project.yaml` |
| `requirements.yaml` | Functional, non-functional, constraints | `.skyhook/requirements/*.yaml` |
| `decisions.yaml` | ADRs and design decisions | `.skyhook/decisions/index.yaml`, `*.md` |
| `ux.yaml` | Design system, components, patterns | `.skyhook/ux/styleguide.md`, `components.yaml` |
| `tech-stack.yaml` | Technology choices, rationale | `.skyhook/tech-stack.yaml` |
| `backlog.yaml` | Epics, stories, tasks | `.skyhook/backlog/*.yaml` |

Each schema includes:
- `schemaVersion` for migration
- JSON Schema compatible definitions
- Required/optional fields
- Enum constraints for consistency

### 2. Standards (`standards/`)

Built-in, overridable standards:

| Standard | Scope | Enforcement |
|----------|-------|-------------|
| `software.md` | Code quality, TS patterns, architecture | Advisory by default |
| `ux.md` | Design tokens, components, responsive | Advisory |
| `accessibility.md` | WCAG 2.1 AA requirements | Strict recommended |
| `architecture.md` | DDD, API design, event-driven | Advisory |
| `security.md` | OWASP Top 10, crypto, secrets | Strict recommended |
| `testing.md` | Test pyramid, patterns, coverage | Advisory |

Override mechanism: Create `.skyhook/standards/{name}.md` in project.

### 3. Profiles (`profiles/`)

Project-type configurations:

| Profile | Extends | Key Characteristics |
|---------|---------|---------------------|
| `web-app` | — | Full-stack, React/Vue/Next, Tailwind, Prisma |
| `api-service` | — | REST/GraphQL, auth, rate limiting, OpenAPI |
| `cli-tool` | — | Commander/Cobra, config files, snapshots |
| `library` | — | Package exports, types, SemVer, publishing |
| `saas` | `web-app` | Multi-tenancy, Stripe billing, admin |
| `ai-agent` | — | LLM providers, RAG, tools, evals |
| `marketing-site` | — | Static/SSG, content, SEO, analytics |
| `ecommerce` | `saas` | Products, cart, checkout, inventory |
| `mobile-app` | — | React Native/Expo, native modules |
| `desktop-app` | — | Electron/Tauri, auto-updater |

Each profile defines:
- Detection heuristics
- Default tech stack
- Phase-specific questions
- Default requirements
- Standards emphasis
- Scaffold templates

### 4. Question Engine (`question-engine.md`)

Intelligent question generation:

```
Discovery → Identify Unknowns → Classify Importance 
    → Filter Contextual → Ask Only Relevant
```

Key features:
- **Never asks inferable information**
- **Scores questions by current relevance**
- **Batches related questions (max 3)**
- **Offers defaults from standards/profile**
- **Interprets natural language answers**
- **Detects conflicts with existing knowledge**

### 5. Workflows (`workflows/`)

Lifecycle orchestration:

| Workflow | Purpose |
|----------|---------|
| `discovery.md` | Initial project understanding |
| `lifecycle.md` | 17-phase project lifecycle |

Phases: Init → Capture Idea → Context → Vision → Requirements → Backlog → Tech Stack → UX/Style → Standards → Scaffold → Project Plan → Build → Discover → Update Requirements → Track Decisions → Handle Changes → Recompile Plan

### 6. CLI (`cli/skyhook.js`)

Commands:

| Command | Purpose |
|---------|---------|
| `init` | Create `.skyhook/` in project |
| `discover` | Run discovery workflow |
| `question` | Generate contextual questions |
| `plan` | Generate/update PROJECT_PLAN.md |
| `standards` | Show applicable standards |
| `decide` | Record architectural decision |
| `sync` | Check code/doc alignment |
| `version` | Show versions |
| `install` | Install skill globally/locally |
| `profile` | Show profile details |

---

## Data Flow

### Initialization Flow

```
User: "Use Skyhook"
    │
    ▼
Agent detects Skyhook skill
    │
    ▼
Agent runs: skyhook init
    │
    ▼
CLI detects project type (package.json, files)
    │
    ▼
CLI loads profile (web-app, api-service, etc.)
    │
    ▼
CLI creates .skyhook/ with:
  - project.yaml (with detected type)
  - Empty schema-compliant files
  - context.md, vision.md templates
  - Basic styleguide.md
    │
    ▼
Agent reads .skyhook/, begins discovery
```

### Discovery Flow

```
Agent loads project state
    │
    ▼
Inspects repository (package.json, configs, code)
    │
    ▼
Confirms/refines project type
    │
    ▼
Loads profile + built-in standards
    │
    ▼
Identifies knowns (from repo, context, conversation)
    │
    ▼
Identifies unknowns (profile requirements - knowns)
    │
    ▼
Scores unknowns by importance + current relevance
    │
    ▼
Asks top N questions (contextual, not exhaustive)
    │
    ▼
Interprets answers → structured requirements/decisions
    │
    ▼
Saves to .skyhook/
    │
    ▼
Generates initial PROJECT_PLAN.md
```

### Build Flow (Ongoing)

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

## Extensibility Points

### 1. Custom Profiles

Add `.skyhook/profiles/custom.yaml`:
```yaml
extends: "web-app"
techStack:
  frontend:
    framework:
      default: "SolidJS"
```

### 2. Custom Standards

Create `.skyhook/standards/software.md`:
```markdown
# Overrides
- Use tabs not spaces
- Max line length: 120
```

### 3. Custom Questions

Add to profile or create `.skyhook/extensions/questions/*.yaml`

### 4. Custom Interpreters

Agent can implement domain-specific answer parsing.

### 5. Custom Plan Generators

Replace `plan/PROJECT_PLAN.md` template.

---

## Versioning & Compatibility

### Skill Versioning

- Semantic Versioning (MAJOR.MINOR.PATCH)
- MAJOR: Breaking protocol/schema changes
- MINOR: New features, profiles, standards
- PATCH: Bug fixes, typo corrections

### Schema Versioning

Each schema file has `schemaVersion`:
- Incremented on breaking changes
- Migration scripts provided
- Backward compatible within MAJOR

### Agent Compatibility

- Protocol version in `plugin.json`
- Agents declare supported protocol version
- Graceful degradation for unknown fields

---

## Security Considerations

1. **No network access** - Fully local
2. **No secrets in .skyhook/** - References to secret managers only
3. **Git-friendly** - Designed for version control
4. **No code execution** - Data only, no eval
5. **Agent sandbox** - Agents operate within project directory

---

## Performance

- **Init**: < 1 second (file creation)
- **Discover**: < 3 seconds (repo scan + profile load)
- **Plan generation**: < 500ms (template + data merge)
- **Question generation**: < 100ms (filter + score)
- **CLI startup**: ~50ms (Node.js)

---

## Future Architecture Considerations

1. **Language-agnostic CLI** - Rewrite in Go/Rust for faster startup
2. **Schema registry** - Central schema repository
3. **Real-time sync** - File watcher for multi-agent
4. **Web UI** - Visual project dashboard
5. **Plugin API** - Formal extension system
6. **Cloud sync** - Optional team synchronization
