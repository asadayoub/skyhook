# Skyhook Built-in Testing Standards

## Purpose

Testing strategy and standards for reliable, maintainable test suites.
These are **defaults** — override in `.skyhook/standards/testing.md`.

---

## 1. Testing Philosophy

### Principles

```yaml
principles:
  - "Test behavior, not implementation"
  - "Fast, reliable, isolated tests"
  - "Test pyramid: more unit, fewer integration, few e2e"
  - "Tests as documentation"
  - "Flaky tests are bugs"
  - "Coverage is a guide, not a goal"
```

### Test Pyramid Targets

```
        /\
       /  \     E2E: 10% (critical user journeys)
      /----\    
     /      \   Integration: 20% (service boundaries, APIs)
    /--------\ 
   /          \ Unit: 70% (pure logic, components, utilities)
  /------------\
```

---

## 2. Test Types & Responsibilities

### Unit Tests (70%)

```yaml
unit:
  scope:
    - Pure functions
    - React components (with React Testing Library)
    - Utility functions
    - Domain logic (entities, value objects, services)
    - Custom hooks
    - Validators, formatters, parsers
  
  characteristics:
    - No external dependencies (mock everything)
    - Run in < 10ms each
    - No network, disk, database
    - Deterministic
    - Parallel execution
  
  tools:
    - Vitest / Jest
    - React Testing Library
    - MSW for API mocking
  
  naming:
    - describe('FunctionName', () => { ... })
    - it('should [expected behavior] when [condition]', () => { ... })
  
  patterns:
    - Arrange-Act-Assert
    - Test data builders
    - Property-based testing for complex logic
```

### Integration Tests (20%)

```yaml
integration:
  scope:
    - API endpoints (full request/response)
    - Database repositories
    - External service adapters
    - Message queue consumers/producers
    - Authentication flows
    - File storage operations
  
  characteristics:
    - Real dependencies (testcontainers, test DB)
    - Isolated per test (transactions, cleanup)
    - Run in < 1s each
    - Test contracts, not implementations
  
  tools:
    - Vitest / Jest
    - Testcontainers (PostgreSQL, Redis, Kafka, etc.)
    - Supertest for HTTP
    - MSW for external APIs
  
  patterns:
    - Test repository contracts
    - Test API contracts (OpenAPI)
    - Test event handlers
```

### End-to-End Tests (10%)

```yaml
e2e:
  scope:
    - Critical user journeys (happy paths)
    - Cross-feature workflows
    - Payment flows
    - Authentication flows
    - Multi-step forms
  
  characteristics:
    - Real browser (Playwright)
    - Production-like environment
    - Run in < 60s each
    - Flaky test detection & quarantine
    - Visual regression optional
  
  tools:
    - Playwright (recommended)
    - Cypress (alternative)
  
  patterns:
    - Page Object Model
    - Test data seeding via API
    - Cleanup via API
    - Parallel with sharding
```

### Contract Tests

```yaml
contract:
  scope:
    - Consumer-driven contracts (Pact)
    - Provider verification
    - Schema validation (OpenAPI, GraphQL)
  
  when:
    - Microservices
    - External API dependencies
    - Mobile app backends
  
  tools:
    - Pact
    - Schemathesis (OpenAPI property testing)
```

---

## 3. Test Organization

### Directory Structure

```
tests/
├── unit/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   └── services/
│   ├── application/
│   │   ├── commands/
│   │   └── queries/
│   ├── presentation/
│   │   ├── components/
│   │   └── hooks/
│   └── lib/
│       ├── utils/
│       └── validations/
│
├── integration/
│   ├── api/
│   │   ├── auth.test.ts
│   │   ├── users.test.ts
│   │   └── ...
│   ├── repositories/
│   │   ├── user-repository.test.ts
│   │   └── ...
│   └── adapters/
│       ├── stripe.test.ts
│       └── ...
│
├── e2e/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── register.spec.ts
│   ├── checkout/
│   │   └── purchase.spec.ts
│   └── admin/
│       └── user-management.spec.ts
│
├── contracts/
│   ├── consumer/
│   └── provider/
│
├── fixtures/
│   ├── factories/
│   │   ├── user.factory.ts
│   │   └── ...
│   ├── builders/
│   └── data/
│
└── utils/
    ├── test-setup.ts
    ├── test-db.ts
    ├── test-server.ts
    └── custom-matchers.ts
```

---

## 4. Test Data Management

### Test Data Builders

```typescript
// ✅ Good: Fluent builder pattern
class UserBuilder {
  private data: Partial<User> = {
    id: ulid(),
    email: `test-${ulid()}@example.com`,
    name: 'Test User',
    role: 'user',
    createdAt: new Date(),
  };
  
  withId(id: string) { this.data.id = id; return this; }
  withEmail(email: string) { this.data.email = email; return this; }
  withRole(role: UserRole) { this.data.role = role; return this; }
  asAdmin() { return this.withRole('admin'); }
  build(): User { return this.data as User; }
}

// Usage
const adminUser = new UserBuilder().asAdmin().build();
const users = Array.from({ length: 10 }, () => new UserBuilder().build());
```

### Fixtures & Factories

```typescript
// Factory functions for common scenarios
export const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: ulid(),
  email: `test-${ulid()}@example.com`,
  name: 'Test User',
  role: 'user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

export const createTestUsers = (count: number, overrides: Partial<User> = {}): User[] =>
  Array.from({ length: count }, () => createTestUser(overrides));
```

### Database Seeding

