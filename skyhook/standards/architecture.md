# Skyhook Built-in Architecture Standards

## Purpose

Architectural principles and patterns for maintainable, scalable systems.
These are **defaults** — override in `.skyhook/standards/architecture.md`.

---

## 1. Architectural Principles

### SOLID Applied

| Principle | Application |
|-----------|-------------|
| **S**ingle Responsibility | One reason to change per module/class |
| **O**pen/Closed | Extend via composition, not modification |
| **L**iskov Substitution | Subtypes behaviorally substitutable |
| **I**nterface Segregation | Small, focused interfaces |
| **D**ependency Inversion | Depend on abstractions, not concretions |

### Additional Principles

```yaml
principles:
  - "Explicit dependencies" — No hidden globals, service locators
  - "Bounded contexts" — Clear domain boundaries
  - "Conway's Law awareness" — Architecture matches team structure
  - "Evolutionary architecture" — Fitness functions over big design upfront
  - "Observability built-in" — Logs, metrics, traces from day one
  - "Security by default" — Secure configurations, not secure effort
```

---

## 2. System Architecture Patterns

### Modular Monolith (Default for Most Projects)

```
┌─────────────────────────────────────────────────┐
│                   Application                    │
├─────────────┬─────────────┬─────────────────────┤
│  Feature A  │  Feature B  │    Feature C        │
│  (Module)   │  (Module)   │    (Module)         │
├─────────────┴─────────────┴─────────────────────┤
│              Shared Kernel                       │
│  (Domain primitives, events, utilities)          │
├─────────────────────────────────────────────────┤
│            Infrastructure Layer                   │
│  (DB, HTTP, Auth, Queue, Cache, File Storage)    │
└─────────────────────────────────────────────────┘
```

**Module Rules**:
- Modules communicate via domain events or explicit interfaces
- No direct database access across modules
- Shared kernel = minimal, stable primitives only
- Each module independently testable

### Microservices (When Justified)

**Justification Required**:
- Independent deployability needed
- Team autonomy required
- Different scaling characteristics
- Polyglot requirements

**Standards**:
- API gateway for external access
- Async communication preferred (event-driven)
- Distributed tracing mandatory
- Contract testing between services
- Shared nothing (databases, caches)

---

## 3. Domain-Driven Design

### Tactical Patterns

```yaml
patterns:
  entities:
    - Identity-based equality
    - Encapsulate behavior, not just data
    - Protect invariants in methods
  
  valueObjects:
    - Immutable
    - Structural equality
    - Self-validating
    - No identity
  
  aggregates:
    - Consistency boundary
    - Single aggregate root
    - References by ID only
    - Enforce invariants on save
  
  domainEvents:
    - Immutable facts about past
    - Published after transaction commits
    - Handled asynchronously
  
  repositories:
    - Collection-like interface
    - Aggregate-only access
    - Specification pattern for queries
  
  factories:
    - Complex creation logic
    - Enforce invariants at creation
  
  services:
    - Stateless domain operations
    - Cross-aggregate coordination
    - Named from ubiquitous language
```

### Strategic Patterns

```yaml
strategic:
  boundedContexts:
    - Explicit context boundaries
    - Context maps documented
    - Anti-corruption layers for integration
  
  ubiquitousLanguage:
    - Code reflects business language
    - Glossary maintained
    - Refactor when language evolves
```

---

## 4. Data Architecture

### Database Principles

```yaml
database:
  - One database per bounded context (modular monolith)
  - Schema owned by module
  - Migrations versioned with code
  - No cross-module foreign keys
  - Read models for complex queries (CQRS light)
```

### Data Patterns

```yaml
patterns:
  cqrs:
    - Separate read/write models when beneficial
    - Event sourcing only for audit-critical domains
    - Projections for read models
  
  outbox:
    - Reliable event publishing
    - Transactional outbox table
    - Relay process publishes to message broker
  
  migrations:
    - Forward-only, reversible
    - One migration per logical change
    - Tested in CI
    - Zero-downtime patterns (expand/contract)
```

---

## 5. API Design

### REST Standards

```yaml
rest:
  versioning: "URL path (/api/v1/)"
  naming: "kebab-case plural nouns (/api/v1/user-profiles)"
  methods:
    GET: "Retrieve (idempotent, cacheable)"
    POST: "Create (non-idempotent)"
    PUT: "Replace (idempotent)"
    PATCH: "Partial update (idempotent)"
    DELETE: "Delete (idempotent)"
  
  statusCodes:
    200: "Success with body"
    201: "Created + Location header"
    204: "Success no body"
    400: "Validation error"
    401: "Unauthenticated"
    403: "Forbidden"
    404: "Not found"
    409: "Conflict"
    422: "Unprocessable (semantic error)"
    429: "Rate limited"
    500: "Server error"
    503: "Unavailable"
  
  pagination:
    - Cursor-based for large datasets
    - Page/size for small, stable sets
    - Max page size: 100
  
  filtering: "?filter[field]=value"
  sorting: "?sort=-createdAt,updatedAt"
  fieldSelection: "?fields=id,name,email"
  
  errors:
    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Human readable",
        "details": [{"field": "email", "issue": "invalid_format"}]
      }
    }
```

