# Skyhook Question Generation & Interpretation Engine

## Purpose

Intelligent, contextual question generation that asks only what's needed, when it's needed.
Natural language answer interpretation into structured project knowledge.

---

## Question Generation Architecture

### Core Principle

> **Never ask the user for information Skyhook can reasonably infer.**
> **Never silently invent information that materially affects the project.**

### Question Classification

```yaml
questionTypes:
  - id: "fact-seeking"
    description: "Specific information needed (database, auth provider, etc.)"
    examples: ["What database?", "Which auth provider?"]
    priority: "high"
  
  - id: "preference"
    description: "Subjective choices with no wrong answer"
    examples: ["Design direction?", "Component library?"]
    priority: "medium"
  
  - id: "constraint"
    description: "Hard limitations that affect feasibility"
    examples: ["Budget?", "Timeline?", "Team expertise?", "Compliance?"]
    priority: "critical"
  
  - id: "clarification"
    description: "Ambiguity in user's statements"
    examples: ["By 'real-time' do you mean websockets or polling?"]
    priority: "high"
  
  - id: "validation"
    description: "Confirm inferred information"
    examples: ["You mentioned users - should they have roles?"]
    priority: "medium"
  
  - id: "discovery"
    description: "Uncover unknown unknowns"
    examples: ["Have you considered webhook retry logic?"]
    priority: "low"
```

### Contextual Filtering Pipeline

```yaml
filterPipeline:
  1. profileRelevance:
      - Only questions applicable to project type
      - Web app → no mobile-specific questions
      - API service → no UI component questions
  
  2. phaseRelevance:
      - Init → identity, vision
      - Requirements → functional, non-functional
      - Tech stack → technology choices
      - Build → only blockers
  
  3. currentWorkRelevance:
      - If implementing auth → ask auth questions
      - If building dashboard → ask dashboard questions
      - Defer unrelated questions
  
  4. dependencyOrdering:
      - Database before ORM
      - Auth before protected routes
      - Deployment before CI/CD
  
  5. importanceScoring:
      - Blocks current work: +50
      - Affects architecture: +30
      - Affects UX: +20
      - Security implication: +25
      - Regulatory: +40
      - User explicitly asked: +35
      - Standard recommends: +15
      - Profile default exists: -10 (prefer default)
  
  6. deduplication:
      - Don't ask if already answered
      - Don't ask if inferable from context
      - Don't ask if default accepted
  
  7. batching:
      - Group related questions
      - Max 3 questions per interaction
      - One critical + up to two high/medium
```

---

## Question Templates by Domain

### Authentication

```yaml
authQuestions:
  - id: "auth-method"
    type: "fact-seeking"
    category: "authentication"
    priority: "critical"
    phase: "requirements"
    question: "How should users authenticate?"
    context: "Determines auth architecture, libraries, user flows, and security posture"
    default: "Email/password with NextAuth.js (credentials provider)"
    options:
      - "Email/password (credentials)"
      - "Social only (Google, GitHub, etc.)"
      - "Email + social"
      - "Magic links / passwordless"
      - "Third-party (Clerk, Auth0, Supabase)"
      - "Enterprise SSO (SAML, OIDC)"
    dependsOn: []
    tags: ["mvp", "security"]
    profileRelevance: ["web-app", "saas", "mobile-app", "desktop-app"]
  
  - id: "auth-mfa"
    type: "preference"
    category: "authentication"
    priority: "medium"
    phase: "requirements"
    question: "Do you need multi-factor authentication?"
    context: "Affects security posture and implementation complexity"
    default: "Not for MVP, add later if needed"
    options:
      - "Yes, TOTP (authenticator apps)"
      - "Yes, SMS"
      - "Yes, both"
      - "Not for MVP"
    dependsOn: ["auth-method"]
    tags: ["security", "phase-2"]
    profileRelevance: ["web-app", "saas", "api-service"]
  
  - id: "auth-session"
    type: "fact-seeking"
    category: "authentication"
    priority: "high"
    phase: "tech-stack"
    question: "Session management approach?"
    default: "JWT (15min) + HTTP-only refresh cookie (7 days)"
    options:
      - "JWT + refresh token"
      - "Server-side sessions (Redis)"
      - "NextAuth.js default"
      - "Supabase/Clerk managed"
    dependsOn: ["auth-method"]
    tags: ["architecture", "security"]
```

### Database

