# Skyhook Agent Workflow Examples

## Example 1: New Project - AI Customer Support Platform

### User Request
> "I want to build an AI customer support platform for ecommerce stores."

### Agent Activation

```yaml
agentActions:
  1. detectSkyhook:
      - Checks for .skyhook/ in project
      - Checks for global Skyhook skill
      - Finds skill, loads SKILL.md
  
  2. initializeProject:
      - Runs: skyhook init
      - Detects project type: saas (web-app + saas profile)
      - Creates .skyhook/ structure
  
  3. captureIdea:
      - Reads user request
      - Extracts: AI, customer support, ecommerce, merchants
      - Writes to context.md
  
  4. gatherContext:
      - Asks: "What channels should the AI support? (chat, email, social)"
      - Asks: "Human handoff process?"
      - Asks: "AI actions (refund, cancel, lookup)?"

### Discovery Questions Generated

Based on `saas` profile + `web-app` profile:

| Priority | Question | Category | Why |
|----------|----------|----------|-----|
| Critical | How should users authenticate? | auth | Auth architecture |
| Critical | What's the billing model? | billing | Stripe integration, DB schema |
| Critical | What database? | database | Schema, migrations, costs |
| High | Deployment target? | deployment | Build config, CI/CD |
| High | API style? | api | Frontend data fetching |
| Medium | Design direction? | ux | Design system |
| Medium | Team structure (multi-tenancy)? | saas | Organizations, roles |

### User Answers (Natural Language)

> "Email/password for merchants, tiered subscriptions (starter/pro/enterprise), PostgreSQL, deploy to Vercel, REST API, clean modern design, organizations with role-based access"

### Agent Interpretation

```yaml
interpreted:
  - requirement: 
      id: "ulid-1"
      title: "Merchant Authentication"
      category: "authentication"
      userStory: "As a merchant, I want to sign in with email/password, so that I can access my dashboard"
      priority: "critical"
      source: { type: "user", reference: "conversation", confidence: 0.95 }
  
  - requirement:
      id: "ulid-2"
      title: "Tiered Subscription Billing"
      category: "billing"
      userStory: "As a merchant, I want to choose a subscription tier, so that I pay for what I need"
      priority: "critical"
      source: { type: "user", reference: "conversation", confidence: 0.95 }
  
  - techStack:
      database: { name: "PostgreSQL", orm: "Prisma" }
      deployment: { platform: "Vercel" }
      api: { style: "REST + OpenAPI" }
      auth: { provider: "NextAuth.js (credentials)" }
      billing: { provider: "Stripe" }
  
  - ux:
      direction: "Clean/modern (Tailwind defaults)"
      componentLibrary: "Custom with Radix UI"
```

### Structured Knowledge Saved

Files updated:
- `.skyhook/requirements/functional.yaml` - 8 requirements
- `.skyhook/requirements/non-functional.yaml` - 5 NFRs
- `.skyhook/tech-stack.yaml` - 12 technology choices
- `.skyhook/ux/styleguide.md` - Design tokens
- `.skyhook/decisions/index.yaml` - 3 decisions recorded

### Plan Generated

`.skyhook/plan/PROJECT_PLAN.md` created with:
- Vision & success metrics
- Requirements summary
- Architecture decisions
- Tech stack
- Backlog (4 epics, 12 stories)
- Timeline

---

## Example 2: Existing Project - Add Feature

### Context
Project already has `.skyhook/` with:
- Authentication implemented (NextAuth.js)
- PostgreSQL + Prisma
- Basic dashboard
- 3 epics in backlog

### User Request
> "Add a conversation analytics dashboard showing response times, satisfaction scores, and conversation volume."

### Agent Actions

```yaml
agentActions:
  1. loadProjectState:
      - Reads all .skyhook/ files
      - Identifies: auth done, database done, dashboard exists
  
  2. identifyGaps:
      - New feature: analytics dashboard
      - Needs: data model, aggregation queries, UI components, charts
  
  3. generateContextualQuestions:
      - Filters: only analytics/dashboard related
      - Asks:
        - "What metrics exactly? (response time, CSAT, volume, resolution rate)"
        - "Time ranges? (real-time, hourly, daily, custom)"
        - "Chart library preference? (Recharts, Chart.js, Tremor)"
        - "Export needed? (CSV, PDF, API)"
  
  4. userAnswers:
      > "Response time (p50, p95), CSAT score, daily volume, resolution rate. 
       Daily/weekly/monthly views. Recharts is fine. CSV export."
  
  5. interpretAndStore:
      - Adds 4 functional requirements
      - Adds 2 non-functional (performance, export)
      - Records decision: "Use Recharts for analytics charts"
      - Updates backlog: new epic "Analytics Dashboard" with 5 stories
  
  6. regeneratePlan:
      - Updates PROJECT_PLAN.md with new epic
      - Adjusts timeline
