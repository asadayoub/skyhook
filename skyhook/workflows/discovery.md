# Skyhook Discovery Workflow

## Purpose

Systematic project discovery that builds structured project knowledge incrementally,
asking only contextually relevant questions.

## Workflow Overview

```
┌─────────────────┐
│  Detect Skyhook │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check .skyhook/│──── No ────► Run Initialization
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│  Load State     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Inspect Repo   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Determine Type │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Load Profile   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Assess Knowledge│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Ask Questions  │◄─── Loop until sufficient
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Generate Plan  │
└─────────────────┘
```

## Step 1: Repository Inspection

### What to Inspect

```yaml
inspectionTargets:
  - package.json / pyproject.toml / Cargo.toml / go.mod / pom.xml
  - tsconfig.json / jsconfig.json
  - dockerfile / docker-compose.yml
  - .github/workflows / .gitlab-ci.yml / jenkinsfile
  - README.md / docs/
  - src/ / lib/ / app/ / pages/ / components/
  - tests/ / spec/ / __tests__/
  - .env.example / .env.local
  - tailwind.config.* / postcss.config.* / vite.config.*
  - next.config.* / nuxt.config.* / remix.config.*
  - prisma.schema / schema.sql / migrations/
  - openapi.yaml / swagger.json / graphql.schema
```

### Extraction Patterns

```yaml
extractionRules:
  language:
    - package.json: "dependencies + devDependencies keys"
    - pyproject.toml: "[tool.poetry.dependencies]"
    - Cargo.toml: "[dependencies]"
    - go.mod: "require statements"
  
  framework:
    - "react" in deps: "React"
    - "next" in deps: "Next.js"
    - "vue" in deps: "Vue"
    - "svelte" in deps: "Svelte"
    - "fastapi" in deps: "FastAPI"
    - "express" in deps: "Express"
    - "django" in deps: "Django"
    - "rails" in deps: "Rails"
    - "spring-boot" in deps: "Spring Boot"
  
  database:
    - "prisma" in deps: "PostgreSQL/MySQL/SQLite (via Prisma)"
    - "mongoose" in deps: "MongoDB"
    - "sqlalchemy" in deps: "PostgreSQL/MySQL/SQLite"
    - "drizzle-orm" in deps: "PostgreSQL/MySQL/SQLite"
    - "typeorm" in deps: "Multiple"
  
  styling:
    - "tailwindcss" in deps: "Tailwind CSS"
    - "styled-components" in deps: "Styled Components"
    - "@emotion" in deps: "Emotion"
    - "sass" in deps: "Sass/SCSS"
  
  testing:
    - "jest" in deps: "Jest"
    - "vitest" in deps: "Vitest"
    - "playwright" in deps: "Playwright"
    - "cypress" in deps: "Cypress"
    - "pytest" in deps: "pytest"
  
  deployment:
    - "vercel" in scripts: "Vercel"
    - "netlify" in scripts: "Netlify"
    - "docker" in files: "Docker"
    - "kubernetes" in files: "Kubernetes"
  
  auth:
    - "next-auth" in deps: "NextAuth.js"
    - "clerk" in deps: "Clerk"
    - "auth0" in deps: "Auth0"
    - "supabase" in deps: "Supabase Auth"
  
  api:
    - "graphql" in deps: "GraphQL"
    - "tRPC" in deps: "tRPC"
    - "openapi" in files: "REST (OpenAPI)"
```

## Step 2: Project Type Detection

### Detection Algorithm

```yaml
typeDetection:
  scoring:
    web-app:
      indicators:
        - hasPackageJson: 10
        - hasReactOrVueOrSvelte: 20
        - hasPagesOrAppRouter: 15
        - hasStyling: 10
        - hasAuth: 10
    
    api-service:
      indicators:
        - hasPackageJson: 10
        - hasExpressOrFastifyOrFastAPI: 20
        - hasDatabase: 15
        - hasOpenAPIOrGraphQL: 15
        - noFrontendDeps: 10
    
    cli-tool:
      indicators:
        - hasBinInPackageJson: 20
        - hasCommanderOrYargs: 15
        - noFrontendDeps: 15
        - simpleStructure: 10
    
    mobile-app:
      indicators:
        - hasReactNative: 25
        - hasExpo: 20
        - hasFlutter: 25
        - hasXcodeOrGradle: 15
    
    desktop-app:
      indicators:
        - hasElectron: 25
        - hasTauri: 25
        - hasWails: 20
    
    library:
      indicators:
        - hasMainOrModuleInPackageJson: 20
        - hasTypesPackage: 15
        - noAppEntryPoint: 15
        - hasBuildScript: 10
    
    marketing-site:
      indicators:
        - hasAstroOrNextOrGatsby: 20
        - hasContentCollections: 15
        - minimalBackend: 15
        - hasMDX: 10
    
    ecommerce:
      indicators:
        - hasStripeOrShopify: 20
        - hasCartOrCheckout: 15
        - hasProductsSchema: 15
        - hasPaymentIntegration: 15
    
    saas:
      indicators:
        - hasMultiTenancy: 20
        - hasBilling: 20
        - hasAuth: 15
        - hasTeamsOrOrganizations: 15
    
    ai-agent:
      indicators:
        - hasLangChainOrLlamaIndex: 20
        - hasOpenAIOrAnthropicSDK: 20
        - hasVectorDB: 15
        - hasPromptTemplates: 10
  
  threshold: 40
  maxTypes: 3
```

