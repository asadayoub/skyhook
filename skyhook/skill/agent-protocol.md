# Skyhook Agent Protocol

## Overview

This document defines how AI agents discover, initialize, and interact with Skyhook.
The protocol is designed to be agent-agnostic and work across Codex, Claude Code, Gemini CLI, and other agent harnesses.

## Discovery

### 1. Skill Detection

Agents should check for Skyhook availability in this order:

```yaml
detectionOrder:
  - projectLocal: ".skyhook/SKILL.md"          # Project-local skill override
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
    action: "migrate-legacy-structure"
  - notExists:
    action: "run-initialization"
```

## Initialization Protocol

### Phase 1: Context Gathering

```yaml
contextGathering:
  steps:
    - name: "read-repository"
      description: "Inspect repository structure, package files, configs"
      outputs:
        - "repoStructure"
        - "packageManagers"
        - "frameworks"
        - "existingDocs"
    
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

### Phase 3: Questioning

```yaml
questioning:
  principles:
    - "Ask ONE question at a time when possible"
    - "Provide context for WHY the question matters"
    - "Offer sensible defaults based on standards/profile"
    - "Allow 'I don't know' / 'Use default' responses"
    - "Never ask about things inferable from context"
  
  questionFormat:
    id: "ULID"
    category: "authentication|database|deployment|ux|api|etc"
    priority: "critical|high|medium|low"
    question: "Natural language question"
    context: "Why this matters for the project"
    default: "Recommended default based on standards/profile"
    options: ["Option A", "Option B", "Custom"]
    dependsOn: ["question-id"]  # Only ask if dependency answered
    tags: ["mvp", "phase-1", "security"]
```

### Phase 4: Interpretation & Storage

```yaml
interpretation:
  steps:
    - name: "parse-answer"
      description: "Extract structured information from natural language"
      techniques:
        - "entity-extraction"
        - "intent-classification"
        - "constraint-identification"
        - "preference-detection"
    
    - name: "validate-against-schema"
      description: "Ensure interpreted data matches requirement/decision schemas"
    
    - name: "check-conflicts"
      description: "Detect conflicts with existing decisions/requirements"
    
    - name: "store-structured"
      description: "Save to appropriate .skyhook/ files"
      targets:
        - "requirements/functional.yaml"
        - "requirements/non-functional.yaml"
        - "requirements/constraints.yaml"
        - "decisions/index.yaml"
        - "tech-stack.yaml"
        - "ux/styleguide.md"
    
    - name: "update-traceability"
      description: "Link answers to requirements, decisions, questions"
```

## Ongoing Interaction Protocol

### Before Each Task

```yaml
preTask:
  - loadRelevantContext: "Read .skyhook/ files related to task"
  - checkDecisions: "Verify no conflicting decisions"
  - identifyGaps: "Find missing info needed for task"
  - askIfCritical: "Only ask if gap blocks current work"
```

### During Implementation

```yaml
duringImplementation:
  - recordDecisions: "Save architectural/design decisions as made"
  - updateRequirements: "Refine requirements based on discoveries"
  - trackTradeoffs: "Document why alternatives were rejected"
  - flagAssumptions: "Mark assumptions that need validation"
```

### After Task Completion

```yaml
postTask:
  - verifyAlignment: "Check implementation matches requirements"
  - updateStatus: "Mark requirements/tasks as implemented/verified"
  - regeneratePlan: "Update PROJECT_PLAN.md if significant changes"
  - syncDocumentation: "Ensure docs reflect reality"
