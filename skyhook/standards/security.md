# Skyhook Built-in Security Standards

## Purpose

Security baseline based on OWASP Top 10, ASVS, and secure-by-default principles.
These are **defaults** — override in `.skyhook/standards/security.md`.

---

## 1. OWASP Top 10 Mitigations

### A01: Broken Access Control

```yaml
accessControl:
  - Deny by default
  - Role-based (RBAC) + attribute-based (ABAC)
  - Resource-level permissions
  - Centralized authorization checks
  - Test: automated access control tests in CI
  - No IDOR (direct object references without auth)
```

### A02: Cryptographic Failures

```yaml
cryptography:
  dataInTransit:
    - TLS 1.3 minimum
    - HSTS with preload
    - Certificate transparency monitoring
    - mTLS for service-to-service
  
  dataAtRest:
    - AES-256-GCM for application data
    - Envelope encryption for large data
    - Key management: Cloud KMS / HashiCorp Vault
    - Key rotation: 90 days max
  
  passwords:
    - Argon2id (memory-hard)
    - Minimum: 12 chars, no max
    - Breach check (HaveIBeenPwned API)
    - No composition rules (NIST 800-63B)
  
  secrets:
    - Never in code, config, logs, docker images
    - Vault / Secrets Manager
    - Short-lived dynamic credentials
    - Rotation automated
```

### A03: Injection

```yaml
injection:
  sql:
    - Parameterized queries only
    - ORM with safe defaults
    - No dynamic SQL construction
    - Stored procedures for complex ops
  
  nosql:
    - Parameterized/validated queries
    - Disable JavaScript execution
  
  command:
    - Never user input in shell commands
    - Use language-native libraries
    - If required: strict allowlist validation
  
  ldap:
    - Parameterized filters
    - Escape input
  
  xpath:
    - Parameterized queries
  
  orm:
    - Understand ORM injection risks
    - Validate all inputs to ORM
```

### A04: Insecure Design

```yaml
secureDesign:
  - Threat modeling for new features (STRIDE)
  - Security requirements in stories
  - Secure design patterns library
  - Abuse cases documented
  - Privacy by design (GDPR Art. 25)
```

### A05: Security Misconfiguration

```yaml
configuration:
  - Secure defaults in frameworks
  - Disable debug/test endpoints in prod
  - Remove default accounts/passwords
  - Minimal permissions (least privilege)
  - Security headers (see below)
  - Automated config scanning
  - Immutable infrastructure
```

### A06: Vulnerable Components

```yaml
dependencies:
  - SCA scanning (GitHub Dependabot, Snyk, Trivy)
  - Automated PRs for updates
  - Policy: critical vulns patched in 24h
  - High vulns patched in 7 days
  - Software Bill of Materials (SBOM)
  - Minimal base images (distroless, alpine)
```

### A07: Authentication Failures

```yaml
authentication:
  sessionManagement:
    - Secure, HttpOnly, SameSite=Strict cookies
    - Short session expiry (15-30 min)
    - Absolute timeout (8 hours)
    - Rotate session ID on privilege change
    - Invalidate on logout, password change
    - Concurrent session limits
  
  mfa:
    - TOTP (RFC 6238) preferred
    - WebAuthn / FIDO2 for high security
    - Recovery codes (offline)
    - Required for admin/sensitive
  
  passwordPolicy:
    - Min 12 chars, no max
    - Block common/breached passwords
    - No periodic rotation (NIST)
    - Rate limit attempts
  
  accountProtection:
    - Account lockout (soft, exponential backoff)
    - Breach notification
    - Secure password reset (time-limited tokens)
```

### A08: Software & Data Integrity

```yaml
integrity:
  ci-cd:
    - Signed commits (GPG/SSH)
    - Provenance (SLSA)
    - Reproducible builds
    - Artifact signing
  
  dependencies:
    - Lockfiles committed
    - Hash verification
    - Private registry with auth
  
  deployment:
    - Signed containers
    - Admission control (Kyverno, OPA)
    - Immutable tags
```

### A09: Logging & Monitoring Failures

```yaml
logging:
  - Structured JSON logs
  - No sensitive data (PII, tokens, passwords)
  - Correlation IDs
  - Security events logged:
    - Authentication (success/failure)
    - Authorization decisions
    - Admin actions
    - Data access (sensitive)
    - Configuration changes
  - Centralized logging (SIEM)
  - Retention: 1 year minimum
  - Alerting on anomalies
```

### A10: SSRF

```yaml
ssrf:
  - Deny by default for outbound requests
  - Allowlist destinations
  - No user-supplied URLs for server fetches
  - Metadata service blocked (169.254.169.254)
  - DNS rebinding protection
```

