# Skyhook Built-in Software Standards

## Purpose

Opinionated but overridable standards for code quality, architecture, and maintainability.
These are **defaults** — projects can override any standard in `.skyhook/standards/software.md`.

## Core Principles

1. **Explicit over implicit** — Code should be self-documenting
2. **Consistency over cleverness** — Predictable patterns beat micro-optimizations
3. **Types as documentation** — Type systems catch errors and communicate intent
4. **Testability by design** — Architecture should facilitate testing
5. **Incremental adoption** — Standards can be adopted piece by piece

---

## 1. Code Organization

### File Structure

```
src/
├── app/                    # Application entry points (pages, routes, CLI commands)
├── components/             # UI components (if frontend)
│   ├── ui/                # Primitive/reusable components
│   ├── features/          # Feature-specific components
│   └── layouts/           # Layout components
├── features/              # Feature modules (domain-driven)
│   └── [feature]/
│       ├── components/
│       ├── hooks/
│       ├── utils/
│       ├── types.ts
│       └── index.ts       # Public API
├── lib/                   # Shared utilities, configurations
│   ├── utils/
│   ├── constants/
│   ├── validations/
│   └── api/
├── hooks/                 # Shared React hooks (if React)
├── services/              # Business logic, external integrations
├── stores/                # State management
├── types/                 # Shared type definitions
├── styles/                # Global styles, theme
└── middleware/            # Request/response middleware
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `user-profile.tsx` |
| Components | PascalCase | `UserProfile.tsx` |
| Functions/Variables | camelCase | `getUserProfile()` |
| Types/Interfaces | PascalCase | `UserProfile` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |
| CSS Classes | kebab-case | `.user-profile-card` |
| Git Branches | `type/scope-description` | `feat/auth-add-oauth` |

### Module Boundaries

- **Public API**: Only export from `index.ts` files
- **Internal**: Prefix with underscore `_internal.ts` or keep in private folders
- **Circular deps**: Forbidden — use dependency inversion

---

## 2. TypeScript Standards

### Strict Mode Requirements

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Patterns

```typescript
// ✅ Good: Explicit, descriptive types
interface UserProfile {
  id: UserId;
  email: EmailAddress;
  displayName: string;
  avatarUrl?: URL;
  preferences: UserPreferences;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ❌ Bad: Any, implicit any, loose types
const user: any = getUser();
const data: object = fetchData();

// ✅ Good: Branded types for primitives
type UserId = string & { readonly __brand: unique symbol };
type EmailAddress = string & { readonly __brand: unique symbol };

// ✅ Good: Discriminated unions for state
type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating'; method: AuthMethod }
  | { status: 'authenticated'; user: User; session: Session }
  | { status: 'error'; error: AuthError };
```

### Generics & Constraints

```typescript
// ✅ Good: Constrained generics
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> { }

// ✅ Good: Default type parameters
interface Repository<TEntity extends Entity = Entity> {
  findById(id: TEntity['id']): Promise<TEntity | null>;
}
```

---

## 3. Architecture Patterns

### Layered Architecture (Default)

```
┌─────────────────────────────────────┐
│         Presentation Layer          │  (Components, Pages, Controllers)
├─────────────────────────────────────┤
│         Application Layer           │  (Use Cases, Services, Orchestration)
├─────────────────────────────────────┤
│           Domain Layer              │  (Entities, Value Objects, Domain Events)
├─────────────────────────────────────┤
│        Infrastructure Layer         │  (Repositories, External APIs, DB)
└─────────────────────────────────────┘
```

### Dependency Rule

> **Inner layers know nothing about outer layers.**
> Dependencies point inward.

```typescript
// ✅ Good: Domain defines interface, Infrastructure implements
// domain/repositories/user-repository.ts
interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
}

// infrastructure/repositories/prisma-user-repository.ts
class PrismaUserRepository implements UserRepository {
  constructor(private prisma: PrismaClient) {}
  async findById(id: UserId) { /* ... */ }
  async save(user: User) { /* ... */ }
}

// application/use-cases/get-user.ts
class GetUserUseCase {
  constructor(private userRepo: UserRepository) {}  // Depends on interface
  async execute(id: UserId) { return this.userRepo.findById(id); }
}
```

### Feature Modules

Each feature is a self-contained module:

```
features/
└── payments/
    ├── domain/
    │   ├── entities/
    │   ├── value-objects/
    │   ├── events/
    │   └── repositories/
    ├── application/
    │   ├── commands/
    │   ├── queries/
    │   └── dto/
    ├── infrastructure/
    │   ├── repositories/
    │   ├── stripe/
    │   └── webhooks/
    ├── presentation/
    │   ├── components/
    │   └── hooks/
    ├── types.ts
    └── index.ts
```

---

## 4. Error Handling

### Error Types

```typescript
// Base error class
abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;
  
  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = true;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Operational errors (expected, handleable)
class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  constructor(message: string, public readonly fields: Record<string, string>) {
    super(message, { fields });
  }
}