### Output

```yaml
detectionResult:
  primaryType: "web-app"
  confidence: 0.85
  alternatives:
    - type: "saas"
      confidence: 0.65
    - type: "ecommerce"
      confidence: 0.45
  profile: "react-node"  # or "python-fastapi", "go-gin", etc.
  detectedStack:
    language: "TypeScript"
    framework: "Next.js"
    styling: "Tailwind CSS"
    database: "PostgreSQL (Prisma)"
    auth: "NextAuth.js"
    deployment: "Vercel"
```

## Step 3: Knowledge Assessment

### Known Information Extraction

```yaml
knownExtraction:
  fromRepository:
    - techStack: "From package.json, configs"
    - existingPatterns: "From code structure"
    - conventions: "From linting, formatting configs"
  
  fromUserConversation:
    - explicitRequirements: "Direct statements"
    - constraints: "Mentioned limitations"
    - preferences: "Stated likes/dislikes"
  
  fromExistingSkyhook:
    - allPreviousState: "Full project memory"
```

### Unknown Identification

```yaml
unknownCategories:
  # Always relevant
  universal:
    - projectName
    - projectDescription
    - targetUsers
    - successMetrics
  
  # Type-specific
  web-app:
    - routingStrategy
    - stateManagement
    - componentLibrary
    - ssrVsSsg
    - apiLayer
  
  api-service:
    - apiStyle
    - authentication
    - rateLimiting
    - versioning
    - documentation
  
  # Feature-specific (only when relevant)
  authentication:
    - authProvider
    - socialLogins
    - mfa
    - sessionStrategy
    - passwordPolicy
  
  database:
    - databaseType
    - orm
    - migrationStrategy
    - seeding
  
  payments:
    - provider
    - subscriptionModel
    - currencies
    - webhooks
  
  # Standards-related
  standards:
    - codeStyle
    - testingStrategy
    - branchingModel
    - releaseProcess
```

### Importance Classification

```yaml
importanceScoring:
  factors:
    blocksCurrentWork: 50
    affectsArchitecture: 30
    affectsUX: 20
    affectsSecurity: 25
    affectsPerformance: 15
    regulatoryRequired: 40
    userExplicitlyAsked: 35
    standardRequires: 15
    profileRecommends: 10
  
  thresholds:
    critical: ">= 70"
    high: ">= 50"
    medium: ">= 30"
    low: ">= 10"
    defer: "< 10"
```

## Step 4: Contextual Question Generation

### Question Templates by Category