```

---

## Example 3: Requirement Change During Build

### Context
Mid-sprint, building "Conversation Assignment" feature.

### User Request
> "Actually, remove WhatsApp support from MVP. Focus on chat and email only."

### Agent Actions

```yaml
agentActions:
  1. findAffectedItems:
      - Requirements: "WhatsApp channel support" (status: in-progress)
      - Backlog: 3 stories related to WhatsApp
      - Decisions: "Twilio for WhatsApp integration" (status: accepted)
  
  2. handleChange:
      - Mark WhatsApp requirement: status = "rejected", supersededBy = "chat-email-only"
      - Update decision: status = "superseded", supersededBy = "chat-email-only-decision"
      - Move WhatsApp stories to "cancelled"
      - Create new decision: "Defer WhatsApp to Phase 2"
  
  3. updateTraceability:
      - Changelog: "Removed WhatsApp from MVP per stakeholder request"
      - Links: requirement → decision → stories
  
  4. regeneratePlan:
      - Updated PROJECT_PLAN.md
      - Removed WhatsApp from MVP scope
      - Added to Phase 2 backlog
      - Adjusted timeline (saved ~2 weeks)
  
  5. notify:
      - "Updated requirements and plan. WhatsApp moved to Phase 2.
       Current sprint can focus on chat/email assignment."