### GraphQL Standards

```yaml
graphql:
  - Schema-first development
  - Relay-style cursor pagination
  - DataLoader for N+1 prevention
  - Cost analysis for query depth
  - Directives for auth, rate limiting
  - Federation for microservices
```

### tRPC (When Using)

```yaml
trpc:
  - Procedure-based (query, mutation, subscription)
  - Input validation with Zod
  - Middleware for auth, logging, rate limiting
  - Batch links for performance
```

---

## 6. Event-Driven Architecture

### Event Standards

```yaml
events:
  naming: "pascalCase past tense (UserRegistered, OrderPlaced)"
  structure:
    {
      "eventId": "ulid",
      "eventType": "UserRegistered",
      "timestamp": "ISO8601",
      "version": 1,
      "payload": {},
      "metadata": {
        "correlationId": "ulid",
        "causationId": "ulid",
        "userId": "user-id"
      }
    }
  
  delivery: "At-least-once, idempotent consumers"
  ordering: "Per-aggregate (partition by aggregate ID)"
  schema: "Schema registry (Avro/Protobuf) or JSON Schema"
```

### Message Broker

```yaml
broker:
  - Kafka for high throughput, ordering, replay
  - Redis Streams for simpler needs
  - RabbitMQ for complex routing
  - NATS for lightweight, cloud-native
  - Never direct HTTP for async (use webhook pattern if needed)
```

---

## 7. Security Architecture

### Principles

```yaml
security:
  - Zero trust network
  - Principle of least privilege
  - Defense in depth
  - Fail secure
  - Audit everything
```

### Implementation

```yaml
implementation:
  authentication:
    - JWT with short expiry (15min) + refresh tokens
    - Rotate refresh tokens
    - Store refresh tokens hashed
    - MFA for sensitive operations
  
  authorization:
    - RBAC (roles) + ABAC (attributes)
    - Policy engine (OPA/Cedar) for complex rules
    - Resource-level permissions
  
  dataProtection:
    - Encryption at rest (AES-256)
    - Encryption in transit (TLS 1.3)
    - Field-level encryption for PII
    - Key rotation strategy
  
  secrets:
    - Never in code/config
    - Vault/Secrets Manager
    - Rotation automated
    - Scoped to environment
  
  apiSecurity:
    - Rate limiting per client
    - Input validation + sanitization
    - CORS restrictive
    - Security headers (CSP, HSTS, etc.)
```

---

## 8. Observability

### Three Pillars

```yaml
observability:
  logs:
    - Structured JSON
    - Levels: error, warn, info, debug
    - Correlation IDs propagated
    - No PII in logs
    - Sampling for high-volume
  
  metrics:
    - RED: Rate, Errors, Duration
    - USE: Utilization, Saturation, Errors
    - Business metrics (signups, revenue, etc.)
    - Histograms for latency (not averages)
    - Cardinality controlled
  
  traces:
    - W3C Trace Context
    - Span per operation
    - Attributes: service, operation, user, error
    - Sampling: head-based + tail-based
```

### Alerting

```yaml
alerting:
  - Alert on symptoms, not causes
  - SLO-based (error budget burn rate)
  - Runbook links in alerts
  - Tiered: page (critical), ticket (warning), log (info)
  - No alert fatigue
```

---

## 9. Deployment Architecture

### Environments

```yaml
environments:
  - local: "Developer machine (docker-compose)"
  - preview: "Per-PR ephemeral (Vercel, Netlify, K8s preview)"
  - staging: "Production-like, subset of data"
  - production: "Live"
  
  promotion: "local → preview → staging → production"
```

### Deployment Patterns

```yaml
patterns:
  - Blue-green for zero-downtime
  - Canary for risk reduction
  - Feature flags for gradual rollout
  - Rollback < 5 minutes
  - Database migrations: backward compatible first
```

---

## 10. Decision Records

Every significant architectural decision documented as ADR in `.skyhook/decisions/`.

```yaml
adrTemplate:
  - Title
  - Status (proposed/accepted/rejected/deprecated/superseded)
  - Context
  - Decision
  - Consequences (positive/negative/neutral)
  - Alternatives considered
  - Links to related ADRs
```

---

## Override Mechanism

Create `.skyhook/standards/architecture.md`:

```markdown
# Project Architecture Standards Overrides

## Overrides

### Pattern
- Use Clean Architecture instead of Modular Monolith
- Event sourcing for Order domain

### Data
- Single shared database (small team)
- Read replicas for reporting

### API
- GraphQL only (no REST)
- gRPC for service-to-service
```

---

## Version

**Skyhook Architecture Standards v1.0.0**
