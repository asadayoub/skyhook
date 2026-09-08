# Skyhook Agent Protocol (v1.5.2)

## Overview

This document defines how AI agents discover, initialize, and interact with Skyhook.
The protocol is agent-agnostic and runs across Codex, Claude Code, Gemini CLI, GitHub Copilot, Google Antigravity, and custom agent harnesses.

---

## Discovery

### 1. Skill Detection

Agents should check for Skyhook availability in this order:

```yaml
detectionOrder:
  - projectLocal: ".skyhook/SKILL.md"          # Project-local skill override
  - antigravityPlugin: ".agents/plugins/skyhook-plugin/" # Antigravity IDE plugin
  - userConfigPlugin: "~/.gemini/config/plugins/skyhook-plugin/" # Global agent plugin
  - globalSkill: "~/.skyhook/skill/SKILL.md"   # User-installed global skill
  - workspaceSkill: ".codex/skills/skyhook/"   # Codex workspace skill
  - claudeSkill: ".claude/skills/skyhook/"     # Claude Code skill
  - geminiSkill: ".gemini/skills/skyhook/"     # Gemini CLI skill
```

### 2. Project State Detection

```yaml
projectStateCheck:
  - exists: ".skyhook/project.yaml"
    action: "load-existing-project"
  - exists: ".skyhook/"
    action: "verify-state-and-sync"
  - notExists:
    action: "run-initialization"
```

---

## Initialization Protocol

### Phase 1: Context Gathering & Brownfield Detection

```yaml
contextGathering:
  steps:
    - name: "read-repository"
      description: "Inspect repository structure, package files, configs"
      outputs: ["repoStructure", "packageManagers", "frameworks", "existingDocs"]
    
    - name: "detect-project-type"
      description: "Analyze codebase to determine project type"
      inputs: ["repoStructure", "packageManagers", "frameworks"]
      outputs: ["projectType", "confidence", "profile"]
    
    - name: "load-profile"
      description: "Load applicable project-type profile"
      inputs: ["projectType", "profile"]
      outputs: ["profileConfig", "profileQuestions", "profileDefaults"]
    
    - name: "load-standards"
      description: "Load built-in standards applicable to project type"
      inputs: ["projectType"]
      outputs: ["softwareStandards", "uxStandards", "securityStandards", "testingStandards"]

    - name: "bootstrap-baseline-adrs"
      description: "If brownfield project, reverse-engineer baseline ADRs for existing stack"
      inputs: ["projectType", "techStack"]
      action: "call-bootstrapAdr"
```

### Phase 2: Knowledge Assessment

```yaml
knowledgeAssessment:
  steps:
    - name: "identify-knowns"
      description: "Extract known information from context, repo, user statements"
      outputs: ["knownFacts", "explicitRequirements", "implicitAssumptions"]
    
    - name: "identify-unknowns"
      description: "Compare knowns against profile requirements and standards"
      outputs: ["unknownCategories", "missingRequirements", "ambiguousAreas"]
    
    - name: "classify-importance"
      description: "Score unknowns by impact on current/near-term work"
      inputs: ["unknownCategories", "currentTask", "profilePriorities"]
      outputs: ["prioritizedUnknowns"]
    
    - name: "filter-contextual"
      description: "Keep only unknowns relevant to current work phase"
      inputs: ["prioritizedUnknowns", "currentPhase", "userGoals"]
      outputs: ["questionsToAsk"]
```

### Phase 3: Contextual Questioning

```yaml
questioning:
  principles:
    - "Ask ONE question at a time when possible"
    - "Provide context for WHY the question matters"
    - "Offer sensible defaults based on standards/profile"
    - "Allow 'I don't know' / 'Use default' responses"
    - "Never ask about things inferable from context"
```

---

## Agent Programmatic Command Protocol (`skyhook-cmd`)

Agents interact programmatically with Skyhook via standard input/output JSON:
```bash
echo '{"command":"<COMMAND_NAME>","args":{...}}' | skyhook-cmd
```

### Full Command Dictionary (36 Commands)

#### 1. Task & Backlog Management
- `getNextTask` (`assignee?: string`): Fetches highest priority ready story (WSJF) with full context (epic, requirements, stack).
- `getBlockers` (): Retrieves all blocked tasks and blocker reasons.
- `updateStatus` (`storyId: string, status: string`): Transitions task state (`backlog` -> `ready` -> `in-progress` -> `in-review` -> `done` -> `blocked` -> `cancelled`).
- `listCurrentFeatures` (`status?: string`): Lists epics and child stories.
- `getFeature` (`id: string`): Fetches feature details and child story array.
- `addFeature` (`title: string, description?: string, goal?: string, stories?: array`): Creates epic and child stories.