```

---

## Example 4: Agent Handoff

### Scenario
Original agent completed discovery and planning. New agent takes over for implementation.

### New Agent Onboarding

```yaml
handoffProtocol:
  1. readCoreFiles:
      - .skyhook/project.yaml
      - .skyhook/context.md
      - .skyhook/vision.md
      - .skyhook/requirements/*.yaml
      - .skyhook/decisions/index.yaml
      - .skyhook/tech-stack.yaml
      - .skyhook/ux/styleguide.md
      - .skyhook/plan/PROJECT_PLAN.md
      - .skyhook/changelog.md
  
  2. quickStart:
      - Current phase: BUILD (sprint 1)
      - Next priority: "User Authentication" epic (3 stories)
      - Key decisions: NextAuth.js, PostgreSQL, Vercel, Tailwind
      - Open questions: MFA strategy (deferred to Phase 2)
  
  3. verifyAlignment:
      - Run: skyhook sync
      - Check: code matches tech stack decisions
      - Check: no unimplemented accepted decisions
  
  4. beginWork:
      - Pick top story from backlog
      - Read related requirements
      - Check for decisions affecting this story
      - Implement following standards
```

---

## Example 5: Continuous Discovery During Build

### Scenario
Implementing "Conversation Routing" feature.

### Discovery

```yaml
discoveryEvent:
  trigger: "Implementing routing - need to understand priority rules"
  
  agentAction:
    - Checks .skyhook/requirements for routing rules
    - Finds: "Route to agent with fewest open conversations"
    - Realizes: What about agent skills/specialization?
    - Checks: No requirement for skill-based routing
  
  questionGenerated:
    - Category: "routing"
    - Priority: "high" (affects current implementation)
    - Question: "Should routing consider agent skills/specialization?"
    - Context: "Currently planning simple least-loaded routing. Skills would require skill matrix and matching logic."
    - Default: "No, simple least-loaded for MVP"
    - Options: "Simple least-loaded | Skill-based | Hybrid (skills + load)"
  
  userAnswer:
    > "Skills-based for Phase 2. Simple for now."
  
  interpretation:
    - Updates routing requirement: add "skill-based routing (Phase 2)"
    - Creates decision: "Defer skill-based routing to Phase 2"
    - Updates backlog: add Phase 2 epic "Advanced Routing"
    - Continues implementation with simple routing
```

---

## Integration Patterns for Different Agents

### Codex Agent

```markdown
# In .codex/instructions.md

## Skyhook Integration

When working on a project:
1. Check for `.skyhook/` directory
2. If exists, read all files in `.skyhook/` before starting
3. Follow the lifecycle in `.skyhook/skill/workflows/lifecycle.md`
4. Use `skyhook` CLI commands for common operations
5. Update `.skyhook/` as you make decisions and discoveries
```

### Claude Code

```markdown
# In CLAUDE.md

## Skyhook Project Intelligence

This project uses Skyhook for persistent project knowledge.

### On Startup
- Read all files in `.skyhook/`
- Review `PROJECT_PLAN.md` for current state
- Check `changelog.md` for recent changes

### During Work
- Before each task, check relevant `.skyhook/` files
- Record decisions in `.skyhook/decisions/`
- Update requirements when discovering new information
- Regenerate plan with `skyhook plan` after significant changes
```

### Gemini CLI

```bash
# In gemini prompt or .gemini/instructions
@skyhook "Read the project state from .skyhook/ and help me implement the next story from the backlog"
```

### Generic Agent (File-Based)

```yaml
# Agent reads these files on startup:
requiredReading:
  - ".skyhook/project.yaml"
  - ".skyhook/context.md"
  - ".skyhook/vision.md"
  - ".skyhook/requirements/functional.yaml"
  - ".skyhook/requirements/non-functional.yaml"
  - ".skyhook/decisions/index.yaml"
  - ".skyhook/tech-stack.yaml"
  - ".skyhook/ux/styleguide.md"
  - ".skyhook/plan/PROJECT_PLAN.md"
  - ".skyhook/changelog.md"

# Agent writes to these during work:
writeTargets:
  - ".skyhook/requirements/*.yaml"
  - ".skyhook/decisions/*.md"
  - ".skyhook/decisions/index.yaml"
  - ".skyhook/backlog/*.yaml"
  - ".skyhook/tech-stack.yaml"
  - ".skyhook/ux/*.yaml"
  - ".skyhook/changelog.md"
```

---

## Testing the Workflow

### Test Scenario: Complete Project Initialization

```bash
# 1. Create test project
mkdir test-project && cd test-project
git init

# 2. Initialize Skyhook
skyhook init

# 3. Verify structure
ls -la .skyhook/
# Should show all directories and files

# 4. Run discovery
skyhook discover

# 5. Answer questions interactively (or via script)
# 6. Generate plan
skyhook plan

# 7. Verify plan exists
cat .skyhook/plan/PROJECT_PLAN.md
```

### Test Scenario: Requirement Change

```bash
# 1. Have existing project with .skyhook/
# 2. Record a decision
skyhook decide "Use PostgreSQL with Prisma"

# 3. Verify decision recorded
cat .skyhook/decisions/index.yaml
ls .skyhook/decisions/*.md

# 4. Change requirement (simulate)
# Edit .skyhook/requirements/functional.yaml
# Change status of a requirement to "rejected"

# 5. Regenerate plan
skyhook plan

# 6. Verify plan updated
cat .skyhook/plan/PROJECT_PLAN.md
```