```yaml
databaseQuestions:
  - id: "database-type"
    type: "fact-seeking"
    category: "database"
    priority: "critical"
    phase: "requirements"
    question: "What database will you use?"
    context: "Affects schema design, migrations, hosting, costs, and team expertise"
    default: "PostgreSQL (via Prisma)"
    options:
      - "PostgreSQL"
      - "MySQL"
      - "SQLite (local/dev only)"
      - "MongoDB"
      - "PlanetScale / Neon / Supabase (managed Postgres)"
      - "DynamoDB"
    dependsOn: []
    tags: ["mvp", "architecture"]
    profileRelevance: ["web-app", "api-service", "saas", "mobile-app", "desktop-app"]
  
  - id: "orm-choice"
    type: "preference"
    category: "database"
    priority: "high"
    phase: "tech-stack"
    question: "ORM / query builder?"
    default: "Prisma (TypeScript) / SQLAlchemy (Python)"
    options:
      - "Prisma"
      - "Drizzle"
      - "Kysely"
      - "TypeORM"
      - "SQLAlchemy"
      - "Django ORM"
      - "Raw SQL / Query builder"
    dependsOn: ["database-type"]
    tags: ["architecture", "mvp"]
```

### Deployment

```yaml
deploymentQuestions:
  - id: "deployment-target"
    type: "fact-seeking"
    category: "deployment"
    priority: "high"
    phase: "requirements"
    question: "Where will this be deployed?"
    context: "Determines build config, environment variables, CI/CD, and costs"
    default: "Vercel (for Next.js) / Cloud Run (for containers)"
    options:
      - "Vercel"
      - "Netlify"
      - "AWS (Amplify, ECS, Lambda, EKS)"
      - "Google Cloud Run"
      - "Docker (any VPS/K8s)"
      - "Railway / Render / Fly.io"
      - "Self-hosted (VM, bare metal)"
    dependsOn: []
    tags: ["mvp", "operations"]
    profileRelevance: ["web-app", "api-service", "saas", "mobile-app", "desktop-app"]
  
  - id: "ci-cd"
    type: "preference"
    category: "deployment"
    priority: "medium"
    phase: "tech-stack"
    question: "CI/CD platform?"
    default: "GitHub Actions"
    options:
      - "GitHub Actions"
      - "GitLab CI"
      - "CircleCI"
      - "Buildkite"
      - "Jenkins"
    dependsOn: ["deployment-target"]
    tags: ["operations"]
```

### API Style

```yaml
apiQuestions:
  - id: "api-style"
    type: "fact-seeking"
    category: "api"
    priority: "high"
    phase: "requirements"
    question: "What API style for backend communication?"
    context: "Affects frontend data fetching, type safety, tooling, and team workflow"
    default: "tRPC (end-to-end type safety for React/Next.js)"
    options:
      - "tRPC (React/Next.js)"
      - "REST + OpenAPI + generated client"
      - "GraphQL (Apollo/Urql)"
      - "Server Actions (Next.js)"
      - "gRPC (internal services)"
    dependsOn: []
    tags: ["architecture", "mvp"]
    profileRelevance: ["web-app", "saas", "mobile-app"]
```

### UX / Design

```yaml
uxQuestions:
  - id: "design-direction"
    type: "preference"
    category: "ux"
    priority: "medium"
    phase: "ux-style"
    question: "What's the visual direction?"
    context: "Guides design system, component choices, and implementation approach"
    default: "Clean, modern, accessible (Tailwind defaults)"
    options:
      - "Clean/minimal (Apple/Linear style)"
      - "Bold/colorful (Stripe/Vercel style)"
      - "Technical/developer-focused (GitHub/Terminal style)"
      - "Futuristic/3D (Spline/Rive animations)"
      - "Enterprise/professional (Salesforce/Atlassian style)"
      - "Custom - I'll provide references"
    dependsOn: []
    tags: ["design", "phase-1"]
    profileRelevance: ["web-app", "saas", "marketing-site", "mobile-app", "desktop-app"]
  
  - id: "component-library"
    type: "preference"
    category: "ux"
    priority: "medium"
    phase: "tech-stack"
    question: "Component library approach?"
    context: "Affects development speed, consistency, bundle size, and customization"
    default: "Custom components with Radix UI primitives"
    options:
      - "Custom (Radix UI primitives)"
      - "shadcn/ui (copy-paste components)"
      - "MUI (Material UI)"
      - "Chakra UI"
      - "Headless UI + Tailwind"
      - "Radix UI + Tailwind"
    dependsOn: []
    tags: ["architecture", "mvp"]
  
  - id: "dark-mode"
    type: "preference"
    category: "ux"
    priority: "medium"
    phase: "ux-style"
    question: "Dark mode support?"
    default: "Yes (system preference + manual toggle)"
    options:
      - "Yes, system + manual"
      - "Yes, manual only"
      - "No, light only"
    dependsOn: []
    tags: ["design", "accessibility"]
```

### Billing (SaaS)

