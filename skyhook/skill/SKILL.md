# Skyhook Skill — Universal Project Intelligence for AI Agents

## Purpose

Skyhook gives AI agents a **persistent, structured, version-controlled understanding of a software project** that can be created during project discovery and continuously maintained throughout development.

## Installation

```bash
# Install globally for use across projects
skyhook install --global

# Or install per-project
skyhook install
```

## Quick Start

```bash
# In your project directory
skyhook init

# Or just say to your AI agent:
# "Use Skyhook to help define and build this project."
```

## Agent Protocol

When an agent detects Skyhook is available, it should:

1. **Check for `.skyhook/`** in the project root
2. **Read `SKILL.md`** (this file) to understand the protocol
3. **Load project state** from `.skyhook/` if it exists
4. **Run discovery workflow** if no project state exists
5. **Follow the lifecycle** defined in `workflows/lifecycle.md`

## Core Concepts

### Project Memory (`.skyhook/`)

Each project gets its own `.skyhook/` directory containing only project-specific information:

```
.skyhook/
├── project.yaml           # Project metadata & configuration
├── context.md             # Project context & background
├── vision.md              # Product vision & goals
├── requirements/          # Structured requirements
│   ├── functional.yaml
│   ├── non-functional.yaml
│   └── constraints.yaml
├── decisions/             # Architectural & design decisions
│   ├── index.yaml
│   └── *.md
├── backlog/               # Prioritized work items
│   ├── epics.yaml
│   ├── stories.yaml
│   └── tasks.yaml
├── tech-stack.yaml        # Technology choices & rationale
├── ux/                    # UX & design specifications
│   ├── styleguide.md
│   ├── components.yaml
│   └── patterns.yaml
├── standards/             # Project-specific standards overrides
│   ├── software.md
│   ├── security.md
│   └── testing.md
├── plan/                  # Generated project plans
│   └── PROJECT_PLAN.md
├── changelog.md           # History of significant changes
└── .gitignore             # Tracks what should be versioned
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

- `web-app` — Full-stack web applications
- `api-service` — REST/GraphQL APIs
- `cli-tool` — Command-line applications
- `mobile-app` — React Native, Flutter, native
- `desktop-app` — Electron, Tauri, native
- `library` — Reusable packages/SDKs
- `marketing-site` — Static sites, landing pages
- `ecommerce` — Online stores
- `saas` — Multi-tenant SaaS platforms
- `ai-agent` — AI-powered applications

## Agent Workflow

### 1. Discovery Phase

```yaml
# Agent should execute this workflow:
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

- **Before each task**: Check `.skyhook/` for relevant context
- **When blocked**: Identify missing information, ask targeted questions
- **After decisions**: Record in `.skyhook/decisions/`
- **When requirements change**: Update requirements, track history, regenerate plan

### 3. Maintenance Phase

Continuous synchronization:

- Detect drift between code and documentation
- Flag superseded decisions
- Surface conflicts
- Suggest plan updates

## Questioning Philosophy

**NEVER** ask every possible question upfront.

**INSTEAD** follow this loop:

```
Discover → Identify Unknowns → Classify Importance → 
Determine Current Relevance → Ask Only Necessary Questions
```

### Question Categories by Priority

| Priority | When to Ask | Examples |
|----------|-------------|----------|
| **Critical** | Blocks current work | Auth method, database choice, deployment target |
| **High** | Affects architecture | State management, API style, caching strategy |
| **Medium** | Affects UX/quality | Color scheme, component library, error handling |
| **Low** | Nice to have | Icon set, animation preferences, copy tone |

## Standards as Defaults

All built-in standards are **defaults, not restrictions**:

- User-confirmed decisions **override** AI recommendations
- Project-specific standards in `.skyhook/standards/` **override** built-ins
- Agents should **recommend** but **never enforce** without confirmation

## Portability Requirements

- All project knowledge stored as **plain Markdown and YAML**
- No proprietary formats
- No cloud dependencies
- Git-friendly (text-based, diffable)
- Another agent can take over seamlessly

## File Conventions

- **YAML** for structured data (requirements, decisions, config)
- **Markdown** for narrative content (context, vision, decisions detail)
- **Naming**: kebab-case for files, PascalCase for YAML keys
- **Timestamps**: ISO 8601 in UTC
- **IDs**: ULID for traceability

## Integration Points

### For Codex Agents

Add to `.codex/instructions.md` or invoke via skill system.

### For Claude Code

Reference in `CLAUDE.md` or use as a subagent.

### For Gemini CLI

Load via `@skyhook` reference in prompt.

### For Generic Agents

Read `SKILL.md` and follow the protocol.

## CLI Commands

```bash
skyhook init              # Initialize .skyhook in current project
skyhook discover          # Run discovery workflow
skyhook question          # Generate contextual questions
skyhook plan              # Generate/update project plan
skyhook standards         # Show applicable standards
skyhook decide            # Record a decision
skyhook sync              # Sync code with documentation
skyhook version           # Show version info
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

- Skill version follows SemVer
- Schema versions in each YAML file (`schemaVersion`)
- Backward compatibility guaranteed within major version
- Migration commands provided for breaking changes

## Contributing

See `CONTRIBUTING.md` for development setup, testing, and release process.

## License

MIT — See `LICENSE` file.
