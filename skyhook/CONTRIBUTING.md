# Contributing to Skyhook

Thank you for contributing! Skyhook is an open-source, community-driven project and we welcome contributions of all kinds — bug fixes, language parsers, agent harness plugins, documentation improvements, and architectural standards.

---

## Development Setup

### Prerequisites

- **Node.js 18+** (Node 20+ LTS recommended)
- **Git**
- An AI coding agent for testing (Cursor, Claude Code, GitHub Copilot, Windsurf, Codex, Antigravity, or Cline)

### Clone & Install

```bash
git clone https://github.com/asadayoub/skyhook.git
cd skyhook
npm install
```

### Repository Structure

```
skyhook/
├── package.json             # Root npm configuration, scripts & 4 global binaries
├── skyhook/
│   ├── cli/                 # Standalone executable binaries
│   │   ├── skyhook.js              # Positional CLI dispatcher
│   │   ├── skyhook-cmd.js          # Headless stdio JSON protocol processor
│   │   ├── skyhook-mcp.js          # 100% offline Model Context Protocol server
│   │   └── skyhook-merge-driver.js # 3-way semantic Git merge driver
│   ├── lib/                 # Core Subsystem Engines
│   │   ├── adr/             # ADR synthesis, DAG, supersession, & AST policy guards
│   │   ├── backlog/         # Two-tier Agile FSM, leases, event ledger, & locks
│   │   ├── drift/           # DDD module boundaries & semantic code rules
│   │   ├── harness/         # Poly-agent harness injectors & MCP server implementation
│   │   ├── inference/       # Automated tech-stack inference engine
│   │   ├── parsers/         # Polyglot AST parsers (JS/TS, Python, Go, Rust, Java, Specs)
│   │   ├── plan/            # Living plan compiler, Gantt charts, & capacity forecaster
│   │   ├── server/          # Embedded HTTP server, WebSocket gateway, & RPC handlers
│   │   ├── standards/       # Modular standards registry, resolver, & package installer
│   │   └── tracer/          # Code traceability resolver, dark matter radar, & symbol cache
│   ├── dashboard/           # Cybernetic Modular Web Dashboard & Native IDE Webview assets
│   ├── schemas/             # YAML specification schemas (backlog, decisions, project, etc.)
│   ├── standards/           # Built-in standards & YAML rule definitions
│   │   ├── definitions/     # Granular YAML standards definitions
│   │   └── *.md             # Human-readable architectural reference guides
│   ├── profiles/            # Base architecture profiles (web-app, saas, cli-tool, etc.)
│   ├── templates/           # Scaffolding templates for project initialization
│   ├── workflows/           # Lifecycle and discovery workflow definitions
│   ├── test/                # 14 offline unit suites & integration test suites
│   └── docs/                # Comprehensive subsystem manuals & tutorials
├── README.md                # Root project overview & capabilities
├── TESTING.md               # Automated testing architecture & test guides
└── LICENSE                  # MIT License
```

---

## Making Changes

### 1. Engineering Standards Changes
Edit or add YAML definitions in `skyhook/standards/definitions/<domain>/`:
- Follow the schema defined in `skyhook/schemas/standard.yaml`.
- Include clear metadata (ID, title, severity, category, tags).
- Define automated rules (`prohibited-imports`, `ast-pattern`, `naming-convention`) for AST verification where applicable.
- Test with: `node skyhook/cli/skyhook.js standards list` and `node skyhook/cli/skyhook.js standards verify`.

### 2. Architecture Profile Changes
Edit or add YAML files in `skyhook/profiles/`:
- Follow the schema in `skyhook/schemas/project.yaml`.
- Include stack detection heuristics, default dependencies, and contextual discovery questions.
- Test with: `node skyhook/cli/skyhook.js profile <name>`.

### 3. Schema Changes
Edit files in `skyhook/schemas/`:
- Increment `schemaVersion` on breaking structural changes.
- Ensure all templates in `skyhook/templates/` and runtime validators in `skyhook/lib/schema.js` remain synchronized.
- Verify schema resilience with: `node skyhook/test/schema-resilience.test.js`.

### 4. Subsystem & CLI Changes
- Place core business logic inside appropriate `skyhook/lib/<subsystem>/` modules.
- Ensure all CLI binaries in `skyhook/cli/` retain the `#!/usr/bin/env node` shebang on line 1.
- Maintain 100% offline air-gapped isolation: zero external network binds or cloud telemetry.
- Support both positional CLI execution and stdio JSON protocol payloads.

### 5. Documentation Updates
- Update the relevant guides in `skyhook/docs/` whenever commands, flags, or tools are modified.
- Keep examples working and syntax-highlighted.
- Update `skyhook/docs/CLI_REFERENCE.md` and `skyhook/docs/MCP_SERVER.md` when introducing new commands or MCP tools.

---

## Verification & Testing

Skyhook is thoroughly tested with **379+ automated tests** using Node.js's native test runner (`node:test`).

### Run Offline Unit Suites
```bash
# Run all 379 offline sandboxed unit tests
npm test
```

### Run Integration Suites
```bash
# Run WebSocket, RPC, and server integration tests
npm run test:integration

# Run complete test suite (unit + integration)
npm run test:all
```

### Run Diagnostic Doctor Check
Verify local environment and workspace integrity:
```bash
node skyhook/cli/skyhook.js doctor
```

### Manual CLI & Protocol Testing
```bash
# Test positional CLI
node skyhook/cli/skyhook.js version
node skyhook/cli/skyhook.js --help

# Test stdio JSON protocol
echo '{"command":"listCurrentFeatures","args":{}}' | node skyhook/cli/skyhook-cmd.js

# Test MCP server handshake
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | node skyhook/cli/skyhook-mcp.js
```

---

## Pull Request Process

1. **Fork** the repository: `https://github.com/asadayoub/skyhook`
2. **Create** a descriptive feature branch: `git checkout -b feat/my-new-feature`
3. **Commit** your changes following Conventional Commits format (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
4. **Ensure** all 379 tests pass with zero regressions (`npm test`).
5. **Submit** your Pull Request with a clear summary of changes, motivation, and verification steps.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`

Example:
```
feat(tracer): add Kotlin parser extension for Android architecture governance

- Add KotlinParser implementing BaseParser interface
- Register parser in ParserRegistry for .kt and .kts extensions
- Add unit test suite in skyhook/test/kotlin-parser.test.js

Closes #128
```

---

## Release Process (Maintainers Only)

1. Bump the version in root `package.json`.
2. Update release notes in `skyhook/docs/` and root documentation.
3. Commit and tag the release: `git tag v2.X.X`.
4. Push tag to `origin`: `git push origin v2.X.X`.
5. GitHub Actions release workflow (`.github/workflows/release.yml`) verifies tests and publishes release artifacts.

---

## Code of Conduct

- Be respectful, constructive, and inclusive.
- Focus on architectural integrity and maintainability.
- Help fellow contributors and AI agent developers.

Thank you for contributing to Skyhook! 🚀