```yaml
billingQuestions:
  - id: "billing-model"
    type: "fact-seeking"
    category: "billing"
    priority: "critical"
    phase: "requirements"
    question: "What's the billing model?"
    context: "Determines Stripe/Paddle integration, database schema, and pricing page"
    default: "Tiered subscriptions (Free, Pro, Team, Enterprise)"
    options:
      - "Tiered subscriptions"
      - "Usage-based / metered"
      - "Per-seat"
      - "Hybrid (base + usage)"
      - "One-time purchases"
    dependsOn: []
    tags: ["mvp", "business"]
    profileRelevance: ["saas", "ecommerce"]
  
  - id: "payment-provider"
    type: "fact-seeking"
    category: "billing"
    priority: "critical"
    phase: "tech-stack"
    question: "Payment provider?"
    default: "Stripe"
    options:
      - "Stripe"
      - "Paddle"
      - "Lemon Squeezy"
      - "Chargebee"
      - "Braintree"
    dependsOn: ["billing-model"]
    tags: ["mvp", "architecture"]
```

### AI Agent Specific

```yaml
aiAgentQuestions:
  - id: "llm-provider"
    type: "fact-seeking"
    category: "llm"
    priority: "critical"
    phase: "requirements"
    question: "LLM provider(s)?"
    context: "Affects cost, latency, capabilities, and vendor lock-in"
    default: "OpenAI + Anthropic (with fallback routing)"
    options:
      - "OpenAI only"
      - "Anthropic only"
      - "OpenAI + Anthropic"
      - "Local models (Ollama, vLLM)"
      - "Azure OpenAI"
      - "AWS Bedrock"
      - "Multi-provider with routing"
    dependsOn: []
    tags: ["mvp", "architecture", "cost"]
    profileRelevance: ["ai-agent"]
  
  - id: "rag-needed"
    type: "fact-seeking"
    category: "rag"
    priority: "high"
    phase: "requirements"
    question: "Retrieval-augmented generation needed?"
    context: "Determines vector DB, embedding pipeline, and document processing"
    default: "Yes (documents, knowledge base)"
    options:
      - "Yes, documents"
      - "Yes, database"
      - "Yes, web search"
      - "No, pure LLM"
    dependsOn: []
    tags: ["mvp", "architecture"]
    profileRelevance: ["ai-agent"]
  
  - id: "eval-strategy"
    type: "fact-seeking"
    category: "quality"
    priority: "high"
    phase: "requirements"
    question: "Evaluation strategy for AI quality?"
    context: "Critical for production AI systems - prevents regression"
    default: "Automated evals (correctness, hallucination, tone)"
    options:
      - "Automated evals (LLM-as-judge)"
      - "Human evaluation"
      - "A/B testing"
      - "Golden dataset comparison"
      - "Production monitoring only"
    dependsOn: []
    tags: ["quality", "operations"]
    profileRelevance: ["ai-agent"]
```

---

## Answer Interpretation Engine

### Interpretation Pipeline

```yaml
interpretationPipeline:
  1. preprocess:
      - Normalize whitespace
      - Extract key entities (tech names, versions, URLs)
      - Detect language (if multilingual)
  
  2. classify:
      - Map to known options (fuzzy match, Levenshtein)
      - Detect "custom" / "other" responses
      - Identify multiple selections
      - Detect uncertainty ("not sure", "whatever you recommend")
  
  3. extract:
      - Entities: names, versions, URLs, numbers
      - Constraints: "must", "must not", "require", "avoid"
      - Preferences: "prefer", "like", "dislike", "want"
      - Conditions: "if", "when", "unless", "only if"
      - Scope: "for MVP", "later", "phase 2", "if budget allows"
  
  4. structure:
      - Create/update requirement objects
      - Create decision records
      - Update tech stack entries
      - Update UX specifications
      - Link to source question
  
  5. validate:
      - Schema compliance
      - Conflict detection with existing knowledge
      - Completeness check (required fields)
  
  6. persist:
      - Write to appropriate .skyhook/ files
      - Update traceability links
      - Append to changelog
      - Trigger dependent question generation
```

### Natural Language Patterns

```yaml
patterns:
  explicitChoice:
    examples:
      - "Use PostgreSQL"
      - "I want Tailwind"
      - "Deploy to Vercel"
    extraction: "Direct mapping to option"
    confidence: 0.95
  
  preference:
    examples:
      - "Prefer TypeScript over JavaScript"
      - "Don't use Redux"
      - "Avoid heavy animations"
    extraction: "Constraint/preference recording"
    confidence: 0.85
  
  conditional:
    examples:
      - "If we use React, then use Vite"
      - "Unless you recommend otherwise"
    extraction: "Conditional requirement"
    confidence: 0.75
  
  uncertainty:
    examples:
      - "Not sure, what do you recommend?"
      - "Whatever's standard"
      - "I don't know"
      - "You decide"
    extraction: "Apply default, mark as agent-recommended"
    confidence: 0.6
    action: "useDefault"
  
  compound:
    examples:
      - "PostgreSQL with Prisma, deployed to Railway"
      - "Email/password auth with magic links as backup"
    extraction: "Multiple decisions at once"
    confidence: 0.8
    action: "splitAndProcess"
  
  negation:
    examples:
      - "Not MongoDB"
      - "Anything but Redux"
      - "No dark mode"
    extraction: "Negative constraint"
    confidence: 0.9
  
  qualification:
    examples:
      - "PostgreSQL, but only if managed"
      - "React, but not Next.js"
    extraction: "Qualified choice with constraint"
    confidence: 0.8
```