```typescript
// Integration test helpers
export async function seedTestData(db: Database) {
  await db.transaction(async (tx) => {
    const user = await createTestUserInDb(tx, { email: 'admin@test.com' });
    await createTestOrganizationInDb(tx, { ownerId: user.id });
  });
}

export async function cleanTestData(db: Database) {
  // Use TRUNCATE CASCADE or DELETE in dependency order
  await db.execute(sql`TRUNCATE TABLE users, organizations RESTART IDENTITY CASCADE`);
}
```

---

## 5. Mocking Strategy

### What to Mock

```yaml
mock:
  always:
    - External HTTP APIs (Stripe, SendGrid, etc.)
    - Time (use fixed clock)
    - Random/UUID generation
    - File system (except snapshot tests)
    - Browser APIs (localStorage, fetch, etc.)
  
  never:
    - Your own code (test the real thing)
    - Database (use testcontainers)
    - Framework internals
```

### Mock Patterns

```typescript
// ✅ Good: MSW for API mocking (works in unit + integration + e2e)
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json();
    if (body.email === 'test@example.com') {
      return HttpResponse.json({ token: 'test-token', user: createTestUser() });
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),
];

// ✅ Good: vi.mock for modules
vi.mock('@/lib/stripe', () => ({
  stripe: {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test' }),
    },
  },
}));
```

---

## 6. Coverage Standards

### Targets by Layer

```yaml
coverage:
  unit:
    statements: 90%
    branches: 85%
    functions: 90%
    lines: 90%
  
  integration:
    statements: 80%
    branches: 75%
    functions: 80%
    lines: 80%
  
  overall:
    statements: 85%
    branches: 80%
    functions: 85%
    lines: 85%
  
  exclusions:
    - "*.d.ts"
    - "*.config.*"
    - "migrations/"
    - "tests/"
    - "stories/"
    - "main.tsx" (entry point)
```

### Coverage Enforcement

```yaml
enforcement:
  - Fail CI if coverage drops
  - Per-file thresholds for new code
  - Coverage comments on PRs
  - No "coverage theater" (tests that don't assert)
```

---

## 7. CI/CD Integration

### Pipeline Stages

```yaml
ci:
  # Fast feedback (< 5 min)
  fast:
    - lint
    - typecheck
    - unit tests
    - coverage check
  
  # Medium feedback (< 15 min)
  medium:
    - integration tests
    - contract tests
    - build
  
  # Slow feedback (< 30 min)
  slow:
    - e2e tests (parallel)
    - visual regression
    - performance benchmarks
```

### Test Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run --project=unit",
    "test:integration": "vitest run --project=integration",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:coverage": "vitest run --coverage",
    "test:ci": "npm run test:unit && npm run test:integration"
  }
}
```

---

## 8. Flaky Test Management

```yaml
flakyTests:
  detection:
    - Run tests 3x on failure before failing CI
    - Track flakiness rate per test
  
  quarantine:
    - Move flaky tests to quarantine suite
    - Fix within 1 sprint
    - Delete if not fixed in 2 sprints
  
  prevention:
    - No shared state between tests
    - Proper async waiting (no arbitrary waits)
    - Deterministic test data
    - Isolated test databases
```

---

## 9. Testing Patterns by Domain

### Domain Logic

```typescript
// Test invariants, not getters/setters
describe('Order', () => {
  it('cannot add items after confirmed', () => {
    const order = Order.create(items);
    order.confirm();
    
    expect(() => order.addItem(newItem)).toThrow('Order confirmed');
  });
  
  it('calculates total with discounts', () => {
    const order = Order.create([
      { productId: '1', quantity: 2, unitPrice: 10 },
      { productId: '2', quantity: 1, unitPrice: 25 },
    ]);
    order.applyDiscount(percentage(10));
    
    expect(order.total).toBe(40.50); // (20+25)*0.9
  });
});
```

### API Endpoints

```typescript
describe('POST /api/users', () => {
  it('creates user with valid data', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'new@test.com', name: 'New User' })
      .expect(201);
    
    expect(response.body).toMatchObject({
      email: 'new@test.com',
      name: 'New User',
      role: 'user',
    });
    expect(response.body.id).toBeDefined();
  });
  
  it('rejects duplicate email', async () => {
    await createTestUserInDb({ email: 'exists@test.com' });
    
    await request(app)
      .post('/api/users')
      .send({ email: 'exists@test.com', name: 'Another' })
      .expect(409);
  });
});
```

### React Components

```tsx
// Test user behavior, not implementation
describe('UserProfile', () => {
  it('displays user info and edit button for owner', () => {
    const user = createTestUser({ name: 'John', email: 'john@test.com' });
    render(<UserProfile user={user} currentUser={user} />);
    
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('john@test.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });
  
  it('shows read-only view for other users', () => {
    const user = createTestUser();
    const other = createTestUser({ id: 'other' });
    render(<UserProfile user={user} currentUser={other} />);
    
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});
```

---

## 10. Performance Testing

```yaml
performance:
  benchmarks:
    - Critical paths (auth, checkout, search)
    - Run on every PR (compare to baseline)
    - Alert on > 10% regression
  
  load:
    - Monthly load test (k6, Artillery)
    - Simulate realistic traffic patterns
    - Identify bottlenecks before production
  
  budgets:
    - API p95 < 200ms
    - Database query p95 < 50ms
    - Bundle size limits
    - Core Web Vitals
```

---

## Override Mechanism

Create `.skyhook/standards/testing.md`:

```markdown
# Project Testing Standards Overrides

## Overrides

### Coverage
- Unit: 80% (legacy codebase)
- E2E: 5 critical paths only

### Tools
- Use Jest instead of Vitest
- Use Cypress instead of Playwright

### Organization
- Tests co-located with source (`__tests__/`)
```

---

## Version

**Skyhook Testing Standards v1.0.0**