#### 2. Architecture Decisions (ADRs) & Living Sync
- `recordDecision` / `decide` (`title, decision, context, status?, category?, alternatives?, relatedRequirements?, consequences?, rationale?, enforcement?`): Synthesizes rich ADR with Mermaid diagrams.
- `bootstrapAdr` (`status?: string, overwrite?: boolean`): Scans brownfield repo and creates baseline ADRs for discovered technologies.
- `draftAdr` (`title?, decision?, context?`): Automatically drafts ADR for newly introduced technologies or detected stack shifts.
- `syncAdr` (): Bi-directionally synchronizes `.skyhook/decisions/records/*.md` with `.skyhook/decisions/index.yaml`.
- `verifyAdr` (`path?: string`): Runs AST policy guard to detect prohibited imports or rule violations.
- `watchAdr` (): Launches real-time background file watcher.

#### 3. Git Governance & Pre-Commit Enforcement
- `hookInstall` (): Installs `.git/hooks/pre-commit` script to enforce ADR compliance.
- `hookUninstall` (): Uninstalls the Git pre-commit hook.
- `hookStatus` (): Inspects Git repository and hook status.

#### 4. AST Code Traceability & Impact Analysis
- `trace` (`id: string`): Resolves requirement ID to child stories, decisions, and AST-parsed code references.
- `impact` (`id: string`): Computes blast radius, risk level, affected stories, decisions, and files.
- `untraced` (): Finds requirements marked implemented but lacking code references.
- `coverage` (): Returns traceability coverage statistics.
- `mapLegacy` (`limit?: number`): Recommends requirement mappings for untagged code symbols.
- `graph` (): Generates visual Mermaid architecture graph & Decision DAG (`trace-graph.md`).
- `sync` (): Checks codebase vs documentation drift.

#### 5. Discovery, Planning & Lifecycle
- `getContext` (`topic?: string`): Retrieves project context summary.
- `plan` (): Generates comprehensive `PROJECT_PLAN.md`.
- `discover` (`phase?, answers?`): Runs interactive requirements gathering.
- `question` (`category?, limit?`): Generates contextual questions.
- `standards` (`category?`): Lists applicable standards and project overrides.
- `profile` (`name?`): Shows profile configuration and defaults.
- `dashboard` (`action: start|stop|status`): Manages the web dashboard HTTP server.
- `batchCreate` (`items: array`): Performs bulk creation of features, stories, requirements, or decisions.
- `init` (`profile?, name?, description?, variant?, force?`): Initializes `.skyhook/`.
- `setup` (`agent: string`): Configures native agent slash commands.
- `version` (): Returns version and environment information.
- `help` (): Returns command schema and documentation.

---

## Agent Task Execution Lifecycle

### 1. Pre-Task Phase
```yaml
preTask:
  - loadNextTask: "Execute getNextTask to receive top-priority story with context"
  - checkBlockers: "Execute getBlockers to ensure dependencies are resolved"
  - checkDecisions: "Verify no active ADR conflicts with proposed approach"
```

### 2. Implementation Phase
```yaml
duringImplementation:
  - annotateCode: "Tag implemented functions/classes with // @skyhook-implements REQ-XXX"
  - recordArchitecturalShifts: "Call recordDecision or draftAdr when introducing new libraries"
  - respectPolicies: "Comply with ADR prohibited imports"
```

### 3. Verification & Governance Phase
```yaml
postTask:
  - verifyADRCompliance: "Execute verifyAdr to ensure zero architectural violations"
  - auditTraceability: "Execute trace REQ-XXX to verify code symbols are mapped"
  - updateStatus: "Execute updateStatus to mark story 'done'"
  - refreshGraph: "Execute graph to compile updated Decision DAG"
```

---

## Agent Handoff Protocol

When an agent session concludes and another agent takes over:

```yaml
handoff:
  requiredReading:
    - ".skyhook/project.yaml"
    - ".skyhook/context.md"
    - ".skyhook/vision.md"
    - ".skyhook/requirements/*.yaml"
    - ".skyhook/decisions/index.yaml"
    - ".skyhook/decisions/records/*.md"
    - ".skyhook/tech-stack.yaml"
    - ".skyhook/PROJECT_PLAN.md"
    - ".skyhook/changelog.md"
    - ".skyhook/trace-graph.md"
  
  quickStart:
    - "Call getNextTask to pick up the next ready story"
    - "Review recent changelog.md entries for recent decisions"
    - "Run skyhook sync to verify alignment"
```

---

## Error Handling

```yaml
errorHandling:
  missingSkyhook:
    action: "Guide user to run skyhook init"
  
  adrViolation:
    action: "Surface exact line and violation message; refactor code to comply with ADR standard"
  
  untracedRequirements:
    action: "Add // @skyhook-implements REQ-XXX annotations to relevant source files"
  
  corruptedState:
    action: "Offer repair/migration, preserve changelog"
```

---

## License

MIT — See `LICENSE` file.