---

## 2. Security Headers

```yaml
headers:
  - Content-Security-Policy: "strict policy, nonce-based scripts"
  - Strict-Transport-Security: "max-age=31536000; includeSubDomains; preload"
  - X-Frame-Options: "DENY"
  - X-Content-Type-Options: "nosniff"
  - Referrer-Policy: "strict-origin-when-cross-origin"
  - Permissions-Policy: "minimal permissions"
  - Cross-Origin-Opener-Policy: "same-origin"
  - Cross-Origin-Resource-Policy: "same-origin"
  - Cross-Origin-Embedder-Policy: "require-corp"
```

---

## 3. Input Validation

```yaml
validation:
  - Validate on input, encode on output
  - Allowlist over blocklist
  - Validate at trust boundaries
  - Schema validation (Zod, Joi, Pydantic)
  - File uploads: type, size, content validation, virus scan
  - Deserialization: safe libraries, no native serialization
```

---

## 4. Output Encoding

```yaml
encoding:
  html: "Context-aware (attribute, text, javascript, css, url)"
  sql: "Parameterized queries (not encoding)"
  css: "CSS encoder"
  javascript: "JS encoder for template literals"
  url: "URL encoder"
  shell: "Never (use native APIs)"
```

---

## 5. API Security

```yaml
apiSecurity:
  - Rate limiting (token bucket, per-client)
  - Authentication on all endpoints (except public)
  - Authorization checks per endpoint
  - Input validation + sanitization
  - Output encoding
  - Versioning
  - Deprecation policy
  - API gateway for cross-cutting concerns
  - GraphQL: depth limiting, cost analysis, introspection disabled in prod
```

---

## 6. Client-Side Security

```yaml
clientSecurity:
  - CSP with nonces/hashes
  - Subresource Integrity (SRI) for CDN
  - No inline scripts/styles
  - Trusted Types API
  - Secure cookie flags
  - No sensitive data in localStorage
  - XSS protection via framework auto-escaping
  - Clickjacking prevention (frame-ancestors)
```

---

## 7. Infrastructure Security

```yaml
infrastructure:
  network:
    - Private subnets for compute
    - NAT gateway for egress
    - WAF for public endpoints
    - DDoS protection
    - VPC flow logs
  
  compute:
    - Minimal base images
    - Non-root containers
    - Read-only root filesystem
    - Drop capabilities
    - Resource limits
  
  secrets:
    - External secrets operator
    - No secrets in container images
    - Rotation via operator
  
  monitoring:
    - Falco for runtime security
    - Audit logs enabled
    - Vulnerability scanning in registry
```

---

## 8. Data Privacy

```yaml
privacy:
  - Data minimization
  - Purpose limitation
  - Storage limitation
  - Accuracy
  - Integrity & confidentiality
  - Accountability
  
  gdpr:
    - Lawful basis documented
    - DPIA for high-risk processing
    - Data subject rights automation
    - Breach notification (72h)
    - DPO contact
  
  pii:
    - Inventory of PII
    - Encryption at rest/in transit
    - Access logging
    - Retention schedules
    - Pseudonymization where possible
```

---

## 9. Incident Response

```yaml
incidentResponse:
  - Runbooks for common scenarios
  - Escalation contacts
  - Communication templates
  - Post-incident review (blameless)
  - Evidence preservation
  - Legal/regulatory notification procedures
```

---

## 10. Security Testing

```yaml
testing:
  sast:
    - In CI on every PR
    - Tools: CodeQL, Semgrep, SonarQube
    - Fail on high/critical
  
  dast:
    - Staging environment
    - Authenticated scans
    - Monthly
  
  sca:
    - Every build
    - Policy gates
  
  secrets:
    - Pre-commit (git-secrets, trufflehog)
    - CI scan
    - History scan
  
  container:
    - Base image scan
    - Runtime scan (Falco)
  
  penetration:
    - Annual third-party
    - After major changes
    - Scope: critical paths
```

---

## Override Mechanism

Create `.skyhook/standards/security.md`:

```markdown
# Project Security Standards Overrides

## Overrides

### Authentication
- Use organization's SSO (SAML/OIDC)
- Session timeout: 8 hours (internal tool)

### Data
- Field-level encryption for SSN, credit cards
- Data residency: EU only

### Compliance
- SOC 2 Type II required
- HIPAA BAA with vendors
```

---

## Version

**Skyhook Security Standards v1.0.0**

*References: OWASP Top 10 2021, ASVS 4.0.3, NIST 800-63B, GDPR*
