# Skyhook Testing Guide

This document provides a comprehensive guide on how to test every feature of Skyhook, including commands, slash commands, and edge cases.

## 1. Automated Test Suite

Skyhook uses the built-in Node.js test runner (`node:test`) and the `node:assert` library. 

To run the full suite:
```bash
npm test
```
Or manually:
```bash
node --test skyhook/test/*.test.js
```

### Coverage
The test suite spans across all domains:
- **`yaml.test.js` / `schema.test.js`**: Core YAML parsing engine and schema validation logic (including handling empty arrays and type mismatches).
- **`backlog.test.js`**: Feature and story management (`listCurrentFeatures`, `getFeature`, `addFeature`, `batchCreate`, priority queues, blockers, status updates).
- **`adr.test.js`**: Architecture Decision Records (`recordDecision`, `decide`).
- **`sync.test.js`**: Requirement tracing and impact analysis (`sync`, `trace`, `impact`, `untraced`).
- **`general.test.js`**: Initialization, configuration, project plans, and dashboard functionality.

---

## 2. Testing Slash Commands Manually

Skyhook acts as a headless agent tool via standard input/output (stdio JSON protocol). To manually test a command locally without an agent, you can pipe JSON payloads into `skyhook-cmd`.

### Initialization
Before testing other commands, initialize a dummy project:
```bash
mkdir -p /tmp/skyhook-test && cd /tmp/skyhook-test
echo '{"command":"init","args":{"name":"Test Project"}}' | node /path/to/skyhook-repo/skyhook/cli/skyhook.js
```

### Backlog & Features
**1. Add a Feature (`/skyhook-addFeature`)**
```bash
echo '{"command":"addFeature","args":{"title":"User Auth","stories":[{"title":"Login API","priority":"critical"}]}}' | node skyhook/cli/skyhook.js
```

**2. List Features (`/skyhook-listCurrentFeatures`)**
```bash
echo '{"command":"listCurrentFeatures","args":{"status":"all"}}' | node skyhook/cli/skyhook.js
```

**3. Get Next Task (`/skyhook-getNextTask`)**
```bash
echo '{"command":"getNextTask","args":{}}' | node skyhook/cli/skyhook.js
```

### Architecture Decisions
**1. Record Decision (`/skyhook-decide`)**
```bash
echo '{"command":"decide","args":{"title":"Use JWT","decision":"We will use JSON Web Tokens","context":"We need stateless auth."}}' | node skyhook/cli/skyhook.js
```

### Traceability
To test traceability, you need to add `@skyhook-implements REQ-123` or `@skyhook-implements DEC-123` into your source code files.

**1. Run Sync (`/skyhook-sync`)**
```bash
echo '{"command":"sync","args":{}}' | node skyhook/cli/skyhook.js
```

**2. Trace a specific requirement (`/skyhook-trace`)**
```bash
echo '{"command":"trace","args":{"id":"REQ-123"}}' | node skyhook/cli/skyhook.js
```

### Dashboard
**1. Start Dashboard (`/skyhook-dashboard start`)**
```bash
echo '{"command":"dashboard","args":{"action":"start"}}' | node skyhook/cli/skyhook.js
```
Then navigate to `http://localhost:31415`.

---

## 3. Edge Cases Handled

The test suite explicitly handles and guards against these edge cases:
- **YAML Empty Arrays**: The custom `simple-yaml.js` parser now explicitly parses `[]` correctly to prevent `.push is not a function` bugs.
- **Missing Directory Setup**: Skyhook creates the full `.skyhook/` folder hierarchy automatically during initialization.
- **Re-initialization**: Running `/skyhook-init` twice fails gracefully unless the `--force` flag is provided.
- **Invalid Task Status**: Commands strictly validate task statuses against the enum: `[backlog, ready, in-progress, in-review, done, blocked, cancelled]`.
- **Port Conflicts**: Dashboard spin-ups handle network errors and avoid double-binding gracefully.
