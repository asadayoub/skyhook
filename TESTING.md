# Skyhook Testing & Verification Guide

Skyhook features a comprehensive automated testing architecture ensuring 100% offline reliability, strict finite state machine (FSM) integrity, active architectural policy enforcement, and seamless multi-agent swarm orchestration.

---

## 1. Automated Test Suites

Skyhook utilizes Node.js's native test runner (`node:test`) and strict assertion library (`node:assert`). No external test runners or transpilation steps are required.

### Quick Start

Run all offline unit and subsystem tests in parallel sandbox isolation:
```bash
npm test
# or
npm run test:unit
```

Run network, WebSocket, and HTTP integration suites:
```bash
npm run test:integration
```

Run the complete test suite:
```bash
npm run test:all
```

---

## 2. Test Architecture & Subsystem Coverage

The automated test suite covers over **379+ passing tests** across 8 core architectural pillars:

### A. Backlog FSM & Concurrency Control
- **`task-lease-recovery.test.js`**: Sweeps expired leases, auto-reverts orphaned in-progress items to ready, and emits events to `EventLedger`.
- **`task-file-lock.test.js`**: Enforces mutual exclusion on candidate tasks sharing `targetFiles` across concurrent agents.
- **`task-subtask-fsm.test.js`**: Subtask bottom-up rollups and Definition of Done (DoD) completion gates.
- **`task-dag-cycles.test.js`**: Ingestion-time cycle rejection preventing deadlocks using DFS/Tarjan cycle detection.
- **`backlog-fsm-evidence.test.js`**: Cryptographic hash evidence recording and state machine transition validation.
- **`task-granular-backlog.test.js`**: Conflict-free modular backlog persistence and 3-way semantic git merge driver (`skyhook-merge-driver`).

### B. Architectural Governance & Policy Enforcement
- **`task-polyglot-adr.test.js`**: Multi-language architectural policy guard inspecting JavaScript, TypeScript, Python, Go, Rust, and Java.
- **`task-drift-remediation.test.js`**: Detection of unauthorized imports and automated synthesis of boundary remediation tasks.
- **`adr-supersession.test.js`**: ADR DAG versioning, status updates, and acyclic supersession lineages.

### C. Living Documentation & Telemetry
- **`task-plan-recompilation.test.js`**: Realtime recompilation of `PROJECT_PLAN.md` upon work item status mutations.
- **`plan-scope-windowing.test.js`**: Scoped milestone windowing and Monte Carlo delivery forecasting.
- **`dashboard-mission-control.test.js`**: Mission Control cockpit telemetry, agent swarm status, and active task HUD.

### D. Traceability & Polyglot AST Ingestion
- **`task-traceability-resolver.test.js`**: 3-tier non-intrusive requirement resolver (annotations, manifest, git evidence).
- **`task-polyglot-inference.test.js`**: Automated tech-stack inference for Node.js, Python (pyproject/requirements), Go (go.mod), and Rust (Cargo.toml).
- **`task-symbol-cache.test.js`**: Incremental disk-backed symbol caching with sub-millisecond cache hits.

### E. AI Agent Harnesses & Portability
- **`harness-portability.test.js`**: Portable `${workspaceFolder}` MCP path injection across Cursor, VS Code, Windsurf, Cline, Antigravity, and Codex.
- **`packaging.test.js`**: Verifies executable shebangs, bin configurations, and global `npx skyhook` packaging.

### F. Resilience, Offline Vendoring & Diagnostics
- **`schema-resilience.test.js`**: Safe atomic file writes (`.tmp` -> rename), schema validation, and automatic rescue backup generation (`.corrupt.<timestamp>.bak`) on malformed YAML.
- **`offline-dashboard.test.js`**: 100% offline air-gapped Mermaid diagram runtime vendoring in `/vendor/mermaid.min.js` and local static server resolution.
- **`doctor.test.js`**: Automated 7-point host environment diagnostics (`skyhook doctor`) verifying Node runtime, project init, backlog schema, git hooks, agent harnesses, and port availability.

---

## 3. Manual Testing via CLI & Stdio Protocol

### Initializing a Sandboxed Environment
You can test Skyhook manually in a temporary directory:
```bash
mkdir -p /tmp/skyhook-sandbox && cd /tmp/skyhook-sandbox
npx skyhook init "Telemetry Sandbox"
```

### Testing Agent Task Claims
```bash
# Add a feature and story
npx skyhook add-feature "User Authentication"
npx skyhook story add "Implement OAuth2 Flow"

# Claim the task as an agent worker
npx skyhook claim --agent "Worker-1" --ttl 300
```

### Testing Stdio JSON Protocol
Skyhook communicates natively with AI agents over standard I/O:
```bash
echo '{"command":"getNextTask","args":{}}' | npx skyhook-cmd
```