class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, { resource, id });
  }
}

// Programming errors (bugs, should crash)
class AssertionError extends AppError {
  readonly code = 'ASSERTION_ERROR';
  readonly statusCode = 500;
  readonly isOperational = false;
  constructor(message: string) { super(message); }
}
```

### Error Handling Pattern

```typescript
// Result type for explicit error handling
type Result<T, E = AppError> = 
  | { success: true; data: T }
  | { success: false; error: E };

async function getUser(id: UserId): Promise<Result<User, NotFoundError>> {
  const user = await userRepo.findById(id);
  if (!user) {
    return { success: false, error: new NotFoundError('User', id) };
  }
  return { success: true, data: user };
}

// Usage
const result = await getUser(userId);
if (!result.success) {
  if (result.error.code === 'NOT_FOUND') {
    return handleNotFound();
  }
  throw result.error; // Unexpected error
}
```

---

## 5. Async Patterns

### Parallel Execution

```typescript
// ✅ Good: Parallel when independent
const [users, posts, comments] = await Promise.all([
  userService.getUsers(),
  postService.getPosts(),
  commentService.getComments(),
]);

// ✅ Good: Controlled concurrency
import pLimit from 'p-limit';
const limit = pLimit(3);
const results = await Promise.all(
  items.map(item => limit(() => processItem(item)))
);
```

### Timeout & Retry

```typescript
async function withTimeout<T>(
  promise: Promise<T>, 
  ms: number, 
  error: Error = new TimeoutError()
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(error), ms))
  ]);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delay: number; backoff?: number } = { retries: 3, delay: 1000 }
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i <= options.retries; i++) {
    try { return await fn(); }
    catch (error) {
      lastError = error as Error;
      if (i < options.retries) {
        await new Promise(r => setTimeout(r, options.delay * Math.pow(options.backoff ?? 2, i)));
      }
    }
  }
  throw lastError!;
}
```

---

## 6. Testing Standards

### Test Organization

```
tests/
├── unit/              # Pure function, component tests
├── integration/       # Service, API, database tests
├── e2e/               # Full user flows
├── contracts/         # API contract tests
├── fixtures/          # Test data, mocks
└── utils/             # Test helpers
```

### Test Patterns

```typescript
// ✅ Good: Descriptive, behavior-focused
describe('UserService', () => {
  describe('getUser', () => {
    it('returns user when found', async () => {
      // Arrange
      const user = createTestUser({ id: '123' });
      mockRepo.findById.mockResolvedValue(user);
      
      // Act
      const result = await service.getUser('123');
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(user);
    });
    
    it('returns NotFoundError when user missing', async () => {
      mockRepo.findById.mockResolvedValue(null);
      
      const result = await service.getUser('missing');
      
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});

// ✅ Good: Test data builders
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}
```

### Coverage Targets

| Layer | Target |
|-------|--------|
| Domain (pure logic) | 95%+ |
| Application (use cases) | 90%+ |
| Infrastructure (repos, adapters) | 80%+ |
| Presentation (components) | 70%+ |
| Overall | 85%+ |

---

## 7. Git & Commits

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`

```bash
# ✅ Good
feat(auth): add Google OAuth provider

- Implement OAuth 2.0 flow with PKCE
- Add user linking for existing accounts
- Update auth config schema

Closes #123

# ❌ Bad
fix bug
update code
wip
```

### Branch Strategy

```
main                    # Production-ready
├── develop             # Integration branch (optional)
├── feat/*              # Features
├── fix/*               # Bug fixes
├── docs/*              # Documentation
├── refactor/*          # Refactoring
└── release/*           # Release preparation
```

### Pre-commit Hooks

```yaml
# .husky/pre-commit
- lint-staged
- typecheck
- test:changed
```

---

## 8. Documentation Standards

### Required Documentation

1. **README.md** — Setup, run, test, deploy
2. **ARCHITECTURE.md** — High-level architecture, decisions
3. **API.md** / **OpenAPI** — API documentation
4. **ADRs** — In `.skyhook/decisions/`
5. **Component Storybook** — For UI components

### Code Comments

```typescript
// ✅ Good: Why, not what
// We use a write-behind cache here because the analytics
// provider has strict rate limits (100 req/min) and we
// need to batch events to stay within quota.
class AnalyticsBuffer {
  // ...
}

// ❌ Bad: What (obvious from code)
class AnalyticsBuffer {
  // This class buffers analytics events
  // ...
}
```

---

## Override Mechanism

Create `.skyhook/standards/software.md` to override:

```markdown
# Project Software Standards Overrides

## Overrides

### File Structure
- Use `src/modules/` instead of `src/features/`

### TypeScript
- Disable `noUnusedParameters` for event handlers

### Architecture
- Allow presentation → infrastructure for simple CRUD

### Testing
- E2E target: 60% (resource constrained)
```

---

## Version

**Skyhook Software Standards v1.0.0**

*These standards evolve. Check `skyhook standards software` for latest.*