```yaml
questionTemplates:
  authentication:
    - id: "auth-provider"
      category: "authentication"
      priority: "critical"
      question: "How should users authenticate?"
      context: "Determines auth architecture, libraries, and user flows"
      default: "Email/password with NextAuth.js (credentials provider)"
      options:
        - "Email/password (credentials)"
        - "Social only (Google, GitHub, etc.)"
        - "Email + social"
        - "Magic links / passwordless"
        - "Third-party (Clerk, Auth0, Supabase)"
        - "Enterprise SSO (SAML, OIDC)"
      tags: ["mvp", "security"]
    
    - id: "auth-mfa"
      category: "authentication"
      priority: "medium"
      question: "Do you need multi-factor authentication?"
      context: "Affects security posture and implementation complexity"
      default: "Not for MVP, add later if needed"
      options:
        - "Yes, TOTP (authenticator apps)"
        - "Yes, SMS"
        - "Yes, both"
        - "Not for MVP"
      dependsOn: ["auth-provider"]
      tags: ["security", "phase-2"]
  
  database:
    - id: "database-type"
      category: "database"
      priority: "critical"
      question: "What database will you use?"
      context: "Affects schema design, migrations, hosting, and costs"
      default: "PostgreSQL (via Prisma)"
      options:
        - "PostgreSQL"
        - "MySQL"
        - "SQLite (local/dev only)"
        - "MongoDB"
        - "PlanetScale / Neon / Supabase (managed Postgres)"
        - "DynamoDB"
      tags: ["mvp", "architecture"]
  
  deployment:
    - id: "deployment-target"
      category: "deployment"
      priority: "high"
      question: "Where will this be deployed?"
      context: "Determines build config, environment variables, CI/CD"
      default: "Vercel (for Next.js)"
      options:
        - "Vercel"
        - "Netlify"
        - "AWS (Amplify, ECS, Lambda)"
        - "Google Cloud Run"
        - "Docker (any VPS/K8s)"
        - "Railway / Render / Fly.io"
      tags: ["mvp", "operations"]
  
  ux:
    - id: "design-direction"
      category: "ux"
      priority: "medium"
      question: "What's the visual direction?"
      context: "Guides design system, component choices, and implementation"
      default: "Clean, modern, accessible (Tailwind defaults)"
      options:
        - "Clean/minimal (Apple/Linear style)"
        - "Bold/colorful (Stripe/Vercel style)"
        - "Technical/developer-focused (GitHub/Terminal style)"
        - "Futuristic/3D (Spline/Rive animations)"
        - "Enterprise/professional (Salesforce/Atlassian style)"
        - "Custom - I'll provide references"
      tags: ["design", "phase-1"]
  
  api:
    - id: "api-style"
      category: "api"
      priority: "high"
      question: "What API style for backend communication?"
      context: "Affects frontend data fetching, type safety, and tooling"
      default: "tRPC (end-to-end type safety)"
      options:
        - "tRPC (React/Next.js)"
        - "REST + OpenAPI + generated client"
        - "GraphQL (Apollo/Urql)"
        - "Server Actions (Next.js)"
        - "gRPC"
      tags: ["architecture", "mvp"]
```

## Step 5: Answer Interpretation

### Interpretation Pipeline

```yaml
interpretationPipeline:
  1. normalize:
      - trim whitespace
      - lowercase for matching
      - extract key phrases
  
  2. classify:
      - map to known options (fuzzy match)
      - detect "custom" responses
      - identify multiple selections
  
  3. extract:
      - entities (names, versions, URLs)
      - constraints (must/must not)
      - preferences (like/dislike)
      - conditions (if/when)
  
  4. structure:
      - create requirement objects
      - create decision records
      - update tech stack
      - update UX specs
  
  5. validate:
      - schema compliance
      - conflict detection
      - completeness check
  
  6. persist:
      - write to .skyhook/ files
      - update traceability links
      - append to changelog
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
  
  preference:
    examples:
      - "Prefer TypeScript over JavaScript"
      - "Don't use Redux"
      - "Avoid heavy animations"
    extraction: "Constraint/preference recording"
  
  conditional:
    examples:
      - "If we use React, then use Vite"
      - "Unless you recommend otherwise"
    extraction: "Conditional requirement"
  
  uncertainty:
    examples:
      - "Not sure, what do you recommend?"
      - "Whatever's standard"
      - "I don't know"
    extraction: "Apply default, mark as agent-recommended"
  
  compound:
    examples:
      - "PostgreSQL with Prisma, deployed to Railway"
      - "Email/password auth with magic links as backup"
    extraction: "Multiple decisions at once"
```

## Step 6: Incremental Knowledge Building

### Knowledge State Tracking

```yaml
knowledgeState:
  phases:
    - name: "minimal"
      description: "Just enough to start scaffolding"
      required:
        - projectName
        - projectType
        - primaryLanguage
        - deploymentTarget
    
    - name: "mvp-ready"
      description: "Sufficient for MVP implementation"
      required:
        - all minimal
        - authStrategy
        - databaseChoice
        - apiStyle
        - coreFeatures (3-5)
    
    - name: "comprehensive"
      description: "Full specification"
      required:
        - all mvp-ready
        - all NFRs
        - complete UX spec
        - full backlog
        - all standards configured
  
  progression:
    - "Start with minimal"
    - "Add as needed during build"
    - "Never require comprehensive upfront"
```

## Integration with Agent Loop

```yaml
agentLoopIntegration:
  onStartup:
    - runDiscovery
    - ifMinimal: askCriticalQuestions
    - generateInitialPlan
  
  onTaskStart:
    - checkRequiredKnowledge
    - ifMissingCritical: askNow
    - ifMissingHigh: askIfTimePermits
  
  onBlocker:
    - identifyMissingInfo
    - generateTargetedQuestion
    - waitForAnswer
    - continue
  
  onDiscovery:
    - interpretFinding
    - updateRequirements
    - recordDecision
    - regenerateAffectedPlans
```