### Conflict Detection

```yaml
conflictDetection:
  rules:
    - id: "mutually-exclusive-tech"
      check: "Two databases selected"
      action: "Flag conflict, ask for clarification"
    
    - id: "version-mismatch"
      check: "React 18 + incompatible library"
      action: "Warn, suggest compatible versions"
    
    - id: "requirement-violation"
      check: "Decision violates confirmed requirement"
      action: "Flag, require explicit override"
    
    - id: "standard-violation"
      check: "Decision violates strict standard"
      action: "Warn, document exception"
```

---

## Question Prioritization Algorithm

```python
def score_question(question, context):
    """
    Calculate priority score for a question based on context.
    Returns score 0-100.
    """
    score = 0
    
    # Base priority
    priority_weights = {
        'critical': 50,
        'high': 30,
        'medium': 15,
        'low': 5
    }
    score += priority_weights.get(question.priority, 0)
    
    # Context modifiers
    if question.id in context.blocking_current_work:
        score += 50
    
    if question.category in context.architecture_decisions_needed:
        score += 30
    
    if question.category in context.security_sensitive:
        score += 25
    
    if question.tags and 'mvp' in question.tags:
        score += 20
    
    if question.tags and 'regulatory' in question.tags:
        score += 40
    
    if question.id in context.user_explicitly_asked:
        score += 35
    
    # Default penalty (prefer defaults)
    if question.default and not context.user_wants_custom:
        score -= 10
    
    # Already answered penalty
    if question.id in context.answered_questions:
        score -= 100  # Effectively removes
    
    # Inferable penalty
    if question.id in context.inferable_from_context:
        score -= 50
    
    return max(0, score)


def select_questions(questions, context, max_questions=3):
    """
    Select top questions to ask.
    """
    scored = [(q, score_question(q, context)) for q in questions]
    scored.sort(key=lambda x: x[1], reverse=True)
    
    # Always include at least one critical if any
    critical = [q for q, s in scored if q.priority == 'critical' and s > 0]
    if critical and not any(q.priority == 'critical' for q, _ in scored[:max_questions]):
        # Replace lowest with critical
        scored = [critical[0]] + scored[:max_questions-1]
    
    return [q for q, s in scored[:max_questions] if s > 0]
```

---

## Integration with Agent Loop

```yaml
agentIntegration:
  onStartup:
    - Run full discovery
    - Score all profile questions
    - Ask top 3 critical questions
  
  onTaskStart:
    - Identify task category
    - Filter questions by category + phase
    - Score with current context
    - Ask if critical gap exists
  
  onBlocker:
    - Identify missing knowledge
    - Generate targeted question
    - High priority (blocks work)
    - Wait for answer
  
  onDiscovery:
    - New information found during implementation
    - Check if it answers pending questions
    - Check if it creates new questions
    - Update requirements/decisions
    - Regenerate plan if significant
  
  onUserInput:
    - Interpret answer
    - Store structured knowledge
    - Update question scores
    - Continue loop
```

---

## Example Interaction Flow

```
Agent: "I'll help you build this AI customer support platform. 
        First, let me understand the project better.

        [Runs discovery, detects web-app + saas profile]

        I can see this is a SaaS web application. 
        A few critical questions to get started:

        1. [CRITICAL] How should users authenticate?
           Context: Determines auth architecture and libraries
           Default: Email/password with NextAuth.js
           Options: Email/password | Social | Magic links | Third-party (Clerk/Auth0) | Enterprise SSO

        2. [CRITICAL] What's the billing model?
           Context: Determines Stripe integration and database schema
           Default: Tiered subscriptions (Free, Pro, Team, Enterprise)
           Options: Tiered | Usage-based | Per-seat | Hybrid

        3. [HIGH] Where will this be deployed?
           Default: Vercel
           Options: Vercel | Netlify | AWS | Cloud Run | Docker | Railway"

User: "Email/password for auth, tiered subscriptions for billing, deploy to Vercel"

Agent: [Interprets answers]
       ✓ Auth: Email/password (credentials provider) 
       ✓ Billing: Tiered subscriptions with Stripe
       ✓ Deployment: Vercel
       
       [Updates .skyhook/requirements/functional.yaml]
       [Updates .skyhook/tech-stack.yaml]
       [Generates follow-up questions for MFA, team structure...]
```