```

## Project Lifecycle Integration

### Standard Lifecycle Phases

```yaml
lifecyclePhases:
  - id: "init"
    name: "Initialize"
    description: "Set up .skyhook, detect project type, load profile"
    triggers: ["new-project", "first-run"]
    
  - id: "capture-idea"
    name: "Capture Idea"
    description: "Record initial concept, problem statement, target users"
    triggers: ["init-complete", "user-provides-idea"]
    
  - id: "context"
    name: "Context"
    description: "Gather business context, constraints, stakeholders"
    triggers: ["idea-captured"]
    
  - id: "vision"
    name: "Vision"
    description: "Define product vision, goals, success metrics"
    triggers: ["context-established"]
    
  - id: "requirements"
    name: "Requirements"
    description: "Elicit and structure functional/non-functional requirements"
    triggers: ["vision-defined"]
    
  - id: "backlog"
    name: "Backlog"
    description: "Create prioritized epics, stories, tasks"
    triggers: ["requirements-baselined"]
    
  - id: "tech-stack"
    name: "Tech Stack"
    description: "Select and document technology choices"
    triggers: ["backlog-created", "architecture-decisions-needed"]
    
  - id: "ux-style"
    name: "UX/Style"
    description: "Define design system, style guide, patterns"
    triggers: ["requirements-known", "ui-work-upcoming"]
    
  - id: "standards"
    name: "Standards"
    description: "Configure project-specific standards overrides"
    triggers: ["tech-stack-selected", "team-preferences-known"]
    
  - id: "scaffold"
    name: "Scaffold"
    description: "Generate starter code, configs, folder structure"
    triggers: ["tech-stack-finalized", "standards-set"]
    
  - id: "project-plan"
    name: "Project Plan"
    description: "Generate comprehensive PROJECT_PLAN.md"
    triggers: ["scaffold-complete", "backlog-prioritized"]
    
  - id: "build"
    name: "Build"
    description: "Implement features following plan"
    triggers: ["plan-approved"]
    ongoing: true
    
  - id: "discover"
    name: "Discover New Information"
    description: "Continuously learn during implementation"
    triggers: ["implementation-blocked", "new-edge-case", "user-feedback"]
    ongoing: true
    
  - id: "update-requirements"
    name: "Update Requirements"
    description: "Modify requirements based on discoveries"
    triggers: ["discovery-made", "scope-change"]
    ongoing: true
    
  - id: "track-decisions"
    name: "Track Decisions"
    description: "Record architectural and design decisions"
    triggers: ["decision-made", "alternative-chosen"]
    ongoing: true
    
  - id: "handle-changes"
    name: "Handle Changes"
    description: "Manage requirement/scope changes with traceability"
    triggers: ["requirement-changed", "priority-shift", "pivot"]
    ongoing: true
    
  - id: "recompile-plan"
    name: "Recompile Project Plan"
    description: "Regenerate plan from current state"
    triggers: ["significant-changes", "milestone", "on-demand"]
    ongoing: true
```

## Agent Handoff Protocol

When a new agent takes over:

```yaml
handoff:
  requiredReading:
    - ".skyhook/project.yaml"
    - ".skyhook/context.md"
    - ".skyhook/vision.md"
    - ".skyhook/requirements/*.yaml"
    - ".skyhook/decisions/index.yaml"
    - ".skyhook/tech-stack.yaml"
    - ".skyhook/ux/styleguide.md"
    - ".skyhook/plan/PROJECT_PLAN.md"
    - ".skyhook/changelog.md"
  
  quickStart:
    - "Read PROJECT_PLAN.md for current state"
    - "Check backlog for next priority work"
    - "Review recent decisions in changelog"
    - "Run skyhook sync to verify alignment"
```

## Error Handling

```yaml
errorHandling:
  missingSkyhook:
    action: "Guide user to install Skyhook skill"
  
  corruptedState:
    action: "Offer repair/migration, preserve history"
  
  schemaMismatch:
    action: "Auto-migrate if compatible, else prompt"
  
  conflictingDecisions:
    action: "Surface conflict, ask for resolution"
  
  unreachableQuestion:
    action: "Mark as deferred, continue with defaults"
```

## Extensibility

Agents can extend the protocol by:

1. **Custom question generators** - Add domain-specific questions
2. **Custom interpreters** - Handle domain-specific answer formats
3. **Custom validators** - Enforce project-specific rules
4. **Custom plan generators** - Output different plan formats

Extension points are discovered via `.skyhook/extensions/` directory.
